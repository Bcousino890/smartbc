-- SOLO PRUEBAS LOCALES (PR6). Sesión A: reserva la preparación de p2 en
-- italiano y mantiene la transacción abierta 2 s (como si la reserva y la
-- llamada fueran a la vez).
\set ON_ERROR_STOP 1
SELECT v AS src FROM test_util.carry WHERE k = 't24_src2' \gset
SET ROLE service_role;
BEGIN;
SELECT catalog_tr_reserve('00000000-0000-0000-0000-0000000000f1', :'src', 'it', NULL, NULL, '{"text": true}', 300, false)->>'state' AS st \gset
SELECT pg_sleep(2);
COMMIT;
RESET ROLE;
INSERT INTO test_util.carry (k, v) VALUES ('t24_conc_a', :'st') ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
