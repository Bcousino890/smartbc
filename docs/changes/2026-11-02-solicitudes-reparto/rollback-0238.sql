-- ============================================================================
-- Reversión de 0238_solicitudes_vinculo_exacto_retencion.sql. Lo ejecuta una
-- persona con psql (nunca un agente). Pérdida: la marca de caducidad
-- (expired_at) de cada solicitud. Lo que el barrido ya BORRÓ (solicitudes
-- de más de 60 días sin cliente) no se recupera con esto.
--
-- La vista vuelve a la definición de 0237 y listings_for_code también:
-- primero se borra la vista (CREATE OR REPLACE no puede quitar columnas) y
-- se vuelve a aplicar 0237 entera desde el repo (es idempotente).
-- Ejecutar desde la raíz del repositorio:
--   psql … -v ON_ERROR_STOP=1 -f docs/changes/2026-11-02-solicitudes-reparto/rollback-0238.sql
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN;
DROP VIEW IF EXISTS lead_inbox_facts;
DROP FUNCTION IF EXISTS lead_retention_sweep(integer, integer);
DROP INDEX IF EXISTS idx_idealista_leads_retention;
ALTER TABLE idealista_leads DROP COLUMN IF EXISTS expired_at;
\ir ../../../supabase/migrations/0237_solicitudes_reparto.sql
COMMIT;
