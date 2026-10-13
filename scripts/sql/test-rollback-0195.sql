-- SOLO PRUEBAS LOCALES (BCP-01 ampliación X5). Tras rollback-0195.sql: sin
-- tablas, columnas ni funciones de 0195; la instantánea y las funciones de
-- lista vuelven a 0194/0192; los catálogos automáticos vuelven a su lista
-- manual; catálogos, elementos y enlaces intactos.
\set ON_ERROR_STOP 1
SELECT test_util.ok(to_regclass('public.catalog_ads') IS NULL AND to_regclass('public.catalog_zone_terms') IS NULL, 'rollback 0195: tablas fuera');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalogs' AND column_name IN ('mode', 'criteria', 'key_salt')),
  'rollback 0195: columnas fuera');
SELECT test_util.ok(to_regprocedure('catalog_select(uuid,jsonb)') IS NULL AND to_regprocedure('catalog_set_mode(uuid,uuid,text,text)') IS NULL
  AND to_regprocedure('catalog_fold(text)') IS NULL AND to_regprocedure('catalog_item_json(uuid,text)') IS NULL, 'rollback 0195: funciones fuera');
SELECT test_util.ok((SELECT count(*) FROM catalogs) > 0 AND (SELECT count(*) FROM catalog_items) > 0 AND (SELECT count(*) FROM catalog_shares) > 0,
  'rollback 0195: catálogos, elementos y enlaces intactos');
SELECT v AS tok_pre FROM test_util.carry WHERE k = 'tok_pre' \gset
SELECT v AS fp_pre FROM test_util.carry WHERE k = 'fp_pre' \gset
SELECT test_util.ok((get_public_catalog(:'tok_pre'))->>'fingerprint' = :'fp_pre', 'rollback 0195: el catálogo manual previo sigue igual (misma huella)');
SET ROLE service_role;
SELECT catalog_create('00000000-0000-0000-0000-0000000000f1', 'Tras reversión 0195', NULL) AS c \gset
SELECT test_util.ok(catalog_add_property('00000000-0000-0000-0000-0000000000f1', :'c', '10000000-0000-0000-0000-000000000001') > 0,
  'rollback 0195: añadir a mano funciona (versión de 0192)');
RESET ROLE;
\echo 'test-rollback-0195.sql: todo en verde'
