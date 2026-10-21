-- SOLO PRUEBAS LOCALES (PR1). Sesión A: aprueba el título de p2 desde A y
-- mantiene la transacción abierta 2 s.
\set ON_ERROR_STOP 1
SELECT v AS cat FROM test_util.carry WHERE k = 't19_cat_a' \gset
SET ROLE service_role;
BEGIN;
SELECT catalog_text_save_draft('00000000-0000-0000-0000-0000000000f1', :'cat', '10000000-0000-0000-0000-000000000002', 'Título concurrente A', 'Piso tranquilo, cocina reformada.', 'Entrada del piso.', NULL, 'manual', NULL) AS r \gset
SELECT catalog_text_publish('00000000-0000-0000-0000-0000000000f1', :'cat', '10000000-0000-0000-0000-000000000002', :r);
SELECT catalog_copy_approve('00000000-0000-0000-0000-0000000000f1', :'cat', '10000000-0000-0000-0000-000000000002', 'title');
SELECT pg_sleep(2);
COMMIT;
