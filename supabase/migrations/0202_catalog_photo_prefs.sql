-- ============================================================================
-- 0202 · BCP-01 E3: fotos por catálogo (excluir y elegir la foto de apertura).
--
-- Expediente: docs/changes/2026-10-13-bcp-01-home-catalogo/qa-c2/plan-e3.md
-- (D-QA13: E3-1…E3-7; D-QA19: ejecución, N1(a), N2 y correcciones).
--
-- Qué añade:
--   · catalog_photo_prefs: ajustes de fotos de un catálogo por FOTO
--     (property_photos.id, sin clave foránea: un ajuste de una foto borrada o
--     reimportada se conserva para que la gestión avise, E3-5).
--       kind = 'exclude'  no se usa en este catálogo;
--       kind = 'opening'  foto de apertura elegida (una por vivienda).
--     Dos filas con la MISMA URL son la misma foto (como el proxy y el lector).
--   · catalog_photo_exclude / catalog_photo_opening (guarda de dueño, vivienda
--     en la lista efectiva, foto suya):
--       E3-1 nunca deja la vivienda sin ninguna foto en uso ('last_photo'). La
--            guarda de dueño bloquea la fila del catálogo (FOR UPDATE), así que
--            los ajustes de un catálogo van uno detrás de otro y el recuento
--            es seguro también con peticiones simultáneas;
--       E3-2 no se elige de apertura una foto excluida ('photo_excluded');
--       excluir la apertura elegida la devuelve a la automática (D-QA19);
--       volver a usar una foto que ya no existe borra su ajuste (limpieza).
--     Cada cambio sube catalogs.version; sin cambio, devuelve la versión.
--   · catalog_photo_key: clave opaca y estable de cada foto (N1), la misma que
--     usa el proxy /p (?f=). Nunca salen el id ni la URL.
--   · catalog_item_json: cada foto lleva 'f' (su clave). N2: la huella de
--     todos los catálogos cambia una vez.
--   · catalog_internal_snapshot: 'pp' {x: claves excluidas, o: clave de la
--     apertura} en las viviendas con ajustes de fotos que existen.
--   · Nada escribe en property_photos, properties ni ninguna caché.
--
-- Permisos (E1): RLS sin políticas, REVOKE a public/anon/authenticated y
-- EXECUTE/GRANT solo a service_role. SECURITY INVOKER y search_path fijo.
-- Idempotente (IF NOT EXISTS, CREATE OR REPLACE). Una sola transacción.
-- Reversión: docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0202.sql
-- ============================================================================

BEGIN;

-- ── Ajustes de fotos ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog_photo_prefs (
  catalog_id  uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  property_id uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  photo_id    uuid        NOT NULL,
  kind        text        NOT NULL,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_id, photo_id, kind),
  CONSTRAINT catalog_photo_prefs_kind_ok CHECK (kind IN ('exclude', 'opening'))
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_photo_prefs_one_opening ON catalog_photo_prefs (catalog_id, property_id) WHERE kind = 'opening';
CREATE INDEX IF NOT EXISTS idx_catalog_photo_prefs_property ON catalog_photo_prefs (catalog_id, property_id);
ALTER TABLE catalog_photo_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_photo_prefs FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_photo_prefs TO service_role;

