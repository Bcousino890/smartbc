-- SOLO PRUEBAS LOCALES (HOME · grupos). Sesión B, SIMULTÁNEA a la A: asigna
-- un catálogo al grupo que A está borrando. Espera al bloqueo del dueño y,
-- cuando A confirma, el grupo ya no existe: 'forbidden' y ninguna fila huérfana.
\set ON_ERROR_STOP 1
SELECT v AS cli FROM test_util.carry WHERE k = 'g_cli' \gset
SELECT v AS k1 FROM test_util.carry WHERE k = 'g_k1' \gset
SELECT clock_timestamp() AS t0 \gset
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_group_set_member(%L, %L, %L, true)',
  '00000000-0000-0000-0000-0000000000f1', :'cli', :'k1'), 'forbidden');
RESET ROLE;
INSERT INTO test_util.carry VALUES ('g_conc_wait', extract(epoch FROM clock_timestamp() - :'t0'::timestamptz)::text)
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
