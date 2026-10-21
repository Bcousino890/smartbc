-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-21-bcp-01-ampliacion-textos-idiomas,
-- PR1). Tests de 0219 en el Postgres temporal: stub + fixtures + 0192–0218 +
-- 0219 (aplicada dos veces). Datos 100 % sintéticos.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
\set p1 '10000000-0000-0000-0000-000000000001'
\set p2 '10000000-0000-0000-0000-000000000002'
\set p4 '10000000-0000-0000-0000-000000000004'
\set h2 '00000000-0000-0000-0000-0000000000b7'

CREATE OR REPLACE FUNCTION test_util.t_pub(p_tok text, p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements((get_public_catalog(p_tok))->'snapshot'->'items') x WHERE x->>'slug' = p_slug
$$;
GRANT EXECUTE ON FUNCTION test_util.t_pub(text, text) TO service_role;

-- Otro dueño de HOME (para comprobar que la biblioteca es de cada dueño).
INSERT INTO auth.users (id, email) VALUES (:'h2', 'otra.home@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES (:'h2', 'admin', 'Otra Home', 'otra.home@ejemplo.test');
INSERT INTO home_owners (profile_id) VALUES (:'h2');
SELECT title AS p1_title0, coalesce(description, '∅') AS p1_desc0 FROM properties WHERE id = :'p1' \gset

SET ROLE service_role;
-- ── Catálogo A: textos publicados ──────────────────────────────────────────
SELECT catalog_create(:'owner', 'Catálogo A', NULL) AS cat_a \gset
SELECT catalog_add_property(:'owner', :'cat_a', :'p1');
SELECT catalog_add_property(:'owner', :'cat_a', :'p2');
SELECT catalog_text_save_draft(:'owner', :'cat_a', :'p1', 'Ático luminoso en Delicias', 'Salón amplio con mucha luz.', NULL, NULL, 'manual', NULL) AS r \gset
SELECT catalog_text_publish(:'owner', :'cat_a', :'p1', :r);
SELECT catalog_text_save_draft(:'owner', :'cat_a', :'p2', NULL, 'Piso tranquilo, cocina reformada.', 'Entrada del piso.', NULL, 'manual', NULL) AS r2 \gset
SELECT catalog_text_publish(:'owner', :'cat_a', :'p2', :r2);

-- 1. Publicar NO aprueba (N1): otro catálogo no reutiliza nada.
SELECT catalog_create(:'owner', 'Catálogo B', NULL) AS cat_b \gset
SELECT catalog_add_property(:'owner', :'cat_b', :'p1');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = :'cat_b'), 'publicar sin aprobar: añadir a otro catálogo no copia nada');
SELECT test_util.ok((SELECT count(*) FROM property_copy_versions) = 0, 'publicar no crea versiones en la biblioteca');

-- 2. Aprobación expresa, idempotente.
SELECT catalog_copy_approve(:'owner', :'cat_a', :'p1', 'both') AS a1 \gset
SELECT test_util.ok((:'a1'::jsonb)->>'status' = 'created' AND ((:'a1'::jsonb)->>'seq')::int = 1, 'aprobar título y descripción: versión 1');
SELECT test_util.ok((catalog_copy_approve(:'owner', :'cat_a', :'p1', 'both'))->>'status' = 'unchanged', 'aprobar lo mismo otra vez: sin versión nueva');
SELECT test_util.expect_error(format('SELECT catalog_copy_approve(%L, %L, %L, %L)', :'owner', :'cat_a', :'p1', 'otra'), 'invalid_parts');

-- 3. Reutilizar al añadir a un catálogo nuevo, sin IA y como copia independiente.
SELECT catalog_create(:'owner', 'Catálogo C', NULL) AS cat_c \gset
SELECT catalog_add_property(:'owner', :'cat_c', :'p1');
SELECT token AS tok_c FROM catalog_share_create(:'owner', :'cat_c', 30) \gset
SELECT test_util.ok((SELECT pub_title = 'Ático luminoso en Delicias' AND pub_body = 'Salón amplio con mucha luz.' AND draft_title = pub_title AND draft_body = pub_body
                       AND draft_rev = 1 AND copy_version_id = ((:'a1'::jsonb)->>'version_id')::uuid
                       FROM catalog_texts WHERE catalog_id = :'cat_c' AND property_id = :'p1'), 'reutilizar: copia publicada (y como borrador) con su versión de origen');
