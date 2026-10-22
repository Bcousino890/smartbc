-- ============================================================================
-- 0226 · BCP-01: traducciones preparadas y revisadas del catálogo (PR6).
--
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--   (spec.md §3 «Cómo se cumple», DA9–DA21, DA31–DA36, N5; plan.md PR6).
--
-- Qué añade:
--   · catalog_tr_sources: FUENTES de traducción con identidad de versión
--     (DA31), siempre del dueño: una versión aprobada de la biblioteca
--     (property_copy_versions, 0219: se reutiliza en todos sus catálogos), la
--     publicación propia de un catálogo (lo que ese catálogo enseña en
--     español; traducirla NO la lleva a la biblioteca), una versión de
--     plantilla «Vivir en…» (0222) o el título e introducción de un catálogo.
--     `es` guarda el español que se tradujo: los bloques de la descripción YA
--     ORGANIZADA con su CLAVE de sección (DA18) y `es_sig` su huella.
--   · catalog_tr_texts: la traducción de una fuente a un idioma (borrador
--     preparado, aprobada o rechazada), con revisión (`rev`) para no pisar.
--   · catalog_tr_features: características por cadena EXACTA e idioma, del
--     dueño (DA13).
--   · catalog_tr_copies / catalog_tr_meta_copies: la COPIA de cada catálogo
--     por vivienda e idioma (y la de su título e introducción), con la huella
--     del español publicado de ESE catálogo. Aprobar otra traducción después
--     no cambia las copias de otros catálogos (como DA5).
--   · catalog_tr_jobs: trabajos de preparación con estado (reservado con
--     caducidad e identificador, cancelado, caducado, incierto, fallido o
--     terminado). UNA reserva vigente por fuente e idioma (DA15): quien llega
--     después ve «en preparación». Solo guarda el trabajo cuya reserva siga
--     vigente y sea suya; lo que llega tarde o tras cancelar se descarta y se
--     registra. Un incierto no se reintenta sin pedirlo expresamente (DA36).
--   · catalog_lang_snapshot (la de 0223) más, FUERA del español, la copia de
--     cada vivienda en ese idioma («tr») y la del catálogo («trm»). En español
--     la instantánea es EXACTAMENTE la de 0223: ninguna huella cambia al
--     desplegar. El lector solo enseña una copia si su huella es la del
--     español que se ve hoy (TS); si no, el caso N5.
--   · catalog_tr_activate: activa un idioma en el catálogo o en un enlace
--     personal SOLO si está completo (cada vivienda de la lista con su copia
--     vigente y sus características, y el título del catálogo).
--
-- La IA NUNCA está en SQL: la llama la gestión al pulsar «Preparar» (con el
-- proveedor configurado). Ninguna lectura pública prepara nada (DA12).
-- No escribe en properties ni en property_client_descriptions.
-- Permisos (E1): RLS sin políticas, REVOKE a public/anon/authenticated y
-- EXECUTE solo a service_role. Las funciones del dueño pasan por
-- catalog_require_owner o catalog_copy_require_home.
-- Idempotente. Una sola transacción.
-- Reversión: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/rollback-0226.sql
-- ============================================================================

BEGIN;

-- ── Tablas ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog_tr_sources (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind            text        NOT NULL,
  property_id     uuid        REFERENCES properties(id) ON DELETE CASCADE,
  copy_version_id uuid        REFERENCES property_copy_versions(id) ON DELETE CASCADE,
  catalog_id      uuid        REFERENCES catalogs(id) ON DELETE CASCADE,
  area_version_id uuid        REFERENCES area_text_versions(id) ON DELETE CASCADE,
  es_sig          text        NOT NULL,
  es              jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_tr_sources_kind CHECK (kind IN ('library', 'catalog', 'area', 'meta')),
  CONSTRAINT catalog_tr_sources_ref CHECK (
       (kind = 'library' AND copy_version_id IS NOT NULL AND property_id IS NOT NULL AND catalog_id IS NULL AND area_version_id IS NULL)
    OR (kind = 'catalog' AND catalog_id IS NOT NULL AND property_id IS NOT NULL AND copy_version_id IS NULL AND area_version_id IS NULL)
    OR (kind = 'area'    AND area_version_id IS NOT NULL AND property_id IS NULL AND catalog_id IS NULL AND copy_version_id IS NULL)
    OR (kind = 'meta'    AND catalog_id IS NOT NULL AND property_id IS NULL AND copy_version_id IS NULL AND area_version_id IS NULL)),
  CONSTRAINT catalog_tr_sources_sig CHECK (es_sig ~ '^[0-9a-f]{32}$'),
  CONSTRAINT catalog_tr_sources_es  CHECK (jsonb_typeof(es) = 'object' AND octet_length(es::text) <= 60000)
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_tr_sources_identity
  ON catalog_tr_sources (owner_id, kind, coalesce(copy_version_id, catalog_id, area_version_id),
                         coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid), es_sig);
CREATE INDEX IF NOT EXISTS idx_catalog_tr_sources_property ON catalog_tr_sources (owner_id, property_id);
ALTER TABLE catalog_tr_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_tr_sources FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_tr_sources TO service_role;

CREATE TABLE IF NOT EXISTS catalog_tr_texts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid        NOT NULL REFERENCES catalog_tr_sources(id) ON DELETE CASCADE,
  lang        text        NOT NULL,
  status      text        NOT NULL DEFAULT 'draft',
  content     jsonb       NOT NULL,
  rev         integer     NOT NULL DEFAULT 1,
  origin      text        NOT NULL DEFAULT 'ai',
  job_id      uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT catalog_tr_texts_uq       UNIQUE (source_id, lang),
  CONSTRAINT catalog_tr_texts_lang     CHECK (lang IN ('en','fr','it','de','ar','tr','he')),
  CONSTRAINT catalog_tr_texts_status   CHECK (status IN ('draft', 'approved', 'rejected')),
  CONSTRAINT catalog_tr_texts_origin   CHECK (origin IN ('ai', 'manual')),
  CONSTRAINT catalog_tr_texts_approved CHECK ((status = 'approved') = (approved_at IS NOT NULL)),
  CONSTRAINT catalog_tr_texts_content  CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 80000)
);
ALTER TABLE catalog_tr_texts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_tr_texts FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_tr_texts TO service_role;

