-- Reversión de 0236: vuelve a poner idealista_crm_target tal como la dejó 0233.
-- OJO: reintroduce el fallo («record "v_dec" is not assigned yet» en la primera
-- llamada de una sesión sobre un anuncio sin operación decisiva). Solo tiene
-- sentido si 0236 causara algo peor. No toca datos; los permisos se conservan.
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
  -- (Una lectura —observe— que falla no cambia nada en Idealista: no cuenta.)
  IF EXISTS (SELECT 1 FROM idealista_ops_timeline(p_listing, p_environment) t
              WHERE t.outcome IN ('pending', 'unknown') AND t.kind NOT IN ('observe', 'observe_reconcile')
                AND (NOT v_has_dec OR t.seq > v_dec.seq)) THEN
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
