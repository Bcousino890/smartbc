-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-21-bcp-01-ampliacion-textos-idiomas,
-- traducción automática «como en itinerarios», decisión de Fabricio del
-- 22-10-2026). Tests de 0228 en el Postgres temporal: stub + fixtures +
-- 0192–0227 + traducciones previas + 0228 (aplicada dos veces). Datos 100 %
-- sintéticos; ninguna IA (SQL no la llama nunca).
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set h2    '00000000-0000-0000-0000-0000000000ba'
\set p1 '10000000-0000-0000-0000-000000000001'
\set p2 '10000000-0000-0000-0000-000000000002'
SELECT v AS cat   FROM test_util.carry WHERE k = 't24_cat' \gset
SELECT v AS tok   FROM test_util.carry WHERE k = 't24_tok' \gset
SELECT v AS ptok  FROM test_util.carry WHERE k = 't24_ptok' \gset
SELECT v AS ptok2 FROM test_util.carry WHERE k = 't24_ptok2' \gset
SELECT v AS p1h   FROM test_util.carry WHERE k = 't24_p1h' \gset
SELECT v AS s1    FROM test_util.carry WHERE k = 'ta_s1' \gset
SELECT v AS s2    FROM test_util.carry WHERE k = 'ta_s2' \gset
SELECT v AS t1    FROM test_util.carry WHERE k = 'ta_t1' \gset
SELECT v AS link1 FROM test_util.carry WHERE k = 'ta_link1' \gset
SELECT v AS fpes  FROM test_util.carry WHERE k = 'ta_fpes' \gset
SELECT v AS fpen  FROM test_util.carry WHERE k = 'ta_fpen' \gset
SELECT v AS sig2  FROM test_util.carry WHERE k = 'ta_sig2' \gset
SELECT v AS v0    FROM test_util.carry WHERE k = 'ta_v0' \gset
INSERT INTO auth.users (id, email) VALUES (:'h2', 'home.cinco@ejemplo.test') ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, role, full_name, email) VALUES (:'h2', 'admin', 'Home Cinco', 'home.cinco@ejemplo.test') ON CONFLICT DO NOTHING;
INSERT INTO home_owners (profile_id) VALUES (:'h2') ON CONFLICT DO NOTHING;
CREATE TEMP TABLE pcd_before_a AS SELECT md5(coalesce(string_agg(row_to_json(d)::text, '|' ORDER BY property_id, language), '')) AS h FROM property_client_descriptions d;
GRANT SELECT ON pcd_before_a TO service_role;
\set L '{"max_active": 2, "daily_cap": 300, "max_failures": 5, "waits": [300, 1800, 7200, 43200]}'
\set LM '{"manual": true, "max_active": 2, "daily_cap": 300, "max_failures": 5, "waits": [300, 1800, 7200, 43200]}'

-- 1. Desplegar 0228 no cambia NINGUNA huella ni lo aprobado.
SET ROLE service_role;
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fpes' AND (get_public_catalog(:'ptok'))->>'fingerprint' = :'fpen', '0228: mismas huellas en español y en inglés');
SELECT test_util.ok((SELECT approval FROM catalog_tr_texts WHERE id = :'t1') = 'manual' AND (SELECT status FROM catalog_tr_texts WHERE source_id = :'s2' AND lang = 'en') = 'draft'
                    AND (SELECT approval FROM catalog_tr_texts WHERE source_id = :'s2' AND lang = 'en') IS NULL, 'lo aprobado antes de 0228 queda «manual»; los borradores, sin marca');
SELECT test_util.ok((SELECT approval FROM catalog_tr_features WHERE owner_id = :'owner' AND lang = 'en' AND es = 'Ascensor') = 'manual', 'y las características aprobadas, también');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_tr_jobs WHERE auto), 'ningún trabajo previo queda como automático');
RESET ROLE;
SELECT test_util.expect_error('UPDATE catalog_tr_texts SET approval = ''sola'' WHERE status = ''approved''', 'check_violation');
SET ROLE service_role;

