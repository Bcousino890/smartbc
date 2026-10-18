-- ============================================================================
-- Reversión de 0214 (BCP-01 P5: borradores de importación y supresión de
-- alertas).
--
-- ⚠️ SE PIERDE: los borradores pendientes (property_import_drafts) y la marca
-- new_listing_alerts_suppressed. Las fichas YA creadas desde un borrador se
-- conservan, pero dejan de estar marcadas: si su created_at es posterior al
-- último envío de un cliente con alertas, el siguiente cron las anunciaría.
-- Antes de revertir, si se quiere conservar (psql dentro de supabase-db):
--   \copy (SELECT * FROM property_import_drafts) TO 'import_drafts.csv' CSV HEADER
--   \copy (SELECT id FROM properties WHERE new_listing_alerts_suppressed) TO 'suppressed.csv' CSV HEADER
-- Las fotos de los PDF en el bucket privado property-import-drafts NO se
-- borran con SQL (borrar filas de storage.objects no borra los archivos): se
-- vacía desde la API de Storage o el panel de Supabase.
-- Revertir junto con el build anterior a P5 (el código nuevo usa todo esto).
-- La ejecuta una persona, nunca un agente contra datos reales.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS import_draft_set_step(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS import_draft_attach_photo(uuid, uuid, text, integer, boolean);
DROP FUNCTION IF EXISTS import_draft_add_photo(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS import_draft_update_existing(uuid, uuid, integer, uuid, timestamptz, jsonb);
DROP FUNCTION IF EXISTS import_draft_use_existing(uuid, uuid, integer, uuid);
DROP FUNCTION IF EXISTS import_draft_create_property(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS import_draft_lock(uuid, uuid);
DROP TABLE IF EXISTS property_import_drafts;
ALTER TABLE properties DROP COLUMN IF EXISTS new_listing_alerts_suppressed;

COMMIT;
