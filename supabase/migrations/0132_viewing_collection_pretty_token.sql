-- ============================================================================
-- SmartBC · Un enlace de colección que se pueda enseñar
-- ============================================================================
-- El enlace que recibe el cliente era así:
--
--     /v/mP7K2nTcmN9shR55T-_XpRT8rCwd
--
-- 28 caracteres de base64 con mayúsculas, minúsculas, guiones y guiones bajos.
-- Funciona, pero para un documento privado de cliente parece un volcado de
-- sistema. Ahora es así:
--
--     /v/k3f9x2m7qpbd4hn6
--
-- 16 caracteres, todo minúsculas y dígitos, de un alfabeto sin caracteres que
-- se confundan al leerlos en voz alta o copiarlos a mano (fuera 0/o, 1/l/i).
--
-- ⚠️ SEGURIDAD — el token es la ÚNICA protección de la colección, así que el
-- cambio se hizo con la cuenta delante, no a ojo:
--
--     antes  · 21 bytes  = 168 bits
--     ahora  · 16 chars de alfabeto 31 = 79 bits
--
-- 79 bits siguen siendo inalcanzables: a mil intentos por segundo harían falta
-- del orden de 10^13 años. Se baja el mínimo del CHECK de 24 a 16 caracteres
-- para permitirlo, y NO más abajo — por debajo de eso la cuenta deja de dar.
--
-- Los enlaces ya repartidos siguen valiendo: son más largos que el mínimo
-- nuevo, y aquí no se toca ninguno. Solo cambia lo que se genere a partir de
-- ahora.
--
-- El token de las fichas de propiedad (`/c/...`, property_shares) NO cambia:
-- lo usa todo el sistema de SmartLinks, no solo este módulo.
--
-- Idempotente: CREATE OR REPLACE + DROP/ADD CONSTRAINT.
-- ============================================================================

-- Alfabeto sin ambigüedades: sin 0/o, sin 1/l/i. 31 símbolos.
CREATE OR REPLACE FUNCTION generate_collection_token(n_chars integer DEFAULT 16)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $fn$
DECLARE
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  out text := '';
  i integer;
BEGIN
  FOR i IN 1..n_chars LOOP
    -- gen_random_bytes, no random(): random() es predecible y esto es lo único
    -- que separa la colección de cualquiera que pruebe URLs.
    out := out || substr(
      alphabet,
      1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)),
      1
    );
  END LOOP;
  RETURN out;
END;
$fn$;

ALTER TABLE viewing_collection_shares DROP CONSTRAINT IF EXISTS vcs_token_len;
ALTER TABLE viewing_collection_shares ADD CONSTRAINT vcs_token_len
  CHECK (char_length(token) >= 16);

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

  SELECT i.status, i.title, i.scheduled_date, p.full_name
    INTO v_status, v_title, v_date, v_client_name
    FROM viewing_itineraries i
    JOIN profiles p ON p.id = i.client_id
   WHERE i.id = p_itinerary_id
   FOR UPDATE OF i;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Itinerario % no encontrado', p_itinerary_id USING ERRCODE = '23503';
  END IF;

  IF v_status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'No se puede publicar un itinerario en estado %', v_status
      USING ERRCODE = '23514';
  END IF;

  IF v_date IS NULL THEN
    RAISE EXCEPTION 'El itinerario no tiene fecha asignada' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM viewing_stops
     WHERE itinerary_id = p_itinerary_id AND hidden_from_client = false
  ) THEN
    RAISE EXCEPTION 'El itinerario no tiene paradas visibles' USING ERRCODE = '23514';
  END IF;

  -- Solo se exige hora a las paradas que van a ocurrir. Una cancelada o
  -- rechazada se muestra al cliente precisamente para explicar el cambio de
  -- plan, y no tiene ni debe tener hora.
  IF EXISTS (
    SELECT 1 FROM viewing_stops
     WHERE itinerary_id = p_itinerary_id
       AND hidden_from_client = false
       AND confirmation_status NOT IN ('cancelled', 'declined')
       AND time_pending = false
       AND scheduled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay paradas sin hora. Ponles hora o marcalas como "hora por confirmar"'
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

  -- El enlace de la colección es el que el agente copia y manda por WhatsApp:
  -- token corto y legible, no un volcado de base64 con mayúsculas y símbolos.
  v_new_token := generate_collection_token(16);
  v_expires   := now() + make_interval(days => p_expiry_days);

  INSERT INTO viewing_collection_shares
    (itinerary_id, token, label, expires_at, created_by)
  VALUES
    (p_itinerary_id, v_new_token, p_share_label, v_expires, p_created_by)
  RETURNING id INTO v_share_id;

  UPDATE viewing_itineraries SET status = 'published' WHERE id = p_itinerary_id;

  RETURN QUERY SELECT v_share_id, v_new_token, v_expires, v_created;
END;
$$;
