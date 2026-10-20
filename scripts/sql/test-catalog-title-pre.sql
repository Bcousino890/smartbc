-- SOLO PRUEBAS LOCALES (expediente 2026-10-20-bcp-01-compacto-y-opiniones).
-- Antes de 0217: huella de referencia de los catálogos de C2 (0202 ya la
-- cambió una vez para todos, N2).
\set ON_ERROR_STOP 1
SELECT v AS tok FROM test_util.carry WHERE k = 'c2_tok_m' \gset
INSERT INTO test_util.carry VALUES ('t17_fp_m', (get_public_catalog(:'tok'))->>'fingerprint')
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-title-pre.sql: huella de referencia guardada'
