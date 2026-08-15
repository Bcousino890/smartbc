-- ============================================================================
-- SmartBC · Viewing Collections — invariantes que un CHECK no alcanza
-- ============================================================================
-- Un CHECK solo ve su propia fila. Estos invariantes cruzan tablas, así que
-- van en triggers. El primero es una protección de FUGA ENTRE CLIENTES y debe
-- fallar incluso desde el service role, que es justo donde una validación
-- hecha en la capa de aplicación no llega.
-- ============================================================================

-- ── Protección cross-cliente ────────────────────────────────────────────────
-- Una parada NUNCA puede usar una selección de otro cliente. Sin esto, un bug
-- en la action metería propiedades de la selección de María en el itinerario
-- de Paul — y de ahí, directas a la colección pública de Paul.
CREATE OR REPLACE FUNCTION viewing_stops_assert_same_client()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_itinerary_client uuid;
  v_selection_client uuid;
BEGIN
  SELECT client_id INTO v_itinerary_client
    FROM viewing_itineraries WHERE id = NEW.itinerary_id;

  SELECT client_id INTO v_selection_client
    FROM client_property_selections WHERE id = NEW.selection_id;

  IF v_itinerary_client IS NULL THEN
    RAISE EXCEPTION 'viewing_stops: itinerario % inexistente', NEW.itinerary_id
      USING ERRCODE = '23503';
  END IF;

  IF v_selection_client IS NULL THEN
    RAISE EXCEPTION 'viewing_stops: seleccion % inexistente', NEW.selection_id
      USING ERRCODE = '23503';
  END IF;

  IF v_itinerary_client <> v_selection_client THEN
    RAISE EXCEPTION
      'viewing_stops: la seleccion % pertenece al cliente %, pero el itinerario % es del cliente %',
      NEW.selection_id, v_selection_client, NEW.itinerary_id, v_itinerary_client
      USING ERRCODE = '23514',
            HINT = 'Una parada solo puede usar selecciones del mismo cliente que el itinerario.';
  END IF;

  RETURN NEW;
END;
$$;

-- Solo en INSERT y en UPDATE de las dos columnas relevantes: cambiar la hora
-- de una parada no necesita revalidar la propiedad del cliente, y así un
-- reorder masivo no paga dos SELECT por fila.
DROP TRIGGER IF EXISTS vs_assert_same_client ON viewing_stops;
CREATE TRIGGER vs_assert_same_client
  BEFORE INSERT OR UPDATE OF itinerary_id, selection_id ON viewing_stops
  FOR EACH ROW EXECUTE FUNCTION viewing_stops_assert_same_client();

-- ── Coherencia de país ──────────────────────────────────────────────────────
-- El país de la selección se deriva de la propiedad, no se pasa a mano. Evita
-- mezclar catálogos ES/CL en una misma colección por un descuido del caller.
CREATE OR REPLACE FUNCTION cps_set_country_from_property()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_country text;
BEGIN
  SELECT coalesce(country, 'es') INTO v_country
    FROM properties WHERE id = NEW.property_id;
  IF v_country IS NOT NULL THEN
    NEW.country := v_country;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cps_country_sync ON client_property_selections;
CREATE TRIGGER cps_country_sync
  BEFORE INSERT OR UPDATE OF property_id ON client_property_selections
  FOR EACH ROW EXECUTE FUNCTION cps_set_country_from_property();
