-- ============================================================================
-- 0227 · BCP-01: acabado fotográfico por catálogo (PR7b).
--
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--   (spec.md §5: DA29; DA30 y N4 sustituidas por la decisión de Fabricio del
--   22-10-2026; plan.md PR7b).
--
-- Qué añade:
--   · catalogs.photo_finish (NOT NULL DEFAULT false): el acabado fotográfico
--     se ACTIVA POR CATÁLOGO. Apagado en TODOS, también en los existentes;
--     nunca global.
--   · catalog_photo_prefs gana el tipo 'no_finish' («Sin acabado en esta
--     foto»), por foto y catálogo, con la misma tabla, claves y limpieza que
--     las exclusiones de E3 (0202). Se amplía su CHECK.
--   · catalog_set_photo_finish y catalog_photo_no_finish: funciones del dueño
--     (catalog_require_owner, que bloquea la fila del catálogo). Cada cambio
--     sube catalogs.version (lectura coherente); sin cambio, la devuelven.
--   · catalog_internal_snapshot (la de 0222) con DOS añadidos que SOLO
--     aparecen con el acabado activo: «fin»: true y, en las viviendas con
--     fotos «sin acabado», pp.n (sus claves). Activarlo cambia la huella de
--     los enlaces del catálogo y el vigilante refresca los lectores abiertos.
--     Con el acabado apagado la instantánea y la huella son IDÉNTICAS a las de
--     antes de 0227 (las filas no_finish ni se leen).
--   · El tono se aplica en el proxy de fotos /p (`&t=1`, una copia tratada
--     y cacheada): nada escribe en property_photos, properties ni el almacén.
--
-- Efecto al desplegar: NINGUNO visible. Ningún catálogo cambia, ninguna huella
-- cambia (todos quedan con photo_finish = false).
-- Permisos (E1): RLS como el resto, REVOKE a public/anon/authenticated y
-- EXECUTE solo a service_role. SECURITY INVOKER y search_path fijo.
-- Idempotente (IF NOT EXISTS, DROP/ADD CONSTRAINT, CREATE OR REPLACE). Una
-- sola transacción.
-- Reversión: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/rollback-0227.sql
-- ============================================================================

BEGIN;

-- ── Columna y tipo nuevo ────────────────────────────────────────────────────

ALTER TABLE catalogs ADD COLUMN IF NOT EXISTS photo_finish boolean NOT NULL DEFAULT false;

ALTER TABLE catalog_photo_prefs DROP CONSTRAINT IF EXISTS catalog_photo_prefs_kind_ok;
ALTER TABLE catalog_photo_prefs ADD CONSTRAINT catalog_photo_prefs_kind_ok
  CHECK (kind IN ('exclude', 'opening', 'no_finish'));

-- ── Funciones del dueño ─────────────────────────────────────────────────────

-- Activa o apaga el acabado del catálogo. Errores: 'forbidden', 'invalid_finish'.
CREATE OR REPLACE FUNCTION catalog_set_photo_finish(p_actor uuid, p_catalog uuid, p_on boolean)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF v_cat IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_on IS NULL THEN RAISE EXCEPTION 'invalid_finish'; END IF;
  IF v_cat.photo_finish = p_on THEN RETURN v_cat.version; END IF;
  UPDATE catalogs SET photo_finish = p_on, version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- «Sin acabado en esta foto» (o volver a tratarla). Como catalog_photo_exclude
