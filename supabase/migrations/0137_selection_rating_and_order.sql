-- ============================================================================
-- SmartBC · Selección del cliente — valoración y orden de prioridad
-- ============================================================================
-- Dos opiniones sobre las mismas propiedades, guardadas POR SEPARADO para que
-- nunca se pisen:
--
--   rating / position               · lo que anota el AGENTE. Su nota y su
--                                     orden de trabajo.
--   client_rating / client_rank     · lo que dice EL CLIENTE desde su enlace
--                                     privado (/v/[token]).
--
-- Fusionarlas en una sola columna sería tentador y estaría mal: cuando el
-- cliente valora un piso con 2 lo que hay que ver en la ficha es "yo le puse 5
-- y a él no le gusta", no un número que ya no se sabe de quién es.
--
-- ⚠️ Las columnas client_* son las ÚNICAS de todo el esquema que escribe una
-- superficie pública (la colección privada, autenticada solo por token). La
-- ruta que las escribe no toca ninguna otra columna, y por eso están aquí
-- separadas y no mezcladas con `status` o `agent_notes`.
--
-- Idempotente: post-deploy.sh relanza todas las migraciones en cada deploy.
-- ============================================================================

ALTER TABLE client_property_selections
  ADD COLUMN IF NOT EXISTS rating             smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position           integer,
  ADD COLUMN IF NOT EXISTS client_rating      smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_rank        integer,
  ADD COLUMN IF NOT EXISTS client_feedback_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'client_property_selections'::regclass
      AND conname = 'cps_rating_range'
  ) THEN
    ALTER TABLE client_property_selections
      ADD CONSTRAINT cps_rating_range CHECK (rating BETWEEN 0 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'client_property_selections'::regclass
      AND conname = 'cps_client_rating_range'
  ) THEN
    ALTER TABLE client_property_selections
      ADD CONSTRAINT cps_client_rating_range CHECK (client_rating BETWEEN 0 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'client_property_selections'::regclass
      AND conname = 'cps_position_positive'
  ) THEN
    ALTER TABLE client_property_selections
      ADD CONSTRAINT cps_position_positive CHECK (position IS NULL OR position > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'client_property_selections'::regclass
      AND conname = 'cps_client_rank_positive'
  ) THEN
    ALTER TABLE client_property_selections
      ADD CONSTRAINT cps_client_rank_positive CHECK (client_rank IS NULL OR client_rank > 0);
  END IF;
END $$;

-- Backfill del orden del agente por antigüedad, para que lo que ya existía
-- tenga un orden estable y lo nuevo entre al final. `id` desempata porque
-- añadir varias propiedades de golpe comparte added_at.
WITH ordenadas AS (
  SELECT id,
         row_number() OVER (PARTITION BY client_id ORDER BY added_at, id) * 100 AS pos
  FROM client_property_selections
  WHERE position IS NULL
)
UPDATE client_property_selections s
SET position = o.pos
FROM ordenadas o
WHERE s.id = o.id;

CREATE INDEX IF NOT EXISTS idx_cps_client_position
  ON client_property_selections(client_id, position);

-- ── Reordenar en una sola ida y vuelta ──────────────────────────────────────
-- Igual que `reorder_client_portal_links`: llega la lista completa ya ordenada
-- y se reescriben las posiciones de golpe. El filtro por client_id impide que
-- una lista de ids manipulada mueva la selección de otra ficha.
CREATE OR REPLACE FUNCTION reorder_client_selections(
  p_client_id uuid,
  p_ids       uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE client_property_selections s
  SET position = t.ord * 100
  FROM unnest(p_ids) WITH ORDINALITY AS t(id, ord)
  WHERE s.id = t.id
    AND s.client_id = p_client_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END $$;

-- ── Escritura del CLIENTE desde la colección privada ────────────────────────
-- El único camino por el que la superficie pública toca esta tabla, y está
-- deliberadamente encerrado en una función:
--
--   · Se entra por el TOKEN de la colección, no por un id de selección: el
--     visitante no puede nombrar una fila, solo una parada de SU colección.
--   · El token tiene que estar vivo (ni revocado ni caducado).
--   · Solo escribe client_rating / client_rank / client_feedback_at.
--
-- Devuelve 0 si el token no vale o la parada no es de esa colección, así que
-- la ruta no necesita distinguir "no existe" de "no es tuyo" — y por tanto no
-- filtra cuál de las dos cosas era.
CREATE OR REPLACE FUNCTION record_collection_feedback(
  p_token   text,
  p_stop_id uuid,
  p_rating  smallint,
  p_rank    integer
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
  SET client_rating      = p_rating,
      client_rank        = p_rank,
      client_feedback_at = now()
  WHERE id = v_selection_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END $$;
