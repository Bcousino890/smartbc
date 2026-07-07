-- RUT del contacto de una captación (dueño, cónyuge, etc.)
-- Se guarda como texto tal como lo ingresa la captadora (ej: 12.345.678-9).

ALTER TABLE captacion_contacts ADD COLUMN IF NOT EXISTS
  rut TEXT;

COMMENT ON COLUMN captacion_contacts.rut IS 'RUT del contacto (ej: 12.345.678-9)';

-- Fuerza a PostgREST a recargar la caché de esquema para que vea la columna.
NOTIFY pgrst, 'reload schema';
