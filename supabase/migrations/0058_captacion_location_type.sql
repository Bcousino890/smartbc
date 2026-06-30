-- Agregar columnas para tipo de propiedad y verificación de dirección
-- property_type: clasificación del tipo de propiedad (casa, departamento, terreno, oficina, comercial, otro)
-- address_verified: booleano que indica si la dirección fue verificada por la captadora

ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS
  property_type TEXT CHECK (property_type IN ('house', 'apartment', 'land', 'office', 'commercial', 'other'));

ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS
  address_verified BOOLEAN DEFAULT FALSE;

-- Índice para búsquedas rápidas por tipo de propiedad
CREATE INDEX IF NOT EXISTS idx_captaciones_property_type ON captaciones(property_type) WHERE property_type IS NOT NULL;

-- Índice para búsquedas por dirección verificada
CREATE INDEX IF NOT EXISTS idx_captaciones_address_verified ON captaciones(address_verified) WHERE address_verified = TRUE;

COMMENT ON COLUMN captaciones.property_type IS 'Tipo de propiedad: house, apartment, land, office, commercial, other';
COMMENT ON COLUMN captaciones.address_verified IS 'Indica si la dirección fue verificada por la captadora';