SELECT test_util.ok(test_util.t_pub(:'tok_c', 'atico-demo-1')->>'title' = 'Ático luminoso en Delicias'
                    AND test_util.t_pub(:'tok_c', 'atico-demo-1')->'text'->>'b' = 'Salón amplio con mucha luz.', 'reutilizar: el lector del catálogo nuevo ve título y descripción');
SELECT test_util.ok((SELECT published_current FROM catalog_text_states(:'owner', :'cat_c') WHERE property_id = :'p1'), 'reutilizar: estado «publicado y vigente»');
SELECT (get_public_catalog(:'tok_c'))->>'fingerprint' AS fp_c \gset

-- 4. Cambiar la copia de C no toca la biblioteca ni A (independiente, DA5).
SELECT catalog_text_save_draft(:'owner', :'cat_c', :'p1', 'Título solo de C', 'Salón amplio con mucha luz.', NULL, NULL, 'manual', 1) AS rc \gset
SELECT catalog_text_publish(:'owner', :'cat_c', :'p1', :rc);
SELECT test_util.ok((SELECT pub_title FROM catalog_texts WHERE catalog_id = :'cat_a' AND property_id = :'p1') = 'Ático luminoso en Delicias'
                    AND (SELECT title FROM catalog_copy_state(:'owner', ARRAY[:'p1']::uuid[])) = 'Ático luminoso en Delicias', 'editar la copia de C no cambia A ni la biblioteca');

-- 5. Aprobar una versión nueva no cambia catálogos ya creados (DA5).
SELECT catalog_text_save_draft(:'owner', :'cat_a', :'p1', 'Ático luminoso con terraza', 'Salón amplio con mucha luz.', NULL, NULL, 'manual', NULL) AS r3 \gset
SELECT catalog_text_publish(:'owner', :'cat_a', :'p1', :r3);
SELECT catalog_copy_approve(:'owner', :'cat_a', :'p1', 'title') AS a2 \gset
SELECT test_util.ok(((:'a2'::jsonb)->>'seq')::int = 2, 'aprobar solo el título: versión 2');
SELECT test_util.ok((SELECT pub_title FROM catalog_texts WHERE catalog_id = :'cat_c' AND property_id = :'p1') = 'Título solo de C', 'la versión nueva no cambia el catálogo C');

-- 6. Solo título: conserva la descripción aprobada antes y su huella (DA32).
SELECT test_util.ok((SELECT v2.body = v1.body AND v2.body_source_hash = v1.body_source_hash AND v2.body_approved_at = v1.body_approved_at AND v2.title = 'Ático luminoso con terraza'
                       FROM property_copy_versions v1, property_copy_versions v2
                      WHERE v1.owner_id = :'owner' AND v1.property_id = :'p1' AND v1.seq = 1 AND v2.owner_id = :'owner' AND v2.property_id = :'p1' AND v2.seq = 2),
  'solo título: la descripción y su huella pasan tal cual');

-- 7. Cambia la ficha: la descripción no se aprueba (C2); el título sí, sin volver vigente la descripción.
RESET ROLE;
UPDATE properties SET bedrooms = 5 WHERE id = :'p1';
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_copy_approve(%L, %L, %L, %L)', :'owner', :'cat_a', :'p1', 'body'), 'text_stale');
SELECT test_util.expect_error(format('SELECT catalog_copy_approve(%L, %L, %L, %L)', :'owner', :'cat_a', :'p1', 'both'), 'text_stale');
-- Fabricio corrige el título en A y publica: publicar revalida el texto de A
-- (comportamiento de 0197/0217), pero aprobar SOLO el título no revalida la
-- descripción de la biblioteca (DA32).
SELECT catalog_text_save_draft(:'owner', :'cat_a', :'p1', 'Ático con terraza y cinco dormitorios', 'Salón amplio con mucha luz.', NULL, NULL, 'manual', NULL) AS r4 \gset
SELECT catalog_text_publish(:'owner', :'cat_a', :'p1', :r4);
SELECT catalog_copy_approve(:'owner', :'cat_a', :'p1', 'title');
SELECT test_util.ok((SELECT body_current = false AND 'bedrooms' = ANY (changed) AND title = 'Ático con terraza y cinco dormitorios'
                       FROM catalog_copy_state(:'owner', ARRAY[:'p1']::uuid[])), 'título nuevo aprobado; la descripción sigue no vigente y dice qué cambió');

