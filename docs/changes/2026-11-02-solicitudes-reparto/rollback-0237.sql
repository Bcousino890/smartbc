-- ============================================================================
-- Reversión de 0237_solicitudes_reparto.sql. Lo ejecuta una persona con psql
-- (nunca un agente). Pérdida: reglas de reparto, auditoría, cola de Zinto y
-- las columnas nuevas (vínculo, estado del reparto, versiones). NO se pierde
-- ningún responsable: assigned_to y assigned_advisor_id son columnas
-- anteriores y conservan el valor que tengan.
--
-- La vista vuelve a la definición de 0161: primero se borra (CREATE OR
-- REPLACE no puede quitar columnas) y se recrea con 0161 desde el repo.
-- Ejecutar desde la raíz del repositorio:
--   psql … -v ON_ERROR_STOP=1 -f docs/changes/2026-11-02-solicitudes-reparto/rollback-0237.sql
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN;
DROP VIEW IF EXISTS lead_inbox_facts;
\ir ../../../supabase/migrations/0161_lead_inbox_operation.sql

DROP FUNCTION IF EXISTS zinto_owner_sync_retry(uuid, uuid);
DROP FUNCTION IF EXISTS zinto_owner_sync_ack(uuid, integer, boolean, text);
DROP FUNCTION IF EXISTS lead_register_contact(uuid, uuid, text, text, text, timestamptz, text, boolean, uuid);
DROP FUNCTION IF EXISTS set_lead_link_manual(uuid, uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS routing_clear_rules(uuid, text, jsonb, text);
DROP FUNCTION IF EXISTS routing_set_rules(uuid, text, uuid, jsonb, text);
DROP FUNCTION IF EXISTS reassign_client_admin(uuid, uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS assign_lead_admin(uuid, uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS reconcile_unresolved_code_leads(integer);
DROP FUNCTION IF EXISTS route_leads(uuid[]);
DROP FUNCTION IF EXISTS route_lead(uuid);
DROP FUNCTION IF EXISTS routing_set_pending(uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS resolve_lead_link(uuid, boolean);
DROP FUNCTION IF EXISTS routing_enqueue_zinto(text, uuid, text, text, uuid, integer);
DROP FUNCTION IF EXISTS routing_audit(uuid, text, uuid, uuid, uuid, uuid, uuid, text, integer, uuid, integer, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS routing_listing_home(uuid);
DROP FUNCTION IF EXISTS routing_is_advisor(uuid);
DROP FUNCTION IF EXISTS routing_actor_is_admin(uuid, text);

DROP TABLE IF EXISTS zinto_owner_sync;
DROP TABLE IF EXISTS assignment_events;
DROP FUNCTION IF EXISTS assignment_events_append_only();
DROP TABLE IF EXISTS property_routing_rules;

DROP INDEX IF EXISTS idx_leads_routing_pending;
DROP INDEX IF EXISTS idx_leads_code_unresolved;
ALTER TABLE idealista_leads
  DROP CONSTRAINT IF EXISTS il_property_link_method_valid,
  DROP CONSTRAINT IF EXISTS il_routing_status_valid,
  DROP CONSTRAINT IF EXISTS il_assignment_source_valid,
  DROP COLUMN IF EXISTS property_link_method,
  DROP COLUMN IF EXISTS routing_status,
  DROP COLUMN IF EXISTS routing_reason,
  DROP COLUMN IF EXISTS routing_rule_id,
  DROP COLUMN IF EXISTS routing_rule_version,
  DROP COLUMN IF EXISTS assignment_source,
  DROP COLUMN IF EXISTS assignment_version;
DROP INDEX IF EXISTS uq_lead_activity_client_key;
ALTER TABLE lead_activity DROP COLUMN IF EXISTS client_key;
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_advisor_assignment_source_valid,
  DROP COLUMN IF EXISTS advisor_assignment_source,
  DROP COLUMN IF EXISTS advisor_assignment_version;
COMMIT;
NOTIFY pgrst, 'reload schema';
