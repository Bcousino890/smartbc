-- ============================================================================
-- SOLO PRUEBAS LOCALES (BCP-01 ampliación C2). Tests de 0197 en el Postgres
-- temporal: stub + fixtures + 0192–0196 + catálogos previos + 0197 (aplicada
-- dos veces). Datos 100 % sintéticos (test-catalog-texts-pre.sql).
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
\set p1 'f1000000-0000-0000-0000-000000000001'
\set p2 'f1000000-0000-0000-0000-000000000002'
\set p3 'f1000000-0000-0000-0000-000000000003'
SELECT v AS cat FROM test_util.carry WHERE k = 'c2_cat_m' \gset
SELECT v AS tok FROM test_util.carry WHERE k = 'c2_tok_m' \gset
SELECT v AS cat_s FROM test_util.carry WHERE k = 'c2_cat_s' \gset
SELECT v AS tok_s FROM test_util.carry WHERE k = 'c2_tok_s' \gset
SELECT v AS fp_m FROM test_util.carry WHERE k = 'c2_fp_m' \gset
SELECT v AS fp_s FROM test_util.carry WHERE k = 'c2_fp_s' \gset
SELECT v AS global0 FROM test_util.carry WHERE k = 'c2_global' \gset

CREATE OR REPLACE FUNCTION test_util.c2_item(p_tok text, p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements((get_public_catalog(p_tok))->'snapshot'->'items') x WHERE x->>'slug' = p_slug
$$;
CREATE OR REPLACE FUNCTION test_util.c2_global() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(coalesce(description, '') || '|' || array_to_string(features, ','), ';' ORDER BY id)) FROM properties
$$;
GRANT EXECUTE ON FUNCTION test_util.c2_item(text, text), test_util.c2_global() TO service_role;

-- 0. Compatibilidad.
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp_m', 'compatibilidad: 0197 no cambia la huella de un catálogo sin textos, historias ni clases de foto');
SELECT test_util.ok(NOT (test_util.c2_item(:'tok', 't1') ? 'text') AND NOT (test_util.c2_item(:'tok', 't1') ? 'story'), 'sin texto ni historia: sin claves nuevas');
SELECT test_util.ok((get_public_catalog(:'tok_s'))->>'fingerprint' <> :'fp_s'
  AND test_util.c2_item(:'tok_s', 't3')->'story' = jsonb_build_object('h', 'hash-sintetico', 'p', 'Un ático con luz todo el día.', 'ph', 'Luz y terraza',
      'b', jsonb_build_array(jsonb_build_object('c', 'living', 't', 'Salón doble con chimenea.'), jsonb_build_object('c', 'outdoor', 't', 'Terraza orientada al sur.'))),
  'historia aprobada: entra en la instantánea (solo capítulos aprobados, en orden) y cambia la huella de ese catálogo');

-- 1. Clase de foto: solo si se conoce.
RESET ROLE;
UPDATE property_photos SET ai_class = 'kitchen', ai_confidence = 0.9 WHERE id = 'f2000000-0000-0000-0000-000000000012';
UPDATE property_photos SET ai_class = 'bedroom', ai_confidence = 0.5 WHERE id = 'f2000000-0000-0000-0000-000000000011';
SELECT test_util.ok((test_util.c2_item(:'tok', 't1')->'photos'->1->>'k') = 'kitchen' AND NOT ((test_util.c2_item(:'tok', 't1')->'photos'->0) ? 'k'),
  'clase de foto: con confianza ≥ 0,75 sí; con 0,5 no');
UPDATE property_photos SET class_override = 'living_room' WHERE id = 'f2000000-0000-0000-0000-000000000011';
SELECT test_util.ok((test_util.c2_item(:'tok', 't1')->'photos'->0->>'k') = 'living_room', 'clase de foto: la corregida a mano manda');
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp1 \gset

-- 2. Borrador: no cambia lo público; revisiones.
SET ROLE service_role;
SELECT catalog_text_save_draft(:'owner', :'cat', :'p1', 'Piso exterior y luminoso.', 'Luz todo el día', ARRAY['Ascensor'], 'manual', NULL) AS r1 \gset
SELECT test_util.ok(:r1 = 1 AND (get_public_catalog(:'tok'))->>'fingerprint' = :'fp1', 'borrador: revisión 1 y la huella pública no cambia');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p1', 'Piso exterior y luminoso. Cocina reformada.', 'Luz todo el día', ARRAY['Ascensor', 'Terraza'], 'manual', 1) AS r2 \gset
SELECT test_util.ok(:r2 = 2, 'borrador: guardar con la revisión esperada → revisión 2');
SELECT test_util.expect_error(format('SELECT catalog_text_save_draft(%L, %L, %L, %L, NULL, NULL, %L, 1)', :'owner', :'cat', :'p1', 'Borrador de IA que llega tarde', 'ai_draft'), 'draft_changed');
SELECT test_util.ok((SELECT draft_body FROM catalog_texts WHERE catalog_id = :'cat' AND property_id = :'p1') = 'Piso exterior y luminoso. Cocina reformada.',
  'un borrador que llega tarde no pisa la edición');
