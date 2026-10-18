-- SOLO PRUEBAS LOCALES (BCP-01 P5). Tras A y B: una sola ficha.
\set ON_ERROR_STOP 1
SELECT test_util.ok((SELECT count(*) FROM properties WHERE external_id = 'pdf:concurrente:1') = 1, 'concurrencia: dos confirmaciones a la vez → una ficha');
