-- SOLO PRUEBAS LOCALES. R12: comprobación tras las dos sesiones.
\set ON_ERROR_STOP 1
SELECT test_util.ok((SELECT count(*) FROM assignment_events WHERE kind = 'client_first'
  AND client_id = 'c0000000-0000-0000-0000-000000000009') = 1,
  'R12 · una sola primera asignación del cliente');
SELECT test_util.ok((SELECT count(DISTINCT assigned_to) FROM idealista_leads
  WHERE client_id = 'c0000000-0000-0000-0000-000000000009') = 1
  AND (SELECT assigned_to FROM idealista_leads WHERE id = 'f0000000-0000-0000-0000-000000000902')
    = (SELECT assigned_advisor_id FROM profiles WHERE id = 'c0000000-0000-0000-0000-000000000009'),
  'R12 · la segunda hereda el responsable, sin dos asesores activos');
SELECT test_util.ok((SELECT assignment_source FROM idealista_leads WHERE id = 'f0000000-0000-0000-0000-000000000902') = 'inherited',
  'R12 · y consta como heredada, no como regla de su piso');
