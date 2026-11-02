-- SOLO PRUEBAS LOCALES. Hallazgo 2: comprobación tras las dos sesiones.
\set ON_ERROR_STOP 1
SELECT test_util.ok((SELECT assigned_advisor_id FROM profiles WHERE id = 'c0000000-0000-0000-0000-000000000010')
    = 'b0000000-0000-0000-0000-00000000000b'
  AND (SELECT assigned_to FROM idealista_leads WHERE id = 'f0000000-0000-0000-0000-000000000950')
    = 'b0000000-0000-0000-0000-00000000000b',
  'H2 · reparto y reasignación simultáneos: gana la reasignación, cliente y solicitud con el mismo asesor');
SELECT test_util.ok((SELECT count(*) FROM assignment_events WHERE kind = 'client_reassign'
  AND client_id = 'c0000000-0000-0000-0000-000000000010') = 1,
  'H2 · la reasignación queda registrada una vez');
DROP TRIGGER trg_test_pause_lead ON idealista_leads;
DROP FUNCTION test_util.pause_on_lead_update();
