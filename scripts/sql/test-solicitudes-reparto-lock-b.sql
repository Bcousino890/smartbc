-- SOLO PRUEBAS LOCALES. Hallazgo 2, sesión B: un administrador reasigna a
-- Raúl a Sofía mientras A está dentro de route_lead.
\set ON_ERROR_STOP 1
SELECT reassign_client_admin('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000010',
  'b0000000-0000-0000-0000-00000000000b', 'Traspaso durante el reparto', 1);
