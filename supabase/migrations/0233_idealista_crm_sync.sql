-- ============================================================================
-- 0233 · Idealista API → CRM (2/2): registro de operaciones y sincronización.
-- Expediente: docs/changes/2026-10-28-idealista-api-crm-sync/ (spec §1–§8, §10).
--
--   · Registro de SOLO AÑADIR (trigger): idealista_api_operations (antes de
--     llamar a Idealista), idealista_api_operation_results (la confirmación
--     principal, una por operación) e idealista_api_operation_steps (pasos
--     posteriores: fotos, vídeos, escritura local, sincronización…). Orden por
--     UNA secuencia (idealista_ops_seq). Los solapes y lo «sin resultado» se
--     calculan al leer; nunca se actualiza una fila.
--   · idealista_crm_target: qué debe reflejar el CRM (published / withdrawn /
--     review / uncertain / uncertain_create / none) y con qué operación.
--   · idealista_crm_sync: una asociación por (ficha, entorno), origen inmutable.
--   · apply_idealista_crm_sync: aplica el objetivo en UNA transacción, con
--     bloqueo por ficha y sin aplicar nunca un seq menor o igual al aplicado.
--   · Multimedia versionada: idealista_crm_media_objects / _sources y la
--     limpieza segura (no borra lo que está en uso ni lo subido hace < 24 h).
--   · Interruptor app_settings.idealista_crm_sync = {"enabled": false}: con él
--     apagado se registra todo y no se aplica nada.
--
-- Todo solo para service_role. Idempotente. Transacción propia.
-- Reversión: docs/changes/…/rollback-0233.sql (se niega si hay datos).
-- ============================================================================
BEGIN;

CREATE SEQUENCE IF NOT EXISTS idealista_ops_seq;

-- ── Registro de operaciones ─────────────────────────────────────────────────
-- listing_id SIN FK a propósito: el registro es histórico y de solo añadir; un
-- ON DELETE SET NULL sería un UPDATE que el trigger rechazaría.
CREATE TABLE IF NOT EXISTS idealista_api_operations (
  seq                    bigint      PRIMARY KEY DEFAULT nextval('idealista_ops_seq'),
  op_id                  uuid        NOT NULL UNIQUE,
  listing_id             uuid        NOT NULL,
  environment            text        NOT NULL,
  kind                   text        NOT NULL,
  api_property_id_before bigint,
  reference_code         text,
  content_snapshot       jsonb,
  media_manifest         jsonb,
  actor_id               uuid,
  begun_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT idealista_api_operations_env_chk  CHECK (environment IN ('sandbox', 'production')),
  CONSTRAINT idealista_api_operations_kind_chk CHECK (kind IN ('create', 'update', 'deactivate', 'reactivate', 'observe', 'observe_reconcile'))
);
CREATE INDEX IF NOT EXISTS idx_idealista_api_operations_listing ON idealista_api_operations (listing_id, environment, seq);

CREATE TABLE IF NOT EXISTS idealista_api_operation_results (
  op_id                    uuid        PRIMARY KEY REFERENCES idealista_api_operations(op_id),
  result_seq               bigint      NOT NULL UNIQUE DEFAULT nextval('idealista_ops_seq'),
  outcome                  text        NOT NULL,
  http_status              integer,
  response_state           text,
  api_property_id_returned bigint,
  detail                   text,
  recorded_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT idealista_api_operation_results_outcome_chk CHECK (outcome IN ('confirmed', 'rejected', 'unknown'))
);

CREATE TABLE IF NOT EXISTS idealista_api_operation_steps (
  step_seq    bigint      PRIMARY KEY DEFAULT nextval('idealista_ops_seq'),
  op_id       uuid        NOT NULL REFERENCES idealista_api_operations(op_id),
  step        text        NOT NULL,
  ok          boolean     NOT NULL,
  detail      text,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT idealista_api_operation_steps_step_chk CHECK (step IN (
    'idealista_images', 'idealista_videos', 'idealista_tour', 'listing_write', 'api_log', 'crm_sync', 'media_copy'))
);
CREATE INDEX IF NOT EXISTS idx_idealista_api_operation_steps_op ON idealista_api_operation_steps (op_id);

CREATE OR REPLACE FUNCTION idealista_ops_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'idealista_ops_append_only' USING ERRCODE = 'P0001',
    DETAIL = format('%s es de solo añadir: no se actualiza ni se borra.', TG_TABLE_NAME);
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['idealista_api_operations', 'idealista_api_operation_results', 'idealista_api_operation_steps']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_append_only ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_append_only BEFORE UPDATE OR DELETE ON %I
                      FOR EACH ROW EXECUTE FUNCTION idealista_ops_append_only()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_append_only_truncate ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_append_only_truncate BEFORE TRUNCATE ON %I
                      FOR EACH STATEMENT EXECUTE FUNCTION idealista_ops_append_only()', t);
  END LOOP;
END $$;

