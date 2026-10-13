-- SOLO PRUEBAS LOCALES (BCP-01 ampliación X1). Tras rollback-0194.sql: sin
-- columnas ni funciones de contacto, catalog_create y la instantánea como en
-- 0192/0193, y los catálogos y enlaces intactos.
\set ON_ERROR_STOP 1
SELECT test_util.ok(to_regprocedure('catalog_set_contact(uuid,uuid,text,text,text)') IS NULL
  AND to_regprocedure('catalog_create_v2(uuid,text,text,text,text,text)') IS NULL
  AND to_regprocedure('catalog_contact_name_ok(text)') IS NULL, 'rollback 0194: funciones fuera');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_name = 'catalogs' AND column_name IN ('contact_name','contact_phone','contact_role')), 'rollback 0194: columnas fuera');
SELECT test_util.ok((SELECT count(*) FROM catalogs) > 0 AND (SELECT count(*) FROM catalog_shares) > 0, 'rollback 0194: catálogos y enlaces intactos');
SELECT v AS tok_old FROM test_util.carry WHERE k = 'tok_old' \gset
SELECT test_util.ok(NOT ((get_public_catalog(:'tok_old'))->'snapshot' ? 'contact')
  AND (get_public_catalog(:'tok_old'))->'snapshot' ? 'owner_name', 'rollback 0194: instantánea de 0193');
SET ROLE service_role;
SELECT test_util.ok(catalog_create('00000000-0000-0000-0000-0000000000f1', 'Tras reversión', NULL) IS NOT NULL, 'rollback 0194: catalog_create de 0192 funciona');
RESET ROLE;
\echo 'test-rollback-0194.sql: todo en verde'
