-- ============================================================================
-- SOLO PRUEBAS LOCALES (BCP-01 ampliación C1). Tests de 0196 en el Postgres
-- temporal: stub + fixtures + 0192–0195 + catálogos previos + 0196 (aplicada
-- dos veces). Datos 100 % sintéticos (test-catalog-adjust-pre.sql).
--
-- Catálogo automático: venta · Tetuán · hasta 1.000.000 € · máximo 3.
--   Coincidencias: d1 500k, d2 600k, d3 700k, d4 800k (reservada).
--   Fuera: d5 Chamberí, d6 sin foto, d7/d8 alquiler, d9 vendida, d10 Chile,
--          d11 archivada, d12 1,5M.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
SELECT v AS cat_m FROM test_util.carry WHERE k = 'c1_cat_m' \gset
SELECT v AS tok_m FROM test_util.carry WHERE k = 'c1_tok_m' \gset
SELECT v AS cat   FROM test_util.carry WHERE k = 'c1_cat_a' \gset
SELECT v AS tok   FROM test_util.carry WHERE k = 'c1_tok_a' \gset
SELECT v AS fp_m  FROM test_util.carry WHERE k = 'c1_fp_m'  \gset
SELECT v AS fp_a  FROM test_util.carry WHERE k = 'c1_fp_a'  \gset

-- Ayudas: la lista efectiva (slugs en orden) y la instantánea pública.
CREATE OR REPLACE FUNCTION test_util.c1_list(p_cat uuid) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(p.slug ORDER BY s.ord), '{}')
    FROM catalog_select(p_cat, (SELECT criteria FROM catalogs WHERE id = p_cat)) s
    JOIN properties p ON p.id = s.property_id
$$;
CREATE OR REPLACE FUNCTION test_util.c1_via(p_cat uuid) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(p.slug || ':' || s.via ORDER BY s.ord), '{}')
    FROM catalog_select(p_cat, (SELECT criteria FROM catalogs WHERE id = p_cat)) s
    JOIN properties p ON p.id = s.property_id
$$;
CREATE OR REPLACE FUNCTION test_util.c1_snap_slugs(p_tok text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(x->>'slug' ORDER BY o), '{}')
    FROM jsonb_array_elements((get_public_catalog(p_tok))->'snapshot'->'items') WITH ORDINALITY AS t(x, o)
$$;
GRANT EXECUTE ON FUNCTION test_util.c1_list(uuid), test_util.c1_via(uuid), test_util.c1_snap_slugs(text) TO service_role;

-- 0. Compatibilidad: sin ajustes ni portada, nada cambia.
SELECT test_util.ok((get_public_catalog(:'tok_m'))->>'fingerprint' = :'fp_m', 'compatibilidad: 0196 no cambia la huella de un catálogo manual');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp_a', 'compatibilidad: 0196 no cambia la huella de un automático sin ajustes');
SELECT test_util.ok(NOT ((get_public_catalog(:'tok'))->'snapshot' ? 'cover') AND NOT ((get_public_catalog(:'tok_m'))->'snapshot' ? 'cover'),
  'instantánea sin portada elegida: sin clave «cover»');
SELECT test_util.ok((SELECT cover_property_id IS NULL AND cover_photo_id IS NULL FROM catalogs WHERE id = :'cat'), 'catálogos existentes sin portada elegida');

SET ROLE service_role;
SELECT test_util.ok(test_util.c1_list(:'cat') = ARRAY['d1', 'd2', 'd3'], 'base: las 3 primeras de 4 coincidencias');
SELECT test_util.ok((SELECT bool_and(total = 4 AND matched = 4 AND via = 'match') FROM catalog_select(:'cat', (SELECT criteria FROM catalogs WHERE id = :'cat'))),
  'base: total 4, coinciden 4, todas por criterios');
SELECT (SELECT jsonb_object_agg(p.slug, s.public_key) FROM catalog_select(:'cat', (SELECT criteria FROM catalogs WHERE id = :'cat')) s
          JOIN properties p ON p.id = s.property_id) AS keys0 \gset

