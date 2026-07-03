-- Agrega columna "rol" (rol de avalúo SII) a captaciones
ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS
  rol TEXT;

COMMENT ON COLUMN captaciones.rol IS 'Rol de avalúo SII (ej: 1234-56)';
