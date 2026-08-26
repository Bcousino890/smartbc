-- ============================================================================
-- SmartBC · Foto de perfil de los contactos de una captación
-- ============================================================================
-- Petición del integrador "crm chile": su sistema tiene la foto de perfil de
-- WhatsApp asociada a cada número. Le pone cara al teléfono, así que la
-- captadora distingue a la persona antes de marcar.
--
-- Tres columnas en vez de una, por el mismo motivo que en captacion_photos:
--
--   photo_url          copia PERMANENTE en nuestro bucket. Es la que pinta el
--                      panel. La URL del proveedor es un proxy y no queremos
--                      ser dependencia en caliente de su servicio.
--   photo_storage_path ruta en el bucket, para poder borrar la copia anterior
--                      al reemplazarla y no dejar huérfanos.
--   photo_source_url   URL de origen. Cumple dos funciones:
--                        · evita volver a descargar la misma foto en cada
--                          sincronización (se compara antes de bajarla);
--                        · distingue el origen del dato. Si photo_url tiene
--                          valor y photo_source_url es NULL, la foto la subió
--                          una persona desde el panel y la sincronización NO
--                          la pisa, igual que con el resto de campos del
--                          equipo.
-- ============================================================================

ALTER TABLE captacion_contacts
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS photo_source_url TEXT;

COMMENT ON COLUMN captacion_contacts.photo_url IS 'Copia permanente de la foto de perfil del contacto en el bucket properties-photos';
COMMENT ON COLUMN captacion_contacts.photo_storage_path IS 'Ruta en el bucket de la copia permanente (para borrarla al reemplazarla)';
COMMENT ON COLUMN captacion_contacts.photo_source_url IS 'URL de origen de la foto. NULL con photo_url no nulo = subida a mano desde el panel, la sincronización no la sobrescribe.';

-- Fuerza a PostgREST a recargar la caché de esquema.
NOTIFY pgrst, 'reload schema';
