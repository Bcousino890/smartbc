-- Agrega el RUT del contacto/dueño a captacion_contacts, para que la ficha
-- de "Datos del Dueño" quede completa (necesario para promesas de compraventa
-- y otros documentos legales más adelante).

ALTER TABLE captacion_contacts ADD COLUMN IF NOT EXISTS rut TEXT;

COMMENT ON COLUMN captacion_contacts.rut IS 'RUT chileno del contacto (formato libre, ej: 12.345.678-9)';

-- Fuerza a PostgREST a recargar la caché de esquema para que vea la columna.
NOTIFY pgrst, 'reload schema';
