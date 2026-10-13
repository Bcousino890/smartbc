-- SOLO PRUEBAS LOCALES (BCP-01). Tras rollback-0193.sql no queda ninguna
-- función de 0193 y las tablas de 0192 siguen.
SELECT test_util.ok(to_regprocedure('get_public_catalog(text)') IS NULL AND to_regprocedure('catalog_internal_snapshot(uuid)') IS NULL
  AND to_regprocedure('catalog_share_create(uuid,uuid,integer)') IS NULL, 'rollback 0193: funciones fuera');
SELECT test_util.ok(to_regclass('public.catalog_shares') IS NOT NULL AND to_regclass('public.catalogs') IS NOT NULL, 'rollback 0193: tablas de 0192 intactas');
