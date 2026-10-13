-- SOLO PRUEBAS LOCALES (BCP-01 ampliación C1). Después de rollback-0196.sql:
-- la base queda como tras 0195 (sin ajustes ni portada; la lista automática
-- vuelve a ser solo los criterios).
\set ON_ERROR_STOP 1
SELECT v AS cat FROM test_util.carry WHERE k = 'c1_cat_a' \gset
SELECT v AS tok FROM test_util.carry WHERE k = 'c1_tok_a' \gset
SELECT test_util.ok(to_regclass('public.catalog_adjustments') IS NULL, 'reversión: sin tabla de ajustes');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalogs' AND column_name IN ('cover_property_id', 'cover_photo_id')),
  'reversión: sin columnas de portada');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('catalog_adjust', 'catalog_adjust_clear', 'catalog_set_cover',
                                                                     'catalog_effective_ids', 'catalog_available_inclusions')),
  'reversión: sin funciones nuevas');
SELECT test_util.ok((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(
                       (SELECT to_jsonb(s) FROM catalog_select(:'cat', (SELECT criteria FROM catalogs WHERE id = :'cat')) s LIMIT 1)) k)
                     = ARRAY['ord', 'property_id', 'public_key', 'total'], 'reversión: catalog_select con las columnas de 0195');
SELECT test_util.ok((SELECT array_agg(x->>'slug' ORDER BY o) FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') WITH ORDINALITY AS t(x, o))
                     = ARRAY['d4', 'd3', 'd2', 'd1'] AND NOT ((get_public_catalog(:'tok'))->'snapshot' ? 'cover'),
  'reversión: el automático vuelve a ser solo criterios (con foto), sin portada');
SET ROLE anon;
SELECT test_util.expect_error(format('SELECT * FROM catalog_select(%L, %L)', :'cat', '{}'), 'insufficient_privilege');
RESET ROLE;
\echo 'test-rollback-0196.sql: reversión comprobada'