-- (0202): la vivienda tiene que estar en la lista efectiva del catálogo y la
-- foto ser suya; dos filas con la MISMA URL son la misma foto; quitar la marca
-- de una foto que ya no existe limpia su ajuste. Errores: 'forbidden',
-- 'invalid_photo', 'photo_not_in_catalog'.
CREATE OR REPLACE FUNCTION catalog_photo_no_finish(p_actor uuid, p_catalog uuid, p_property uuid, p_photo uuid, p_no_finish boolean)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_url     text;
  v_n       integer;
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF v_cat IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_property IS NULL OR p_photo IS NULL OR p_no_finish IS NULL THEN RAISE EXCEPTION 'invalid_photo'; END IF;
  IF NOT p_property = ANY (catalog_effective_ids(p_catalog)) THEN RAISE EXCEPTION 'photo_not_in_catalog'; END IF;
  SELECT url INTO v_url FROM property_photos WHERE id = p_photo AND property_id = p_property;

  IF p_no_finish THEN
    IF v_url IS NULL THEN RAISE EXCEPTION 'invalid_photo'; END IF;
    -- Ya marcada (esta fila o un duplicado con su URL): sin cambio.
    IF EXISTS (SELECT 1 FROM catalog_photo_prefs pp
                 JOIN property_photos ph ON ph.id = pp.photo_id AND ph.property_id = pp.property_id
                WHERE pp.catalog_id = p_catalog AND pp.property_id = p_property AND pp.kind = 'no_finish' AND ph.url = v_url) THEN
      RETURN v_cat.version;
    END IF;
    INSERT INTO catalog_photo_prefs (catalog_id, property_id, photo_id, kind, created_by)
    VALUES (p_catalog, p_property, p_photo, 'no_finish', p_actor)
    ON CONFLICT DO NOTHING;
  ELSE
    IF v_url IS NULL THEN
      DELETE FROM catalog_photo_prefs
       WHERE catalog_id = p_catalog AND property_id = p_property AND photo_id = p_photo AND kind = 'no_finish';
    ELSE
      DELETE FROM catalog_photo_prefs
       WHERE catalog_id = p_catalog AND property_id = p_property AND kind = 'no_finish'
         AND photo_id IN (SELECT id FROM property_photos WHERE property_id = p_property AND url = v_url);
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN v_cat.version; END IF;
  END IF;

  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- ── Instantánea ─────────────────────────────────────────────────────────────

