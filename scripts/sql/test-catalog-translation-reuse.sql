-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-21-bcp-01-ampliacion-textos-idiomas,
-- traducciones reutilizadas en todo el equipo, decisión de Fabricio del
-- 23-10-2026). Tests de 0230 en el Postgres temporal: stub + fixtures +
-- catálogo de test-catalog-translations-pre.sql + 0192–0230 (0230 aplicada
-- dos veces). Datos sintéticos; ninguna IA (SQL no la llama nunca).
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set h2    '00000000-0000-0000-0000-0000000000ba'
\set p1 '10000000-0000-0000-0000-000000000001'
\set p2 '10000000-0000-0000-0000-000000000002'
\set T 'Recoletos es un barrio de fincas señoriales.'
SELECT v AS cat FROM test_util.carry WHERE k = 't24_cat' \gset
INSERT INTO auth.users (id, email) VALUES (:'h2', 'home.cinco@ejemplo.test') ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, role, full_name, email) VALUES (:'h2', 'admin', 'Home Cinco', 'home.cinco@ejemplo.test') ON CONFLICT DO NOTHING;
INSERT INTO home_owners (profile_id) VALUES (:'h2') ON CONFLICT DO NOTHING;

SET ROLE service_role;
-- 1. Ana (owner) traduce p1 al inglés con su plantilla y una característica, y
--    lo publica en su catálogo.
SELECT md5('reuse-p1-es') AS sig1, md5('reuse-area-es') AS siga, md5('reuse-p2-es') AS sig2 \gset
SELECT (catalog_tr_source_ensure(:'owner', :'cat', :'p1', :'sig1', '{"t": "Ático", "b": [{"k": "intro", "x": "Salón de 40 m²."}]}'))->>'id' AS s1 \gset
SELECT id AS av1 FROM area_text_versions WHERE owner_id = :'owner' AND status = 'approved' LIMIT 1 \gset
SELECT catalog_tr_area_source_ensure(:'owner', :'av1', :'siga', json_build_object('b', json_build_array(json_build_object('k', 'barrio', 'x', :'T')))::jsonb) AS a1 \gset
SELECT (catalog_tr_reserve(:'owner', :'s1', 'en', :'cat', :'p1', json_build_object('text', true, 'area', :'a1', 'features', '["Ascensor"]'::json)::jsonb, 300, false))->>'job' AS j1 \gset
SELECT (catalog_tr_finish(:'owner', :'j1', 'done', '{"text": {"t": "Penthouse", "b": [{"k": "intro", "x": "A 40 m² living room."}]}, "area": "Recoletos is a district of stately buildings.", "features": [{"es": "Ascensor", "tr": "Lift"}]}', NULL))->>'state' = 'saved';
SELECT id AS t1 FROM catalog_tr_texts WHERE source_id = :'s1' AND lang = 'en' \gset
SELECT id AS ta1 FROM catalog_tr_texts WHERE source_id = :'a1' AND lang = 'en' \gset
SELECT catalog_tr_publish(:'owner', :'cat', :'p1', 'en', :'sig1', json_build_object('text', json_build_object('id', :'t1', 'rev', 1), 'area', json_build_object('id', :'ta1', 'rev', 1),
       'features', '[{"es": "Ascensor", "tr": "Lift"}]'::json, 'list', '["Ascensor"]'::json)::jsonb, 'auto') IS NOT NULL;
-- p2: solo un BORRADOR (sin publicar).
SELECT (catalog_tr_source_ensure(:'owner', :'cat', :'p2', :'sig2', '{"t": "Piso", "b": [{"k": "intro", "x": "Piso tranquilo."}]}'))->>'id' AS s2 \gset
SELECT (catalog_tr_reserve(:'owner', :'s2', 'en', :'cat', :'p2', '{"text": true}', 300, false))->>'job' AS j2 \gset
SELECT (catalog_tr_finish(:'owner', :'j2', 'done', '{"text": {"t": "Flat", "b": [{"k": "intro", "x": "Quiet flat."}]}}', NULL))->>'state' = 'saved';

