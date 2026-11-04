-- ============================================================================
-- Reversión de 0242_solicitudes_telefonos_contacto.sql. La ejecuta una persona
-- con psql (nunca un agente). Pérdida: los teléfonos de WhatsApp y de llamadas
-- configurados en la ficha; cada solicitud vuelve a usar el recibido de
-- Idealista (`phone`, que 0242 no modifica).
--   psql … -v ON_ERROR_STOP=1 -f docs/changes/2026-11-02-solicitudes-reparto/rollback-0242.sql
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN;
ALTER TABLE idealista_leads DROP CONSTRAINT IF EXISTS idealista_leads_zinto_phone_len;
ALTER TABLE idealista_leads DROP CONSTRAINT IF EXISTS idealista_leads_call_phone_len;
ALTER TABLE idealista_leads DROP COLUMN IF EXISTS zinto_phone;
ALTER TABLE idealista_leads DROP COLUMN IF EXISTS call_phone;
COMMIT;
