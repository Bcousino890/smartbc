-- SOLO PRUEBAS LOCALES (expediente 2026-10-20-bcp-01-compacto-y-opiniones). Tras rollback-0217.sql.
\set ON_ERROR_STOP 1
SELECT v AS tok_s FROM test_util.carry WHERE k = 'c2_tok_s' \gset
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalog_texts' AND column_name IN ('draft_title', 'pub_title')),
  'rollback 0217: sin columnas de título (se pierden los títulos propios)');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'catalog_text_save_draft' AND pronargs = 9),
  'rollback 0217: sin la sobrecarga de 9 argumentos (queda la de 0197)');
SELECT test_util.ok(EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'catalog_text_save_draft' AND pronargs = 8), 'rollback 0217: la de 0197 sigue');
SELECT test_util.ok((SELECT x->>'title' FROM jsonb_array_elements((get_public_catalog(:'tok_s'))->'snapshot'->'items') x WHERE x->>'slug' = 't3') = 'Texto 3',
  'rollback 0217: el lector vuelve a ver el título de la ficha');
\echo 'test-rollback-0217.sql: todo en verde'
