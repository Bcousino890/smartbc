-- SOLO PRUEBAS LOCALES. Hallazgo 2: reparto (route_lead) y reasignación
-- administrativa (reassign_client_admin) del MISMO cliente a la vez.
--
-- Para que la intercalación sea determinista, un trigger SOLO DE PRUEBA pausa
-- 2 s la primera escritura de la solicitud cuando la sesión lo pide
-- (test.pause_lead = on): la sesión A queda dentro de route_lead con sus
-- bloqueos tomados mientras la sesión B reasigna al cliente.
\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION test_util.pause_on_lead_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.pause_lead', true) = 'on' THEN
    PERFORM set_config('test.pause_lead', 'off', false);
    PERFORM pg_sleep(2);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_test_pause_lead ON idealista_leads;
CREATE TRIGGER trg_test_pause_lead BEFORE UPDATE ON idealista_leads
  FOR EACH ROW EXECUTE FUNCTION test_util.pause_on_lead_update();

-- Raúl: cliente verificado de Jaime, con una solicitud nueva sin clasificar.
INSERT INTO auth.users (id, email) VALUES ('c0000000-0000-0000-0000-000000000010', 'raul@test');
INSERT INTO profiles (id, role, full_name, email, phone, country, assigned_advisor_id,
                      advisor_assignment_source, advisor_assignment_version)
VALUES ('c0000000-0000-0000-0000-000000000010', 'client', 'Raúl', 'raul@test', '+34 699 000 010', 'es',
        'b0000000-0000-0000-0000-00000000000a', 'manual_admin', 1);
INSERT INTO idealista_leads (id, conversation_id, name, phone, client_id, converted_at)
VALUES ('f0000000-0000-0000-0000-000000000950', '950', 'Raúl', '+34 699 000 010',
        'c0000000-0000-0000-0000-000000000010', now());
