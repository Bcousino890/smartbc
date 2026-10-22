-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-21-bcp-01-ampliacion-textos-idiomas,
-- PR7b). Tests de 0227 (acabado fotográfico por catálogo) en el Postgres
-- temporal: stub + fixtures + 0192–0226 + 0227 (aplicada dos veces) sobre
-- catálogos y enlaces creados ANTES de la migración. Datos 100 % sintéticos.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
\set h3    '00000000-0000-0000-0000-0000000000b8'
\set F 'b8000000-0000-0000-0000-000000000001'
\set G 'b8000000-0000-0000-0000-000000000002'
\set H 'b8000000-0000-0000-0000-000000000003'
\set A 'c8000000-0000-0000-0000-00000000000a'
\set B 'c8000000-0000-0000-0000-00000000000b'
\set C 'c8000000-0000-0000-0000-00000000000c'
\set D 'c8000000-0000-0000-0000-00000000000d'
\set G1 'c8000000-0000-0000-0000-000000000021'
\set H1 'c8000000-0000-0000-0000-000000000031'
SELECT v AS cat   FROM test_util.carry WHERE k = 'fin_cat' \gset
SELECT v AS cat2  FROM test_util.carry WHERE k = 'fin_cat2' \gset
SELECT v AS tok   FROM test_util.carry WHERE k = 'fin_tok' \gset
SELECT v AS ptok  FROM test_util.carry WHERE k = 'fin_ptok' \gset
SELECT v AS tok2  FROM test_util.carry WHERE k = 'fin_tok2' \gset
SELECT v AS fp0   FROM test_util.carry WHERE k = 'fin_fp' \gset
SELECT v AS pfp0  FROM test_util.carry WHERE k = 'fin_pfp' \gset
SELECT v AS fp20  FROM test_util.carry WHERE k = 'fin_fp2' \gset
SELECT v AS snap0 FROM test_util.carry WHERE k = 'fin_snap' \gset
SELECT v AS int0  FROM test_util.carry WHERE k = 'fin_int' \gset
SELECT v AS int20 FROM test_util.carry WHERE k = 'fin_int2' \gset
SELECT v AS mfp0  FROM test_util.carry WHERE k = 'fin_mfp' \gset
SELECT v AS glob0 FROM test_util.carry WHERE k = 'fin_glob' \gset

CREATE OR REPLACE FUNCTION test_util.fin_fp(p_tok text) RETURNS text LANGUAGE sql AS $$
  SELECT (get_public_catalog(p_tok))->>'fingerprint'
$$;
CREATE OR REPLACE FUNCTION test_util.fin_state_fp(p_tok text) RETURNS text LANGUAGE sql AS $$
  SELECT fingerprint FROM get_catalog_states(ARRAY[p_tok])