SELECT test_util.expect_error(format('SELECT catalog_text_save_draft(%L, %L, %L, %L, NULL, NULL, %L, NULL)', :'owner', :'cat', :'p3', 'x', 'manual'), 'not_in_catalog');
SELECT test_util.expect_error(format('SELECT catalog_text_save_draft(%L, %L, %L, %L, NULL, NULL, %L, NULL)', :'owner', :'cat', :'p1', repeat('a', 6001), 'manual'), 'text_too_long');
SELECT test_util.expect_error(format('SELECT catalog_text_save_draft(%L, %L, %L, NULL, %L, NULL, %L, NULL)', :'owner', :'cat', :'p1', repeat('a', 281), 'manual'), 'text_too_long');
SELECT test_util.expect_error(format('SELECT catalog_text_save_draft(%L, %L, %L, NULL, NULL, ARRAY[%L,%L,%L,%L], %L, NULL)', :'owner', :'cat', :'p1', 'a', 'b', 'c', 'd', 'manual'), 'text_too_long');
SELECT test_util.expect_error(format('SELECT catalog_text_save_draft(%L, %L, %L, %L, NULL, NULL, %L, NULL)', :'owner', :'cat', :'p1', 'x', 'otro'), 'invalid_text');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp1', 'borradores: la huella pública sigue igual');

-- 3. Publicar: bloqueos y contenido.
SELECT catalog_text_save_draft(:'owner', :'cat', :'p2', 'Llame al 600 123 456 para visitarlo.', NULL, NULL, 'manual', NULL);
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'owner', :'cat', :'p2'), 'text_has_contact');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p2', 'Más fotos en www.ejemplo.es', NULL, NULL, 'manual', NULL);
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'owner', :'cat', :'p2'), 'text_has_contact');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p2', 'Escribe a info@agencia.com', NULL, NULL, 'manual', NULL);
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'owner', :'cat', :'p2'), 'text_has_contact');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p2', 'Ahora por 590.000 €, una oportunidad.', NULL, NULL, 'manual', NULL);
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'owner', :'cat', :'p2'), 'text_has_price');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p2', 'Piso para reformar.', NULL, ARRAY['Llame al 699 111 222'], 'manual', NULL);
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'owner', :'cat', :'p2'), 'text_has_contact');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p2', NULL, NULL, NULL, 'manual', NULL);
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'owner', :'cat', :'p2'), 'text_empty');
SELECT test_util.ok(catalog_text_blocker('Reformado entre 1990-2000, con 120 m² y 3 dormitorios.') IS NULL, 'sin falsos positivos: años, m² y dormitorios no bloquean');
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, 1)', :'owner', :'cat', :'p1'), 'draft_changed');
SELECT catalog_text_publish(:'owner', :'cat', :'p1', 2);
SELECT test_util.ok(test_util.c2_item(:'tok', 't1')->'text' = jsonb_build_object('b', 'Piso exterior y luminoso. Cocina reformada.', 'l', 'Luz todo el día', 'h', jsonb_build_array('Ascensor', 'Terraza'))
  AND (get_public_catalog(:'tok'))->>'fingerprint' <> :'fp1', 'publicar: el texto entra en la instantánea y la huella cambia');
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp2 \gset
SELECT catalog_text_save_draft(:'owner', :'cat', :'p1', 'Otro borrador posterior.', NULL, NULL, 'manual', NULL);
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp2'
  AND test_util.c2_item(:'tok', 't1')->'text'->>'b' = 'Piso exterior y luminoso. Cocina reformada.',
  'un borrador nuevo no cambia lo publicado ni la huella');
SELECT test_util.ok((SELECT has_draft AND has_published AND published_current AND changed = '{}' AND in_list
                       FROM catalog_text_states(:'owner', :'cat') WHERE property_id = :'p1'), 'estados: borrador, publicado y vigente');

-- 4. La fuente cambia: el publicado deja de mostrarse y se conserva.
RESET ROLE;
UPDATE properties SET price = 450000 WHERE id = :'p1';
SELECT test_util.ok(test_util.c2_item(:'tok', 't1') ? 'text', 'cambio de precio: el texto sigue vigente (no puede mencionar precios)');
UPDATE properties SET bedrooms = 4, features = '{Ascensor}' WHERE id = :'p1';
SET ROLE service_role;
SELECT test_util.ok(NOT (test_util.c2_item(:'tok', 't1') ? 'text') AND (get_public_catalog(:'tok'))->>'fingerprint' <> :'fp2',
  'cambia la fuente: el texto publicado deja de ir al lector (huella nueva)');
