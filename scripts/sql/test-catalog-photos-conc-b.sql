-- SOLO PRUEBAS LOCALES (BCP-01 E3). Sesión B, SIMULTÁNEA a la A: excluye R2.
-- Tiene que esperar al bloqueo del catálogo y, cuando A confirma, fallar con
-- last_photo (sin el bloqueo, las dos contarían «queda otra» y R quedaría sin fotos).
\set ON_ERROR_STOP 1
SELECT v AS cat FROM test_util.carry WHERE k = 'e3_cat' \gset
SELECT clock_timestamp() AS t0 \gset
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_photo_exclude(%L, %L, %L, %L, true)',
  '00000000-0000-0000-0000-0000000000f1', :'cat', 'b7000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000032'), 'last_photo');
RESET ROLE;
INSERT INTO test_util.carry VALUES ('e3_conc_wait', extract(epoch FROM clock_timestamp() - :'t0'::timestamptz)::text)
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
