-- SOLO PRUEBAS LOCALES (BCP-01 P2). Sesión A: añade la nº 24 y retiene el bloqueo 2 s.
\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL ROLE service_role;
SELECT catalog_add_property('00000000-0000-0000-0000-0000000000f1', (SELECT id FROM catalogs WHERE title = 'Conc 24'),
  (SELECT id FROM properties WHERE slug = 'bulk-600'));
SELECT pg_sleep(2);
COMMIT;
