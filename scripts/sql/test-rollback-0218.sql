-- SOLO PRUEBAS LOCALES (B1). Tras rollback-0218: vuelve 0193 y desaparece lo nuevo.
\set ON_ERROR_STOP 1
SELECT v AS tok_pre FROM test_util.carry WHERE k = 't18_tok_pre' \gset
SELECT v AS fp_pre FROM test_util.carry WHERE k = 't18_fp_pre' \gset
SELECT v AS tok5b FROM test_util.carry WHERE k = 't18_tok5b' \gset
SELECT test_util.ok(to_regclass('public.catalog_feedback') IS NULL AND to_regclass('public.catalog_client_links') IS NULL, 'reversión: tablas fuera');
SELECT test_util.ok(to_regproc('public.catalog_feedback_set') IS NULL AND to_regproc('public.catalog_public_keys') IS NULL
                    AND to_regproc('public.catalog_client_link_create') IS NULL, 'reversión: funciones fuera');
SET ROLE service_role;
SELECT test_util.ok((get_public_catalog(:'tok_pre'))->>'fingerprint' = :'fp_pre', 'reversión: el enlace general abre con la misma huella');
SELECT test_util.ok((get_public_catalog(:'tok5b'))->>'valid' = 'false', 'reversión: los enlaces personales dejan de abrir');
RESET ROLE;
SELECT test_util.ok((SELECT count(*) FROM crm_notifications WHERE type = 'catalog_feedback') > 0, 'reversión: los avisos ya creados se conservan');
