-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-21-bcp-01-ampliacion-textos-idiomas,
-- PR4). Tests de 0223 en el Postgres temporal: stub + fixtures + 0192–0222 +
-- 0223 (aplicada dos veces) sobre un catálogo con enlace general y asignación
-- personal creados ANTES de la migración. Datos 100 % sintéticos.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
\set h2    '00000000-0000-0000-0000-0000000000b9'
\set c3    '00000000-0000-0000-0000-0000000000c3'
\set p1 '10000000-0000-0000-0000-000000000001'
SELECT v AS cat  FROM test_util.carry WHERE k = 't23_cat' \gset
SELECT v AS tok  FROM test_util.carry WHERE k = 't23_tok' \gset
SELECT v AS ptok FROM test_util.carry WHERE k = 't23_ptok' \gset
SELECT v AS fp0  FROM test_util.carry WHERE k = 't23_fp' \gset
SELECT v AS pfp0 FROM test_util.carry WHERE k = 't23_pfp' \gset
SELECT v AS p1h FROM test_util.carry WHERE k = 't23_p1h' \gset

CREATE OR REPLACE FUNCTION test_util.t_lang(p_tok text) RETURNS text LANGUAGE sql AS $$
  SELECT (get_public_catalog(p_tok))->'snapshot'->>'lang'
$$;
CREATE OR REPLACE FUNCTION test_util.t_fp(p_tok text) RETURNS text LANGUAGE sql AS $$
  SELECT (get_public_catalog(p_tok))->>'fingerprint'
$$;
CREATE OR REPLACE FUNCTION test_util.t_state_fp(p_tok text) RETURNS text LANGUAGE sql AS $$
  SELECT fingerprint FROM get_catalog_states(ARRAY[p_tok])
