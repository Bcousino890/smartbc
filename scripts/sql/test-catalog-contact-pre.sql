-- SOLO PRUEBAS LOCALES (BCP-01 ampliación X1): datos creados ANTES de 0194,
-- con 0192 + 0193, para comprobar el relleno y la compatibilidad.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Catálogo anterior', 'Intro') AS cat_old \gset
SELECT catalog_add_property(:'owner', :'cat_old', '10000000-0000-0000-0000-000000000001');
SELECT token AS tok_old FROM catalog_share_create(:'owner', :'cat_old', 60) \gset
RESET ROLE;
-- Se guardan para el test posterior (otra sesión de psql).
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry VALUES ('cat_old', :'cat_old'), ('tok_old', :'tok_old'),
  ('fp_old', (get_public_catalog(:'tok_old'))->>'fingerprint')
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-contact-pre.sql: datos previos creados'
