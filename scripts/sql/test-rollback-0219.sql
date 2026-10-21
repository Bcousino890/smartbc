-- SOLO PRUEBAS LOCALES (PR1). Tras rollback-0219: vuelve catalog_add_property de 0212.
\set ON_ERROR_STOP 1
SELECT v AS tok FROM test_util.carry WHERE k = 't19_tok_c' \gset
SELECT test_util.ok(to_regclass('public.property_copy_versions') IS NULL, 'reversión: tabla fuera');
SELECT test_util.ok(to_regproc('public.catalog_copy_approve') IS NULL AND to_regproc('public.catalog_copy_candidates') IS NULL, 'reversión: funciones fuera');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalog_texts' AND column_name = 'copy_version_id'), 'reversión: columna fuera');
SET ROLE service_role;
SELECT test_util.ok((get_public_catalog(:'tok'))->>'valid' = 'true' AND (SELECT count(*) FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items')) = 1,
  'reversión: los catálogos con textos copiados siguen abriendo con su texto');
SELECT catalog_create('00000000-0000-0000-0000-0000000000f1', 'Tras la reversión', NULL) AS c \gset
SELECT catalog_add_property('00000000-0000-0000-0000-0000000000f1', :'c', '10000000-0000-0000-0000-000000000002');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = :'c'), 'reversión: añadir vuelve a no copiar nada');
RESET ROLE;