-- Clave opaca y estable de una foto (N1): la misma en la instantánea, en el
-- proxy /p (?f=) y en la gestión. No permite deducir el id ni la URL.
CREATE OR REPLACE FUNCTION catalog_photo_key(p_photo uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT left(md5('catalog-photo:' || p_photo::text), 16)
$$;

-- URLs de las fotos excluidas de una vivienda en un catálogo (fotos que existen).
CREATE OR REPLACE FUNCTION catalog_photo_excluded_urls(p_catalog uuid, p_property uuid)
RETURNS SETOF text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ph.url
    FROM catalog_photo_prefs pp
    JOIN property_photos ph ON ph.id = pp.photo_id AND ph.property_id = pp.property_id
   WHERE pp.catalog_id = p_catalog AND pp.property_id = p_property AND pp.kind = 'exclude'
$$;

CREATE OR REPLACE FUNCTION catalog_photo_exclude(p_actor uuid, p_catalog uuid, p_property uuid, p_photo uuid, p_exclude boolean)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_url     text;
  v_left    integer;
  v_n       integer;
  v_version bigint;
BEGIN
  -- Bloquea la fila del catálogo: los ajustes de fotos de un catálogo se
  -- serializan aquí, así que el recuento de E3-1 es seguro con concurrencia.
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF p_property IS NULL OR p_photo IS NULL OR p_exclude IS NULL THEN RAISE EXCEPTION 'invalid_photo'; END IF;
  IF NOT p_property = ANY (catalog_effective_ids(p_catalog)) THEN RAISE EXCEPTION 'photo_not_in_catalog'; END IF;
  SELECT url INTO v_url FROM property_photos WHERE id = p_photo AND property_id = p_property;

  IF NOT p_exclude THEN
    IF v_url IS NULL THEN
      -- La foto ya no existe (borrada o reimportada): se limpia su ajuste.
      DELETE FROM catalog_photo_prefs
       WHERE catalog_id = p_catalog AND property_id = p_property AND photo_id = p_photo AND kind = 'exclude';
    ELSE
      -- Volver a usarla: también sus duplicados por URL.
      DELETE FROM catalog_photo_prefs
       WHERE catalog_id = p_catalog AND property_id = p_property AND kind = 'exclude'
         AND photo_id IN (SELECT id FROM property_photos WHERE property_id = p_property AND url = v_url);
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN v_cat.version; END IF;
  ELSE
    IF v_url IS NULL THEN RAISE EXCEPTION 'invalid_photo'; END IF;
    IF v_url IN (SELECT catalog_photo_excluded_urls(p_catalog, p_property)) THEN RETURN v_cat.version; END IF;
    -- E3-1: tiene que quedar al menos otra foto en uso.
    SELECT count(DISTINCT ph.url) INTO v_left
      FROM property_photos ph
     WHERE ph.property_id = p_property
       AND ph.url <> v_url
       AND ph.url NOT IN (SELECT catalog_photo_excluded_urls(p_catalog, p_property));
    IF v_left < 1 THEN RAISE EXCEPTION 'last_photo'; END IF;
    INSERT INTO catalog_photo_prefs (catalog_id, property_id, photo_id, kind, created_by)
    VALUES (p_catalog, p_property, p_photo, 'exclude', p_actor)
    ON CONFLICT DO NOTHING;
    -- Excluir la apertura elegida la devuelve a la automática (D-QA19).
    DELETE FROM catalog_photo_prefs
     WHERE catalog_id = p_catalog AND property_id = p_property AND kind = 'opening'
       AND photo_id IN (SELECT id FROM property_photos WHERE property_id = p_property AND url = v_url);
  END IF;

  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

CREATE OR REPLACE FUNCTION catalog_photo_opening(p_actor uuid, p_catalog uuid, p_property uuid, p_photo uuid)
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
  IF p_property IS NULL THEN RAISE EXCEPTION 'invalid_photo'; END IF;
  IF NOT p_property = ANY (catalog_effective_ids(p_catalog)) THEN RAISE EXCEPTION 'photo_not_in_catalog'; END IF;
  IF p_photo IS NULL THEN
    -- Volver a la apertura automática.
    DELETE FROM catalog_photo_prefs WHERE catalog_id = p_catalog AND property_id = p_property AND kind = 'opening';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN v_cat.version; END IF;
  ELSE
    SELECT url INTO v_url FROM property_photos WHERE id = p_photo AND property_id = p_property;
    IF v_url IS NULL THEN RAISE EXCEPTION 'invalid_photo'; END IF;
    -- E3-2: una excluida hay que volver a usarla antes.
    IF v_url IN (SELECT catalog_photo_excluded_urls(p_catalog, p_property)) THEN RAISE EXCEPTION 'photo_excluded'; END IF;
    IF EXISTS (SELECT 1 FROM catalog_photo_prefs
                WHERE catalog_id = p_catalog AND property_id = p_property AND kind = 'opening' AND photo_id = p_photo) THEN
      RETURN v_cat.version;
    END IF;
    DELETE FROM catalog_photo_prefs WHERE catalog_id = p_catalog AND property_id = p_property AND kind = 'opening';
    INSERT INTO catalog_photo_prefs (catalog_id, property_id, photo_id, kind, created_by)
    VALUES (p_catalog, p_property, p_photo, 'opening', p_actor);
  END IF;
  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- ── Instantánea ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION catalog_item_json(p_property uuid, p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'key',            p_key,
    'slug',           p.slug,
    'title',          p.title,
    'zone',           p.zone,
    'subzone',        p.subzone,
    'operation',      p.operation,
    'operations',     p.operations,
    'price',          p.price,
    'rent_price',     p.rent_price,
    'currency',       p.currency,
    'status',         p.status,
    'bedrooms',       p.bedrooms,
    'bathrooms',      p.bathrooms,
    'square_meters',  p.square_meters,
    'description',    p.description,
    'features',       p.features,
    'features_manual', p.features_manual,
    'floor_override', p.floor_override,
    'clean', (
      SELECT jsonb_build_object('src', d.src, 'description', d.description, 'features', d.features)
        FROM property_client_descriptions d
       WHERE d.property_id = p.id AND d.language = 'es'
    ),
    'photos', coalesce((
      -- 0202 (E3): 'f' = clave opaca y estable de la foto (catalog_photo_key:
      -- sobrevive a reordenar y realojar; el proxy /p sirve por ella). Nunca el
      -- id ni la URL. 0197: la clase de la foto (para elegir la foto de cada sección) solo
      -- se añade si se conoce: la corregida a mano manda; la de la IA, solo
      -- con confianza ≥ 0,75 (la misma regla que el renderer de SmartLink).
      SELECT jsonb_agg(jsonb_build_object(
               'u', md5(ph.url), 'f', catalog_photo_key(ph.id), 'w', ph.source_width, 'h', ph.source_height, 'c', ph.is_cover)
             || CASE WHEN coalesce(ph.class_override, CASE WHEN coalesce(ph.ai_confidence, 0) >= 0.75 THEN ph.ai_class END) IS NULL
                     THEN '{}'::jsonb
                     ELSE jsonb_build_object('k', coalesce(ph.class_override, CASE WHEN coalesce(ph.ai_confidence, 0) >= 0.75 THEN ph.ai_class END)) END
             ORDER BY ph.position, ph.id)
        FROM property_photos ph
       WHERE ph.property_id = p.id
    ), '[]'::jsonb)
  )
  FROM properties p
  WHERE p.id = p_property
$$;

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
  FROM catalogs c
  CROSS JOIN LATERAL (
    -- La lista efectiva (automática o manual) y, en la MISMA consulta, el
    -- texto publicado vigente de este catálogo y la historia aprobada de cada
    -- vivienda. Una función por vivienda costaba ~30 % más (medido en Z7).
    SELECT coalesce(jsonb_agg(
             catalog_item_json(l.property_id, l.public_key)
             || coalesce(tx.j, '{}'::jsonb)
             || coalesce(st.j, '{}'::jsonb)
             || coalesce(phx.j, '{}'::jsonb)
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
      -- Historia aprobada (solo lectura; su vigencia se comprueba en TS con
      -- la huella del motor). Bloques aprobados con texto, en su orden.
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
      -- E3: ajustes de fotos de ESTE catálogo, solo si los hay y solo de fotos
      -- que existen (los que ya no aplican no llegan al lector; la gestión los
      -- lee de la tabla). x = excluidas, o = apertura elegida, por clave opaca.
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('pp', jsonb_build_object(
                 'x', coalesce(jsonb_agg(catalog_photo_key(pp.photo_id) ORDER BY catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'exclude'), '[]'::jsonb),
                 'o', (array_agg(catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'opening'))[1])) AS j
          FROM catalog_photo_prefs pp
          JOIN property_photos ph ON ph.id = pp.photo_id AND ph.property_id = pp.property_id
         WHERE pp.catalog_id = c.id AND pp.property_id = l.property_id
        HAVING count(*) > 0
      ) phx ON true
    -- OFFSET 0: sin esto el planificador «aplana» la subconsulta y copia la
    -- expresión en cada uso de it.items, así que con portada elegida la lista
    -- se calculaba DOS veces (medido en Y5: el doble de tiempo).
    OFFSET 0
  ) it
  WHERE c.id = p_catalog
$$;

-- ── Permisos (E1) ───────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_photo_key(uuid)                                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_photo_excluded_urls(uuid, uuid)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_photo_exclude(uuid, uuid, uuid, uuid, boolean)           FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_photo_opening(uuid, uuid, uuid, uuid)                    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_item_json(uuid, text)                                    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)                                  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION catalog_photo_key(uuid)                                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_photo_excluded_urls(uuid, uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_photo_exclude(uuid, uuid, uuid, uuid, boolean)        TO service_role;
GRANT EXECUTE ON FUNCTION catalog_photo_opening(uuid, uuid, uuid, uuid)                 TO service_role;
GRANT EXECUTE ON FUNCTION catalog_item_json(uuid, text)                                 TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)                               TO service_role;

COMMIT;
