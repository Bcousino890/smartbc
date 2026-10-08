-- ============================================================
-- SmartBC · Precisión de la ubicación guardada de cada propiedad
-- ============================================================
-- El SmartLink decía "Ubicación exacta de la propiedad" para CUALQUIER
-- coordenada guardada, aunque fuera el centro del barrio. En las fichas
-- importadas de Idealista el punto es el mismo que pinta Idealista, pero
-- cuando el anunciante oculta la dirección Idealista solo enseña un círculo
-- de zona (addressVisibility "HIDDEN"), no un pin. Esta columna guarda esa
-- diferencia para que el SmartLink no prometa una exactitud que no hay.
--
--   'exact'       → punto del portal con dirección publicada, o fijado a mano.
--   'approximate' → zona: dirección oculta en el portal, o geocodificado
--                   desde una calle sin número / un barrio.
--   NULL          → sin dato (fichas anteriores a 2026-10-08).
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS location_precision text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'properties_location_precision_check'
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_location_precision_check
      CHECK (location_precision IS NULL OR location_precision IN ('exact', 'approximate'));
  END IF;
END $$;
