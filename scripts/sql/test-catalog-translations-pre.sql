-- SOLO PRUEBAS LOCALES (PR6). Antes de 0226 (con 0192–0223): un catálogo con
-- dos viviendas con texto publicado, plantilla «Vivir en…» aplicada en p1,
-- enlace general, dos asignaciones personales y sus huellas. Datos sintéticos.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set p1 '10000000-0000-0000-0000-000000000001'
\set p2 '10000000-0000-0000-0000-000000000002'
UPDATE properties SET zone = 'Salamanca', subzone = 'Recoletos', address = 'Calle Serrano 40', price = 1450000 WHERE id = :'p1';
UPDATE properties SET zone = 'Salamanca', subzone = 'Goya', address = 'Calle Velázquez 50', price = 900000 WHERE id = :'p2';
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000c8', 'c8@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES ('00000000-0000-0000-0000-0000000000c8', 'client', 'Cliente Ocho', 'c8@ejemplo.test');
INSERT INTO property_photos (id, property_id, url, position, is_cover) VALUES
  ('c6000000-0000-0000-0000-000000000001', :'p1', 'https://storage.example/tr-1.webp', 0, true),
  ('c6000000-0000-0000-0000-000000000002', :'p1', 'https://storage.example/tr-2.webp', 1, false);
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Previo a 0226', 'Dos viviendas en Salamanca.') AS cat \gset
SELECT catalog_add_property(:'owner', :'cat', :'p1');
SELECT catalog_add_property(:'owner', :'cat', :'p2');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p1', 'Ático con terraza en Recoletos', 'Salón de 40 m² con mucha luz.', NULL, NULL, 'manual', NULL) AS r1 \gset
SELECT catalog_text_publish(:'owner', :'cat', :'p1', :r1);
SELECT catalog_text_save_draft(:'owner', :'cat', :'p2', NULL, 'Piso tranquilo con cocina reformada.', NULL, NULL, 'manual', NULL) AS r2 \gset
SELECT catalog_text_publish(:'owner', :'cat', :'p2', :r2);
SELECT catalog_area_confirm(:'owner', :'p1', 'madrid/salamanca/recoletos');
SELECT (catalog_area_text_save_draft(:'owner', 'madrid/salamanca/recoletos', 'Recoletos es un barrio de fincas señoriales.', 'manual')) IS NOT NULL;
SELECT catalog_area_text_approve(:'owner', 'madrid/salamanca/recoletos', 'Recoletos es un barrio de fincas señoriales.');
SELECT catalog_area_text_apply(:'owner', :'cat', :'p1');
SELECT token AS tok FROM catalog_share_create(:'owner', :'cat', 60) \gset
SELECT token AS ptok FROM catalog_client_link_create(:'owner', :'cat', '00000000-0000-0000-0000-0000000000c3', 60) \gset
SELECT token AS ptok2 FROM catalog_client_link_create(:'owner', :'cat', '00000000-0000-0000-0000-0000000000c8', 60) \gset
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp \gset
RESET ROLE;
SELECT md5(row_to_json(p)::text) AS p1h FROM properties p WHERE id = :'p1' \gset
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry (k, v) VALUES ('t24_cat', :'cat'), ('t24_tok', :'tok'), ('t24_ptok', :'ptok'), ('t24_ptok2', :'ptok2'), ('t24_fp', :'fp'), ('t24_p1h', :'p1h')
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-translations-pre.sql: catálogo previo a 0226 creado'
