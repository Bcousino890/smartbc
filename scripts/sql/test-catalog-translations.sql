-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-21-bcp-01-ampliacion-textos-idiomas,
-- PR6). Tests de 0226 en el Postgres temporal: stub + fixtures + 0192–0223 +
-- 0226 (aplicada dos veces) sobre un catálogo con enlace general y dos
-- asignaciones personales creados ANTES. Datos 100 % sintéticos; ninguna IA
-- (SQL no la llama nunca: aquí los «resultados» los escribe el test).
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
\set h2    '00000000-0000-0000-0000-0000000000ba'
\set p1 '10000000-0000-0000-0000-000000000001'
\set p2 '10000000-0000-0000-0000-000000000002'
\set p4 '10000000-0000-0000-0000-000000000004'
SELECT v AS cat   FROM test_util.carry WHERE k = 't24_cat' \gset
SELECT v AS tok   FROM test_util.carry WHERE k = 't24_tok' \gset
SELECT v AS ptok  FROM test_util.carry WHERE k = 't24_ptok' \gset
SELECT v AS ptok2 FROM test_util.carry WHERE k = 't24_ptok2' \gset
SELECT v AS fp0   FROM test_util.carry WHERE k = 't24_fp' \gset
SELECT v AS p1h   FROM test_util.carry WHERE k = 't24_p1h' \gset

