-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-20-bcp-01-compacto-y-opiniones,
-- A1). Tests de 0217 en el Postgres temporal: stub + fixtures + 0192–0216 +
-- catálogos previos de C2 + 0217 (aplicada dos veces). Datos sintéticos.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set p1 'f1000000-0000-0000-0000-000000000001'
\set p2 'f1000000-0000-0000-0000-000000000002'
\set p3 'f1000000-0000-0000-0000-000000000003'
SELECT v AS cat FROM test_util.carry WHERE k = 'c2_cat_m' \gset
SELECT v AS tok FROM test_util.carry WHERE k = 'c2_tok_m' \gset
SELECT v AS cat_s FROM test_util.carry WHERE k = 'c2_cat_s' \gset
SELECT v AS tok_s FROM test_util.carry WHERE k = 'c2_tok_s' \gset
SELECT v AS fp_m FROM test_util.carry WHERE k = 't17_fp_m' \gset

CREATE OR REPLACE FUNCTION test_util.t_item(p_tok text, p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements((get_public_catalog(p_tok))->'snapshot'->'items') x WHERE x->>'slug' = p_slug
$$;
GRANT EXECUTE ON FUNCTION test_util.t_item(text, text) TO service_role;

-- 0. Compatibilidad: sin títulos propios la huella no cambia.
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp0 \gset
SELECT test_util.ok(:'fp0' = :'fp_m', 'compatibilidad: 0217 no cambia la huella de un catálogo sin título propio');
SELECT test_util.ok(test_util.t_item(:'tok', 't1')->>'title' = 'Texto 1', 'sin título propio: el de la ficha');

-- Otro catálogo con la misma vivienda (debe quedar intacto).
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Otro catálogo', NULL) AS cat2 \gset
SELECT catalog_add_property(:'owner', :'cat2', :'p1');
SELECT token AS tok2 FROM catalog_share_create(:'owner', :'cat2', 60) \gset
SELECT (get_public_catalog(:'tok2'))->>'fingerprint' AS fp_other \gset

-- 1. Solo un título: guardar (la sobrecarga de 9 argumentos) y publicar.
SELECT catalog_text_save_draft(:'owner', :'cat', :'p1', '  Ático   luminoso
  en Delicias ', NULL, NULL, NULL, 'manual', NULL) AS r1 \gset
SELECT test_util.ok(:r1 = 1 AND (SELECT draft_title FROM catalog_texts WHERE catalog_id = :'cat' AND property_id = :'p1') = 'Ático luminoso en Delicias',
  'título solo: se guarda normalizado (revisión 1)');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp0', 'borrador de título: el lector no cambia');
SELECT test_util.ok((SELECT has_draft FROM catalog_text_states(:'owner', :'cat') WHERE property_id = :'p1'), 'estados: un título cuenta como borrador');
SELECT catalog_text_publish(:'owner', :'cat', :'p1', 1);
SELECT test_util.ok(test_util.t_item(:'tok', 't1')->>'title' = 'Ático luminoso en Delicias' AND NOT (test_util.t_item(:'tok', 't1') ? 'text'),
  'publicar un título solo: va en la instantánea (sin texto)');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fp0', 'título publicado: la huella cambia y los lectores lo reciben');
SELECT test_util.ok((SELECT has_published AND published_current AND changed = '{}' FROM catalog_text_states(:'owner', :'cat') WHERE property_id = :'p1'),
  'estados: título publicado, vigente y sin cambios que revisar');

-- 2. La ficha y el otro catálogo no cambian.
RESET ROLE;
SELECT test_util.ok((SELECT title FROM properties WHERE id = :'p1') = 'Texto 1', 'la ficha del CRM conserva su título');
SELECT test_util.ok(test_util.t_item(:'tok2', 't1')->>'title' = 'Texto 1' AND (get_public_catalog(:'tok2'))->>'fingerprint' = :'fp_other',
  'otro catálogo con la misma vivienda: título y huella intactos');

-- 3. Un cambio de la ficha no retira el título (sí el texto, regla C2).
SET ROLE service_role;
SELECT catalog_text_save_draft(:'owner', :'cat', :'p1', 'Ático luminoso en Delicias', 'Piso exterior y luminoso.', NULL, NULL, 'manual', 1) AS r2 \gset
SELECT catalog_text_publish(:'owner', :'cat', :'p1', :r2);
SELECT test_util.ok(test_util.t_item(:'tok', 't1')->'text'->>'b' = 'Piso exterior y luminoso.', 'título y texto publicados');
RESET ROLE;
UPDATE properties SET description = description || ' Sincronización de la agencia.', title = 'Título nuevo en la ficha' WHERE id = :'p1';
SELECT test_util.ok(test_util.t_item(:'tok', 't1')->>'title' = 'Ático luminoso en Delicias', 'cambio de la ficha (texto y título): el título propio sigue');
SELECT test_util.ok(NOT (test_util.t_item(:'tok', 't1') ? 'text'), 'cambio de la ficha: el texto deja de verse (regla C2)');
SET ROLE service_role;
SELECT test_util.ok((SELECT has_published AND NOT published_current AND 'description' = ANY (changed) FROM catalog_text_states(:'owner', :'cat') WHERE property_id = :'p1'),
  'estados: con texto publicado, «vigente» mira la huella y dice qué cambió');
SELECT test_util.ok(test_util.t_item(:'tok2', 't1')->>'title' = 'Título nuevo en la ficha', 'otro catálogo: ve el título nuevo de la ficha');

-- 4. Bloqueos en el título, longitud y conflicto de revisión.
SELECT catalog_text_save_draft(:'owner', :'cat', :'p2', 'Llame al 600 123 456', NULL, NULL, NULL, 'manual', NULL) AS rp2 \gset
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'owner', :'cat', :'p2'), 'text_has_contact');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p2', 'Ahora 590.000 €', NULL, NULL, NULL, 'manual', NULL);
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'owner', :'cat', :'p2'), 'text_has_price');
SELECT test_util.expect_error(format('SELECT catalog_text_save_draft(%L, %L, %L, %L, NULL, NULL, NULL, %L, NULL)', :'owner', :'cat', :'p2', repeat('a', 161), 'manual'), 'text_too_long');
SELECT catalog_text_save_draft(:'owner', :'cat', :'p2', '   ', NULL, NULL, NULL, 'manual', NULL);
SELECT test_util.expect_error(format('SELECT catalog_text_publish(%L, %L, %L, NULL)', :'owner', :'cat', :'p2'), 'text_empty');
SELECT draft_rev AS rev_now FROM catalog_texts WHERE catalog_id = :'cat' AND property_id = :'p1' \gset
SELECT test_util.expect_error(format('SELECT catalog_text_save_draft(%L, %L, %L, %L, NULL, NULL, NULL, %L, %s)', :'owner', :'cat', :'p1', 'Pisa', 'ai_draft', :rev_now - 1), 'draft_changed');
SELECT test_util.ok((SELECT draft_title FROM catalog_texts WHERE catalog_id = :'cat' AND property_id = :'p1') = 'Ático luminoso en Delicias',
  'conflicto: una revisión vieja no pisa el título');
