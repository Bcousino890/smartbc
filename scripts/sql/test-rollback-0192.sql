-- SOLO PRUEBAS LOCALES (BCP-01). Tras aplicar rollback-0192.sql no queda
-- ningún objeto de 0192 y properties sigue intacta.
SELECT test_util.ok(to_regclass('public.catalogs') IS NULL AND to_regclass('public.catalog_items') IS NULL
  AND to_regclass('public.catalog_shares') IS NULL AND to_regclass('public.home_owners') IS NULL, 'rollback: tablas fuera');
SELECT test_util.ok(to_regprocedure('catalog_create(uuid,text,text)') IS NULL AND to_regprocedure('catalog_require_owner(uuid,uuid)') IS NULL, 'rollback: funciones fuera');
SELECT test_util.ok((SELECT count(*) FROM properties) = 6, 'rollback: properties intacta');