CREATE TABLE IF NOT EXISTS catalog_tr_features (
  owner_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lang        text        NOT NULL,
  es          text        NOT NULL,
  tr          text        NOT NULL,
  status      text        NOT NULL DEFAULT 'draft',
  origin      text        NOT NULL DEFAULT 'ai',
  job_id      uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  PRIMARY KEY (owner_id, lang, es),
  CONSTRAINT catalog_tr_features_lang   CHECK (lang IN ('en','fr','it','de','ar','tr','he')),
  CONSTRAINT catalog_tr_features_status CHECK (status IN ('draft', 'approved', 'rejected')),
  CONSTRAINT catalog_tr_features_origin CHECK (origin IN ('ai', 'manual')),
  CONSTRAINT catalog_tr_features_len    CHECK (btrim(es) <> '' AND char_length(es) <= 200 AND btrim(tr) <> '' AND char_length(tr) <= 200),
  CONSTRAINT catalog_tr_features_approved CHECK ((status = 'approved') = (approved_at IS NOT NULL))
);
ALTER TABLE catalog_tr_features ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_tr_features FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_tr_features TO service_role;

CREATE TABLE IF NOT EXISTS catalog_tr_copies (
  catalog_id   uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  property_id  uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lang         text        NOT NULL,
  es_sig       text        NOT NULL,
  content      jsonb       NOT NULL,
  features     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  text_id      uuid        REFERENCES catalog_tr_texts(id) ON DELETE SET NULL,
  area_text_id uuid        REFERENCES catalog_tr_texts(id) ON DELETE SET NULL,
  copied_at    timestamptz NOT NULL DEFAULT now(),
  copied_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (catalog_id, property_id, lang),
  CONSTRAINT catalog_tr_copies_lang CHECK (lang IN ('en','fr','it','de','ar','tr','he')),
  CONSTRAINT catalog_tr_copies_sig  CHECK (es_sig ~ '^[0-9a-f]{32}$'),
  CONSTRAINT catalog_tr_copies_json CHECK (jsonb_typeof(content) = 'object' AND jsonb_typeof(features) = 'array')
);
CREATE INDEX IF NOT EXISTS idx_catalog_tr_copies_property ON catalog_tr_copies (property_id);
ALTER TABLE catalog_tr_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_tr_copies FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_tr_copies TO service_role;

CREATE TABLE IF NOT EXISTS catalog_tr_meta_copies (
  catalog_id uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  lang       text        NOT NULL,
  es_sig     text        NOT NULL,
  title      text        NOT NULL,
  intro      text,
  text_id    uuid        REFERENCES catalog_tr_texts(id) ON DELETE SET NULL,
  copied_at  timestamptz NOT NULL DEFAULT now(),
  copied_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (catalog_id, lang),
  CONSTRAINT catalog_tr_meta_copies_lang CHECK (lang IN ('en','fr','it','de','ar','tr','he')),
  CONSTRAINT catalog_tr_meta_copies_sig  CHECK (es_sig ~ '^[0-9a-f]{32}$')
);
ALTER TABLE catalog_tr_meta_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_tr_meta_copies FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_tr_meta_copies TO service_role;

CREATE TABLE IF NOT EXISTS catalog_tr_jobs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_id    uuid        NOT NULL REFERENCES catalog_tr_sources(id) ON DELETE CASCADE,
  lang         text        NOT NULL,
  catalog_id   uuid        REFERENCES catalogs(id) ON DELETE SET NULL,
  property_id  uuid        REFERENCES properties(id) ON DELETE SET NULL,
  needs        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status       text        NOT NULL DEFAULT 'reserved',
  reserved_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at   timestamptz NOT NULL,
  finished_at  timestamptz,
  discarded_at timestamptz,
  note         text,
  CONSTRAINT catalog_tr_jobs_lang   CHECK (lang IN ('en','fr','it','de','ar','tr','he')),
  CONSTRAINT catalog_tr_jobs_status CHECK (status IN ('reserved', 'done', 'cancelled', 'expired', 'uncertain', 'failed'))
);
-- DA15: UNA reserva vigente por fuente e idioma (respaldo del bloqueo).
CREATE UNIQUE INDEX IF NOT EXISTS catalog_tr_jobs_one_reserved ON catalog_tr_jobs (source_id, lang) WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS idx_catalog_tr_jobs_source ON catalog_tr_jobs (source_id, lang, reserved_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_tr_jobs_catalog ON catalog_tr_jobs (catalog_id, lang);
ALTER TABLE catalog_tr_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_tr_jobs FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_tr_jobs TO service_role;

-- ── Ayudas ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION catalog_tr_lang_ok(p_lang text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT p_lang IS NOT NULL AND p_lang IN ('en','fr','it','de','ar','tr','he') $$;

-- Serializa la preparación de una fuente en un idioma.
CREATE OR REPLACE FUNCTION catalog_tr_lock(p_source uuid, p_lang text)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$ SELECT pg_advisory_xact_lock(hashtextextended('catalog_tr:' || p_source::text || ':' || p_lang, 0)) $$;

-- Mismas claves (k) y en el mismo orden, y ningún texto vacío (DA18).
CREATE OR REPLACE FUNCTION catalog_tr_keys_match(p_tr jsonb, p_es jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p_tr) = 'array' AND jsonb_typeof(p_es) = 'array'
     AND jsonb_array_length(p_tr) = jsonb_array_length(p_es)
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(p_tr) WITH ORDINALITY AS a(e, i)
         JOIN jsonb_array_elements(p_es) WITH ORDINALITY AS b(e, i) ON b.i = a.i
        WHERE (a.e->>'k') IS DISTINCT FROM (b.e->>'k')
           OR coalesce(btrim(a.e->>'x'), '') = ''
           OR char_length(a.e->>'x') > 8000)
$$;

-- Primer bloqueo (contacto, URL o precio) de cualquier texto de un contenido
-- traducido ({t, b:[{k,x}]} o {t, i}), con las MISMAS reglas que al publicar.
CREATE OR REPLACE FUNCTION catalog_tr_blocker(p_content jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(
    catalog_text_blocker(p_content->>'t'),
    catalog_text_blocker(p_content->>'i'),
    (SELECT catalog_text_blocker(e->>'x') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_content->'b') = 'array' THEN p_content->'b' ELSE '[]'::jsonb END) e
      WHERE catalog_text_blocker(e->>'x') IS NOT NULL LIMIT 1))
$$;

