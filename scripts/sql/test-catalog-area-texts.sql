-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-21-bcp-01-ampliacion-textos-idiomas,
-- PR3). Tests de 0222 en el Postgres temporal. Datos 100 % sintéticos.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
\set h2 '00000000-0000-0000-0000-0000000000b9'
\set p1 '10000000-0000-0000-0000-000000000001'
\set p2 '10000000-0000-0000-0000-000000000002'
\set p4 '10000000-0000-0000-0000-000000000004'
\set rec 'madrid/salamanca/recoletos'
SELECT v AS cat FROM test_util.carry WHERE k = 't22_cat' \gset
SELECT v AS tok FROM test_util.carry WHERE k = 't22_tok' \gset
SELECT v AS fp0 FROM test_util.carry WHERE k = 't22_fp' \gset

CREATE OR REPLACE FUNCTION test_util.t_item(p_tok text, p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements((get_public_catalog(p_tok))->'snapshot'->'items') x WHERE x->>'slug' = p_slug
$$;
GRANT EXECUTE ON FUNCTION test_util.t_item(text, text) TO service_role;
INSERT INTO auth.users (id, email) VALUES (:'h2', 'home.tres@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES (:'h2', 'admin', 'Home Tres', 'home.tres@ejemplo.test');
INSERT INTO home_owners (profile_id) VALUES (:'h2');
CREATE TEMP TABLE nb_before AS SELECT count(*) AS n FROM neighborhoods;
GRANT SELECT ON nb_before TO service_role;

SET ROLE service_role;
-- 1. Sin plantillas ni copias nada cambia.
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp0' AND NOT (test_util.t_item(:'tok', 'atico-demo-1') ? 'at'),
  'sin copias: misma huella y sin «at»');

-- 2. Borrador: se crea y se edita (un solo borrador por zona).
SELECT (catalog_area_text_save_draft(:'owner', :'rec', 'Recoletos es un barrio de fincas señoriales.', 'manual'))->>'seq' AS s1 \gset
SELECT (catalog_area_text_save_draft(:'owner', :'rec', 'Recoletos es un barrio de fincas señoriales y calles arboladas.', 'manual'))->>'seq' AS s1b \gset
SELECT test_util.ok(:'s1' = '1' AND :'s1b' = '1' AND (SELECT count(*) FROM catalog_area_text_state(:'owner') WHERE area_id = :'rec') = 1,
  'un solo borrador por zona, editable');
SELECT test_util.expect_error(format('SELECT catalog_area_text_save_draft(%L, %L, %L, %L)', :'owner', :'rec', 'Llama al 612 345 678.', 'manual'), 'text_has_contact');
SELECT test_util.expect_error(format('SELECT catalog_area_text_save_draft(%L, %L, %L, %L)', :'owner', :'rec', 'Pisos desde 900.000 €.', 'manual'), 'text_has_price');
SELECT test_util.expect_error(format('SELECT catalog_area_text_save_draft(%L, %L, %L, %L)', :'owner', :'rec', '   ', 'manual'), 'area_text_empty');
SELECT test_util.expect_error(format('SELECT catalog_area_text_save_draft(%L, %L, %L, %L)', :'owner', 'madrid/inventado', 'Texto.', 'manual'), 'area_not_found');
SELECT test_util.expect_error(format('SELECT catalog_area_text_save_draft(%L, %L, %L, %L)', :'staff', :'rec', 'Texto.', 'manual'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_area_text_save_draft(%L, %L, %L, %L)', :'owner', :'rec', 'Texto.', 'neighborhoods'), 'invalid_text');

-- 3. Aprobar exactamente lo que se vio.
SELECT test_util.expect_error(format('SELECT catalog_area_text_approve(%L, %L, %L)', :'owner', :'rec', 'Otro texto'), 'draft_changed');
SELECT catalog_area_text_approve(:'owner', :'rec', 'Recoletos es un barrio de fincas señoriales y calles arboladas.');
SELECT test_util.ok((SELECT status = 'approved' AND seq = 1 FROM catalog_area_text_state(:'owner') WHERE area_id = :'rec'), 'aprobada la versión 1; ya no hay borrador');
SELECT test_util.expect_error(format('SELECT catalog_area_text_approve(%L, %L, %L)', :'owner', :'rec', 'x'), 'area_text_not_found');

-- 4. Aplicar: solo con zona confirmada y vigente (DA37).
SELECT test_util.expect_error(format('SELECT catalog_area_text_apply(%L, %L, %L)', :'owner', :'cat', :'p2'), 'area_text_unavailable');
SELECT catalog_area_text_apply(:'owner', :'cat', :'p1');
SELECT test_util.ok(test_util.t_item(:'tok', 'atico-demo-1')->>'at' = 'Recoletos es un barrio de fincas señoriales y calles arboladas.', 'aplicada: «at» con la copia del catálogo');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fp0', 'aplicada: la huella cambia (lectores abiertos al día)');
SELECT test_util.expect_error(format('SELECT catalog_area_text_apply(%L, %L, %L)', :'owner', :'cat', :'p4'), 'not_in_catalog');
SELECT test_util.expect_error(format('SELECT catalog_area_text_apply(%L, %L, %L)', :'staff', :'cat', :'p1'), 'forbidden');

-- 5. Actualizar la plantilla no cambia la copia del catálogo (DA27).
SELECT catalog_area_text_save_draft(:'owner', :'rec', 'Versión nueva de Recoletos.', 'manual');
SELECT catalog_area_text_approve(:'owner', :'rec', 'Versión nueva de Recoletos.');
SELECT test_util.ok((SELECT seq = 2 FROM catalog_area_text_state(:'owner') WHERE area_id = :'rec' AND status = 'approved')
  AND (SELECT count(*) FROM area_text_versions WHERE area_id = :'rec' AND owner_id = :'owner' AND status = 'retired') = 1, 'versión 2 aprobada; la 1 queda retirada (historial)');
SELECT test_util.ok(test_util.t_item(:'tok', 'atico-demo-1')->>'at' = 'Recoletos es un barrio de fincas señoriales y calles arboladas.', 'actualizar la plantilla: la copia del catálogo no cambia');
SELECT catalog_area_text_retire(:'owner', :'rec');
SELECT test_util.ok(test_util.t_item(:'tok', 'atico-demo-1')->>'at' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM catalog_area_text_state(:'owner') WHERE area_id = :'rec'),
  'retirar la plantilla: la copia del catálogo sigue');

-- 6. La copia solo se ve con la zona confirmada vigente (o su distrito).
SELECT catalog_area_confirm(:'owner', :'p1', 'madrid/retiro');
SELECT test_util.ok(NOT (test_util.t_item(:'tok', 'atico-demo-1') ? 'at'), 'otra zona confirmada: la copia no se ve');
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_area_copies WHERE catalog_id = :'cat' AND property_id = :'p1'), '…pero se conserva');
SELECT catalog_area_confirm(:'owner', :'p1', :'rec');
SELECT test_util.ok(test_util.t_item(:'tok', 'atico-demo-1') ? 'at', 'vuelve la zona: se ve otra vez');
RESET ROLE;
UPDATE properties SET address = 'Calle Serrano 42' WHERE id = :'p1';
SET ROLE service_role;
SELECT test_util.ok(NOT (test_util.t_item(:'tok', 'atico-demo-1') ? 'at'), 'ficha cambiada (confirmación no vigente): la copia no se ve');
SELECT catalog_area_confirm(:'owner', :'p1', :'rec');

