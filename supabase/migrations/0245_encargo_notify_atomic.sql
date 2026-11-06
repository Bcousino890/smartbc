-- ============================================================================
-- 0245 — Aviso de encargos atómico (claim + notificación en UNA transacción)
-- ============================================================================
-- Problema: marcar `encargo_matches.notified_at` y crear el aviso en `crm_notifications` eran dos
-- escrituras separadas; si la segunda fallaba (caída, reinicio de PM2) la fila quedaba «avisada» sin
-- aviso y no se reintentaba nunca. Esta función hace las dos cosas o ninguna:
--   · reclama (UPDATE … WHERE notified_at IS NULL) las filas indicadas y cuenta las reclamadas;
--   · SOLO si reclamó alguna y hay destinatarios, inserta un aviso `encargo_match` por destinatario;
--   · sin destinatarios (o sin ids) no reclama NADA y devuelve 0;
--   · cualquier error (p. ej. un destinatario inexistente) deshace también el reclamo.
-- Solo service_role puede ejecutarla (mismo patrón que 0244).
-- Además: `encargo_matches.reasons` (jsonb, nula) guarda los motivos del encaje para que el aviso de
-- un reintento conserve la línea «Encaja: …».
-- Aditiva e idempotente. Reversión: docs/changes/2026-11-06-encargos-matching/rollback-0245.sql
-- ============================================================================

ALTER TABLE encargo_matches ADD COLUMN IF NOT EXISTS reasons jsonb;

CREATE OR REPLACE FUNCTION public.claim_and_notify_encargo_matches(
  p_match_ids uuid[],
  p_recipients uuid[],
  p_title text,
  p_body text,
  p_link text,
  p_data jsonb
) RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_claimed int;
BEGIN
  IF coalesce(array_length(p_match_ids, 1), 0) = 0 OR coalesce(array_length(p_recipients, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE encargo_matches SET notified_at = now()
   WHERE id = ANY (p_match_ids) AND notified_at IS NULL;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  IF v_claimed > 0 THEN
    INSERT INTO crm_notifications (user_id, type, title, body, link, data)
    SELECT DISTINCT u, 'encargo_match', p_title, p_body, p_link, p_data FROM unnest(p_recipients) AS u;
  END IF;
  RETURN v_claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_and_notify_encargo_matches(uuid[], uuid[], text, text, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_and_notify_encargo_matches(uuid[], uuid[], text, text, text, jsonb) TO service_role;
