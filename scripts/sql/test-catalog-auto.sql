-- ============================================================================
-- SOLO PRUEBAS LOCALES (BCP-01 ampliación X4/X5/X8). Tests de 0195 en el
-- Postgres temporal: stub + fixtures + 0192–0194 + catálogo previo + 0195
-- (aplicada dos veces). Datos 100 % sintéticos.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
SELECT v AS cat_pre FROM test_util.carry WHERE k = 'cat_pre' \gset
SELECT v AS tok_pre FROM test_util.carry WHERE k = 'tok_pre' \gset
SELECT v AS fp_pre  FROM test_util.carry WHERE k = 'fp_pre'  \gset

-- 0. Compatibilidad: un catálogo manual existente no cambia (ni la huella).
SELECT test_util.ok((SELECT mode = 'manual' AND criteria->>'max' = '12' AND criteria->>'sort' = 'price_asc'
                       AND criteria->>'operation' = 'any' AND key_salt IS NOT NULL FROM catalogs WHERE id = :'cat_pre'),
  'compatibilidad: catálogo existente en manual con criterios por defecto');
SELECT test_util.ok((get_public_catalog(:'tok_pre'))->>'fingerprint' = :'fp_pre',
  'compatibilidad: 0195 no cambia la huella de un catálogo manual');
SELECT test_util.ok((get_public_catalog(:'tok_pre'))->'snapshot' ? 'contact' AND (get_public_catalog(:'tok_pre'))->'snapshot' ? 'owner_name'
  AND NOT ((get_public_catalog(:'tok_pre'))->'snapshot' ? 'mode'), 'instantánea: claves de 0193/0194, sin claves nuevas');
SELECT test_util.ok((SELECT count(DISTINCT key_salt) = count(*) FROM catalogs), 'sal distinta por catálogo');

-- 1. Zonas (taxonomía de catálogos, sin tocar la global).
SELECT test_util.ok(catalog_zone_match('Goya, Madrid') = ARRAY['Salamanca', 'Goya'], 'zona: «Goya, Madrid» → Salamanca / Goya');
SELECT test_util.ok(catalog_zone_match('barrio de Salamanca') = ARRAY['Salamanca', NULL], 'zona: «barrio de Salamanca» → distrito');
SELECT test_util.ok(catalog_zone_match('Chueca') = ARRAY['Centro', 'Justicia'], 'equivalencia: Chueca → Justicia');
SELECT test_util.ok(catalog_zone_match('MALASAÑA') = ARRAY['Centro', 'Universidad'], 'equivalencia: Malasaña → Universidad (mayúsculas)');
SELECT test_util.ok(catalog_zone_match('Huertas - Madrid') = ARRAY['Centro', 'Cortes'], 'equivalencia: Huertas → Cortes');
SELECT test_util.ok(catalog_zone_match('CHAMBERÍ') = ARRAY['Chamberí', NULL], 'zona: mayúsculas acentuadas');
SELECT test_util.ok(catalog_zone_match('Pozuelo de Alarcón') IS NULL AND catalog_zone_match('') IS NULL AND catalog_zone_match(NULL) IS NULL,
  'zona: desconocida o vacía → sin zona (no se inventa)');
SELECT test_util.ok(catalog_zone_candidates('Pozuelo de Alarcón, Madrid') = ARRAY['pozuelo de alarcon, madrid', 'pozuelo de alarcon', 'madrid'],
  'fragmentos normalizados');

-- 2. Criterios.
SELECT test_util.ok(catalog_criteria_normalize('{}') =
  '{"operation":"any","zones":[],"price_min":null,"price_max":null,"sort":"price_asc","max":12}'::jsonb, 'criterios: por defecto 12 y precio ascendente');
SELECT test_util.ok(catalog_criteria_normalize('{"operation":"sale","zones":[{"kind":"district","name":"Salamanca"},{"kind":"barrio","name":"Justicia"},{"kind":"district","name":"Salamanca"}],"price_max":1300000,"max":24}')
  = '{"operation":"sale","zones":[{"kind":"district","name":"Salamanca"},{"kind":"barrio","name":"Justicia"}],"price_min":null,"price_max":1300000,"sort":"price_asc","max":24}'::jsonb,
  'criterios: zonas sin duplicados, máximo 24');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"operation":"x"}')$$, 'invalid_criteria');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"sort":"x"}')$$, 'invalid_criteria');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"max":0}')$$, 'invalid_criteria');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"max":25}')$$, 'invalid_criteria');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"max":2.5}')$$, 'invalid_criteria');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"price_max":100}')$$, 'invalid_criteria');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"operation":"sale","price_min":5,"price_max":4}')$$, 'invalid_criteria');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"operation":"sale","price_min":-1}')$$, 'invalid_criteria');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"zones":[{"kind":"district","name":"Gotham"}]}')$$, 'invalid_criteria');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"zones":[{"kind":"barrio","name":"Chueca"}]}')$$, 'invalid_criteria');
