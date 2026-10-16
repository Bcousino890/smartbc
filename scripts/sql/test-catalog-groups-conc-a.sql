-- SOLO PRUEBAS LOCALES (HOME · grupos). Sesión A: borra INTERNACIONALES y
-- mantiene la transacción abierta 2 s antes de confirmar.
\set ON_ERROR_STOP 1
SELECT v AS cli FROM test_util.carry WHERE k = 'g_cli' \gset
SET ROLE service_role;
BEGIN;
SELECT catalog_group_delete('00000000-0000-0000-0000-0000000000f1', :'cli');
SELECT pg_sleep(2);
COMMIT;
