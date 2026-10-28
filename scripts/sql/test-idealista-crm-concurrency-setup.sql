-- SOLO PRUEBAS LOCALES. Prepara 20 fichas con un alta confirmada para que dos
-- sesiones las sincronicen a la vez (test-idealista-crm-sync.sh).
\set ON_ERROR_STOP 1
UPDATE app_settings SET value = '{"enabled": true}' WHERE key = 'idealista_crm_sync';
DO $$
DECLARE i int; l uuid;
BEGIN
  FOR i IN 1..20 LOOP
    l := crm_t.listing('BC-C' || lpad(i::text, 3, '0'), true);
    PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 70000 + i);
  END LOOP;
END $$;