CREATE OR REPLACE FUNCTION test_util.t_fp(p_tok text) RETURNS text LANGUAGE sql AS $$ SELECT (get_public_catalog(p_tok))->>'fingerprint' $$;
CREATE OR REPLACE FUNCTION test_util.t_snap(p_tok text) RETURNS jsonb LANGUAGE sql AS $$ SELECT (get_public_catalog(p_tok))->'snapshot' $$;
CREATE OR REPLACE FUNCTION test_util.t_item(p_tok text, p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements((get_public_catalog(p_tok))->'snapshot'->'items') x WHERE x->>'slug' = p_slug
$$;
GRANT EXECUTE ON FUNCTION test_util.t_fp(text), test_util.t_snap(text), test_util.t_item(text, text) TO service_role;
INSERT INTO auth.users (id, email) VALUES (:'h2', 'home.cuatro@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES (:'h2', 'admin', 'Home Cuatro', 'home.cuatro@ejemplo.test');
INSERT INTO home_owners (profile_id) VALUES (:'h2');
CREATE TEMP TABLE pcv_before AS SELECT count(*) AS n FROM property_copy_versions;
CREATE TEMP TABLE pcd_before AS SELECT md5(coalesce(string_agg(row_to_json(d)::text, '|' ORDER BY property_id, language), '')) AS h FROM property_client_descriptions d;
GRANT SELECT ON pcv_before, pcd_before TO service_role;

-- 1. Desplegar 0226 no cambia NINGUNA huella (en español la instantánea es la de 0223).
SET ROLE service_role;
SELECT test_util.ok(test_util.t_fp(:'tok') = :'fp0' AND test_util.t_fp(:'ptok') = :'fp0', '0226: misma huella en el general y en el personal (español)');
SELECT test_util.ok(NOT (test_util.t_snap(:'tok') ? 'trm') AND NOT (test_util.t_item(:'tok', 'atico-demo-1') ? 'tr'), 'en español no hay «tr» ni «trm»');

-- 2. Lectura del dueño: instantánea en español, versión y mapa clave → vivienda.
SELECT catalog_tr_es_state(:'owner', :'cat') AS es \gset
SELECT test_util.ok((:'es'::jsonb)->>'default_lang' = 'es' AND jsonb_array_length((:'es'::jsonb)->'map') = 2
                    AND ((:'es'::jsonb)->'map'->0->>'p') = :'p1' AND ((:'es'::jsonb)->'map'->0->>'av') IS NOT NULL
                    AND ((:'es'::jsonb)->'snapshot'->>'lang') = 'es', 'es_state: versión, idioma, mapa (con la versión de plantilla) e instantánea en español');
SELECT test_util.ok(((:'es'::jsonb)->'map'->0->>'k') = (test_util.t_item(:'tok', 'atico-demo-1')->>'key'), 'es_state: la clave del mapa es la clave pública del lector');
SELECT test_util.expect_error(format('SELECT catalog_tr_es_state(%L, %L)', :'staff', :'cat'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_tr_es_state(%L, %L)', :'h2', :'cat'), 'forbidden');

-- 3. Fuentes (DA31): la publicación propia del catálogo, idempotente.
\set es1 '{"t": "Ático con terraza en Recoletos", "b": [{"k": "intro", "x": "Salón de 40 m² con mucha luz."}]}'
\set es2 '{"t": "Piso demo", "b": [{"k": "intro", "x": "Piso tranquilo con cocina reformada."}]}'
SELECT md5('p1-es-1') AS sig1, md5('p2-es-1') AS sig2, md5('p1-full-1') AS full1, md5('meta-1') AS msig, md5('area-1') AS asig \gset
SELECT catalog_tr_source_ensure(:'owner', :'cat', :'p1', :'sig1', :'es1') AS s1 \gset
SELECT test_util.ok((:'s1'::jsonb)->>'kind' = 'catalog', 'texto propio del catálogo: fuente «catalog»');
SELECT test_util.ok((catalog_tr_source_ensure(:'owner', :'cat', :'p1', :'sig1', :'es1'))->>'id' = (:'s1'::jsonb)->>'id', 'misma huella: misma fuente (idempotente)');
SELECT (:'s1'::jsonb)->>'id' AS src1 \gset
SELECT (catalog_tr_source_ensure(:'owner', :'cat', :'p2', :'sig2', :'es2'))->>'id' AS src2 \gset
SELECT (catalog_tr_source_ensure(:'owner', :'cat', NULL, :'msig', '{"t": "Previo a 0226", "i": "Dos viviendas en Salamanca."}'))->>'id' AS srcm \gset
SELECT test_util.ok((SELECT kind FROM catalog_tr_sources WHERE id = :'srcm') = 'meta', 'título e introducción del catálogo: fuente «meta»');
SELECT test_util.expect_error(format('SELECT catalog_tr_source_ensure(%L, %L, %L, %L, %L)', :'owner', :'cat', :'p4', :'sig1', :'es1'), 'not_in_catalog');
SELECT test_util.expect_error(format('SELECT catalog_tr_source_ensure(%L, %L, %L, %L, %L)', :'owner', :'cat', :'p1', 'no-es-una-huella', :'es1'), 'invalid_text');
SELECT test_util.expect_error(format('SELECT catalog_tr_source_ensure(%L, %L, %L, %L, %L)', :'h2', :'cat', :'p1', :'sig1', :'es1'), 'forbidden');
-- Plantilla: fuente del dueño por versión.
SELECT (SELECT version_id FROM catalog_area_copies WHERE catalog_id = :'cat' AND property_id = :'p1') AS av \gset
SELECT catalog_tr_area_source_ensure(:'owner', :'av', :'asig', '{"b": [{"k": "barrio", "x": "Recoletos es un barrio de fincas señoriales."}]}') AS srca \gset
SELECT test_util.ok(catalog_tr_area_source_ensure(:'owner', :'av', :'asig', '{"b": []}') = :'srca'::uuid, 'plantilla: la misma versión y huella dan la misma fuente');
SELECT test_util.expect_error(format('SELECT catalog_tr_area_source_ensure(%L, %L, %L, %L)', :'h2', :'av', :'asig', '{}'), 'source_not_found');

-- 4. Reserva única por fuente e idioma (DA15).
\set needs1 '{"text": true, "area": null, "features": ["Ascensor", "Terraza de 40 m²"]}'
SELECT catalog_tr_reserve(:'owner', :'src1', 'en', :'cat', :'p1', jsonb_set(:'needs1'::jsonb, '{area}', to_jsonb(:'srca'::text)), 300, false) AS r1 \gset
SELECT test_util.ok((:'r1'::jsonb)->>'state' = 'reserved' AND ((:'r1'::jsonb)->'needs'->>'text')::boolean
                    AND (:'r1'::jsonb)->'needs'->>'area' = :'srca' AND jsonb_array_length((:'r1'::jsonb)->'needs'->'features') = 2, 'primera petición: reservada, con lo que falta (texto, plantilla, 2 características)');
SELECT (:'r1'::jsonb)->>'job' AS job1 \gset
SELECT catalog_tr_reserve(:'owner', :'src1', 'en', :'cat', :'p1', :'needs1', 300, false) AS r1b \gset
SELECT test_util.ok((:'r1b'::jsonb)->>'state' = 'busy' AND (:'r1b'::jsonb)->>'job' = :'job1', 'segunda petición simultánea: «en preparación», el mismo trabajo, sin otra reserva');
SELECT test_util.ok((SELECT count(*) FROM catalog_tr_jobs WHERE source_id = :'src1' AND lang = 'en' AND status = 'reserved') = 1, 'una sola reserva vigente');
SELECT test_util.ok((catalog_tr_reserve(:'owner', :'src1', 'fr', :'cat', :'p1', :'needs1', 300, false))->>'state' = 'reserved', 'otro idioma: su propia reserva');
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve(%L, %L, %L, %L, %L, %L, 300, false)', :'owner', :'src1', 'es', :'cat', :'p1', :'needs1'), 'invalid_lang');
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve(%L, %L, %L, %L, %L, %L, 5, false)', :'owner', :'src1', 'de', :'cat', :'p1', :'needs1'), 'invalid_ttl');
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve(%L, %L, %L, NULL, NULL, %L, 300, false)', :'h2', :'src1', 'de', :'needs1'), 'source_not_found');
RESET ROLE;
SELECT test_util.expect_error('INSERT INTO catalog_tr_jobs (owner_id, source_id, lang, expires_at) SELECT owner_id, source_id, lang, now() + interval ''1 hour'' FROM catalog_tr_jobs WHERE status = ''reserved'' AND lang = ''en'' LIMIT 1', 'unique_violation');
SET ROLE service_role;

-- 5. Terminar: guarda solo con la reserva vigente y suya; claves idénticas.
\set res1 '{"text": {"t": "Penthouse with terrace in Recoletos", "b": [{"k": "intro", "x": "A 40 m² living room full of light."}]}, "area": "Recoletos is a neighbourhood of stately buildings.", "features": [{"es": "Ascensor", "tr": "Lift"}, {"es": "Terraza de 40 m²", "tr": "40 m² terrace"}, {"es": "Inventada", "tr": "Invented"}]}'
SELECT test_util.expect_error(format('SELECT catalog_tr_finish(%L, %L, %L, %L, NULL)', :'owner', :'job1', 'done', '{"text": {"t": "X", "b": [{"k": "living", "x": "Otro bloque."}]}}'), 'translation_keys');
SELECT test_util.expect_error(format('SELECT catalog_tr_finish(%L, %L, %L, %L, NULL)', :'h2', :'job1', 'done', :'res1'), 'job_not_found');
SELECT test_util.ok((catalog_tr_finish(:'owner', :'job1', 'done', :'res1', NULL))->>'state' = 'saved', 'resultado a tiempo: se guarda');
SELECT test_util.ok((SELECT status = 'draft' AND content->>'t' = 'Penthouse with terrace in Recoletos' AND rev = 1 AND job_id = :'job1'::uuid
                      FROM catalog_tr_texts WHERE source_id = :'src1' AND lang = 'en'), 'traducción en revisión (borrador), nunca aprobada sola');
SELECT test_util.ok((SELECT content->'b'->0->>'x' FROM catalog_tr_texts WHERE source_id = :'srca' AND lang = 'en') = 'Recoletos is a neighbourhood of stately buildings.', 'la plantilla se guarda en su propia fuente (reutilizable)');
SELECT test_util.ok((SELECT count(*) FROM catalog_tr_features WHERE owner_id = :'owner' AND lang = 'en') = 2
                    AND NOT EXISTS (SELECT 1 FROM catalog_tr_features WHERE es = 'Inventada'), 'solo las características pedidas');
SELECT (catalog_tr_finish(:'owner', :'job1', 'done', :'res1', NULL))->>'state' AS fin2 \gset
SELECT test_util.ok(:'fin2' = 'discarded' AND (SELECT discarded_at IS NOT NULL AND status = 'done' FROM catalog_tr_jobs WHERE id = :'job1'), 'un segundo resultado del mismo trabajo se descarta y se registra');
SELECT test_util.ok((catalog_tr_reserve(:'owner', :'src1', 'en', :'cat', :'p1', :'needs1', 300, false))->>'state' = 'ready', 'nada que falte: «ready» y ninguna reserva (sin IA)');

-- 6. Trabajo caducado que NO pisa uno más nuevo.
SELECT (catalog_tr_reserve(:'owner', :'src2', 'en', :'cat', :'p2', '{"text": true, "features": []}', 30, false))->>'job' AS jold \gset
RESET ROLE;
UPDATE catalog_tr_jobs SET expires_at = now() - interval '1 second' WHERE id = :'jold';
SET ROLE service_role;
SELECT catalog_tr_reserve(:'owner', :'src2', 'en', :'cat', :'p2', '{"text": true, "features": []}', 300, false) AS rnew \gset
SELECT test_util.ok((:'rnew'::jsonb)->>'state' = 'reserved' AND (SELECT status FROM catalog_tr_jobs WHERE id = :'jold') = 'expired', 'la reserva caducada deja de reservar (queda «expired») y se puede reservar otra');
SELECT (:'rnew'::jsonb)->>'job' AS jnew \gset
SELECT test_util.ok((catalog_tr_finish(:'owner', :'jold', 'done', '{"text": {"t": "OLD", "b": [{"k": "intro", "x": "Old."}]}}', NULL))->>'reason' = 'expired', 'el resultado del trabajo caducado se descarta');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_tr_texts WHERE source_id = :'src2' AND lang = 'en'), 'y no se guarda nada');
SELECT test_util.ok((catalog_tr_finish(:'owner', :'jnew', 'done', '{"text": {"t": "Quiet flat", "b": [{"k": "intro", "x": "Quiet flat with a renovated kitchen."}]}}', NULL))->>'state' = 'saved', 'el trabajo nuevo sí guarda');
-- Un resultado que llega cuando SU reserva ya caducó también se descarta.
SELECT (catalog_tr_reserve(:'owner', :'srcm', 'en', :'cat', NULL, '{"meta": true}', 30, false))->>'job' AS jm \gset
RESET ROLE;
UPDATE catalog_tr_jobs SET expires_at = now() - interval '1 second' WHERE id = :'jm';
SET ROLE service_role;
SELECT (catalog_tr_finish(:'owner', :'jm', 'done', '{"meta": {"t": "Before 0226", "i": "Two homes."}}', NULL))->>'reason' AS fjm \gset
SELECT test_util.ok(:'fjm' = 'expired' AND (SELECT status = 'expired' AND discarded_at IS NOT NULL FROM catalog_tr_jobs WHERE id = :'jm'), 'resultado tardío con su reserva caducada: descartado y registrado');

-- 7. Cancelación.
SELECT (catalog_tr_reserve(:'owner', :'srcm', 'en', :'cat', NULL, '{"meta": true}', 300, false))->>'job' AS jc \gset
SELECT catalog_tr_cancel(:'owner', :'jc') AS c1 \gset
SELECT catalog_tr_cancel(:'owner', :'jc') AS c2 \gset
SELECT test_util.ok(:'c1' = 't' AND :'c2' = 'f', 'cancelar: sí la primera vez, no la segunda');
SELECT (catalog_tr_finish(:'owner', :'jc', 'done', '{"meta": {"t": "Cancelled", "i": null}}', NULL))->>'reason' AS fjc \gset
SELECT test_util.ok(:'fjc' = 'cancelled'
                    AND NOT EXISTS (SELECT 1 FROM catalog_tr_texts WHERE source_id = :'srcm' AND lang = 'en'), 'resultado tras cancelar: descartado, nada guardado');
SELECT test_util.expect_error(format('SELECT catalog_tr_cancel(%L, %L)', :'h2', :'jc'), 'job_not_found');

-- 8. Resultado incierto: sin reintento automático (DA36).
SELECT (catalog_tr_reserve(:'owner', :'srcm', 'en', :'cat', NULL, '{"meta": true}', 300, false))->>'job' AS ju \gset
SELECT (catalog_tr_finish(:'owner', :'ju', 'uncertain', NULL, 'tiempo agotado tras enviar'))->>'state' AS fju \gset
SELECT test_util.ok(:'fju' = 'recorded'
                    AND (SELECT status FROM catalog_tr_jobs WHERE id = :'ju') = 'uncertain', 'tiempo agotado tras enviar: «incierto» registrado');
SELECT test_util.ok((catalog_tr_reserve(:'owner', :'srcm', 'en', :'cat', NULL, '{"meta": true}', 300, false))->>'state' = 'uncertain', 'sin pedirlo expresamente no se vuelve a preparar');
SELECT test_util.ok((catalog_tr_reserve(:'owner', :'srcm', 'en', :'cat', NULL, '{"meta": true}', 300, true))->>'state' = 'reserved', '«Volver a preparar» (retry) sí reserva');
SELECT (SELECT id FROM catalog_tr_jobs WHERE source_id = :'srcm' AND lang = 'en' AND status = 'reserved') AS jm2 \gset
SELECT test_util.ok((catalog_tr_finish(:'owner', :'jm2', 'done', '{"meta": {"t": "Before 0226", "i": "Two homes in Salamanca."}}', NULL))->>'state' = 'saved', 'título del catálogo preparado');
SELECT test_util.ok((SELECT count(*) FROM catalog_tr_jobs WHERE source_id = :'srcm' AND lang = 'en' AND status = 'reserved') = 0, 'ningún trabajo queda reservado');
SELECT (SELECT id FROM catalog_tr_jobs WHERE source_id = :'src1' AND lang = 'fr') AS jfr \gset
SELECT (catalog_tr_finish(:'owner', :'jfr', 'failed', NULL, 'IA 500'))->>'state' AS ffr \gset
SELECT test_util.ok(:'ffr' = 'recorded'
                    AND (catalog_tr_reserve(:'owner', :'src1', 'fr', :'cat', :'p1', :'needs1', 300, false))->>'state' = 'reserved', 'un fallo del proveedor se registra y se puede volver a preparar');

-- 9. Revisión: editar con la revisión que se vio; bloqueos.
SELECT id AS t1 FROM catalog_tr_texts WHERE source_id = :'src1' AND lang = 'en' \gset
SELECT test_util.expect_error(format('SELECT catalog_tr_save(%L, %L, 7, %L)', :'owner', :'t1', '{"t": "X", "b": [{"k": "intro", "x": "Y"}]}'), 'translation_changed');
SELECT test_util.expect_error(format('SELECT catalog_tr_save(%L, %L, 1, %L)', :'owner', :'t1', '{"t": "X", "b": [{"k": "living", "x": "Y"}]}'), 'translation_keys');
SELECT test_util.expect_error(format('SELECT catalog_tr_save(%L, %L, 1, %L)', :'owner', :'t1', '{"t": "X", "b": [{"k": "intro", "x": "Call 612 345 678."}]}'), 'text_has_contact');
SELECT test_util.expect_error(format('SELECT catalog_tr_save(%L, %L, 1, %L)', :'owner', :'t1', '{"t": "X", "b": [{"k": "intro", "x": "Only 1,450,000 €."}]}'), 'text_has_price');
SELECT test_util.expect_error(format('SELECT catalog_tr_save(%L, %L, 1, %L)', :'h2', :'t1', '{"t": "X", "b": [{"k": "intro", "x": "Y"}]}'), 'translation_not_found');
SELECT catalog_tr_save(:'owner', :'t1', 1, '{"t": "Penthouse with a terrace in Recoletos", "b": [{"k": "intro", "x": "A 40 m² living room full of light."}]}') AS sv \gset
SELECT test_util.ok(:'sv' = '2'
                    AND (SELECT origin = 'manual' AND status = 'draft' FROM catalog_tr_texts WHERE id = :'t1'), 'editar: revisión 2, «manual», sigue en revisión');
SELECT catalog_tr_feature_save(:'owner', 'en', 'Ascensor', 'Elevator');
SELECT test_util.ok((SELECT tr = 'Elevator' AND origin = 'manual' AND status = 'draft' FROM catalog_tr_features WHERE owner_id = :'owner' AND lang = 'en' AND es = 'Ascensor'), 'característica corregida a mano (en revisión)');
SELECT test_util.expect_error(format('SELECT catalog_tr_feature_save(%L, %L, %L, %L)', :'owner', 'en', 'Portero', 'call 612 345 678'), 'text_has_contact');

-- 10. Aprobar tal como se vio y copiar al catálogo (sin tocar la biblioteca).
SELECT id AS ta FROM catalog_tr_texts WHERE source_id = :'srca' AND lang = 'en' \gset
SELECT version AS v0 FROM catalogs WHERE id = :'cat' \gset
\set parts_bad '{"text": {"id": "TID", "rev": 1}, "area": null, "features": [], "list": []}'
SELECT test_util.expect_error(format('SELECT catalog_tr_approve(%L, %L, %L, %L, %L, %L)', :'owner', :'cat', :'p1', 'en', :'full1', replace(:'parts_bad', 'TID', :'t1')), 'translation_changed');
-- Sin plantilla, la huella que se ve tiene que ser la de la fuente: si no, nada se aprueba (todo o nada).
SELECT test_util.expect_error(format('SELECT catalog_tr_approve(%L, %L, %L, %L, %L, %L)', :'owner', :'cat', :'p1', 'en', md5('otra'),
  json_build_object('text', json_build_object('id', :'t1', 'rev', 2), 'area', NULL, 'features', '[]'::json, 'list', '[]'::json)), 'translation_changed');
SELECT test_util.ok((SELECT status FROM catalog_tr_texts WHERE id = :'t1') = 'draft' AND NOT EXISTS (SELECT 1 FROM catalog_tr_copies), 'un error al copiar deshace también la aprobación');
SELECT catalog_tr_approve(:'owner', :'cat', :'p1', 'en', :'full1',
  json_build_object('text', json_build_object('id', :'t1', 'rev', 2), 'area', json_build_object('id', :'ta', 'rev', 1),
                    'features', json_build_array(json_build_object('es', 'Ascensor', 'tr', 'Elevator'), json_build_object('es', 'Terraza de 40 m²', 'tr', '40 m² terrace')),
                    'list', json_build_array('Ascensor', 'Terraza de 40 m²', 'Portero'))::jsonb) AS vap \gset
SELECT test_util.ok(:vap = :v0 + 1, 'aprobar: copia en el catálogo y sube la versión');
SELECT test_util.ok((SELECT status = 'approved' FROM catalog_tr_texts WHERE id = :'t1') AND (SELECT status = 'approved' FROM catalog_tr_texts WHERE id = :'ta')
                    AND (SELECT bool_and(status = 'approved') FROM catalog_tr_features WHERE owner_id = :'owner' AND lang = 'en'), 'texto, plantilla y características aprobados');
SELECT test_util.ok((SELECT es_sig = :'full1' AND jsonb_array_length(content->'b') = 2 AND content->'b'->1->>'k' = 'barrio'
                       AND content->'b'->1->>'x' = 'Recoletos is a neighbourhood of stately buildings.' AND jsonb_array_length(features) = 2
                     FROM catalog_tr_copies WHERE catalog_id = :'cat' AND property_id = :'p1' AND lang = 'en'), 'la copia: bloques propios + plantilla al final («barrio»), solo características aprobadas');
SELECT test_util.ok((SELECT n FROM pcv_before) = (SELECT count(*) FROM property_copy_versions), 'DA31: traducir el texto propio no lo lleva a la biblioteca');
SELECT test_util.ok(catalog_tr_copy_set(:'owner', :'cat', :'p1', 'en', :'full1', :'t1', :'ta', '["Ascensor", "Terraza de 40 m²", "Portero"]') = :v0 + 1, 'copiar lo mismo otra vez: idempotente, sin subir la versión');
SELECT test_util.expect_error(format('SELECT catalog_tr_copy_set(%L, %L, %L, %L, %L, %L, NULL, %L)', :'owner', :'cat', :'p1', 'en', md5('otra'), :'t1', '[]'), 'translation_changed');
SELECT test_util.expect_error(format('SELECT catalog_tr_copy_set(%L, %L, %L, %L, %L, %L, NULL, %L)', :'owner', :'cat', :'p2', 'en', :'sig2', :'t1', '[]'), 'translation_not_found');
SELECT id AS t2 FROM catalog_tr_texts WHERE source_id = :'src2' AND lang = 'en' \gset
SELECT test_util.expect_error(format('SELECT catalog_tr_copy_set(%L, %L, %L, %L, %L, %L, NULL, %L)', :'owner', :'cat', :'p2', 'en', :'sig2', :'t2', '[]'), 'translation_not_approved');

-- 11. Lectura pública por idioma (DA19): solo copias, solo en ese idioma.
SELECT test_util.ok(test_util.t_fp(:'tok') = :'fp0' AND NOT (test_util.t_item(:'tok', 'atico-demo-1') ? 'tr'), 'español: la copia inglesa no entra ni cambia la huella');
SELECT id AS link1 FROM catalog_client_links WHERE token = :'ptok' \gset
SELECT id AS link2 FROM catalog_client_links WHERE token = :'ptok2' \gset
SELECT catalog_client_link_set_lang(:'owner', :'link1', 'en');
SELECT test_util.ok(test_util.t_item(:'ptok', 'atico-demo-1')->'tr'->>'s' = :'full1'
                    AND test_util.t_item(:'ptok', 'atico-demo-1')->'tr'->>'t' = 'Penthouse with a terrace in Recoletos'
                    AND test_util.t_item(:'ptok', 'atico-demo-1')->'tr'->'b'->0->>'k' = 'intro'
                    AND NOT (test_util.t_item(:'ptok', 'piso-demo-2') ? 'tr'), 'enlace personal en inglés: su copia, con huella del español y claves; p2 sin copia (N5 en el lector)');
SELECT test_util.ok(test_util.t_fp(:'ptok') <> :'fp0' AND (SELECT fingerprint FROM get_catalog_states(ARRAY[:'ptok'])) = test_util.t_fp(:'ptok'), 'huella por idioma, también en el vigilante');
SELECT test_util.ok(test_util.t_fp(:'ptok2') = test_util.t_fp(:'tok') AND NOT (test_util.t_item(:'ptok2', 'atico-demo-1') ? 'tr'), 'DA17: el otro enlace personal sigue en español, con su huella');
SELECT catalog_client_link_set_lang(:'owner', :'link2', 'fr');
SELECT test_util.ok(NOT (test_util.t_item(:'ptok2', 'atico-demo-1') ? 'tr') AND test_util.t_snap(:'ptok2')->>'lang' = 'fr', 'francés sin copias: ninguna traducción de otro idioma se cuela');
SELECT catalog_client_link_set_lang(:'owner', :'link2', NULL);
SELECT test_util.t_fp(:'ptok') AS fp_en \gset

-- 12. DA34: datos operativos de la instantánea actual en cada idioma; C2 en cada idioma.
RESET ROLE;
UPDATE properties SET price = 1500000 WHERE id = :'p1';
SET ROLE service_role;
SELECT test_util.ok((test_util.t_item(:'ptok', 'atico-demo-1')->>'price')::numeric = 1500000 AND test_util.t_fp(:'ptok') <> :'fp_en', 'precio cambiado: se ve al momento en inglés (y cambia la huella)');
SELECT catalog_photo_exclude(:'owner', :'cat', :'p1', 'c6000000-0000-0000-0000-000000000002', true);
SELECT test_util.ok(jsonb_array_length(test_util.t_item(:'ptok', 'atico-demo-1')->'pp'->'x') = 1, 'foto excluida: también en inglés');
RESET ROLE;
UPDATE properties SET bedrooms = bedrooms + 1 WHERE id = :'p1';
SET ROLE service_role;
SELECT test_util.ok(NOT (test_util.t_item(:'ptok', 'atico-demo-1') ? 'text') AND NOT (test_util.t_item(:'tok', 'atico-demo-1') ? 'text')
                    AND test_util.t_item(:'ptok', 'atico-demo-1') ? 'tr', 'C2: con la ficha cambiada el texto sale de los dos idiomas; la copia viaja y el lector la invalida por huella (N5)');
RESET ROLE;
UPDATE properties SET bedrooms = bedrooms - 1, price = 1450000 WHERE id = :'p1';
SET ROLE service_role;
SELECT catalog_photo_exclude(:'owner', :'cat', :'p1', 'c6000000-0000-0000-0000-000000000002', false);

-- 13. Activación: solo con el idioma completo (todas las viviendas + catálogo).
SELECT version AS v1 FROM catalogs WHERE id = :'cat' \gset
\set req_ok '{"meta": "MSIG", "items": [{"p": "P1", "s": "S1", "f": ["Ascensor", "Terraza de 40 m²"]}, {"p": "P2", "s": "S2", "f": []}]}'
SELECT replace(replace(replace(replace(replace(:'req_ok', 'MSIG', :'msig'), 'P1', :'p1'), 'P2', :'p2'), 'S1', :'full1'), 'S2', :'sig2') AS req \gset
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, %s, %L)', :'owner', :'cat', 'en', :v1, :'req'), 'lang_incomplete');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, %s, %L)', :'owner', :'cat', 'en', :v1 - 1, :'req'), 'catalog_changed');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, %s, %L)', :'owner', :'cat', 'en', :v1,
  json_build_object('meta', :'msig', 'items', json_build_array(json_build_object('p', :'p1', 's', :'full1', 'f', '[]'::json)))), 'lang_incomplete');
