-- SOLO PRUEBAS LOCALES (PR7b). Tras rollback-0227.sql: la instantánea de 0222,
-- sin columna, funciones ni marcas; las exclusiones de E3 se conservan.
\set ON_ERROR_STOP 1
SELECT v AS cat   FROM test_util.carry WHERE k = 'fin_cat' \gset
SELECT v AS tok   FROM test_util.carry WHERE k = 'fin_tok' \gset
SELECT v AS fp0   FROM test_util.carry WHERE k = 'fin_fp' \gset
SELECT v AS snap0 FROM test_util.carry WHERE k = 'fin_snap' \gset
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalogs' AND column_name = 'photo_finish'), 'reversión: sin catalogs.photo_finish');
SELECT test_util.ok(to_regproc('public.catalog_set_photo_finish') IS NULL AND to_regproc('public.catalog_photo_no_finish') IS NULL, 'reversión: funciones fuera');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_photo_prefs WHERE kind = 'no_finish'), 'reversión: sin marcas «sin acabado»');
SELECT test_util.expect_error(format('INSERT INTO catalog_photo_prefs (catalog_id, property_id, photo_id, kind) VALUES (%L, %L, %L, %L)', :'cat', 'b8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-00000000000a', 'no_finish'), 'check_violation');
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_photo_prefs WHERE catalog_id = :'cat' AND kind = 'exclude'), 'reversión: las exclusiones de E3 se conservan');
SET ROLE service_role;
SELECT test_util.ok(md5(((get_public_catalog(:'tok'))->'snapshot')::text) = :'snap0' AND (get_public_catalog(:'tok'))->>'fingerprint' = :'fp0',
  'reversión: el catálogo abre con la instantánea y la huella de antes de 0227');
RESET ROLE;
\echo 'test-rollback-0227.sql: todo en verde'
