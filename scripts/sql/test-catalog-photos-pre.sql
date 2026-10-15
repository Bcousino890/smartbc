-- SOLO PRUEBAS LOCALES (BCP-01 E3). Antes de 0202 (con 0192–0197): un catálogo
-- MANUAL con enlace y viviendas con fotos pensadas para E3. Datos 100 %
-- sintéticos.
--   P: A (portada del CRM, pos. 0), B (1), C (2), D (2, empata con C) y
--      E (3, MISMA URL que B: la misma foto).
--   Q: una sola foto.   R: dos fotos (concurrencia).   S: fuera del catálogo.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
INSERT INTO properties (id, slug, title, status, country, archived_at, bc_reference, zone, subzone, operation, operations, price, created_at) VALUES
  ('b7000000-0000-0000-0000-000000000001', 'ph-p', 'Fotos P', 'available', 'es', NULL, 'BC-6601', 'Salamanca', 'Goya', 'sale', '{sale}', 900000, '2026-06-01'),
  ('b7000000-0000-0000-0000-000000000002', 'ph-q', 'Fotos Q', 'available', 'es', NULL, 'BC-6602', 'Salamanca', 'Goya', 'sale', '{sale}', 910000, '2026-06-02'),
  ('b7000000-0000-0000-0000-000000000003', 'ph-r', 'Fotos R', 'available', 'es', NULL, 'BC-6603', 'Salamanca', 'Goya', 'sale', '{sale}', 920000, '2026-06-03'),
  ('b7000000-0000-0000-0000-000000000004', 'ph-s', 'Fotos S', 'available', 'es', NULL, 'BC-6604', 'Salamanca', 'Goya', 'sale', '{sale}', 930000, '2026-06-04');
INSERT INTO property_photos (id, property_id, url, position, is_cover) VALUES
  ('c7000000-0000-0000-0000-00000000000a', 'b7000000-0000-0000-0000-000000000001', 'https://storage.example/p-a.webp', 0, true),
  ('c7000000-0000-0000-0000-00000000000b', 'b7000000-0000-0000-0000-000000000001', 'https://storage.example/p-b.webp', 1, false),
  ('c7000000-0000-0000-0000-00000000000c', 'b7000000-0000-0000-0000-000000000001', 'https://storage.example/p-c.webp', 2, false),
  ('c7000000-0000-0000-0000-00000000000d', 'b7000000-0000-0000-0000-000000000001', 'https://storage.example/p-d.webp', 2, false),
  ('c7000000-0000-0000-0000-00000000000e', 'b7000000-0000-0000-0000-000000000001', 'https://storage.example/p-b.webp', 3, false),
  ('c7000000-0000-0000-0000-000000000021', 'b7000000-0000-0000-0000-000000000002', 'https://storage.example/q-1.webp', 0, true),
  ('c7000000-0000-0000-0000-000000000031', 'b7000000-0000-0000-0000-000000000003', 'https://storage.example/r-1.webp', 0, true),
  ('c7000000-0000-0000-0000-000000000032', 'b7000000-0000-0000-0000-000000000003', 'https://storage.example/r-2.webp', 1, false),
  ('c7000000-0000-0000-0000-000000000041', 'b7000000-0000-0000-0000-000000000004', 'https://storage.example/s-1.webp', 0, true);

SET ROLE service_role;
SELECT catalog_create(:'owner', 'Fotos E3', NULL) AS cat \gset
SELECT catalog_add_property(:'owner', :'cat', 'b7000000-0000-0000-0000-000000000001');
SELECT catalog_add_property(:'owner', :'cat', 'b7000000-0000-0000-0000-000000000002');
SELECT catalog_add_property(:'owner', :'cat', 'b7000000-0000-0000-0000-000000000003');
SELECT token AS tok FROM catalog_share_create(:'owner', :'cat', 60) \gset
RESET ROLE;
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry VALUES
  ('e3_cat', :'cat'), ('e3_tok', :'tok'),
  ('e3_fp_pre', (get_public_catalog(:'tok'))->>'fingerprint')
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-photos-pre.sql: catálogo de fotos previo creado'