-- Versión de la biblioteca de la que es copia EXACTA el texto publicado de
-- esta vivienda en este catálogo (DA31): solo entonces la fuente es la
-- biblioteca y sus traducciones se reutilizan. Si no, NULL (texto propio).
CREATE OR REPLACE FUNCTION catalog_tr_library_version(p_owner uuid, p_catalog uuid, p_property uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- La versión de la que salió la copia (0219) o, en el catálogo donde se
  -- aprobó la descripción, esa misma versión; en los dos casos, solo si lo
  -- publicado sigue siendo EXACTAMENTE su contenido.
  SELECT v.id
    FROM catalog_texts t
    JOIN property_copy_versions v
      ON v.owner_id = p_owner AND v.property_id = p_property
     AND (v.id = t.copy_version_id OR (t.copy_version_id IS NULL AND v.body_catalog_id = p_catalog))
   WHERE t.catalog_id = p_catalog AND t.property_id = p_property
     AND (t.pub_body IS NOT NULL OR t.pub_lead IS NOT NULL)
     AND t.pub_title IS NOT DISTINCT FROM v.title
     AND t.pub_body  IS NOT DISTINCT FROM v.body
     AND t.pub_lead  IS NOT DISTINCT FROM v.lead
   ORDER BY (v.id = t.copy_version_id) DESC, v.seq DESC
   LIMIT 1
$$;

-- ── Lectura del dueño: lo que el catálogo enseña hoy en español ─────────────

-- Instantánea en ESPAÑOL y versión del catálogo leídas en la MISMA sentencia
-- (coherentes), más el mapa clave pública → vivienda de la lista efectiva y
-- la versión de plantilla de cada copia «Vivir en…» de este catálogo.
CREATE OR REPLACE FUNCTION catalog_tr_es_state(p_actor uuid, p_catalog uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat catalogs;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  RETURN jsonb_build_object(
    'version',      v_cat.version,
    'default_lang', v_cat.default_lang,
    'snapshot',     catalog_lang_snapshot(p_catalog, 'es'),
    'map', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'p',  e.pid,
               'k',  coalesce((SELECT ci.public_key FROM catalog_items ci WHERE ci.catalog_id = p_catalog AND ci.property_id = e.pid),
                              left(md5(v_cat.key_salt || e.pid::text), 16)),
               'av', (SELECT ac.version_id FROM catalog_area_copies ac WHERE ac.catalog_id = p_catalog AND ac.property_id = e.pid),
               'cv', catalog_tr_library_version(v_cat.owner_id, p_catalog, e.pid))
             ORDER BY e.ord)
        FROM unnest(catalog_effective_ids(p_catalog)) WITH ORDINALITY AS e(pid, ord)), '[]'::jsonb));
END
$$;

-- ── Fuentes (DA31) ──────────────────────────────────────────────────────────

-- La fuente de lo que el catálogo enseña de una vivienda (o, con p_property
-- NULL, de su título e introducción). Es de la biblioteca solo si el texto
-- publicado del catálogo es EXACTAMENTE la versión aprobada de la que salió
-- (se reutiliza en todos los catálogos del dueño); si no, es la publicación
-- propia de ESTE catálogo (nunca se promociona a la biblioteca).
CREATE OR REPLACE FUNCTION catalog_tr_source_ensure(p_actor uuid, p_catalog uuid, p_property uuid, p_es_sig text, p_es jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_ref  uuid;
  v_id   uuid;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF p_es_sig IS NULL OR p_es_sig !~ '^[0-9a-f]{32}$' OR jsonb_typeof(p_es) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_text';
  END IF;
  IF p_property IS NULL THEN
    v_kind := 'meta';
    v_ref := p_catalog;
  ELSE
    IF NOT catalog_text_allowed(p_catalog, p_property) THEN RAISE EXCEPTION 'not_in_catalog'; END IF;
    v_ref := catalog_tr_library_version(p_actor, p_catalog, p_property);
    IF v_ref IS NOT NULL THEN v_kind := 'library'; END IF;
    IF v_kind IS NULL THEN
      v_kind := 'catalog';
      v_ref := p_catalog;
    END IF;
  END IF;
  INSERT INTO catalog_tr_sources (owner_id, kind, property_id, copy_version_id, catalog_id, es_sig, es)
  VALUES (p_actor, v_kind, p_property,
          CASE WHEN v_kind = 'library' THEN v_ref END,
          CASE WHEN v_kind IN ('catalog', 'meta') THEN v_ref END,
          p_es_sig, p_es)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM catalog_tr_sources
   WHERE owner_id = p_actor AND kind = v_kind AND coalesce(copy_version_id, catalog_id, area_version_id) = v_ref
     AND property_id IS NOT DISTINCT FROM p_property AND es_sig = p_es_sig;
  RETURN jsonb_build_object('id', v_id, 'kind', v_kind);
END
$$;

-- Fuente de una versión de plantilla «Vivir en…» del dueño (se reutiliza en
-- todas las viviendas y catálogos que tengan su copia; DA27).
CREATE OR REPLACE FUNCTION catalog_tr_area_source_ensure(p_actor uuid, p_area_version uuid, p_es_sig text, p_es jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  IF p_es_sig IS NULL OR p_es_sig !~ '^[0-9a-f]{32}$' OR jsonb_typeof(p_es) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_text';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM area_text_versions WHERE id = p_area_version AND owner_id = p_actor) THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;
  INSERT INTO catalog_tr_sources (owner_id, kind, area_version_id, es_sig, es)
  VALUES (p_actor, 'area', p_area_version, p_es_sig, p_es)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM catalog_tr_sources
   WHERE owner_id = p_actor AND kind = 'area' AND area_version_id = p_area_version AND property_id IS NULL AND es_sig = p_es_sig;
  RETURN v_id;
END
$$;

-- ── Preparación con reserva (DA15, DA36) ────────────────────────────────────

-- Reserva la preparación de una fuente en un idioma. p_needs: {text|meta:
-- bool, area: uuid de la fuente de la plantilla, features: [cadenas]}. Se
-- recalcula aquí lo que falta de verdad. Devuelve:
--   {state: 'reserved', job, expires_at, needs}  → la gestión llama a la IA;
--   {state: 'busy', job, expires_at}             → ya hay una en preparación;
--   {state: 'ready'}                              → no falta nada;
--   {state: 'uncertain', job}                     → la última quedó incierta
--                                                   y no se pidió reintentar.
CREATE OR REPLACE FUNCTION catalog_tr_reserve(p_actor uuid, p_source uuid, p_lang text, p_catalog uuid, p_property uuid,
                                              p_needs jsonb, p_ttl_seconds integer, p_retry boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_src   catalog_tr_sources;
  v_job   catalog_tr_jobs;
  v_last  catalog_tr_jobs;
  v_self  boolean;
  v_area  uuid;
  v_feats jsonb;
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  IF p_catalog IS NOT NULL THEN PERFORM catalog_require_owner(p_actor, p_catalog); END IF;
  IF NOT catalog_tr_lang_ok(p_lang) THEN RAISE EXCEPTION 'invalid_lang'; END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 30 OR p_ttl_seconds > 900 THEN RAISE EXCEPTION 'invalid_ttl'; END IF;
  SELECT * INTO v_src FROM catalog_tr_sources WHERE id = p_source AND owner_id = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'source_not_found'; END IF;

  PERFORM catalog_tr_lock(p_source, p_lang);

  -- Una reserva caducada deja de reservar (queda registrada como caducada).
  UPDATE catalog_tr_jobs
     SET status = 'expired', finished_at = now(), note = concat_ws(' · ', note, 'reserva caducada sin resultado')
   WHERE source_id = p_source AND lang = p_lang AND status = 'reserved' AND expires_at <= now();

  SELECT * INTO v_job FROM catalog_tr_jobs WHERE source_id = p_source AND lang = p_lang AND status = 'reserved';
  IF FOUND THEN
    RETURN jsonb_build_object('state', 'busy', 'job', v_job.id, 'expires_at', v_job.expires_at);
  END IF;

  -- Lo que falta: la fuente (si no hay ya una traducción preparada o aprobada).
  v_self := (coalesce((p_needs->>'text')::boolean, false) OR coalesce((p_needs->>'meta')::boolean, false))
            AND v_src.kind <> 'area'
            AND NOT EXISTS (SELECT 1 FROM catalog_tr_texts WHERE source_id = p_source AND lang = p_lang AND status IN ('draft', 'approved'));
  -- La plantilla (fuente propia, del dueño).
  v_area := nullif(p_needs->>'area', '')::uuid;
  IF v_area IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM catalog_tr_sources WHERE id = v_area AND owner_id = p_actor AND kind = 'area') THEN
      RAISE EXCEPTION 'source_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM catalog_tr_texts WHERE source_id = v_area AND lang = p_lang AND status IN ('draft', 'approved')) THEN
      v_area := NULL;
    END IF;
  END IF;
  -- Las características (por cadena exacta) que no tienen traducción.
  SELECT coalesce(jsonb_agg(DISTINCT f), '[]'::jsonb) INTO v_feats
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_needs->'features') = 'array' THEN p_needs->'features' ELSE '[]'::jsonb END) AS x(f)
   WHERE btrim(f) <> '' AND char_length(f) <= 200
     AND NOT EXISTS (SELECT 1 FROM catalog_tr_features cf WHERE cf.owner_id = p_actor AND cf.lang = p_lang AND cf.es = x.f AND cf.status IN ('draft', 'approved'));
  IF jsonb_array_length(v_feats) > 80 THEN RAISE EXCEPTION 'invalid_text'; END IF;

  IF NOT v_self AND v_area IS NULL AND jsonb_array_length(v_feats) = 0 THEN
    RETURN jsonb_build_object('state', 'ready');
  END IF;

  -- Un resultado incierto anterior no se reintenta sin pedirlo (DA36).
  SELECT * INTO v_last FROM catalog_tr_jobs WHERE source_id = p_source AND lang = p_lang ORDER BY reserved_at DESC LIMIT 1;
  IF FOUND AND v_last.status = 'uncertain' AND NOT coalesce(p_retry, false) THEN
    RETURN jsonb_build_object('state', 'uncertain', 'job', v_last.id);
  END IF;

  INSERT INTO catalog_tr_jobs (owner_id, source_id, lang, catalog_id, property_id, needs, expires_at)
  VALUES (p_actor, p_source, p_lang, p_catalog, p_property,
          jsonb_build_object('text', v_self AND v_src.kind <> 'meta', 'meta', v_self AND v_src.kind = 'meta', 'area', v_area, 'features', v_feats),
          clock_timestamp() + make_interval(secs => p_ttl_seconds))
  RETURNING * INTO v_job;
  RETURN jsonb_build_object('state', 'reserved', 'job', v_job.id, 'expires_at', v_job.expires_at, 'needs', v_job.needs);
