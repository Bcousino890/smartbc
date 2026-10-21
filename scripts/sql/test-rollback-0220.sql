-- SOLO PRUEBAS LOCALES (PR2). Tras rollback-0220: instantánea de 0217, sin tablas nuevas.
\set ON_ERROR_STOP 1
SELECT v AS tok FROM test_util.carry WHERE k = 't20_tok' \gset
SELECT test_util.ok(to_regclass('public.catalog_areas') IS NULL AND to_regclass('public.catalog_property_areas') IS NULL, 'reversión: tablas fuera');
SELECT test_util.ok(to_regproc('public.catalog_area_confirm') IS NULL AND to_regproc('public.catalog_area_input_sig') IS NULL, 'reversión: funciones fuera');
SET ROLE service_role;
SELECT test_util.ok((get_public_catalog(:'tok'))->>'valid' = 'true'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') x WHERE x ? 'area'), 'reversión: el catálogo abre sin «area»');
RESET ROLE;