SELECT test_util.expect_error($$SELECT catalog_criteria_normalize('{"zones":[{"kind":"free","name":"X"}]}')$$, 'invalid_criteria');
SELECT test_util.expect_error(format('SELECT catalog_criteria_normalize(%L)',
  jsonb_build_object('zones', (SELECT jsonb_agg(jsonb_build_object('kind', 'free', 'name', 'Zona ' || g)) FROM generate_series(1, 31) g))::text), 'invalid_criteria');

-- 3. Datos sintéticos para la selección.
INSERT INTO properties (id, slug, title, status, country, archived_at, bc_reference, zone, subzone, operation, operations, price, rent_price, created_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a1',  'Goya 1',        'available', 'es', NULL,  'BC-8001', 'Salamanca', 'Goya',      'sale', '{sale}',      900000,  NULL, '2026-01-01'),
  ('a0000000-0000-0000-0000-000000000002', 'a2',  'Justicia 2',    'available', 'es', NULL,  'BC-8002', 'Centro',    'Justicia',  'sale', '{sale}',      1200000, NULL, '2026-01-02'),
  ('a0000000-0000-0000-0000-000000000003', 'a3',  'Chueca 3',      'available', 'es', NULL,  'BC-8003', 'Chueca',    NULL,        'sale', '{sale}',      1000000, NULL, '2026-01-03'),
  ('a0000000-0000-0000-0000-000000000004', 'a4',  'Sin precio 4',  'available', 'es', NULL,  'BC-8004', 'Salamanca', 'Recoletos', 'sale', '{sale}',      0,       NULL, '2026-01-04'),
  ('a0000000-0000-0000-0000-000000000005', 'a5',  'Sin foto 5',    'available', 'es', NULL,  'BC-8005', 'Salamanca', NULL,        'sale', '{sale}',      950000,  NULL, '2026-01-05'),
  ('a0000000-0000-0000-0000-000000000006', 'a6',  'Vendida 6',     'sold',      'es', NULL,  'BC-8006', 'Salamanca', NULL,        'sale', '{sale}',      800000,  NULL, '2026-01-06'),
  ('a0000000-0000-0000-0000-000000000007', 'a7',  'Archivada 7',   'available', 'es', now(), 'BC-8007', 'Salamanca', NULL,        'sale', '{sale}',      850000,  NULL, '2026-01-07'),
  ('a0000000-0000-0000-0000-000000000008', 'a8',  'Reservada 8',   'reserved',  'es', NULL,  'BC-8008', 'Salamanca', 'Lista',     'sale', '{sale}',      870000,  NULL, '2026-01-08'),
  ('a0000000-0000-0000-0000-000000000009', 'a9',  'Goya 9',        'available', 'es', NULL,  'BC-8009', 'Salamanca', 'Goya',      'sale', '{sale}',      900000,  NULL, '2026-01-09'),
  ('a0000000-0000-0000-0000-000000000010', 'a10', 'Chamberí 10',   'available', 'es', NULL,  'BC-8010', 'Chamberí',  'Almagro',   'sale', '{sale}',      700000,  NULL, '2026-01-10'),
  ('a0000000-0000-0000-0000-000000000011', 'a11', 'Alquiler 11',   'available', 'es', NULL,  'BC-8011', 'Salamanca', NULL,        'rent', '{rent}',      3000,    NULL, '2026-01-11'),
  ('a0000000-0000-0000-0000-000000000012', 'a12', 'Dual 12',       'available', 'es', NULL,  'BC-8012', 'Salamanca', 'Castellana','sale', '{sale,rent}', 1500000, 5000, '2026-01-12'),
  ('a0000000-0000-0000-0000-000000000013', 'a13', 'Chile 13',      'available', 'cl', NULL,  'BC-8013', 'Salamanca', NULL,        'sale', '{sale}',      900000,  NULL, '2026-01-13'),
  ('a0000000-0000-0000-0000-000000000014', 'a14', 'Madrid 14',     'available', 'es', NULL,  'BC-8014', 'Madrid',    'Justicia',  'sale', '{sale}',      1100000, NULL, '2026-01-14'),
  ('a0000000-0000-0000-0000-000000000015', 'a15', 'Pozuelo 15',    'available', 'es', NULL,  'BC-8015', 'Pozuelo de Alarcón', NULL,'sale', '{sale}',      600000,  NULL, '2026-01-15');
INSERT INTO property_photos (property_id, url, position)
SELECT id, 'https://storage.example/' || slug || '.webp', 0 FROM properties
 WHERE slug ~ '^a[0-9]+$' AND slug <> 'a5';

SET ROLE service_role;
SELECT catalog_create_v2(:'owner', 'Automático', NULL, 'Fabricio Andree', '+34641457123', 'asesor') AS cat \gset
SELECT token AS tok FROM catalog_share_create(:'owner', :'cat', 60) \gset
SELECT catalog_set_criteria(:'owner', :'cat',
  '{"operation":"sale","zones":[{"kind":"district","name":"Salamanca"},{"kind":"barrio","name":"Justicia"}],"price_min":800000,"price_max":1300000}');
SELECT criteria AS crit FROM catalogs WHERE id = :'cat' \gset

-- 4. Selección: filtro completo → orden estable → máximo.
SELECT test_util.ok(
  (SELECT array_agg(p.slug ORDER BY s.ord) FROM catalog_select(:'cat', :'crit') s JOIN properties p ON p.id = s.property_id)
  = ARRAY['a8', 'a9', 'a1', 'a3', 'a14', 'a2'],
  'selección: venta Salamanca+Justicia 800k–1,3M, orden por precio (empate → más reciente) y Chueca cuenta como Justicia');
SELECT test_util.ok((SELECT DISTINCT total FROM catalog_select(:'cat', :'crit')) = 6, 'selección: total de coincidencias');
SELECT test_util.ok(
  (SELECT array_agg(p.slug ORDER BY s.ord) FROM catalog_select(:'cat', jsonb_set(:'crit'::jsonb, '{max}', '2')) s JOIN properties p ON p.id = s.property_id) = ARRAY['a8', 'a9']
  AND (SELECT DISTINCT total FROM catalog_select(:'cat', jsonb_set(:'crit'::jsonb, '{max}', '2'))) = 6,
  'máximo 2: las dos primeras del orden completo y el total sigue siendo 6');
SELECT test_util.ok(
  (SELECT array_agg(p.slug ORDER BY s.ord) FROM catalog_select(:'cat', catalog_criteria_normalize('{"operation":"sale","zones":[{"kind":"district","name":"Salamanca"}]}')) s JOIN properties p ON p.id = s.property_id)
  = ARRAY['a8', 'a9', 'a1', 'a12', 'a4'],
  'sin rango: el precio desconocido entra, al final');
SELECT test_util.ok(
  (SELECT array_agg(p.slug ORDER BY s.ord) FROM catalog_select(:'cat', catalog_criteria_normalize('{"operation":"sale","zones":[{"kind":"district","name":"Salamanca"}],"sort":"price_desc"}')) s JOIN properties p ON p.id = s.property_id)
  = ARRAY['a12', 'a9', 'a1', 'a8', 'a4'],
  'precio descendente: el desconocido sigue al final; empate → más reciente');
SELECT test_util.ok(
  (SELECT array_agg(p.slug ORDER BY s.ord) FROM catalog_select(:'cat', catalog_criteria_normalize('{"operation":"rent","zones":[{"kind":"district","name":"Salamanca"}],"price_max":5000}')) s JOIN properties p ON p.id = s.property_id)
  = ARRAY['a11', 'a12'],
  'alquiler: €/mes; la dual compara su rent_price');
SELECT test_util.ok(
  (SELECT array_agg(p.slug ORDER BY s.ord) FROM catalog_select(:'cat', catalog_criteria_normalize('{"operation":"any","zones":[{"kind":"district","name":"Salamanca"}]}')) s JOIN properties p ON p.id = s.property_id)
  = ARRAY['a8', 'a9', 'a1', 'a12', 'a4', 'a11'],
  'ambas: primero venta (con la dual) y después alquiler');
SELECT test_util.ok(
  (SELECT array_agg(p.slug ORDER BY s.ord) FROM catalog_select(:'cat', catalog_criteria_normalize('{"zones":[{"kind":"free","name":"pozuelo de alarcon"}]}')) s JOIN properties p ON p.id = s.property_id)
  = ARRAY['a15'],
  'nombre libre (sin tildes)');
SELECT test_util.ok(
  (SELECT array_agg(p.slug ORDER BY s.ord) FROM catalog_select(:'cat', catalog_criteria_normalize('{"operation":"sale","zones":[{"kind":"district","name":"Salamanca"}],"sort":"newest"}')) s JOIN properties p ON p.id = s.property_id)
  = ARRAY['a12', 'a9', 'a8', 'a4', 'a1'],
  'más recientes primero');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_select(:'cat', catalog_criteria_normalize('{}')) s JOIN properties p ON p.id = s.property_id
                                 WHERE p.slug IN ('a5', 'a6', 'a7', 'a13')),
  'nunca entran: sin foto, vendida, archivada o fuera de España');