END
$$;

-- Cancela una preparación en curso. Lo que la IA devuelva después se
-- descarta (y se registra) en catalog_tr_finish.
CREATE OR REPLACE FUNCTION catalog_tr_cancel(p_actor uuid, p_job uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_job catalog_tr_jobs;
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  SELECT * INTO v_job FROM catalog_tr_jobs WHERE id = p_job AND owner_id = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found'; END IF;
  PERFORM catalog_tr_lock(v_job.source_id, v_job.lang);
  UPDATE catalog_tr_jobs SET status = 'cancelled', finished_at = now(), note = concat_ws(' · ', note, 'cancelada por el dueño')
   WHERE id = p_job AND status = 'reserved';
  RETURN FOUND;
END
$$;

-- Termina una preparación. Solo guarda si la reserva sigue siendo SUYA y
-- vigente; si se canceló, caducó o ya terminó, el resultado se descarta y se
-- registra. Nunca pisa una traducción en revisión o aprobada (solo sustituye
-- una rechazada). p_outcome: 'done' | 'failed' | 'uncertain'.
CREATE OR REPLACE FUNCTION catalog_tr_finish(p_actor uuid, p_job uuid, p_outcome text, p_result jsonb, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_job  catalog_tr_jobs;
  v_src  catalog_tr_sources;
  v_area uuid;
  v_f    jsonb;
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  IF p_outcome IS NULL OR p_outcome NOT IN ('done', 'failed', 'uncertain') THEN RAISE EXCEPTION 'invalid_outcome'; END IF;
  SELECT * INTO v_job FROM catalog_tr_jobs WHERE id = p_job AND owner_id = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_not_found'; END IF;
  PERFORM catalog_tr_lock(v_job.source_id, v_job.lang);
  SELECT * INTO v_job FROM catalog_tr_jobs WHERE id = p_job FOR UPDATE;

  IF v_job.status <> 'reserved' THEN
    UPDATE catalog_tr_jobs SET discarded_at = now(),
           note = concat_ws(' · ', note, format('resultado (%s) descartado: la reserva ya estaba %s', p_outcome, v_job.status))
     WHERE id = p_job;
    RETURN jsonb_build_object('state', 'discarded', 'reason', v_job.status);
  END IF;
  IF v_job.expires_at <= now() THEN
    UPDATE catalog_tr_jobs SET status = 'expired', finished_at = now(), discarded_at = now(),
           note = concat_ws(' · ', note, format('reserva caducada: resultado (%s) descartado', p_outcome))
     WHERE id = p_job;
    RETURN jsonb_build_object('state', 'discarded', 'reason', 'expired');
  END IF;
  IF p_outcome <> 'done' THEN
    UPDATE catalog_tr_jobs SET status = p_outcome, finished_at = now(), note = left(p_note, 400) WHERE id = p_job;
    RETURN jsonb_build_object('state', 'recorded');
  END IF;

  SELECT * INTO v_src FROM catalog_tr_sources WHERE id = v_job.source_id;
  -- La fuente propia (vivienda o catálogo).
  IF (v_job.needs->>'text')::boolean IS TRUE THEN
    IF jsonb_typeof(p_result->'text') IS DISTINCT FROM 'object' OR coalesce(btrim(p_result->'text'->>'t'), '') = ''
       OR char_length(p_result->'text'->>'t') > 200
       OR NOT catalog_tr_keys_match(p_result->'text'->'b', v_src.es->'b') THEN
      RAISE EXCEPTION 'translation_keys';
    END IF;
    INSERT INTO catalog_tr_texts (source_id, lang, status, content, job_id)
    VALUES (v_job.source_id, v_job.lang, 'draft', jsonb_build_object('t', btrim(p_result->'text'->>'t'), 'b', p_result->'text'->'b'), p_job)
    ON CONFLICT (source_id, lang) DO UPDATE
       SET status = 'draft', content = EXCLUDED.content, rev = catalog_tr_texts.rev + 1, origin = 'ai', job_id = EXCLUDED.job_id,
           updated_at = now(), approved_at = NULL, approved_by = NULL
     WHERE catalog_tr_texts.status = 'rejected';
  END IF;
  IF (v_job.needs->>'meta')::boolean IS TRUE THEN
    IF jsonb_typeof(p_result->'meta') IS DISTINCT FROM 'object' OR coalesce(btrim(p_result->'meta'->>'t'), '') = ''
       OR char_length(p_result->'meta'->>'t') > 200 OR char_length(coalesce(p_result->'meta'->>'i', '')) > 1200 THEN
      RAISE EXCEPTION 'translation_keys';
    END IF;
    INSERT INTO catalog_tr_texts (source_id, lang, status, content, job_id)
    VALUES (v_job.source_id, v_job.lang, 'draft',
            jsonb_build_object('t', btrim(p_result->'meta'->>'t'), 'i', nullif(btrim(coalesce(p_result->'meta'->>'i', '')), '')), p_job)
    ON CONFLICT (source_id, lang) DO UPDATE
       SET status = 'draft', content = EXCLUDED.content, rev = catalog_tr_texts.rev + 1, origin = 'ai', job_id = EXCLUDED.job_id,
           updated_at = now(), approved_at = NULL, approved_by = NULL
     WHERE catalog_tr_texts.status = 'rejected';
  END IF;
  -- La plantilla de zona (se reutiliza: nunca pisa una ya preparada).
  v_area := nullif(v_job.needs->>'area', '')::uuid;
  IF v_area IS NOT NULL AND coalesce(btrim(p_result->>'area'), '') <> '' THEN
    IF char_length(p_result->>'area') > 2500 THEN RAISE EXCEPTION 'text_too_long'; END IF;
    INSERT INTO catalog_tr_texts (source_id, lang, status, content, job_id)
    VALUES (v_area, v_job.lang, 'draft', jsonb_build_object('b', jsonb_build_array(jsonb_build_object('k', 'barrio', 'x', btrim(p_result->>'area')))), p_job)
    ON CONFLICT (source_id, lang) DO UPDATE
       SET status = 'draft', content = EXCLUDED.content, rev = catalog_tr_texts.rev + 1, origin = 'ai', job_id = EXCLUDED.job_id,
           updated_at = now(), approved_at = NULL, approved_by = NULL
     WHERE catalog_tr_texts.status = 'rejected';
  END IF;
  -- Las características pedidas (solo esas).
  FOR v_f IN SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_result->'features') = 'array' THEN p_result->'features' ELSE '[]'::jsonb END) e LOOP
    CONTINUE WHEN v_f->>'es' IS NULL OR NOT ((v_job.needs->'features') ? (v_f->>'es'));
    CONTINUE WHEN coalesce(btrim(v_f->>'tr'), '') = '' OR char_length(v_f->>'tr') > 200;
    INSERT INTO catalog_tr_features (owner_id, lang, es, tr, status, job_id)
    VALUES (p_actor, v_job.lang, v_f->>'es', btrim(v_f->>'tr'), 'draft', p_job)
    ON CONFLICT (owner_id, lang, es) DO UPDATE
       SET tr = EXCLUDED.tr, status = 'draft', origin = 'ai', job_id = EXCLUDED.job_id, updated_at = now(), approved_at = NULL
     WHERE catalog_tr_features.status = 'rejected';
  END LOOP;
  UPDATE catalog_tr_jobs SET status = 'done', finished_at = now(), note = left(p_note, 400) WHERE id = p_job;
  RETURN jsonb_build_object('state', 'saved');
