-- SOLO PRUEBAS LOCALES. Tras rollback-0241.sql.
\set ON_ERROR_STOP 1
SELECT test_util.ok(to_regprocedure('idealista_listing_api_code_history()') IS NULL
  AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_idealista_listing_api_code_history'),
  'reversión 0241: sin trigger del historial de la API');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM idealista_listing_codes WHERE source = 'api'),
  'reversión 0241: sin filas de historial de la API');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name = 'lead_inbox_facts' AND column_name = 'listing_retired')
  AND EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name = 'lead_inbox_facts' AND column_name = 'listing_cover_url'),
  'reversión 0241: la vista vuelve a 0238');
SELECT 'test-rollback-0241.sql: OK' AS resultado;