-- 8. Reutilizar con la ficha cambiada: se copia, pero C2 decide (no se ve la descripción).
SELECT catalog_create(:'owner', 'Catálogo D', NULL) AS cat_d \gset
SELECT catalog_add_property(:'owner', :'cat_d', :'p1');
SELECT token AS tok_d FROM catalog_share_create(:'owner', :'cat_d', 30) \gset
SELECT test_util.ok(test_util.t_pub(:'tok_d', 'atico-demo-1')->>'title' = 'Ático con terraza y cinco dormitorios'
                    AND NOT (test_util.t_pub(:'tok_d', 'atico-demo-1') ? 'text'), 'ficha cambiada: el título se ve (DC6) y la descripción no (C2)');
SELECT test_util.ok(NOT (SELECT published_current FROM catalog_text_states(:'owner', :'cat_d') WHERE property_id = :'p1'), 'ficha cambiada: el gestor lo marca como «revisar»');

-- 9. Una entrada con texto, borrador o reserva nunca se pisa (DA33).
SELECT catalog_copy_approve(:'owner', :'cat_a', :'p2', 'body');
SELECT catalog_create(:'owner', 'Catálogo E', NULL) AS cat_e \gset
SELECT catalog_add_property(:'owner', :'cat_e', :'p2');
SELECT catalog_text_save_draft(:'owner', :'cat_e', :'p2', NULL, 'Borrador propio de E.', NULL, NULL, 'manual', 1) AS re \gset
SELECT catalog_remove_item(:'owner', :'cat_e', :'p2');
SELECT catalog_add_property(:'owner', :'cat_e', :'p2');
SELECT test_util.ok((SELECT draft_body = 'Borrador propio de E.' AND draft_rev = 2 FROM catalog_texts WHERE catalog_id = :'cat_e' AND property_id = :'p2'),
  'quitar y volver a añadir: el borrador en reserva se conserva, no se reutiliza encima');
SELECT catalog_add_property(:'owner', :'cat_b', :'p2');
SELECT test_util.ok((SELECT pub_body = 'Piso tranquilo, cocina reformada.' AND pub_lead = 'Entrada del piso.' AND pub_title IS NULL FROM catalog_texts WHERE catalog_id = :'cat_b' AND property_id = :'p2'),
  'una entrada nueva sin texto recibe la descripción aprobada (con su entrada)');
SELECT test_util.ok((SELECT count(*) FROM catalog_texts WHERE catalog_id = :'cat_b' AND property_id = :'p1') = 0, 'la entrada que ya estaba en B no cambia por aprobar después');

-- 10. Retirar partes (DA32): retirar la descripción deja solo el título.
SELECT catalog_copy_withdraw(:'owner', :'p1', 'body');
SELECT catalog_create(:'owner', 'Catálogo F', NULL) AS cat_f \gset
SELECT catalog_add_property(:'owner', :'cat_f', :'p1');
SELECT test_util.ok((SELECT pub_title IS NOT NULL AND pub_body IS NULL AND pub_source_hash IS NULL FROM catalog_texts WHERE catalog_id = :'cat_f' AND property_id = :'p1'),
  'descripción retirada: solo se reutiliza el título');
SELECT catalog_copy_withdraw(:'owner', :'p1', 'all');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_copy_state(:'owner', ARRAY[:'p1']::uuid[])), 'retirar todo: la vivienda ya no tiene texto aprobado');
SELECT catalog_create(:'owner', 'Catálogo G', NULL) AS cat_g \gset
SELECT catalog_add_property(:'owner', :'cat_g', :'p1');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = :'cat_g'), 'retirada: añadir ya no copia nada');
SELECT test_util.ok((SELECT pub_title FROM catalog_texts WHERE catalog_id = :'cat_f' AND property_id = :'p1') IS NOT NULL, 'retirar no toca las copias ya hechas');
SELECT test_util.expect_error(format('SELECT catalog_copy_withdraw(%L, %L, %L)', :'owner', :'p4', 'all'), 'copy_not_found');