$$;
CREATE OR REPLACE FUNCTION test_util.fin_snap(p_tok text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT (get_public_catalog(p_tok))->'snapshot'
$$;
CREATE OR REPLACE FUNCTION test_util.fin_item(p_tok text, p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT it FROM jsonb_array_elements((get_public_catalog(p_tok))->'snapshot'->'items') it WHERE it->>'slug' = p_slug
$$;
-- Claves opacas → dos últimas cifras del id, para leerlas.
CREATE OR REPLACE FUNCTION test_util.fin_lbl(p_key text) RETURNS text LANGUAGE sql AS $$
  SELECT right(id::text, 2) FROM property_photos WHERE catalog_photo_key(id) = p_key
$$;
CREATE OR REPLACE FUNCTION test_util.fin_list(p_tok text, p_slug text, p_field text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT string_agg(coalesce(test_util.fin_lbl(x), '?'), ',' ORDER BY coalesce(test_util.fin_lbl(x), '?'))
                     FROM jsonb_array_elements_text(test_util.fin_item(p_tok, p_slug)->'pp'->p_field) x), '')
$$;
CREATE OR REPLACE FUNCTION test_util.fin_ver(p_cat uuid) RETURNS bigint LANGUAGE sql AS $$ SELECT version FROM catalogs WHERE id = p_cat $$;
CREATE OR REPLACE FUNCTION test_util.fin_globals() RETURNS text LANGUAGE sql AS $$
  SELECT md5((SELECT coalesce(string_agg(row_to_json(p)::text, '|' ORDER BY p.id), '') FROM properties p)
          || (SELECT coalesce(string_agg(row_to_json(ph)::text, '|' ORDER BY ph.id), '') FROM property_photos ph))
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_util TO service_role;
INSERT INTO auth.users (id, email) VALUES (:'h3', 'home.cuatro@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES (:'h3', 'admin', 'Home Cuatro', 'home.cuatro@ejemplo.test');
INSERT INTO home_owners (profile_id) VALUES (:'h3');

-- 1. Columna: apagado en TODOS los catálogos existentes y en los nuevos; nunca NULL.
SELECT test_util.ok((SELECT bool_and(photo_finish = false) FROM catalogs) AND (SELECT count(*) FROM catalogs) >= 2, 'photo_finish = false en todos los catálogos existentes');
SELECT test_util.ok((SELECT column_default FROM information_schema.columns WHERE table_name = 'catalogs' AND column_name = 'photo_finish') = 'false'
                AND (SELECT is_nullable FROM information_schema.columns WHERE table_name = 'catalogs' AND column_name = 'photo_finish') = 'NO', 'photo_finish NOT NULL DEFAULT false');
SELECT test_util.expect_error(format('UPDATE catalogs SET photo_finish = NULL WHERE id = %L', :'cat'), 'null value in column "photo_finish" of relation "catalogs" violates not-null constraint');
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Nuevo tras 0227', NULL) AS cat3 \gset
RESET ROLE;
SELECT test_util.ok((SELECT photo_finish FROM catalogs WHERE id = :'cat3') = false, 'un catálogo nuevo nace sin acabado');

-- 2. Desplegar no cambia NADA: instantánea, huellas (general, personal, vigilante y medición) idénticas.
SET ROLE service_role;
SELECT test_util.ok(test_util.fin_fp(:'tok') = :'fp0' AND test_util.fin_fp(:'ptok') = :'pfp0' AND test_util.fin_fp(:'tok2') = :'fp20', 'desplegar 0227: las huellas del general, del personal y del otro catálogo no cambian');
SELECT test_util.ok(md5(test_util.fin_snap(:'tok')::text) = :'snap0', 'desplegar 0227: la instantánea es byte a byte la de antes');
SELECT test_util.ok(md5(catalog_internal_snapshot(:'cat')::text) = :'int0' AND md5(catalog_internal_snapshot(:'cat2')::text) = :'int20', 'desplegar 0227: la instantánea interna (gestión y PDF del dueño) no cambia');
SELECT test_util.ok(test_util.fin_state_fp(:'tok') = :'fp0' AND catalog_public_fingerprint(:'owner', :'cat') = :'mfp0', 'desplegar 0227: vigilante y medición con la misma huella');
SELECT test_util.ok(NOT (test_util.fin_snap(:'tok') ? 'fin'), 'apagado: la instantánea no lleva «fin»');
SELECT test_util.ok(test_util.fin_list(:'tok', 'fin-f', 'x') = '0c' AND test_util.fin_item(:'tok', 'fin-f')->'pp'->>'o' IS NOT NULL, 'los ajustes de E3 (exclusión y apertura) siguen igual');
RESET ROLE;

-- 3. Tipo nuevo en catalog_photo_prefs y CHECK.
SELECT test_util.expect_error(format('INSERT INTO catalog_photo_prefs (catalog_id, property_id, photo_id, kind) VALUES (%L, %L, %L, %L)', :'cat', :'F', :'A', 'otro'), 'check_violation');

-- 4. Permisos: solo service_role; SECURITY INVOKER.
SELECT test_util.ok(NOT has_function_privilege('authenticated', 'catalog_set_photo_finish(uuid,uuid,boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'catalog_set_photo_finish(uuid,uuid,boolean)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'catalog_photo_no_finish(uuid,uuid,uuid,uuid,boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'catalog_photo_no_finish(uuid,uuid,uuid,uuid,boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'catalog_internal_snapshot(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'catalog_set_photo_finish(uuid,uuid,boolean)', 'EXECUTE')
  AND has_function_privilege('service_role', 'catalog_photo_no_finish(uuid,uuid,uuid,uuid,boolean)', 'EXECUTE'),
  'permisos: ni anon ni authenticated; service_role sí');
SELECT test_util.ok((SELECT bool_and(NOT prosecdef) FROM pg_proc WHERE proname IN ('catalog_set_photo_finish', 'catalog_photo_no_finish', 'catalog_internal_snapshot')), 'SECURITY INVOKER');
SELECT test_util.ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'catalog_photo_prefs') AND NOT has_table_privilege('authenticated', 'catalog_photo_prefs', 'SELECT'), 'catalog_photo_prefs sigue con RLS y sin acceso de authenticated');

-- 5. Guarda del dueño.
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_set_photo_finish(%L, %L, true)', :'staff', :'cat'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_photo_finish(%L, %L, true)', :'h3', :'cat'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_photo_finish(NULL, %L, true)', :'cat'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_photo_finish(%L, NULL, true)', :'owner'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_photo_finish(%L, %L, NULL)', :'owner', :'cat'), 'invalid_finish');
SELECT test_util.expect_error(format('SELECT catalog_photo_no_finish(%L, %L, %L, %L, true)', :'h3', :'cat', :'F', :'A'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_photo_no_finish(%L, %L, %L, %L, true)', :'staff', :'cat', :'F', :'A'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_photo_no_finish(%L, %L, %L, %L, true)', :'owner', :'cat', :'H', :'H1'), 'photo_not_in_catalog');
SELECT test_util.expect_error(format('SELECT catalog_photo_no_finish(%L, %L, %L, %L, true)', :'owner', :'cat', :'F', :'G1'), 'invalid_photo');
SELECT test_util.expect_error(format('SELECT catalog_photo_no_finish(%L, %L, %L, NULL, true)', :'owner', :'cat', :'F'), 'invalid_photo');
SELECT test_util.expect_error(format('SELECT catalog_photo_no_finish(%L, %L, %L, %L, NULL)', :'owner', :'cat', :'F', :'A'), 'invalid_photo');
SELECT test_util.ok((SELECT photo_finish FROM catalogs WHERE id = :'cat') = false AND NOT EXISTS (SELECT 1 FROM catalog_photo_prefs WHERE kind = 'no_finish'), 'los intentos rechazados no cambian nada');

-- 6. Marcar «sin acabado» con el acabado APAGADO: sube la versión, pero la instantánea y la huella son las de antes.
SELECT test_util.fin_ver(:'cat') AS v0 \gset
SELECT catalog_photo_no_finish(:'owner', :'cat', :'F', :'A', true) AS r1 \gset
SELECT test_util.ok(:r1 = :v0 + 1 AND test_util.fin_ver(:'cat') = :v0 + 1, 'marcar una foto sube la versión (lectura coherente)');
SELECT test_util.ok(test_util.fin_fp(:'tok') = :'fp0' AND md5(test_util.fin_snap(:'tok')::text) = :'snap0' AND md5(catalog_internal_snapshot(:'cat')::text) = :'int0',
  'apagado: con una foto marcada, la instantánea y la huella siguen IDÉNTICAS (las marcas ni se leen)');
SELECT catalog_photo_no_finish(:'owner', :'cat', :'F', :'A', true) AS r2 \gset
SELECT test_util.ok(:r2 = :v0 + 1, 'marcar otra vez: idempotente, sin subir la versión');

-- 7. Activar: «fin» y pp.n; cambian todas las huellas del catálogo (el vigilante refresca); el otro catálogo no.
SELECT catalog_set_photo_finish(:'owner', :'cat', true) AS r3 \gset
SELECT test_util.ok(:r3 = :v0 + 2 AND (SELECT photo_finish FROM catalogs WHERE id = :'cat'), 'activar sube la versión y guarda photo_finish');
SELECT test_util.ok((test_util.fin_snap(:'tok')->>'fin') = 'true' AND (test_util.fin_snap(:'ptok')->>'fin') = 'true', 'activado: «fin» en el enlace general y en el personal');
SELECT test_util.ok(test_util.fin_fp(:'tok') <> :'fp0' AND test_util.fin_fp(:'ptok') <> :'pfp0', 'activado: cambian las huellas (el vigilante refresca los lectores abiertos)');
SELECT test_util.ok(test_util.fin_state_fp(:'tok') = test_util.fin_fp(:'tok') AND test_util.fin_state_fp(:'ptok') = test_util.fin_fp(:'ptok'), 'get_catalog_states da la misma huella que get_public_catalog');
SELECT test_util.ok(catalog_public_fingerprint(:'owner', :'cat') = test_util.fin_fp(:'tok'), 'la medición (HOME) sigue la huella del general');
SELECT test_util.ok(test_util.fin_list(:'tok', 'fin-f', 'n') = '0a' AND test_util.fin_list(:'tok', 'fin-f', 'x') = '0c', 'activado: pp.n con la foto marcada; pp.x igual');
SELECT test_util.ok(NOT (test_util.fin_item(:'tok', 'fin-g') ? 'pp'), 'una vivienda sin ajustes sigue sin «pp»');
SELECT test_util.ok((catalog_internal_snapshot(:'cat')->>'fin') = 'true', 'la instantánea interna (gestión y PDF del dueño) también lo lleva');
SELECT test_util.ok(test_util.fin_fp(:'tok2') = :'fp20' AND md5(catalog_internal_snapshot(:'cat2')::text) = :'int20', 'el otro catálogo del mismo dueño no cambia');
SELECT catalog_set_photo_finish(:'owner', :'cat', true) AS r4 \gset
SELECT test_util.ok(:r4 = :r3, 'activar otra vez: idempotente');
SELECT test_util.fin_fp(:'tok') AS fp_on \gset

-- 8. Duplicados por URL (B y D son la misma foto) y vuelta a tratar.
SELECT catalog_photo_no_finish(:'owner', :'cat', :'F', :'B', true) AS r5 \gset
SELECT test_util.ok(:r5 = :r3 + 1 AND test_util.fin_list(:'tok', 'fin-f', 'n') = '0a,0b', 'marcar B: pp.n = A, B');
SELECT test_util.ok(test_util.fin_fp(:'tok') <> :'fp_on', 'marcar con el acabado activo cambia la huella');
SELECT catalog_photo_no_finish(:'owner', :'cat', :'F', :'D', true) AS r6 \gset
SELECT test_util.ok(:r6 = :r5 AND (SELECT count(*) FROM catalog_photo_prefs WHERE kind = 'no_finish') = 2, 'D (misma URL que B) ya está marcada: sin cambio');
SELECT catalog_photo_no_finish(:'owner', :'cat', :'F', :'D', false) AS r7 \gset
SELECT test_util.ok(:r7 = :r6 + 1 AND test_util.fin_list(:'tok', 'fin-f', 'n') = '0a', 'volver a tratar D quita la marca de B (misma foto)');
SELECT catalog_photo_no_finish(:'owner', :'cat', :'F', :'D', false) AS r8 \gset
SELECT test_util.ok(:r8 = :r7, 'volver a tratar sin marca: sin cambio');
SELECT test_util.ok(test_util.fin_fp(:'tok') = :'fp_on', 'misma situación, misma huella');

-- 9. E3 sigue igual con marcas presentes: excluir y volver a usar, y la última foto.
SELECT catalog_photo_exclude(:'owner', :'cat', :'F', :'A', true);
SELECT test_util.ok(test_util.fin_list(:'tok', 'fin-f', 'x') = '0a,0c' AND test_util.fin_list(:'tok', 'fin-f', 'n') = '0a', 'excluir una foto marcada: pp.x la incluye y la marca se conserva');
SELECT catalog_photo_exclude(:'owner', :'cat', :'F', :'A', false);
SELECT catalog_photo_no_finish(:'owner', :'cat', :'G', :'G1', true);
SELECT test_util.expect_error(format('SELECT catalog_photo_exclude(%L, %L, %L, %L, true)', :'owner', :'cat', :'G', :'G1'), 'last_photo');
SELECT test_util.ok(test_util.fin_list(:'tok', 'fin-g', 'n') = '21' AND test_util.fin_list(:'tok', 'fin-g', 'x') = '', 'la marca no cuenta como exclusión (E3-1 intacta)');

-- 10. Nada escribe en properties ni en property_photos.
SELECT test_util.ok(test_util.fin_globals() = :'glob0', 'properties y property_photos intactas');

-- 11. Foto que ya no existe: su marca no llega al lector; quitarla limpia el ajuste.
RESET ROLE;
DELETE FROM property_photos WHERE id = :'G1';
INSERT INTO property_photos (id, property_id, url, position, is_cover) VALUES ('c8000000-0000-0000-0000-000000000022', :'G', 'https://storage.example/g-2.webp', 0, true);
SET ROLE service_role;
SELECT test_util.ok(NOT (test_util.fin_item(:'tok', 'fin-g') ? 'pp'), 'la marca de una foto borrada no llega a la instantánea');
SELECT test_util.fin_ver(:'cat') AS v9 \gset
SELECT catalog_photo_no_finish(:'owner', :'cat', :'G', :'G1', false) AS r9 \gset
SELECT test_util.ok(:r9 = :v9 + 1 AND NOT EXISTS (SELECT 1 FROM catalog_photo_prefs WHERE photo_id = :'G1'), 'quitar la marca de una foto que ya no existe limpia el ajuste');
SELECT test_util.expect_error(format('SELECT catalog_photo_no_finish(%L, %L, %L, %L, true)', :'owner', :'cat', :'G', :'G1'), 'invalid_photo');

-- 12. Apagar: vuelve EXACTAMENTE a la instantánea de antes (con marcas guardadas).
SELECT catalog_photo_exclude(:'owner', :'cat', :'F', :'C', true);
RESET ROLE;
DELETE FROM property_photos WHERE id = 'c8000000-0000-0000-0000-000000000022';
INSERT INTO property_photos (id, property_id, url, position, is_cover) VALUES (:'G1', :'G', 'https://storage.example/g-1.webp', 0, true);
SET ROLE service_role;
SELECT catalog_set_photo_finish(:'owner', :'cat', false);
SELECT test_util.ok((SELECT count(*) FROM catalog_photo_prefs WHERE catalog_id = :'cat' AND kind = 'no_finish') = 1, 'apagar conserva las marcas (por si se vuelve a activar)');
SELECT test_util.ok(md5(test_util.fin_snap(:'tok')::text) = :'snap0' AND test_util.fin_fp(:'tok') = :'fp0' AND test_util.fin_fp(:'ptok') = :'pfp0',
  'apagado de nuevo: instantánea y huellas IDÉNTICAS a las de antes de 0227');
SELECT catalog_set_photo_finish(:'owner', :'cat', true);
SELECT test_util.ok(test_util.fin_fp(:'tok') = :'fp_on', 'activado de nuevo: la misma huella que la primera vez (determinista)');
SELECT catalog_set_photo_finish(:'owner', :'cat', false);
RESET ROLE;

-- 13. Borrar el catálogo borra sus marcas (como el resto de ajustes de E3).
SET ROLE service_role;
SELECT catalog_create(:'owner', 'Para borrar', NULL) AS cat4 \gset
SELECT catalog_add_property(:'owner', :'cat4', :'G');
SELECT catalog_photo_no_finish(:'owner', :'cat4', :'G', :'G1', true);
RESET ROLE;
DELETE FROM catalogs WHERE id = :'cat4';
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_photo_prefs WHERE catalog_id = :'cat4'), 'borrar el catálogo borra sus marcas');
\echo 'test-catalog-finish.sql: todo en verde'
