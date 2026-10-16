-- SOLO PRUEBAS LOCALES (HOME · grupos, 0203). Antes de 0203 (con 0192–0202):
-- catálogos del dueño (uno con enlace compartido, uno archivado) y un SEGUNDO
-- dueño de la HOME con su propio catálogo (solo aquí, para probar lo ajeno).
-- Datos 100 % sintéticos.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set other '00000000-0000-0000-0000-0000000000a2'
INSERT INTO home_owners (profile_id) VALUES (:'other') ON CONFLICT DO NOTHING;

SET ROLE service_role;
SELECT catalog_create_v2(:'owner', 'Recoletos y Castellana', NULL, 'Fabricio Andree', '+34641457123', 'asesor') AS k1 \gset
SELECT catalog_create_v2(:'owner', 'Áticos en Salamanca', NULL, 'Fabricio Andree', '+34641457123', 'asesor') AS k2 \gset
SELECT catalog_create_v2(:'owner', 'Archivado', NULL, 'Fabricio Andree', '+34641457123', 'asesor') AS k3 \gset
SELECT catalog_create_v2(:'owner', 'Goya en venta', NULL, 'Fabricio Andree', '+34641457123', 'asesor') AS k4 \gset
SELECT catalog_create_v2(:'other', 'Del otro dueño', NULL, 'Otro Staff', '+34641457123', 'asesor') AS k9 \gset
SELECT catalog_add_property(:'owner', :'k1', '10000000-0000-0000-0000-000000000001');
SELECT catalog_add_property(:'owner', :'k1', '10000000-0000-0000-0000-000000000002');
SELECT catalog_add_property(:'owner', :'k2', '10000000-0000-0000-0000-000000000004');
SELECT catalog_add_property(:'owner', :'k4', '10000000-0000-0000-0000-000000000002');
SELECT catalog_set_status(:'owner', :'k3', 'archived');
SELECT token AS tok FROM catalog_share_create(:'owner', :'k1', 60) \gset
RESET ROLE;
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry VALUES ('g_k1', :'k1'), ('g_k2', :'k2'), ('g_k3', :'k3'), ('g_k4', :'k4'), ('g_k9', :'k9'), ('g_tok', :'tok')
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
-- La huella de comprobación (test_util.g_state) se calcula como service_role.
GRANT SELECT ON test_util.carry TO service_role;
\echo 'test-catalog-groups-pre.sql: catálogos previos creados'
