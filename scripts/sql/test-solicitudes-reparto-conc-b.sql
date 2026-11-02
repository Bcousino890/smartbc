-- SOLO PRUEBAS LOCALES. R12, sesión B: llega mientras A tiene bloqueado al
-- cliente; debe esperar y heredar el asesor que fije A.
\set ON_ERROR_STOP 1
SELECT route_lead('f0000000-0000-0000-0000-000000000902');
