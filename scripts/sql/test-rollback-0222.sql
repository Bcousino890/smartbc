-- SOLO PRUEBAS LOCALES (PR3). Tras rollback-0222: instantánea de 0220, sin tablas nuevas.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
SELECT v AS tok FROM test_util.carry WHERE k = 't22_tok' \gset
SELECT test_util.ok(to_regclass('public.area_text_versions') IS NULL AND to_regclass('public.catalog_area_copies') IS NULL, 'reversión: tablas fuera');
SELECT test_util.ok(to_regproc('public.catalog_area_text_apply') IS NULL AND to_regproc('public.catalog_area_text_for') IS NULL, 'reversión: funciones fuera');
SET ROLE service_role;
SELECT test_util.ok((get_public_catalog(:'tok'))->>'valid' = 'true'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') x WHERE x ? 'at')
  AND EXISTS (SELECT 1 FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') x WHERE x ? 'area'), 'reversión: el catálogo abre sin «at» y con la zona de 0220');
SELECT catalog_create(:'owner', 'Tras la reversión', NULL) AS cat3 \gset
SELECT test_util.ok(catalog_add_property(:'owner', :'cat3', '10000000-0000-0000-0000-000000000002') > 0, 'reversión: añadir viviendas funciona');
RESET ROLE;
