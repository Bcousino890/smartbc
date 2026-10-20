-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-20-bcp-01-compacto-y-opiniones,
-- B1). Tests de 0218 en el Postgres temporal: stub + fixtures + 0192–0217 +
-- 0218 (aplicada dos veces). Datos 100 % sintéticos.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
\set c3    '00000000-0000-0000-0000-0000000000c3'
\set c4    '00000000-0000-0000-0000-0000000000c4'
\set c5    '00000000-0000-0000-0000-0000000000c5'
\set adv   '00000000-0000-0000-0000-0000000000a6'
\set p1 '10000000-0000-0000-0000-000000000001'
\set p2 '10000000-0000-0000-0000-000000000002'
\set p4 '10000000-0000-0000-0000-000000000004'

-- Dos clientes más: c4 con asesor responsable, c5 sin asesor y de Chile.
INSERT INTO auth.users (id, email) VALUES (:'c4', 'c4@ejemplo.test'), (:'c5', 'c5@ejemplo.test'), (:'adv', 'asesor@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES (:'adv', 'advisor', 'Asesora Prueba', 'asesor@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email, assigned_advisor_id, country) VALUES
  (:'c4', 'client', 'Cliente Cuatro', 'c4@ejemplo.test', :'adv', 'es'),
  (:'c5', 'client', 'Cliente Cinco',  'c5@ejemplo.test', NULL,   'cl');

-- 0. Compatibilidad: un enlace general previo abre igual y con la misma huella.
SELECT v AS tok_pre FROM test_util.carry WHERE k = 't18_tok_pre' \gset
SELECT v AS fp_pre FROM test_util.carry WHERE k = 't18_fp_pre' \gset
SELECT test_util.ok((get_public_catalog(:'tok_pre'))->>'fingerprint' = :'fp_pre', 'compatibilidad: 0218 no cambia la huella de un enlace general existente');

SET ROLE service_role;
SELECT catalog_create(:'owner', 'Selección opiniones', NULL) AS cat \gset
SELECT catalog_add_property(:'owner', :'cat', :'p1');
SELECT catalog_add_property(:'owner', :'cat', :'p2');
SELECT catalog_add_property(:'owner', :'cat', :'p4');
SELECT token AS tok_g FROM catalog_share_create(:'owner', :'cat', 60) \gset
SELECT public_key AS k1 FROM catalog_items WHERE catalog_id = :'cat' AND property_id = :'p1' \gset
SELECT public_key AS k2 FROM catalog_items WHERE catalog_id = :'cat' AND property_id = :'p2' \gset
-- Otro catálogo con la misma vivienda (otra clave pública).
SELECT catalog_create(:'owner', 'Otro catálogo', NULL) AS cat2 \gset
SELECT catalog_add_property(:'owner', :'cat2', :'p1');
SELECT public_key AS k_other FROM catalog_items WHERE catalog_id = :'cat2' AND property_id = :'p1' \gset

-- 1. Asignar: solo el dueño, solo a clientes, plazo válido, una vigente.
SELECT test_util.expect_error(format('SELECT catalog_client_link_create(%L, %L, %L, 30)', :'staff', :'cat', :'c4'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_client_link_create(%L, %L, %L, 30)', :'owner', :'cat', :'staff'), 'client_not_found');
SELECT test_util.expect_error(format('SELECT catalog_client_link_create(%L, %L, %L, 0)', :'owner', :'cat', :'c4'), 'invalid_days');
SELECT id AS l4, token AS tok4 FROM catalog_client_link_create(:'owner', :'cat', :'c4', 30) \gset
SELECT id AS l5, token AS tok5 FROM catalog_client_link_create(:'owner', :'cat', :'c5', 30) \gset
SELECT test_util.expect_error(format('SELECT catalog_client_link_create(%L, %L, %L, 30)', :'owner', :'cat', :'c4'), 'link_exists');
SELECT test_util.ok(:'tok4' <> :'tok5' AND :'tok4' <> :'tok_g' AND length(:'tok4') >= 24, 'cada asignación tiene su token propio');

-- 2. Lectura pública: el enlace personal abre el MISMO catálogo, misma huella.
SELECT (get_public_catalog(:'tok_g'))->>'fingerprint' AS fp_g \gset
SELECT test_util.ok((get_public_catalog(:'tok4'))->>'valid' = 'true' AND (get_public_catalog(:'tok4'))->>'fingerprint' = :'fp_g',
  'enlace personal: misma instantánea y huella que el general');
SELECT test_util.ok((SELECT count(*) FROM get_catalog_states(ARRAY[:'tok_g', :'tok4', 'no-existe']) WHERE valid) = 2,
  'estados: general y personal válidos, inventado no');
SELECT test_util.ok(position('Cliente' IN (get_public_catalog(:'tok4'))::text) = 0 AND position(:'c4' IN (get_public_catalog(:'tok4'))::text) = 0,
  'la instantánea no lleva nombre ni id del cliente');

-- 3. Un enlace general no permite opinar ni atribuye a nadie.
SELECT test_util.ok((catalog_feedback_get(:'tok_g'))->>'personal' = 'false', 'enlace general: no es personal');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 5, NULL)', :'tok_g', :'k1'), 'link_invalid');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 5, NULL)', 'token-inventado-0000000000', :'k1'), 'link_invalid');

