-- SOLO PRUEBAS LOCALES (traducción automática, 0228). Antes de 0228 (con
-- 0192–0227 y el catálogo de test-catalog-translations-pre.sql): una
-- traducción APROBADA a mano con 0226 (p1 en inglés, con su copia), un
-- borrador sin aprobar (p2), un trabajo incierto, el enlace personal de C3 en
-- inglés y las huellas de todo. Datos sintéticos; ninguna IA.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set p1 '10000000-0000-0000-0000-000000000001'
\set p2 '10000000-0000-0000-0000-000000000002'
SELECT v AS cat  FROM test_util.carry WHERE k = 't24_cat' \gset
SELECT v AS tok  FROM test_util.carry WHERE k = 't24_tok' \gset
SELECT v AS ptok FROM test_util.carry WHERE k = 't24_ptok' \gset
SET ROLE service_role;
SELECT (SELECT id FROM catalog_client_links WHERE token = :'ptok') AS link1 \gset
SELECT catalog_client_link_set_lang(:'owner', :'link1', 'en');
-- p1 en inglés: fuente propia, trabajo, resultado y aprobación (0226).
SELECT md5('p1-auto-es') AS sig1, md5('p2-auto-es') AS sig2 \gset
SELECT (catalog_tr_source_ensure(:'owner', :'cat', :'p1', :'sig1', '{"t": "Ático", "b": [{"k": "intro", "x": "Salón de 40 m²."}]}'))->>'id' AS s1 \gset
SELECT (catalog_tr_reserve(:'owner', :'s1', 'en', :'cat', :'p1', '{"text": true, "features": ["Ascensor"]}', 300, false))->>'job' AS j1 \gset
SELECT (catalog_tr_finish(:'owner', :'j1', 'done', '{"text": {"t": "Penthouse", "b": [{"k": "intro", "x": "A 40 m² living room."}]}, "features": [{"es": "Ascensor", "tr": "Lift"}]}', NULL))->>'state' = 'saved';
SELECT id AS t1 FROM catalog_tr_texts WHERE source_id = :'s1' AND lang = 'en' \gset
SELECT catalog_tr_approve(:'owner', :'cat', :'p1', 'en', :'sig1', json_build_object('text', json_build_object('id', :'t1', 'rev', 1), 'area', NULL,
       'features', '[{"es": "Ascensor", "tr": "Lift"}]'::json, 'list', '["Ascensor"]'::json)::jsonb) IS NOT NULL;
-- p2: un borrador sin aprobar.
SELECT (catalog_tr_source_ensure(:'owner', :'cat', :'p2', :'sig2', '{"t": "Piso", "b": [{"k": "intro", "x": "Piso tranquilo."}]}'))->>'id' AS s2 \gset
SELECT (catalog_tr_reserve(:'owner', :'s2', 'en', :'cat', :'p2', '{"text": true}', 300, false))->>'job' AS j2 \gset
SELECT (catalog_tr_finish(:'owner', :'j2', 'done', '{"text": {"t": "Flat", "b": [{"k": "intro", "x": "Quiet flat."}]}}', NULL))->>'state' = 'saved';
-- Un incierto en francés.
SELECT (catalog_tr_reserve(:'owner', :'s2', 'fr', :'cat', :'p2', '{"text": true}', 300, false))->>'job' AS j3 \gset
SELECT (catalog_tr_finish(:'owner', :'j3', 'uncertain', NULL, 'tiempo agotado'))->>'state' = 'recorded';
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fpes, (get_public_catalog(:'ptok'))->>'fingerprint' AS fpen \gset
RESET ROLE;
SELECT version AS v0 FROM catalogs WHERE id = :'cat' \gset
INSERT INTO test_util.carry (k, v) VALUES ('ta_s1', :'s1'), ('ta_s2', :'s2'), ('ta_t1', :'t1'), ('ta_link1', :'link1'), ('ta_fpes', :'fpes'), ('ta_fpen', :'fpen'),
  ('ta_sig1', :'sig1'), ('ta_sig2', :'sig2'), ('ta_v0', :'v0')
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-translations-auto-pre.sql: traducciones previas a 0228 creadas'