-- ── Asociación y estado de sincronización ───────────────────────────────────
CREATE TABLE IF NOT EXISTS idealista_crm_sync (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id          uuid        NOT NULL,
  environment         text        NOT NULL,
  property_id         uuid        REFERENCES properties(id) ON DELETE SET NULL,
  property_origin     text,
  planned_property_id uuid,
  review_choice       text,
  origin_decided_by   uuid,
  origin_decided_at   timestamptz,
  tag_id              uuid        REFERENCES property_tags(id) ON DELETE SET NULL,
  tag_already_present boolean,
  smartlink_path      text,
  applied_seq         bigint      NOT NULL DEFAULT 0,
  status              text        NOT NULL DEFAULT 'pending',
  review_reason       text,
  review_candidates   uuid[],
  last_error_code     text,
  last_error          text,
  attempts            integer     NOT NULL DEFAULT 0,
  last_attempt_at     timestamptz,
  synced_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idealista_crm_sync_unique UNIQUE (listing_id, environment),
  CONSTRAINT idealista_crm_sync_env_chk CHECK (environment IN ('sandbox', 'production')),
  CONSTRAINT idealista_crm_sync_origin_chk CHECK (property_origin IS NULL OR property_origin IN ('generated', 'existing')),
  CONSTRAINT idealista_crm_sync_choice_chk CHECK (review_choice IS NULL OR review_choice IN ('use_existing', 'generate')),
  CONSTRAINT idealista_crm_sync_status_chk CHECK (status IN (
    'pending', 'synced', 'failed', 'needs_review', 'uncertain', 'uncertain_create', 'stale', 'disabled', 'sandbox'))
);
CREATE INDEX IF NOT EXISTS idx_idealista_crm_sync_property ON idealista_crm_sync (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_idealista_crm_sync_attention ON idealista_crm_sync (status)
  WHERE status IN ('failed', 'needs_review', 'uncertain', 'uncertain_create');

CREATE OR REPLACE FUNCTION idealista_crm_sync_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.property_origin IS NOT NULL AND NEW.property_origin IS DISTINCT FROM OLD.property_origin THEN
    RAISE EXCEPTION 'idealista_crm_origin_immutable' USING ERRCODE = 'P0001';
  END IF;
  -- La única excepción: la FK pone property_id a NULL si se borra la propiedad.
  IF OLD.property_id IS NOT NULL AND NEW.property_id IS DISTINCT FROM OLD.property_id AND NEW.property_id IS NOT NULL THEN
    RAISE EXCEPTION 'idealista_crm_property_immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.planned_property_id IS NOT NULL AND NEW.planned_property_id IS DISTINCT FROM OLD.planned_property_id THEN
    RAISE EXCEPTION 'idealista_crm_planned_immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.review_choice IS NOT NULL AND NEW.review_choice IS DISTINCT FROM OLD.review_choice THEN
    RAISE EXCEPTION 'idealista_crm_choice_immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id OR NEW.environment IS DISTINCT FROM OLD.environment THEN
    RAISE EXCEPTION 'idealista_crm_key_immutable' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_idealista_crm_sync_guard ON idealista_crm_sync;
CREATE TRIGGER trg_idealista_crm_sync_guard BEFORE UPDATE ON idealista_crm_sync
  FOR EACH ROW EXECUTE FUNCTION idealista_crm_sync_guard();

-- ── Multimedia versionada ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idealista_crm_media_objects (
  storage_path  text        PRIMARY KEY,
  property_id   uuid        NOT NULL,
  kind          text        NOT NULL CHECK (kind IN ('photo', 'plan')),
  sha256        text        NOT NULL,
  bytes         bigint      NOT NULL,
  mime          text        NOT NULL,
  staged_by_seq bigint      NOT NULL,
  staged_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_idealista_crm_media_objects_property ON idealista_crm_media_objects (property_id, sha256);

CREATE TABLE IF NOT EXISTS idealista_crm_media_sources (
  property_id  uuid        NOT NULL,
  source_sha   text        NOT NULL,
  storage_path text        NOT NULL REFERENCES idealista_crm_media_objects(storage_path),
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, source_sha)
);

-- ── Interruptor (D24) ───────────────────────────────────────────────────────
INSERT INTO app_settings (key, value) VALUES ('idealista_crm_sync', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION idealista_crm_sync_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce((SELECT (value->>'enabled')::boolean FROM app_settings WHERE key = 'idealista_crm_sync'), false)
$$;

-- ── Escritura del registro ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION idealista_op_begin(
  p_op_id uuid, p_listing uuid, p_environment text, p_kind text, p_api_property_id_before bigint,
  p_reference_code text, p_content jsonb, p_manifest jsonb, p_actor uuid)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_seq bigint;
BEGIN
  INSERT INTO idealista_api_operations (op_id, listing_id, environment, kind, api_property_id_before,
                                        reference_code, content_snapshot, media_manifest, actor_id)
  VALUES (p_op_id, p_listing, p_environment, p_kind, p_api_property_id_before,
          p_reference_code, p_content, p_manifest, p_actor)
  ON CONFLICT (op_id) DO NOTHING
  RETURNING seq INTO v_seq;
  IF v_seq IS NULL THEN
    SELECT seq INTO v_seq FROM idealista_api_operations WHERE op_id = p_op_id;
  END IF;
  RETURN v_seq;
END $$;

-- El primer resultado gana: un segundo intento de guardar el resultado no lo cambia.
CREATE OR REPLACE FUNCTION idealista_op_finish(
  p_op_id uuid, p_outcome text, p_http_status integer, p_state text, p_api_property_id bigint, p_detail text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_done uuid;
BEGIN
  INSERT INTO idealista_api_operation_results (op_id, outcome, http_status, response_state, api_property_id_returned, detail)
  VALUES (p_op_id, p_outcome, p_http_status, p_state, p_api_property_id, left(p_detail, 2000))
  ON CONFLICT (op_id) DO NOTHING
  RETURNING op_id INTO v_done;
  RETURN CASE WHEN v_done IS NULL THEN 'already' ELSE 'recorded' END;
END $$;

CREATE OR REPLACE FUNCTION idealista_op_step(p_op_id uuid, p_step text, p_ok boolean, p_detail text)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO idealista_api_operation_steps (op_id, step, ok, detail) VALUES (p_op_id, p_step, p_ok, left(p_detail, 2000));
$$;

-- ── Lectura del registro ────────────────────────────────────────────────────
-- Resultado efectivo: sin resultado y con más de 10 min, «unknown».
-- ended_at: cuándo terminó (o se dio por terminada) la operación, para los solapes.
CREATE OR REPLACE FUNCTION idealista_ops_timeline(p_listing uuid, p_environment text)
RETURNS TABLE (seq bigint, op_id uuid, kind text, outcome text, http_status integer, response_state text,
               api_id bigint, begun_at timestamptz, ended_at timestamptz, recorded_at timestamptz,
               content_snapshot jsonb, media_manifest jsonb, images_ok boolean)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT o.seq, o.op_id, o.kind,
         coalesce(r.outcome, CASE WHEN o.begun_at < now() - interval '10 minutes' THEN 'unknown' ELSE 'pending' END),
         r.http_status, r.response_state, r.api_property_id_returned,
         o.begun_at,
         coalesce(r.recorded_at, o.begun_at + interval '10 minutes'),
         r.recorded_at,
         o.content_snapshot, o.media_manifest,
         (SELECT bool_and(s.ok) FROM idealista_api_operation_steps s WHERE s.op_id = o.op_id AND s.step = 'idealista_images')
    FROM idealista_api_operations o
    LEFT JOIN idealista_api_operation_results r ON r.op_id = o.op_id
   WHERE o.listing_id = p_listing AND o.environment = p_environment
$$;

-- ¿Hay un alta sin resolver? (sin resultado, unknown, o confirmada sin id) y
-- ninguna observación posterior con id la ha resuelto.
CREATE OR REPLACE FUNCTION idealista_create_unresolved(p_listing uuid, p_environment text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM idealista_ops_timeline(p_listing, p_environment) c
     WHERE c.kind = 'create'
       AND (c.outcome IN ('pending', 'unknown') OR (c.outcome = 'confirmed' AND c.api_id IS NULL))
       AND NOT EXISTS (
         SELECT 1 FROM idealista_ops_timeline(p_listing, p_environment) o
          WHERE o.seq > c.seq AND o.kind IN ('observe', 'observe_reconcile')
            AND o.outcome = 'confirmed' AND o.api_id IS NOT NULL))
$$;

-- Para el trigger de borrado de 0232: alta sin resolver en cualquier entorno,
-- o alta confirmada con id que no llegó a guardarse en la ficha.
CREATE OR REPLACE FUNCTION idealista_listing_create_unresolved(p_listing uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT idealista_create_unresolved(p_listing, 'production')
      OR idealista_create_unresolved(p_listing, 'sandbox')
      OR EXISTS (
        SELECT 1 FROM idealista_api_operations o
          JOIN idealista_api_operation_results r ON r.op_id = o.op_id
          JOIN idealista_listings l ON l.id = o.listing_id
         WHERE o.listing_id = p_listing AND o.kind = 'create' AND r.outcome = 'confirmed'
           AND r.api_property_id_returned IS NOT NULL AND l.api_property_id IS NULL)
$$;

-- ── Objetivo ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION idealista_crm_target(p_listing uuid, p_environment text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  r              record;
  v_running      text := 'none';
  v_last_mut     text := NULL;
  v_ev           text;
  v_dec          record;
  v_has_dec      boolean := false;
  v_latest       timestamptz;
  v_sync_at      timestamptz;
  v_state_active boolean;
BEGIN
  IF idealista_create_unresolved(p_listing, p_environment) THEN
    RETURN jsonb_build_object('state', 'uncertain_create', 'reason', 'create_without_id');
  END IF;

  FOR r IN SELECT * FROM idealista_ops_timeline(p_listing, p_environment) ORDER BY seq LOOP
    IF r.outcome = 'confirmed' THEN
      v_state_active := coalesce(r.response_state, 'active') IN ('active', 'pending');
      v_ev := CASE r.kind
        WHEN 'create'     THEN CASE WHEN r.api_id IS NOT NULL AND v_state_active THEN 'published' ELSE 'neutral' END
        WHEN 'update'     THEN CASE
                                 WHEN r.response_state IS NULL AND v_running = 'withdrawn' THEN 'neutral'
                                 WHEN v_state_active THEN 'published' ELSE 'neutral' END
        WHEN 'reactivate' THEN CASE WHEN v_state_active THEN 'published' ELSE 'neutral' END
        WHEN 'deactivate' THEN 'withdrawn'
        ELSE CASE  -- observe / observe_reconcile
               WHEN r.response_state IN ('active', 'pending') THEN 'published'
               WHEN r.response_state = 'inactive' AND v_last_mut = 'deactivate' THEN 'withdrawn'
               ELSE 'review' END
      END;
      IF v_ev <> 'neutral' THEN
        v_running := v_ev;
        v_dec := r;
        v_has_dec := true;
      END IF;
    END IF;
    IF r.kind NOT IN ('observe', 'observe_reconcile') AND r.outcome <> 'rejected' THEN
      v_last_mut := r.kind;
    END IF;
  END LOOP;

  -- Una operación posterior a la decisiva sin resultado → incierto.
  IF EXISTS (SELECT 1 FROM idealista_ops_timeline(p_listing, p_environment) t
              WHERE t.outcome IN ('pending', 'unknown') AND (NOT v_has_dec OR t.seq > v_dec.seq)) THEN
    RETURN jsonb_build_object('state', 'uncertain', 'reason', 'open_operation');
  END IF;

  IF NOT v_has_dec THEN
    RETURN jsonb_build_object('state', 'none');
  END IF;

  -- La decisiva se solapa en el tiempo con otra (no rechazada) → incierto.
  IF EXISTS (SELECT 1 FROM idealista_ops_timeline(p_listing, p_environment) t
              WHERE t.seq <> v_dec.seq AND t.outcome <> 'rejected'
                AND t.begun_at < v_dec.ended_at AND v_dec.begun_at < t.ended_at) THEN
    RETURN jsonb_build_object('state', 'uncertain', 'reason', 'overlap', 'seq', v_dec.seq);
  END IF;

  -- Alguien llamó a la API fuera del registro (build anterior, otra vía).
  SELECT max(coalesce(t.recorded_at, t.begun_at)) INTO v_latest FROM idealista_ops_timeline(p_listing, p_environment) t;
  SELECT api_last_sync_at INTO v_sync_at FROM idealista_listings WHERE id = p_listing;
  IF v_sync_at IS NOT NULL AND v_sync_at > v_latest + interval '30 seconds' THEN
    RETURN jsonb_build_object('state', 'uncertain', 'reason', 'external_change', 'seq', v_dec.seq);
  END IF;

  RETURN jsonb_build_object(
    'state', v_running, 'seq', v_dec.seq, 'op_id', v_dec.op_id, 'kind', v_dec.kind,
    'response_state', v_dec.response_state, 'api_id', v_dec.api_id,
    'content', v_dec.content_snapshot, 'manifest', v_dec.media_manifest,
    'images_ok', v_dec.images_ok);
END $$;

-- ── Utilidades ──────────────────────────────────────────────────────────────
-- Mismo criterio que normalizeSourceUrl de lib/imports/duplicates-core.ts:
-- host sin www + ruta sin barra final, en minúsculas; sin esquema, query ni #.
CREATE OR REPLACE FUNCTION idealista_crm_url_key(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(lower(regexp_replace(regexp_replace(regexp_replace(btrim(coalesce(p_url, '')),
    '^[a-z][a-z0-9+.-]*://(www\.)?', '', 'i'), '[?#].*$', ''), '/+$', '')), '')
$$;

CREATE OR REPLACE FUNCTION idealista_crm_smartlink_path(p_slug text, p_bc_reference text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '/compartir/' || CASE WHEN p_bc_reference IS NULL THEN p_slug
                               ELSE lower(replace(p_bc_reference, '-', '')) || '-' || p_slug END
$$;

CREATE OR REPLACE FUNCTION idealista_crm_sync_row(p_listing uuid, p_environment text)
RETURNS idealista_crm_sync
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  s idealista_crm_sync;
BEGIN
  INSERT INTO idealista_crm_sync (listing_id, environment) VALUES (p_listing, p_environment)
  ON CONFLICT (listing_id, environment) DO NOTHING;
  SELECT * INTO s FROM idealista_crm_sync WHERE listing_id = p_listing AND environment = p_environment FOR UPDATE;
  RETURN s;
END $$;

-- Clasificación (sección 5). Devuelve {kind, property_id, reason, candidates}.
-- kind: generated | existing | review | generate_new
CREATE OR REPLACE FUNCTION idealista_crm_classify(p_sync idealista_crm_sync)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  l       record;
  v_cands uuid[];
  v_agency uuid;
  v_found uuid;
BEGIN
  SELECT id, property_id, is_inspo, external_link INTO l FROM idealista_listings WHERE id = p_sync.listing_id;

  -- 1. Asociación registrada.
  IF p_sync.property_origin IS NOT NULL THEN
    IF p_sync.property_id IS NULL THEN
      RETURN jsonb_build_object('kind', 'review', 'reason', 'property_deleted');
    END IF;
    IF l.property_id IS NOT NULL AND l.property_id <> p_sync.property_id THEN
      RETURN jsonb_build_object('kind', 'review', 'reason', 'explicit_link_changed');
    END IF;
    RETURN jsonb_build_object('kind', p_sync.property_origin, 'property_id', p_sync.property_id);
  END IF;

  -- 1b. La asociación se perdió pero la procedencia sigue en la propia ficha generada.
  SELECT id INTO v_agency FROM agencies WHERE slug = 'bc-idealista-referencias';
  SELECT id INTO v_found FROM properties
   WHERE agency_id = v_agency AND external_id = 'idealista-api-' || p_sync.listing_id || '-' || p_sync.environment;
  IF v_found IS NOT NULL THEN
    RETURN jsonb_build_object('kind', 'generated', 'property_id', v_found, 'adopted', true);
  END IF;

  -- 2. Enlace explícito.
  IF l.property_id IS NOT NULL THEN
    RETURN jsonb_build_object('kind', 'existing', 'property_id', l.property_id);
  END IF;

  -- 3. Coincidencia por URL de origen → revisión (salvo que ya se haya decidido).
  IF p_sync.review_choice IS DISTINCT FROM 'generate' AND idealista_crm_url_key(l.external_link) IS NOT NULL THEN
    SELECT array_agg(p.id ORDER BY p.created_at) INTO v_cands
      FROM properties p
     WHERE NOT p.reference_only
       AND idealista_crm_url_key(p.source_url) = idealista_crm_url_key(l.external_link);
    IF v_cands IS NOT NULL THEN
      RETURN jsonb_build_object('kind', 'review', 'reason', 'source_url_match', 'candidates', to_jsonb(v_cands));
    END IF;
  END IF;

  -- 4. Generar.
  RETURN jsonb_build_object('kind', 'generate_new');
END $$;

-- ── Plan (lo llama la aplicación ANTES de copiar multimedia) ────────────────
-- Devuelve el objetivo y la clasificación, y reserva el id de la ficha que se
-- generará (para subir la multimedia bajo su carpeta antes de crearla).
CREATE OR REPLACE FUNCTION idealista_crm_plan(p_listing uuid, p_environment text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  s       idealista_crm_sync;
  v_t     jsonb;
  v_c     jsonb;
  v_pid   uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('idealista_crm:' || p_listing || ':' || p_environment, 0));
  s := idealista_crm_sync_row(p_listing, p_environment);
  v_t := idealista_crm_target(p_listing, p_environment);
  IF p_environment = 'sandbox' OR NOT idealista_crm_sync_enabled() OR (v_t->>'state') <> 'published' THEN
    RETURN jsonb_build_object('target', v_t, 'enabled', idealista_crm_sync_enabled(), 'applied_seq', s.applied_seq);
  END IF;
  v_c := idealista_crm_classify(s);
  IF v_c->>'kind' = 'generate_new' THEN
    IF s.planned_property_id IS NULL THEN
      UPDATE idealista_crm_sync SET planned_property_id = gen_random_uuid() WHERE id = s.id
        RETURNING planned_property_id INTO v_pid;
    ELSE
      v_pid := s.planned_property_id;
    END IF;
    v_c := v_c || jsonb_build_object('property_id', v_pid);
  END IF;
  RETURN jsonb_build_object('target', v_t, 'classification', v_c, 'enabled', true, 'applied_seq', s.applied_seq);
END $$;

-- ── Aplicar ─────────────────────────────────────────────────────────────────
-- p_new_property (solo fichas generadas): title, slug, description, operation,
--   price, bedrooms, bathrooms, square_meters, features, zone, address,
--   latitude, longitude, internal_notes.
-- p_media (solo generadas): {"mode": "replace"|"keep",
--   "photos": [{"path","url"}], "plans": [{"path","url","file_name"}],
--   "videos": [{"url","marker","file_name"}]}
CREATE OR REPLACE FUNCTION apply_idealista_crm_sync(
  p_listing uuid, p_environment text, p_expected_seq bigint, p_new_property jsonb, p_media jsonb, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  s         idealista_crm_sync;
  v_t       jsonb;
  v_c       jsonb;
  v_state   text;
  v_seq     bigint;
  v_pid     uuid;
  v_origin  text;
  v_tag     uuid;
  v_country text;
  v_agency  uuid;
  v_prop    record;
  v_had_tag boolean;
  v_note    text := NULL;
  v_n       integer;
  v_path    text;
  v_code    text;
  v_msg     text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('idealista_crm:' || p_listing || ':' || p_environment, 0));
  s := idealista_crm_sync_row(p_listing, p_environment);

  IF p_environment = 'sandbox' THEN
    UPDATE idealista_crm_sync SET status = 'sandbox', last_attempt_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('status', 'sandbox');
  END IF;
  IF NOT idealista_crm_sync_enabled() THEN
    UPDATE idealista_crm_sync SET status = 'disabled', last_attempt_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('status', 'disabled');
  END IF;

  v_t := idealista_crm_target(p_listing, p_environment);
  v_state := v_t->>'state';
  v_seq := (v_t->>'seq')::bigint;

  IF v_state IN ('uncertain', 'uncertain_create') THEN
    UPDATE idealista_crm_sync SET status = v_state, review_reason = v_t->>'reason', last_attempt_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('status', v_state, 'reason', v_t->>'reason');
  END IF;
  IF v_state = 'none' THEN
    UPDATE idealista_crm_sync SET last_attempt_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('status', s.status, 'reason', 'nothing_confirmed');
  END IF;
  IF p_expected_seq IS DISTINCT FROM v_seq THEN
    RETURN jsonb_build_object('status', 'moved', 'target', v_t);
  END IF;
  IF v_seq <= s.applied_seq THEN
    IF v_seq < s.applied_seq THEN
      UPDATE idealista_crm_sync SET last_attempt_at = now() WHERE id = s.id;
      RETURN jsonb_build_object('status', 'stale', 'applied_seq', s.applied_seq);
    END IF;
    -- Ya aplicado y el objetivo vuelve a ser cierto: se sale de «incierto».
    UPDATE idealista_crm_sync SET status = 'synced', review_reason = NULL, last_attempt_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('status', 'synced', 'property_id', s.property_id, 'smartlink_path', s.smartlink_path,
                              'reason', 'already_applied');
  END IF;
  IF v_state = 'review' THEN
    UPDATE idealista_crm_sync SET status = 'needs_review', review_reason = 'external_withdrawal_or_quality',
           last_attempt_at = now() WHERE id = s.id;
    RETURN jsonb_build_object('status', 'needs_review', 'reason', 'external_withdrawal_or_quality');
  END IF;

  BEGIN
    v_c := idealista_crm_classify(s);

    -- ── Baja ──
    IF v_state = 'withdrawn' THEN
      -- Solo se archiva lo que generó la sincronización (D4). Sin ficha generada
      -- (nunca se sincronizó, propiedad existente o borrada) no hay nada que archivar.
      IF v_c->>'kind' IN ('generate_new', 'review') THEN
        v_note := 'nothing_to_archive';
      ELSIF v_c->>'kind' = 'existing' THEN
        v_note := 'existing_untouched';
      ELSE
        SELECT * INTO v_prop FROM properties WHERE id = (v_c->>'property_id')::uuid FOR UPDATE;
        IF v_prop.archived_at IS NOT NULL OR v_prop.status = 'archived' THEN
          v_note := 'already_archived';
        ELSIF v_prop.status <> 'available' THEN
          UPDATE idealista_crm_sync SET status = 'needs_review', review_reason = 'manual_status',
                 last_attempt_at = now(), attempts = attempts + 1 WHERE id = s.id;
          RETURN jsonb_build_object('status', 'needs_review', 'reason', 'manual_status');
        ELSE
          UPDATE properties SET archived_at = now(), status = 'archived', archived_reason = 'idealista_api_withdrawn',
                 archived_auto_at = now(), updated_at = now()
           WHERE id = v_prop.id;
          v_note := 'archived';
        END IF;
      END IF;
      UPDATE idealista_crm_sync SET status = 'synced', applied_seq = v_seq, synced_at = now(), last_attempt_at = now(),
             last_error_code = NULL, last_error = NULL, review_reason = NULL,
             property_id = coalesce(property_id, CASE WHEN v_c->>'kind' IN ('generated', 'existing') THEN (v_c->>'property_id')::uuid END),
             property_origin = coalesce(property_origin, CASE WHEN v_c->>'kind' IN ('generated', 'existing') THEN v_c->>'kind' END)
       WHERE id = s.id;
      RETURN jsonb_build_object('status', 'synced', 'state', 'withdrawn', 'note', v_note,
                                'property_id', v_c->>'property_id');
    END IF;

    -- ── Publicado ──
    IF v_c->>'kind' = 'review' THEN
      UPDATE idealista_crm_sync SET status = 'needs_review', review_reason = v_c->>'reason',
             review_candidates = CASE WHEN v_c ? 'candidates'
                                      THEN ARRAY(SELECT jsonb_array_elements_text(v_c->'candidates'))::uuid[] END,
             last_attempt_at = now(), attempts = attempts + 1 WHERE id = s.id;
      RETURN jsonb_build_object('status', 'needs_review', 'reason', v_c->>'reason', 'candidates', v_c->'candidates');
    END IF;

    IF v_c->>'kind' = 'generate_new' THEN
      v_origin := 'generated';
      v_pid := s.planned_property_id;
      IF v_pid IS NULL OR p_new_property IS NULL THEN
        RAISE EXCEPTION 'plan_missing' USING ERRCODE = 'P0001';
      END IF;
      v_country := 'es';
    ELSE
      v_origin := v_c->>'kind';
      v_pid := (v_c->>'property_id')::uuid;
      SELECT country INTO v_country FROM properties WHERE id = v_pid;
    END IF;

    -- Etiqueta antes que nada: si falta, no se crea ni se cambia nada (D2).
    SELECT id INTO v_tag FROM property_tags
     WHERE country = v_country AND lower(btrim(name)) = 'reservado';
    IF v_tag IS NULL THEN
      RAISE EXCEPTION 'tag_missing' USING ERRCODE = 'P0001';
    END IF;

    IF v_c->>'kind' = 'generate_new' THEN
      SELECT id INTO v_agency FROM agencies WHERE slug = 'bc-idealista-referencias';
      IF v_agency IS NULL THEN
        RAISE EXCEPTION 'agency_missing' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO properties (id, agency_id, source, external_id, reference_only, slug, title, description,
                              operation, status, price, bedrooms, bathrooms, square_meters, features, zone,
                              address, latitude, longitude, internal_notes, country,
                              published_web, new_listing_alerts_suppressed)
      VALUES (v_pid, v_agency, 'api', 'idealista-api-' || p_listing || '-' || p_environment, true,
              p_new_property->>'slug', p_new_property->>'title', p_new_property->>'description',
              (p_new_property->>'operation')::property_operation, 'available',
              coalesce((p_new_property->>'price')::numeric, 0),
              coalesce((p_new_property->>'bedrooms')::int, 0), coalesce((p_new_property->>'bathrooms')::int, 0),
              (p_new_property->>'square_meters')::int,
              coalesce(ARRAY(SELECT jsonb_array_elements_text(p_new_property->'features')), '{}'),
              coalesce(p_new_property->>'zone', 'Madrid'), p_new_property->>'address',
              (p_new_property->>'latitude')::double precision, (p_new_property->>'longitude')::double precision,
              p_new_property->>'internal_notes', 'es', false, true);
    ELSIF v_origin = 'generated' THEN
      SELECT * INTO v_prop FROM properties WHERE id = v_pid FOR UPDATE;
      IF p_new_property IS NOT NULL THEN
        UPDATE properties SET
          title = coalesce(p_new_property->>'title', title),
          description = p_new_property->>'description',
          operation = coalesce((p_new_property->>'operation')::property_operation, operation),
          price = coalesce((p_new_property->>'price')::numeric, price),
          bedrooms = coalesce((p_new_property->>'bedrooms')::int, bedrooms),
          bathrooms = coalesce((p_new_property->>'bathrooms')::int, bathrooms),
          square_meters = (p_new_property->>'square_meters')::int,
          features = coalesce(ARRAY(SELECT jsonb_array_elements_text(p_new_property->'features')), features),
          zone = coalesce(p_new_property->>'zone', zone),
          address = p_new_property->>'address',
          latitude = (p_new_property->>'latitude')::double precision,
          longitude = (p_new_property->>'longitude')::double precision,
          updated_at = now()
         WHERE id = v_pid;
      END IF;
      -- Reactivar: desarchivar SOLO lo que archivó la sincronización (C4).
      IF v_prop.archived_reason = 'idealista_api_withdrawn' THEN
        UPDATE properties SET archived_at = NULL, archived_auto_at = NULL, archived_reason = NULL,
               status = 'available', updated_at = now()
         WHERE id = v_pid;
        v_note := 'unarchived';
      ELSIF v_prop.archived_at IS NOT NULL OR v_prop.status = 'archived' THEN
        v_note := 'archived_by_someone_else';
      END IF;
    END IF;
    -- Las existentes: no se toca ningún campo (I4).

    -- Etiqueta en cada publicación confirmada (D16).
    SELECT EXISTS (SELECT 1 FROM property_tag_links WHERE property_id = v_pid AND tag_id = v_tag) INTO v_had_tag;
    INSERT INTO property_tag_links (property_id, tag_id) VALUES (v_pid, v_tag) ON CONFLICT DO NOTHING;

    -- Multimedia de las generadas.
    IF v_origin = 'generated' AND p_media IS NOT NULL AND p_media->>'mode' = 'replace' THEN
      -- Todo lo que se va a referenciar tiene que existir y no estar borrado.
      IF EXISTS (
        SELECT 1 FROM (
          SELECT x->>'path' AS path FROM jsonb_array_elements(coalesce(p_media->'photos', '[]')) x
          UNION ALL
          SELECT x->>'path' FROM jsonb_array_elements(coalesce(p_media->'plans', '[]')) x) w
        LEFT JOIN idealista_crm_media_objects m ON m.storage_path = w.path AND m.property_id = v_pid AND m.deleted_at IS NULL
        WHERE m.storage_path IS NULL) THEN
        RAISE EXCEPTION 'media_missing' USING ERRCODE = 'P0001';
      END IF;

      DELETE FROM property_photos WHERE property_id = v_pid AND sync_path IS NOT NULL;
      INSERT INTO property_photos (property_id, url, position, is_cover, sync_path)
      SELECT v_pid, d.url, d.pos - 1, d.pos = 1, d.path
        FROM (SELECT DISTINCT ON (x->>'path') x->>'path' AS path, x->>'url' AS url, ord AS pos
                FROM jsonb_array_elements(coalesce(p_media->'photos', '[]')) WITH ORDINALITY AS t(x, ord)
               ORDER BY x->>'path', ord) d;
      -- Renumerar: primero las gestionadas en su orden, detrás las del personal.
      SELECT count(*) INTO v_n FROM property_photos WHERE property_id = v_pid AND sync_path IS NOT NULL;
      WITH ordered AS (
        SELECT id, row_number() OVER (ORDER BY (sync_path IS NULL), position, id) - 1 AS np
          FROM property_photos WHERE property_id = v_pid)
      UPDATE property_photos ph SET position = o.np, is_cover = (o.np = 0)
        FROM ordered o WHERE ph.id = o.id;
      UPDATE properties SET cover_photo_url = (SELECT url FROM property_photos WHERE property_id = v_pid ORDER BY position LIMIT 1)
       WHERE id = v_pid;

      DELETE FROM property_media WHERE property_id = v_pid AND sync_path IS NOT NULL;
      INSERT INTO property_media (property_id, type, file_name, storage_path, url, source, position, sync_path)
      SELECT v_pid, 'plan', coalesce(d.file_name, 'plano-' || d.pos || '.jpg'), d.path, d.url, 'idealista_ref', d.pos - 1, d.path
        FROM (SELECT DISTINCT ON (x->>'path') x->>'path' AS path, x->>'url' AS url, x->>'file_name' AS file_name, ord AS pos
                FROM jsonb_array_elements(coalesce(p_media->'plans', '[]')) WITH ORDINALITY AS t(x, ord)
               ORDER BY x->>'path', ord) d;
      INSERT INTO property_media (property_id, type, file_name, storage_path, url, source, position, sync_path)
      SELECT v_pid, 'video', coalesce(d.file_name, 'video-' || d.pos), d.marker, d.url, 'idealista_ref', d.pos - 1, d.marker
        FROM (SELECT DISTINCT ON (x->>'marker') x->>'marker' AS marker, x->>'url' AS url, x->>'file_name' AS file_name, ord AS pos
                FROM jsonb_array_elements(coalesce(p_media->'videos', '[]')) WITH ORDINALITY AS t(x, ord)
               ORDER BY x->>'marker', ord) d;
    END IF;

    SELECT slug, bc_reference INTO v_prop FROM properties WHERE id = v_pid;
    UPDATE idealista_crm_sync SET
      property_id = coalesce(property_id, v_pid),
      property_origin = coalesce(property_origin, v_origin),
      origin_decided_by = coalesce(origin_decided_by, p_actor),
      origin_decided_at = coalesce(origin_decided_at, now()),
      tag_id = v_tag,
      tag_already_present = coalesce(tag_already_present, v_had_tag),
      smartlink_path = CASE WHEN v_origin = 'generated' THEN idealista_crm_smartlink_path(v_prop.slug, v_prop.bc_reference)
                            ELSE smartlink_path END,
      applied_seq = v_seq, status = 'synced', synced_at = now(), last_attempt_at = now(),
      last_error_code = NULL, last_error = NULL, review_reason = NULL, review_candidates = NULL
     WHERE id = s.id;

    RETURN jsonb_build_object('status', 'synced', 'state', 'published', 'origin', v_origin, 'property_id', v_pid,
      'smartlink_path', CASE WHEN v_origin = 'generated' THEN idealista_crm_smartlink_path(v_prop.slug, v_prop.bc_reference) END,
      'note', v_note);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = MESSAGE_TEXT, v_msg = PG_EXCEPTION_DETAIL;
    UPDATE idealista_crm_sync SET status = 'failed', last_error_code = left(v_code, 200),
           last_error = left(coalesce(nullif(v_msg, ''), v_code), 2000),
           attempts = attempts + 1, last_attempt_at = now()
     WHERE id = s.id;
    RETURN jsonb_build_object('status', 'failed', 'error_code', v_code, 'error', v_msg);
  END;
END $$;

-- ── Revisión ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION idealista_crm_resolve_review(
  p_listing uuid, p_environment text, p_choice text, p_property uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  s idealista_crm_sync;
  l record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('idealista_crm:' || p_listing || ':' || p_environment, 0));
  s := idealista_crm_sync_row(p_listing, p_environment);
  IF s.property_origin IS NOT NULL OR s.review_choice IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_decided');
  END IF;
  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'actor_required');
  END IF;
  IF p_choice = 'generate' THEN
    UPDATE idealista_crm_sync SET review_choice = 'generate', origin_decided_by = p_actor, origin_decided_at = now(),
           status = 'pending', review_reason = NULL, review_candidates = NULL WHERE id = s.id;
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF p_choice <> 'use_existing' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_choice');
  END IF;
  SELECT external_link INTO l FROM idealista_listings WHERE id = p_listing;
  IF NOT EXISTS (SELECT 1 FROM properties p WHERE p.id = p_property AND NOT p.reference_only
                    AND idealista_crm_url_key(p.source_url) = idealista_crm_url_key(l.external_link)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_candidate');
  END IF;
  UPDATE idealista_crm_sync SET review_choice = 'use_existing', property_id = p_property, property_origin = 'existing',
         origin_decided_by = p_actor, origin_decided_at = now(), status = 'pending',
         review_reason = NULL, review_candidates = NULL
   WHERE id = s.id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Bloqueo de altas y recuperación del id (sección 3) ──────────────────────
CREATE OR REPLACE FUNCTION idealista_create_guard(p_listing uuid, p_environment text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN idealista_create_unresolved(p_listing, p_environment)
      THEN jsonb_build_object('allowed', false, 'reason', 'uncertain_create')
    WHEN EXISTS (SELECT 1 FROM idealista_ops_timeline(p_listing, p_environment) t
                   JOIN idealista_listings l ON l.id = p_listing
                  WHERE t.kind = 'create' AND t.outcome = 'confirmed' AND t.api_id IS NOT NULL AND l.api_property_id IS NULL)
      THEN jsonb_build_object('allowed', false, 'reason', 'recover_id')
    ELSE jsonb_build_object('allowed', true)
  END
$$;

CREATE OR REPLACE FUNCTION idealista_recover_api_property_id(p_listing uuid, p_environment text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('idealista_crm:' || p_listing || ':' || p_environment, 0));
  SELECT t.api_id INTO v_id FROM idealista_ops_timeline(p_listing, p_environment) t
   WHERE t.kind = 'create' AND t.outcome = 'confirmed' AND t.api_id IS NOT NULL
   ORDER BY t.seq DESC LIMIT 1;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_confirmed_create');
  END IF;
  IF EXISTS (SELECT 1 FROM idealista_listings WHERE api_property_id = v_id AND id <> p_listing) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'id_taken');
  END IF;
  UPDATE idealista_listings SET api_property_id = v_id WHERE id = p_listing AND api_property_id IS NULL;
  RETURN jsonb_build_object('ok', true, 'api_property_id', v_id);
END $$;

-- ── Multimedia: registro, búsqueda y limpieza ───────────────────────────────
CREATE OR REPLACE FUNCTION idealista_crm_media_stage(
  p_property uuid, p_path text, p_kind text, p_sha256 text, p_bytes bigint, p_mime text, p_seq bigint, p_source_sha text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_deleted timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('idealista_crm_media:' || p_property, 0));
  IF p_path NOT LIKE p_property || '/idealista-ref/%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_path');
  END IF;
  INSERT INTO idealista_crm_media_objects (storage_path, property_id, kind, sha256, bytes, mime, staged_by_seq)
  VALUES (p_path, p_property, p_kind, p_sha256, p_bytes, p_mime, p_seq)
  ON CONFLICT (storage_path) DO NOTHING;
  SELECT deleted_at INTO v_deleted FROM idealista_crm_media_objects WHERE storage_path = p_path;
  IF v_deleted IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'path_deleted');
  END IF;
  IF p_source_sha IS NOT NULL THEN
    INSERT INTO idealista_crm_media_sources (property_id, source_sha, storage_path)
    VALUES (p_property, p_source_sha, p_path)
    ON CONFLICT (property_id, source_sha) DO UPDATE SET storage_path = EXCLUDED.storage_path, fetched_at = now();
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Lo ya descargado para esta propiedad: origen → objeto vivo.
CREATE OR REPLACE FUNCTION idealista_crm_media_lookup(p_property uuid, p_source_shas text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(s.source_sha, jsonb_build_object('path', m.storage_path, 'sha256', m.sha256, 'mime', m.mime)), '{}')
    FROM idealista_crm_media_sources s
    JOIN idealista_crm_media_objects m ON m.storage_path = s.storage_path AND m.deleted_at IS NULL
   WHERE s.property_id = p_property AND s.source_sha = ANY (p_source_shas)
$$;

-- Marca como borrados (y devuelve) los objetos que se pueden quitar del
-- almacenamiento: ninguna fila los usa, llevan >= p_grace subidos y los subió
-- una operación ya aplicada o anterior. La aplicación borra el archivo DESPUÉS.
CREATE OR REPLACE FUNCTION idealista_crm_media_collect(p_property uuid, p_grace interval)
RETURNS text[]
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_applied bigint;
  v_paths   text[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('idealista_crm_media:' || p_property, 0));
  SELECT coalesce(max(applied_seq), 0) INTO v_applied FROM idealista_crm_sync
   WHERE property_id = p_property OR planned_property_id = p_property;
  WITH gone AS (
    UPDATE idealista_crm_media_objects m SET deleted_at = now()
     WHERE m.property_id = p_property AND m.deleted_at IS NULL
       AND m.staged_at < clock_timestamp() - p_grace
       AND m.staged_by_seq <= v_applied
       AND NOT EXISTS (SELECT 1 FROM property_photos ph WHERE ph.property_id = p_property AND ph.sync_path = m.storage_path)
       AND NOT EXISTS (SELECT 1 FROM property_media pm WHERE pm.property_id = p_property AND pm.sync_path = m.storage_path)
    RETURNING m.storage_path)
  SELECT array_agg(storage_path) INTO v_paths FROM gone;
  RETURN coalesce(v_paths, '{}');
END $$;

-- ── Permisos: solo service_role ─────────────────────────────────────────────
ALTER TABLE idealista_api_operations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_api_operation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_api_operation_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_crm_sync              ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_crm_media_objects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_crm_media_sources     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON idealista_api_operations, idealista_api_operation_results, idealista_api_operation_steps,
              idealista_crm_sync, idealista_crm_media_objects, idealista_crm_media_sources
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE idealista_ops_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON idealista_api_operations, idealista_api_operation_results, idealista_api_operation_steps TO service_role;
GRANT SELECT, INSERT, UPDATE ON idealista_crm_sync, idealista_crm_media_objects, idealista_crm_media_sources TO service_role;
GRANT USAGE ON SEQUENCE idealista_ops_seq TO service_role;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'idealista_crm_sync_enabled()',
    'idealista_op_begin(uuid, uuid, text, text, bigint, text, jsonb, jsonb, uuid)',
    'idealista_op_finish(uuid, text, integer, text, bigint, text)',
    'idealista_op_step(uuid, text, boolean, text)',
    'idealista_ops_timeline(uuid, text)',
    'idealista_create_unresolved(uuid, text)',
    'idealista_listing_create_unresolved(uuid)',
    'idealista_crm_target(uuid, text)',
    'idealista_crm_url_key(text)',
    'idealista_crm_smartlink_path(text, text)',
    'idealista_crm_sync_row(uuid, text)',
    'idealista_crm_classify(idealista_crm_sync)',
    'idealista_crm_plan(uuid, text)',
    'apply_idealista_crm_sync(uuid, text, bigint, jsonb, jsonb, uuid)',
    'idealista_crm_resolve_review(uuid, text, text, uuid, uuid)',
    'idealista_create_guard(uuid, text)',
    'idealista_recover_api_property_id(uuid, text)',
    'idealista_crm_media_stage(uuid, text, text, text, bigint, text, bigint, text)',
    'idealista_crm_media_lookup(uuid, text[])',
    'idealista_crm_media_collect(uuid, interval)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;
