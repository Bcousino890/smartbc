-- SOLO PRUEBAS LOCALES (BCP-01 E3, 0202). Ajustes de fotos por catálogo con
-- las funciones reales. Resultados escritos a mano a partir de E3-1…E3-7 y
-- D-QA19. Datos de test-catalog-photos-pre.sql.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set other '00000000-0000-0000-0000-0000000000a2'
\set P 'b7000000-0000-0000-0000-000000000001'
\set Q 'b7000000-0000-0000-0000-000000000002'
\set R 'b7000000-0000-0000-0000-000000000003'
\set S 'b7000000-0000-0000-0000-000000000004'
\set A 'c7000000-0000-0000-0000-00000000000a'
\set B 'c7000000-0000-0000-0000-00000000000b'
\set C 'c7000000-0000-0000-0000-00000000000c'
\set D 'c7000000-0000-0000-0000-00000000000d'
\set E 'c7000000-0000-0000-0000-00000000000e'
\set Q1 'c7000000-0000-0000-0000-000000000021'
\set R1 'c7000000-0000-0000-0000-000000000031'
\set S1 'c7000000-0000-0000-0000-000000000041'
SELECT v AS cat FROM test_util.carry WHERE k = 'e3_cat' \gset
SELECT v AS tok FROM test_util.carry WHERE k = 'e3_tok' \gset
SELECT v AS fp_pre FROM test_util.carry WHERE k = 'e3_fp_pre' \gset

CREATE OR REPLACE FUNCTION test_util.e3_item(p_tok text, p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT it FROM jsonb_array_elements((get_public_catalog(p_tok))->'snapshot'->'items') it WHERE it->>'slug' = p_slug
$$;
-- Las claves opacas se traducen a las dos últimas cifras del id para leerlas.
CREATE OR REPLACE FUNCTION test_util.e3_lbl(p_key text) RETURNS text LANGUAGE sql AS $$
  SELECT right(id::text, 2) FROM property_photos WHERE catalog_photo_key(id) = p_key
$$;
CREATE OR REPLACE FUNCTION test_util.e3_x(p_tok text, p_slug text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT string_agg(test_util.e3_lbl(x), ',' ORDER BY test_util.e3_lbl(x)) FROM jsonb_array_elements_text(test_util.e3_item(p_tok, p_slug)->'pp'->'x') x), '')
$$;
CREATE OR REPLACE FUNCTION test_util.e3_o(p_tok text, p_slug text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(test_util.e3_lbl(test_util.e3_item(p_tok, p_slug)->'pp'->>'o'), '')
$$;
CREATE OR REPLACE FUNCTION test_util.e3_ver(p_cat uuid) RETURNS bigint LANGUAGE sql AS $$ SELECT version FROM catalogs WHERE id = p_cat $$;
CREATE OR REPLACE FUNCTION test_util.e3_globals() RETURNS text LANGUAGE sql AS $$
  SELECT md5((SELECT coalesce(string_agg(row_to_json(p)::text, '|' ORDER BY p.id), '') FROM properties p)
          || (SELECT coalesce(string_agg(row_to_json(ph)::text, '|' ORDER BY ph.id), '') FROM property_photos ph))
$$;

-- N2: la instantánea lleva el id de cada foto y la huella cambia una vez; sin ajustes no hay 'pp'.
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fp_pre', 'N2: la huella cambia una vez al aplicar 0202 (fotos con clave «f»)');
SELECT test_util.ok((test_util.e3_item(:'tok', 'ph-p')->'photos'->0->>'f') = left(md5('catalog-photo:' || :'A'), 16)
  AND (test_util.e3_item(:'tok', 'ph-p')->'photos'->0->>'f') ~ '^[0-9a-f]{16}$', 'cada foto lleva su clave opaca «f» (16 hex)');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') it, jsonb_array_elements(it->'photos') ph
                                 WHERE ph::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-' OR ph::text LIKE '%storage.example%'),
  'la instantánea no lleva ids ni URLs de las fotos');
SELECT test_util.ok(NOT (test_util.e3_item(:'tok', 'ph-p') ? 'pp'), 'sin ajustes, ninguna vivienda lleva «pp»');