-- 7. Barrio sin plantilla: la del distrito (DA23).
SELECT catalog_area_text_save_draft(:'owner', 'madrid/salamanca', 'El distrito de Salamanca es el ensanche del siglo XIX.', 'manual');
SELECT catalog_area_text_approve(:'owner', 'madrid/salamanca', 'El distrito de Salamanca es el ensanche del siglo XIX.');
SELECT catalog_area_confirm(:'owner', :'p2', 'madrid/salamanca/goya');
SELECT catalog_area_text_apply(:'owner', :'cat', :'p2');
SELECT test_util.ok((SELECT area_id = 'madrid/salamanca' FROM catalog_area_copies WHERE catalog_id = :'cat' AND property_id = :'p2')
  AND test_util.t_item(:'tok', 'piso-demo-2')->>'at' LIKE 'El distrito de Salamanca%', 'barrio sin plantilla: la del distrito, y se ve');
SELECT catalog_area_text_save_draft(:'owner', 'madrid/salamanca/goya', 'Goya es el barrio del comercio.', 'manual');
SELECT catalog_area_text_approve(:'owner', 'madrid/salamanca/goya', 'Goya es el barrio del comercio.');
SELECT test_util.ok((SELECT area_id FROM catalog_area_text_for(:'owner', :'p2')) = 'madrid/salamanca/goya', 'con plantilla del barrio, se prefiere el barrio');

-- 8. Quitar la plantilla de este catálogo.
SELECT catalog_area_text_remove(:'owner', :'cat', :'p2');
SELECT test_util.ok(NOT (test_util.t_item(:'tok', 'piso-demo-2') ? 'at'), 'quitar: ya no se ve');
SELECT test_util.expect_error(format('SELECT catalog_area_text_remove(%L, %L, %L)', :'owner', :'cat', :'p2'), 'area_text_not_found');

-- 9. Cada dueño, sus plantillas.
SELECT catalog_area_text_save_draft(:'h2', :'rec', 'Recoletos según otro dueño.', 'manual');
SELECT catalog_area_text_approve(:'h2', :'rec', 'Recoletos según otro dueño.');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_area_text_state(:'owner') WHERE body LIKE '%otro dueño%')
  AND (SELECT owner_id = :'owner'::uuid AND area_id = 'madrid/salamanca' FROM catalog_area_text_for(:'owner', :'p1')),
  'la plantilla de otro dueño no cuenta (Recoletos retirada: queda la del distrito, del mismo dueño)');

