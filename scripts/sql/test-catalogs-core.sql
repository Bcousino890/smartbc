-- ============================================================================
-- SOLO PRUEBAS LOCALES (BCP-01 T1). Tests de 0192_catalogs_core.sql sobre el
-- Postgres temporal, con stub-supabase.sql + fixtures-core.sql + test-util.sql
-- ya aplicados y 0192 aplicada DOS veces.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner   '00000000-0000-0000-0000-0000000000f1'
\set staff   '00000000-0000-0000-0000-0000000000a2'
\set client  '00000000-0000-0000-0000-0000000000c3'
\set p1      '10000000-0000-0000-0000-000000000001'
\set p2      '10000000-0000-0000-0000-000000000002'
\set p3      '10000000-0000-0000-0000-000000000003'
\set p4      '10000000-0000-0000-0000-000000000004'
\set p5      '10000000-0000-0000-0000-000000000005'
\set p6      '10000000-0000-0000-0000-000000000006'
\set p7      '10000000-0000-0000-0000-000000000007'

-- ── Siembra: exactamente el perfil de Fabricio ──────────────────────────────
SELECT test_util.ok((SELECT count(*) FROM home_owners) = 1, 'siembra: 1 dueño');
SELECT test_util.ok((SELECT profile_id FROM home_owners) = :'owner', 'siembra: es el id del perfil de Fabricio');

-- ── E1: anon y authenticated no pueden nada ─────────────────────────────────
SET ROLE anon;
SELECT test_util.expect_error('SELECT 1 FROM home_owners', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT 1 FROM catalogs', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT 1 FROM catalog_items', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT 1 FROM catalog_shares', 'insufficient_privilege');
SELECT test_util.expect_error(format('INSERT INTO catalogs (owner_id, title) VALUES (%L, %L)', :'owner', 'x'), 'insufficient_privilege');
SELECT test_util.expect_error(format('INSERT INTO home_owners (profile_id) VALUES (%L)', :'client'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_create(%L, %L, NULL)', :'owner', 'x'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_require_owner(%L, NULL)', :'owner'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, gen_random_uuid(), %L)', :'owner', :'p1'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_remove_item(%L, gen_random_uuid(), %L)', :'owner', :'p1'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_reorder(%L, gen_random_uuid(), ARRAY[]::uuid[])', :'owner'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_update_meta(%L, gen_random_uuid(), %L, NULL)', :'owner', 'x'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_set_status(%L, gen_random_uuid(), %L)', :'owner', 'archived'), 'insufficient_privilege');
RESET ROLE;

SET ROLE authenticated;
SELECT test_util.expect_error('SELECT 1 FROM catalogs', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT 1 FROM catalog_items', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT 1 FROM catalog_shares', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT 1 FROM home_owners', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_create(%L, %L, NULL)', :'owner', 'x'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, gen_random_uuid(), %L)', :'owner', :'p1'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_set_status(%L, gen_random_uuid(), %L)', :'owner', 'archived'), 'insufficient_privilege');
RESET ROLE;

-- ── service_role con actores distintos ──────────────────────────────────────
SET ROLE service_role;

