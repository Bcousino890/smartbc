-- ============================================================================
-- Reversión de 0233 (Idealista API → CRM: registro y sincronización).
-- SE NIEGA si hay operaciones, asociaciones u objetos de multimedia: con datos,
-- la recuperación es HACIA DELANTE (interruptor apagado + contención +, si
-- hace falta, una migración correctiva). Ver spec.md, «Recuperación».
-- ============================================================================
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM idealista_api_operations)
     OR EXISTS (SELECT 1 FROM idealista_crm_sync)
     OR EXISTS (SELECT 1 FROM idealista_crm_media_objects) THEN
    RAISE EXCEPTION 'rollback_0233_refused'
      USING DETAIL = 'Hay operaciones, asociaciones u objetos registrados. Apaga el interruptor y usa la contención; no se revierte con datos.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS idealista_crm_media_collect(uuid, interval);
DROP FUNCTION IF EXISTS idealista_crm_media_lookup(uuid, text[]);
DROP FUNCTION IF EXISTS idealista_crm_media_stage(uuid, text, text, text, bigint, text, bigint, text);
DROP FUNCTION IF EXISTS idealista_recover_api_property_id(uuid, text);
DROP FUNCTION IF EXISTS idealista_create_guard(uuid, text);
DROP FUNCTION IF EXISTS idealista_crm_resolve_review(uuid, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS idealista_crm_release_containment(uuid, text, uuid);
DROP FUNCTION IF EXISTS idealista_crm_note_failure(uuid, text, text, text);
DROP FUNCTION IF EXISTS apply_idealista_crm_sync(uuid, text, bigint, jsonb, jsonb, uuid);
DROP FUNCTION IF EXISTS idealista_crm_plan(uuid, text);
DROP FUNCTION IF EXISTS idealista_crm_classify(idealista_crm_sync);
DROP FUNCTION IF EXISTS idealista_crm_sync_row(uuid, text);
DROP FUNCTION IF EXISTS idealista_crm_smartlink_path(text, text);
DROP FUNCTION IF EXISTS idealista_crm_url_key(text);
DROP FUNCTION IF EXISTS idealista_crm_target(uuid, text);
DROP FUNCTION IF EXISTS idealista_listing_create_unresolved(uuid);
DROP FUNCTION IF EXISTS idealista_create_unresolved(uuid, text);
DROP FUNCTION IF EXISTS idealista_ops_timeline(uuid, text);
DROP FUNCTION IF EXISTS idealista_op_step(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS idealista_op_finish(uuid, text, integer, text, bigint, text);
DROP FUNCTION IF EXISTS idealista_op_begin(uuid, uuid, text, text, bigint, text, jsonb, jsonb, uuid);
DROP FUNCTION IF EXISTS idealista_crm_sync_enabled();

DROP TABLE IF EXISTS idealista_crm_media_sources;
DROP TABLE IF EXISTS idealista_crm_media_objects;
DROP TABLE IF EXISTS idealista_crm_sync;
DROP TABLE IF EXISTS idealista_api_operation_steps;
DROP TABLE IF EXISTS idealista_api_operation_results;
DROP TABLE IF EXISTS idealista_api_operations;
DROP FUNCTION IF EXISTS idealista_crm_sync_guard();
DROP FUNCTION IF EXISTS idealista_ops_append_only();
DROP SEQUENCE IF EXISTS idealista_ops_seq;
DELETE FROM app_settings WHERE key = 'idealista_crm_sync';
COMMIT;