-- Máximo 24 con más coincidencias: 24 elegidas y el total completo.
INSERT INTO properties (id, slug, title, status, country, zone, operation, operations, price, created_at)
SELECT ('b0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'b' || g, 'Lote ' || g, 'available', 'es', 'Retiro', 'sale', '{sale}', 600000 - g * 1000, '2026-02-01'::timestamptz + g * interval '1 hour'
  FROM generate_series(1, 30) g;
INSERT INTO property_photos (property_id, url, position)
SELECT id, 'https://storage.example/' || slug || '.webp', 0 FROM properties WHERE slug ~ '^b[0-9]+$';
SELECT test_util.ok(
  (SELECT count(*) = 24 AND max(total) = 30 AND min(ord) = 1 AND max(ord) = 24 FROM catalog_select(:'cat', catalog_criteria_normalize('{"zones":[{"kind":"district","name":"Retiro"}],"max":24}'))),
  'máximo 24: 24 elegidas de 30 y el total completo');
SELECT test_util.ok(
  (SELECT array_agg(p.slug ORDER BY s.ord) FROM catalog_select(:'cat', catalog_criteria_normalize('{"zones":[{"kind":"district","name":"Retiro"}],"max":3}')) s JOIN properties p ON p.id = s.property_id)
  = ARRAY['b30', 'b29', 'b28'], 'máximo 3: las más baratas del conjunto completo (no las primeras insertadas)');

-- 5. Instantánea en automático: la lista sale de la selección (misma sentencia).
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp_manual_vacio \gset
SELECT catalog_add_property(:'owner', :'cat', 'a0000000-0000-0000-0000-000000000001');  -- fila manual de a1
SELECT public_key AS key_a1 FROM catalog_items WHERE catalog_id = :'cat' AND property_id = 'a0000000-0000-0000-0000-000000000001' \gset
SELECT catalog_mode_preview(:'owner', :'cat', 'auto') AS prev \gset
SELECT test_util.ok((:'prev'::jsonb->>'auto_count')::int = 6 AND jsonb_array_length(:'prev'::jsonb->'entering') = 5
  AND jsonb_array_length(:'prev'::jsonb->'leaving') = 0, 'vista previa manual → auto: entran 5 y no sale ninguna');
SELECT catalog_set_mode(:'owner', :'cat', 'auto', NULL);
SELECT (get_public_catalog(:'tok'))->'snapshot'->'items' AS items_auto \gset
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp_auto \gset
SELECT test_util.ok((SELECT array_agg(x->>'slug' ORDER BY o) FROM jsonb_array_elements(:'items_auto'::jsonb) WITH ORDINALITY AS t(x, o))
  = ARRAY['a8', 'a9', 'a1', 'a3', 'a14', 'a2'], 'instantánea automática en el orden de la selección');
SELECT test_util.ok((SELECT x->>'key' FROM jsonb_array_elements(:'items_auto'::jsonb) x WHERE x->>'slug' = 'a1') = :'key_a1',
  'clave: se reutiliza la de su fila manual');
SELECT test_util.ok((SELECT bool_and(char_length(x->>'key') = 16) AND count(DISTINCT x->>'key') = 6
                       FROM jsonb_array_elements(:'items_auto'::jsonb) x), 'claves únicas y opacas');
SELECT test_util.ok(:'items_auto' !~* '[0-9a-f]{8}-[0-9a-f]{4}-', 'instantánea automática sin UUID');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp_auto', 'misma selección → misma huella (claves estables)');
SELECT test_util.ok((SELECT count(*) FROM catalog_items WHERE catalog_id = :'cat') = 1, 'manual → auto no toca la lista manual');
-- Lista manual bloqueada en automático (sin modelo híbrido).
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'cat', 'a0000000-0000-0000-0000-000000000010'), 'catalog_auto');
SELECT test_util.expect_error(format('SELECT catalog_remove_item(%L, %L, %L)', :'owner', :'cat', 'a0000000-0000-0000-0000-000000000001'), 'catalog_auto');
SELECT test_util.expect_error(format('SELECT catalog_reorder(%L, %L, ARRAY[%L]::uuid[])', :'owner', :'cat', 'a0000000-0000-0000-0000-000000000001'), 'catalog_auto');
SELECT test_util.expect_error(format('SELECT catalog_set_mode(%L, %L, %L, NULL)', :'owner', :'cat', 'auto'), 'mode_unchanged');
SELECT test_util.expect_error(format('SELECT catalog_set_mode(%L, %L, %L, %L)', :'owner', :'cat', 'manual', 'x'), 'invalid_strategy');
SELECT test_util.expect_error(format('SELECT catalog_set_mode(%L, %L, %L, %L)', :'owner', :'cat', 'auto', 'restore'), 'mode_unchanged');

