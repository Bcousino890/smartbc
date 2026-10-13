-- SOLO PRUEBAS LOCALES (BCP-01 ampliación C1). Antes de 0196 (con 0192–0195):
-- un catálogo MANUAL y otro AUTOMÁTICO con enlace. Sus huellas no deben
-- cambiar con 0196 (sin ajustes ni portada). Datos 100 % sintéticos, en el
-- distrito de Tetuán (las pruebas de 0195 no lo usan).
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
INSERT INTO properties (id, slug, title, status, country, archived_at, bc_reference, zone, subzone, operation, operations, price, rent_price, created_at) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'd1',  'Tetuán 1',        'available', 'es', NULL,  'BC-7001', 'Tetuán',   'Cuatro Caminos', 'sale', '{sale}', 500000,  NULL, '2026-04-01'),
  ('d0000000-0000-0000-0000-000000000002', 'd2',  'Tetuán 2',        'available', 'es', NULL,  'BC-7002', 'Tetuán',   NULL,             'sale', '{sale}', 600000,  NULL, '2026-04-02'),
  ('d0000000-0000-0000-0000-000000000003', 'd3',  'Tetuán 3',        'available', 'es', NULL,  'BC-7003', 'Tetuán',   'Bellas Vistas',  'sale', '{sale}', 700000,  NULL, '2026-04-03'),
  ('d0000000-0000-0000-0000-000000000004', 'd4',  'Tetuán 4',        'reserved',  'es', NULL,  'BC-7004', 'Tetuán',   NULL,             'sale', '{sale}', 800000,  NULL, '2026-04-04'),
  ('d0000000-0000-0000-0000-000000000005', 'd5',  'Chamberí 5',      'available', 'es', NULL,  'BC-7005', 'Chamberí', 'Trafalgar',      'sale', '{sale}', 550000,  NULL, '2026-04-05'),
  ('d0000000-0000-0000-0000-000000000006', 'd6',  'Sin foto 6',      'available', 'es', NULL,  'BC-7006', 'Tetuán',   NULL,             'sale', '{sale}', 650000,  NULL, '2026-04-06'),
  ('d0000000-0000-0000-0000-000000000007', 'd7',  'Alquiler 7',      'available', 'es', NULL,  'BC-7007', 'Tetuán',   NULL,             'rent', '{rent}', 2000,    NULL, '2026-04-07'),
  ('d0000000-0000-0000-0000-000000000008', 'd8',  'Alquiler 8',      'available', 'es', NULL,  'BC-7008', 'Tetuán',   NULL,             'rent', '{rent}', 1500,    NULL, '2026-04-08'),
  ('d0000000-0000-0000-0000-000000000009', 'd9',  'Vendida 9',       'sold',      'es', NULL,  'BC-7009', 'Tetuán',   NULL,             'sale', '{sale}', 900000,  NULL, '2026-04-09'),
  ('d0000000-0000-0000-0000-000000000010', 'd10', 'Chile 10',        'available', 'cl', NULL,  'BC-7010', 'Tetuán',   NULL,             'sale', '{sale}', 900000,  NULL, '2026-04-10'),
  ('d0000000-0000-0000-0000-000000000011', 'd11', 'Archivada 11',    'available', 'es', now(), 'BC-7011', 'Tetuán',   NULL,             'sale', '{sale}', 450000,  NULL, '2026-04-11'),
  ('d0000000-0000-0000-0000-000000000012', 'd12', 'Cara 12',         'available', 'es', NULL,  'BC-7012', 'Tetuán',   NULL,             'sale', '{sale}', 1500000, NULL, '2026-04-12');
INSERT INTO property_photos (id, property_id, url, position, is_cover)
SELECT ('e0000000-0000-0000-0000-' || lpad(substr(slug, 2), 12, '0'))::uuid, id,
       'https://storage.example/' || slug || '-0.webp', 0, true
  FROM properties WHERE slug ~ '^d[0-9]+$' AND slug <> 'd6';
-- d3 tiene tres fotos (para elegir portada).
INSERT INTO property_photos (id, property_id, url, position, is_cover) VALUES
  ('e1000000-0000-0000-0000-000000000031', 'd0000000-0000-0000-0000-000000000003', 'https://storage.example/d3-1.webp', 1, false),
  ('e1000000-0000-0000-0000-000000000032', 'd0000000-0000-0000-0000-000000000003', 'https://storage.example/d3-2.webp', 2, false);

SET ROLE service_role;
SELECT catalog_create(:'owner', 'Manual previo C1', 'Intro') AS cat_m \gset
SELECT catalog_add_property(:'owner', :'cat_m', 'd0000000-0000-0000-0000-000000000001');
SELECT catalog_add_property(:'owner', :'cat_m', 'd0000000-0000-0000-0000-000000000003');
SELECT token AS tok_m FROM catalog_share_create(:'owner', :'cat_m', 60) \gset
SELECT catalog_create(:'owner', 'Automático previo C1', NULL) AS cat_a \gset
SELECT catalog_set_criteria(:'owner', :'cat_a', '{"operation":"sale","zones":[{"kind":"district","name":"Tetuán"}],"price_max":1000000,"max":3}');
SELECT catalog_set_mode(:'owner', :'cat_a', 'auto', NULL);
SELECT token AS tok_a FROM catalog_share_create(:'owner', :'cat_a', 60) \gset
RESET ROLE;
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry VALUES
  ('c1_cat_m', :'cat_m'), ('c1_tok_m', :'tok_m'), ('c1_cat_a', :'cat_a'), ('c1_tok_a', :'tok_a'),
  ('c1_fp_m', (get_public_catalog(:'tok_m'))->>'fingerprint'),
  ('c1_fp_a', (get_public_catalog(:'tok_a'))->>'fingerprint'),
  ('c1_snap_a', ((get_public_catalog(:'tok_a'))->'snapshot')::text)
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-adjust-pre.sql: catálogos previos (manual y automático) creados'