-- Se aprueba p2 y el título del catálogo.
SELECT catalog_tr_approve(:'owner', :'cat', :'p2', 'en', :'sig2', json_build_object('text', json_build_object('id', :'t2', 'rev', 1), 'area', NULL, 'features', '[]'::json, 'list', '[]'::json)::jsonb) IS NOT NULL;
SELECT id AS tm FROM catalog_tr_texts WHERE source_id = :'srcm' AND lang = 'en' \gset
SELECT catalog_tr_approve(:'owner', :'cat', NULL, 'en', :'msig', json_build_object('text', json_build_object('id', :'tm', 'rev', 1), 'area', NULL, 'features', '[]'::json, 'list', '[]'::json)::jsonb) IS NOT NULL;
SELECT test_util.ok(test_util.t_snap(:'ptok')->'trm'->>'t' = 'Before 0226' AND test_util.t_snap(:'ptok')->'trm'->>'s' = :'msig', 'el título del catálogo traducido viaja en «trm»');
SELECT version AS v2 FROM catalogs WHERE id = :'cat' \gset
-- Falta una característica en la copia.
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, %s, %L)', :'owner', :'cat', 'en', :v2,
  replace(:'req', '"f": []', '"f": ["Portero"]')), 'lang_incomplete');
SELECT catalog_tr_activate(:'owner', :'cat', NULL, 'en', :v2, :'req') AS va \gset
SELECT test_util.ok(:va = :v2 + 1 AND (SELECT default_lang FROM catalogs WHERE id = :'cat') = 'en', 'completo: el catálogo pasa a inglés');
SELECT test_util.ok(test_util.t_snap(:'tok')->>'lang' = 'en' AND test_util.t_item(:'tok', 'piso-demo-2') ? 'tr', 'el enlace general en inglés, con las dos copias');
SELECT test_util.ok(test_util.t_snap(:'ptok2')->>'lang' = 'en', 'un personal sin idioma propio sigue al catálogo');
SELECT catalog_tr_activate(:'owner', :'cat', :'link2', 'es', 0, '{}') AS vl2 \gset
SELECT test_util.ok(:vl2 > 0 AND test_util.t_snap(:'ptok2')->>'lang' = 'es' AND test_util.t_snap(:'tok')->>'lang' = 'en',
  'volver a español un enlace personal: sin comprobación, solo ese enlace (DA17)');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, %L, %L, 0, %L)', :'owner', :'cat', :'link2', 'de', '{}'), 'catalog_changed');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, NULL, 0, %L)', :'owner', :'cat', '{}'), 'invalid_lang');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, 0, %L)', :'owner', :'cat', 'pt', '{}'), 'invalid_lang');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, 0, %L)', :'h2', :'cat', 'es', '{}'), 'forbidden');

