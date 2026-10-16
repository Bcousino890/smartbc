-- SOLO PRUEBAS LOCALES (HOME · grupos). Sesión A del límite de 100: el otro
-- dueño está en 99; A crea el grupo 100 y mantiene la transacción 2 s.
\set ON_ERROR_STOP 1
SET ROLE service_role;
BEGIN;
SELECT catalog_group_create('00000000-0000-0000-0000-0000000000a2', NULL, :'name');
SELECT pg_sleep(2);
COMMIT;
