-- m² útiles mínimo y máximo en las preferencias del cliente (Chile). Los m²
-- totales ya existían (min_square_meters / max_square_meters).
BEGIN;

ALTER TABLE client_preferences
  ADD COLUMN IF NOT EXISTS min_useful_square_meters INTEGER,
  ADD COLUMN IF NOT EXISTS max_useful_square_meters INTEGER;

COMMIT;
