-- SOLO PRUEBAS LOCALES (BCP-01 P4). Tras undo-conversion-0213.sql: vuelve a
-- automático con la lista manual de antes; el lector, como antes de convertir.
\set ON_ERROR_STOP 1
SELECT v AS cat FROM test_util.carry WHERE k = 'cv_cat' \gset
SELECT v AS tok FROM test_util.carry WHERE k = 'cv_tok' \gset
SELECT v AS fp_auto FROM test_util.carry WHERE k = 'cv_fp_auto' \gset
SELECT test_util.ok((SELECT mode FROM catalogs WHERE id = :'cat') = 'auto', 'deshacer: vuelve a automático');
SELECT test_util.ok((SELECT array_agg(p.slug ORDER BY ci.position) FROM catalog_items ci JOIN properties p ON p.id = ci.property_id WHERE ci.catalog_id = :'cat') = ARRAY['cv-2', 'cv-7'],
  'deshacer: repone la lista manual guardada de antes');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp_auto', 'deshacer: el lector ve lo mismo que antes de convertir');
SELECT test_util.ok((SELECT undone_at IS NOT NULL FROM catalog_conversions WHERE catalog_id = :'cat'), 'deshacer: queda anotado en el registro');
SELECT 'test-catalog-conversion-undo.sql: OK' AS resultado;
