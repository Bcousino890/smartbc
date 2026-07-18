-- Campos adicionales para fichas de Chile: número de pisos de la vivienda,
-- si está dentro de un condominio, año de construcción y sector/subzona
-- dentro de la comuna (ej. Chicureo dentro de Colina, Huinganal dentro de
-- Lo Barnechea). `covered_area_m2` y `parking_lots` ya existían (0047).
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS floors INTEGER,
  ADD COLUMN IF NOT EXISTS is_condominium BOOLEAN,
  ADD COLUMN IF NOT EXISTS construction_year INTEGER,
  ADD COLUMN IF NOT EXISTS sector TEXT;