-- 11. Un borrador nunca se aprueba.
SELECT catalog_add_property(:'owner', :'cat_a', :'p4');
SELECT catalog_text_save_draft(:'owner', :'cat_a', :'p4', 'Solo borrador', 'Borrador sin publicar.', NULL, NULL, 'manual', NULL);
SELECT test_util.expect_error(format('SELECT catalog_copy_approve(%L, %L, %L, %L)', :'owner', :'cat_a', :'p4', 'title'), 'title_not_published');
SELECT test_util.expect_error(format('SELECT catalog_copy_approve(%L, %L, %L, %L)', :'owner', :'cat_a', :'p4', 'body'), 'body_not_published');

-- 12. Siembra: candidatos con la marca de asignaciones personales; nada se aprueba solo.
SELECT test_util.ok((SELECT count(*) FROM catalog_copy_candidates(:'owner') WHERE property_id = :'p2' AND catalog_id = :'cat_a' AND body_in_library) = 1,
  'candidatos: la descripción de p2 en A ya está en la biblioteca');
SELECT test_util.ok((SELECT count(*) FROM catalog_copy_candidates(:'owner') WHERE catalog_id = :'cat_c' AND NOT title_in_library) = 1, 'candidatos: el título propio de C no está en la biblioteca');
RESET ROLE;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000c9', 'cli.copy@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES ('00000000-0000-0000-0000-0000000000c9', 'client', 'Cliente Copia', 'cli.copy@ejemplo.test');
SET ROLE service_role;
SELECT catalog_client_link_create(:'owner', :'cat_c', '00000000-0000-0000-0000-0000000000c9', 30);
SELECT test_util.ok((SELECT bool_and(has_personal_links) FROM catalog_copy_candidates(:'owner') WHERE catalog_id = :'cat_c'), 'candidatos: catálogo con asignaciones personales señalado');
SELECT test_util.ok((SELECT count(*) FROM property_copy_versions WHERE owner_id = :'owner' AND property_id = :'p2') = 1, 'listar candidatos no aprueba nada');

