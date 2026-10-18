-- SOLO PRUEBAS LOCALES (BCP-01 P4). Ejecuta el SQL de deshacer documentado con el catálogo de la prueba.
\set ON_ERROR_STOP 1
SELECT v AS catalog FROM test_util.carry WHERE k = 'cv_cat' \gset
\i docs/changes/2026-10-18-bcp-01-buscar-e-importar/undo-conversion-0213.sql
