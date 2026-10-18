-- SOLO PRUEBAS LOCALES (BCP-01 P5). Pestaña A: confirma y retiene el bloqueo 2 s.
\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL ROLE service_role;
SELECT import_draft_create_property('00000000-0000-0000-0000-0000000000f1',
  (SELECT id FROM property_import_drafts WHERE request_key = 'req-concurrent'), 1, test_util.row('pdf:concurrente:1', 'piso-concurrente'));
SELECT pg_sleep(2);
COMMIT;
