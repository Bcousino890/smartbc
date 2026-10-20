-- ============================================================================
-- 0217 · BCP-01: título propio de cada vivienda en un catálogo.
--
-- Expediente: docs/changes/2026-10-20-bcp-01-compacto-y-opiniones/
--   (spec.md DC4–DC7, plan.md A1).
--
-- Qué añade:
--   · catalog_texts.draft_title / pub_title: el título de la vivienda SOLO en
--     este catálogo. Vacío = el de la ficha. Nunca toca properties.title ni
--     otro catálogo.
--   · catalog_text_save_draft con p_title (sobrecarga de 9 argumentos). La de
--     8 argumentos (0197) se conserva para el código que siga desplegado
--     durante la actualización: no toca el título.
--   · catalog_text_publish: publica el borrador entero (título, texto, entrada
--     y puntos). Basta con un título: ya no exige texto ni entrada
--     ('text_empty' solo si no hay nada). El título pasa la misma comprobación
--     de contacto, URL y precio.
--   · El título publicado va en la instantánea SIEMPRE que exista, sin la
--     condición de vigencia del texto: un cambio de la ficha (sincronización,
--     edición) no lo retira. El texto publicado sigue la regla de 0197 (solo
--     si la fuente no cambió).
--   · catalog_text_withdraw retira también el título; catalog_text_states
--     cuenta el título en borrador y publicado, y «vigente» solo mira la
--     huella cuando hay texto publicado.
--   · Huella: no cambia en ningún catálogo sin título propio publicado.
--
-- Permisos (E1): sin cambios (RLS sin políticas, solo service_role).
-- SECURITY INVOKER y search_path fijo. Idempotente. Una sola transacción.
-- Reversión: docs/changes/2026-10-20-bcp-01-compacto-y-opiniones/rollback-0217.sql
-- ============================================================================

BEGIN;

ALTER TABLE catalog_texts ADD COLUMN IF NOT EXISTS draft_title text;
ALTER TABLE catalog_texts ADD COLUMN IF NOT EXISTS pub_title text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_texts_title_len') THEN
    ALTER TABLE catalog_texts ADD CONSTRAINT catalog_texts_title_len
      CHECK (char_length(coalesce(draft_title, '')) <= 160 AND char_length(coalesce(pub_title, '')) <= 160);
  END IF;
END $$;