-- La de 0222 con «fin» y pp.n, solo con el acabado activo (ver cabecera).
CREATE OR REPLACE FUNCTION catalog_internal_snapshot(p_catalog uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'title',      c.title,
    'intro',      c.intro,
    'created_at', c.created_at,
    'status',     c.status,
    'owner_name', (SELECT pr.full_name FROM profiles pr WHERE pr.id = c.owner_id),
    'contact', jsonb_build_object(
      'name',  c.contact_name,
      'phone', c.contact_phone,
      'role',  c.contact_role
    ),
    'items', it.items
  ) || CASE WHEN c.cover_property_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('cover', jsonb_build_object(
    -- Clave pública de la vivienda elegida, solo si está en la lista.
    'key', (SELECT e->>'key' FROM jsonb_array_elements(it.items) e
             WHERE e->>'key' = coalesce(
               (SELECT ci.public_key FROM catalog_items ci WHERE ci.catalog_id = c.id AND ci.property_id = c.cover_property_id),
               left(md5(c.key_salt || c.cover_property_id::text), 16))
             LIMIT 1),
    -- Identificador opaco de la foto elegida (si sigue existiendo y es suya).
    'photo', (SELECT md5(ph.url) FROM property_photos ph
               WHERE ph.id = c.cover_photo_id AND ph.property_id = c.cover_property_id)
  )) END
  -- 0227: acabado fotográfico activo. Solo entonces (apagado, nada).
  || CASE WHEN c.photo_finish THEN jsonb_build_object('fin', true) ELSE '{}'::jsonb END
  FROM catalogs c
  CROSS JOIN LATERAL (
    SELECT coalesce(jsonb_agg(
             catalog_item_json(l.property_id, l.public_key)
             || coalesce(tx.j, '{}'::jsonb)
             || coalesce(st.j, '{}'::jsonb)
             || coalesce(phx.j, '{}'::jsonb)
             || coalesce(ttl.j, '{}'::jsonb)
             || coalesce(ar.j, '{}'::jsonb)
             || coalesce(atx.j, '{}'::jsonb)
             ORDER BY l.o1, l.o2), '[]'::jsonb) AS items
      FROM (
        SELECT s.property_id, s.public_key, s.ord AS o1, NULL::uuid AS o2
          FROM catalog_select(c.id, c.criteria) s
         WHERE c.mode = 'auto'
        UNION ALL
        SELECT ci.property_id, ci.public_key, ci.position::bigint, ci.id
          FROM catalog_items ci
          JOIN properties p ON p.id = ci.property_id
         WHERE c.mode <> 'auto'
           AND ci.catalog_id = c.id
           AND p.archived_at IS NULL
           AND p.status::text NOT IN ('sold', 'archived')
      ) l
      -- Texto del catálogo: solo si está publicado y su fuente no cambió.
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('text', jsonb_build_object('b', t.pub_body, 'l', t.pub_lead, 'h', to_jsonb(t.pub_highlights))) AS j
          FROM catalog_texts t
         WHERE t.catalog_id = c.id AND t.property_id = l.property_id
           AND (t.pub_body IS NOT NULL OR t.pub_lead IS NOT NULL)
           AND t.pub_source_hash = catalog_source_hash(l.property_id)
      ) tx ON true
      -- Historia aprobada (solo lectura; su vigencia se comprueba en TS).
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('story', jsonb_build_object(
                 'h',  v.source_hash,
                 'p',  CASE WHEN v.prelude_status = 'approved' THEN v.prelude END,
                 'ph', CASE WHEN v.prelude_status = 'approved' THEN v.prelude_headline END,
                 'b',  bl.blocks)) AS j
          FROM property_story_versions v
          CROSS JOIN LATERAL (
            SELECT jsonb_agg(jsonb_build_object('c', b.chapter, 't', b.copy) ORDER BY b.position, b.id) AS blocks
              FROM property_story_blocks b
             WHERE b.version_id = v.id AND b.status = 'approved' AND btrim(b.copy) <> ''
          ) bl
         WHERE v.property_id = l.property_id AND v.status = 'approved' AND bl.blocks IS NOT NULL
         LIMIT 1
      ) st ON true
      -- E3: ajustes de fotos de ESTE catálogo (solo de fotos que existen).
      -- 0227: «sin acabado» (n) SOLO con el acabado activo; apagado, las
      -- filas no_finish ni se leen y el objeto es exactamente el de 0222.
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('pp', jsonb_build_object(
                 'x', coalesce(jsonb_agg(catalog_photo_key(pp.photo_id) ORDER BY catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'exclude'), '[]'::jsonb),
                 'o', (array_agg(catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'opening'))[1])
               || CASE WHEN count(*) FILTER (WHERE pp.kind = 'no_finish') > 0
                       THEN jsonb_build_object('n', jsonb_agg(catalog_photo_key(pp.photo_id) ORDER BY catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'no_finish'))
                       ELSE '{}'::jsonb END) AS j
          FROM catalog_photo_prefs pp
          JOIN property_photos ph ON ph.id = pp.photo_id AND ph.property_id = pp.property_id
         WHERE pp.catalog_id = c.id AND pp.property_id = l.property_id
           AND (pp.kind IN ('exclude', 'opening') OR (c.photo_finish AND pp.kind = 'no_finish'))
        HAVING count(*) > 0
      ) phx ON true
      -- 0217: título propio publicado de ESTE catálogo (sin condición de
      -- vigencia: los cambios de la ficha no lo retiran).
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('title', t.pub_title) AS j
          FROM catalog_texts t
         WHERE t.catalog_id = c.id AND t.property_id = l.property_id AND t.pub_title IS NOT NULL
      ) ttl ON true
      -- 0220: zona CONFIRMADA por el dueño del catálogo, solo mientras los
      -- datos de ubicación de la ficha no hayan cambiado. Sin confirmación,
      -- nada (el lector usa la zona de la ficha, como antes). Con «sin zona
      -- verificada» (area_id nulo), nombre nulo: el lector dice «El barrio».
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('area', jsonb_build_object('name', a.name, 'level', a.level)) AS j
          FROM catalog_property_areas d
          LEFT JOIN catalog_areas a ON a.id = d.area_id
         WHERE d.owner_id = c.owner_id AND d.property_id = l.property_id
           AND d.input_sig = catalog_area_input_sig(l.property_id)
      ) ar ON true
      -- 0222: copia de la plantilla «Vivir en…» de ESTE catálogo, solo si su
      -- zona es la confirmada y vigente de la vivienda (o su distrito). Si la
      -- confirmación cambia o caduca, la copia no se ve (DA37) y se conserva.
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('at', ac.body) AS j
          FROM catalog_area_copies ac
          JOIN catalog_property_areas d
            ON d.owner_id = c.owner_id AND d.property_id = ac.property_id
           AND d.input_sig = catalog_area_input_sig(ac.property_id)
          JOIN catalog_areas a ON a.id = d.area_id
         WHERE ac.catalog_id = c.id AND ac.property_id = l.property_id
           AND (ac.area_id = a.id OR ac.area_id = a.district_id)
      ) atx ON true
    -- OFFSET 0: evita que el planificador calcule la lista dos veces (Y5).
    OFFSET 0
  ) it
  WHERE c.id = p_catalog
$$;

-- ── Permisos (E1) ───────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_set_photo_finish(uuid, uuid, boolean)                 FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_photo_no_finish(uuid, uuid, uuid, uuid, boolean)      FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)                               FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_set_photo_finish(uuid, uuid, boolean)              TO service_role;
GRANT EXECUTE ON FUNCTION catalog_photo_no_finish(uuid, uuid, uuid, uuid, boolean)   TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)                            TO service_role;

COMMIT;
