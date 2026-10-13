-- ============================================================================
-- SOLO PRUEBAS LOCALES (BCP-01 T6/T7). Tests de 0193_catalog_public.sql en el
-- Postgres temporal, con stub + fixtures-core + 0192 + 0193 (0193 dos veces).
-- Cubre los nueve casos de E3, el acceso sin cambio de contenido, la
-- privacidad de la instantánea y la gestión de enlaces.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
\set p1 '10000000-0000-0000-0000-000000000001'
\set p2 '10000000-0000-0000-0000-000000000002'
\set p3 '10000000-0000-0000-0000-000000000003'
\set p4 '10000000-0000-0000-0000-000000000004'

-- Datos públicos sintéticos de las propiedades.
UPDATE properties SET zone = 'Jerónimos', price = 1450000, bedrooms = 3, bathrooms = 2, square_meters = 142,
       description = 'Texto con teléfono 600 000 000 de otra inmobiliaria', features = ARRAY['Terraza', 'Ascensor']
 WHERE id = :'p1';
UPDATE properties SET zone = 'Almagro', operation = 'rent', price = 4800, bedrooms = 4, bathrooms = 3 WHERE id = :'p2';
INSERT INTO property_photos (property_id, url, position, is_cover, source_width, source_height) VALUES
  (:'p1', 'https://storage.example/a.webp', 0, true, 1600, 1200),
  (:'p1', 'https://storage.example/b.webp', 1, false, 1200, 1600);

SET ROLE service_role;
SELECT catalog_create(:'owner', 'Catálogo público', 'Intro') AS cat \gset
SELECT catalog_create(:'owner', 'Otro', NULL) AS cat_b \gset
SELECT catalog_add_property(:'owner', :'cat', :'p1');
SELECT catalog_add_property(:'owner', :'cat', :'p2');
SELECT catalog_add_property(:'owner', :'cat', :'p3');

-- ── Enlaces ─────────────────────────────────────────────────────────────────
SELECT test_util.expect_error(format('SELECT * FROM catalog_share_create(%L, %L, 0)', :'owner', :'cat'), 'invalid_days');
SELECT test_util.expect_error(format('SELECT * FROM catalog_share_create(%L, %L, 366)', :'owner', :'cat'), 'invalid_days');
SELECT test_util.expect_error(format('SELECT * FROM catalog_share_create(%L, %L, 60)', :'staff', :'cat'), 'forbidden');
SELECT token AS tok, expires_at AS exp1 FROM catalog_share_create(:'owner', :'cat', 60) \gset
SELECT test_util.ok(char_length(:'tok') >= 24, 'enlace: token de 28 caracteres');
SELECT test_util.ok(:'exp1'::timestamptz BETWEEN now() + interval '59 days' AND now() + interval '61 days', 'enlace: caduca en 60 días');
SELECT test_util.expect_error(format('SELECT * FROM catalog_share_create(%L, %L, 30)', :'owner', :'cat'), 'share_exists');
SELECT token AS tok_r, expires_at AS exp2 FROM catalog_share_renew(:'owner', :'cat', 365) \gset
SELECT test_util.ok(:'tok_r' = :'tok', 'renovar conserva el token');
SELECT test_util.ok(:'exp2'::timestamptz > now() + interval '364 days', 'renovar: 365 días');
SELECT test_util.expect_error(format('SELECT * FROM catalog_share_renew(%L, %L, 400)', :'owner', :'cat'), 'invalid_days');
SELECT test_util.expect_error(format('SELECT * FROM catalog_share_renew(%L, %L, 30)', :'owner', :'cat_b'), 'no_share');
SELECT test_util.expect_error(format('SELECT catalog_share_revoke(%L, %L)', :'staff', :'cat'), 'forbidden');