-- 2. Reserva con límites: una por fuente e idioma, N a la vez por catálogo.
SELECT md5('p3a') AS sa, md5('p3b') AS sb, md5('p3c') AS sc \gset
SELECT (catalog_tr_source_ensure(:'owner', :'cat', :'p1', :'sa', '{"t": "A", "b": [{"k": "intro", "x": "Uno."}]}'))->>'id' AS srca \gset
SELECT (catalog_tr_source_ensure(:'owner', :'cat', :'p2', :'sb', '{"t": "B", "b": [{"k": "intro", "x": "Dos."}]}'))->>'id' AS srcb \gset
SELECT (catalog_tr_source_ensure(:'owner', :'cat', NULL, :'sc', '{"t": "C", "i": null}'))->>'id' AS srcc \gset
SELECT catalog_tr_reserve_auto(:'owner', :'srca', 'de', :'cat', :'p1', '{"text": true}', 300, :'L') AS ra \gset
SELECT test_util.ok((:'ra'::jsonb)->>'state' = 'reserved' AND (SELECT auto FROM catalog_tr_jobs WHERE id = ((:'ra'::jsonb)->>'job')::uuid), 'visita: reservada y marcada como automática');
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srca', 'de', :'cat', :'p1', '{"text": true}', 300, :'L'))->>'state' = 'busy', 'la misma fuente e idioma a la vez: «en preparación» (un solo trabajo)');
SELECT catalog_tr_reserve_auto(:'owner', :'srcb', 'de', :'cat', :'p2', '{"text": true}', 300, :'L') AS rb \gset
SELECT test_util.ok((:'rb'::jsonb)->>'state' = 'reserved', 'otra vivienda del catálogo: segunda a la vez');
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srcc', 'de', :'cat', NULL, '{"meta": true}', 300, :'L'))->>'state' = 'limit', 'la tercera a la vez: «limit» (como mucho 2 por catálogo)');
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srcc', 'de', :'cat', NULL, '{"meta": true}', 300, :'LM'))->>'state' = 'limit', 'también para el dueño («Preparar ahora»)');
SELECT test_util.ok((SELECT count(*) FROM catalog_tr_jobs WHERE catalog_id = :'cat' AND status = 'reserved') = 2, 'dos reservas vigentes, ni una más');
SELECT test_util.ok((catalog_tr_finish(:'owner', ((:'ra'::jsonb)->>'job')::uuid, 'done', '{"text": {"t": "A-de", "b": [{"k": "intro", "x": "Eins."}]}}', NULL))->>'state' = 'saved', 'terminar libera un hueco');
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srcc', 'de', :'cat', NULL, '{"meta": true}', 300, :'L'))->>'state' = 'reserved', 'y la tercera ya entra');
-- Reservas caducadas del catálogo dejan de contar (y quedan registradas).
RESET ROLE;
UPDATE catalog_tr_jobs SET expires_at = now() - interval '1 second' WHERE catalog_id = :'cat' AND status = 'reserved';
SET ROLE service_role;
SELECT (catalog_tr_reserve_auto(:'owner', :'s1', 'it', :'cat', :'p1', '{"text": true}', 300, :'LM'))->>'state' AS rit \gset
SELECT test_util.ok(:'rit' = 'reserved' AND (SELECT count(*) FROM catalog_tr_jobs WHERE catalog_id = :'cat' AND status = 'expired') = 2, 'las reservas caducadas del catálogo pasan a «expired» y no ocupan hueco');
SELECT test_util.ok((SELECT NOT auto FROM catalog_tr_jobs WHERE source_id = :'s1' AND lang = 'it'), 'el trabajo del dueño no cuenta como automático');
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srca', 'de', :'cat', :'p1', '{"text": true}', 300, :'L'))->>'state' = 'ready', 'lo ya traducido: «ready», sin reserva (sin IA)');

-- 3. Espera creciente tras fallos (fallido, incierto o caducado).
SELECT md5('p-fail') AS sf \gset
SELECT (catalog_tr_source_ensure(:'owner', :'cat', :'p2', :'sf', '{"t": "F", "b": [{"k": "intro", "x": "Falla."}]}'))->>'id' AS srcf \gset
RESET ROLE;
CREATE OR REPLACE FUNCTION test_util.t_fail(p_owner uuid, p_src uuid, p_cat uuid, p_prop uuid, p_out text, p_limits jsonb) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := catalog_tr_reserve_auto(p_owner, p_src, 'tr', p_cat, p_prop, '{"text": true}', 300, p_limits);
  IF r->>'state' <> 'reserved' THEN RETURN r->>'state'; END IF;
  PERFORM catalog_tr_finish(p_owner, (r->>'job')::uuid, p_out, NULL, 'fallo simulado');
  RETURN 'reserved';
