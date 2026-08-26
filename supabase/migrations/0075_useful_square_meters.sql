-- Superficie útil (m²) de la ficha scrapeada, separada de la superficie total.
-- En avisos chilenos ambas aparecen ("Superficie total: 1.142 m²" /
-- "Superficie útil: 390 m²") y las dos importan para tasar.

ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS useful_square_meters INTEGER;
ALTER TABLE captacion_listings ADD COLUMN IF NOT EXISTS useful_square_meters INTEGER;

COMMENT ON COLUMN captaciones.useful_square_meters IS 'Superficie útil en m² (scrapeada del aviso)';
COMMENT ON COLUMN captacion_listings.useful_square_meters IS 'Superficie útil en m² del aviso de la corredora';

-- Fuerza a PostgREST a recargar la caché de esquema.
NOTIFY pgrst, 'reload schema';
