-- ============================================================================
-- 0236 · Idealista API → CRM: «No se pudo preparar la sincronización» cuando
-- el registro de un anuncio no tiene ninguna operación decisiva.
-- Expediente: docs/changes/2026-10-30-idealista-crm-target-sin-decisiva/.
--
-- idealista_crm_target (0233) leía v_dec.seq en la comprobación de
-- «operación abierta» aunque no hubiera habido aún ninguna operación decisiva.
-- plpgsql no deja leer un campo de un record sin asignar («record "v_dec" is
-- not assigned yet»): `NOT v_has_dec OR …` no lo evita, porque la expresión se
-- prepara entera. Pasaba, por ejemplo, al «Actualizar por API» un anuncio que
-- ya estaba dado de baja (la modificación confirmada con estado inactive no es
-- decisiva) o con un registro hecho solo de rechazos y comprobaciones.
-- Resultado: idealista_crm_plan fallaba y el panel mostraba el aviso local.
--
-- Solo cambia esa comprobación: guarda el seq de la decisiva en v_dec_seq
-- (bigint, NULL mientras no la hay). El resto del cuerpo es el de 0233, sin
-- tocar. CREATE OR REPLACE conserva los permisos (solo service_role).
-- No toca datos. Idempotente. Transacción propia.
-- Reversión: docs/changes/2026-10-30-idealista-crm-target-sin-decisiva/rollback-0236.sql.
-- ============================================================================
BEGIN;

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
  v_dec_seq      bigint;   -- copia de v_dec.seq: v_dec no existe hasta la primera decisiva
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
        v_dec_seq := r.seq;
      END IF;
    END IF;
    IF r.kind NOT IN ('observe', 'observe_reconcile') AND r.outcome <> 'rejected' THEN
      v_last_mut := r.kind;
    END IF;
  END LOOP;

  -- Una operación posterior a la decisiva sin resultado → incierto.
  -- (Una lectura —observe— que falla no cambia nada en Idealista: no cuenta.)
  IF EXISTS (SELECT 1 FROM idealista_ops_timeline(p_listing, p_environment) t
              WHERE t.outcome IN ('pending', 'unknown') AND t.kind NOT IN ('observe', 'observe_reconcile')
                AND (v_dec_seq IS NULL OR t.seq > v_dec_seq)) THEN
    RETURN jsonb_build_object('state', 'uncertain', 'reason', 'open_operation');
  END IF;

  IF NOT v_has_dec THEN
    RETURN jsonb_build_object('state', 'none');
  END IF;

  -- La decisiva se solapa en el tiempo con otra (no rechazada) → incierto.
  IF EXISTS (SELECT 1 FROM idealista_ops_timeline(p_listing, p_environment) t
              WHERE t.seq <> v_dec.seq AND t.outcome <> 'rejected'
                AND NOT (t.kind IN ('observe', 'observe_reconcile') AND t.outcome <> 'confirmed')
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

COMMIT;
