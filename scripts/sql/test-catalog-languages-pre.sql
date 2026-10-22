-- SOLO PRUEBAS LOCALES (PR4). Antes de 0223: un catálogo con enlace general,
-- una asignación personal y sus huellas.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set c3    '00000000-0000-0000-0000-0000000000c3'
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Previo a 0223', NULL) AS cat \gset
SELECT catalog_add_property(:'owner', :'cat', '10000000-0000-0000-0000-000000000001');
SELECT catalog_add_property(:'owner', :'cat', '10000000-0000-0000-0000-000000000002');
SELECT token AS tok FROM catalog_share_create(:'owner', :'cat', 60) \gset
SELECT token AS ptok FROM catalog_client_link_create(:'owner', :'cat', :'c3', 60) \gset
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp \gset
SELECT (get_public_catalog(:'ptok'))->>'fingerprint' AS pfp \gset
RESET ROLE;
SELECT md5(row_to_json(p)::text) AS p1h FROM properties p WHERE id = '10000000-0000-0000-0000-000000000001' \gset
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry (k, v) VALUES ('t23_cat', :'cat'), ('t23_tok', :'tok'), ('t23_ptok', :'ptok'), ('t23_fp', :'fp'), ('t23_pfp', :'pfp'), ('t23_p1h', :'p1h')
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