END
$$;

-- ── Revisión (DA11) ─────────────────────────────────────────────────────────

-- Edita una traducción tal como la vio el dueño (p_expected_rev). Editar una
-- aprobada la devuelve a revisión (las copias ya hechas no cambian).
CREATE OR REPLACE FUNCTION catalog_tr_save(p_actor uuid, p_text uuid, p_expected_rev integer, p_content jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_t   catalog_tr_texts;
  v_src catalog_tr_sources;
  v_c   jsonb;
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  SELECT t.* INTO v_t FROM catalog_tr_texts t JOIN catalog_tr_sources s ON s.id = t.source_id
   WHERE t.id = p_text AND s.owner_id = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'translation_not_found'; END IF;
  PERFORM catalog_tr_lock(v_t.source_id, v_t.lang);
  SELECT * INTO v_t FROM catalog_tr_texts WHERE id = p_text FOR UPDATE;
  IF v_t.rev IS DISTINCT FROM p_expected_rev THEN RAISE EXCEPTION 'translation_changed'; END IF;
  SELECT * INTO v_src FROM catalog_tr_sources WHERE id = v_t.source_id;
  IF jsonb_typeof(p_content) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'translation_keys'; END IF;
  IF v_src.kind = 'meta' THEN
    IF coalesce(btrim(p_content->>'t'), '') = '' OR char_length(p_content->>'t') > 200 OR char_length(coalesce(p_content->>'i', '')) > 1200 THEN
      RAISE EXCEPTION 'translation_keys';
    END IF;
    v_c := jsonb_build_object('t', btrim(p_content->>'t'), 'i', nullif(btrim(coalesce(p_content->>'i', '')), ''));
  ELSE
    IF NOT catalog_tr_keys_match(p_content->'b', v_src.es->'b') THEN RAISE EXCEPTION 'translation_keys'; END IF;
    IF v_src.kind <> 'area' AND (coalesce(btrim(p_content->>'t'), '') = '' OR char_length(p_content->>'t') > 200) THEN
      RAISE EXCEPTION 'translation_keys';
    END IF;
    v_c := CASE WHEN v_src.kind = 'area' THEN jsonb_build_object('b', p_content->'b')
                ELSE jsonb_build_object('t', btrim(p_content->>'t'), 'b', p_content->'b') END;
  END IF;
  IF catalog_tr_blocker(v_c) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_tr_blocker(v_c); END IF;
  UPDATE catalog_tr_texts
     SET content = v_c, rev = rev + 1, status = 'draft', origin = 'manual', updated_at = now(), approved_at = NULL, approved_by = NULL
   WHERE id = p_text
  RETURNING rev INTO v_t.rev;
  RETURN v_t.rev;
END
$$;

-- Una característica escrita o corregida a mano (queda para aprobar).
CREATE OR REPLACE FUNCTION catalog_tr_feature_save(p_actor uuid, p_lang text, p_es text, p_tr text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  IF NOT catalog_tr_lang_ok(p_lang) THEN RAISE EXCEPTION 'invalid_lang'; END IF;
  IF coalesce(btrim(p_es), '') = '' OR char_length(p_es) > 200 OR coalesce(btrim(p_tr), '') = '' OR char_length(p_tr) > 200 THEN
    RAISE EXCEPTION 'invalid_text';
  END IF;
  IF catalog_text_blocker(p_tr) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_text_blocker(p_tr); END IF;
  INSERT INTO catalog_tr_features (owner_id, lang, es, tr, status, origin)
  VALUES (p_actor, p_lang, p_es, btrim(p_tr), 'draft', 'manual')
  ON CONFLICT (owner_id, lang, es) DO UPDATE
     SET tr = EXCLUDED.tr, status = 'draft', origin = 'manual', updated_at = now(), approved_at = NULL
   WHERE catalog_tr_features.tr IS DISTINCT FROM EXCLUDED.tr OR catalog_tr_features.status <> 'draft';
END
$$;

-- Rechaza una traducción en revisión (se puede preparar otra).
CREATE OR REPLACE FUNCTION catalog_tr_reject(p_actor uuid, p_text uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_t catalog_tr_texts;
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  SELECT t.* INTO v_t FROM catalog_tr_texts t JOIN catalog_tr_sources s ON s.id = t.source_id
   WHERE t.id = p_text AND s.owner_id = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'translation_not_found'; END IF;
  PERFORM catalog_tr_lock(v_t.source_id, v_t.lang);
  UPDATE catalog_tr_texts SET status = 'rejected', updated_at = now() WHERE id = p_text AND status = 'draft';
  RETURN FOUND;
END
$$;

-- ── Copias del catálogo ─────────────────────────────────────────────────────

-- ¿La traducción `p_text` (del dueño, en p_lang) corresponde a esta vivienda
-- de este catálogo (o a su título e introducción con p_property NULL)?
CREATE OR REPLACE FUNCTION catalog_tr_text_for(p_actor uuid, p_catalog uuid, p_property uuid, p_lang text, p_text uuid)
RETURNS catalog_tr_texts
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT t.*
    FROM catalog_tr_texts t
    JOIN catalog_tr_sources s ON s.id = t.source_id
   WHERE t.id = p_text AND t.lang = p_lang AND s.owner_id = p_actor
     AND CASE
           WHEN p_property IS NULL THEN s.kind = 'meta' AND s.catalog_id = p_catalog
           ELSE (s.kind = 'catalog' AND s.catalog_id = p_catalog AND s.property_id = p_property)
             OR (s.kind = 'library' AND s.property_id = p_property
                 AND s.copy_version_id = catalog_tr_library_version(p_actor, p_catalog, p_property))
         END
$$;

-- Copia en el catálogo las traducciones APROBADAS (sin IA): la de la fuente
-- de la vivienda, la de su plantilla si entra y las de sus características
-- (p_features: las cadenas que se ven hoy). p_es_sig: huella del español que
-- se ve hoy en ESTE catálogo. Con p_property NULL, el título y la
-- introducción del catálogo. Sube la versión solo si algo cambió.
CREATE OR REPLACE FUNCTION catalog_tr_copy_set(p_actor uuid, p_catalog uuid, p_property uuid, p_lang text, p_es_sig text,
                                               p_text uuid, p_area_text uuid, p_features jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_t       catalog_tr_texts;
  v_src     catalog_tr_sources;
  v_a       catalog_tr_texts;
  v_content jsonb;
  v_feats   jsonb;
  v_changed boolean := false;
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF NOT catalog_tr_lang_ok(p_lang) THEN RAISE EXCEPTION 'invalid_lang'; END IF;
  IF p_es_sig IS NULL OR p_es_sig !~ '^[0-9a-f]{32}$' THEN RAISE EXCEPTION 'invalid_text'; END IF;
  IF p_property IS NOT NULL AND NOT catalog_text_allowed(p_catalog, p_property) THEN RAISE EXCEPTION 'not_in_catalog'; END IF;
  SELECT * INTO v_t FROM catalog_tr_text_for(p_actor, p_catalog, p_property, p_lang, p_text);
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'translation_not_found'; END IF;
  IF v_t.status <> 'approved' THEN RAISE EXCEPTION 'translation_not_approved'; END IF;
  SELECT * INTO v_src FROM catalog_tr_sources WHERE id = v_t.source_id;

  IF p_property IS NULL THEN
    IF v_src.es_sig <> p_es_sig THEN RAISE EXCEPTION 'translation_changed'; END IF;
    INSERT INTO catalog_tr_meta_copies (catalog_id, lang, es_sig, title, intro, text_id, copied_by)
    VALUES (p_catalog, p_lang, p_es_sig, v_t.content->>'t', v_t.content->>'i', v_t.id, p_actor)
    ON CONFLICT (catalog_id, lang) DO UPDATE
       SET es_sig = EXCLUDED.es_sig, title = EXCLUDED.title, intro = EXCLUDED.intro, text_id = EXCLUDED.text_id,
           copied_at = now(), copied_by = EXCLUDED.copied_by
     WHERE (catalog_tr_meta_copies.es_sig, catalog_tr_meta_copies.title, catalog_tr_meta_copies.intro)
           IS DISTINCT FROM (EXCLUDED.es_sig, EXCLUDED.title, EXCLUDED.intro);
    v_changed := FOUND;
  ELSE
    IF p_area_text IS NOT NULL THEN
      SELECT t.* INTO v_a FROM catalog_tr_texts t JOIN catalog_tr_sources s ON s.id = t.source_id
       WHERE t.id = p_area_text AND t.lang = p_lang AND s.owner_id = p_actor AND s.kind = 'area';
      IF NOT FOUND THEN RAISE EXCEPTION 'translation_not_found'; END IF;
      IF v_a.status <> 'approved' THEN RAISE EXCEPTION 'translation_not_approved'; END IF;
    ELSIF v_src.es_sig <> p_es_sig THEN
      -- Sin plantilla, lo que se ve es exactamente la fuente.
      RAISE EXCEPTION 'translation_changed';
    END IF;
    v_content := jsonb_build_object('t', v_t.content->>'t',
                   'b', (v_t.content->'b') || CASE WHEN v_a.id IS NULL THEN '[]'::jsonb
                                                   ELSE jsonb_build_array(jsonb_build_object('k', 'barrio', 'x', v_a.content->'b'->0->>'x')) END);
    SELECT coalesce(jsonb_agg(jsonb_build_array(f.es, f.tr) ORDER BY l.o), '[]'::jsonb) INTO v_feats
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_features) = 'array' THEN p_features ELSE '[]'::jsonb END) WITH ORDINALITY AS l(es, o)
      JOIN catalog_tr_features f ON f.owner_id = p_actor AND f.lang = p_lang AND f.es = l.es AND f.status = 'approved';
    INSERT INTO catalog_tr_copies (catalog_id, property_id, lang, es_sig, content, features, text_id, area_text_id, copied_by)
    VALUES (p_catalog, p_property, p_lang, p_es_sig, v_content, v_feats, v_t.id, v_a.id, p_actor)
    ON CONFLICT (catalog_id, property_id, lang) DO UPDATE
       SET es_sig = EXCLUDED.es_sig, content = EXCLUDED.content, features = EXCLUDED.features, text_id = EXCLUDED.text_id,
           area_text_id = EXCLUDED.area_text_id, copied_at = now(), copied_by = EXCLUDED.copied_by
     WHERE (catalog_tr_copies.es_sig, catalog_tr_copies.content, catalog_tr_copies.features)
           IS DISTINCT FROM (EXCLUDED.es_sig, EXCLUDED.content, EXCLUDED.features);
    v_changed := FOUND;
  END IF;
  IF v_changed THEN
    UPDATE catalogs SET version = version + 1, updated_at = now() WHERE id = p_catalog RETURNING version INTO v_version;
  ELSE
    v_version := v_cat.version;
  END IF;
  RETURN v_version;
END
$$;

-- Aprueba lo revisado TAL COMO se vio (revisión de cada parte) y lo copia al
-- catálogo. p_parts: {text: {id, rev}, area: {id, rev} | null, features:
-- [{es, tr}] (las que se aprueban), list: [cadenas que se ven hoy]}.
CREATE OR REPLACE FUNCTION catalog_tr_approve(p_actor uuid, p_catalog uuid, p_property uuid, p_lang text, p_es_sig text, p_parts jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_t   catalog_tr_texts;
  v_a   catalog_tr_texts;
  v_aid uuid;
  v_f   jsonb;
  v_row catalog_tr_features;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF NOT catalog_tr_lang_ok(p_lang) THEN RAISE EXCEPTION 'invalid_lang'; END IF;
  SELECT * INTO v_t FROM catalog_tr_text_for(p_actor, p_catalog, p_property, p_lang, nullif(p_parts->'text'->>'id', '')::uuid);
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'translation_not_found'; END IF;
  PERFORM catalog_tr_lock(v_t.source_id, v_t.lang);
  SELECT * INTO v_t FROM catalog_tr_texts WHERE id = v_t.id FOR UPDATE;
  IF v_t.status = 'rejected' OR v_t.rev IS DISTINCT FROM (p_parts->'text'->>'rev')::integer THEN RAISE EXCEPTION 'translation_changed'; END IF;
  IF catalog_tr_blocker(v_t.content) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_tr_blocker(v_t.content); END IF;
  UPDATE catalog_tr_texts SET status = 'approved', approved_at = now(), approved_by = p_actor, updated_at = now()
   WHERE id = v_t.id AND status <> 'approved';

  v_aid := nullif(p_parts->'area'->>'id', '')::uuid;
  IF v_aid IS NOT NULL THEN
    SELECT t.* INTO v_a FROM catalog_tr_texts t JOIN catalog_tr_sources s ON s.id = t.source_id
     WHERE t.id = v_aid AND t.lang = p_lang AND s.owner_id = p_actor AND s.kind = 'area';
    IF NOT FOUND THEN RAISE EXCEPTION 'translation_not_found'; END IF;
    PERFORM catalog_tr_lock(v_a.source_id, v_a.lang);
    SELECT * INTO v_a FROM catalog_tr_texts WHERE id = v_aid FOR UPDATE;
    IF v_a.status = 'rejected' OR v_a.rev IS DISTINCT FROM (p_parts->'area'->>'rev')::integer THEN RAISE EXCEPTION 'translation_changed'; END IF;
    IF catalog_tr_blocker(v_a.content) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_tr_blocker(v_a.content); END IF;
    UPDATE catalog_tr_texts SET status = 'approved', approved_at = now(), approved_by = p_actor, updated_at = now()
     WHERE id = v_aid AND status <> 'approved';
  END IF;

  FOR v_f IN SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_parts->'features') = 'array' THEN p_parts->'features' ELSE '[]'::jsonb END) e LOOP
    SELECT * INTO v_row FROM catalog_tr_features WHERE owner_id = p_actor AND lang = p_lang AND es = v_f->>'es' FOR UPDATE;
    IF NOT FOUND OR v_row.status = 'rejected' OR v_row.tr IS DISTINCT FROM (v_f->>'tr') THEN RAISE EXCEPTION 'translation_changed'; END IF;
    IF catalog_text_blocker(v_row.tr) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_text_blocker(v_row.tr); END IF;
    UPDATE catalog_tr_features SET status = 'approved', approved_at = now(), updated_at = now()
     WHERE owner_id = p_actor AND lang = p_lang AND es = v_row.es AND status <> 'approved';
  END LOOP;

  RETURN catalog_tr_copy_set(p_actor, p_catalog, p_property, p_lang, p_es_sig, v_t.id, v_aid, p_parts->'list');
END
$$;

-- Quita la copia de una vivienda (o la del catálogo con p_property NULL).
CREATE OR REPLACE FUNCTION catalog_tr_copy_remove(p_actor uuid, p_catalog uuid, p_property uuid, p_lang text)
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
  IF p_property IS NULL THEN
    DELETE FROM catalog_tr_meta_copies WHERE catalog_id = p_catalog AND lang = p_lang;
  ELSE
    DELETE FROM catalog_tr_copies WHERE catalog_id = p_catalog AND property_id = p_property AND lang = p_lang;
  END IF;
  IF NOT FOUND THEN RETURN v_cat.version; END IF;
  UPDATE catalogs SET version = version + 1, updated_at = now() WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- ── Activación de un idioma (solo completo) ─────────────────────────────────

-- Cambia el idioma del catálogo (p_link NULL) o de un enlace personal (NULL
-- en p_lang = el del catálogo). Fuera del español, SOLO si está completo:
--   · el catálogo no cambió desde que se comprobó (p_expected_version);
--   · cada vivienda de la lista efectiva está en p_required.items y tiene su
--     copia con esa huella y todas sus características;
--   · el título del catálogo tiene su copia con la huella p_required.meta.
-- Si no, 'lang_incomplete' y el enlace sigue en el idioma de antes.
CREATE OR REPLACE FUNCTION catalog_tr_activate(p_actor uuid, p_catalog uuid, p_link uuid, p_lang text, p_expected_version bigint, p_required jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_link    catalog_client_links;
  v_version bigint;
  v_items   jsonb := CASE WHEN jsonb_typeof(p_required->'items') = 'array' THEN p_required->'items' ELSE '[]'::jsonb END;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF p_link IS NOT NULL THEN
    SELECT * INTO v_link FROM catalog_client_links WHERE id = p_link AND catalog_id = p_catalog;
    IF NOT FOUND THEN RAISE EXCEPTION 'link_not_found'; END IF;
    IF v_link.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'link_revoked'; END IF;
  ELSIF p_lang IS NULL THEN
    RAISE EXCEPTION 'invalid_lang';
  END IF;
  IF p_lang IS NOT NULL AND p_lang NOT IN ('es','en','fr','it','de','ar','tr','he') THEN RAISE EXCEPTION 'invalid_lang'; END IF;

  IF p_lang IS NOT NULL AND p_lang <> 'es' THEN
    IF v_cat.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'catalog_changed'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(catalog_effective_ids(p_catalog)) AS e(pid)
                WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) r WHERE (r->>'p')::uuid = e.pid)) THEN
      RAISE EXCEPTION 'lang_incomplete';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_items) r
       WHERE NOT EXISTS (
         SELECT 1 FROM catalog_tr_copies cp
          WHERE cp.catalog_id = p_catalog AND cp.property_id = (r->>'p')::uuid AND cp.lang = p_lang AND cp.es_sig = r->>'s'
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r->'f') = 'array' THEN r->'f' ELSE '[]'::jsonb END) AS fe(es)
               WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(cp.features) pr WHERE pr->>0 = fe.es)))) THEN
      RAISE EXCEPTION 'lang_incomplete';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM catalog_tr_meta_copies m WHERE m.catalog_id = p_catalog AND m.lang = p_lang AND m.es_sig = p_required->>'meta') THEN
      RAISE EXCEPTION 'lang_incomplete';
    END IF;
  END IF;

  IF p_link IS NULL THEN
    UPDATE catalogs SET default_lang = p_lang, version = version + 1, updated_at = now()
     WHERE id = p_catalog AND default_lang IS DISTINCT FROM p_lang;
  ELSE
    UPDATE catalog_client_links SET lang = p_lang WHERE id = p_link AND lang IS DISTINCT FROM p_lang;
    IF FOUND THEN
      UPDATE catalogs SET version = version + 1, updated_at = now() WHERE id = p_catalog;
    END IF;
  END IF;
  SELECT version INTO v_version FROM catalogs WHERE id = p_catalog;
  RETURN v_version;
