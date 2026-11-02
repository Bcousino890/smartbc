-- SOLO PRUEBAS LOCALES. R12: Ana, cliente verificada SIN asesor, envía dos
-- primeras consultas a la vez por pisos de asesores distintos (Castelló →
-- Jaime, Goya → Sofía). Debe quedar UNA primera asignación.
\set ON_ERROR_STOP 1
INSERT INTO auth.users (id, email) VALUES ('c0000000-0000-0000-0000-000000000009', 'ana@test');
INSERT INTO profiles (id, role, full_name, email, phone, country)
VALUES ('c0000000-0000-0000-0000-000000000009', 'client', 'Ana', 'ana@test', '+34 699 000 009', 'es');
INSERT INTO idealista_leads (id, conversation_id, name, phone, property_ref, client_id, converted_at) VALUES
  ('f0000000-0000-0000-0000-000000000901', '901', 'Ana', '+34 699 000 009', 'BC-100', 'c0000000-0000-0000-0000-000000000009', now()),
  ('f0000000-0000-0000-0000-000000000902', '902', 'Ana', '+34 699 000 009', 'BC-200', 'c0000000-0000-0000-0000-000000000009', now());
SELECT test_util.ok((SELECT advisor_id FROM property_routing_rules WHERE property_id = 'd0000000-0000-0000-0000-000000000001')
  IS DISTINCT FROM (SELECT advisor_id FROM property_routing_rules WHERE property_id = 'd0000000-0000-0000-0000-000000000002'),
  'R12 · preparación: los dos pisos tienen asesores distintos');