-- Guarda el borrador con título. Con p_expected_rev, solo si nadie lo cambió
-- entretanto ('draft_changed'). El título se normaliza (espacios seguidos y
-- saltos de línea → un espacio); vacío = el de la ficha.
CREATE OR REPLACE FUNCTION catalog_text_save_draft(
  p_actor uuid, p_catalog uuid, p_property uuid,
  p_title text, p_body text, p_lead text, p_highlights text[], p_origin text, p_expected_rev integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_title text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
  v_body  text := nullif(btrim(coalesce(p_body, '')), '');
  v_lead  text := nullif(btrim(coalesce(p_lead, '')), '');
  v_hl    text[] := coalesce((SELECT array_agg(btrim(h)) FROM unnest(coalesce(p_highlights, '{}')) h WHERE btrim(h) <> ''), '{}');
  v_rev   integer;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF NOT catalog_text_allowed(p_catalog, p_property) THEN RAISE EXCEPTION 'not_in_catalog'; END IF;
  IF coalesce(p_origin, 'manual') NOT IN ('manual', 'ai_clean', 'ai_draft') THEN RAISE EXCEPTION 'invalid_text'; END IF;
  IF char_length(coalesce(v_title, '')) > 160 OR char_length(coalesce(v_body, '')) > 6000 OR char_length(coalesce(v_lead, '')) > 280
     OR cardinality(v_hl) > 3 OR EXISTS (SELECT 1 FROM unnest(v_hl) h WHERE char_length(h) > 200) THEN
    RAISE EXCEPTION 'text_too_long';
  END IF;
  SELECT draft_rev INTO v_rev FROM catalog_texts WHERE catalog_id = p_catalog AND property_id = p_property FOR UPDATE;
  IF p_expected_rev IS NOT NULL AND coalesce(v_rev, 0) <> p_expected_rev THEN RAISE EXCEPTION 'draft_changed'; END IF;
  INSERT INTO catalog_texts (catalog_id, property_id, draft_title, draft_body, draft_lead, draft_highlights, draft_origin, draft_rev, draft_updated_at, draft_updated_by)
  VALUES (p_catalog, p_property, v_title, v_body, v_lead, v_hl, coalesce(p_origin, 'manual'), 1, now(), p_actor)
  ON CONFLICT (catalog_id, property_id) DO UPDATE
     SET draft_title = EXCLUDED.draft_title, draft_body = EXCLUDED.draft_body, draft_lead = EXCLUDED.draft_lead,
         draft_highlights = EXCLUDED.draft_highlights, draft_origin = EXCLUDED.draft_origin, draft_rev = catalog_texts.draft_rev + 1,
         draft_updated_at = now(), draft_updated_by = p_actor
  RETURNING draft_rev INTO v_rev;
  RETURN v_rev;
END
$$;

-- Publica el borrador entero (revisado por el dueño en la gestión) y sella la
-- huella de la fuente para el texto. Basta con un título. Contacto, URL o
-- precio bloquean siempre (también en el título).
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
  IF v_row.draft_body IS NULL AND v_row.draft_lead IS NULL AND v_row.draft_title IS NULL THEN RAISE EXCEPTION 'text_empty'; END IF;
  SELECT b INTO v_block FROM (
    SELECT catalog_text_blocker(v_row.draft_title) AS b
    UNION ALL SELECT catalog_text_blocker(v_row.draft_body) UNION ALL SELECT catalog_text_blocker(v_row.draft_lead)
    UNION ALL SELECT catalog_text_blocker(h) FROM unnest(v_row.draft_highlights) h
  ) x WHERE b IS NOT NULL ORDER BY b LIMIT 1;
  IF v_block IS NOT NULL THEN RAISE EXCEPTION '%', v_block; END IF;
  UPDATE catalog_texts
     SET pub_title = draft_title, pub_body = draft_body, pub_lead = draft_lead, pub_highlights = draft_highlights,
         pub_source_hash = catalog_source_hash(p_property), pub_source = catalog_source_facts(p_property),
         published_at = now(), published_by = p_actor
   WHERE catalog_id = p_catalog AND property_id = p_property;
  UPDATE catalogs SET version = version + 1, updated_at = now() WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Retira lo publicado, título incluido (el borrador se conserva).
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
     SET pub_title = NULL, pub_body = NULL, pub_lead = NULL, pub_highlights = '{}', pub_source_hash = NULL, pub_source = NULL,
         published_at = NULL, published_by = NULL
   WHERE catalog_id = p_catalog AND property_id = p_property
     AND (pub_body IS NOT NULL OR pub_lead IS NOT NULL OR pub_title IS NOT NULL);
  IF NOT FOUND THEN RAISE EXCEPTION 'text_not_published'; END IF;
  UPDATE catalogs SET version = version + 1, updated_at = now() WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Diagnóstico de la gestión. Igual que 0197, con el título: cuenta como
-- borrador y como publicado; «vigente» y «qué cambió» solo miran la huella
-- cuando hay TEXTO publicado (el título no depende de ella).
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
           t.catalog_id IS NOT NULL AND (t.draft_body IS NOT NULL OR t.draft_lead IS NOT NULL OR t.draft_title IS NOT NULL),
           coalesce(t.draft_rev, 0),
           t.draft_origin,
           t.draft_updated_at,
           t.pub_body IS NOT NULL OR t.pub_lead IS NOT NULL OR t.pub_title IS NOT NULL,
           CASE WHEN t.pub_body IS NULL AND t.pub_lead IS NULL THEN t.pub_title IS NOT NULL
                ELSE t.pub_source_hash = catalog_source_hash(x.pid) END,
           CASE WHEN t.pub_source IS NULL OR (t.pub_body IS NULL AND t.pub_lead IS NULL) THEN '{}'::text[] ELSE
             (SELECT coalesce(array_agg(k ORDER BY k), '{}') FROM jsonb_object_keys(catalog_source_facts(x.pid)) k
               WHERE t.pub_source->k IS DISTINCT FROM catalog_source_facts(x.pid)->k) END,
           t.published_at
      FROM (SELECT unnest(v_ids) AS pid
            UNION
            SELECT ct.property_id FROM catalog_texts ct WHERE ct.catalog_id = p_catalog) x
      LEFT JOIN catalog_texts t ON t.catalog_id = p_catalog AND t.property_id = x.pid;
END
$$;

-- Instantánea: la de 0202 con el título propio publicado (sin condición de
-- vigencia), aplicado DESPUÉS de los datos de la ficha para que mande.
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
    -- OFFSET 0: evita que el planificador calcule la lista dos veces (Y5).
    OFFSET 0
  ) it
  WHERE c.id = p_catalog
$$;

REVOKE ALL ON FUNCTION catalog_text_save_draft(uuid, uuid, uuid, text, text, text, text[], text, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_publish(uuid, uuid, uuid, integer)                  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_withdraw(uuid, uuid, uuid)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_states(uuid, uuid)                                  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)                                  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_text_save_draft(uuid, uuid, uuid, text, text, text, text[], text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_publish(uuid, uuid, uuid, integer)               TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_withdraw(uuid, uuid, uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_states(uuid, uuid)                               TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)                               TO service_role;

COMMIT;