-- 14. Vivienda retirada en idioma activo: desaparece en inglés al momento.
SELECT catalog_remove_item(:'owner', :'cat', :'p2');
SELECT test_util.ok(test_util.t_item(:'tok', 'piso-demo-2') IS NULL AND jsonb_array_length(test_util.t_snap(:'tok')->'items') = 1, 'vivienda retirada: fuera también en inglés (la copia no la conserva)');
SELECT catalog_add_property(:'owner', :'cat', :'p2');

-- 15. Rechazar y quitar.
SELECT (catalog_tr_reserve(:'owner', :'src2', 'de', :'cat', :'p2', '{"text": true}', 300, false))->>'job' AS jde \gset
SELECT (catalog_tr_finish(:'owner', :'jde', 'done', '{"text": {"t": "Ruhige Wohnung", "b": [{"k": "intro", "x": "Ruhige Wohnung."}]}}', NULL))->>'state' = 'saved';
SELECT id AS tde FROM catalog_tr_texts WHERE source_id = :'src2' AND lang = 'de' \gset
SELECT catalog_tr_reject(:'owner', :'tde') AS rj1 \gset
SELECT catalog_tr_reject(:'owner', :'tde') AS rj2 \gset
SELECT test_util.ok(:'rj1' = 't' AND :'rj2' = 'f', 'rechazar una traducción en revisión');
SELECT (catalog_tr_reserve(:'owner', :'src2', 'de', :'cat', :'p2', '{"text": true}', 300, false))->>'job' AS jde2 \gset
SELECT (catalog_tr_finish(:'owner', :'jde2', 'done', '{"text": {"t": "Ruhige Wohnung 2", "b": [{"k": "intro", "x": "Ruhige Wohnung mit Küche."}]}}', NULL))->>'state' = 'saved';
SELECT test_util.ok((SELECT status = 'draft' AND rev = 2 AND content->>'t' = 'Ruhige Wohnung 2' FROM catalog_tr_texts WHERE id = :'tde'), 'tras rechazar se puede preparar otra (sustituye a la rechazada)');
SELECT version AS v3 FROM catalogs WHERE id = :'cat' \gset
SELECT test_util.ok(catalog_tr_copy_remove(:'owner', :'cat', :'p1', 'fr') = :v3, 'quitar una copia que no existe: sin cambios');