-- Quien no es dueño de la HOME no crea catálogos.
SELECT test_util.expect_error(format('SELECT catalog_create(%L, %L, NULL)', :'staff', 'Ajeno'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_create(%L, %L, NULL)', :'client', 'Ajeno'), 'forbidden');
SELECT test_util.expect_error('SELECT catalog_create(NULL, ''Sin actor'', NULL)', 'forbidden');

-- El dueño sí.
SELECT catalog_create(:'owner', '  Selección A  ', 'Intro A') AS cat_a \gset
SELECT catalog_create(:'owner', 'Selección B', NULL) AS cat_b \gset
SELECT test_util.ok((SELECT title FROM catalogs WHERE id = :'cat_a') = 'Selección A', 'create: recorta el título');
SELECT test_util.ok((SELECT version FROM catalogs WHERE id = :'cat_a') = 1, 'create: versión 1');

-- Título vacío o demasiado largo → CHECK.
SELECT test_util.expect_error(format('SELECT catalog_create(%L, %L, NULL)', :'owner', '   '), 'check_violation');
SELECT test_util.expect_error(format('SELECT catalog_create(%L, %L, NULL)', :'owner', repeat('x', 161)), 'check_violation');

-- Añadir: solo existentes, de España, no vendidas ni archivadas.
SELECT catalog_add_property(:'owner', :'cat_a', :'p1') AS v \gset
SELECT test_util.ok(:v = 2, 'add p1: versión 2');
SELECT catalog_add_property(:'owner', :'cat_a', :'p2') AS v \gset
SELECT test_util.ok(:v = 3, 'add p2: versión 3');
SELECT catalog_add_property(:'owner', :'cat_a', :'p3') AS v \gset
SELECT test_util.ok(:v = 4, 'add p3 (reservada, se permite): versión 4');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'cat_a', :'p1'), 'already_in_catalog');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'cat_a', :'p5'), 'property_not_available');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'cat_a', :'p7'), 'property_not_available');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'cat_a', :'p6'), 'property_not_es');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, gen_random_uuid())', :'owner', :'cat_a'), 'property_not_found');
SELECT test_util.ok((SELECT version FROM catalogs WHERE id = :'cat_a') = 4, 'los intentos fallidos no suben la versión');
SELECT test_util.ok((SELECT array_agg(position ORDER BY position) FROM catalog_items WHERE catalog_id = :'cat_a') = ARRAY[100, 200, 300], 'posiciones 100/200/300');
SELECT test_util.ok((SELECT count(DISTINCT public_key) FROM catalog_items WHERE catalog_id = :'cat_a') = 3, 'claves públicas distintas');
SELECT test_util.ok((SELECT bool_and(public_key !~ '^[0-9a-f]{8}-') FROM catalog_items), 'la clave pública no es un UUID');

-- Un actor que no es dueño no toca el catálogo de Fabricio.
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'staff', :'cat_a', :'p4'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_remove_item(%L, %L, %L)', :'staff', :'cat_a', :'p1'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_reorder(%L, %L, ARRAY[%L, %L, %L]::uuid[])', :'staff', :'cat_a', :'p3', :'p2', :'p1'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_update_meta(%L, %L, %L, NULL)', :'staff', :'cat_a', 'Hackeado'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_status(%L, %L, %L)', :'staff', :'cat_a', 'archived'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, gen_random_uuid(), %L)', :'owner', :'p4'), 'forbidden');

-- Independencia: la misma propiedad en dos catálogos.
SELECT catalog_add_property(:'owner', :'cat_b', :'p1') AS vb \gset
SELECT test_util.ok(:vb = 2, 'catálogo B: add p1, versión 2');

-- Orden: lista completa; si falta, sobra o se repite algo, no cambia nada.
SELECT test_util.expect_error(format('SELECT catalog_reorder(%L, %L, ARRAY[%L, %L]::uuid[])', :'owner', :'cat_a', :'p2', :'p1'), 'order_mismatch');
SELECT test_util.expect_error(format('SELECT catalog_reorder(%L, %L, ARRAY[%L, %L, %L, %L]::uuid[])', :'owner', :'cat_a', :'p1', :'p2', :'p3', :'p4'), 'order_mismatch');
SELECT test_util.expect_error(format('SELECT catalog_reorder(%L, %L, ARRAY[%L, %L, %L]::uuid[])', :'owner', :'cat_a', :'p1', :'p1', :'p2'), 'order_mismatch');
SELECT test_util.expect_error(format('SELECT catalog_reorder(%L, %L, ARRAY[%L, %L, %L]::uuid[])', :'owner', :'cat_a', :'p1', :'p2', :'p4'), 'order_mismatch');
SELECT catalog_reorder(:'owner', :'cat_a', ARRAY[:'p3', :'p1', :'p2']::uuid[]) AS v \gset
SELECT test_util.ok(:v = 5, 'reorder: versión 5');
SELECT test_util.ok(
  (SELECT array_agg(property_id ORDER BY position) FROM catalog_items WHERE catalog_id = :'cat_a') = ARRAY[:'p3', :'p1', :'p2']::uuid[],
  'reorder: nuevo orden p3, p1, p2');
