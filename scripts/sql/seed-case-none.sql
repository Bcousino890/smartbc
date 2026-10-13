-- SOLO PRUEBAS LOCALES (BCP-01). Escenario de siembra: NINGÚN usuario con el
-- correo de Fabricio → 0192 no debe dar acceso a nadie.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000a2', 'otro.staff@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES ('00000000-0000-0000-0000-0000000000a2', 'admin', 'Otro', 'otro.staff@ejemplo.test');
