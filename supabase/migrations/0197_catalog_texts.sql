-- ============================================================================
-- 0197 · BCP-01 ampliación C2: textos del catálogo y recorrido editorial.
--
-- Expediente: docs/changes/2026-10-13-bcp-01-home-catalogo/ampliacion-c-enmienda.md
--
-- Qué añade:
--   · catalog_texts: texto PROPIO de cada vivienda en cada catálogo, con
--     borrador (draft_*) y publicado (pub_*) separados. Nunca toca
--     properties.description, ni property_client_descriptions, ni las
--     historias globales. No es pertenencia: si la vivienda sale de la lista,
--     su texto queda en reserva; solo se borra a petición del dueño.
--   · draft_rev: cada guardado del borrador lo sube. Un borrador de IA que
--     llega tarde solo se guarda si el borrador no cambió entretanto.
--   · catalog_source_hash: huella de la FUENTE de la vivienda (texto,
--     características, características manuales, m², dormitorios, baños,
--     planta, operación). NO incluye precio ni estado: el texto editorial no
--     puede mencionar precios (se bloquea al publicar).
--   · Publicar sella esa huella. Si la fuente cambia, el texto publicado deja
--     de ir en la instantánea (el lector usa el siguiente nivel) y la gestión
--     enseña qué cambió; el texto se conserva para revisarlo.
--   · Instantánea (una sola sentencia): por vivienda, `text` (solo si hay
--     texto publicado VIGENTE) y `story` (solo si hay historia aprobada: su
--     huella, la entrada y los capítulos aprobados; la vigencia la comprueba
--     to-public con la huella del motor). Las fotos llevan su clase `k` solo
--     si se conoce. Sin texto ni historia, la huella no cambia.
--
-- Permisos (E1): RLS sin políticas, REVOKE a public/anon/authenticated y
-- EXECUTE/GRANT solo a service_role. SECURITY INVOKER y search_path fijo.
-- Funciones de gestión con p_actor y comprobación de dueño. Sin índices en
-- properties. Idempotente.
-- Reversión: docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0197.sql
-- ============================================================================

BEGIN;

-- ── Textos del catálogo ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog_texts (
  catalog_id        uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  property_id       uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  -- Borrador (solo gestión).
  draft_body        text,
  draft_lead        text,
  draft_highlights  text[]      NOT NULL DEFAULT '{}',
  draft_origin      text        NOT NULL DEFAULT 'manual',
  draft_rev         integer     NOT NULL DEFAULT 0,
  draft_updated_at  timestamptz,
  draft_updated_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  -- Publicado (lo que ve el lector mientras la fuente siga igual).
  pub_body          text,
  pub_lead          text,
  pub_highlights    text[]      NOT NULL DEFAULT '{}',
  pub_source_hash   text,
  pub_source        jsonb,
  published_at      timestamptz,
  published_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_id, property_id),
  CONSTRAINT catalog_texts_origin_ok CHECK (draft_origin IN ('manual', 'ai_clean', 'ai_draft')),
  CONSTRAINT catalog_texts_body_len  CHECK (char_length(coalesce(draft_body, '')) <= 6000 AND char_length(coalesce(pub_body, '')) <= 6000),
  CONSTRAINT catalog_texts_lead_len  CHECK (char_length(coalesce(draft_lead, '')) <= 280 AND char_length(coalesce(pub_lead, '')) <= 280),
  CONSTRAINT catalog_texts_hl_n      CHECK (cardinality(draft_highlights) <= 3 AND cardinality(pub_highlights) <= 3)
);
CREATE INDEX IF NOT EXISTS idx_catalog_texts_property ON catalog_texts (property_id);
ALTER TABLE catalog_texts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_texts FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_texts TO service_role;

-- Datos de la fuente que, si cambian, dejan sin vigencia un texto publicado.
-- Sin precio ni estado (ver arriba). La descripción va como huella.
CREATE OR REPLACE FUNCTION catalog_source_facts(p_property uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'description',     md5(btrim(coalesce(p.description, ''))),
    'features',        to_jsonb(coalesce(p.features, '{}')),
    'features_manual', to_jsonb(coalesce(p.features_manual, '{}')),
    'square_meters',   p.square_meters,
    'bedrooms',        p.bedrooms,
    'bathrooms',       p.bathrooms,
    'floor_override',  p.floor_override,
    'operation',       p.operation::text,
    'operations',      to_jsonb(coalesce(p.operations, '{}'))
  )
  FROM properties p WHERE p.id = p_property
$$;