-- 13. La biblioteca es de cada dueño (DA7, AC5).
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_copy_state(:'h2', ARRAY[:'p1', :'p2']::uuid[])), 'otro dueño: no ve la biblioteca');
SELECT catalog_create(:'h2', 'Catálogo de otra HOME', NULL) AS cat_h \gset
SELECT catalog_add_property(:'h2', :'cat_h', :'p2');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = :'cat_h'), 'otro dueño: añadir la misma vivienda no copia el texto ajeno');
SELECT test_util.expect_error(format('SELECT catalog_copy_approve(%L, %L, %L, %L)', :'h2', :'cat_a', :'p2', 'body'), 'forbidden');
SELECT test_util.expect_error(format('SELECT * FROM catalog_copy_state(%L, ARRAY[%L]::uuid[])', :'staff', :'p1'), 'forbidden');
SELECT test_util.expect_error(format('SELECT * FROM catalog_copy_candidates(%L)', :'staff'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_copy_withdraw(%L, %L, %L)', :'staff', :'p2', 'all'), 'forbidden');

-- 14. La ficha del CRM no cambia por nada de esto.
RESET ROLE;
SELECT test_util.ok((SELECT title = :'p1_title0' AND coalesce(description, '∅') = :'p1_desc0' FROM properties WHERE id = :'p1'), 'la ficha del CRM conserva título y descripción');

-- 15. Permisos (E1).
SET ROLE anon;
SELECT test_util.expect_error('SELECT * FROM property_copy_versions', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_copy_approve(%L, %L, %L, %L)', :'owner', :'cat_a', :'p2', 'body'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error('SELECT * FROM property_copy_versions', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM catalog_copy_candidates(%L)', :'owner'), 'insufficient_privilege');
RESET ROLE;

-- 16. Convertir un automático y cambiar de modo no reutilizan nada (DA33).
RESET ROLE;
INSERT INTO properties (id, slug, title, status, country, zone, subzone, operation, operations, price, created_at) VALUES
  ('c5000000-0000-0000-0000-000000000001', 'cp-1', 'CP 1', 'available', 'es', 'Salamanca', 'Recoletos', 'sale', '{sale}', 900000,  '2026-08-01'),
  ('c5000000-0000-0000-0000-000000000002', 'cp-2', 'CP 2', 'available', 'es', 'Salamanca', 'Recoletos', 'sale', '{sale}', 1000000, '2026-08-02');
INSERT INTO property_photos (property_id, url, position, is_cover)
SELECT id, 'https://storage.example/' || slug || '-' || g || '.webp', g, g = 0 FROM properties, generate_series(0, 1) g WHERE slug LIKE 'cp-%';
SET ROLE service_role;
-- Texto aprobado de cp-1 y cp-2 desde un catálogo manual.
SELECT catalog_create(:'owner', 'Origen CP', NULL) AS cat_o \gset
SELECT catalog_add_property(:'owner', :'cat_o', 'c5000000-0000-0000-0000-000000000001');
SELECT catalog_add_property(:'owner', :'cat_o', 'c5000000-0000-0000-0000-000000000002');
SELECT catalog_text_save_draft(:'owner', :'cat_o', 'c5000000-0000-0000-0000-000000000001', 'CP1 aprobado', 'Texto CP1.', NULL, NULL, 'manual', NULL) AS o1 \gset
SELECT catalog_text_publish(:'owner', :'cat_o', 'c5000000-0000-0000-0000-000000000001', :o1);
SELECT catalog_copy_approve(:'owner', :'cat_o', 'c5000000-0000-0000-0000-000000000001', 'both');
SELECT catalog_text_save_draft(:'owner', :'cat_o', 'c5000000-0000-0000-0000-000000000002', 'CP2 aprobado', 'Texto CP2.', NULL, NULL, 'manual', NULL) AS o2 \gset
SELECT catalog_text_publish(:'owner', :'cat_o', 'c5000000-0000-0000-0000-000000000002', :o2);
SELECT catalog_copy_approve(:'owner', :'cat_o', 'c5000000-0000-0000-0000-000000000002', 'both');
-- Automático con cp-1 y cp-2 en su lista; uno con texto propio de ese catálogo.
SELECT catalog_create(:'owner', 'Automático CP', NULL) AS cat_auto \gset
SELECT catalog_set_criteria(:'owner', :'cat_auto', '{"operation":"sale","zones":[{"kind":"barrio","name":"Recoletos"}],"sort":"price_asc","max":12}');
SELECT catalog_set_mode(:'owner', :'cat_auto', 'auto', NULL);
SELECT catalog_text_save_draft(:'owner', :'cat_auto', 'c5000000-0000-0000-0000-000000000002', NULL, 'Texto propio del automático.', NULL, NULL, 'manual', NULL) AS ra \gset
SELECT catalog_text_publish(:'owner', :'cat_auto', 'c5000000-0000-0000-0000-000000000002', :ra);
SELECT version AS va FROM catalogs WHERE id = :'cat_auto' \gset
SELECT ARRAY(SELECT (x->>'property_id')::uuid FROM jsonb_array_elements((catalog_conversion_preview(:'owner', :'cat_auto'))->'items') WITH ORDINALITY x(x, o) ORDER BY o) AS ids \gset
SELECT catalog_convert_explicit(:'owner', :'cat_auto', :va, :'ids');
SELECT test_util.ok((SELECT count(*) FROM catalog_texts WHERE catalog_id = :'cat_auto') = 1
                    AND (SELECT pub_body FROM catalog_texts WHERE catalog_id = :'cat_auto' AND property_id = 'c5000000-0000-0000-0000-000000000002') = 'Texto propio del automático.',
  'convertir: conserva el texto propio y no copia la biblioteca a las demás');
-- Cambio de modo con estrategia «convert»: tampoco reutiliza.
SELECT catalog_create(:'owner', 'Automático CP 2', NULL) AS cat_auto2 \gset
SELECT catalog_set_criteria(:'owner', :'cat_auto2', '{"operation":"sale","zones":[{"kind":"barrio","name":"Recoletos"}],"sort":"price_asc","max":12}');
SELECT catalog_set_mode(:'owner', :'cat_auto2', 'auto', NULL);
SELECT catalog_set_mode(:'owner', :'cat_auto2', 'manual', 'convert');
SELECT test_util.ok((SELECT count(*) FROM catalog_items WHERE catalog_id = :'cat_auto2') = 2 AND NOT EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = :'cat_auto2'),
  'cambiar a manual («convert»): la lista pasa, sin copiar textos');

-- Para la concurrencia y la reversión.
RESET ROLE;
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry (k, v) VALUES ('t19_cat_a', :'cat_a'), ('t19_tok_c', :'tok_c'), ('t19_cat_b', :'cat_b')
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
