-- SOLO PRUEBAS LOCALES (BCP-01). Datos 100 % sintéticos: ids fijos para que
-- los tests los nombren; correos inventados salvo el de Fabricio, que es el
-- que la siembra de 0192 busca.

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'fabricio.andree@bcousinoprop.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'otro.staff@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'cliente@ejemplo.test');

INSERT INTO profiles (id, role, full_name, email) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'admin',  'Fabricio Andree', 'fabricio.andree@bcousinoprop.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin',  'Otro Staff',      'otro.staff@ejemplo.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'client', 'Cliente Prueba',  'cliente@ejemplo.test');

INSERT INTO properties (id, slug, title, status, country, archived_at, bc_reference) VALUES
  ('10000000-0000-0000-0000-000000000001', 'atico-demo-1',    'Ático demo',      'available', 'es', NULL,  'BC-9001'),
  ('10000000-0000-0000-0000-000000000002', 'piso-demo-2',     'Piso demo',       'available', 'es', NULL,  'BC-9002'),
  ('10000000-0000-0000-0000-000000000003', 'duplex-demo-3',   'Dúplex demo',     'reserved',  'es', NULL,  'BC-9003'),
  ('10000000-0000-0000-0000-000000000004', 'estudio-demo-4',  'Estudio demo',    'available', 'es', NULL,  'BC-9004'),
  ('10000000-0000-0000-0000-000000000005', 'vendido-demo-5',  'Vendido demo',    'sold',      'es', NULL,  'BC-9005'),
  ('10000000-0000-0000-0000-000000000006', 'chile-demo-6',    'Depto Chile demo','available', 'cl', NULL,  'BC-9006'),
  ('10000000-0000-0000-0000-000000000007', 'archivado-demo-7','Archivado demo',  'available', 'es', now(), 'BC-9007');
