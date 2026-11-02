-- SOLO PRUEBAS LOCALES. Tras rollback-0237.sql.
\set ON_ERROR_STOP 1
SELECT test_util.ok(to_regclass('property_routing_rules') IS NULL AND to_regclass('assignment_events') IS NULL
  AND to_regclass('zinto_owner_sync') IS NULL, 'reversión: sin tablas nuevas');
SELECT test_util.ok(to_regprocedure('route_lead(uuid)') IS NULL
  AND to_regprocedure('reconcile_unresolved_code_leads(integer)') IS NULL
  AND to_regprocedure('lead_register_contact(uuid, uuid, text, text, text, timestamptz, text, boolean, uuid)') IS NULL,
  'reversión: sin funciones');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name = 'idealista_leads' AND column_name IN ('property_link_method', 'assignment_version')),
  'reversión: sin columnas nuevas en solicitudes');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name = 'lead_inbox_facts' AND column_name = 'routing_status')
  AND EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name = 'lead_inbox_facts' AND column_name = 'operation_source'),
  'reversión: la vista vuelve a 0161');
SELECT test_util.ok((SELECT count(*) FROM idealista_leads WHERE assigned_to IS NOT NULL) > 0,
  'reversión: los responsables guardados se conservan');
SELECT 'test-rollback-0237.sql: OK' AS resultado;