END $$;
GRANT EXECUTE ON FUNCTION test_util.t_fail(uuid, uuid, uuid, uuid, text, jsonb) TO service_role;
CREATE OR REPLACE FUNCTION test_util.t_age(p_src uuid, p_secs integer) RETURNS void LANGUAGE sql AS $$
  UPDATE catalog_tr_jobs SET reserved_at = reserved_at - make_interval(secs => p_secs), finished_at = finished_at - make_interval(secs => p_secs),
                             expires_at = expires_at - make_interval(secs => p_secs)
   WHERE source_id = p_src AND lang = 'tr'
$$;
SET ROLE service_role;
SELECT test_util.ok(test_util.t_fail(:'owner', :'srcf', :'cat', :'p2', 'uncertain', :'L') = 'reserved', 'primer intento (incierto)');
SELECT catalog_tr_reserve_auto(:'owner', :'srcf', 'tr', :'cat', :'p2', '{"text": true}', 300, :'L') AS w1 \gset
SELECT test_util.ok((:'w1'::jsonb)->>'state' = 'waiting' AND ((:'w1'::jsonb)->>'failures')::int = 1
                    AND ((:'w1'::jsonb)->>'until')::timestamptz BETWEEN now() + interval '299 seconds' AND now() + interval '301 seconds', 'tras un incierto, la siguiente visita espera 5 min (no reintenta en bucle)');
SELECT test_util.ok((catalog_tr_reserve(:'owner', :'srcf', 'tr', :'cat', :'p2', '{"text": true}', 300, false))->>'state' = 'uncertain', 'la reserva de 0226 sigue sin reintentar un incierto');
RESET ROLE; SELECT test_util.t_age(:'srcf', 301); SET ROLE service_role;
SELECT test_util.ok(test_util.t_fail(:'owner', :'srcf', :'cat', :'p2', 'failed', :'L') = 'reserved', 'pasados 5 min: segundo intento (fallido)');
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srcf', 'tr', :'cat', :'p2', '{"text": true}', 300, :'L'))->>'failures' = '2', 'dos fallos seguidos');
RESET ROLE; SELECT test_util.t_age(:'srcf', 600); SET ROLE service_role;
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srcf', 'tr', :'cat', :'p2', '{"text": true}', 300, :'L'))->>'state' = 'waiting', 'tras el segundo, 10 min no bastan (30 min)');
RESET ROLE; SELECT test_util.t_age(:'srcf', 1300); SET ROLE service_role;
SELECT test_util.ok(test_util.t_fail(:'owner', :'srcf', :'cat', :'p2', 'failed', :'L') = 'reserved', 'a los 30 min: tercero');
RESET ROLE; SELECT test_util.t_age(:'srcf', 7201); SET ROLE service_role;
-- Un caducado también cuenta (pudo cobrarse).
SELECT (catalog_tr_reserve_auto(:'owner', :'srcf', 'tr', :'cat', :'p2', '{"text": true}', 300, :'L'))->>'job' AS jexp \gset
RESET ROLE; UPDATE catalog_tr_jobs SET expires_at = now() - interval '1 second' WHERE id = :'jexp'; SELECT test_util.t_age(:'srcf', 43201); SET ROLE service_role;
SELECT test_util.ok(test_util.t_fail(:'owner', :'srcf', :'cat', :'p2', 'failed', :'L') = 'reserved', 'el cuarto caducó (cuenta) y a las 12 h, quinto');
SELECT catalog_tr_reserve_auto(:'owner', :'srcf', 'tr', :'cat', :'p2', '{"text": true}', 300, :'L') AS st \gset
SELECT test_util.ok((:'st'::jsonb)->>'state' = 'stopped' AND ((:'st'::jsonb)->>'failures')::int = 5, 'cinco fallos seguidos: ya no se reintenta solo («stopped»)');
RESET ROLE; SELECT test_util.t_age(:'srcf', 30 * 86400); SET ROLE service_role;
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srcf', 'tr', :'cat', :'p2', '{"text": true}', 300, :'L'))->>'state' = 'stopped', 'ni un mes después');
SELECT catalog_tr_reserve_auto(:'owner', :'srcf', 'tr', :'cat', :'p2', '{"text": true}', 300, :'LM') AS rm \gset
SELECT test_util.ok((:'rm'::jsonb)->>'state' = 'reserved', '«Preparar ahora» del dueño sí reserva');
SELECT test_util.ok((catalog_tr_finish(:'owner', ((:'rm'::jsonb)->>'job')::uuid, 'done', '{"text": {"t": "F-tr", "b": [{"k": "intro", "x": "Hata."}]}}', NULL))->>'state' = 'saved', 'y guarda');
SELECT md5('p-fail-2') AS sf2 \gset
SELECT (catalog_tr_source_ensure(:'owner', :'cat', :'p2', :'sf2', '{"t": "G", "b": [{"k": "intro", "x": "Otra."}]}'))->>'id' AS srcg \gset
-- Tras un trabajo terminado la cuenta vuelve a cero (en la misma fuente).
RESET ROLE; DELETE FROM catalog_tr_texts WHERE source_id = :'srcf' AND lang = 'tr'; SET ROLE service_role;
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srcf', 'tr', :'cat', :'p2', '{"text": true}', 300, :'L'))->>'state' = 'reserved', 'un trabajo terminado reinicia la cuenta de fallos');
-- Una cancelación no cuenta como fallo.
RESET ROLE; UPDATE catalog_tr_jobs SET status = 'cancelled', finished_at = now() WHERE source_id = :'srcf' AND status = 'reserved'; SET ROLE service_role;
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srcf', 'tr', :'cat', :'p2', '{"text": true}', 300, :'L'))->>'state' = 'reserved', 'una cancelación no cuenta como fallo');
RESET ROLE; UPDATE catalog_tr_jobs SET status = 'cancelled', finished_at = now() WHERE source_id = :'srcf' AND status = 'reserved'; SET ROLE service_role;

