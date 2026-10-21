-- SOLO PRUEBAS LOCALES (PR1). Tras las dos sesiones: versiones en orden, la
-- última combina las dos aprobaciones (título de A y descripción de B).
\set ON_ERROR_STOP 1
SELECT test_util.ok((SELECT array_agg(seq ORDER BY seq) = ARRAY[1, 2] FROM property_copy_versions
                      WHERE owner_id = '00000000-0000-0000-0000-0000000000f1' AND property_id = '10000000-0000-0000-0000-000000000002'),
  'concurrencia: la aprobación simultánea espera al bloqueo y no duplica número de versión');
SELECT test_util.ok((SELECT title = 'Título concurrente A' AND body = 'Piso tranquilo, cocina reformada.' FROM property_copy_versions
                      WHERE owner_id = '00000000-0000-0000-0000-0000000000f1' AND property_id = '10000000-0000-0000-0000-000000000002' AND seq = 2),
  'concurrencia: la segunda conserva el título aprobado por la primera');
