-- ============================================================================
-- 0228 · BCP-01: traducción AUTOMÁTICA del catálogo, como en los itinerarios.
--
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--   (spec.md DA12/DA14/DA16 sustituidas por decisión de Fabricio del
--   22-10-2026; plan.md «Traducción automática, como en itinerarios»).
--
-- Reutiliza TODO lo de 0226 (fuentes, bloques por clave, copias por catálogo
-- con la huella del español, reserva única por fuente e idioma con caducidad,
-- descartes). Lo que cambia:
--   · catalog_tr_texts.approval / catalog_tr_features.approval: cómo se
--     publicó una traducción aprobada: 'auto' (pasó sola los filtros
--     deterministas) o 'manual' (la guardó o la dio por buena el dueño). Lo
--     aprobado antes de 0228 queda 'manual'.
--   · catalog_tr_jobs.auto: el trabajo lo lanzó una visita (no el dueño).
--   · catalog_tr_reserve_auto: la reserva de 0226 con los LÍMITES contra el
--     abuso y el coste: como mucho N trabajos a la vez por catálogo (cerrojo
--     por catálogo), un tope de trabajos automáticos por catálogo y día, y
--     ESPERA CRECIENTE tras un trabajo fallido, incierto o caducado (5 min,
--     30 min, 2 h, 12 h por defecto) hasta dejar de reintentar solo tras N
--     fallos seguidos. Un trabajo terminado reinicia la cuenta. El dueño
--     («Preparar ahora», p_limits.manual) no espera ni cuenta en el tope.
--   · catalog_tr_publish: catalog_tr_approve (0226) + cómo se aprobó. Una
--     edición a mano ('manual' en origin) nunca queda como automática.
--   · catalog_tr_mark_reviewed: el dueño da por buena una automática.
--   · catalog_tr_activate: elegir el idioma de un catálogo o de un enlace se
--     aplica AL MOMENTO (ya no exige que esté completo). Lo que falta se ve
--     con el aviso N5 hasta que se traduce.
--
-- La IA NUNCA está en SQL. Ninguna lectura pública escribe aquí: la gestión
-- en segundo plano (lib/catalogs/auto-translate.ts) reserva con el dueño del
-- catálogo como actor, igual que las acciones del gestor.
-- No escribe en properties ni en property_client_descriptions.
-- Permisos (E1): RLS sin políticas, REVOKE a public/anon/authenticated y
-- EXECUTE solo a service_role.
-- Idempotente. Una sola transacción. No cambia ninguna instantánea ni huella.
-- Reversión: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/rollback-0228.sql
-- ============================================================================

BEGIN;

-- ── Columnas ────────────────────────────────────────────────────────────────

