-- SOLO PRUEBAS LOCALES (BCP-01). Escenario de siembra: DOS usuarios cuyo
-- correo coincide sin distinguir mayúsculas → ambiguo → 0192 no da acceso.
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'fabricio.andree@bcousinoprop.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'Fabricio.Andree@bcousinoprop.com');
INSERT INTO profiles (id, role, full_name, email) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'admin', 'Fabricio A', 'fabricio.andree@bcousinoprop.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'admin', 'Fabricio B', 'Fabricio.Andree@bcousinoprop.com');
