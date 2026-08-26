-- ============================================================================
-- SmartBC · record_collection_feedback — tipos de argumento
-- ============================================================================
-- La función nació con `p_rating smallint`. PostgREST resuelve las funciones
-- RPC por NOMBRE de argumento y castea desde JSON, y `smallint` es justo el
-- tipo que más fricción da por ahí. Como el rango ya se valida DENTRO de la
-- función (0..5, y si no devuelve 0 sin escribir), el tipo estrecho no aportaba
-- ninguna garantía extra — solo un modo de fallo.
--
-- El DROP explícito no es opcional: sin él quedarían las dos versiones y
-- PostgREST no sabría cuál llamar (ambigüedad → 300 Multiple Choices).
--
-- Idempotente: se puede relanzar tantas veces como haga falta.
-- ============================================================================

DROP FUNCTION IF EXISTS record_collection_feedback(text, uuid, smallint, integer);

CREATE OR REPLACE FUNCTION record_collection_feedback(
  p_token   text,
  p_stop_id uuid,
  p_rating  integer,
  p_rank    integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_selection_id uuid;
  v_updated      integer;
BEGIN
  IF p_rating IS NULL OR p_rating < 0 OR p_rating > 5 THEN
    RETURN 0;
  END IF;

  SELECT vs.selection_id INTO v_selection_id
  FROM viewing_collection_shares vcs
  JOIN viewing_itineraries vi ON vi.id = vcs.itinerary_id
  JOIN viewing_stops vs       ON vs.itinerary_id = vi.id
  WHERE vcs.token = p_token
    AND vcs.revoked_at IS NULL
    AND vcs.expires_at > now()
    AND vs.id = p_stop_id
    AND vs.hidden_from_client = false;

  IF v_selection_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE client_property_selections
  SET client_rating      = p_rating::smallint,
      client_rank        = p_rank,
      client_feedback_at = now()
  WHERE id = v_selection_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END $$;