ALTER TABLE catalog_tr_texts ADD COLUMN IF NOT EXISTS approval text;
ALTER TABLE catalog_tr_features ADD COLUMN IF NOT EXISTS approval text;
ALTER TABLE catalog_tr_jobs ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_tr_texts_approval_mode') THEN
    ALTER TABLE catalog_tr_texts ADD CONSTRAINT catalog_tr_texts_approval_mode CHECK (approval IS NULL OR approval IN ('auto', 'manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_tr_features_approval_mode') THEN
    ALTER TABLE catalog_tr_features ADD CONSTRAINT catalog_tr_features_approval_mode CHECK (approval IS NULL OR approval IN ('auto', 'manual'));
  END IF;
END
$$;

-- Lo aprobado antes de 0228 lo aprobó el dueño a mano.
UPDATE catalog_tr_texts SET approval = 'manual' WHERE status = 'approved' AND approval IS NULL;
UPDATE catalog_tr_features SET approval = 'manual' WHERE status = 'approved' AND approval IS NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_tr_jobs_catalog_recent ON catalog_tr_jobs (catalog_id, reserved_at DESC);

-- ── Reserva con límites (visitas y «Preparar ahora») ────────────────────────

-- p_limits: {manual: bool, max_active: int, daily_cap: int, max_failures: int,
--            waits: [segundos…]}. Devuelve lo mismo que catalog_tr_reserve
-- ('reserved' | 'busy' | 'ready') o, antes de reservar:
--   {state: 'limit'}                       → ya hay max_active trabajos de este catálogo;
--   {state: 'cap'}                         → tope de trabajos automáticos del día;
--   {state: 'waiting', until, failures}    → espera creciente tras un fallo;
--   {state: 'stopped', failures}           → demasiados fallos seguidos: solo el dueño.
CREATE OR REPLACE FUNCTION catalog_tr_reserve_auto(p_actor uuid, p_source uuid, p_lang text, p_catalog uuid, p_property uuid,
                                                   p_needs jsonb, p_ttl_seconds integer, p_limits jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_manual boolean := coalesce((p_limits->>'manual')::boolean, false);
  v_max    integer := coalesce((p_limits->>'max_active')::integer, 2);
  v_cap    integer := coalesce((p_limits->>'daily_cap')::integer, 300);
  v_maxf   integer := coalesce((p_limits->>'max_failures')::integer, 5);
  v_waits  integer[];
  v_fail   integer;
  v_last   timestamptz;
  v_until  timestamptz;
  v_job    catalog_tr_jobs;
  v_r      jsonb;
BEGIN
  IF p_catalog IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF NOT catalog_tr_lang_ok(p_lang) THEN RAISE EXCEPTION 'invalid_lang'; END IF;
  SELECT array_agg(x::integer ORDER BY o) INTO v_waits
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_limits->'waits') = 'array' THEN p_limits->'waits' ELSE '[]'::jsonb END) WITH ORDINALITY AS a(x, o);
  v_waits := coalesce(v_waits, ARRAY[300, 1800, 7200, 43200]);
  IF v_max < 1 OR v_max > 10 OR v_cap < 1 OR v_cap > 5000 OR v_maxf < 1 OR v_maxf > 20
     OR array_length(v_waits, 1) IS NULL OR EXISTS (SELECT 1 FROM unnest(v_waits) w WHERE w IS NULL OR w < 60 OR w > 604800) THEN
    RAISE EXCEPTION 'invalid_limits';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM catalog_tr_sources WHERE id = p_source AND owner_id = p_actor) THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;

  -- Un cerrojo por catálogo: contar y reservar sin que otra visita se cuele.
  PERFORM pg_advisory_xact_lock(hashtextextended('catalog_tr_auto:' || p_catalog::text, 0));
  -- (la hora del fallo es la de la caducidad, no la de esta visita)
  UPDATE catalog_tr_jobs
     SET status = 'expired', finished_at = expires_at, note = concat_ws(' · ', note, 'reserva caducada sin resultado')
   WHERE (catalog_id = p_catalog OR (source_id = p_source AND lang = p_lang)) AND status = 'reserved' AND expires_at <= now();

  SELECT * INTO v_job FROM catalog_tr_jobs
   WHERE source_id = p_source AND lang = p_lang AND status = 'reserved' AND expires_at > now() LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('state', 'busy', 'job', v_job.id, 'expires_at', v_job.expires_at);
  END IF;

  IF NOT v_manual THEN
    -- Fallos seguidos (fallido, incierto o caducado) desde el último terminado.
    SELECT count(*), max(coalesce(j.finished_at, j.expires_at)) INTO v_fail, v_last
      FROM catalog_tr_jobs j
     WHERE j.source_id = p_source AND j.lang = p_lang AND j.status IN ('failed', 'uncertain', 'expired')
       AND j.reserved_at > coalesce((SELECT max(d.reserved_at) FROM catalog_tr_jobs d
                                      WHERE d.source_id = p_source AND d.lang = p_lang AND d.status = 'done'), '-infinity'::timestamptz);
    IF v_fail >= v_maxf THEN
      RETURN jsonb_build_object('state', 'stopped', 'failures', v_fail);
    END IF;
    IF v_fail > 0 THEN
      v_until := v_last + make_interval(secs => v_waits[least(v_fail, array_length(v_waits, 1))]);
      IF v_until > now() THEN
        RETURN jsonb_build_object('state', 'waiting', 'until', v_until, 'failures', v_fail);
      END IF;
    END IF;
  END IF;

  IF (SELECT count(*) FROM catalog_tr_jobs WHERE catalog_id = p_catalog AND status = 'reserved' AND expires_at > now()) >= v_max THEN
    RETURN jsonb_build_object('state', 'limit');
  END IF;
  IF NOT v_manual AND (SELECT count(*) FROM catalog_tr_jobs
                        WHERE catalog_id = p_catalog AND auto AND reserved_at > now() - interval '24 hours') >= v_cap THEN
    RETURN jsonb_build_object('state', 'cap');
  END IF;

  -- La reserva de siempre (0226). La espera creciente sustituye al «incierto
  -- sin reintento» para las visitas; el dueño reintenta cuando quiere.
  v_r := catalog_tr_reserve(p_actor, p_source, p_lang, p_catalog, p_property, p_needs, p_ttl_seconds, true);
  IF v_r->>'state' = 'reserved' AND NOT v_manual THEN
    UPDATE catalog_tr_jobs SET auto = true WHERE id = (v_r->>'job')::uuid;
  END IF;
  RETURN v_r;