SELECT test_util.ok((SELECT has_published AND NOT published_current AND changed = ARRAY['bedrooms', 'features']
                       FROM catalog_text_states(:'owner', :'cat') WHERE property_id = :'p1')
  AND (SELECT pub_body FROM catalog_texts WHERE catalog_id = :'cat' AND property_id = :'p1') = 'Piso exterior y luminoso. Cocina reformada.',
  'estados: publicado no vigente, qué cambió (dormitorios, características) y el texto se conserva');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p1', 'Piso exterior y luminoso. Cocina reformada.', 'Luz todo el día', ARRAY['Ascensor'], 'manual', NULL);
SELECT catalog_text_publish(:'owner', :'cat', :'p1', NULL);
SELECT test_util.ok(test_util.c2_item(:'tok', 't1') ? 'text', 'revisado y publicado de nuevo: vuelve al lector');

-- 5. La vivienda sale: el texto queda en reserva; se borra solo a petición.
SELECT catalog_remove_item(:'owner', :'cat', :'p1');
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = :'cat' AND property_id = :'p1')
  AND (SELECT NOT in_list AND has_published FROM catalog_text_states(:'owner', :'cat') WHERE property_id = :'p1'),
  'quitar la vivienda: su texto queda en reserva');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p1', 'Editar en reserva.', NULL, NULL, 'manual', NULL);
SELECT test_util.ok(true, 'se puede editar un texto en reserva');
SELECT catalog_add_property(:'owner', :'cat', :'p1');
SELECT test_util.ok(test_util.c2_item(:'tok', 't1') ? 'text', 'vuelve a la lista: vuelve su texto publicado');
SELECT catalog_text_withdraw(:'owner', :'cat', :'p1');
SELECT test_util.ok(NOT (test_util.c2_item(:'tok', 't1') ? 'text')
  AND (SELECT draft_body FROM catalog_texts WHERE catalog_id = :'cat' AND property_id = :'p1') = 'Editar en reserva.',
  'retirar: sale del lector y el borrador se conserva');
SELECT test_util.expect_error(format('SELECT catalog_text_withdraw(%L, %L, %L)', :'owner', :'cat', :'p1'), 'text_not_published');
SELECT catalog_text_delete(:'owner', :'cat', :'p1');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = :'cat' AND property_id = :'p1'), 'borrar a petición: desaparece');
SELECT test_util.expect_error(format('SELECT catalog_text_delete(%L, %L, %L)', :'owner', :'cat', :'p1'), 'text_not_found');

-- 6. Aislamiento: nada global se escribe.
RESET ROLE;
SELECT test_util.ok((SELECT count(*) FROM property_client_descriptions) = 0 AND (SELECT count(*) FROM property_story_versions) = 1
  AND (SELECT description FROM properties WHERE id = :'p1') = 'Piso exterior y luminoso. Cocina reformada con salida a un patio tranquilo. Dormitorios amplios.',
  'aislamiento: ni descripciones limpias, ni historias, ni la descripción global se escriben');

-- 7. Permisos.
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_text_save_draft(%L, %L, %L, %L, NULL, NULL, %L, NULL)', :'staff', :'cat', :'p2', 'x', 'manual'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'staff', :'cat', :'p2'), 'forbidden');
SELECT test_util.expect_error(format('SELECT * FROM catalog_text_states(%L, %L)', :'staff', :'cat'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_text_delete(NULL, %L, %L)', :'cat', :'p2'), 'forbidden');
RESET ROLE;
SET ROLE anon;
SELECT test_util.expect_error('SELECT count(*) FROM catalog_texts', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'owner', :'cat', :'p2'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_internal_snapshot(%L)', :'cat'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error('SELECT count(*) FROM catalog_texts', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM catalog_text_states(%L, %L)', :'owner', :'cat'), 'insufficient_privilege');
RESET ROLE;
SELECT test_util.ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'catalog_texts'), 'RLS activado en catalog_texts');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'catalog_texts'), 'sin políticas: solo service_role');
SELECT test_util.ok((SELECT bool_and(p.prosecdef = false AND p.proconfig @> ARRAY['search_path=public'])
                       FROM pg_proc p WHERE p.proname IN ('catalog_text_save_draft', 'catalog_text_publish', 'catalog_text_withdraw', 'catalog_text_delete',
                                                         'catalog_text_states', 'catalog_source_hash', 'catalog_internal_snapshot')),
  'funciones nuevas: SECURITY INVOKER y search_path fijo');
\echo 'test-catalog-texts.sql: todo en verde'
