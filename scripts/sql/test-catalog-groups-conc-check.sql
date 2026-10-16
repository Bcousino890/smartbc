-- SOLO PRUEBAS LOCALES (HOME · grupos). Resultado de borrar mientras se asigna.
\set ON_ERROR_STOP 1
SELECT v AS cli FROM test_util.carry WHERE k = 'g_cli' \gset
SELECT v AS k1 FROM test_util.carry WHERE k = 'g_k1' \gset
SELECT test_util.ok((SELECT v::numeric FROM test_util.carry WHERE k = 'g_conc_wait') >= 1.0,
  'concurrencia: B esperó al bloqueo del dueño (' || (SELECT round(v::numeric, 2) FROM test_util.carry WHERE k = 'g_conc_wait') || ' s)');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_groups WHERE id = :'cli')
                    AND NOT EXISTS (SELECT 1 FROM catalog_group_members m WHERE NOT EXISTS (SELECT 1 FROM catalog_groups g WHERE g.id = m.group_id))
                    AND NOT EXISTS (SELECT 1 FROM catalog_group_members WHERE catalog_id = :'k1'),
  'concurrencia: el grupo se borró, K1 no quedó asignado a él y no hay asignaciones huérfanas');
\echo 'concurrencia (borrar mientras se asigna): todo en verde'