-- 6. Entradas y salidas automáticas (la huella cambia en cada caso).
RESET ROLE;
INSERT INTO properties (id, slug, title, status, country, zone, operation, operations, price, created_at)
VALUES ('a0000000-0000-0000-0000-000000000016', 'a16', 'Nueva 16', 'available', 'es', 'Goya', 'sale', '{sale}', 1250000, '2026-03-01');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp_auto', 'propiedad nueva SIN foto: no entra (huella igual)');
INSERT INTO property_photos (property_id, url, position) VALUES ('a0000000-0000-0000-0000-000000000016', 'https://storage.example/a16.webp', 0);
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp2 \gset
SELECT test_util.ok(:'fp2' <> :'fp_auto' AND ((get_public_catalog(:'tok'))->'snapshot'->'items'->-1->>'slug') = 'a16'
  AND (SELECT count(*) FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items')) = 7,
  'propiedad nueva que encaja con foto: entra en su sitio y la huella cambia');
UPDATE properties SET price = 2000000 WHERE slug = 'a3';
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp3 \gset
SELECT test_util.ok(:'fp3' <> :'fp2' AND NOT ((get_public_catalog(:'tok'))->'snapshot'->'items')::text LIKE '%"a3"%',
  'sube de precio fuera del rango: sale');
UPDATE properties SET zone = 'Chamberí', subzone = NULL WHERE slug = 'a14';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fp3' AND NOT ((get_public_catalog(:'tok'))->'snapshot'->'items')::text LIKE '%"a14"%',
  'cambia de zona: sale');
