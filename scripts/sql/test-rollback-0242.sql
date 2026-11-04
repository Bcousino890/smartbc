-- SOLO PRUEBAS LOCALES. Tras rollback-0242.sql.
\set ON_ERROR_STOP 1
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name = 'idealista_leads' AND column_name IN ('zinto_phone', 'call_phone')),
  'reversión 0242: sin columnas de teléfonos propios');
SELECT test_util.ok((SELECT phone = '+34 600 000 101' FROM idealista_leads
  WHERE id = '00000000-0000-4000-9242-000000000001'),
  'reversión 0242: el teléfono recibido sigue intacto');
SELECT 'test-rollback-0242.sql: OK' AS resultado;