-- ── Instantánea pública: válida, coherente y sin datos privados ──────────────
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp0 \gset
SELECT test_util.ok((get_public_catalog(:'tok'))->>'valid' = 'true', 'enlace válido');
SELECT test_util.ok(jsonb_array_length((get_public_catalog(:'tok'))->'snapshot'->'items') = 3, 'instantánea: 3 propiedades');
SELECT test_util.ok(((get_public_catalog(:'tok'))->'snapshot')::text !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'instantánea sin UUID');
SELECT test_util.ok(position('fabricio.andree@' in (get_public_catalog(:'tok'))::text) = 0, 'instantánea sin correo del dueño');
SELECT test_util.ok(position('storage.example' in (get_public_catalog(:'tok'))::text) = 0, 'instantánea sin URL de almacenamiento (solo md5)');
SELECT test_util.ok((get_public_catalog(:'tok'))->'snapshot'->>'owner_name' = 'Fabricio Andree', 'nombre del dueño para la firma');
SELECT test_util.ok((get_public_catalog('no-existe-' || repeat('x', 20)))->>'valid' = 'false', 'token inventado → no válido');
SELECT test_util.ok((SELECT valid FROM get_catalog_states(ARRAY[:'tok']) LIMIT 1), 'estados: válido');
SELECT test_util.ok((SELECT fingerprint FROM get_catalog_states(ARRAY[:'tok']) LIMIT 1) = :'fp0', 'estados: misma huella que la instantánea');
SELECT test_util.ok(catalog_public_fingerprint(:'owner', :'cat') = :'fp0', 'huella para la medición = la del lector');
SELECT test_util.expect_error(format('SELECT catalog_public_fingerprint(%L, %L)', :'staff', :'cat'), 'forbidden');
RESET ROLE;

-- ── E3: la huella cubre todas las fuentes públicas ───────────────────────────
-- 1. Precio de una propiedad que NO es la de updated_at más reciente.
UPDATE properties SET description = 'otra', updated_at = now() + interval '1 day' WHERE id = :'p1';
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fpa \gset
UPDATE properties SET price = 4900, updated_at = '2000-01-01' WHERE id = :'p2';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fpa', 'E3·1 precio de una propiedad no «máxima» cambia la huella');

-- 6. Una propiedad que NO está en el catálogo no cambia la huella.
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fpb \gset
UPDATE properties SET price = 1, title = 'Cambio ajeno' WHERE id = :'p4';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fpb', 'E3·6 cambio en una propiedad ajena no cambia la huella');

-- 3. Disponibilidad.
UPDATE properties SET status = 'sold' WHERE id = :'p1';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fpb', 'E3·3 vendida cambia la huella');
SELECT test_util.ok(jsonb_array_length((get_public_catalog(:'tok'))->'snapshot'->'items') = 2, 'E3·3 vendida sale de la instantánea');
UPDATE properties SET status = 'available' WHERE id = :'p1';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fpb', 'volver a disponible restaura la misma huella');
UPDATE properties SET archived_at = now() WHERE id = :'p1';
SELECT test_util.ok(jsonb_array_length((get_public_catalog(:'tok'))->'snapshot'->'items') = 2, 'E3·3 archivada sale de la instantánea');
UPDATE properties SET archived_at = NULL WHERE id = :'p1';
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fpc \gset
UPDATE properties SET status = 'reserved' WHERE id = :'p2';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fpc', 'E3·3 reservada cambia la huella');
SELECT test_util.ok((SELECT bool_or(i->>'status' = 'reserved') FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') i), 'E3·3 reservada sigue y lleva su estado');

-- 4. Fotos: alta, orden, portada, URL y baja.
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
INSERT INTO property_photos (property_id, url, position) VALUES (:'p1', 'https://storage.example/c.webp', 2);
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'E3·4 foto nueva cambia la huella');
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
UPDATE property_photos SET position = CASE position WHEN 0 THEN 1 WHEN 1 THEN 0 ELSE position END WHERE property_id = :'p1';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'E3·4 reordenar fotos cambia la huella');
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
UPDATE property_photos SET is_cover = NOT is_cover WHERE property_id = :'p1' AND url LIKE '%c.webp';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'E3·4 cambiar la portada cambia la huella');
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
UPDATE property_photos SET url = 'https://storage.example/c2.webp' WHERE property_id = :'p1' AND url LIKE '%c.webp';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'E3·4 sustituir la foto (misma posición) cambia la huella');
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
DELETE FROM property_photos WHERE property_id = :'p1' AND url LIKE '%c2.webp';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'E3·4 borrar una foto cambia la huella');

-- 5. features / features_manual / floor_override / descripción limpia.
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
UPDATE properties SET features = ARRAY['Terraza', 'Ascensor', 'Portero'] WHERE id = :'p1';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'E3·5 features cambia la huella');
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
UPDATE properties SET floor_override = '7' WHERE id = :'p1';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'E3·5 floor_override cambia la huella');
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
INSERT INTO property_client_descriptions (property_id, language, src, description) VALUES (:'p1', 'es', 'abc', 'Texto limpio');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'E3·5 descripción limpia nueva cambia la huella');

