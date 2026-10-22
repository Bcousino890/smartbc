-- SOLO PRUEBAS LOCALES (0228). Tras las dos sesiones: el límite por catálogo
-- se respeta también con visitas simultáneas.
\set ON_ERROR_STOP 1
SELECT test_util.ok((SELECT v FROM test_util.carry WHERE k = 'ta_conc_a') = 'reserved'
                AND (SELECT v FROM test_util.carry WHERE k = 'ta_conc_b') = 'limit', 'concurrencia: A reserva y B, a la vez, ve «limit» (como mucho 1 en este caso)');
SELECT test_util.ok((SELECT count(*) FROM catalog_tr_jobs WHERE catalog_id = (SELECT v FROM test_util.carry WHERE k = 't24_cat')::uuid AND lang = 'it' AND status = 'reserved') = 1,
  'concurrencia: una sola reserva vigente en el catálogo');