-- 1. Exclusión antes del máximo: la siguiente coincidencia ocupa la plaza.
SELECT version AS v0 FROM catalogs WHERE id = :'cat' \gset
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000001', 'exclude') AS v1 \gset
SELECT test_util.ok(:v1 = :v0 + 1, 'excluir sube la versión');
SELECT test_util.ok(test_util.c1_list(:'cat') = ARRAY['d2', 'd3', 'd4'], 'exclusión: d1 sale y entra d4 (relleno)');
SELECT test_util.ok((SELECT DISTINCT matched FROM catalog_select(:'cat', (SELECT criteria FROM catalogs WHERE id = :'cat'))) = 3,
  'exclusión: coinciden 3');
SELECT test_util.ok(test_util.c1_snap_slugs(:'tok') = ARRAY['d2', 'd3', 'd4'] AND (get_public_catalog(:'tok'))->>'fingerprint' <> :'fp_a',
  'exclusión: el lector recibe la lista nueva (huella nueva)');
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000001', 'exclude') AS v1b \gset
SELECT test_util.ok(:v1b = :v1, 'mismo ajuste otra vez: no cambia nada (ni la versión)');
-- Excluir una vivienda que no está en la lista no cambia el contenido público.
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp_x \gset
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000012', 'exclude');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp_x', 'excluir una que no estaba: huella igual (sin cambio público)');
SELECT catalog_adjust_clear(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000012');

-- 2. Inclusiones: plaza asegurada, mezcladas en el orden de los criterios.
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000005', 'include');
SELECT test_util.ok(test_util.c1_via(:'cat') = ARRAY['d5:include', 'd2:match', 'd3:match'],
  'inclusión fuera de zona: entra mezclada por precio (550k) y la última coincidencia cede su plaza');
SELECT test_util.ok((SELECT DISTINCT total FROM catalog_select(:'cat', (SELECT criteria FROM catalogs WHERE id = :'cat'))) = 4
  AND (SELECT DISTINCT matched FROM catalog_select(:'cat', (SELECT criteria FROM catalogs WHERE id = :'cat'))) = 3,
  'recuentos: 3 coincidencias + 1 inclusión fuera de criterios = 4');
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000006', 'include');
SELECT test_util.ok(test_util.c1_via(:'cat') = ARRAY['d5:include', 'd2:match', 'd6:include'], 'inclusión SIN foto: entra (650k) en su sitio');
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000007', 'include');
SELECT test_util.ok(test_util.c1_via(:'cat') = ARRAY['d5:include', 'd6:include', 'd7:include'],
  'otra operación (alquiler en un catálogo de venta): grupo posterior; las inclusiones llenan el máximo');
-- Bloqueos del máximo.
SELECT test_util.expect_error(format('SELECT catalog_adjust(%L, %L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000008', 'include'), 'too_many_inclusions');
SELECT test_util.expect_error(format('SELECT catalog_set_criteria(%L, %L, %L)', :'owner', :'cat',
  '{"operation":"sale","zones":[{"kind":"district","name":"Tetuán"}],"price_max":1000000,"max":2}'), 'max_below_inclusions');
SELECT test_util.ok((SELECT criteria->>'max' FROM catalogs WHERE id = :'cat') = '3', 'el máximo bloqueado no se guarda');
SELECT catalog_set_criteria(:'owner', :'cat', '{"operation":"sale","zones":[{"kind":"district","name":"Tetuán"}],"price_max":1000000,"max":5}');
SELECT test_util.ok(test_util.c1_via(:'cat') = ARRAY['d5:include', 'd2:match', 'd6:include', 'd3:match', 'd7:include'],
  'máximo 5: 3 inclusiones + las 2 mejores coincidencias, todo en orden');
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000008', 'include');
SELECT test_util.ok(test_util.c1_via(:'cat') = ARRAY['d5:include', 'd2:match', 'd6:include', 'd8:include', 'd7:include'],
  'grupo de otra operación ordenado por su propio importe (1.500 antes que 2.000 €/mes), nunca mezclado con precios de venta');
-- No se pueden incluir: vendida, archivada, fuera de España.
SELECT test_util.expect_error(format('SELECT catalog_adjust(%L, %L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000009', 'include'), 'property_not_available');
SELECT test_util.expect_error(format('SELECT catalog_adjust(%L, %L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000011', 'include'), 'property_not_available');
SELECT test_util.expect_error(format('SELECT catalog_adjust(%L, %L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000010', 'include'), 'property_not_es');
SELECT test_util.expect_error(format('SELECT catalog_adjust(%L, %L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-0000000000ff', 'include'), 'property_not_found');
SELECT test_util.expect_error(format('SELECT catalog_adjust(%L, %L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000002', 'pin'), 'invalid_adjustment');
-- Incluir una que ya coincide: una sola vez («both»).
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000002', 'include');
SELECT test_util.ok(test_util.c1_via(:'cat') = ARRAY['d5:include', 'd2:both', 'd6:include', 'd8:include', 'd7:include'],
  'incluir una que ya coincide: aparece una vez (sin duplicados)');
SELECT test_util.ok((SELECT count(*) = count(DISTINCT property_id) AND count(DISTINCT public_key) = count(*)
                       FROM catalog_select(:'cat', (SELECT criteria FROM catalogs WHERE id = :'cat'))), 'sin duplicados de vivienda ni de clave');
-- Quitar la inclusión: vuelve a seguir los criterios (coincide, así que sigue).
SELECT catalog_adjust_clear(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000002');
SELECT test_util.ok(test_util.c1_via(:'cat') = ARRAY['d5:include', 'd2:match', 'd6:include', 'd8:include', 'd7:include'],
  'quitar la inclusión: sigue por criterios');
SELECT test_util.expect_error(format('SELECT catalog_adjust_clear(%L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000002'), 'adjustment_not_found');
-- Excluir una incluida sustituye la inclusión; «Volver a permitir» la devuelve a los criterios.
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000005', 'exclude');
SELECT test_util.ok((SELECT kind FROM catalog_adjustments WHERE catalog_id = :'cat' AND property_id = 'd0000000-0000-0000-0000-000000000005') = 'exclude'
  AND NOT ('d5' = ANY (test_util.c1_list(:'cat'))), 'excluir una incluida: un solo ajuste (exclusión) y sale');
SELECT catalog_adjust_clear(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000005');
SELECT test_util.ok(NOT ('d5' = ANY (test_util.c1_list(:'cat'))), 'volver a permitir una que no coincide: sigue fuera (criterios)');
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000005', 'include');

-- 3. Inclusión que deja de estar disponible: sale, libera su plaza y el ajuste se conserva.
RESET ROLE;
SELECT test_util.ok(catalog_available_inclusions(:'cat') = 4, '4 inclusiones disponibles (d5, d6, d7, d8)');
UPDATE properties SET status = 'sold' WHERE slug = 'd6';
SELECT test_util.ok(NOT ('d6' = ANY (test_util.c1_list(:'cat'))) AND test_util.c1_list(:'cat') = ARRAY['d5', 'd2', 'd3', 'd8', 'd7']
  AND catalog_available_inclusions(:'cat') = 3
  AND EXISTS (SELECT 1 FROM catalog_adjustments WHERE catalog_id = :'cat' AND property_id = 'd0000000-0000-0000-0000-000000000006'),
  'inclusión vendida: sale, su plaza la ocupa otra coincidencia y el ajuste se conserva');
-- Caso límite: vuelve a estar disponible cuando ya no cabe (inclusiones > máximo).
SET ROLE service_role;
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000002', 'include');
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000003', 'include');
RESET ROLE;
UPDATE properties SET status = 'available' WHERE slug = 'd6';
SELECT test_util.ok(catalog_available_inclusions(:'cat') = 6 AND test_util.c1_via(:'cat') = ARRAY['d5:include', 'd2:both', 'd6:include', 'd3:both', 'd8:include'],
  'inclusiones disponibles (6) > máximo (5): entran las primeras en el orden, nunca más que el máximo');
SET ROLE service_role;
SELECT catalog_adjust_clear(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000002');
SELECT catalog_adjust_clear(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000003');
SELECT test_util.ok(test_util.c1_via(:'cat') = ARRAY['d5:include', 'd2:match', 'd6:include', 'd8:include', 'd7:include'], 'de vuelta a 4 inclusiones');

-- 4. Claves estables y opacas.
SELECT test_util.ok((SELECT bool_and(s.public_key = (:'keys0'::jsonb)->>p.slug)
                       FROM catalog_select(:'cat', (SELECT criteria FROM catalogs WHERE id = :'cat')) s
                       JOIN properties p ON p.id = s.property_id WHERE p.slug IN ('d2', 'd3')),
  'claves estables: d2 y d3 conservan su clave tras excluir, incluir y rellenar');
SELECT test_util.ok((SELECT bool_and(char_length(x->>'key') = 16) FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') x),
  'claves opacas de 16 caracteres');

-- 5. La instantánea no lleva nada de los ajustes.
SELECT ((get_public_catalog(:'tok'))->'snapshot')::text AS snap \gset
SELECT test_util.ok(:'snap' !~ '"(via|matched|kind|adjustment|include|exclude|criteria)"', 'instantánea sin datos de ajustes ni criterios');
SELECT test_util.ok(:'snap' !~* '[0-9a-f]{8}-[0-9a-f]{4}-', 'instantánea sin UUID');

-- 6. Gestión: vista previa, búsqueda y recuentos.
SELECT test_util.ok((SELECT array_agg(via ORDER BY ord) FROM catalog_auto_preview(:'owner', :'cat', NULL)) = ARRAY['include', 'match', 'include', 'include', 'include'],
  'vista previa con los ajustes');
SELECT test_util.ok((SELECT array_agg(p.slug ORDER BY s.ord) FROM catalog_auto_preview(:'owner', :'cat',
                       '{"operation":"sale","zones":[{"kind":"district","name":"Tetuán"}],"price_max":1000000,"max":5,"sort":"price_desc"}') s
                       JOIN properties p ON p.id = s.property_id) = ARRAY['d4', 'd6', 'd5', 'd7', 'd8'],
  'vista previa con criterios sin guardar (precio descendente): los ajustes se aplican y el otro grupo sigue al final');
SELECT test_util.ok((SELECT s.adjustment FROM catalog_property_search(:'owner', :'cat', '{"operation":"sale","zones":[{"kind":"district","name":"Chamberí"}]}', NULL, 10, 0) s
                       WHERE s.property_id = 'd0000000-0000-0000-0000-000000000005') = 'include'
  AND (SELECT s.in_catalog FROM catalog_property_search(:'owner', :'cat', '{"operation":"sale","zones":[{"kind":"district","name":"Chamberí"}]}', NULL, 10, 0) s
                       WHERE s.property_id = 'd0000000-0000-0000-0000-000000000005'),
  'búsqueda fuera de criterios: marca el ajuste y «ya está» según la lista efectiva');
SELECT test_util.ok((SELECT s.in_catalog FROM catalog_property_search(:'owner', :'cat', '{}', 'BC-7001', 10, 0) s) = false
  AND (SELECT s.adjustment FROM catalog_property_search(:'owner', :'cat', '{}', 'BC-7001', 10, 0) s) = 'exclude',
  'búsqueda: una excluida aparece como excluida y fuera de la lista');
SELECT test_util.ok((catalog_mode_preview(:'owner', :'cat', 'manual')->>'auto_matched')::int = 3
  AND (catalog_mode_preview(:'owner', :'cat', 'manual')->>'auto_count')::int = 5, 'vista previa de modo: recuentos de la lista efectiva');

-- 7. Cambios de modo: los ajustes se conservan y vuelven a aplicarse.
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp_auto \gset
SELECT test_util.ok((SELECT count(*) FROM catalog_items WHERE catalog_id = :'cat') = 0, 'antes de cambiar de modo: lista manual vacía');
SELECT catalog_set_mode(:'owner', :'cat', 'manual', 'restore');
SELECT test_util.ok(test_util.c1_snap_slugs(:'tok') = '{}' AND (SELECT count(*) FROM catalog_adjustments WHERE catalog_id = :'cat') = 5,
  'restore: vuelve la lista manual (vacía) y los ajustes se conservan');
SELECT test_util.expect_error(format('SELECT catalog_adjust(%L, %L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000003', 'exclude'), 'catalog_manual');
SELECT catalog_set_mode(:'owner', :'cat', 'auto', NULL);
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp_auto', 'de vuelta a automático: los ajustes se aplican igual (misma huella)');
SELECT catalog_set_mode(:'owner', :'cat', 'manual', 'convert');
SELECT test_util.ok(test_util.c1_snap_slugs(:'tok') = ARRAY['d5', 'd2', 'd6', 'd8', 'd7'] AND (get_public_catalog(:'tok'))->>'fingerprint' = :'fp_auto'
  AND (SELECT count(*) FROM catalog_adjustments WHERE catalog_id = :'cat') = 5,
  'convertir: la lista manual es la efectiva (con ajustes, mismas claves) y los ajustes se conservan');
SELECT catalog_set_mode(:'owner', :'cat', 'auto', NULL);
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp_auto', 'tras convertir y volver: la misma lista automática');

-- 8. Portada elegida.
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp_c0 \gset
SELECT test_util.expect_error(format('SELECT catalog_set_cover(%L, %L, %L, NULL)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000012'), 'cover_not_in_catalog');
SELECT test_util.expect_error(format('SELECT catalog_set_cover(%L, %L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000002',
  'e1000000-0000-0000-0000-000000000031'), 'invalid_cover_photo');
SELECT test_util.expect_error(format('SELECT catalog_set_cover(%L, %L, NULL, %L)', :'owner', :'cat', 'e1000000-0000-0000-0000-000000000031'), 'invalid_cover_photo');
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000003', 'include');
SELECT catalog_set_cover(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000032');
SELECT (SELECT x->>'key' FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') x WHERE x->>'slug' = 'd3') AS key_d3 \gset
SELECT test_util.ok((get_public_catalog(:'tok'))->'snapshot'->'cover' = jsonb_build_object('key', :'key_d3', 'photo', md5('https://storage.example/d3-2.webp')),
  'portada: clave de la vivienda elegida y foto opaca (md5 de la URL, como en photos[].u)');
SELECT test_util.ok(:'key_d3' = (:'keys0'::jsonb)->>'d3', 'portada: la vivienda conserva su clave');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fp_c0', 'elegir portada cambia la huella');
SELECT test_util.ok(((get_public_catalog(:'tok'))->'snapshot')::text !~ 'storage\.example|e1000000', 'portada sin URL de almacenamiento ni id de foto');
-- Independiente del orden: cambiar el orden no la mueve.
SELECT catalog_set_criteria(:'owner', :'cat', '{"operation":"sale","zones":[{"kind":"district","name":"Tetuán"}],"price_max":1000000,"max":6,"sort":"price_desc"}');
SELECT test_util.ok((get_public_catalog(:'tok'))->'snapshot'->'cover'->>'key' = :'key_d3'
  AND (test_util.c1_snap_slugs(:'tok'))[1] <> 'd3', 'otro orden: la portada sigue siendo la elegida (no la primera)');
-- La foto elegida desaparece: queda la vivienda, sin foto elegida (el lector usa su portada).
RESET ROLE;
DELETE FROM property_photos WHERE id = 'e1000000-0000-0000-0000-000000000032';
SELECT test_util.ok((get_public_catalog(:'tok'))->'snapshot'->'cover'->>'key' = :'key_d3'
  AND (get_public_catalog(:'tok'))->'snapshot'->'cover'->'photo' = 'null'::jsonb
  AND (SELECT cover_photo_id FROM catalogs WHERE id = :'cat') = 'e1000000-0000-0000-0000-000000000032',
  'foto elegida borrada: la portada sigue en la vivienda y la gestión puede avisar (el id se conserva)');
-- La vivienda sale de la lista: clave nula (el lector usa la regla de respaldo); vuelve si vuelve.
SET ROLE service_role;
SELECT catalog_adjust(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000003', 'exclude');
SELECT test_util.ok((get_public_catalog(:'tok'))->'snapshot'->'cover'->'key' = 'null'::jsonb
  AND (SELECT cover_property_id FROM catalogs WHERE id = :'cat') = 'd0000000-0000-0000-0000-000000000003',
  'vivienda de portada fuera de la lista: clave nula y la elección se conserva');
SELECT catalog_adjust_clear(:'owner', :'cat', 'd0000000-0000-0000-0000-000000000003');
SELECT test_util.ok((get_public_catalog(:'tok'))->'snapshot'->'cover'->>'key' = :'key_d3', 'vuelve a la lista: vuelve la portada elegida');
SELECT test_util.expect_error(format('SELECT catalog_set_cover(%L, %L, %L, NULL)', :'staff', :'cat', 'd0000000-0000-0000-0000-000000000003'), 'forbidden');
-- Quitar la elección: la instantánea vuelve a no llevar «cover».
SELECT catalog_set_cover(:'owner', :'cat', NULL, NULL);
SELECT test_util.ok(NOT ((get_public_catalog(:'tok'))->'snapshot' ? 'cover'), 'quitar la elección: sin «cover»');
-- Catálogo manual: misma regla sobre su lista.
SELECT catalog_set_cover(:'owner', :'cat_m', 'd0000000-0000-0000-0000-000000000003', NULL);
SELECT test_util.ok((get_public_catalog(:'tok_m'))->'snapshot'->'cover'->>'key'
  = (SELECT public_key FROM catalog_items WHERE catalog_id = :'cat_m' AND property_id = 'd0000000-0000-0000-0000-000000000003')
  AND (get_public_catalog(:'tok_m'))->'snapshot'->'cover'->'photo' = 'null'::jsonb, 'manual: portada elegida sin foto concreta');
SELECT catalog_remove_item(:'owner', :'cat_m', 'd0000000-0000-0000-0000-000000000003');
SELECT test_util.ok((get_public_catalog(:'tok_m'))->'snapshot'->'cover'->'key' = 'null'::jsonb, 'manual: quitar la vivienda de portada → clave nula');
-- Catálogo vacío con portada elegida.
SELECT catalog_add_property(:'owner', :'cat_m', 'd0000000-0000-0000-0000-000000000003');
SELECT catalog_set_cover(:'owner', :'cat_m', 'd0000000-0000-0000-0000-000000000003', NULL);
SELECT catalog_remove_item(:'owner', :'cat_m', 'd0000000-0000-0000-0000-000000000003');
SELECT catalog_remove_item(:'owner', :'cat_m', 'd0000000-0000-0000-0000-000000000001');
SELECT test_util.ok((get_public_catalog(:'tok_m'))->'snapshot'->'items' = '[]'::jsonb
  AND (get_public_catalog(:'tok_m'))->'snapshot'->'cover'->'key' = 'null'::jsonb, 'catálogo vacío: sin viviendas y portada sin vivienda');

-- 9. Permisos.
SELECT test_util.expect_error(format('SELECT catalog_adjust(%L, %L, %L, %L)', :'staff', :'cat', 'd0000000-0000-0000-0000-000000000002', 'exclude'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_adjust_clear(%L, %L, %L)', :'staff', :'cat', 'd0000000-0000-0000-0000-000000000005'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_adjust(NULL, %L, %L, %L)', :'cat', 'd0000000-0000-0000-0000-000000000002', 'exclude'), 'forbidden');
RESET ROLE;
SET ROLE anon;
SELECT test_util.expect_error('SELECT count(*) FROM catalog_adjustments', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_adjust(%L, %L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000002', 'exclude'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_set_cover(%L, %L, NULL, NULL)', :'owner', :'cat'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM catalog_select(%L, %L)', :'cat', '{}'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error('SELECT count(*) FROM catalog_adjustments', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_adjust_clear(%L, %L, %L)', :'owner', :'cat', 'd0000000-0000-0000-0000-000000000005'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_available_inclusions(%L)', :'cat'), 'insufficient_privilege');
RESET ROLE;
SELECT test_util.ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'catalog_adjustments'), 'RLS activado en catalog_adjustments');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'catalog_adjustments'), 'sin políticas: solo service_role');
SELECT test_util.ok((SELECT bool_and(p.prosecdef = false AND p.proconfig @> ARRAY['search_path=public'])
                       FROM pg_proc p WHERE p.proname IN ('catalog_adjust', 'catalog_adjust_clear', 'catalog_set_cover', 'catalog_select',
                                                         'catalog_effective_ids', 'catalog_available_inclusions', 'catalog_internal_snapshot')),
  'funciones nuevas: SECURITY INVOKER y search_path fijo');

-- Para la reversión: el automático vuelve a ser solo criterios.
INSERT INTO test_util.carry VALUES ('c1_crit', (SELECT criteria::text FROM catalogs WHERE id = :'cat'))
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-adjust.sql: todo en verde'
