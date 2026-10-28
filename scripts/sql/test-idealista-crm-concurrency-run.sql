-- SOLO PRUEBAS LOCALES. Una de las dos sesiones concurrentes.
\set ON_ERROR_STOP 1
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM idealista_listings WHERE reference_code LIKE 'BC-C%' ORDER BY reference_code LOOP
    PERFORM crm_t.sync(r.id);
  END LOOP;
END $$;
