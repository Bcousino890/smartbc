-- ============================================================================
-- SOLO PRUEBAS LOCALES (BCP-01 ampliación X1). Tests de 0194_catalog_contact
-- en el Postgres temporal: stub + fixtures + 0192 + 0193 + datos previos +
-- 0194 (aplicada dos veces).
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
\set client '00000000-0000-0000-0000-0000000000c3'
SELECT v AS cat_old FROM test_util.carry WHERE k = 'cat_old' \gset
SELECT v AS tok_old FROM test_util.carry WHERE k = 'tok_old' \gset
SELECT v AS fp_old  FROM test_util.carry WHERE k = 'fp_old'  \gset

-- 1. Relleno de los catálogos existentes: lo que ya se veía.
SELECT test_util.ok(
  (SELECT contact_name = 'Fabricio Andree' AND contact_phone = '+34641457123' AND contact_role = 'asesor'
     FROM catalogs WHERE id = :'cat_old'),
  'relleno: nombre del perfil, teléfono de la agencia y «asesor»');
SELECT test_util.ok((SELECT count(*) FROM catalogs WHERE contact_phone IS NULL OR contact_role IS NULL) = 0,
  'relleno: ningún catálogo sin teléfono ni rol');

-- 2. Compatibilidad: la instantánea conserva TODAS las claves de 0193.
SELECT test_util.ok(
  (SELECT bool_and((get_public_catalog(:'tok_old'))->'snapshot' ? k)
     FROM unnest(ARRAY['title','intro','created_at','status','owner_name','items','contact']) k),
  'instantánea: claves de 0193 + contact');
SELECT test_util.ok(((get_public_catalog(:'tok_old'))->'snapshot'->'contact'->>'phone') = '+34641457123',
  'instantánea: teléfono del catálogo');
-- Añadir 'contact' cambia la huella una vez (versión nueva de la instantánea).
SELECT test_util.ok((get_public_catalog(:'tok_old'))->>'fingerprint' <> :'fp_old',
  'huella: cambia al añadir el contacto a la instantánea');

SET ROLE service_role;
SELECT (get_public_catalog(:'tok_old'))->>'fingerprint' AS fp1 \gset

-- 3. Guardar el MISMO contacto no cambia el contenido público ni la huella.
SELECT catalog_set_contact(:'owner', :'cat_old', 'Fabricio Andree', '+34641457123', 'asesor');
SELECT test_util.ok((get_public_catalog(:'tok_old'))->>'fingerprint' = :'fp1',
  'huella: mismo contacto → misma huella');

-- 4. Editar el contacto cambia la huella y sube la versión.
SELECT version AS v0 FROM catalogs WHERE id = :'cat_old' \gset
SELECT catalog_set_contact(:'owner', :'cat_old', 'Laura Méndez', '+34600111222', 'asesora') AS v1 \gset
SELECT test_util.ok(:'v1'::bigint = :'v0'::bigint + 1, 'editar contacto sube la versión');
SELECT test_util.ok((get_public_catalog(:'tok_old'))->>'fingerprint' <> :'fp1', 'huella: cambia al editar el contacto');
SELECT test_util.ok(
  ((get_public_catalog(:'tok_old'))->'snapshot'->'contact') = '{"name":"Laura Méndez","phone":"+34600111222","role":"asesora"}'::jsonb,
  'instantánea: contacto editado');
-- Un número extranjero en E.164 también vale.
SELECT catalog_set_contact(:'owner', :'cat_old', 'Laura Méndez', '+447700900123', 'asesora');
SELECT test_util.ok((SELECT contact_phone FROM catalogs WHERE id = :'cat_old') = '+447700900123', 'teléfono internacional E.164');

-- 5. Validaciones.
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', ' ', '+34600111222', 'asesor'), 'invalid_contact_name');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', repeat('a', 81), '+34600111222', 'asesor'), 'invalid_contact_name');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', 'laura@agencia.es', '+34600111222', 'asesor'), 'invalid_contact_name');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', 'Laura www.agencia.es', '+34600111222', 'asesor'), 'invalid_contact_name');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', 'Laura 600 111 222', '+34600111222', 'asesor'), 'invalid_contact_name');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', 'Laura', '600 111 222', 'asesor'), 'invalid_contact_phone');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', 'Laura', '+0123456789', 'asesor'), 'invalid_contact_phone');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', 'Laura', NULL, 'asesor'), 'invalid_contact_phone');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', 'Laura', '+34600111222', 'agente'), 'invalid_contact_role');
SELECT test_util.ok((SELECT contact_name FROM catalogs WHERE id = :'cat_old') = 'Laura Méndez', 'validaciones: nada se guarda si falla');