-- 4. Tope diario por catálogo (solo visitas).
SELECT count(*) AS nauto FROM catalog_tr_jobs WHERE catalog_id = :'cat' AND auto AND reserved_at > now() - interval '24 hours' \gset
SELECT jsonb_build_object('max_active', 2, 'daily_cap', :nauto, 'max_failures', 5, 'waits', '[300]'::jsonb) AS l1 \gset
SELECT test_util.ok(:nauto >= 3, 'hoy ya hay trabajos automáticos en este catálogo');
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srcg', 'he', :'cat', :'p2', '{"text": true}', 300, :'l1'))->>'state' = 'cap', 'con el tope en esa cifra: «cap» (ninguna llamada más hoy)');
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'srcg', 'he', :'cat', :'p2', '{"text": true}', 300, jsonb_set(:'l1'::jsonb, '{manual}', 'true')))->>'state' = 'reserved', 'el dueño no cuenta en el tope');
RESET ROLE; UPDATE catalog_tr_jobs SET status = 'cancelled', finished_at = now() WHERE source_id = :'srcg' AND status = 'reserved'; SET ROLE service_role;

-- 5. Validaciones y propiedad.
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve_auto(%L, %L, %L, %L, %L, %L, 300, %L)', :'owner', :'srcg', 'es', :'cat', :'p2', '{}', :'L'), 'invalid_lang');
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve_auto(%L, %L, %L, %L, %L, %L, 300, %L)', :'owner', :'srcg', 'en', :'cat', :'p2', '{}', '{"max_active": 0}'), 'invalid_limits');
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve_auto(%L, %L, %L, %L, %L, %L, 300, %L)', :'owner', :'srcg', 'en', :'cat', :'p2', '{}', '{"waits": [5]}'), 'invalid_limits');
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve_auto(%L, %L, %L, %L, %L, %L, 300, %L)', :'h2', :'srcg', 'en', :'cat', :'p2', '{}', :'L'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve_auto(%L, %L, %L, NULL, %L, %L, 300, %L)', :'owner', :'srcg', 'en', :'p2', '{}', :'L'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve_auto(%L, %L, %L, %L, %L, %L, 300, %L)', :'owner', gen_random_uuid(), 'en', :'cat', :'p2', '{}', :'L'), 'source_not_found');