END
$$;

-- ── Instantánea por idioma ──────────────────────────────────────────────────

-- La de 0223 y, FUERA del español, la copia de este catálogo en ese idioma
-- de cada vivienda («tr»: huella del español traducido, título, bloques con
-- su clave y características) y la de su título e introducción («trm»). En
-- español, exactamente la de 0223. Solo copias APROBADAS (no hay otras):
-- la vigencia frente al español de hoy la decide el lector (to-public.ts).
CREATE OR REPLACE FUNCTION catalog_lang_snapshot(p_catalog uuid, p_lang text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(p_lang, 'es') = 'es' THEN x.s || jsonb_build_object('lang', 'es')
    ELSE x.s || jsonb_build_object('lang', p_lang)
      || CASE WHEN EXISTS (SELECT 1 FROM catalog_tr_copies cp WHERE cp.catalog_id = p_catalog AND cp.lang = p_lang)
              THEN jsonb_build_object('items', (
                SELECT coalesce(jsonb_agg(e.v || coalesce(tr.j, '{}'::jsonb) ORDER BY e.o), '[]'::jsonb)
                  FROM jsonb_array_elements(x.s->'items') WITH ORDINALITY AS e(v, o)
                  LEFT JOIN LATERAL (
                    SELECT jsonb_build_object('tr', jsonb_build_object(
                             's', cp.es_sig, 't', cp.content->'t', 'b', cp.content->'b', 'f', cp.features)) AS j
                      FROM catalog_tr_copies cp
                      JOIN catalogs c ON c.id = cp.catalog_id
                      LEFT JOIN catalog_items ci ON ci.catalog_id = cp.catalog_id AND ci.property_id = cp.property_id
                     WHERE cp.catalog_id = p_catalog AND cp.lang = p_lang
                       AND coalesce(ci.public_key, left(md5(c.key_salt || cp.property_id::text), 16)) = e.v->>'key'
                     LIMIT 1
                  ) tr ON true))
              ELSE '{}'::jsonb END
      || coalesce((SELECT jsonb_build_object('trm', jsonb_build_object('s', m.es_sig, 't', m.title, 'i', m.intro))
                     FROM catalog_tr_meta_copies m WHERE m.catalog_id = p_catalog AND m.lang = p_lang), '{}'::jsonb)
  END
  FROM (SELECT catalog_internal_snapshot(p_catalog) AS s) x
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_tr_lang_ok(text)                                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_lock(uuid, text)                                       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_keys_match(jsonb, jsonb)                               FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_blocker(jsonb)                                         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_library_version(uuid, uuid, uuid)                     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_es_state(uuid, uuid)                                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_source_ensure(uuid, uuid, uuid, text, jsonb)           FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_area_source_ensure(uuid, uuid, text, jsonb)            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_reserve(uuid, uuid, text, uuid, uuid, jsonb, integer, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_cancel(uuid, uuid)                                     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_finish(uuid, uuid, text, jsonb, text)                  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_save(uuid, uuid, integer, jsonb)                       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_feature_save(uuid, text, text, text)                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_reject(uuid, uuid)                                     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_text_for(uuid, uuid, uuid, text, uuid)                 FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_copy_set(uuid, uuid, uuid, text, text, uuid, uuid, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_approve(uuid, uuid, uuid, text, text, jsonb)           FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_copy_remove(uuid, uuid, uuid, text)                    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_activate(uuid, uuid, uuid, text, bigint, jsonb)        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_lang_snapshot(uuid, text)                                 FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_tr_lang_ok(text)                                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_lock(uuid, text)                                    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_keys_match(jsonb, jsonb)                            TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_blocker(jsonb)                                      TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_library_version(uuid, uuid, uuid)                  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_es_state(uuid, uuid)                                TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_source_ensure(uuid, uuid, uuid, text, jsonb)        TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_area_source_ensure(uuid, uuid, text, jsonb)         TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_reserve(uuid, uuid, text, uuid, uuid, jsonb, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_cancel(uuid, uuid)                                  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_finish(uuid, uuid, text, jsonb, text)               TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_save(uuid, uuid, integer, jsonb)                    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_feature_save(uuid, text, text, text)                TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_reject(uuid, uuid)                                  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_text_for(uuid, uuid, uuid, text, uuid)              TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_copy_set(uuid, uuid, uuid, text, text, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_approve(uuid, uuid, uuid, text, text, jsonb)        TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_copy_remove(uuid, uuid, uuid, text)                 TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_activate(uuid, uuid, uuid, text, bigint, jsonb)     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_lang_snapshot(uuid, text)                              TO service_role;

COMMIT;