-- 15b. Biblioteca (DA31): la traducción de una versión aprobada se reutiliza
-- sin IA en otro catálogo con esa MISMA versión; un texto propio no.
SELECT catalog_create(:'owner', 'Biblio 1', NULL) AS cl1 \gset
SELECT catalog_add_property(:'owner', :'cl1', :'p4');
SELECT catalog_text_save_draft(:'owner', :'cl1', :'p4', 'Estudio con luz', 'Estudio exterior y reformado.', NULL, NULL, 'manual', NULL) AS r4 \gset
SELECT catalog_text_publish(:'owner', :'cl1', :'p4', :r4);
SELECT catalog_copy_approve(:'owner', :'cl1', :'p4', 'both') IS NOT NULL;
SELECT count(*) AS pcv1 FROM property_copy_versions \gset
SELECT catalog_create(:'owner', 'Biblio 2', NULL) AS cl2 \gset
SELECT catalog_add_property(:'owner', :'cl2', :'p4');
\set es4 '{"t": "Estudio con luz", "b": [{"k": "intro", "x": "Estudio exterior y reformado."}]}'
SELECT md5('p4-es') AS sig4 \gset
SELECT catalog_tr_source_ensure(:'owner', :'cl1', :'p4', :'sig4', :'es4') AS l1 \gset
SELECT catalog_tr_source_ensure(:'owner', :'cl2', :'p4', :'sig4', :'es4') AS l2 \gset
SELECT test_util.ok((:'l1'::jsonb)->>'kind' = 'library' AND (:'l1'::jsonb)->>'id' = (:'l2'::jsonb)->>'id', 'copia exacta de la biblioteca: la MISMA fuente en los dos catálogos');
SELECT test_util.ok((catalog_tr_es_state(:'owner', :'cl2'))->'map'->0->>'cv' IS NOT NULL, 'es_state lleva la versión de la biblioteca');
SELECT (:'l1'::jsonb)->>'id' AS srcl \gset
SELECT (catalog_tr_reserve(:'owner', :'srcl', 'en', :'cl1', :'p4', '{"text": true}', 300, false))->>'job' AS jl \gset
SELECT (catalog_tr_finish(:'owner', :'jl', 'done', '{"text": {"t": "Bright studio", "b": [{"k": "intro", "x": "Outward-facing, renovated studio."}]}}', NULL))->>'state' = 'saved';
SELECT id AS tl FROM catalog_tr_texts WHERE source_id = :'srcl' AND lang = 'en' \gset
SELECT catalog_tr_approve(:'owner', :'cl1', :'p4', 'en', :'sig4', json_build_object('text', json_build_object('id', :'tl', 'rev', 1), 'area', NULL, 'features', '[]'::json, 'list', '[]'::json)::jsonb) IS NOT NULL;
SELECT catalog_tr_copy_set(:'owner', :'cl2', :'p4', 'en', :'sig4', :'tl', NULL, '[]') AS vcl2 \gset
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_tr_copies WHERE catalog_id = :'cl2' AND property_id = :'p4' AND lang = 'en' AND content->>'t' = 'Bright studio'),
  'el otro catálogo con la misma versión la usa sin preparar nada (sin IA)');
