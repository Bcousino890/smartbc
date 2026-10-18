-- SOLO PRUEBAS LOCALES (BCP-01 P5). Tras rollback-0214.sql.
\set ON_ERROR_STOP 1
SELECT test_util.ok(to_regclass('property_import_drafts') IS NULL, 'reversión: sin tabla de borradores');
SELECT test_util.ok(to_regprocedure('import_draft_create_property(uuid, uuid, integer, jsonb)') IS NULL, 'reversión: sin funciones');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'new_listing_alerts_suppressed'),
  'reversión: sin la columna de supresión');
SELECT test_util.ok((SELECT count(*) FROM properties WHERE external_id LIKE 'idealista-%') > 0, 'reversión: las fichas creadas se conservan');
SELECT 'test-rollback-0214.sql: OK' AS resultado;
