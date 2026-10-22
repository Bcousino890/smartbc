-- SOLO PRUEBAS LOCALES (0228). Tras rollback-0228: sin funciones ni columnas
-- nuevas, la activación vuelve a exigir «completo» (0226), y NO se pierde
-- ninguna traducción ni copia (las huellas son las mismas).
\set ON_ERROR_STOP 1
SELECT v AS cat FROM test_util.carry WHERE k = 't24_cat' \gset
SELECT test_util.ok(to_regproc('public.catalog_tr_reserve_auto') IS NULL AND to_regproc('public.catalog_tr_publish') IS NULL AND to_regproc('public.catalog_tr_mark_reviewed') IS NULL, 'reversión: funciones nuevas fuera');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name IN ('catalog_tr_texts', 'catalog_tr_features') AND column_name = 'approval')
                AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalog_tr_jobs' AND column_name = 'auto'), 'reversión: columnas fuera');
SELECT test_util.ok((SELECT count(*) FROM catalog_tr_texts WHERE status = 'approved') >= 3 AND (SELECT count(*) FROM catalog_tr_copies WHERE catalog_id = :'cat') >= 2, 'reversión: las traducciones y las copias se conservan');
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, (SELECT version FROM catalogs WHERE id = %L), %L)',
  '00000000-0000-0000-0000-0000000000f1', :'cat', 'it', :'cat', '{"meta": "x", "items": []}'), 'lang_incomplete');
RESET ROLE;
CREATE TEMP TABLE fp_after_rb AS SELECT md5(string_agg(coalesce((get_public_catalog(token))->>'fingerprint', ''), '|' ORDER BY token)) AS h FROM catalog_client_links;
INSERT INTO test_util.carry (k, v) SELECT 'ta_fp_rb', h FROM fp_after_rb ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-rollback-0228.sql: reversión en verde'
