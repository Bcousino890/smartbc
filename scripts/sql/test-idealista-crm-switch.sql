-- ============================================================================
-- SOLO PRUEBAS LOCALES (interruptor en el CRM, 0234). Base temporal con 0232,
-- 0233 y 0234 aplicadas; datos sintéticos. Lo lanza test-idealista-crm-sync.sh.
-- ============================================================================
\set ON_ERROR_STOP 1
INSERT INTO schema_migrations VALUES ('0232_idealista_reference_boundary.sql'), ('0233_idealista_crm_sync.sql') ON CONFLICT DO NOTHING;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000f9', 'dueno@example.test') ON CONFLICT DO NOTHING;

DO $$
DECLARE r jsonb; actor uuid := '00000000-0000-0000-0000-0000000000f9';
BEGIN
  -- 1. Sin «RESERVADO» en es: el informe lo marca y encender se niega sin cambiar nada.
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM idealista_crm_activation_report() WHERE comprobacion = 'una sola «RESERVADO» en es' AND NOT ok),
                       'informe: falta RESERVADO → ✗');
  r := idealista_crm_set_enabled(true, actor);
  PERFORM test_util.ok(r->>'error' = 'checks_failing' AND r->'failing' ? 'una sola «RESERVADO» en es', 'encender se niega y dice por qué');
  PERFORM test_util.ok(NOT idealista_crm_sync_enabled() AND NOT EXISTS (SELECT 1 FROM idealista_crm_switch_log), 'no cambia nada ni registra');

  -- 2. Con la etiqueta: todo en verde y enciende.
  INSERT INTO property_tags (country, name) VALUES ('es', 'RESERVADO');
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM idealista_crm_activation_report() WHERE NOT ok)
                       AND (SELECT count(*) FROM idealista_crm_activation_report()) > 100, 'informe: todo en verde (más de 100 comprobaciones)');
  r := idealista_crm_set_enabled(true, actor);
  PERFORM test_util.ok((r->>'ok')::boolean AND idealista_crm_sync_enabled(), 'encender: encendida');
  PERFORM test_util.ok((SELECT value->>'changed_by' FROM app_settings WHERE key = 'idealista_crm_sync') = actor::text, 'queda quién lo cambió');
  PERFORM test_util.ok((SELECT enabled AND report_ok AND actor_id = actor FROM idealista_crm_switch_log ORDER BY id DESC LIMIT 1), 'registro: encendida con informe bien');

  -- 3. Un trigger desactivado: el informe lo marca; encender se niega; apagar siempre funciona.
  ALTER TABLE favorites DISABLE TRIGGER trg_reject_reference_only;
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM idealista_crm_activation_report()
                                WHERE comprobacion = 'trigger trg_reject_reference_only en favorites · activado' AND NOT ok), 'informe: trigger desactivado → ✗');
  r := idealista_crm_set_enabled(false, actor);
  PERFORM test_util.ok((r->>'ok')::boolean AND NOT idealista_crm_sync_enabled(), 'apagar funciona aunque algo esté en rojo');
  PERFORM test_util.ok((SELECT NOT enabled AND NOT report_ok AND failing IS NOT NULL FROM idealista_crm_switch_log ORDER BY id DESC LIMIT 1),
                       'registro: apagada, con lo que fallaba');
  r := idealista_crm_set_enabled(true, actor);
  PERFORM test_util.ok(r->>'error' = 'checks_failing' AND NOT idealista_crm_sync_enabled(), 'encender vuelve a negarse');
  ALTER TABLE favorites ENABLE TRIGGER trg_reject_reference_only;

  -- 3b. Algo que FALTA (sale NULL) también bloquea.
  DROP TRIGGER trg_reject_reference_only ON client_portal_links;
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM idealista_crm_activation_report()
                                WHERE comprobacion = 'trigger trg_reject_reference_only en client_portal_links · activado'
                                  AND encontrado = 'FALTA (NULL)' AND NOT ok), 'informe: trigger que falta → FALTA (NULL) y ✗');
  PERFORM test_util.ok((idealista_crm_set_enabled(true, actor))->>'error' = 'checks_failing', 'encender se niega si falta algo');
  CREATE TRIGGER trg_reject_reference_only BEFORE INSERT OR UPDATE OF property_id ON client_portal_links
    FOR EACH ROW EXECUTE FUNCTION reject_reference_only_property();

  -- 4. Entradas no válidas.
  PERFORM test_util.ok((idealista_crm_set_enabled(true, NULL))->>'error' = 'invalid_input', 'sin usuario no se cambia');
  PERFORM test_util.ok((idealista_crm_set_enabled(NULL, actor))->>'error' = 'invalid_input', 'sin valor no se cambia');
END $$;

-- 5. Permisos.
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM test_util.expect_error('SELECT * FROM idealista_crm_activation_report()', 'insufficient_privilege');
  PERFORM test_util.expect_error($q$SELECT idealista_crm_set_enabled(true, '00000000-0000-0000-0000-0000000000f9')$q$, 'insufficient_privilege');
  PERFORM test_util.expect_error('SELECT * FROM idealista_crm_switch_log', 'insufficient_privilege');
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  PERFORM test_util.expect_error('SELECT * FROM idealista_crm_activation_report()', 'insufficient_privilege');
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
  PERFORM test_util.ok((SELECT count(*) FROM idealista_crm_activation_report()) > 0, 'service_role: puede leer el informe');
  PERFORM test_util.ok((SELECT count(*) FROM idealista_crm_switch_log) >= 2, 'service_role: puede leer el registro');
END $$;
RESET ROLE;
\echo 'test-idealista-crm-switch.sql: todas las comprobaciones en verde'