-- 6. Publicar: sola ('auto') o a mano ('manual').
SELECT (SELECT id FROM catalog_tr_texts WHERE source_id = :'s2' AND lang = 'en') AS t2 \gset
SELECT version AS vb FROM catalogs WHERE id = :'cat' \gset
SELECT catalog_tr_publish(:'owner', :'cat', :'p2', 'en', :'sig2', json_build_object('text', json_build_object('id', :'t2', 'rev', 1), 'area', NULL, 'features', '[]'::json, 'list', '[]'::json)::jsonb, 'auto') AS vp \gset
SELECT test_util.ok(:vp = :vb + 1 AND (SELECT status = 'approved' AND approval = 'auto' FROM catalog_tr_texts WHERE id = :'t2')
                    AND EXISTS (SELECT 1 FROM catalog_tr_copies WHERE catalog_id = :'cat' AND property_id = :'p2' AND lang = 'en' AND es_sig = :'sig2'), 'publicar sola: aprobada «auto», copiada al catálogo y versión nueva (el vigilante lo ve)');
SELECT test_util.ok((get_public_catalog(:'ptok'))->>'fingerprint' <> :'fpen', 'la huella del enlace en inglés cambia (el lector abierto se actualiza solo)');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fpes', 'y la del enlace en español, no (DA19)');
-- Volver a publicar sola lo ya aprobado a mano no lo cambia a «auto».
SELECT catalog_tr_publish(:'owner', :'cat', :'p1', 'en', (SELECT es_sig FROM catalog_tr_sources WHERE id = :'s1'), json_build_object('text', json_build_object('id', :'t1', 'rev', 1), 'area', NULL, 'features', '[]'::json, 'list', '["Ascensor"]'::json)::jsonb, 'auto') IS NOT NULL;
SELECT test_util.ok((SELECT approval FROM catalog_tr_texts WHERE id = :'t1') = 'manual', 'lo aprobado a mano sigue «manual» aunque se vuelva a publicar sola');
-- Editar a mano (origin manual) y que una publicación automática lo publique: queda «manual».
SELECT catalog_tr_save(:'owner', :'t2', 1, '{"t": "Quiet flat (edited)", "b": [{"k": "intro", "x": "Quiet flat, edited by hand."}]}') AS r2 \gset
SELECT catalog_tr_publish(:'owner', :'cat', :'p2', 'en', :'sig2', json_build_object('text', json_build_object('id', :'t2', 'rev', :r2), 'area', NULL, 'features', '[]'::json, 'list', '[]'::json)::jsonb, 'auto') IS NOT NULL;
SELECT test_util.ok((SELECT approval = 'manual' AND origin = 'manual' AND status = 'approved' FROM catalog_tr_texts WHERE id = :'t2'), 'lo escrito a mano nunca queda como automático');
SELECT test_util.ok((SELECT content->>'t' FROM catalog_tr_copies WHERE catalog_id = :'cat' AND property_id = :'p2' AND lang = 'en') = 'Quiet flat (edited)', 'y la copia del catálogo lleva lo editado');
-- Un resultado automático posterior de la MISMA fuente no lo pisa (0226: solo sustituye rechazadas).
SELECT test_util.ok((catalog_tr_reserve_auto(:'owner', :'s2', 'en', :'cat', :'p2', '{"text": true}', 300, :'L'))->>'state' = 'ready', 'con la traducción editada, una visita no vuelve a pedirla a la IA');
-- Bloqueos: contacto o precio no se publican.
SELECT md5('p-block') AS sbk \gset
SELECT (catalog_tr_source_ensure(:'owner', :'cat', :'p2', :'sbk', '{"t": "K", "b": [{"k": "intro", "x": "Bloqueo."}]}'))->>'id' AS srck \gset
SELECT (catalog_tr_reserve_auto(:'owner', :'srck', 'en', :'cat', :'p2', '{"text": true}', 300, :'L'))->>'job' AS jk \gset
SELECT (catalog_tr_finish(:'owner', :'jk', 'done', '{"text": {"t": "Flat", "b": [{"k": "intro", "x": "Call 612 345 678 now."}]}}', NULL))->>'state' = 'saved';
SELECT (SELECT id FROM catalog_tr_texts WHERE source_id = :'srck' AND lang = 'en') AS tk \gset
SELECT test_util.expect_error(format('SELECT catalog_tr_publish(%L, %L, %L, %L, %L, %L, %L)', :'owner', :'cat', :'p2', 'en', :'sbk',
  json_build_object('text', json_build_object('id', :'tk', 'rev', 1), 'area', NULL, 'features', '[]'::json, 'list', '[]'::json)::jsonb, 'auto'), 'text_has_contact');
