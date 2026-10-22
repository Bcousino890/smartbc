-- SOLO PRUEBAS LOCALES (PR7b). 0227 reaplicada (dos veces) tras su reversión:
-- todo apagado y las huellas de siempre.
\set ON_ERROR_STOP 1
SELECT v AS tok FROM test_util.carry WHERE k = 'fin_tok' \gset
SELECT v AS fp0 FROM test_util.carry WHERE k = 'fin_fp' \gset
SELECT test_util.ok((SELECT bool_and(photo_finish = false) FROM catalogs), 'reaplicada: apagado en todos los catálogos');
SET ROLE service_role;
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp0', 'reaplicada: la huella de siempre');
RESET ROLE;
\echo 'test-catalog-finish-reapply.sql: todo en verde'
