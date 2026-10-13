-- SOLO PRUEBAS LOCALES (BCP-01 ampliación X5): un catálogo MANUAL creado
-- antes de 0195 (con 0192–0194). Su huella no debe cambiar con 0195.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
INSERT INTO property_photos (property_id, url, position) VALUES
  ('10000000-0000-0000-0000-000000000001', 'https://storage.example/pre-1.webp', 0);
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Manual anterior', 'Intro') AS cat_pre \gset
SELECT catalog_add_property(:'owner', :'cat_pre', '10000000-0000-0000-0000-000000000001');
SELECT catalog_add_property(:'owner', :'cat_pre', '10000000-0000-0000-0000-000000000002');
SELECT token AS tok_pre FROM catalog_share_create(:'owner', :'cat_pre', 60) \gset
RESET ROLE;
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry VALUES ('cat_pre', :'cat_pre'), ('tok_pre', :'tok_pre'),
  ('fp_pre', (get_public_catalog(:'tok_pre'))->>'fingerprint'),
  ('snap_pre', ((get_public_catalog(:'tok_pre'))->'snapshot')::text)
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-auto-pre.sql: catálogo manual previo creado'