SELECT test_util.ok((SELECT count(*) FROM property_copy_versions) = :pcv1, 'traducir no crea versiones en la biblioteca');
-- El segundo catálogo personaliza su texto: ya no es la versión de la biblioteca.
SELECT catalog_text_save_draft(:'owner', :'cl2', :'p4', 'Estudio para Ana', 'Estudio exterior y reformado.', NULL, NULL, 'manual', 1) AS r5 \gset
SELECT catalog_text_publish(:'owner', :'cl2', :'p4', :r5);
SELECT test_util.ok((catalog_tr_source_ensure(:'owner', :'cl2', :'p4', md5('p4-ana'), '{"t": "Estudio para Ana", "b": []}'))->>'kind' = 'catalog', 'texto personalizado: fuente propia del catálogo');
SELECT test_util.expect_error(format('SELECT catalog_tr_copy_set(%L, %L, %L, %L, %L, %L, NULL, %L)', :'owner', :'cl2', :'p4', 'en', :'sig4', :'tl', '[]'), 'translation_not_found');
SELECT test_util.ok((SELECT count(*) FROM property_copy_versions) = :pcv1, 'y nunca entra solo en la biblioteca');

-- 16. Ninguna escritura fuera: ficha del CRM y caché de descripciones intactas.
SELECT test_util.ok((SELECT md5(row_to_json(p)::text) FROM properties p WHERE id = :'p1') = :'p1h', 'la ficha del CRM, idéntica (huella de la fila)');
RESET ROLE;
SELECT test_util.ok((SELECT h FROM pcd_before) = (SELECT md5(coalesce(string_agg(row_to_json(d)::text, '|' ORDER BY property_id, language), '')) FROM property_client_descriptions d),
  'nunca escribe en property_client_descriptions');

-- 17. Permisos: anon y authenticated no ven tablas ni ejecutan funciones.
SET ROLE anon;
SELECT test_util.expect_error('SELECT * FROM catalog_tr_copies', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT * FROM catalog_tr_jobs', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve(%L, %L, %L, NULL, NULL, %L, 300, false)', :'owner', :'src1', 'en', '{}'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_lang_snapshot(%L, %L)', :'cat', 'en'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error('SELECT * FROM catalog_tr_texts', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, 0, %L)', :'owner', :'cat', 'es', '{}'), 'insufficient_privilege');
RESET ROLE;
SELECT test_util.ok((SELECT bool_and(relrowsecurity) FROM pg_class WHERE relname IN ('catalog_tr_sources','catalog_tr_texts','catalog_tr_features','catalog_tr_copies','catalog_tr_meta_copies','catalog_tr_jobs')), 'RLS activada en las seis tablas');
INSERT INTO test_util.carry (k, v) VALUES ('t24_src2', :'src2') ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-translations.sql: todas las comprobaciones en verde'
