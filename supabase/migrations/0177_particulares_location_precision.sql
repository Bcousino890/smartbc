-- ============================================================
-- SmartBC · Precisión del pin de cada anuncio de particulares
-- ============================================================
--   'exact'       → punto del portal con calle y número.
--   'approximate' → geocodificado desde calle con número (Nominatim).
--   'zone'        → solo zona (NO se guardan coordenadas de zona: el enlazador
--                   une anuncios a ≤100 m y generaría enlaces falsos).
--   NULL          → sin dato.
-- Idempotente.
-- ============================================================
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS location_precision text;
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'particulares_location_precision_check'
  ) THEN
    ALTER TABLE particulares
      ADD CONSTRAINT particulares_location_precision_check
      CHECK (location_precision IS NULL OR location_precision IN ('exact', 'approximate', 'zone'));
  END IF;
END $$;
