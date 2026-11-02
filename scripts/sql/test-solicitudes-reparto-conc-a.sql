-- SOLO PRUEBAS LOCALES. R12, sesión A: reparte la primera y retiene el
-- bloqueo dos segundos antes de confirmar.
\set ON_ERROR_STOP 1
BEGIN;
SELECT route_lead('f0000000-0000-0000-0000-000000000901');
SELECT pg_sleep(2);
COMMIT;
