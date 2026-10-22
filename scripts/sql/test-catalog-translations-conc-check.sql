-- SOLO PRUEBAS LOCALES (PR6). Tras las dos sesiones: UNA sola reserva.
\set ON_ERROR_STOP 1
SELECT test_util.ok((SELECT v FROM test_util.carry WHERE k = 't24_conc_a') = 'reserved'
                AND (SELECT v FROM test_util.carry WHERE k = 't24_conc_b') = 'busy', 'concurrencia: A reserva y B, a la vez, ve «en preparación»');
SELECT test_util.ok((SELECT count(*) FROM catalog_tr_jobs WHERE source_id = (SELECT v FROM test_util.carry WHERE k = 't24_src2')::uuid AND lang = 'it') = 1,
  'concurrencia: un solo trabajo (una sola llamada a la IA lanzada)');
