-- SOLO PRUEBAS LOCALES (BCP-01 P4). Pestaña B con la MISMA vista previa, a la vez: ya no es automático.
\set ON_ERROR_STOP 1
SELECT v AS cat FROM test_util.carry WHERE k = 'cv_cat' \gset
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_convert_explicit(%L, %L, %s, %L)', '00000000-0000-0000-0000-0000000000f1', :'cat',
  (SELECT version FROM catalogs WHERE id = :'cat'),
  ARRAY(SELECT property_id FROM catalog_select(:'cat', (SELECT criteria FROM catalogs WHERE id = :'cat')) ORDER BY ord)), 'catalog_manual');
RESET ROLE;
SELECT test_util.ok((SELECT count(*) FROM catalog_conversions WHERE catalog_id = :'cat' AND undone_at IS NULL) = 1, 'concurrencia: una sola conversión registrada');
