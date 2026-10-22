-- SOLO PRUEBAS LOCALES (0228). Reaplicada tras la reversión: las huellas de
-- los enlaces no cambian y las funciones vuelven.
\set ON_ERROR_STOP 1
SELECT test_util.ok((SELECT md5(string_agg(coalesce((get_public_catalog(token))->>'fingerprint', ''), '|' ORDER BY token)) FROM catalog_client_links)
                    = (SELECT v FROM test_util.carry WHERE k = 'ta_fp_rb'), 'reaplicar 0228 no cambia ninguna huella');
SELECT test_util.ok(to_regproc('public.catalog_tr_reserve_auto') IS NOT NULL AND to_regproc('public.catalog_tr_publish') IS NOT NULL, 'reaplicada: funciones de vuelta');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_tr_texts WHERE status = 'approved' AND approval IS NULL), 'reaplicada: lo aprobado vuelve a quedar marcado («manual»)');
\echo 'test-catalog-translations-auto-reapply.sql: en verde'
