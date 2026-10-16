-- SOLO PRUEBAS LOCALES (BCP-01 E3). Tras rollback-0202.sql.
\set ON_ERROR_STOP 1
SELECT v AS tok FROM test_util.carry WHERE k = 'e3_tok' \gset
SELECT test_util.ok(to_regclass('public.catalog_photo_prefs') IS NULL, 'rollback 0202: la tabla de ajustes de fotos ya no existe (se pierden los ajustes)');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('catalog_photo_exclude', 'catalog_photo_opening', 'catalog_photo_excluded_urls', 'catalog_photo_key')),
  'rollback 0202: sin funciones de fotos');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') it,
                                 jsonb_array_elements(it->'photos') ph WHERE ph ? 'f' OR it ? 'pp'),
  'rollback 0202: la instantánea vuelve a la de 0197 (sin «f» ni «pp»): se verían todas las fotos');
\echo 'test-rollback-0202.sql: todo en verde'
