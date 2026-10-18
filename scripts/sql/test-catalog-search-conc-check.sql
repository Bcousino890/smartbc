-- SOLO PRUEBAS LOCALES (BCP-01 P2). Tras A y B: exactamente 24.
\set ON_ERROR_STOP 1
SELECT test_util.ok((SELECT count(*) FROM catalog_items WHERE catalog_id = (SELECT id FROM catalogs WHERE title = 'Conc 24')) = 24,
  'concurrencia: dos altas a la vez con una plaza → 24, no 25');
