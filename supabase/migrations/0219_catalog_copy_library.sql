-- ============================================================================
-- 0219 · BCP-01: biblioteca de textos aprobados por vivienda y reutilización.
--
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--   (spec.md §2, DA4–DA8, DA32, DA33, N1; plan.md PR1).
--
-- Qué añade:
--   · property_copy_versions: versiones INMUTABLES del texto aprobado de una
--     vivienda, del dueño de la HOME (owner_id). Título y descripción son
--     partes INDEPENDIENTES (DA32): aprobar solo una arrastra la otra tal
--     cual, con su propia huella de la ficha. La descripción guarda la
--     huella (catalog_source_hash) de cuando se aprobó: la regla C2 decide
--     después si se ve. Entrada (lead) va con la descripción; los puntos
--     (highlights) no se reutilizan (dependen de la ficha y del catálogo).
--   · catalog_texts.copy_version_id: de qué versión salió la copia de un
--     catálogo (solo informativo; la copia es independiente, DA5).
--   · catalog_copy_approve: aprueba LO PUBLICADO en un catálogo (título,
--     descripción o ambos). Publicar y aprobar son acciones distintas (N1).
--     Nunca aprueba un borrador ni una descripción no vigente.
--   · catalog_copy_withdraw: retira el título, la descripción o todo.
--   · catalog_copy_state / catalog_copy_candidates: lectura para el gestor
--     y para la siembra (sin IA; cada candidato se confirma a mano).
--   · catalog_add_property (redefinida): tras añadir, SOLO si el catálogo no
--     tiene ningún texto de esa vivienda (ni borrador, ni publicado, ni en
--     reserva), copia la última versión con contenido como texto publicado
--     del catálogo (DA33). La conversión (0213) y el cambio de modo (0196)
--     insertan por otro camino y no reutilizan nada.
--
-- Nunca escribe en properties ni en catálogos de otros dueños. Sin IA.
-- Permisos (E1): RLS sin políticas, solo service_role; las funciones del
-- dueño comprueban home_owners y la propiedad del catálogo.
-- Idempotente. Una sola transacción.
-- Reversión: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/rollback-0219.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS property_copy_versions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id        uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  seq                integer     NOT NULL,
  -- Título aprobado (null = sin título aprobado).
  title              text,
  title_approved_at  timestamptz,
  title_catalog_id   uuid        REFERENCES catalogs(id) ON DELETE SET NULL,
  -- Descripción aprobada (cuerpo y entrada) con la huella de la ficha de su
  -- aprobación (C2). Null = sin descripción aprobada.
  body               text,
  lead               text,
  body_source_hash   text,
  body_source        jsonb,
  body_approved_at   timestamptz,
  body_catalog_id    uuid        REFERENCES catalogs(id) ON DELETE SET NULL,
  change             text        NOT NULL,
  content_hash       text        NOT NULL,
  created_by         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_copy_versions_seq UNIQUE (owner_id, property_id, seq),
  CONSTRAINT property_copy_versions_change_ok CHECK (change IN ('title', 'body', 'both', 'withdraw_title', 'withdraw_body', 'withdraw_all')),
  CONSTRAINT property_copy_versions_len CHECK (
    char_length(coalesce(title, '')) <= 160 AND char_length(coalesce(body, '')) <= 6000 AND char_length(coalesce(lead, '')) <= 280),
  -- Una descripción aprobada siempre lleva su huella.
  CONSTRAINT property_copy_versions_body_hash CHECK ((body IS NULL AND lead IS NULL) = (body_source_hash IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_property_copy_versions_latest ON property_copy_versions (owner_id, property_id, seq DESC);
ALTER TABLE property_copy_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE property_copy_versions FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE property_copy_versions TO service_role;

ALTER TABLE catalog_texts ADD COLUMN IF NOT EXISTS copy_version_id uuid REFERENCES property_copy_versions(id) ON DELETE SET NULL;

-- Huella del contenido de una versión (idempotencia: lo idéntico no versiona).
CREATE OR REPLACE FUNCTION catalog_copy_content_hash(p_title text, p_body text, p_lead text, p_hash text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT md5(coalesce(p_title, '') || chr(1) || coalesce(p_body, '') || chr(1) || coalesce(p_lead, '') || chr(1) || coalesce(p_hash, ''))
$$;

-- Dueño de la HOME (sin catálogo): 'forbidden' si no lo es.
CREATE OR REPLACE FUNCTION catalog_copy_require_home(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END
$$;

-- Aprueba para reutilizar lo PUBLICADO en un catálogo. p_parts: 'title',
-- 'body' o 'both'. Devuelve {status: created|unchanged, version_id, seq}.
CREATE OR REPLACE FUNCTION catalog_copy_approve(p_actor uuid, p_catalog uuid, p_property uuid, p_parts text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_t      catalog_texts;
  v_prev   property_copy_versions;
  v_title  boolean := p_parts IN ('title', 'both');
  v_body   boolean := p_parts IN ('body', 'both');
  n        property_copy_versions;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF p_parts IS NULL OR p_parts NOT IN ('title', 'body', 'both') THEN RAISE EXCEPTION 'invalid_parts'; END IF;
  SELECT * INTO v_t FROM catalog_texts WHERE catalog_id = p_catalog AND property_id = p_property;
  IF NOT FOUND THEN RAISE EXCEPTION 'text_not_found'; END IF;
  IF v_title AND v_t.pub_title IS NULL THEN RAISE EXCEPTION 'title_not_published'; END IF;
  IF v_body AND v_t.pub_body IS NULL AND v_t.pub_lead IS NULL THEN RAISE EXCEPTION 'body_not_published'; END IF;
  -- Una descripción que ya no corresponde a la ficha no se aprueba (C2).
  IF v_body AND v_t.pub_source_hash IS DISTINCT FROM catalog_source_hash(p_property) THEN RAISE EXCEPTION 'text_stale'; END IF;

  -- Una aprobación a la vez por dueño y vivienda.
  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_copy:' || p_actor::text || ':' || p_property::text, 0));
  SELECT * INTO v_prev FROM property_copy_versions
   WHERE owner_id = p_actor AND property_id = p_property ORDER BY seq DESC LIMIT 1;

  n.title := CASE WHEN v_title THEN v_t.pub_title ELSE v_prev.title END;
  n.title_approved_at := CASE WHEN v_title THEN now() ELSE v_prev.title_approved_at END;
  n.title_catalog_id := CASE WHEN v_title THEN p_catalog ELSE v_prev.title_catalog_id END;
  n.body := CASE WHEN v_body THEN v_t.pub_body ELSE v_prev.body END;
  n.lead := CASE WHEN v_body THEN v_t.pub_lead ELSE v_prev.lead END;
  n.body_source_hash := CASE WHEN v_body THEN v_t.pub_source_hash ELSE v_prev.body_source_hash END;
  n.body_source := CASE WHEN v_body THEN v_t.pub_source ELSE v_prev.body_source END;
  n.body_approved_at := CASE WHEN v_body THEN now() ELSE v_prev.body_approved_at END;
  n.body_catalog_id := CASE WHEN v_body THEN p_catalog ELSE v_prev.body_catalog_id END;
  n.content_hash := catalog_copy_content_hash(n.title, n.body, n.lead, n.body_source_hash);

  IF v_prev.id IS NOT NULL AND v_prev.content_hash = n.content_hash THEN
    RETURN jsonb_build_object('status', 'unchanged', 'version_id', v_prev.id, 'seq', v_prev.seq);
  END IF;

  INSERT INTO property_copy_versions (owner_id, property_id, seq, title, title_approved_at, title_catalog_id,
                                      body, lead, body_source_hash, body_source, body_approved_at, body_catalog_id,
                                      change, content_hash, created_by)
  VALUES (p_actor, p_property, coalesce(v_prev.seq, 0) + 1, n.title, n.title_approved_at, n.title_catalog_id,
          n.body, n.lead, n.body_source_hash, n.body_source, n.body_approved_at, n.body_catalog_id,
          p_parts, n.content_hash, p_actor)
  RETURNING * INTO n;
  RETURN jsonb_build_object('status', 'created', 'version_id', n.id, 'seq', n.seq);
END
$$;

-- Retira de la biblioteca el título, la descripción o todo ('title',
-- 'body', 'all'). Ningún catálogo cambia (sus copias son independientes).
CREATE OR REPLACE FUNCTION catalog_copy_withdraw(p_actor uuid, p_property uuid, p_part text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_prev property_copy_versions;
  n      property_copy_versions;
  v_t    boolean := p_part IN ('title', 'all');
  v_b    boolean := p_part IN ('body', 'all');
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  IF p_part IS NULL OR p_part NOT IN ('title', 'body', 'all') THEN RAISE EXCEPTION 'invalid_parts'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_copy:' || p_actor::text || ':' || p_property::text, 0));
  SELECT * INTO v_prev FROM property_copy_versions
   WHERE owner_id = p_actor AND property_id = p_property ORDER BY seq DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'copy_not_found'; END IF;

  n := v_prev;
  IF v_t THEN n.title := NULL; n.title_approved_at := NULL; n.title_catalog_id := NULL; END IF;
  IF v_b THEN
    n.body := NULL; n.lead := NULL; n.body_source_hash := NULL; n.body_source := NULL;
    n.body_approved_at := NULL; n.body_catalog_id := NULL;
  END IF;
  n.content_hash := catalog_copy_content_hash(n.title, n.body, n.lead, n.body_source_hash);
  IF n.content_hash = v_prev.content_hash THEN
    RETURN jsonb_build_object('status', 'unchanged', 'version_id', v_prev.id, 'seq', v_prev.seq);
  END IF;
  INSERT INTO property_copy_versions (owner_id, property_id, seq, title, title_approved_at, title_catalog_id,
                                      body, lead, body_source_hash, body_source, body_approved_at, body_catalog_id,
                                      change, content_hash, created_by)
  VALUES (p_actor, p_property, v_prev.seq + 1, n.title, n.title_approved_at, n.title_catalog_id,
          n.body, n.lead, n.body_source_hash, n.body_source, n.body_approved_at, n.body_catalog_id,
          'withdraw_' || p_part, n.content_hash, p_actor)
  RETURNING * INTO n;
  RETURN jsonb_build_object('status', 'created', 'version_id', n.id, 'seq', n.seq);
END
$$;

-- Versión vigente de unas viviendas en la biblioteca del dueño, con la
-- vigencia de su descripción (C2) y qué datos de la ficha cambiaron.
CREATE OR REPLACE FUNCTION catalog_copy_state(p_actor uuid, p_properties uuid[])
RETURNS TABLE (
  property_id uuid, version_id uuid, seq integer, title text, body text, lead text,
  body_current boolean, changed text[], title_approved_at timestamptz, body_approved_at timestamptz,
  title_catalog_title text, body_catalog_title text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  RETURN QUERY
    SELECT v.property_id, v.id, v.seq, v.title, v.body, v.lead,
           CASE WHEN v.body_source_hash IS NULL THEN NULL ELSE v.body_source_hash = catalog_source_hash(v.property_id) END,
           CASE WHEN v.body_source IS NULL THEN '{}'::text[] ELSE
             (SELECT coalesce(array_agg(k ORDER BY k), '{}') FROM jsonb_object_keys(catalog_source_facts(v.property_id)) k
               WHERE v.body_source->k IS DISTINCT FROM catalog_source_facts(v.property_id)->k) END,
           v.title_approved_at, v.body_approved_at,
           (SELECT c.title FROM catalogs c WHERE c.id = v.title_catalog_id),
           (SELECT c.title FROM catalogs c WHERE c.id = v.body_catalog_id),
           v.created_at
      FROM (
        SELECT DISTINCT ON (x.property_id) x.*
          FROM property_copy_versions x
         WHERE x.owner_id = p_actor AND x.property_id = ANY (coalesce(p_properties, '{}'))
         ORDER BY x.property_id, x.seq DESC
      ) v
     WHERE v.title IS NOT NULL OR v.body IS NOT NULL OR v.lead IS NOT NULL;
END
$$;

-- Siembra (sin IA): lo publicado en los catálogos del dueño, con si ya está
-- en la biblioteca y si el catálogo tiene asignaciones personales (0218): en
-- ese caso el texto puede ser personal y se señala. Nada se aprueba aquí.
CREATE OR REPLACE FUNCTION catalog_copy_candidates(p_actor uuid)
RETURNS TABLE (
  catalog_id uuid, catalog_title text, property_id uuid, property_title text,
  pub_title text, pub_body text, pub_lead text, body_current boolean,
  has_personal_links boolean, published_at timestamptz,
  title_in_library boolean, body_in_library boolean)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  RETURN QUERY
    SELECT t.catalog_id, c.title, t.property_id, p.title,
           t.pub_title, t.pub_body, t.pub_lead,
           CASE WHEN t.pub_body IS NULL AND t.pub_lead IS NULL THEN NULL ELSE t.pub_source_hash = catalog_source_hash(t.property_id) END,
           EXISTS (SELECT 1 FROM catalog_client_links l WHERE l.catalog_id = t.catalog_id),
           t.published_at,
           t.pub_title IS NOT NULL AND lib.title IS NOT DISTINCT FROM t.pub_title,
           (t.pub_body IS NOT NULL OR t.pub_lead IS NOT NULL)
             AND lib.body IS NOT DISTINCT FROM t.pub_body AND lib.lead IS NOT DISTINCT FROM t.pub_lead
      FROM catalog_texts t
      JOIN catalogs c ON c.id = t.catalog_id AND c.owner_id = p_actor
      JOIN properties p ON p.id = t.property_id
      LEFT JOIN LATERAL (
        SELECT v.title, v.body, v.lead FROM property_copy_versions v
         WHERE v.owner_id = p_actor AND v.property_id = t.property_id ORDER BY v.seq DESC LIMIT 1
      ) lib ON true
     WHERE t.pub_title IS NOT NULL OR t.pub_body IS NOT NULL OR t.pub_lead IS NOT NULL
     ORDER BY p.title, t.published_at DESC NULLS LAST;
END
$$;

-- ── Añadir una vivienda: igual que 0212 + reutilización (DA33) ─────────────
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

REVOKE ALL ON FUNCTION catalog_copy_content_hash(text, text, text, text)  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_copy_require_home(uuid)                    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_copy_approve(uuid, uuid, uuid, text)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_copy_withdraw(uuid, uuid, text)            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_copy_state(uuid, uuid[])                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_copy_candidates(uuid)                      FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_add_property(uuid, uuid, uuid)             FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_copy_content_hash(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_copy_require_home(uuid)                 TO service_role;
GRANT EXECUTE ON FUNCTION catalog_copy_approve(uuid, uuid, uuid, text)    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_copy_withdraw(uuid, uuid, text)         TO service_role;
GRANT EXECUTE ON FUNCTION catalog_copy_state(uuid, uuid[])                TO service_role;
GRANT EXECUTE ON FUNCTION catalog_copy_candidates(uuid)                   TO service_role;
GRANT EXECUTE ON FUNCTION catalog_add_property(uuid, uuid, uuid)          TO service_role;

COMMIT;
