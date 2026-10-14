-- SOLO PRUEBAS LOCALES (BCP-01 ampliación C2). Antes de 0197 (con 0192–0196):
-- un catálogo MANUAL con enlace (su huella no debe cambiar con 0197) y una
-- vivienda con historia aprobada (esa sí cambia: la instantánea la incorpora).
-- Datos 100 % sintéticos, en Arganzuela.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
INSERT INTO properties (id, slug, title, status, country, bc_reference, zone, subzone, operation, operations, price,
                        bedrooms, bathrooms, square_meters, description, features, features_manual, created_at) VALUES
  ('f1000000-0000-0000-0000-000000000001', 't1', 'Texto 1', 'available', 'es', 'BC-6001', 'Arganzuela', 'Delicias', 'sale', '{sale}', 500000,
   3, 2, 110, 'Piso exterior y luminoso. Cocina reformada con salida a un patio tranquilo. Dormitorios amplios.', '{Ascensor,Terraza}', '{Trastero}', '2026-05-01'),
  ('f1000000-0000-0000-0000-000000000002', 't2', 'Texto 2', 'available', 'es', 'BC-6002', 'Arganzuela', 'Acacias', 'sale', '{sale}', 600000,
   2, 1, 80, 'Piso para reformar.', '{}', '{}', '2026-05-02'),
  ('f1000000-0000-0000-0000-000000000003', 't3', 'Texto 3', 'available', 'es', 'BC-6003', 'Arganzuela', 'Chopera', 'sale', '{sale}', 700000,
   4, 3, 150, 'Ático con terraza. Salón doble con chimenea.', '{Terraza}', '{}', '2026-05-03');
INSERT INTO property_photos (id, property_id, url, position, is_cover) VALUES
  ('f2000000-0000-0000-0000-000000000011', 'f1000000-0000-0000-0000-000000000001', 'https://storage.example/t1-0.webp', 0, true),
  ('f2000000-0000-0000-0000-000000000012', 'f1000000-0000-0000-0000-000000000001', 'https://storage.example/t1-1.webp', 1, false),
  ('f2000000-0000-0000-0000-000000000021', 'f1000000-0000-0000-0000-000000000002', 'https://storage.example/t2-0.webp', 0, true),
  ('f2000000-0000-0000-0000-000000000031', 'f1000000-0000-0000-0000-000000000003', 'https://storage.example/t3-0.webp', 0, true);
-- Historia aprobada de t3 (con un bloque rechazado y la entrada aprobada).
INSERT INTO property_story_versions (id, property_id, source_hash, status, prelude, prelude_status, prelude_headline)
VALUES ('f3000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000003', 'hash-sintetico', 'approved',
        'Un ático con luz todo el día.', 'approved', 'Luz y terraza');
INSERT INTO property_story_blocks (version_id, chapter, copy, position, status) VALUES
  ('f3000000-0000-0000-0000-000000000003', 'outdoor', 'Terraza orientada al sur.', 1, 'approved'),
  ('f3000000-0000-0000-0000-000000000003', 'living', 'Salón doble con chimenea.', 0, 'approved'),
  ('f3000000-0000-0000-0000-000000000003', 'kitchen', 'Bloque rechazado.', 2, 'rejected');
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Manual previo C2', NULL) AS cat_m \gset
SELECT catalog_add_property(:'owner', :'cat_m', 'f1000000-0000-0000-0000-000000000001');
SELECT catalog_add_property(:'owner', :'cat_m', 'f1000000-0000-0000-0000-000000000002');
SELECT token AS tok_m FROM catalog_share_create(:'owner', :'cat_m', 60) \gset
SELECT catalog_create(:'owner', 'Con historia C2', NULL) AS cat_s \gset
SELECT catalog_add_property(:'owner', :'cat_s', 'f1000000-0000-0000-0000-000000000003');
SELECT token AS tok_s FROM catalog_share_create(:'owner', :'cat_s', 60) \gset
RESET ROLE;
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry VALUES
  ('c2_cat_m', :'cat_m'), ('c2_tok_m', :'tok_m'), ('c2_cat_s', :'cat_s'), ('c2_tok_s', :'tok_s'),
  ('c2_fp_m', (get_public_catalog(:'tok_m'))->>'fingerprint'),
  ('c2_fp_s', (get_public_catalog(:'tok_s'))->>'fingerprint'),
  ('c2_global', (SELECT md5(string_agg(coalesce(description, '') || '|' || array_to_string(features, ','), ';' ORDER BY id)) FROM properties))
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-texts-pre.sql: catálogos previos creados'
