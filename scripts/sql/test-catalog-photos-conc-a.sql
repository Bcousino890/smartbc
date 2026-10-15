-- SOLO PRUEBAS LOCALES (BCP-01 E3). Sesión A de la prueba de concurrencia:
-- excluye R1 y mantiene la transacción abierta 2 s antes de confirmar.
\set ON_ERROR_STOP 1
SELECT v AS cat FROM test_util.carry WHERE k = 'e3_cat' \gset
SET ROLE service_role;
BEGIN;
SELECT catalog_photo_exclude('00000000-0000-0000-0000-0000000000f1', :'cat', 'b7000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000031', true);
SELECT pg_sleep(2);
COMMIT;