-- 4. Validación.
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 0, NULL)', :'tok4', :'k1'), 'invalid_rating');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 6, NULL)', :'tok4', :'k1'), 'invalid_rating');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, NULL, NULL)', :'tok4', :'k1'), 'invalid_rating');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 4, %L)', :'tok4', :'k1', repeat('a', 1001)), 'comment_too_long');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 4, NULL)', :'tok4', 'claveInventada01'), 'not_in_catalog');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 4, NULL)', :'tok4', :'k_other'), 'not_in_catalog');
SELECT test_util.ok((SELECT count(*) FROM catalog_feedback) = 0, 'nada se escribe con datos no válidos');

-- 5. Dos clientes opinan de la misma vivienda por separado.
SELECT test_util.ok((catalog_feedback_set(:'tok4', :'k1', 5, '  Me encanta la luz  '))->>'status' = 'saved', 'cliente 4: guardada');
SELECT test_util.ok((catalog_feedback_set(:'tok5', :'k1', 2, '   '))->>'status' = 'saved', 'cliente 5: guardada');
SELECT test_util.ok((SELECT rating = 5 AND comment = 'Me encanta la luz' AND catalog_title = 'Selección opiniones' AND property_title = 'Ático demo'
                       FROM catalog_feedback WHERE client_id = :'c4' AND property_id = :'p1'), 'cliente 4: 5 estrellas, comentario recortado, títulos guardados');
SELECT test_util.ok((SELECT rating = 2 AND comment IS NULL FROM catalog_feedback WHERE client_id = :'c5' AND property_id = :'p1'), 'cliente 5: 2 estrellas, comentario vacío = sin comentario');
SELECT test_util.ok(((catalog_feedback_get(:'tok4'))->'items'->:'k1'->>'rating')::int = 5 AND ((catalog_feedback_get(:'tok5'))->'items'->:'k1'->>'rating')::int = 2,
  'cada enlace lee SOLO su opinión');
SELECT test_util.ok(position('Cliente' IN (catalog_feedback_get(:'tok4'))::text) = 0 AND position(:'c5' IN (catalog_feedback_get(:'tok4'))::text) = 0,
  'la lectura personal no expone otros clientes');
SELECT test_util.ok((get_public_catalog(:'tok_g'))->>'fingerprint' = :'fp_g', 'las opiniones no cambian la huella pública');

-- 6. Avisos internos: asesor responsable o dueño; sin duplicados.
SELECT test_util.ok((SELECT count(*) FROM crm_notifications WHERE user_id = :'adv' AND type = 'catalog_feedback') = 1, 'cliente con asesor: aviso a su asesor');
SELECT test_util.ok((SELECT count(*) FROM crm_notifications WHERE user_id = :'owner' AND type = 'catalog_feedback'
                       AND link = '/cl/admin/clientes/' || :'c5' || '?tab=properties#catalog-feedback') = 1, 'cliente sin asesor: aviso al dueño con enlace a su ficha y su país');
SELECT test_util.ok((SELECT body LIKE 'Cliente Cuatro ha valorado «Ático demo» con 5 de 5%' FROM crm_notifications WHERE user_id = :'adv'), 'el aviso dice quién, qué y cuánto');
SELECT test_util.ok((catalog_feedback_set(:'tok4', :'k1', 5, 'Me encanta la luz'))->>'status' = 'unchanged', 'reintento igual: sin cambios');
SELECT test_util.ok((SELECT count(*) FROM crm_notifications WHERE type = 'catalog_feedback') = 2, 'reintento igual: ningún aviso nuevo');
SELECT test_util.ok((catalog_feedback_set(:'tok4', :'k1', 4, 'Algo pequeño'))->>'status' = 'saved', 'el cliente edita su opinión');
SELECT test_util.ok((SELECT count(*) FROM crm_notifications WHERE user_id = :'adv') = 1
                    AND (SELECT (data->>'rating')::int = 4 FROM crm_notifications WHERE user_id = :'adv'), 'edición con aviso sin leer: se actualiza el mismo aviso');
UPDATE crm_notifications SET read = true WHERE user_id = :'adv';
SELECT catalog_feedback_set(:'tok4', :'k1', 3, 'Algo pequeño');
SELECT test_util.ok((SELECT count(*) FROM crm_notifications WHERE user_id = :'adv') = 2, 'edición con el aviso ya leído: aviso nuevo');
SELECT test_util.ok((SELECT count(*) FROM catalog_feedback WHERE client_id = :'c4') = 1, 'una sola opinión por cliente y vivienda');