CREATE OR REPLACE FUNCTION catalog_source_hash(p_property uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT md5(catalog_source_facts(p_property)::text) $$;

-- Lo que bloquea publicar SIEMPRE (también lo comprueba draft-check.ts, con
-- los mismos patrones): teléfonos, correos, URL y precios.
CREATE OR REPLACE FUNCTION catalog_text_blocker(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN NULL
    WHEN p_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' THEN 'text_has_contact'
    WHEN p_text ~* '(https?://|www\.)' OR p_text ~* '\m[a-z0-9-]+\.(com|es|net|org|eu|info|io|co)\M' THEN 'text_has_contact'
    WHEN p_text ~ '(\+[0-9]{2}[ .-]?)?[6789]([0-9][ .-]?){7}[0-9]' THEN 'text_has_contact'
    WHEN p_text ~* '([0-9][0-9., ]*[ ]?(€|euros?\M|eur\M))|(€ ?[0-9])' THEN 'text_has_price'
    ELSE NULL
  END
$$;

-- La vivienda está en la lista efectiva del catálogo o ya tiene texto (reserva).
CREATE OR REPLACE FUNCTION catalog_text_allowed(p_catalog uuid, p_property uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_property = ANY (catalog_effective_ids(p_catalog))
      OR EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = p_catalog AND property_id = p_property)
$$;

-- Guarda el borrador. Con p_expected_rev, solo si nadie lo cambió entretanto
-- (un borrador de IA que llega tarde no pisa una edición): 'draft_changed'.
CREATE OR REPLACE FUNCTION catalog_text_save_draft(
  p_actor uuid, p_catalog uuid, p_property uuid,
  p_body text, p_lead text, p_highlights text[], p_origin text, p_expected_rev integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_lead text := nullif(btrim(coalesce(p_lead, '')), '');
  v_hl   text[] := coalesce((SELECT array_agg(btrim(h)) FROM unnest(coalesce(p_highlights, '{}')) h WHERE btrim(h) <> ''), '{}');
  v_rev  integer;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF NOT catalog_text_allowed(p_catalog, p_property) THEN RAISE EXCEPTION 'not_in_catalog'; END IF;
  IF coalesce(p_origin, 'manual') NOT IN ('manual', 'ai_clean', 'ai_draft') THEN RAISE EXCEPTION 'invalid_text'; END IF;
  IF char_length(coalesce(v_body, '')) > 6000 OR char_length(coalesce(v_lead, '')) > 280
     OR cardinality(v_hl) > 3 OR EXISTS (SELECT 1 FROM unnest(v_hl) h WHERE char_length(h) > 200) THEN
    RAISE EXCEPTION 'text_too_long';
  END IF;
  SELECT draft_rev INTO v_rev FROM catalog_texts WHERE catalog_id = p_catalog AND property_id = p_property FOR UPDATE;
  IF p_expected_rev IS NOT NULL AND coalesce(v_rev, 0) <> p_expected_rev THEN RAISE EXCEPTION 'draft_changed'; END IF;
  INSERT INTO catalog_texts (catalog_id, property_id, draft_body, draft_lead, draft_highlights, draft_origin, draft_rev, draft_updated_at, draft_updated_by)
  VALUES (p_catalog, p_property, v_body, v_lead, v_hl, coalesce(p_origin, 'manual'), 1, now(), p_actor)
  ON CONFLICT (catalog_id, property_id) DO UPDATE
     SET draft_body = EXCLUDED.draft_body, draft_lead = EXCLUDED.draft_lead, draft_highlights = EXCLUDED.draft_highlights,
         draft_origin = EXCLUDED.draft_origin, draft_rev = catalog_texts.draft_rev + 1,
         draft_updated_at = now(), draft_updated_by = p_actor
  RETURNING draft_rev INTO v_rev;
  RETURN v_rev;
END
$$;

-- Publica el borrador tal cual (revisado por el dueño en la gestión) y sella
-- la huella de la fuente. Contacto, URL o precio bloquean siempre.
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

-- Retira lo publicado (el borrador se conserva).
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

-- Borra el texto (borrador y publicado). Solo a petición expresa del dueño.
CREATE OR REPLACE FUNCTION catalog_text_delete(p_actor uuid, p_catalog uuid, p_property uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  DELETE FROM catalog_texts WHERE catalog_id = p_catalog AND property_id = p_property;
  IF NOT FOUND THEN RAISE EXCEPTION 'text_not_found'; END IF;
  UPDATE catalogs SET version = version + 1, updated_at = now() WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Diagnóstico de la gestión: viviendas de la lista y textos en reserva, con
-- el estado del borrador y del publicado, y qué datos de la fuente cambiaron.
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

-- ── Instantánea ─────────────────────────────────────────────────────────────

-- JSON interno de una vivienda (0193/0195) + la clase de cada foto si se conoce.
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
      -- 0197: la clase de la foto (para elegir la foto de cada sección) solo
      -- se añade si se conoce: la corregida a mano manda; la de la IA, solo
      -- con confianza ≥ 0,75 (la misma regla que el renderer de SmartLink).
      SELECT jsonb_agg(jsonb_build_object(
               'u', md5(ph.url), 'w', ph.source_width, 'h', ph.source_height, 'c', ph.is_cover)
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

-- JSON de una vivienda DENTRO de un catálogo: el de siempre + el texto
-- publicado vigente de ese catálogo + la historia aprobada (si existen).
CREATE OR REPLACE FUNCTION catalog_item_json_c(p_catalog uuid, p_property uuid, p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT catalog_item_json(p_property, p_key)
    || coalesce((
         SELECT jsonb_build_object('text', jsonb_build_object('b', t.pub_body, 'l', t.pub_lead, 'h', to_jsonb(t.pub_highlights)))
           FROM catalog_texts t
          WHERE t.catalog_id = p_catalog AND t.property_id = p_property
            AND (t.pub_body IS NOT NULL OR t.pub_lead IS NOT NULL)
            AND t.pub_source_hash = catalog_source_hash(p_property)
       ), '{}'::jsonb)
    || coalesce((
         SELECT jsonb_build_object('story', jsonb_build_object(
                  'h',  v.source_hash,
                  'p',  CASE WHEN v.prelude_status = 'approved' THEN v.prelude END,
                  'ph', CASE WHEN v.prelude_status = 'approved' THEN v.prelude_headline END,
                  'b',  bl.blocks))
           FROM property_story_versions v
           CROSS JOIN LATERAL (
             SELECT jsonb_agg(jsonb_build_object('c', b.chapter, 't', b.copy) ORDER BY b.position, b.id) AS blocks
               FROM property_story_blocks b
              WHERE b.version_id = v.id AND b.status = 'approved' AND btrim(b.copy) <> ''
           ) bl
          WHERE v.property_id = p_property AND v.status = 'approved' AND bl.blocks IS NOT NULL
          LIMIT 1
       ), '{}'::jsonb)
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
    SELECT CASE WHEN c.mode = 'auto' THEN
      coalesce((
        SELECT jsonb_agg(catalog_item_json_c(c.id, s.property_id, s.public_key) ORDER BY s.ord)
          FROM catalog_select(c.id, c.criteria) s
      ), '[]'::jsonb)
    ELSE
      coalesce((
        SELECT jsonb_agg(catalog_item_json_c(c.id, ci.property_id, ci.public_key) ORDER BY ci.position, ci.id)
          FROM catalog_items ci
          JOIN properties p ON p.id = ci.property_id
         WHERE ci.catalog_id = c.id
           AND p.archived_at IS NULL
           AND p.status::text NOT IN ('sold', 'archived')
      ), '[]'::jsonb)
    END AS items
    -- OFFSET 0: sin esto el planificador «aplana» la subconsulta y copia la
    -- expresión en cada uso de it.items, así que con portada elegida la lista
    -- se calculaba DOS veces (medido en Y5: el doble de tiempo).
    OFFSET 0
  ) it
  WHERE c.id = p_catalog
$$;

-- ── Permisos (E1) ───────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_source_facts(uuid)                                       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_source_hash(uuid)                                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_blocker(text)                                       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_allowed(uuid, uuid)                                 FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_save_draft(uuid, uuid, uuid, text, text, text[], text, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_publish(uuid, uuid, uuid, integer)                  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_withdraw(uuid, uuid, uuid)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_delete(uuid, uuid, uuid)                            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_text_states(uuid, uuid)                                  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_item_json(uuid, text)                                    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_item_json_c(uuid, uuid, text)                            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)                                  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION catalog_source_facts(uuid)                                    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_source_hash(uuid)                                     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_blocker(text)                                    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_allowed(uuid, uuid)                              TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_save_draft(uuid, uuid, uuid, text, text, text[], text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_publish(uuid, uuid, uuid, integer)               TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_withdraw(uuid, uuid, uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_delete(uuid, uuid, uuid)                         TO service_role;
GRANT EXECUTE ON FUNCTION catalog_text_states(uuid, uuid)                               TO service_role;
GRANT EXECUTE ON FUNCTION catalog_item_json(uuid, text)                                 TO service_role;
GRANT EXECUTE ON FUNCTION catalog_item_json_c(uuid, uuid, text)                         TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)                               TO service_role;

COMMIT;
