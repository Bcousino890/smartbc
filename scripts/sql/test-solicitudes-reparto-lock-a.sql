-- SOLO PRUEBAS LOCALES. Hallazgo 2, sesión A: reparte la solicitud de Raúl
-- (con la pausa de 2 s dentro de route_lead).
\set ON_ERROR_STOP 1
SET test.pause_lead = 'on';
SELECT route_lead('f0000000-0000-0000-0000-000000000950');
