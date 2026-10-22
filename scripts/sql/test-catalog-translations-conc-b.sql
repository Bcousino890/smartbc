-- SOLO PRUEBAS LOCALES (PR6). Sesión B: la misma petición a la vez (espera
-- al bloqueo de A y ve su reserva: no lanza otra).
\set ON_ERROR_STOP 1
SELECT v AS src FROM test_util.carry WHERE k = 't24_src2' \gset
SET ROLE service_role;
SELECT catalog_tr_reserve('00000000-0000-0000-0000-0000000000f1', :'src', 'it', NULL, NULL, '{"text": true}', 300, false)->>'state' AS st \gset
RESET ROLE;
INSERT INTO test_util.carry (k, v) VALUES ('t24_conc_b', :'st') ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
