-- reference_code solo debe ser único para fichas de PROPIEDADES REALES, no para
-- inspos (borradores sin propiedad, que pueden no tener código o repetirlo).
-- El UNIQUE global (idealista_listings_reference_code_key, de 0019) hacía chocar
-- la segunda inspo: "duplicate key ... reference_code_key".
-- Se sustituye por un índice único PARCIAL que solo aplica a filas no-inspo con
-- código no nulo. Así las inspos pueden compartir/repetir/omitir el código, y las
-- fichas de propiedades reales siguen garantizando unicidad.
ALTER TABLE idealista_listings
  DROP CONSTRAINT IF EXISTS idealista_listings_reference_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idealista_listings_reference_code_unique
  ON idealista_listings (reference_code)
  WHERE is_inspo = false AND reference_code IS NOT NULL;

-- Recargar la caché de esquema de PostgREST tras el cambio de constraint/índice.
NOTIFY pgrst, 'reload schema';
