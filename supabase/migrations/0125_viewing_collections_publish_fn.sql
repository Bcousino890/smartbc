-- ============================================================================
-- SmartBC · Publicación atómica de un itinerario
-- ============================================================================
-- El cliente Supabase JS no tiene transacciones. Sin esta función, una
-- publicación que falle a medias deja: unos SmartLinks creados y otros no, sin
-- token de colección, y el itinerario ya marcado 'published'. Aquí todo ocurre
-- dentro de una única transacción implícita de PL/pgSQL.
--
-- Los tokens se generan con el MISMO alfabeto y entropía que randomToken() de
-- lib/tokens.ts: 21 bytes aleatorios → 28 chars base64url = 168 bits.
-- (21 es múltiplo de 3, así que base64 no añade padding que recortar.)
--
-- La autorización se hace ANTES, en la server action. Esta función asume que
-- quien la llama ya tiene el permiso viewing_collections.publish.
--
-- ⚠️ `SET search_path = public, extensions` en ambas funciones: pgcrypto está
-- instalada en el esquema `extensions` (verificado en producción), así que
-- `gen_random_bytes` no resuelve con el search_path por defecto de todos los
-- roles. Fijarlo en la función lo hace independiente de quién la llame.
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_url_safe_token(n_bytes integer DEFAULT 21)
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT translate(encode(gen_random_bytes(n_bytes), 'base64'), '+/', '-_');
$$;

CREATE OR REPLACE FUNCTION publish_viewing_itinerary(
  p_itinerary_id uuid,
  p_created_by   uuid,
  p_expiry_days  integer DEFAULT 60,
  p_share_label  text    DEFAULT NULL
)
RETURNS TABLE (
  share_id       uuid,
  token          text,
  expires_at     timestamptz,
  shares_created integer
)
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_client_name text;
  v_title       text;
  v_status      text;
  v_date        date;
  v_stop        record;
  v_new_token   text;
  v_share_id    uuid;
  v_created     integer := 0;
  v_ordinal     integer := 0;
  v_expires     timestamptz;
BEGIN
  IF p_expiry_days IS NULL OR p_expiry_days < 1 THEN
    p_expiry_days := 60;
  END IF;

  -- 1 · Bloqueo + validación -------------------------------------------------
  -- FOR UPDATE evita que dos agentes publiquen el mismo itinerario a la vez.
  SELECT i.status, i.title, i.scheduled_date, p.full_name
    INTO v_status, v_title, v_date, v_client_name
    FROM viewing_itineraries i
    JOIN profiles p ON p.id = i.client_id
   WHERE i.id = p_itinerary_id
   FOR UPDATE OF i;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Itinerario % no encontrado', p_itinerary_id
      USING ERRCODE = '23503';
  END IF;

  IF v_status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'No se puede publicar un itinerario en estado %', v_status
      USING ERRCODE = '23514';
  END IF;

  IF v_date IS NULL THEN
    RAISE EXCEPTION 'El itinerario no tiene fecha asignada'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM viewing_stops
     WHERE itinerary_id = p_itinerary_id AND hidden_from_client = false
  ) THEN
    RAISE EXCEPTION 'El itinerario no tiene paradas visibles'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM viewing_stops
     WHERE itinerary_id = p_itinerary_id
       AND hidden_from_client = false
       AND scheduled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay paradas visibles sin hora asignada'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM viewing_stops s
      JOIN client_property_selections sel ON sel.id = s.selection_id
      JOIN properties pr ON pr.id = sel.property_id
     WHERE s.itinerary_id = p_itinerary_id
       AND s.hidden_from_client = false
       AND (pr.archived_at IS NOT NULL OR pr.status = 'archived')
  ) THEN
    RAISE EXCEPTION 'Hay propiedades archivadas entre las paradas visibles'
      USING ERRCODE = '23514';
  END IF;

  -- 2 · Un SmartLink por parada visible que no tenga uno ---------------------
  -- El ordinal se cuenta sobre TODAS las paradas visibles (no solo las que
  -- necesitan link) para que el label refleje la posición real en el día.
  FOR v_stop IN
    SELECT s.id AS stop_id, sel.property_id, s.property_share_id,
           row_number() OVER (ORDER BY s.position, s.created_at) AS ord
      FROM viewing_stops s
      JOIN client_property_selections sel ON sel.id = s.selection_id
     WHERE s.itinerary_id = p_itinerary_id
       AND s.hidden_from_client = false
     ORDER BY s.position, s.created_at
  LOOP
    v_ordinal := v_stop.ord;
    CONTINUE WHEN v_stop.property_share_id IS NOT NULL;

    v_new_token := generate_url_safe_token(21);

    INSERT INTO property_shares (property_id, token, label, created_by)
    VALUES (
      v_stop.property_id,
      v_new_token,
      format('Viewing Collection · %s · %s · Stop %s',
             coalesce(nullif(btrim(v_client_name), ''), 'Cliente'),
             coalesce(nullif(btrim(v_title), ''), to_char(v_date, 'DD/MM/YYYY')),
             lpad(v_ordinal::text, 2, '0')),
      p_created_by
    )
    RETURNING id INTO v_share_id;

    UPDATE viewing_stops SET property_share_id = v_share_id WHERE id = v_stop.stop_id;
    v_created := v_created + 1;
  END LOOP;

  -- 3 · Enlace de la colección ----------------------------------------------
  v_new_token := generate_url_safe_token(21);
  v_expires   := now() + make_interval(days => p_expiry_days);

  INSERT INTO viewing_collection_shares
    (itinerary_id, token, label, expires_at, created_by)
  VALUES
    (p_itinerary_id, v_new_token, p_share_label, v_expires, p_created_by)
  RETURNING id INTO v_share_id;

  -- 4 · Marcar publicado -----------------------------------------------------
  UPDATE viewing_itineraries
     SET status = 'published'
   WHERE id = p_itinerary_id;

  RETURN QUERY SELECT v_share_id, v_new_token, v_expires, v_created;
END;
$$;