-- 7. Reordenar no mueve opiniones (se nombran por vivienda, no por puesto).
SELECT catalog_reorder(:'owner', :'cat', ARRAY[:'p4', :'p2', :'p1']::uuid[]);
SELECT test_util.ok(((catalog_feedback_get(:'tok4'))->'items'->:'k1'->>'rating')::int = 3 AND NOT ((catalog_feedback_get(:'tok4'))->'items' ? :'k2'),
  'tras reordenar, la opinión sigue en su vivienda');

-- 8. Vivienda retirada del catálogo: la opinión se conserva como histórico.
SELECT catalog_feedback_set(:'tok4', :'k2', 1, NULL);
SELECT catalog_remove_item(:'owner', :'cat', :'p2');
SELECT test_util.ok((SELECT count(*) FROM catalog_feedback WHERE client_id = :'c4' AND property_id = :'p2') = 1, 'vivienda retirada: la opinión queda');
SELECT test_util.ok(NOT ((catalog_feedback_get(:'tok4'))->'items' ? :'k2'), 'vivienda retirada: ya no se lista en el lector');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 5, NULL)', :'tok4', :'k2'), 'not_in_catalog');

-- 9. Listado del dueño.
SELECT test_util.ok((SELECT count(*) FROM catalog_client_links_list(:'owner', :'cat')) = 2
                    AND (SELECT feedback_count FROM catalog_client_links_list(:'owner', :'cat') WHERE client_id = :'c4') = 2
                    AND (SELECT client_name FROM catalog_client_links_list(:'owner', :'cat') WHERE client_id = :'c5') = 'Cliente Cinco',
  'listado: asignaciones con nombre y número de opiniones');
SELECT test_util.expect_error(format('SELECT * FROM catalog_client_links_list(%L, %L)', :'staff', :'cat'), 'forbidden');

-- 10. Renovar, caducar, revocar y archivar: la escritura se revalida siempre.
SELECT test_util.ok(catalog_client_link_renew(:'owner', :'l4', 90) > now() + interval '80 days', 'renovar alarga el plazo');
SELECT test_util.expect_error(format('SELECT catalog_client_link_renew(%L, %L, 30)', :'staff', :'l4'), 'forbidden');
RESET ROLE;
UPDATE catalog_client_links SET expires_at = now() - interval '1 minute' WHERE id = :'l5';
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 5, NULL)', :'tok5', :'k1'), 'link_invalid');
SELECT test_util.ok((get_public_catalog(:'tok5'))->>'valid' = 'false', 'enlace personal caducado: no abre');
SELECT id AS l5b, token AS tok5b FROM catalog_client_link_create(:'owner', :'cat', :'c5', 30) \gset
SELECT test_util.ok((SELECT revoked_at IS NOT NULL FROM catalog_client_links WHERE id = :'l5'), 'asignar de nuevo tras caducar: el anterior queda revocado');
SELECT test_util.ok(((catalog_feedback_get(:'tok5b'))->'items'->:'k1'->>'rating')::int = 2, 'el enlace nuevo ve y edita la opinión anterior del mismo cliente');
SELECT catalog_client_link_revoke(:'owner', :'l4');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 5, NULL)', :'tok4', :'k1'), 'link_invalid');
SELECT test_util.ok((catalog_feedback_get(:'tok4'))->>'personal' = 'false' AND (get_public_catalog(:'tok4'))->>'valid' = 'false', 'enlace revocado: ni lee ni escribe');
SELECT test_util.ok((SELECT count(*) FROM catalog_feedback WHERE client_id = :'c4') = 2, 'revocar conserva las opiniones');
SELECT catalog_set_status(:'owner', :'cat', 'archived');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 5, NULL)', :'tok5b', :'k1'), 'link_invalid');
SELECT catalog_set_status(:'owner', :'cat', 'active');

-- 11. La vivienda borrada del CRM no borra la opinión.
RESET ROLE;
DELETE FROM properties WHERE id = :'p2';
SELECT test_util.ok((SELECT count(*) FROM catalog_feedback WHERE client_id = :'c4' AND property_id IS NULL AND property_title = 'Piso demo') = 1,
  'vivienda borrada en el CRM: la opinión queda con su título');

-- 12. Permisos (E1): nada para anon ni authenticated.
SET ROLE anon;
SELECT test_util.expect_error('SELECT * FROM catalog_feedback', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT * FROM catalog_client_links', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_feedback_set(%L, %L, 5, NULL)', :'tok5b', :'k1'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_feedback_get(%L)', :'tok5b'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT * FROM catalog_client_link_create(%L, %L, %L, 30)', :'owner', :'cat', :'c3'), 'insufficient_privilege');
SELECT test_util.expect_error('SELECT * FROM catalog_feedback', 'insufficient_privilege');
RESET ROLE;

-- Para la reversión.
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry (k, v) VALUES ('t18_tok_g', :'tok_g'), ('t18_fp_g', :'fp_g'), ('t18_tok5b', :'tok5b')
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