SELECT test_util.ok((SELECT status = 'draft' AND approval IS NULL FROM catalog_tr_texts WHERE id = :'tk'), 'con un bloqueo: sigue en borrador, sin publicar');
SELECT test_util.expect_error(format('SELECT catalog_tr_publish(%L, %L, %L, %L, %L, %L, %L)', :'owner', :'cat', :'p2', 'en', :'sig2',
  json_build_object('text', json_build_object('id', :'t2', 'rev', :r2), 'area', NULL, 'features', '[]'::json, 'list', '[]'::json)::jsonb, 'sola'), 'invalid_mode');
SELECT test_util.expect_error(format('SELECT catalog_tr_publish(%L, %L, %L, %L, %L, %L, %L)', :'h2', :'cat', :'p2', 'en', :'sig2',
  json_build_object('text', json_build_object('id', :'t2', 'rev', :r2), 'area', NULL, 'features', '[]'::json, 'list', '[]'::json)::jsonb, 'auto'), 'forbidden');
-- Características: aprobadas solas quedan «auto».
SELECT (catalog_tr_reserve_auto(:'owner', :'s2', 'de', :'cat', :'p2', '{"text": true, "features": ["Portero físico"]}', 300, :'L'))->>'job' AS jf \gset
SELECT (catalog_tr_finish(:'owner', :'jf', 'done', '{"text": {"t": "Wohnung", "b": [{"k": "intro", "x": "Ruhige Wohnung."}]}, "features": [{"es": "Portero físico", "tr": "Concierge"}]}', NULL))->>'state' = 'saved';
SELECT (SELECT id FROM catalog_tr_texts WHERE source_id = :'s2' AND lang = 'de') AS tde \gset
SELECT catalog_tr_publish(:'owner', :'cat', :'p2', 'de', :'sig2', json_build_object('text', json_build_object('id', :'tde', 'rev', 1), 'area', NULL,
       'features', '[{"es": "Portero físico", "tr": "Concierge"}]'::json, 'list', '["Portero físico"]'::json)::jsonb, 'auto') IS NOT NULL;
SELECT test_util.ok((SELECT approval FROM catalog_tr_features WHERE owner_id = :'owner' AND lang = 'de' AND es = 'Portero físico') = 'auto'
                    AND (SELECT features FROM catalog_tr_copies WHERE catalog_id = :'cat' AND property_id = :'p2' AND lang = 'de') = '[["Portero físico", "Concierge"]]'::jsonb, 'características publicadas solas: «auto» y en la copia');

