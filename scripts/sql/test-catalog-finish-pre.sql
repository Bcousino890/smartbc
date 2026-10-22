-- SOLO PRUEBAS LOCALES (PR7b). Antes de 0227 (con 0192–0226): un catálogo
-- MANUAL con enlace general, una asignación personal, ajustes de fotos de E3
-- (exclusión y apertura elegida) y otro catálogo aparte; sus instantáneas y
-- huellas. Datos 100 % sintéticos.
--   F: A (portada del CRM, pos. 0), B (1), C (2), D (3, MISMA URL que B).
--   G: una sola foto.   H: fuera del catálogo.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set c3    '00000000-0000-0000-0000-0000000000c3'
INSERT INTO properties (id, slug, title, status, country, archived_at, bc_reference, zone, subzone, operation, operations, price, created_at) VALUES
  ('b8000000-0000-0000-0000-000000000001', 'fin-f', 'Acabado F', 'available', 'es', NULL, 'BC-6701', 'Salamanca', 'Goya', 'sale', '{sale}', 900000, '2026-06-01'),
  ('b8000000-0000-0000-0000-000000000002', 'fin-g', 'Acabado G', 'available', 'es', NULL, 'BC-6702', 'Salamanca', 'Goya', 'sale', '{sale}', 910000, '2026-06-02'),
  ('b8000000-0000-0000-0000-000000000003', 'fin-h', 'Acabado H', 'available', 'es', NULL, 'BC-6703', 'Salamanca', 'Goya', 'sale', '{sale}', 920000, '2026-06-03');
INSERT INTO property_photos (id, property_id, url, position, is_cover) VALUES
  ('c8000000-0000-0000-0000-00000000000a', 'b8000000-0000-0000-0000-000000000001', 'https://storage.example/f-a.webp', 0, true),
  ('c8000000-0000-0000-0000-00000000000b', 'b8000000-0000-0000-0000-000000000001', 'https://storage.example/f-b.webp', 1, false),
  ('c8000000-0000-0000-0000-00000000000c', 'b8000000-0000-0000-0000-000000000001', 'https://storage.example/f-c.webp', 2, false),
  ('c8000000-0000-0000-0000-00000000000d', 'b8000000-0000-0000-0000-000000000001', 'https://storage.example/f-b.webp', 3, false),
  ('c8000000-0000-0000-0000-000000000021', 'b8000000-0000-0000-0000-000000000002', 'https://storage.example/g-1.webp', 0, true),
  ('c8000000-0000-0000-0000-000000000031', 'b8000000-0000-0000-0000-000000000003', 'https://storage.example/h-1.webp', 0, true);

SET ROLE service_role;
SELECT catalog_create(:'owner', 'Acabado previo a 0227', NULL) AS cat \gset
SELECT catalog_add_property(:'owner', :'cat', 'b8000000-0000-0000-0000-000000000001');
SELECT catalog_add_property(:'owner', :'cat', 'b8000000-0000-0000-0000-000000000002');
-- E3: C no se usa en este catálogo; B es la apertura elegida.
SELECT catalog_photo_exclude(:'owner', :'cat', 'b8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-00000000000c', true);
SELECT catalog_photo_opening(:'owner', :'cat', 'b8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-00000000000b');
SELECT token AS tok FROM catalog_share_create(:'owner', :'cat', 60) \gset
SELECT token AS ptok FROM catalog_client_link_create(:'owner', :'cat', :'c3', 60) \gset
-- Otro catálogo del mismo dueño (nunca se toca).
SELECT catalog_create(:'owner', 'Otro catálogo', NULL) AS cat2 \gset
SELECT catalog_add_property(:'owner', :'cat2', 'b8000000-0000-0000-0000-000000000001');
SELECT token AS tok2 FROM catalog_share_create(:'owner', :'cat2', 60) \gset
RESET ROLE;
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry (k, v) VALUES
  ('fin_cat', :'cat'), ('fin_cat2', :'cat2'), ('fin_tok', :'tok'), ('fin_ptok', :'ptok'), ('fin_tok2', :'tok2'),
  ('fin_fp',   (get_public_catalog(:'tok'))->>'fingerprint'),
  ('fin_pfp',  (get_public_catalog(:'ptok'))->>'fingerprint'),
  ('fin_fp2',  (get_public_catalog(:'tok2'))->>'fingerprint'),
  ('fin_snap', md5(((get_public_catalog(:'tok'))->'snapshot')::text)),
  ('fin_int',  md5(catalog_internal_snapshot(:'cat')::text)),
  ('fin_int2', md5(catalog_internal_snapshot(:'cat2')::text)),
  ('fin_mfp',  catalog_public_fingerprint(:'owner', :'cat')),
  ('fin_glob', md5((SELECT coalesce(string_agg(row_to_json(p)::text, '|' ORDER BY p.id), '') FROM properties p)
              || (SELECT coalesce(string_agg(row_to_json(ph)::text, '|' ORDER BY ph.id), '') FROM property_photos ph)))
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-finish-pre.sql: catálogos y enlaces previos a 0227 creados'