-- 2. Otra persona del equipo (h2) pone las mismas viviendas en SU catálogo.
SELECT catalog_create(:'h2', 'Equipo', NULL) AS cat2 \gset
SELECT catalog_add_property(:'h2', :'cat2', :'p1');
SELECT catalog_add_property(:'h2', :'cat2', :'p2');
SELECT (catalog_area_text_save_draft(:'h2', 'madrid/salamanca/recoletos', :'T', 'manual')) IS NOT NULL;
SELECT catalog_area_text_approve(:'h2', 'madrid/salamanca/recoletos', :'T');
SELECT id AS av2 FROM area_text_versions WHERE owner_id = :'h2' AND status = 'approved' LIMIT 1 \gset
SELECT (catalog_tr_source_ensure(:'h2', :'cat2', :'p1', :'sig1', '{"t": "Ático", "b": [{"k": "intro", "x": "Salón de 40 m²."}]}'))->>'id' AS b1 \gset
SELECT catalog_tr_area_source_ensure(:'h2', :'av2', :'siga', json_build_object('b', json_build_array(json_build_object('k', 'barrio', 'x', :'T')))::jsonb) AS ba \gset
SELECT test_util.ok(:'b1' <> :'s1' AND :'ba' <> :'a1', 'cada persona tiene sus propias fuentes (como en 0226)');
SELECT catalog_tr_reuse(:'h2', :'b1', :'ba', 'en', '["Ascensor", "Terraza"]') AS r1 \gset
SELECT test_util.ok((:'r1'::jsonb) = '{"text": true, "area": true, "features": 1}'::jsonb, 'reutiliza la descripción, la plantilla y la característica ya publicadas (no «Terraza», que nadie tiene)');
SELECT test_util.ok((SELECT status = 'draft' AND origin = 'ai' AND reused_from = :'t1' AND content = (SELECT content FROM catalog_tr_texts WHERE id = :'t1')
                       FROM catalog_tr_texts WHERE source_id = :'b1' AND lang = 'en'), 'la descripción: copia exacta, como borrador de la IA y con su procedencia');
SELECT test_util.ok((SELECT reused_from = :'ta1' FROM catalog_tr_texts WHERE source_id = :'ba' AND lang = 'en'), 'la plantilla: con su procedencia');
SELECT test_util.ok((SELECT tr = 'Lift' AND status = 'draft' AND reused_from_owner = :'owner' FROM catalog_tr_features WHERE owner_id = :'h2' AND lang = 'en' AND es = 'Ascensor'),
  'la característica: copiada a h2 con su procedencia');
SELECT test_util.ok((catalog_tr_reuse(:'h2', :'b1', :'ba', 'en', '["Ascensor"]'))::jsonb = '{"text": false, "area": false, "features": 0}'::jsonb, 'otra vez: no pisa nada (idempotente)');
SELECT test_util.ok((catalog_tr_reserve_auto(:'h2', :'b1', 'en', :'cat2', :'p1', json_build_object('text', true, 'area', :'ba', 'features', '["Ascensor"]'::json)::jsonb, 300,
                     '{"max_active": 2, "daily_cap": 300, "max_failures": 5, "waits": [300, 1800, 7200, 43200]}'))->>'state' = 'ready', 'después: nada que pedir a la IA («ready», sin reserva)');
-- Y se publica en SU catálogo con la publicación de siempre.
SELECT id AS bt1 FROM catalog_tr_texts WHERE source_id = :'b1' AND lang = 'en' \gset
SELECT id AS bta FROM catalog_tr_texts WHERE source_id = :'ba' AND lang = 'en' \gset
SELECT version AS v0 FROM catalogs WHERE id = :'cat2' \gset
SELECT catalog_tr_publish(:'h2', :'cat2', :'p1', 'en', :'sig1', json_build_object('text', json_build_object('id', :'bt1', 'rev', 1), 'area', json_build_object('id', :'bta', 'rev', 1),
       'features', '[{"es": "Ascensor", "tr": "Lift"}]'::json, 'list', '["Ascensor"]'::json)::jsonb, 'auto') AS v1 \gset
SELECT test_util.ok(:v1 > :v0 AND (SELECT approval FROM catalog_tr_texts WHERE id = :'bt1') = 'auto'
                    AND (SELECT content->>'t' FROM catalog_tr_copies WHERE catalog_id = :'cat2' AND property_id = :'p1' AND lang = 'en') = 'Penthouse',
  'publicada en el catálogo de h2 («publicada sola»), con la traducción de Ana');
SELECT test_util.ok((SELECT content->>'t' FROM catalog_tr_copies WHERE catalog_id = :'cat' AND property_id = :'p1' AND lang = 'en') = 'Penthouse', 'el catálogo de Ana no cambia');

