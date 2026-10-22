-- SOLO PRUEBAS LOCALES (PR4). Tras rollback-0223: funciones de 0218/0193, sin columnas nuevas.
\set ON_ERROR_STOP 1
SELECT v AS tok FROM test_util.carry WHERE k = 't23_tok' \gset
SELECT v AS ptok2 FROM test_util.carry WHERE k = 't23_tok' \gset
SELECT v AS fp0 FROM test_util.carry WHERE k = 't23_fp' \gset
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalogs' AND column_name = 'default_lang')
                AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'catalog_client_links' AND column_name = 'lang'), 'reversión: columnas fuera');
SELECT test_util.ok(to_regproc('public.catalog_lang_snapshot') IS NULL AND to_regproc('public.catalog_set_default_lang') IS NULL
                AND to_regproc('public.catalog_client_link_set_lang') IS NULL, 'reversión: funciones fuera');
SET ROLE service_role;
SELECT test_util.ok((get_public_catalog(:'tok'))->>'valid' = 'true' AND NOT ((get_public_catalog(:'tok'))->'snapshot' ? 'lang'), 'reversión: el catálogo abre sin «lang»');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp0', 'reversión: vuelve la huella de antes de 0223');
SELECT test_util.ok((SELECT fingerprint FROM get_catalog_states(ARRAY[:'tok'])) = :'fp0', 'reversión: el vigilante también');
RESET ROLE;
