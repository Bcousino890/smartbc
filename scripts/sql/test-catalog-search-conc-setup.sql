-- SOLO PRUEBAS LOCALES (BCP-01 P2). Catálogo con 23 viviendas visibles.
\set ON_ERROR_STOP 1
SET ROLE service_role;
SELECT catalog_create('00000000-0000-0000-0000-0000000000f1', 'Conc 24', NULL) AS c \gset
SELECT count(catalog_add_property('00000000-0000-0000-0000-0000000000f1', :'c', p.id))
  FROM (SELECT id FROM properties WHERE slug LIKE 'bulk-5%' ORDER BY slug LIMIT 23) p;
RESET ROLE;
SELECT test_util.ok((SELECT count(*) FROM catalog_items WHERE catalog_id = :'c') = 23, 'concurrencia: 23 visibles');
