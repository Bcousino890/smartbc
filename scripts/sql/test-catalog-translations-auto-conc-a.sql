-- SOLO PRUEBAS LOCALES (0228). Sesión A: una visita reserva una vivienda con
-- «como mucho 1 a la vez» y mantiene la transacción abierta 2 s.
\set ON_ERROR_STOP 1
SELECT v AS src FROM test_util.carry WHERE k = 'ta_srcg' \gset
SELECT v AS cat FROM test_util.carry WHERE k = 't24_cat' \gset
SET ROLE service_role;
BEGIN;
SELECT catalog_tr_reserve_auto('00000000-0000-0000-0000-0000000000f1', :'src', 'it', :'cat', '10000000-0000-0000-0000-000000000002', '{"text": true}', 300,
       '{"max_active": 1, "daily_cap": 300, "max_failures": 5, "waits": [300]}')->>'state' AS st \gset
SELECT pg_sleep(2);
COMMIT;
RESET ROLE;
INSERT INTO test_util.carry (k, v) VALUES ('ta_conc_a', :'st') ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