-- 3. Lo que NO se reutiliza.
SELECT (catalog_tr_source_ensure(:'h2', :'cat2', :'p2', :'sig2', '{"t": "Piso", "b": [{"k": "intro", "x": "Piso tranquilo."}]}'))->>'id' AS b2 \gset
SELECT test_util.ok((catalog_tr_reuse(:'h2', :'b2', NULL, 'en', '[]'))->>'text' = 'false', 'un borrador sin publicar no se reutiliza');
SELECT md5('reuse-p1-otro') AS sig3 \gset
SELECT (catalog_tr_source_ensure(:'h2', :'cat2', :'p1', :'sig3', '{"t": "Ático", "b": [{"k": "intro", "x": "Otro texto."}]}'))->>'id' AS b3 \gset
SELECT test_util.ok((catalog_tr_reuse(:'h2', :'b3', NULL, 'en', '[]'))->>'text' = 'false', 'otro español (otra huella): no se reutiliza');
SELECT test_util.ok((catalog_tr_reuse(:'h2', :'b1', NULL, 'fr', '["Ascensor"]'))::jsonb = '{"text": false, "area": false, "features": 0}'::jsonb, 'otro idioma: nada que reutilizar');
-- Misma huella pero distinto contenido (no debería pasar): se exige igualdad exacta.
SELECT catalog_create(:'h2', 'Equipo 3', NULL) AS cat5 \gset
SELECT catalog_add_property(:'h2', :'cat5', :'p1');
RESET ROLE;
INSERT INTO catalog_tr_sources (owner_id, kind, property_id, catalog_id, es_sig, es)
VALUES (:'h2', 'catalog', :'p1', :'cat5', :'sig1', '{"t": "Ático", "b": [{"k": "intro", "x": "Salón de 40 m²"}]}')
RETURNING id AS b5 \gset
SET ROLE service_role;
SELECT test_util.ok((catalog_tr_reuse(:'h2', :'b5', NULL, 'en', '[]'))->>'text' = 'false', 'misma huella pero otro contenido: no se reutiliza (igualdad exacta)');
-- Otra vivienda con el mismo texto: no (la vivienda tiene que ser la misma).
SELECT (catalog_tr_source_ensure(:'h2', :'cat2', :'p2', :'sig1', '{"t": "Ático", "b": [{"k": "intro", "x": "Salón de 40 m²."}]}'))->>'id' AS b4 \gset
SELECT test_util.ok((catalog_tr_reuse(:'h2', :'b4', NULL, 'en', '[]'))->>'text' = 'false', 'otra vivienda con el mismo texto: no se reutiliza');

-- 4. Lo corregido a mano gana sobre lo publicado solo.
SELECT catalog_create(:'owner', 'Ana 2', NULL) AS cat3 \gset
SELECT catalog_add_property(:'owner', :'cat3', :'p1');
SELECT (catalog_tr_source_ensure(:'owner', :'cat3', :'p1', :'sig1', '{"t": "Ático", "b": [{"k": "intro", "x": "Salón de 40 m²."}]}'))->>'id' AS c1 \gset
SELECT test_util.ok(:'c1' <> :'s1', 'Ana, otro catálogo: otra fuente (texto del catálogo)');
SELECT test_util.ok((catalog_tr_reuse(:'owner', :'c1', NULL, 'en', '[]'))->>'text' = 'true', 'el mismo dueño, otro catálogo: también se reutiliza');
SELECT id AS ct1 FROM catalog_tr_texts WHERE source_id = :'c1' AND lang = 'en' \gset
SELECT catalog_tr_save(:'owner', :'ct1', 1, '{"t": "Penthouse (corrected)", "b": [{"k": "intro", "x": "A bright 40 m² living room."}]}') AS rv \gset
SELECT catalog_tr_publish(:'owner', :'cat3', :'p1', 'en', :'sig1', json_build_object('text', json_build_object('id', :'ct1', 'rev', :rv), 'area', NULL,
       'features', '[]'::json, 'list', '[]'::json)::jsonb, 'manual') IS NOT NULL;
SELECT catalog_create(:'h2', 'Equipo 2', NULL) AS cat4 \gset
SELECT catalog_add_property(:'h2', :'cat4', :'p1');
SELECT (catalog_tr_source_ensure(:'h2', :'cat4', :'p1', :'sig1', '{"t": "Ático", "b": [{"k": "intro", "x": "Salón de 40 m²."}]}'))->>'id' AS d1 \gset
SELECT catalog_tr_reuse(:'h2', :'d1', NULL, 'en', '[]') IS NOT NULL;
SELECT test_util.ok((SELECT content->>'t' FROM catalog_tr_texts WHERE source_id = :'d1' AND lang = 'en') = 'Penthouse (corrected)', 'si hay varias, gana la corregida a mano');

-- 5. Guardas.
SELECT test_util.expect_error(format('SELECT catalog_tr_reuse(%L, %L, NULL, %L, %L)', :'h2', :'s1', 'en', '[]'), 'source_not_found');
SELECT test_util.expect_error(format('SELECT catalog_tr_reuse(%L, %L, NULL, %L, %L)', :'h2', :'ba', 'en', '[]'), 'source_not_found');
SELECT test_util.expect_error(format('SELECT catalog_tr_reuse(%L, %L, NULL, %L, %L)', :'h2', :'b1', 'xx', '[]'), 'invalid_lang');
SELECT test_util.expect_error(format('SELECT catalog_tr_reuse(%L, NULL, NULL, %L, %L)', '00000000-0000-0000-0000-0000000000c3', 'en', '[]'), 'forbidden');
RESET ROLE;
SET ROLE anon;
SELECT test_util.expect_error(format('SELECT catalog_tr_reuse(%L, NULL, NULL, %L, %L)', :'h2', 'en', '[]'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT catalog_tr_reuse(%L, NULL, NULL, %L, %L)', :'h2', 'en', '[]'), 'insufficient_privilege');
RESET ROLE;
\echo 'test-catalog-translation-reuse.sql: 0230 en verde'
