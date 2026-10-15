-- SOLO PRUEBAS LOCALES (BCP-01 corrección de selección, T1). Comprueba el
-- comportamiento ACTUAL de las funciones SQL reales (0195–0197) con la
-- operación y el importe de cada vivienda: alquiler, duales, precio principal
-- ausente o no positivo, importes de alquiler incoherentes, inclusiones de otra
-- operación y criterios con importes no enteros. No cambia ninguna función.
--
-- Los resultados esperados están escritos a mano a partir de la convención de
-- 0085 (dual → operation='sale', price = venta, rent_price = alquiler; solo
-- alquiler → operation='rent', price = alquiler) y de las reglas de 0195/0196,
-- antes de ejecutar. Datos 100 % sintéticos, todos en Salamanca / Recoletos.
--
-- `properties.price` es NOT NULL (0001): el «precio ausente» de una vivienda
-- solo de alquiler aquí es 0 o negativo.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'

INSERT INTO properties (id, slug, title, status, country, archived_at, bc_reference, zone, subzone, operation, operations, price, rent_price, created_at) VALUES
  -- Solo alquiler, coherentes.
  ('a7000000-0000-0000-0000-000000000001', 'op-r5000',  'R5000',  'available', 'es', NULL, 'BC-8801', 'Salamanca', 'Recoletos', 'rent', '{rent}', 5000,    NULL, '2026-05-01'),
  ('a7000000-0000-0000-0000-000000000002', 'op-r6000',  'R6000',  'available', 'es', NULL, 'BC-8802', 'Salamanca', 'Recoletos', 'rent', '{rent}', 6000,    NULL, '2026-05-02'),
  ('a7000000-0000-0000-0000-000000000003', 'op-r7000',  'R7000',  'available', 'es', NULL, 'BC-8803', 'Salamanca', 'Recoletos', 'rent', '{rent}', 7000,    NULL, '2026-05-03'),
  ('a7000000-0000-0000-0000-000000000004', 'op-r4999',  'R4999',  'available', 'es', NULL, 'BC-8804', 'Salamanca', 'Recoletos', 'rent', '{rent}', 4999,    NULL, '2026-05-04'),
  ('a7000000-0000-0000-0000-000000000018', 'op-r7001',  'R7001',  'available', 'es', NULL, 'BC-8818', 'Salamanca', 'Recoletos', 'rent', '{rent}', 7001,    NULL, '2026-05-18'),
  -- Solo alquiler sin precio principal válido.
  ('a7000000-0000-0000-0000-000000000005', 'op-z0r6',   'Z0R6',   'available', 'es', NULL, 'BC-8805', 'Salamanca', 'Recoletos', 'rent', '{rent}', 0,       6000, '2026-05-05'),
  ('a7000000-0000-0000-0000-000000000006', 'op-z0r8',   'Z0R8',   'available', 'es', NULL, 'BC-8806', 'Salamanca', 'Recoletos', 'rent', '{rent}', 0,       8000, '2026-05-06'),
  ('a7000000-0000-0000-0000-000000000007', 'op-neg6',   'NEG6',   'available', 'es', NULL, 'BC-8807', 'Salamanca', 'Recoletos', 'rent', '{rent}', -1,      6000, '2026-05-07'),
  ('a7000000-0000-0000-0000-000000000008', 'op-z0n',    'Z0N',    'available', 'es', NULL, 'BC-8808', 'Salamanca', 'Recoletos', 'rent', '{rent}', 0,       NULL, '2026-05-08'),
  ('a7000000-0000-0000-0000-000000000009', 'op-z0z',    'Z0Z',    'available', 'es', NULL, 'BC-8809', 'Salamanca', 'Recoletos', 'rent', '{rent}', 0,       0,    '2026-05-09'),
  -- Solo alquiler con los dos importes positivos.
  ('a7000000-0000-0000-0000-000000000010', 'op-x6r9',   'X6R9',   'available', 'es', NULL, 'BC-8810', 'Salamanca', 'Recoletos', 'rent', '{rent}', 6000,    9000, '2026-05-10'),
  ('a7000000-0000-0000-0000-000000000011', 'op-y9r6',   'Y9R6',   'available', 'es', NULL, 'BC-8811', 'Salamanca', 'Recoletos', 'rent', '{rent}', 9000,    6000, '2026-05-11'),
  ('a7000000-0000-0000-0000-000000000012', 'op-e6r6',   'E6R6',   'available', 'es', NULL, 'BC-8812', 'Salamanca', 'Recoletos', 'rent', '{rent}', 6000,    6000, '2026-05-12'),
  -- Duales (venta y alquiler).
  ('a7000000-0000-0000-0000-000000000013', 'op-d6000',  'D6000',  'available', 'es', NULL, 'BC-8813', 'Salamanca', 'Recoletos', 'sale', '{sale,rent}', 2100000, 6000, '2026-05-13'),
  ('a7000000-0000-0000-0000-000000000014', 'op-ds6',    'DS6',    'available', 'es', NULL, 'BC-8814', 'Salamanca', 'Recoletos', 'sale', '{sale,rent}', 6000,    NULL, '2026-05-14'),
  ('a7000000-0000-0000-0000-000000000015', 'op-ds0',    'DS0',    'available', 'es', NULL, 'BC-8815', 'Salamanca', 'Recoletos', 'sale', '{sale,rent}', 0,       6000, '2026-05-15'),
  -- Solo venta.
  ('a7000000-0000-0000-0000-000000000016', 'op-s6000',  'S6000',  'available', 'es', NULL, 'BC-8816', 'Salamanca', 'Recoletos', 'sale', '{sale}', 6000,    NULL, '2026-05-16'),
  ('a7000000-0000-0000-0000-000000000017', 'op-s2m',    'S2M',    'available', 'es', NULL, 'BC-8817', 'Salamanca', 'Recoletos', 'sale', '{sale}', 2000000, NULL, '2026-05-17');
