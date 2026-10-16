-- SOLO PRUEBAS LOCALES (HOME · grupos). Resultado del límite con dos sesiones.
\set ON_ERROR_STOP 1
\if :nolock
SELECT test_util.ok((SELECT count(*) FROM catalog_groups WHERE owner_id = '00000000-0000-0000-0000-0000000000a2') = 101,
  'contraprueba SIN el bloqueo del dueño: las dos sesiones crean y quedan 101 grupos (el bloqueo es necesario)');
\else
SELECT test_util.ok((SELECT v::numeric FROM test_util.carry WHERE k = 'g_lim_wait') >= 1.0,
  'límite: B esperó al bloqueo del dueño (' || (SELECT round(v::numeric, 2) FROM test_util.carry WHERE k = 'g_lim_wait') || ' s)');
SELECT test_util.ok((SELECT count(*) FROM catalog_groups WHERE owner_id = '00000000-0000-0000-0000-0000000000a2') = 100,
  'límite con dos sesiones: queda en 100 (D13)');
\endif