-- 7. «Dar por revisada».
SELECT catalog_tr_mark_reviewed(:'owner', :'cat', 'de', ARRAY[:'tde'::uuid], ARRAY['Portero físico']) AS nrev \gset
SELECT test_util.ok(:nrev = 2 AND (SELECT approval FROM catalog_tr_texts WHERE id = :'tde') = 'manual', 'dar por revisada: texto y característica pasan a «manual»');
SELECT test_util.ok(catalog_tr_mark_reviewed(:'owner', :'cat', 'de', ARRAY[:'tde'::uuid], ARRAY['Portero físico']) = 0, 'otra vez: nada que cambiar');
SELECT test_util.expect_error(format('SELECT catalog_tr_mark_reviewed(%L, %L, %L, %L, %L)', :'h2', :'cat', 'de', ARRAY[:'tde'::uuid], '{}'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_tr_mark_reviewed(%L, %L, %L, %L, %L)', :'owner', :'cat', 'es', ARRAY[:'tde'::uuid], '{}'), 'invalid_lang');

-- 8. Elegir el idioma: AL MOMENTO, sin «completo».
SELECT version AS va FROM catalogs WHERE id = :'cat' \gset
SELECT catalog_tr_activate(:'owner', :'cat', NULL, 'fr', 0, '{}') AS vfr \gset
SELECT test_util.ok(:vfr = :va + 1 AND (SELECT default_lang FROM catalogs WHERE id = :'cat') = 'fr', 'el catálogo pasa al francés al momento (sin traducciones: antes «lang_incomplete»)');
SELECT test_util.ok((get_public_catalog(:'tok'))->'snapshot'->>'lang' = 'fr' AND (get_public_catalog(:'ptok'))->'snapshot'->>'lang' = 'en'
                    AND (get_public_catalog(:'ptok2'))->'snapshot'->>'lang' = 'fr', 'el general y Luis (sin idioma propio) en francés; Ana sigue en inglés (DA17)');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') x WHERE x ? 'tr'), 'sin copias en francés: el lector enseña N5 (lo decide to-public.ts)');
SELECT test_util.ok(catalog_tr_activate(:'owner', :'cat', NULL, 'fr', 0, '{}') = :vfr, 'elegir el mismo idioma no cambia nada');
SELECT (SELECT id FROM catalog_client_links WHERE token = :'ptok2') AS link2 \gset
SELECT catalog_tr_activate(:'owner', :'cat', :'link2', 'he', 0, '{}') AS vhe \gset
SELECT test_util.ok(:vhe = :vfr + 1 AND (get_public_catalog(:'ptok2'))->'snapshot'->>'lang' = 'he', 'un enlace personal en hebreo, al momento');
SELECT catalog_tr_activate(:'owner', :'cat', NULL, 'es', 0, '{}') IS NOT NULL;
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, NULL, 0, %L)', :'owner', :'cat', '{}'), 'invalid_lang');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, 0, %L)', :'owner', :'cat', 'pt', '{}'), 'invalid_lang');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, 0, %L)', :'h2', :'cat', 'en', '{}'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, %L, %L, 0, %L)', :'owner', :'cat', gen_random_uuid(), 'en', '{}'), 'link_not_found');

-- 9. Nunca la ficha del CRM ni property_client_descriptions.
RESET ROLE;
SELECT test_util.ok((SELECT md5(row_to_json(p)::text) FROM properties p WHERE id = :'p1') = :'p1h', 'la ficha del CRM no cambia');
SELECT test_util.ok((SELECT md5(coalesce(string_agg(row_to_json(d)::text, '|' ORDER BY property_id, language), '')) FROM property_client_descriptions d) = (SELECT h FROM pcd_before_a), 'property_client_descriptions intacta');

-- 10. Permisos: anon y authenticated no ejecutan nada.
SET ROLE anon;
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve_auto(%L, %L, %L, %L, NULL, %L, 300, %L)', :'owner', :'srcg', 'en', :'cat', '{}', :'L'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_tr_publish(%L, %L, NULL, %L, %L, %L, %L)', :'owner', :'cat', 'en', :'sig2', '{}', 'auto'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_tr_mark_reviewed(%L, %L, %L, NULL, NULL)', :'owner', :'cat', 'en'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_tr_activate(%L, %L, NULL, %L, 0, %L)', :'owner', :'cat', 'en', '{}'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT catalog_tr_reserve_auto(%L, %L, %L, %L, NULL, %L, 300, %L)', :'owner', :'srcg', 'en', :'cat', '{}', :'L'), 'insufficient_privilege');
SELECT test_util.expect_error('SELECT approval FROM catalog_tr_texts', 'insufficient_privilege');
RESET ROLE;

-- Para la concurrencia y la reversión (sin reservas vigentes).
UPDATE catalog_tr_jobs SET status = 'cancelled', finished_at = now() WHERE status = 'reserved';
INSERT INTO test_util.carry (k, v) VALUES ('ta_srcg', :'srcg'), ('ta_srck', :'srck') ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-translations-auto.sql: todo en verde'
