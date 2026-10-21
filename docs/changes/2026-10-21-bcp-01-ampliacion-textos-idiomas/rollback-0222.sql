-- ============================================================================
-- Reversión de 0222 (plantillas «Vivir en…» y copias de los catálogos).
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--
-- Efecto: la instantánea vuelve a la de 0220 (sin «at»), catalog_add_property
-- a la de 0219, y se borran las funciones y las tablas catalog_area_copies y
-- area_text_versions.
-- SE PIERDEN LAS PLANTILLAS Y LAS COPIAS DE LOS CATÁLOGOS: si hay que
-- conservarlas, copiar antes
--   SELECT * FROM area_text_versions;  SELECT * FROM catalog_area_copies;
-- Los catálogos con plantilla aplicada cambian de huella y dejan de mostrarla.
-- ============================================================================
BEGIN;

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
    SELECT coalesce(jsonb_agg(
             catalog_item_json(l.property_id, l.public_key)
             || coalesce(tx.j, '{}'::jsonb)
             || coalesce(st.j, '{}'::jsonb)
             || coalesce(phx.j, '{}'::jsonb)
             || coalesce(ttl.j, '{}'::jsonb)
             || coalesce(ar.j, '{}'::jsonb)
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
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('pp', jsonb_build_object(
                 'x', coalesce(jsonb_agg(catalog_photo_key(pp.photo_id) ORDER BY catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'exclude'), '[]'::jsonb),
                 'o', (array_agg(catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'opening'))[1])) AS j
          FROM catalog_photo_prefs pp
          JOIN property_photos ph ON ph.id = pp.photo_id AND ph.property_id = pp.property_id
         WHERE pp.catalog_id = c.id AND pp.property_id = l.property_id
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
    -- OFFSET 0: evita que el planificador calcule la lista dos veces (Y5).
    OFFSET 0
  ) it
  WHERE c.id = p_catalog
$$;

CREATE OR REPLACE FUNCTION catalog_add_property(p_actor uuid, p_catalog uuid, p_property uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_status  text;
  v_country text;
  v_arch    timestamptz;
  v_version bigint;
  v_copy    property_copy_versions;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF v_cat.mode = 'auto' THEN
    RAISE EXCEPTION 'catalog_auto';
  END IF;
  IF v_cat.status <> 'active' THEN
    RAISE EXCEPTION 'catalog_archived';
  END IF;
  SELECT status::text, country, archived_at INTO v_status, v_country, v_arch
    FROM properties WHERE id = p_property;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;
  IF v_arch IS NOT NULL OR v_status IN ('sold', 'archived') THEN
    RAISE EXCEPTION 'property_not_available';
  END IF;
  IF v_country IS DISTINCT FROM 'es' THEN
    RAISE EXCEPTION 'property_not_es';
  END IF;
  IF EXISTS (SELECT 1 FROM catalog_items WHERE catalog_id = p_catalog AND property_id = p_property) THEN
    RAISE EXCEPTION 'already_in_catalog';
  END IF;
  -- El bloqueo de catalog_require_owner serializa dos altas simultáneas.
  IF (SELECT count(*) FROM catalog_items ci JOIN properties p ON p.id = ci.property_id
       WHERE ci.catalog_id = p_catalog AND p.archived_at IS NULL
         AND p.status::text IN ('available', 'reserved')) >= 24 THEN
    RAISE EXCEPTION 'catalog_full';
  END IF;
  INSERT INTO catalog_items (catalog_id, property_id, position)
  SELECT p_catalog, p_property, coalesce(max(position), 0) + 100
    FROM catalog_items WHERE catalog_id = p_catalog;

  -- 0219 · Reutilización: solo una entrada SIN ningún texto en este catálogo
  -- (ni borrador, ni publicado, ni en reserva) recibe la última versión
  -- aprobada del dueño, como texto publicado e independiente.
  IF NOT EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = p_catalog AND property_id = p_property) THEN
    SELECT * INTO v_copy FROM property_copy_versions
     WHERE owner_id = v_cat.owner_id AND property_id = p_property ORDER BY seq DESC LIMIT 1;
    IF FOUND AND (v_copy.title IS NOT NULL OR v_copy.body IS NOT NULL OR v_copy.lead IS NOT NULL) THEN
      INSERT INTO catalog_texts (catalog_id, property_id,
                                 draft_title, draft_body, draft_lead, draft_highlights, draft_origin, draft_rev, draft_updated_at, draft_updated_by,
                                 pub_title, pub_body, pub_lead, pub_highlights, pub_source_hash, pub_source, published_at, published_by,
                                 copy_version_id)
      VALUES (p_catalog, p_property,
              v_copy.title, v_copy.body, v_copy.lead, '{}', 'manual', 1, now(), p_actor,
              v_copy.title, v_copy.body, v_copy.lead, '{}', v_copy.body_source_hash, v_copy.body_source, now(), p_actor,
              v_copy.id);
    END IF;
  END IF;

  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

DROP FUNCTION IF EXISTS catalog_area_text_remove(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_area_text_apply(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_area_text_for(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_area_text_state(uuid);
DROP FUNCTION IF EXISTS catalog_area_text_seed(uuid, jsonb);
DROP FUNCTION IF EXISTS catalog_area_text_discard(uuid, text);
DROP FUNCTION IF EXISTS catalog_area_text_retire(uuid, text);
DROP FUNCTION IF EXISTS catalog_area_text_approve(uuid, text, text);
DROP FUNCTION IF EXISTS catalog_area_text_save_draft(uuid, text, text, text);
DROP FUNCTION IF EXISTS catalog_area_text_lock(uuid, text);
DROP TABLE IF EXISTS catalog_area_copies;
DROP TABLE IF EXISTS area_text_versions;

REVOKE ALL ON FUNCTION catalog_add_property(uuid, uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)        FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_add_property(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)        TO service_role;

COMMIT;
