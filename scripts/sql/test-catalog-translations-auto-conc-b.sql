-- SOLO PRUEBAS LOCALES (0228). Sesión B: OTRA vivienda del mismo catálogo a
-- la vez; espera al cerrojo del catálogo, ve la reserva de A y no lanza otra.
\set ON_ERROR_STOP 1
SELECT v AS src FROM test_util.carry WHERE k = 'ta_srck' \gset
SELECT v AS cat FROM test_util.carry WHERE k = 't24_cat' \gset
SET ROLE service_role;
SELECT catalog_tr_reserve_auto('00000000-0000-0000-0000-0000000000f1', :'src', 'it', :'cat', '10000000-0000-0000-0000-000000000002', '{"text": true}', 300,
       '{"max_active": 1, "daily_cap": 300, "max_failures": 5, "waits": [300]}')->>'state' AS st \gset
RESET ROLE;
INSERT INTO test_util.carry (k, v) VALUES ('ta_conc_b', :'st') ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
