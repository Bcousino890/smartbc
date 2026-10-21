-- SOLO PRUEBAS LOCALES (PR3). Tras 0220 y antes de 0222: un catálogo con
-- enlace, la zona de p1 confirmada y su huella.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
UPDATE properties SET zone = 'Salamanca', subzone = 'Recoletos', address = 'Calle Serrano 40' WHERE id = '10000000-0000-0000-0000-000000000001';
UPDATE properties SET zone = 'Salamanca', subzone = 'Goya', address = 'Calle Velázquez 50' WHERE id = '10000000-0000-0000-0000-000000000002';
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Previo a 0222', NULL) AS cat \gset
SELECT catalog_add_property(:'owner', :'cat', '10000000-0000-0000-0000-000000000001');
SELECT catalog_add_property(:'owner', :'cat', '10000000-0000-0000-0000-000000000002');
SELECT catalog_area_confirm(:'owner', '10000000-0000-0000-0000-000000000001', 'madrid/salamanca/recoletos');
SELECT token AS tok FROM catalog_share_create(:'owner', :'cat', 60) \gset
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp \gset
RESET ROLE;
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry (k, v) VALUES ('t22_cat', :'cat'), ('t22_tok', :'tok'), ('t22_fp', :'fp')
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
