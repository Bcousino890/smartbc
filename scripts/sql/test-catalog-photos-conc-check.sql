-- SOLO PRUEBAS LOCALES (BCP-01 E3). Resultado de la prueba de concurrencia.
\set ON_ERROR_STOP 1
SELECT v AS cat FROM test_util.carry WHERE k = 'e3_cat' \gset
SELECT test_util.ok((SELECT v::numeric FROM test_util.carry WHERE k = 'e3_conc_wait') >= 1.0,
  'concurrencia: B esperó al bloqueo del catálogo (' || (SELECT round(v::numeric, 2) FROM test_util.carry WHERE k = 'e3_conc_wait') || ' s)');
SELECT test_util.ok((SELECT string_agg(right(photo_id::text, 2), ',') FROM catalog_photo_prefs
                      WHERE catalog_id = :'cat' AND property_id = 'b7000000-0000-0000-0000-000000000003' AND kind = 'exclude') = '31',
  'concurrencia: solo pasó la exclusión de A (R1); R conserva una foto en uso (E3-1)');
\echo 'concurrencia de E3-1: todo en verde'
