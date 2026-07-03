-- Teléfonos adicionales por contacto (más allá del campo phone principal)
ALTER TABLE captacion_contacts ADD COLUMN IF NOT EXISTS
  extra_phones TEXT[] DEFAULT '{}';

COMMENT ON COLUMN captacion_contacts.extra_phones IS 'Teléfonos adicionales del contacto (normalizados +56...)';