UPDATE properties SET status = 'sold' WHERE slug = 'a2';
SELECT test_util.ok(NOT ((get_public_catalog(:'tok'))->'snapshot'->'items')::text LIKE '%"a2"%', 'se vende: sale');
UPDATE properties SET status = 'reserved' WHERE slug = 'a1';
SELECT test_util.ok((SELECT x->>'status' FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') x WHERE x->>'slug' = 'a1') = 'reserved',
  'pasa a reservada: sigue (con su marca)');
DELETE FROM property_photos WHERE property_id = 'a0000000-0000-0000-0000-000000000016';
SELECT test_util.ok(NOT ((get_public_catalog(:'tok'))->'snapshot'->'items')::text LIKE '%"a16"%', 'se queda sin fotos: sale');
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp4 \gset
UPDATE properties SET price = 650000 WHERE slug = 'a10';
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp4', 'propiedad que no encaja cambia: huella igual');
SET ROLE service_role;
-- Criterios distintos que dan la MISMA lista: contenido público igual.
SELECT catalog_set_criteria(:'owner', :'cat', jsonb_set(:'crit'::jsonb, '{price_max}', '1290000'));
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp4', 'criterios cambiados con la misma lista: huella igual (sin cambio público)');
SELECT catalog_set_criteria(:'owner', :'cat', jsonb_set(:'crit'::jsonb, '{max}', '1'));
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fp4'
  AND jsonb_array_length((get_public_catalog(:'tok'))->'snapshot'->'items') = 1, 'criterios que cambian la lista: huella nueva');
