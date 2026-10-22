-- SOLO PRUEBAS LOCALES (PR6). Tras rollback-0226: la instantánea de 0223, sin
-- tablas ni funciones nuevas; los idiomas elegidos (0223) se conservan.
\set ON_ERROR_STOP 1
SELECT v AS tok FROM test_util.carry WHERE k = 't24_tok' \gset
SELECT test_util.ok(to_regclass('public.catalog_tr_sources') IS NULL AND to_regclass('public.catalog_tr_texts') IS NULL AND to_regclass('public.catalog_tr_features') IS NULL
                AND to_regclass('public.catalog_tr_copies') IS NULL AND to_regclass('public.catalog_tr_meta_copies') IS NULL AND to_regclass('public.catalog_tr_jobs') IS NULL, 'reversión: tablas fuera');
SELECT test_util.ok(to_regproc('public.catalog_tr_reserve') IS NULL AND to_regproc('public.catalog_tr_activate') IS NULL AND to_regproc('public.catalog_tr_es_state') IS NULL, 'reversión: funciones fuera');
SET ROLE service_role;
SELECT test_util.ok((get_public_catalog(:'tok'))->>'valid' = 'true' AND (get_public_catalog(:'tok'))->'snapshot'->>'lang' = 'en'
                AND NOT ((get_public_catalog(:'tok'))->'snapshot' ? 'trm')
                AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') x WHERE x ? 'tr'), 'reversión: el catálogo abre con su idioma (0223) y sin traducciones');
RESET ROLE;
