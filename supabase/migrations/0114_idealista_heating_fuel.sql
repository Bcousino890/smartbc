-- Combustible de la calefacción ("Combustible calefacción" en el formulario de
-- Idealista) — campo requerido por Idealista cuando el tipo de calefacción no
-- es "No dispone", pero que no existía en idealista_listings, por lo que la
-- extensión de Chrome nunca podía rellenarlo.
ALTER TABLE idealista_listings
  ADD COLUMN IF NOT EXISTS heating_fuel text DEFAULT 'unknown';