-- 10. Siembra: solo borradores, solo zonas sin versiones, sin IA.
SELECT catalog_area_text_seed(:'owner', jsonb_build_array(
  jsonb_build_object('area', 'madrid/chamberi/almagro', 'body', 'Almagro es un barrio de palacetes.', 'key', 'almagro'),
  jsonb_build_object('area', 'madrid/salamanca', 'body', 'Ya tiene versiones.', 'key', 'salamanca'),
  jsonb_build_object('area', 'madrid/inventado', 'body', 'Zona que no existe.', 'key', 'x'),
  jsonb_build_object('area', 'madrid/centro', 'body', 'Llama al 612 345 678.', 'key', 'centro'))) AS seed \gset
SELECT test_util.ok(:'seed'::jsonb = '{"created": 1, "skipped": 3}'::jsonb, 'siembra: 1 creada y 3 saltadas');
SELECT test_util.ok((SELECT status = 'draft' AND origin = 'neighborhoods' AND source_key = 'almagro' FROM catalog_area_text_state(:'owner') WHERE area_id = 'madrid/chamberi/almagro'),
  'sembrada como BORRADOR con su origen');
SELECT test_util.ok((catalog_area_text_seed(:'owner', jsonb_build_array(jsonb_build_object('area', 'madrid/chamberi/almagro', 'body', 'Otra.', 'key', 'almagro'))))->>'created' = '0',
  'sembrar otra vez no duplica ni pisa');
SELECT catalog_area_text_discard(:'owner', 'madrid/chamberi/almagro');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM area_text_versions WHERE owner_id = :'owner' AND area_id = 'madrid/chamberi/almagro'), 'descartar el borrador');

-- 11. Al reutilizar un texto aprobado al añadir, llega también la plantilla (copia).
SELECT catalog_area_text_save_draft(:'owner', :'rec', 'Recoletos, versión 3.', 'manual');
SELECT catalog_area_text_approve(:'owner', :'rec', 'Recoletos, versión 3.');
RESET ROLE;
UPDATE properties SET zone = 'Salamanca', subzone = 'Recoletos', address = 'Calle Lagasca 10' WHERE id = :'p4';
INSERT INTO property_copy_versions (owner_id, property_id, seq, title, title_approved_at, change, content_hash, created_by)
VALUES (:'owner', :'p4', 1, 'Estudio aprobado', now(), 'title', 'h', :'owner');
SET ROLE service_role;
SELECT catalog_area_confirm(:'owner', :'p4', :'rec');
SELECT catalog_create(:'owner', 'Nuevo con reutilización', NULL) AS cat2 \gset
SELECT catalog_add_property(:'owner', :'cat2', :'p4');
SELECT test_util.ok((SELECT body = 'Recoletos, versión 3.' FROM catalog_area_copies WHERE catalog_id = :'cat2' AND property_id = :'p4'), 'reutilizar al añadir: copia de la plantilla de su zona');
SELECT catalog_add_property(:'owner', :'cat2', :'p1');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_area_copies WHERE catalog_id = :'cat2' AND property_id = :'p1'), 'sin texto aprobado que reutilizar: ninguna copia automática');
SELECT catalog_remove_item(:'owner', :'cat2', :'p4');
SELECT catalog_area_text_save_draft(:'owner', :'rec', 'Recoletos, versión 4.', 'manual');
SELECT catalog_area_text_approve(:'owner', :'rec', 'Recoletos, versión 4.');
RESET ROLE;
DELETE FROM catalog_texts WHERE catalog_id = :'cat2' AND property_id = :'p4';
SET ROLE service_role;
SELECT catalog_add_property(:'owner', :'cat2', :'p4');
SELECT test_util.ok((SELECT body = 'Recoletos, versión 3.' FROM catalog_area_copies WHERE catalog_id = :'cat2' AND property_id = :'p4'), 'volver a añadir: la copia propia del catálogo se conserva');

-- 12. Permisos y nada fuera.
RESET ROLE;
SET ROLE anon;
SELECT test_util.expect_error('SELECT * FROM area_text_versions', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT * FROM catalog_area_copies', 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT catalog_area_text_apply(%L, %L, %L)', :'owner', :'cat', :'p1'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM catalog_area_text_state(%L)', :'owner'), 'insufficient_privilege');
RESET ROLE;
SELECT test_util.ok((SELECT count(*) FROM neighborhoods) = (SELECT n FROM nb_before), 'neighborhoods no se toca');
SELECT test_util.ok((SELECT zone = 'Salamanca' AND subzone = 'Recoletos' FROM properties WHERE id = :'p1'), 'la ficha del CRM no cambia');
