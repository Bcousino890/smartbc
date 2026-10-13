-- SOLO PRUEBAS LOCALES (BCP-01 ampliación C2). Después de rollback-0197.sql:
-- la base queda como tras 0196.
\set ON_ERROR_STOP 1
SELECT v AS tok FROM test_util.carry WHERE k = 'c2_tok_m' \gset
SELECT v AS tok_s FROM test_util.carry WHERE k = 'c2_tok_s' \gset
SELECT test_util.ok(to_regclass('public.catalog_texts') IS NULL, 'reversión: sin tabla de textos');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('catalog_item_json_c', 'catalog_text_publish', 'catalog_text_save_draft',
                                                                     'catalog_text_states', 'catalog_source_hash', 'catalog_text_blocker')),
  'reversión: sin funciones nuevas');
SELECT test_util.ok(NOT ((get_public_catalog(:'tok_s'))->'snapshot'->'items'->0 ? 'story')
  AND ((get_public_catalog(:'tok'))->'snapshot')::text !~ '"k":', 'reversión: la instantánea vuelve a no llevar historia ni clases de foto');
SET ROLE anon;
SELECT test_util.expect_error(format('SELECT catalog_internal_snapshot(%L)', '00000000-0000-0000-0000-000000000000'), 'insufficient_privilege');
RESET ROLE;
\echo 'test-rollback-0197.sql: reversión comprobada'
