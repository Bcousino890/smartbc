-- SOLO PRUEBAS LOCALES (HOME · grupos). Guarda la huella de los catálogos antes de revertir.
\set ON_ERROR_STOP 1
INSERT INTO test_util.carry VALUES ('g_state_pre_rb', test_util.g_state()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