SELECT test_util.ok((SELECT position FROM catalog_items WHERE catalog_id = :'cat_b' AND property_id = :'p1') = 100, 'reordenar A no cambia B');

-- Quitar de A no afecta a B.
SELECT catalog_remove_item(:'owner', :'cat_a', :'p1') AS v \gset
SELECT test_util.ok(:v = 6, 'remove p1 de A: versión 6');
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_items WHERE catalog_id = :'cat_b' AND property_id = :'p1'), 'p1 sigue en B');
SELECT test_util.expect_error(format('SELECT catalog_remove_item(%L, %L, %L)', :'owner', :'cat_a', :'p1'), 'not_in_catalog');
SELECT test_util.ok((SELECT version FROM catalogs WHERE id = :'cat_b') = 2, 'B conserva su versión');

-- Metadatos.
SELECT test_util.expect_error(format('SELECT catalog_update_meta(%L, %L, %L, NULL)', :'owner', :'cat_a', '  '), 'check_violation');
SELECT catalog_update_meta(:'owner', :'cat_a', 'Selección A2', '  ') AS v \gset
SELECT test_util.ok(:v = 7, 'update_meta: versión 7');
SELECT test_util.ok((SELECT intro IS NULL FROM catalogs WHERE id = :'cat_a'), 'update_meta: intro vacía → NULL');

-- Archivar: no se añaden propiedades a un catálogo archivado.
SELECT test_util.expect_error(format('SELECT catalog_set_status(%L, %L, %L)', :'owner', :'cat_a', 'borrador'), 'invalid_status');
SELECT catalog_set_status(:'owner', :'cat_a', 'archived') AS v \gset
SELECT test_util.ok(:v = 8 AND (SELECT archived_at IS NOT NULL FROM catalogs WHERE id = :'cat_a'), 'archivar: versión 8 y fecha');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'cat_a', :'p4'), 'catalog_archived');
SELECT catalog_set_status(:'owner', :'cat_a', 'active') AS v \gset
SELECT test_util.ok(:v = 9 AND (SELECT archived_at IS NULL FROM catalogs WHERE id = :'cat_a'), 'reactivar: versión 9, sin fecha');

-- Enlaces: un solo enlace activo por catálogo.
INSERT INTO catalog_shares (catalog_id, token, expires_at) VALUES (:'cat_a', repeat('a', 28), now() + interval '60 days');
SELECT test_util.expect_error(format('INSERT INTO catalog_shares (catalog_id, token, expires_at) VALUES (%L, %L, now() + interval ''1 day'')', :'cat_a', repeat('b', 28)), 'unique_violation');
UPDATE catalog_shares SET revoked_at = now() WHERE catalog_id = :'cat_a';
INSERT INTO catalog_shares (catalog_id, token, expires_at) VALUES (:'cat_a', repeat('c', 28), now() + interval '60 days');
SELECT test_util.ok((SELECT count(*) FROM catalog_shares WHERE catalog_id = :'cat_a') = 2, 'tras revocar se puede crear otro enlace');
SELECT test_util.expect_error(format('INSERT INTO catalog_shares (catalog_id, token, expires_at) VALUES (%L, %L, now() + interval ''1 day'')', :'cat_b', 'corto'), 'check_violation');
RESET ROLE;

-- ── Cascada: borrar una propiedad en el CRM sigue funcionando ───────────────
DELETE FROM properties WHERE id = :'p2';
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_items WHERE property_id = :'p2'), 'cascada: el elemento desaparece del catálogo');
SELECT test_util.ok((SELECT count(*) FROM catalog_items WHERE catalog_id = :'cat_a') = 1, 'cascada: A conserva el resto');

-- ── Nada de 0192 ha tocado properties ───────────────────────────────────────
SELECT test_util.ok((SELECT count(*) FROM properties) = 6, 'properties: solo el borrado manual del test');

\echo 'test-catalogs-core.sql: todo en verde'