SELECT catalog_set_criteria(:'owner', :'cat', :'crit');

-- 7. Volver a manual: «restore» y «convert».
SELECT (get_public_catalog(:'tok'))->'snapshot'->'items' AS items_before \gset
SELECT catalog_mode_preview(:'owner', :'cat', 'manual') AS prev_m \gset
SELECT test_util.ok((:'prev_m'::jsonb->>'manual_count')::int = 1, 'vista previa auto → manual: la lista manual guardada tiene 1');
SELECT catalog_set_mode(:'owner', :'cat', 'manual', 'restore');
SELECT test_util.ok((SELECT array_agg(x->>'slug') FROM jsonb_array_elements((get_public_catalog(:'tok'))->'snapshot'->'items') x) = ARRAY['a1'],
  'restore: vuelve exactamente la lista manual guardada');
SELECT catalog_set_mode(:'owner', :'cat', 'auto', NULL);
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp_a \gset
SELECT catalog_set_mode(:'owner', :'cat', 'manual', 'convert');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp_a', 'convert: mismas viviendas, claves y orden → misma huella');
SELECT test_util.ok((SELECT count(*) FROM catalog_items WHERE catalog_id = :'cat') = jsonb_array_length(:'items_before'::jsonb),
  'convert: la lista manual es la selección');
SELECT catalog_reorder(:'owner', :'cat', (SELECT array_agg(property_id ORDER BY position DESC) FROM catalog_items WHERE catalog_id = :'cat'));
SELECT test_util.ok(true, 'tras convertir se puede ordenar a mano');

-- 8. Búsqueda de la gestión (manual): sin foto obligatoria, paginada.
SELECT test_util.ok((SELECT count(*) FROM catalog_property_search(:'owner', :'cat', '{"operation":"sale","zones":[{"kind":"district","name":"Salamanca"}]}', NULL, 50, 0) s
                      JOIN properties p ON p.id = s.property_id WHERE p.slug = 'a5') = 1, 'búsqueda manual: incluye la sin foto');
SELECT test_util.ok((SELECT max(total) FROM catalog_property_search(:'owner', :'cat', '{"zones":[{"kind":"district","name":"Retiro"}]}', NULL, 5, 0)) = 30
  AND (SELECT count(*) FROM catalog_property_search(:'owner', :'cat', '{"zones":[{"kind":"district","name":"Retiro"}]}', NULL, 5, 0)) = 5
  AND (SELECT array_agg(p.slug ORDER BY p.price) FROM catalog_property_search(:'owner', :'cat', '{"zones":[{"kind":"district","name":"Retiro"}]}', NULL, 5, 5) s JOIN properties p ON p.id = s.property_id)
      = ARRAY['b25', 'b24', 'b23', 'b22', 'b21'], 'búsqueda: total, página y orden');
SELECT test_util.ok((SELECT array_agg(p.slug) FROM catalog_property_search(:'owner', :'cat', '{}', 'bc-8015', 10, 0) s JOIN properties p ON p.id = s.property_id) = ARRAY['a15']
  AND (SELECT count(*) FROM catalog_property_search(:'owner', :'cat', '{}', '100%_', 10, 0)) = 0, 'búsqueda por texto (comodines escapados)');
SELECT test_util.ok((SELECT bool_or(in_catalog) FROM catalog_property_search(:'owner', :'cat', '{"operation":"sale","zones":[{"kind":"district","name":"Salamanca"}]}', NULL, 50, 0)), 'búsqueda: marca «ya está»');
SELECT test_util.expect_error(format('SELECT * FROM catalog_property_search(%L, %L, %L, NULL, 10, 0)', :'staff', :'cat', '{}'), 'forbidden');
SELECT test_util.expect_error(format('SELECT * FROM catalog_auto_preview(%L, %L, NULL)', :'staff', :'cat'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_mode_preview(%L, %L, %L)', :'staff', :'cat', 'auto'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_criteria(%L, %L, %L)', :'staff', :'cat', '{}'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_mode(%L, %L, %L, NULL)', :'staff', :'cat', 'auto'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_criteria(%L, %L, %L)', :'owner', :'cat', '{"max":30}'), 'invalid_criteria');

-- 9. Anuncios de origen: muchos a muchos, internos.
RESET ROLE;
INSERT INTO idealista_listings (id, reference_code, inspo_title, idealista_property_id)
VALUES ('c0000000-0000-0000-0000-000000000001', 'BC-I-1', 'Ático Goya inspo', '108123456'),
       ('c0000000-0000-0000-0000-000000000002', 'BC-I-2', 'Sin código', NULL);