$$;
GRANT EXECUTE ON FUNCTION test_util.t_lang(text), test_util.t_fp(text), test_util.t_state_fp(text) TO service_role;
INSERT INTO auth.users (id, email) VALUES (:'h2', 'home.tres@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES (:'h2', 'admin', 'Home Tres', 'home.tres@ejemplo.test');
INSERT INTO home_owners (profile_id) VALUES (:'h2');

-- 1. Columnas: «es» por defecto en TODOS los catálogos existentes; enlace sin idioma propio.
SELECT test_util.ok((SELECT bool_and(default_lang = 'es') FROM catalogs), 'default_lang = es en todos los catálogos existentes');
SELECT test_util.ok((SELECT bool_and(lang IS NULL) FROM catalog_client_links), 'los enlaces personales existentes no tienen idioma propio');
RESET ROLE;
SELECT test_util.expect_error(format('UPDATE catalogs SET default_lang = %L WHERE id = %L', 'pt', :'cat'), 'check_violation');
SELECT test_util.expect_error(format('UPDATE catalog_client_links SET lang = %L WHERE token = %L', 'xx', :'ptok'), 'check_violation');
SELECT test_util.expect_error(format('UPDATE catalogs SET default_lang = NULL WHERE id = %L', :'cat'), 'null value in column "default_lang" of relation "catalogs" violates not-null constraint');

-- 2. La instantánea lleva el idioma del token y entra en la huella.
SET ROLE service_role;
SELECT test_util.ok(test_util.t_lang(:'tok') = 'es' AND test_util.t_lang(:'ptok') = 'es', 'instantánea con «lang» = es en el general y en el personal');
SELECT test_util.ok(test_util.t_fp(:'tok') <> :'fp0', 'desplegar cambia la huella una vez (la instantánea gana «lang»)');
SELECT test_util.ok(test_util.t_fp(:'tok') = test_util.t_fp(:'ptok'), 'mismo idioma: el enlace general y el personal comparten huella');
SELECT test_util.ok(test_util.t_state_fp(:'tok') = test_util.t_fp(:'tok') AND test_util.t_state_fp(:'ptok') = test_util.t_fp(:'ptok'), 'get_catalog_states da la misma huella que get_public_catalog');
SELECT test_util.ok(catalog_public_fingerprint(:'owner', :'cat') = test_util.t_fp(:'tok'), 'la huella de la medición (HOME) es la del enlace general');
SELECT test_util.t_fp(:'tok') AS fp_es \gset

-- 3. Idioma del catálogo: cambia la instantánea y la huella del general y del personal sin idioma propio.
SELECT version AS v0 FROM catalogs WHERE id = :'cat' \gset
SELECT catalog_set_default_lang(:'owner', :'cat', 'en');
SELECT test_util.ok(test_util.t_lang(:'tok') = 'en' AND test_util.t_lang(:'ptok') = 'en', 'default_lang = en: los dos enlaces lo reciben');
SELECT test_util.ok(test_util.t_fp(:'tok') <> :'fp_es' AND test_util.t_state_fp(:'tok') = test_util.t_fp(:'tok'), 'cambiar el idioma del catálogo cambia la huella (vigilante incluido)');
SELECT test_util.ok((SELECT version FROM catalogs WHERE id = :'cat') = :v0 + 1, 'cambiar el idioma sube la versión (lectura coherente)');
SELECT catalog_set_default_lang(:'owner', :'cat', 'en');
SELECT test_util.ok((SELECT version FROM catalogs WHERE id = :'cat') = :v0 + 1, 'el mismo idioma otra vez: idempotente, sin subir la versión');
SELECT test_util.ok(catalog_public_fingerprint(:'owner', :'cat') = test_util.t_fp(:'tok'), 'medición: sigue la huella del general en el idioma nuevo');
SELECT test_util.t_fp(:'tok') AS fp_en \gset

-- 4. DA17: idioma propio del enlace personal; no afecta al general ni al catálogo.
SELECT id AS link FROM catalog_client_links WHERE token = :'ptok' \gset
SELECT catalog_client_link_set_lang(:'owner', :'link', 'ar');
SELECT test_util.ok(test_util.t_lang(:'ptok') = 'ar', 'enlace personal en árabe');
SELECT test_util.ok(test_util.t_lang(:'tok') = 'en' AND test_util.t_fp(:'tok') = :'fp_en', 'el enlace general sigue en inglés con su misma huella');
SELECT test_util.ok((SELECT default_lang FROM catalogs WHERE id = :'cat') = 'en', 'el catálogo sigue con su idioma');
SELECT test_util.ok(test_util.t_fp(:'ptok') <> :'fp_en' AND test_util.t_state_fp(:'ptok') = test_util.t_fp(:'ptok'), 'el personal cambia de huella y el vigilante la ve');
-- Otra asignación del mismo catálogo: hereda el del catálogo, no el de la primera.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000c7', 'c7@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES ('00000000-0000-0000-0000-0000000000c7', 'client', 'Cliente Siete', 'c7@ejemplo.test');
SELECT token AS ptok2 FROM catalog_client_link_create(:'owner', :'cat', '00000000-0000-0000-0000-0000000000c7', 60) \gset
SELECT test_util.ok(test_util.t_lang(:'ptok2') = 'en' AND test_util.t_fp(:'ptok2') = :'fp_en', 'otra asignación del catálogo: el del catálogo, con la huella del general');
-- Volver al del catálogo (NULL).
SELECT catalog_client_link_set_lang(:'owner', :'link', NULL);
SELECT test_util.ok(test_util.t_lang(:'ptok') = 'en' AND test_util.t_fp(:'ptok') = :'fp_en', 'NULL: el personal vuelve al idioma del catálogo y a su huella');
-- Los ocho idiomas se aceptan; la lista es la de 0130/0134.
SELECT catalog_client_link_set_lang(:'owner', :'link', l) FROM unnest(ARRAY['es','en','fr','it','de','ar','tr','he']) AS l;
SELECT test_util.ok(test_util.t_lang(:'ptok') = 'he', 'los ocho idiomas se aceptan (el último, hebreo)');
SELECT catalog_set_default_lang(:'owner', :'cat', 'es');

-- 5. Validaciones y permisos.
SELECT test_util.expect_error(format('SELECT catalog_set_default_lang(%L, %L, %L)', :'owner', :'cat', 'pt'), 'invalid_lang');
SELECT test_util.expect_error(format('SELECT catalog_set_default_lang(%L, %L, NULL)', :'owner', :'cat'), 'invalid_lang');
SELECT test_util.expect_error(format('SELECT catalog_client_link_set_lang(%L, %L, %L)', :'owner', :'link', 'xx'), 'invalid_lang');
SELECT test_util.expect_error(format('SELECT catalog_set_default_lang(%L, %L, %L)', :'staff', :'cat', 'en'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_default_lang(%L, %L, %L)', :'h2', :'cat', 'en'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_client_link_set_lang(%L, %L, %L)', :'h2', :'link', 'en'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_client_link_set_lang(%L, %L, %L)', :'owner', '00000000-0000-0000-0000-0000000000ff', 'en'), 'link_not_found');
SELECT catalog_client_link_revoke(:'owner', :'link');
SELECT test_util.expect_error(format('SELECT catalog_client_link_set_lang(%L, %L, %L)', :'owner', :'link', 'en'), 'link_revoked');
SELECT test_util.ok((get_public_catalog(:'ptok'))->>'valid' = 'false', 'revocado: el personal deja de abrir (como antes)');
RESET ROLE;
SET ROLE anon;
SELECT test_util.expect_error(format('SELECT catalog_set_default_lang(%L, %L, %L)', :'owner', :'cat', 'en'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_lang_snapshot(%L, %L)', :'cat', 'en'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT get_public_catalog(%L)', :'tok'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT catalog_client_link_set_lang(%L, %L, %L)', :'owner', :'link', 'en'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_set_default_lang(%L, %L, %L)', :'owner', :'cat', 'en'), 'insufficient_privilege');
RESET ROLE;

-- 6. La ficha del CRM no cambia; el catálogo vuelve a «es» con su huella de 2.
SET ROLE service_role;
SELECT test_util.ok(test_util.t_lang(:'tok') = 'es' AND test_util.t_fp(:'tok') = :'fp_es', 'de vuelta a es: la misma huella que al desplegar');
RESET ROLE;
SELECT test_util.ok((SELECT md5(row_to_json(p)::text) FROM properties p WHERE id = :'p1') = :'p1h', 'la ficha del CRM no cambia');
