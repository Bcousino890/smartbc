-- SOLO PRUEBAS LOCALES (BCP-01 P4). Tras rollback-0213.sql.
\set ON_ERROR_STOP 1
SELECT test_util.ok(to_regprocedure('catalog_convert_explicit(uuid, uuid, bigint, uuid[])') IS NULL, 'reversión: sin catalog_convert_explicit');
SELECT test_util.ok(to_regprocedure('catalog_conversion_preview(uuid, uuid)') IS NULL, 'reversión: sin vista previa');
SELECT test_util.ok(to_regclass('catalog_conversions') IS NOT NULL, 'reversión: el registro se conserva (para deshacer)');
SELECT 'test-rollback-0213.sql: OK' AS resultado;
