-- SOLO PRUEBAS LOCALES (HOME · grupos). Sesión B del límite, simultánea a A:
-- con el bloqueo espera y da too_many_groups; sin él (contraprueba) pasaría.
\set ON_ERROR_STOP 1
SELECT clock_timestamp() AS t0 \gset
SET ROLE service_role;
\if :expect_fail
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, NULL, %L)', '00000000-0000-0000-0000-0000000000a2', :'name'), 'too_many_groups');
\else
SELECT catalog_group_create('00000000-0000-0000-0000-0000000000a2', NULL, :'name');
\endif
RESET ROLE;
INSERT INTO test_util.carry VALUES ('g_lim_wait', extract(epoch FROM clock_timestamp() - :'t0'::timestamptz)::text)
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
