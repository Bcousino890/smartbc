-- SOLO PRUEBAS LOCALES (BCP-01 P2). Sesión B, a la vez: espera el bloqueo y recibe «catalog_full».
\set ON_ERROR_STOP 1
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', '00000000-0000-0000-0000-0000000000f1',
  (SELECT id FROM catalogs WHERE title = 'Conc 24'), (SELECT id FROM properties WHERE slug = 'bulk-601')), 'catalog_full');
