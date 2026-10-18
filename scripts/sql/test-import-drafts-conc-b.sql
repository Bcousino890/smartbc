-- SOLO PRUEBAS LOCALES (BCP-01 P5). Pestaña B, a la vez: espera y recibe la MISMA ficha.
\set ON_ERROR_STOP 1
SET ROLE service_role;
SELECT test_util.ok((import_draft_create_property('00000000-0000-0000-0000-0000000000f1',
  (SELECT id FROM property_import_drafts WHERE request_key = 'req-concurrent'), 1, test_util.row('pdf:concurrente:1', 'piso-concurrente-b'))->>'created') = 'false',
  'concurrencia: la segunda pestaña recibe la ficha ya creada');