SET ROLE service_role;
SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp_ads \gset
SELECT catalog_ad_add(:'owner', :'cat', 'c0000000-0000-0000-0000-000000000001', NULL, 'Clientes de Londres') AS ad1 \gset
SELECT test_util.ok((SELECT ad_code FROM catalog_ads WHERE id = :'ad1') = '108123456', 'anuncio por ficha: guarda también su código');
SELECT catalog_ad_add(:'owner', :'cat', NULL, '99887766', NULL) AS ad2 \gset
SELECT catalog_ad_add(:'owner', :'cat_pre', 'c0000000-0000-0000-0000-000000000001', NULL, NULL);
SELECT test_util.ok((SELECT count(*) FROM catalog_ads WHERE idealista_listing_id = 'c0000000-0000-0000-0000-000000000001') = 2,
  'un anuncio en dos catálogos (sin copiar nada)');
SELECT test_util.expect_error(format('SELECT catalog_ad_add(%L, %L, %L, NULL, NULL)', :'owner', :'cat', 'c0000000-0000-0000-0000-000000000001'), 'ad_exists');
SELECT test_util.expect_error(format('SELECT catalog_ad_add(%L, %L, NULL, %L, NULL)', :'owner', :'cat', '108123456'), 'ad_exists');
SELECT test_util.expect_error(format('SELECT catalog_ad_add(%L, %L, NULL, %L, NULL)', :'owner', :'cat', '12ab'), 'invalid_ad_code');
SELECT test_util.expect_error(format('SELECT catalog_ad_add(%L, %L, NULL, NULL, NULL)', :'owner', :'cat'), 'ad_required');
SELECT test_util.expect_error(format('SELECT catalog_ad_add(%L, %L, %L, NULL, NULL)', :'owner', :'cat', 'c0000000-0000-0000-0000-0000000000ff'), 'listing_not_found');
SELECT test_util.expect_error(format('SELECT catalog_ad_add(%L, %L, NULL, %L, NULL)', :'staff', :'cat', '55554444'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_ad_remove(%L, %L)', :'staff', :'ad2'), 'forbidden');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp_ads', 'asociar anuncios no cambia la huella (no es contenido público)');
SELECT test_util.ok((get_public_catalog(:'tok'))::text !~ '(108123456|99887766|Londres|BC-I-1)', 'ni códigos ni notas en la instantánea');
SELECT catalog_ad_remove(:'owner', :'ad2');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_ads WHERE id = :'ad2'), 'quitar anuncio');
RESET ROLE;
DELETE FROM idealista_listings WHERE id = 'c0000000-0000-0000-0000-000000000001';
SELECT test_util.ok((SELECT count(*) FROM catalog_ads WHERE ad_code = '108123456' AND idealista_listing_id IS NULL) = 2,
  'si se borra la ficha, la asociación queda con el código');

-- 10. Permisos: anon y authenticated no tocan nada nuevo.
SET ROLE anon;
SELECT test_util.expect_error(format('SELECT * FROM catalog_select(%L, %L)', :'cat', '{}'), 'insufficient_privilege');
SELECT test_util.expect_error($$SELECT catalog_zone_match('Goya')$$, 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM catalog_property_search(%L, %L, %L, NULL, 1, 0)', :'owner', :'cat', '{}'), 'insufficient_privilege');
SELECT test_util.expect_error($$SELECT * FROM catalog_ads$$, 'insufficient_privilege');
SELECT test_util.expect_error($$SELECT * FROM catalog_zone_terms$$, 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT catalog_set_mode(%L, %L, %L, NULL)', :'owner', :'cat', 'auto'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_ad_add(%L, %L, NULL, %L, NULL)', :'owner', :'cat', '55554444'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT * FROM catalog_candidates(%L, true, NULL)', '{}'), 'insufficient_privilege');
RESET ROLE;

-- 11. La instantánea sigue siendo una sola función SQL STABLE.
SELECT test_util.ok((SELECT prolang = (SELECT oid FROM pg_language WHERE lanname = 'sql') AND provolatile = 's'
                       FROM pg_proc WHERE proname = 'catalog_internal_snapshot'), 'instantánea: SQL STABLE (una sentencia)');

\echo 'test-catalog-auto.sql: todo en verde'
