-- ============================================================================
-- Reversión de 0217 (título propio de cada vivienda en un catálogo).
-- Expediente: docs/changes/2026-10-20-bcp-01-compacto-y-opiniones/
--
-- Efecto: vuelven las funciones de 0197 (publicar, retirar, estados) y la
-- instantánea de 0202; se borra la sobrecarga de 9 argumentos y las columnas
-- draft_title / pub_title (LOS TÍTULOS PROPIOS GUARDADOS SE PIERDEN: si hay
-- que conservarlos, copiar antes
--   SELECT catalog_id, property_id, draft_title, pub_title FROM catalog_texts
--    WHERE draft_title IS NOT NULL OR pub_title IS NOT NULL;).
-- Una fila que solo tenía título queda sin contenido (no se borra).
-- Los lectores ven otra vez el título de la ficha; la huella vuelve a la de
-- antes en los catálogos que tenían título propio publicado.
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS catalog_text_save_draft(uuid, uuid, uuid, text, text, text, text[], text, integer);

CREATE OR REPLACE FUNCTION catalog_text_publish(p_actor uuid, p_catalog uuid, p_property uuid, p_expected_rev integer)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row     catalog_texts;
  v_block   text;
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  SELECT * INTO v_row FROM catalog_texts WHERE catalog_id = p_catalog AND property_id = p_property FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'text_not_found'; END IF;
  IF p_expected_rev IS NOT NULL AND v_row.draft_rev <> p_expected_rev THEN RAISE EXCEPTION 'draft_changed'; END IF;
  IF v_row.draft_body IS NULL AND v_row.draft_lead IS NULL THEN RAISE EXCEPTION 'text_empty'; END IF;
  SELECT b INTO v_block FROM (
    SELECT catalog_text_blocker(v_row.draft_body) AS b UNION ALL SELECT catalog_text_blocker(v_row.draft_lead)
    UNION ALL SELECT catalog_text_blocker(h) FROM unnest(v_row.draft_highlights) h
  ) x WHERE b IS NOT NULL ORDER BY b LIMIT 1;
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block; END IF;
  UPDATE catalog_texts
     SET pub_body = draft_body, pub_lead = draft_lead, pub_highlights = draft_highlights,
         pub_source_hash = catalog_source_hash(p_property), pub_source = catalog_source_facts(p_property),
         published_at = now(), published_by = p_actor
   WHERE catalog_id = p_catalog AND property_id = p_property;
  UPDATE catalogs SET version = version + 1, updated_at = now() WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

CREATE OR REPLACE FUNCTION catalog_text_withdraw(p_actor uuid, p_catalog uuid, p_property uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  UPDATE catalog_texts
     SET pub_body = NULL, pub_lead = NULL, pub_highlights = '{}', pub_source_hash = NULL, pub_source = NULL,
         published_at = NULL, published_by = NULL
   WHERE catalog_id = p_catalog AND property_id = p_property AND (pub_body IS NOT NULL OR pub_lead IS NOT NULL);
  IF NOT FOUND THEN RAISE EXCEPTION 'text_not_published'; END IF;
  UPDATE catalogs SET version = version + 1, updated_at = now() WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

CREATE OR REPLACE FUNCTION catalog_text_states(p_actor uuid, p_catalog uuid)
RETURNS TABLE (
  property_id uuid, in_list boolean, has_draft boolean, draft_rev integer, draft_origin text,
  draft_updated_at timestamptz, has_published boolean, published_current boolean, changed text[], published_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor)
     OR NOT EXISTS (SELECT 1 FROM catalogs WHERE id = p_catalog AND owner_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_ids := catalog_effective_ids(p_catalog);
  RETURN QUERY
    SELECT x.pid,
           x.pid = ANY (v_ids),
           t.catalog_id IS NOT NULL AND (t.draft_body IS NOT NULL OR t.draft_lead IS NOT NULL),
           coalesce(t.draft_rev, 0),
           t.draft_origin,
           t.draft_updated_at,
           t.pub_body IS NOT NULL OR t.pub_lead IS NOT NULL,
           (t.pub_body IS NOT NULL OR t.pub_lead IS NOT NULL) AND t.pub_source_hash = catalog_source_hash(x.pid),
           CASE WHEN t.pub_source IS NULL THEN '{}'::text[] ELSE
             (SELECT coalesce(array_agg(k ORDER BY k), '{}') FROM jsonb_object_keys(catalog_source_facts(x.pid)) k
               WHERE t.pub_source->k IS DISTINCT FROM catalog_source_facts(x.pid)->k) END,
           t.published_at
      FROM (SELECT unnest(v_ids) AS pid
            UNION
            SELECT ct.property_id FROM catalog_texts ct WHERE ct.catalog_id = p_catalog) x
      LEFT JOIN catalog_texts t ON t.catalog_id = p_catalog AND t.property_id = x.pid;
END
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

ALTER TABLE catalog_texts DROP CONSTRAINT IF EXISTS catalog_texts_title_len;
ALTER TABLE catalog_texts DROP COLUMN IF EXISTS draft_title;
ALTER TABLE catalog_texts DROP COLUMN IF EXISTS pub_title;

REVOKE ALL ON FUNCTION catalog_text_publish(uuid, uuid, uuid, integer)  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_withdraw(uuid, uuid, uuid)          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_states(uuid, uuid)                  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)                  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_text_publish(uuid, uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_withdraw(uuid, uuid, uuid)         TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_states(uuid, uuid)                 TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)                 TO service_role;

COMMIT;
