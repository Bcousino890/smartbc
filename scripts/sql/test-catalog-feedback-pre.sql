-- SOLO PRUEBAS LOCALES (B1). Antes de 0218: un catálogo con enlace general y su huella.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Previo a 0218', NULL) AS cat \gset
SELECT catalog_add_property(:'owner', :'cat', '10000000-0000-0000-0000-000000000001');
SELECT catalog_add_property(:'owner', :'cat', '10000000-0000-0000-0000-000000000004');
SELECT token AS tok FROM catalog_share_create(:'owner', :'cat', 60) \gset
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp \gset
RESET ROLE;
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry (k, v) VALUES ('t18_tok_pre', :'tok'), ('t18_fp_pre', :'fp')
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