END
$$;

-- ── Publicar (aprobar + copiar) diciendo cómo ───────────────────────────────

-- catalog_tr_approve (0226: revisión vista, bloqueos de contacto y precio,
-- copia con la huella del español de hoy) y además `approval`:
--   'auto'   → lo que pasa a aprobado ahora queda 'auto', salvo lo escrito a
--              mano (origin 'manual'), que queda 'manual';
--   'manual' → todo lo publicado queda 'manual' (el dueño lo ha visto).
CREATE OR REPLACE FUNCTION catalog_tr_publish(p_actor uuid, p_catalog uuid, p_property uuid, p_lang text, p_es_sig text, p_parts jsonb, p_mode text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_text    uuid := nullif(p_parts->'text'->>'id', '')::uuid;
  v_area    uuid := nullif(p_parts->'area'->>'id', '')::uuid;
  v_feats   text[];
  v_before  jsonb;
  v_version bigint;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('auto', 'manual') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  SELECT coalesce(array_agg(e->>'es'), '{}') INTO v_feats
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_parts->'features') = 'array' THEN p_parts->'features' ELSE '[]'::jsonb END) e;
  -- Estado de cada parte ANTES de aprobar (solo lo que pase a aprobado es nuevo).
  SELECT coalesce(jsonb_object_agg(id::text, status), '{}'::jsonb) INTO v_before
    FROM catalog_tr_texts WHERE id IN (v_text, v_area);
  v_version := catalog_tr_approve(p_actor, p_catalog, p_property, p_lang, p_es_sig, p_parts);
  UPDATE catalog_tr_texts t
     SET approval = CASE WHEN p_mode = 'manual' OR t.origin = 'manual' THEN 'manual' ELSE 'auto' END
   WHERE t.id IN (v_text, v_area)
     AND (p_mode = 'manual' OR t.approval IS NULL OR (v_before->>t.id::text) IS DISTINCT FROM 'approved');
  UPDATE catalog_tr_features f
     SET approval = CASE WHEN p_mode = 'manual' OR f.origin = 'manual' THEN 'manual' ELSE 'auto' END
   WHERE f.owner_id = p_actor AND f.lang = p_lang AND f.es = ANY (v_feats);
  RETURN v_version;
END
$$;

-- El dueño da por buenas unas traducciones publicadas solas (quita «Revisar»).
CREATE OR REPLACE FUNCTION catalog_tr_mark_reviewed(p_actor uuid, p_catalog uuid, p_lang text, p_texts uuid[], p_features text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_n integer;
  v_m integer;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF NOT catalog_tr_lang_ok(p_lang) THEN RAISE EXCEPTION 'invalid_lang'; END IF;
  UPDATE catalog_tr_texts t SET approval = 'manual', updated_at = now()
    FROM catalog_tr_sources s
   WHERE s.id = t.source_id AND s.owner_id = p_actor AND t.lang = p_lang
     AND t.id = ANY (coalesce(p_texts, '{}')) AND t.status = 'approved' AND t.approval = 'auto';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE catalog_tr_features SET approval = 'manual', updated_at = now()
   WHERE owner_id = p_actor AND lang = p_lang AND es = ANY (coalesce(p_features, '{}')) AND status = 'approved' AND approval = 'auto';
  GET DIAGNOSTICS v_m = ROW_COUNT;
  RETURN v_n + v_m;
END
$$;

-- ── Idioma del catálogo o de un enlace: al momento ──────────────────────────

-- Misma firma que en 0226. Cambia el idioma del catálogo (p_link NULL) o de
-- un enlace personal (NULL en p_lang = el del catálogo) SIN exigir que esté
-- completo: lo que no tenga traducción vigente se ve con el aviso N5 y se
-- traduce en segundo plano en la primera visita. p_expected_version y
-- p_required se aceptan por compatibilidad y ya no se usan.
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

-- ── Permisos ────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_tr_reserve_auto(uuid, uuid, text, uuid, uuid, jsonb, integer, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_publish(uuid, uuid, uuid, text, text, jsonb, text)                FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_mark_reviewed(uuid, uuid, text, uuid[], text[])                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_tr_activate(uuid, uuid, uuid, text, bigint, jsonb)                   FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_tr_reserve_auto(uuid, uuid, text, uuid, uuid, jsonb, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_publish(uuid, uuid, uuid, text, text, jsonb, text)                TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_mark_reviewed(uuid, uuid, text, uuid[], text[])                   TO service_role;
GRANT EXECUTE ON FUNCTION catalog_tr_activate(uuid, uuid, uuid, text, bigint, jsonb)                   TO service_role;

COMMIT;
