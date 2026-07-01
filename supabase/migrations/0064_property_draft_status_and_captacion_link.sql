-- Agrega estado 'draft' al enum property_status para propiedades creadas desde captaciones
ALTER TYPE property_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'available';

-- Columna para rastrear de qué captación provino la propiedad
ALTER TABLE properties ADD COLUMN IF NOT EXISTS
  captacion_id UUID REFERENCES captaciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_captacion ON properties(captacion_id) WHERE captacion_id IS NOT NULL;

COMMENT ON COLUMN properties.captacion_id IS 'Captación origen de esta propiedad (si fue creada desde el módulo de captaciones)';
