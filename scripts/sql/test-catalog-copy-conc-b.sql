-- SOLO PRUEBAS LOCALES (PR1). Sesión B: aprueba a la vez la descripción de p2
-- desde B (espera al bloqueo de A, no duplica el número de versión).
\set ON_ERROR_STOP 1
SELECT v AS cat FROM test_util.carry WHERE k = 't19_cat_b' \gset
SET ROLE service_role;
SELECT catalog_copy_approve('00000000-0000-0000-0000-0000000000f1', :'cat', '10000000-0000-0000-0000-000000000002', 'body');
