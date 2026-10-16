-- SOLO PRUEBAS LOCALES (HOME · grupos). Tras rollback-0203.sql.
\set ON_ERROR_STOP 1
SELECT test_util.ok(to_regclass('public.catalog_groups') IS NULL AND to_regclass('public.catalog_group_members') IS NULL,
  'rollback 0203: las tablas de grupos ya no existen (se pierde la organización)');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'catalog_group%' OR proname = 'catalog_create_in_group'),
  'rollback 0203: sin funciones de grupos');
SELECT test_util.ok(test_util.g_state() = (SELECT v FROM test_util.carry WHERE k = 'g_state_pre_rb'),
  'rollback 0203: los catálogos, sus tablas, la instantánea y la huella pública no cambian');
\echo 'test-rollback-0203.sql: todo en verde'
