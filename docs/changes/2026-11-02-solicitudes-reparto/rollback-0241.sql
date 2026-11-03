-- ============================================================================
-- Reversión de 0241_solicitudes_anuncios_retirados.sql. La ejecuta una persona
-- con psql (nunca un agente). Pérdida: las filas de historial con source='api'
-- (los ids de la API anteriores); la vista vuelve a la de 0238.
-- Ejecutar desde la raíz del repositorio:
--   psql … -v ON_ERROR_STOP=1 -f docs/changes/2026-11-02-solicitudes-reparto/rollback-0241.sql
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN;
DROP TRIGGER IF EXISTS trg_idealista_listing_api_code_history ON idealista_listings;
DROP FUNCTION IF EXISTS idealista_listing_api_code_history();
DELETE FROM idealista_listing_codes WHERE source = 'api';
ALTER TABLE idealista_listing_codes DROP CONSTRAINT IF EXISTS idealista_listing_codes_source_check;
ALTER TABLE idealista_listing_codes
  ADD CONSTRAINT idealista_listing_codes_source_check CHECK (source IN ('catalogo', 'inicial'));
DROP VIEW IF EXISTS lead_inbox_facts;
\ir ../../../supabase/migrations/0238_solicitudes_vinculo_exacto_retencion.sql
COMMIT;
