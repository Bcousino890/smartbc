-- SOLO PRUEBAS LOCALES (BCP-01 P4). Pestaña A: convierte y retiene el bloqueo 2 s.
\set ON_ERROR_STOP 1
SELECT v AS cat FROM test_util.carry WHERE k = 'cv_cat' \gset
BEGIN;
SET LOCAL ROLE service_role;
SELECT catalog_convert_explicit('00000000-0000-0000-0000-0000000000f1', :'cat',
  (SELECT version FROM catalogs WHERE id = :'cat'),
  ARRAY(SELECT property_id FROM catalog_select(:'cat', (SELECT criteria FROM catalogs WHERE id = :'cat')) ORDER BY ord));
SELECT pg_sleep(2);
COMMIT;