SELECT test_util.expect_error(format('SELECT catalog_text_save_draft(%L, %L, %L, %L, NULL, NULL, NULL, %L, NULL)', '00000000-0000-0000-0000-0000000000a2', :'cat', :'p1', 'x', 'manual'), 'forbidden');

-- 5. La sobrecarga de 8 argumentos (0197) sigue funcionando y no toca el título.
SELECT catalog_text_save_draft(:'owner', :'cat', :'p1', 'Texto desde el código anterior.', NULL, NULL, 'manual', NULL);
SELECT test_util.ok((SELECT draft_title = 'Ático luminoso en Delicias' AND draft_body = 'Texto desde el código anterior.' FROM catalog_texts WHERE catalog_id = :'cat' AND property_id = :'p1'),
  'compatibilidad: guardar con 8 argumentos conserva el título del borrador');

-- 6. Retirar quita también el título; la historia de t3 sigue en la instantánea.
SELECT catalog_text_withdraw(:'owner', :'cat', :'p1');
SELECT test_util.ok(test_util.t_item(:'tok', 't1')->>'title' = 'Título nuevo en la ficha', 'retirar: vuelve el título de la ficha');
SELECT catalog_text_save_draft(:'owner', :'cat_s', :'p3', 'Ático con historia', NULL, NULL, NULL, 'manual', NULL) AS rs \gset
SELECT catalog_text_publish(:'owner', :'cat_s', :'p3', :rs);
SELECT test_util.ok(test_util.t_item(:'tok_s', 't3')->>'title' = 'Ático con historia' AND test_util.t_item(:'tok_s', 't3') ? 'story',
  'título propio con historia aprobada: la historia se conserva en la instantánea');
RESET ROLE;

-- 7. Permisos: solo service_role.
SELECT test_util.ok(NOT has_function_privilege('authenticated', 'catalog_text_save_draft(uuid, uuid, uuid, text, text, text, text[], text, integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'catalog_text_save_draft(uuid, uuid, uuid, text, text, text, text[], text, integer)', 'EXECUTE'),
  'permisos: la sobrecarga nueva no se ejecuta como anon ni authenticated');

\echo 'test-catalog-title.sql: todo en verde'