-- Metadatos y orden del catálogo.
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
SET ROLE service_role;
SELECT catalog_reorder(:'owner', :'cat', ARRAY[:'p2', :'p1', :'p3']::uuid[]);
RESET ROLE;
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'ordenar cambia la huella');
SELECT test_util.ok(((get_public_catalog(:'tok'))->'snapshot'->'items'->0->>'slug') = 'piso-demo-2', 'la instantánea respeta el orden nuevo');
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
SET ROLE service_role;
SELECT catalog_update_meta(:'owner', :'cat', 'Título nuevo', 'Intro');
RESET ROLE;
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'cambiar el título cambia la huella');

-- 2. Borrado en cascada de una propiedad del catálogo.
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
DELETE FROM properties WHERE id = :'p3';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'f', 'E3·2 borrado en cascada cambia la huella');
SELECT test_util.ok(jsonb_array_length((get_public_catalog(:'tok'))->'snapshot'->'items') = 2, 'E3·2 la propiedad borrada sale');

-- 8. Una sola sentencia y misma instantánea (funciones SQL STABLE).
SELECT test_util.ok((SELECT bool_and(l.lanname = 'sql' AND p.provolatile = 's') FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
  WHERE p.proname IN ('get_public_catalog', 'catalog_internal_snapshot', 'get_catalog_states')), 'E3·8 lectura en una sentencia SQL STABLE');

-- 7. Acceso sin cambio de contenido: revocar / caducar / archivar.
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS f \gset
SET ROLE service_role;
SELECT catalog_public_fingerprint(:'owner', :'cat') AS f_cat \gset
SELECT catalog_share_revoke(:'owner', :'cat');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'valid' = 'false', 'E3·7 revocado → no válido');
SELECT test_util.ok(NOT (SELECT valid FROM get_catalog_states(ARRAY[:'tok']) LIMIT 1), 'E3·7 estados: revocado → no válido');
SELECT test_util.ok(catalog_public_fingerprint(:'owner', :'cat') = :'f_cat', 'E3·7 el contenido no cambió (misma huella)');
SELECT test_util.expect_error(format('SELECT catalog_share_revoke(%L, %L)', :'owner', :'cat'), 'no_share');
SELECT token AS tok2 FROM catalog_share_create(:'owner', :'cat', 7) \gset
SELECT test_util.ok(:'tok2' <> :'tok', 'tras revocar, el enlace nuevo tiene otro token');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'valid' = 'false', 'el token revocado sigue sin valer');
SELECT test_util.ok((get_public_catalog(:'tok2'))->>'valid' = 'true', 'el token nuevo vale');
RESET ROLE;
UPDATE catalog_shares SET created_at = now() - interval '10 days', expires_at = now() - interval '1 second' WHERE token = :'tok2';
SELECT test_util.ok((get_public_catalog(:'tok2'))->>'valid' = 'false', 'E3·7 caducado → no válido');
SET ROLE service_role;
SELECT token AS tok3 FROM catalog_share_renew(:'owner', :'cat', 30) \gset
SELECT test_util.ok(:'tok3' = :'tok2' AND (get_public_catalog(:'tok2'))->>'valid' = 'true', 'renovar un enlace caducado lo reactiva con el mismo token');
SELECT catalog_set_status(:'owner', :'cat', 'archived');
SELECT test_util.ok((get_public_catalog(:'tok2'))->>'valid' = 'false', 'catálogo archivado → no válido');
SELECT test_util.expect_error(format('SELECT * FROM catalog_share_create(%L, %L, 30)', :'owner', :'cat'), 'catalog_archived');
RESET ROLE;

-- 9. anon y authenticated no pueden llamar a ninguna función de 0193.
SET ROLE anon;
SELECT test_util.expect_error(format('SELECT get_public_catalog(%L)', :'tok2'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM get_catalog_states(ARRAY[%L])', :'tok2'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_internal_snapshot(%L)', :'cat'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_public_fingerprint(%L, %L)', :'owner', :'cat'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM catalog_share_create(%L, %L, 1)', :'owner', :'cat'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM catalog_share_renew(%L, %L, 1)', :'owner', :'cat'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_share_revoke(%L, %L)', :'owner', :'cat'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT get_public_catalog(%L)', :'tok2'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM get_catalog_states(ARRAY[%L])', :'tok2'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_internal_snapshot(%L)', :'cat'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM catalog_share_create(%L, %L, 1)', :'owner', :'cat'), 'insufficient_privilege');
RESET ROLE;

\echo 'test-catalog-public.sql: todo en verde'