-- Permisos: solo service_role.
SELECT test_util.ok(NOT has_function_privilege('authenticated', 'catalog_photo_exclude(uuid,uuid,uuid,uuid,boolean)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'catalog_photo_opening(uuid,uuid,uuid,uuid)', 'EXECUTE')
  AND NOT has_table_privilege('authenticated', 'catalog_photo_prefs', 'SELECT')
  AND NOT has_table_privilege('anon', 'catalog_photo_prefs', 'SELECT')
  AND (SELECT relrowsecurity FROM pg_class WHERE relname = 'catalog_photo_prefs'),
  'permisos: ni anon ni authenticated; RLS activada');
SELECT test_util.ok((SELECT prosecdef FROM pg_proc WHERE proname = 'catalog_photo_exclude') = false
  AND (SELECT prosecdef FROM pg_proc WHERE proname = 'catalog_photo_opening') = false, 'SECURITY INVOKER');

SET ROLE service_role;
-- Guardas.
SELECT test_util.expect_error(format('SELECT catalog_photo_exclude(%L, %L, %L, %L, true)', :'other', :'cat', :'P', :'B'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_photo_exclude(%L, %L, %L, %L, true)', :'owner', :'cat', :'S', :'S1'), 'photo_not_in_catalog');
SELECT test_util.expect_error(format('SELECT catalog_photo_exclude(%L, %L, %L, %L, true)', :'owner', :'cat', :'P', :'S1'), 'invalid_photo');
SELECT test_util.expect_error(format('SELECT catalog_photo_opening(%L, %L, %L, %L)', :'owner', :'cat', :'P', :'S1'), 'invalid_photo');
RESET ROLE;

SELECT test_util.e3_globals() AS g0 \gset
SELECT test_util.e3_ver(:'cat') AS v0 \gset
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp0 \gset
SET ROLE service_role;
SELECT catalog_photo_exclude(:'owner', :'cat', :'P', :'B', true) AS v1 \gset
RESET ROLE;
SELECT test_util.ok(:'v1'::bigint = :'v0'::bigint + 1, 'excluir B sube la versión en 1');
SELECT test_util.ok(test_util.e3_x(:'tok', 'ph-p') = '0b', 'pp.x = B · ' || test_util.e3_x(:'tok', 'ph-p'));
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fp0', 'la huella cambia con el ajuste (D12)');
SET ROLE service_role;
SELECT catalog_photo_exclude(:'owner', :'cat', :'P', :'E', true) AS v2 \gset
RESET ROLE;
SELECT test_util.ok(:'v2'::bigint = :'v1'::bigint, 'E tiene la misma URL que B: ya está excluida, sin cambio');
SET ROLE service_role;
SELECT catalog_photo_exclude(:'owner', :'cat', :'P', :'A', true);
SELECT catalog_photo_exclude(:'owner', :'cat', :'P', :'C', true);
-- E3-1: en uso solo queda D.
SELECT test_util.expect_error(format('SELECT catalog_photo_exclude(%L, %L, %L, %L, true)', :'owner', :'cat', :'P', :'D'), 'last_photo');
SELECT test_util.expect_error(format('SELECT catalog_photo_exclude(%L, %L, %L, %L, true)', :'owner', :'cat', :'Q', :'Q1'), 'last_photo');
-- E3-2: una excluida no se elige de apertura.
SELECT test_util.expect_error(format('SELECT catalog_photo_opening(%L, %L, %L, %L)', :'owner', :'cat', :'P', :'A'), 'photo_excluded');
SELECT catalog_photo_opening(:'owner', :'cat', :'P', :'D');
RESET ROLE;
SELECT test_util.ok(test_util.e3_x(:'tok', 'ph-p') = '0a,0b,0c' AND test_util.e3_o(:'tok', 'ph-p') = '0d', 'pp: excluidas A, B y C; apertura D');
SET ROLE service_role;
SELECT catalog_photo_exclude(:'owner', :'cat', :'P', :'C', false);
-- Excluir la apertura elegida: se permite (queda C) y vuelve a la automática.
SELECT catalog_photo_exclude(:'owner', :'cat', :'P', :'D', true);
RESET ROLE;
SELECT test_util.ok(test_util.e3_x(:'tok', 'ph-p') = '0a,0b,0d' AND test_util.e3_o(:'tok', 'ph-p') = '', 'excluir la apertura elegida la devuelve a la automática · x=' || test_util.e3_x(:'tok', 'ph-p'));
SET ROLE service_role;
SELECT catalog_photo_exclude(:'owner', :'cat', :'P', :'E', false);
RESET ROLE;
SELECT test_util.ok(test_util.e3_x(:'tok', 'ph-p') = '0a,0d', 'volver a usar E devuelve también B (misma URL)');
SELECT test_util.ok(test_util.e3_globals() = :'g0', 'ninguna escritura en properties ni property_photos');

-- Reordenar y realojar conservan los ajustes (mismo id).
UPDATE property_photos SET position = 9 - position WHERE property_id = :'P';
UPDATE property_photos SET url = 'https://storage.example/p-a-realojada.webp' WHERE id = :'A';
SELECT test_util.ok(test_util.e3_x(:'tok', 'ph-p') = '0a,0d', 'reordenar y realojar: los ajustes siguen (por id)');
-- Borrar D: deja de llegar al lector, pero el ajuste sigue en la tabla (avisos de E3-5).
DELETE FROM property_photos WHERE id = :'D';
SELECT test_util.ok(test_util.e3_x(:'tok', 'ph-p') = '0a', 'D borrada: la instantánea solo lleva ajustes de fotos que existen');
SELECT test_util.ok((SELECT count(*) FROM catalog_photo_prefs pp WHERE pp.catalog_id = :'cat' AND pp.property_id = :'P'
                     AND NOT EXISTS (SELECT 1 FROM property_photos ph WHERE ph.id = pp.photo_id)) = 1,
  'el ajuste de la foto borrada sigue en la tabla: la gestión puede avisar');
SET ROLE service_role;
SELECT test_util.e3_ver(:'cat') AS v3 \gset
SELECT catalog_photo_exclude(:'owner', :'cat', :'P', :'D', false) AS v4 \gset
RESET ROLE;
SELECT test_util.ok(:'v4'::bigint = :'v3'::bigint + 1 AND (SELECT count(*) FROM catalog_photo_prefs WHERE photo_id = :'D') = 0,
  '«volver a usar» una foto que ya no existe limpia su ajuste');
-- Reimportar: filas nuevas (ids nuevos). Los ajustes viejos ya no aplican y las fotos se ven todas.
DELETE FROM property_photos WHERE property_id = :'P';
INSERT INTO property_photos (property_id, url, position, is_cover) VALUES
  (:'P', 'https://storage.example/p-a.webp', 0, true), (:'P', 'https://storage.example/p-b.webp', 1, false);
SELECT test_util.ok(NOT (test_util.e3_item(:'tok', 'ph-p') ? 'pp') AND jsonb_array_length(test_util.e3_item(:'tok', 'ph-p')->'photos') = 2,
  'reimportar: sin «pp» y todas las fotos visibles (E3-5)');
SELECT test_util.ok((SELECT count(*) FROM catalog_photo_prefs pp WHERE pp.catalog_id = :'cat' AND pp.property_id = :'P'
                     AND NOT EXISTS (SELECT 1 FROM property_photos ph WHERE ph.id = pp.photo_id)) = 1,
  'reimportar: el ajuste que ya no aplica sigue para el aviso');

-- La vivienda sale de la lista y vuelve: el ajuste se conserva y vuelve a aplicarse.
SET ROLE service_role;
SELECT catalog_photo_exclude(:'owner', :'cat', :'R', :'R1', true);
SELECT catalog_remove_item(:'owner', :'cat', :'R');
RESET ROLE;
SELECT test_util.ok(test_util.e3_item(:'tok', 'ph-r') IS NULL, 'R fuera de la lista');
SELECT test_util.expect_error(format('SELECT catalog_photo_exclude(%L, %L, %L, %L, false)', :'owner', :'cat', :'R', :'R1'), 'photo_not_in_catalog');
SET ROLE service_role;
SELECT catalog_add_property(:'owner', :'cat', :'R');
RESET ROLE;
SELECT test_util.ok(test_util.e3_x(:'tok', 'ph-r') = '31', 'R vuelve y su exclusión se aplica otra vez');
SET ROLE service_role;
SELECT catalog_photo_exclude(:'owner', :'cat', :'R', :'R1', false);
RESET ROLE;

DROP FUNCTION test_util.e3_x(text, text);
DROP FUNCTION test_util.e3_o(text, text);
DROP FUNCTION test_util.e3_globals();
DROP FUNCTION test_util.e3_lbl(text);
\echo 'test-catalog-photos.sql: todo en verde'