-- 6. Dueño: otro staff, un cliente y un actor nulo → forbidden.
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'staff', :'cat_old', 'Laura', '+34600111222', 'asesor'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'client', :'cat_old', 'Laura', '+34600111222', 'asesor'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(NULL, %L, %L, %L, %L)', :'cat_old', 'Laura', '+34600111222', 'asesor'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_create_v2(%L, %L, NULL, %L, %L, %L)', :'staff', 'X', 'Laura', '+34600111222', 'asesor'), 'forbidden');

-- 7. Nombrar a otra persona NO le da acceso a la HOME.
SELECT catalog_set_contact(:'owner', :'cat_old', 'Otro Staff', '+34600111222', 'asesor');
SELECT test_util.ok((SELECT count(*) FROM home_owners) = 1 AND NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = :'staff'),
  'el asesor nombrado no entra en home_owners');
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'staff', :'cat_old', 'Otro Staff', '+34600111222', 'asesor'), 'forbidden');

-- 8. Crear: catalog_create (firma de 0192, build anterior) guarda los valores
--    por defecto; catalog_create_v2 guarda el contacto elegido y valida.
SELECT catalog_create(:'owner', 'Nuevo por la firma antigua', NULL) AS cat_a \gset
SELECT test_util.ok(
  (SELECT contact_name = 'Fabricio Andree' AND contact_phone = '+34641457123' AND contact_role = 'asesor' FROM catalogs WHERE id = :'cat_a'),
  'catalog_create: contacto por defecto guardado');
SELECT catalog_create_v2(:'owner', 'Nuevo con contacto', 'Intro', 'Laura Méndez', '+34600111222', 'asesora') AS cat_b \gset
SELECT test_util.ok(
  (SELECT contact_name = 'Laura Méndez' AND contact_phone = '+34600111222' AND contact_role = 'asesora' FROM catalogs WHERE id = :'cat_b'),
  'catalog_create_v2: contacto elegido');
SELECT test_util.expect_error(format('SELECT catalog_create_v2(%L, %L, NULL, %L, %L, %L)', :'owner', 'X', 'L', '+34600111222', 'asesor'), 'invalid_contact_name');
SELECT test_util.expect_error(format('SELECT catalog_create_v2(%L, %L, NULL, %L, %L, %L)', :'owner', 'X', 'Laura', '+34', 'asesor'), 'invalid_contact_phone');
SELECT test_util.expect_error(format('SELECT catalog_create_v2(%L, %L, NULL, %L, %L, %L)', :'owner', ' ', 'Laura', '+34600111222', 'asesor'), 'check_violation');
RESET ROLE;
-- Perfil con nombre no válido → el catálogo nace sin nombre (no inventa uno).
UPDATE profiles SET full_name = 'F' WHERE id = :'owner';
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Sin nombre válido', NULL) AS cat_c \gset
SELECT test_util.ok((SELECT contact_name IS NULL AND contact_phone = '+34641457123' FROM catalogs WHERE id = :'cat_c'),
  'catalog_create: perfil sin nombre válido → nombre vacío, no inventado');
RESET ROLE;
UPDATE profiles SET full_name = 'Fabricio Andree' WHERE id = :'owner';

-- 9. Las restricciones protegen también escrituras directas.
SELECT test_util.expect_error(format('UPDATE catalogs SET contact_phone = %L WHERE id = %L', '600111222', :'cat_old'), 'check_violation');
SELECT test_util.expect_error(format('UPDATE catalogs SET contact_role = %L WHERE id = %L', 'jefe', :'cat_old'), 'check_violation');

-- 10. anon y authenticated no pueden llamar a nada nuevo.
SET ROLE anon;
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', 'Laura', '+34600111222', 'asesor'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_create_v2(%L, %L, NULL, %L, %L, %L)', :'owner', 'X', 'Laura', '+34600111222', 'asesor'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_internal_snapshot(%L)', :'cat_old'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT contact_name FROM catalogs WHERE id = %L', :'cat_old'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT catalog_set_contact(%L, %L, %L, %L, %L)', :'owner', :'cat_old', 'Laura', '+34600111222', 'asesor'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_create(%L, %L, NULL)', :'owner', 'X'), 'insufficient_privilege');
RESET ROLE;

-- 11. Las funciones de 0192/0193 siguen funcionando.
SET ROLE service_role;
SELECT catalog_update_meta(:'owner', :'cat_old', 'Título editado', NULL);
SELECT test_util.ok(((get_public_catalog(:'tok_old'))->'snapshot'->>'title') = 'Título editado', '0192/0193 intactas');
RESET ROLE;

\echo 'test-catalog-contact.sql: todo en verde'