INSERT INTO property_photos (property_id, url, position, is_cover)
SELECT id, 'https://storage.example/' || slug || '-0.webp', 0, true FROM properties WHERE slug LIKE 'op-%';

-- Lista efectiva de un catálogo con sus criterios GUARDADOS, por slug.
CREATE OR REPLACE FUNCTION test_util.op_list(p_catalog uuid)
RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(substr(p.slug, 4) ORDER BY s.ord), '{}')
    FROM catalogs c, catalog_select(c.id, c.criteria) s JOIN properties p ON p.id = s.property_id
   WHERE c.id = p_catalog
$$;
CREATE OR REPLACE FUNCTION test_util.op_via(p_catalog uuid)
RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(s.via ORDER BY s.ord), '{}')
    FROM catalogs c, catalog_select(c.id, c.criteria) s WHERE c.id = p_catalog
$$;
CREATE OR REPLACE FUNCTION test_util.op_counts(p_catalog uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(max(s.total), 0) || '/' || coalesce(max(s.matched), 0)
    FROM catalogs c, catalog_select(c.id, c.criteria) s WHERE c.id = p_catalog
$$;

SET ROLE service_role;
-- A. Alquiler · Recoletos · 5.000–7.000 · de menor a mayor.
SELECT catalog_create(:'owner', 'Op A', NULL) AS cat_a \gset
SELECT catalog_set_criteria(:'owner', :'cat_a', '{"operation":"rent","zones":[{"kind":"barrio","name":"Recoletos"}],"price_min":5000,"price_max":7000,"sort":"price_asc","max":24}');
SELECT catalog_set_mode(:'owner', :'cat_a', 'auto', NULL);
-- B. Alquiler · Recoletos · sin rango.
SELECT catalog_create(:'owner', 'Op B', NULL) AS cat_b \gset
SELECT catalog_set_criteria(:'owner', :'cat_b', '{"operation":"rent","zones":[{"kind":"barrio","name":"Recoletos"}],"sort":"price_asc","max":24}');
SELECT catalog_set_mode(:'owner', :'cat_b', 'auto', NULL);
-- C. Venta y alquiler · Recoletos · sin rango.
SELECT catalog_create(:'owner', 'Op C', NULL) AS cat_c \gset
SELECT catalog_set_criteria(:'owner', :'cat_c', '{"operation":"any","zones":[{"kind":"barrio","name":"Recoletos"}],"sort":"price_asc","max":24}');
SELECT catalog_set_mode(:'owner', :'cat_c', 'auto', NULL);
-- D. Venta · Recoletos · 1.000.000–3.000.000, con dos alquileres incluidos a mano.
SELECT catalog_create(:'owner', 'Op D', NULL) AS cat_d \gset
SELECT catalog_set_criteria(:'owner', :'cat_d', '{"operation":"sale","zones":[{"kind":"barrio","name":"Recoletos"}],"price_min":1000000,"price_max":3000000,"sort":"price_asc","max":24}');
SELECT catalog_set_mode(:'owner', :'cat_d', 'auto', NULL);
SELECT catalog_adjust(:'owner', :'cat_d', 'a7000000-0000-0000-0000-000000000005', 'include');
SELECT catalog_adjust(:'owner', :'cat_d', 'a7000000-0000-0000-0000-000000000002', 'include');
-- E. Como A, con una venta, una dual sin alquiler y Z0R6 incluidas a mano.
SELECT catalog_create(:'owner', 'Op E', NULL) AS cat_e \gset
SELECT catalog_set_criteria(:'owner', :'cat_e', '{"operation":"rent","zones":[{"kind":"barrio","name":"Recoletos"}],"price_min":5000,"price_max":7000,"sort":"price_asc","max":24}');
SELECT catalog_set_mode(:'owner', :'cat_e', 'auto', NULL);
SELECT catalog_adjust(:'owner', :'cat_e', 'a7000000-0000-0000-0000-000000000016', 'include');
SELECT catalog_adjust(:'owner', :'cat_e', 'a7000000-0000-0000-0000-000000000014', 'include');
SELECT catalog_adjust(:'owner', :'cat_e', 'a7000000-0000-0000-0000-000000000005', 'include');
-- F. Como E con máximo 8: las inclusiones tienen plaza asegurada.
SELECT catalog_create(:'owner', 'Op F', NULL) AS cat_f \gset
SELECT catalog_set_criteria(:'owner', :'cat_f', '{"operation":"rent","zones":[{"kind":"barrio","name":"Recoletos"}],"price_min":5000,"price_max":7000,"sort":"price_asc","max":8}');
SELECT catalog_set_mode(:'owner', :'cat_f', 'auto', NULL);
SELECT catalog_adjust(:'owner', :'cat_f', 'a7000000-0000-0000-0000-000000000016', 'include');
SELECT catalog_adjust(:'owner', :'cat_f', 'a7000000-0000-0000-0000-000000000014', 'include');
SELECT catalog_adjust(:'owner', :'cat_f', 'a7000000-0000-0000-0000-000000000005', 'include');
SELECT token AS tok_e FROM catalog_share_create(:'owner', :'cat_e', 60) \gset
RESET ROLE;

-- A: el importe de un alquiler es `price`; el de una dual pedida en alquiler,
-- `rent_price`. Z0R6/NEG6 (sin price, rent_price 6.000) NO entran; DS6 (dual sin
-- alquiler) no entra con su precio de venta de 6.000; Y9R6 (price 9.000) no entra.
SELECT test_util.ok(test_util.op_list(:'cat_a') = ARRAY['r5000','ds0','d6000','e6r6','x6r9','r6000','r7000'],
  'A alquiler 5.000–7.000: R5000, DS0, D6000, E6R6, X6R9, R6000, R7000 (bordes incluidos; empates por más reciente) · ' || test_util.op_list(:'cat_a')::text);
SELECT test_util.ok(test_util.op_counts(:'cat_a') = '7/7', 'A: total 7, coincidencias 7');
SELECT test_util.ok(test_util.op_via(:'cat_a') = ARRAY['match','match','match','match','match','match','match'], 'A: todas por criterios');

-- B: sin rango entran también las que no tienen importe, AL FINAL (más
-- recientes primero): Z0R6 se ordena como «sin precio», detrás de Y9R6 (9.000).
SELECT test_util.ok(test_util.op_list(:'cat_b') = ARRAY['r4999','r5000','ds0','d6000','e6r6','x6r9','r6000','r7000','r7001','y9r6','ds6','z0z','z0n','neg6','z0r8','z0r6'],
  'B alquiler sin rango: con importe por orden y después las sin importe (DS6, Z0Z, Z0N, NEG6, Z0R8, Z0R6) · ' || test_util.op_list(:'cat_b')::text);
SELECT test_util.ok(test_util.op_counts(:'cat_b') = '16/16', 'B: total 16 (13 de solo alquiler + 3 duales)');

-- C: «venta y alquiler» ordena por `price` en dos grupos (venta primero).
SELECT test_util.ok(test_util.op_list(:'cat_c') = ARRAY['s6000','ds6','s2m','d6000','ds0','r4999','r5000','e6r6','x6r9','r6000','r7000','r7001','y9r6','z0z','z0n','neg6','z0r8','z0r6'],
  'C venta y alquiler: grupo venta por price, grupo alquiler por price, sin importe al final de cada grupo · ' || test_util.op_list(:'cat_c')::text);
SELECT test_util.ok(test_util.op_counts(:'cat_c') = '18/18', 'C: total 18');

-- D: un alquiler incluido en un catálogo de venta va al grupo final por su
-- `price` real; Z0R6 (price 0) va el último, como «sin importe».
SELECT test_util.ok(test_util.op_list(:'cat_d') = ARRAY['s2m','d6000','r6000','z0r6'],
  'D venta 1–3 M con dos alquileres incluidos: S2M, D6000 y después R6000 y Z0R6 · ' || test_util.op_list(:'cat_d')::text);
SELECT test_util.ok(test_util.op_via(:'cat_d') = ARRAY['match','match','include','include'], 'D: via match, match, include, include');
SELECT test_util.ok(test_util.op_counts(:'cat_d') = '4/2', 'D: total 4, coincidencias 2');

-- E: DS6 y Z0R6 encajan en alquiler pero no tienen importe de alquiler válido
-- para SQL → al final del grupo 0; S6000 (venta) va en el grupo 2 por su precio.
SELECT test_util.ok(test_util.op_list(:'cat_e') = ARRAY['r5000','ds0','d6000','e6r6','x6r9','r6000','r7000','ds6','z0r6','s6000'],
  'E alquiler con tres inclusiones: DS6 y Z0R6 tras las coincidencias, S6000 al final · ' || test_util.op_list(:'cat_e')::text);
SELECT test_util.ok(test_util.op_via(:'cat_e') = ARRAY['match','match','match','match','match','match','match','include','include','include'], 'E: Z0R6 entra solo por la inclusión');
SELECT test_util.ok(test_util.op_counts(:'cat_e') = '10/7', 'E: total 10, coincidencias 7');

-- F: con máximo 8, las 3 inclusiones tienen plaza y quedan 5 para coincidencias.
SELECT test_util.ok(test_util.op_list(:'cat_f') = ARRAY['r5000','ds0','d6000','e6r6','x6r9','ds6','z0r6','s6000'],
  'F máximo 8: 5 coincidencias + 3 inclusiones · ' || test_util.op_list(:'cat_f')::text);

-- Búsqueda de la gestión con los criterios guardados de A: las mismas 7, en el
-- mismo orden (sin exigir foto; todas tienen).
SET ROLE service_role;
SELECT test_util.ok(
  (SELECT array_agg(substr(p.slug, 4) ORDER BY x.ord) FROM (
     SELECT s.property_id, row_number() OVER () AS ord
       FROM catalog_property_search(:'owner', :'cat_a', (SELECT criteria FROM catalogs WHERE id = :'cat_a'), NULL, 50, 0) s) x
     JOIN properties p ON p.id = x.property_id) = ARRAY['r5000','ds0','d6000','e6r6','x6r9','r6000','r7000'],
  'búsqueda con los criterios guardados de A = lista de A');
SELECT test_util.ok(
  (SELECT max(total) FROM catalog_property_search(:'owner', :'cat_a', (SELECT criteria FROM catalogs WHERE id = :'cat_a'), NULL, 50, 0)) = 7,
  'búsqueda de A: total 7');
RESET ROLE;

-- La instantánea lleva los dos importes tal cual: la etiqueta se decide en TS.
SELECT test_util.ok(
  (SELECT (it->>'price')::numeric = 0 AND (it->>'rent_price')::numeric = 6000 AND it->>'operation' = 'rent'
     FROM jsonb_array_elements((get_public_catalog(:'tok_e'))->'snapshot'->'items') it
    WHERE it->>'slug' = 'op-z0r6'),
  'instantánea de E: Z0R6 con price 0 y rent_price 6000 (sin cambiar)');

-- Criterios: SQL solo acepta importes ENTEROS como número JSON.
SELECT test_util.expect_error($q$SELECT catalog_criteria_normalize('{"operation":"rent","price_min":5.5}')$q$, 'invalid_criteria');
SELECT test_util.expect_error($q$SELECT catalog_criteria_normalize('{"operation":"rent","price_min":"5.5"}')$q$, 'invalid_criteria');
SELECT test_util.expect_error($q$SELECT catalog_criteria_normalize('{"operation":"rent","price_max":"5000"}')$q$, 'invalid_criteria');
SELECT test_util.expect_error($q$SELECT catalog_criteria_normalize('{"operation":"rent","price_max":-1}')$q$, 'invalid_criteria');
SELECT test_util.ok((catalog_criteria_normalize('{"operation":"rent","price_min":5000,"price_max":1200000}')->>'price_max')::numeric = 1200000,
  'criterios: 5000 y 1200000 como número se aceptan');

DROP FUNCTION test_util.op_list(uuid);
DROP FUNCTION test_util.op_via(uuid);
DROP FUNCTION test_util.op_counts(uuid);
\echo 'test-catalog-operations.sql: todo en verde'
