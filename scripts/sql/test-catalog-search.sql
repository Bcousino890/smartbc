-- SOLO PRUEBAS LOCALES (BCP-01 P2). Prueba 0212 contra el Postgres temporal:
-- catalog_search (cada filtro y sus límites, K2, zonas por taxonomía en zone
-- o subzone, estados, permisos, paginación y paridad con catalog_candidates),
-- el máximo de 24 de catalog_add_property y catalog_set_operation.
-- Resultados esperados escritos a mano antes de ejecutar. Datos sintéticos.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set other '00000000-0000-0000-0000-0000000000a2'

INSERT INTO agencies (id, name, slug) VALUES
  ('a9000000-0000-0000-0000-0000000000a1', 'Level',    'level'),
  ('a9000000-0000-0000-0000-0000000000a2', 'Housingo', 'housingo');
INSERT INTO property_tags (id, name) VALUES
  ('a9000000-0000-0000-0000-0000000000e1', 'Exclusiva'),
  ('a9000000-0000-0000-0000-0000000000e2', 'Reformado');

-- s-* : slug corto que nombran los tests. Precio de venta en `price`; dual =
-- operation 'sale' + operations {sale,rent} + rent_price (convención de 0085).
INSERT INTO properties (id, slug, title, status, country, archived_at, bc_reference, external_id, property_reference,
                        zone, subzone, operation, operations, price, rent_price, bedrooms, bathrooms, square_meters, stay,
                        agency_id, created_at) VALUES
  ('a9100000-0000-0000-0000-000000000001', 's-r1', 'Alquiler Recoletos 2d', 'available', 'es', NULL, 'BC-7701', 'idealista-7701', 'PROP-2026-7701',
   'Salamanca', 'Recoletos', 'rent', '{rent}', 3000, NULL, 2, 1, 80, 'long', 'a9000000-0000-0000-0000-0000000000a1', '2026-09-01'),
  ('a9100000-0000-0000-0000-000000000002', 's-r2', 'Alquiler Chueca 3d', 'reserved', 'es', NULL, 'BC-7702', NULL, 'PROP-2026-7702',
   'Chueca', NULL, 'rent', '{rent}', 4500, NULL, 3, 2, 120, 'short', 'a9000000-0000-0000-0000-0000000000a2', '2026-09-02'),
  ('a9100000-0000-0000-0000-000000000003', 's-d1', 'Dual Chamberi 4d', 'available', 'es', NULL, 'BC-7703', NULL, 'PROP-2026-7703',
   'Chamberi', 'Almagro', 'sale', '{sale,rent}', 2100000, 6000, 4, 3, 200, 'long', 'a9000000-0000-0000-0000-0000000000a1', '2026-09-03'),
  ('a9100000-0000-0000-0000-000000000004', 's-s1', 'Venta Goya 1d', 'available', 'es', NULL, 'BC-7704', NULL, 'PROP-2026-7704',
   'Madrid', 'Goya', 'sale', '{sale}', 450000, NULL, 1, 1, NULL, NULL, NULL, '2026-09-04'),
  ('a9100000-0000-0000-0000-000000000005', 's-sold', 'Vendida Recoletos', 'sold', 'es', NULL, 'BC-7705', NULL, 'PROP-2026-7705',
   'Salamanca', 'Recoletos', 'sale', '{sale}', 900000, NULL, 2, 2, 90, NULL, NULL, '2026-09-05'),
  ('a9100000-0000-0000-0000-000000000006', 's-arch', 'Archivada Recoletos', 'available', 'es', '2026-09-30', 'BC-7706', NULL, 'PROP-2026-7706',
   'Salamanca', 'Recoletos', 'rent', '{rent}', 3200, NULL, 2, 1, 75, 'long', NULL, '2026-09-06'),
  ('a9100000-0000-0000-0000-000000000007', 's-arch2', 'Estado archivada', 'archived', 'es', NULL, 'BC-7707', NULL, 'PROP-2026-7707',
   'Salamanca', 'Recoletos', 'rent', '{rent}', 3300, NULL, 2, 1, 75, 'long', NULL, '2026-09-07'),
  ('a9100000-0000-0000-0000-000000000008', 's-cl', 'Depto Chile', 'available', 'cl', NULL, 'BC-7708', NULL, 'PROP-2026-7708',
   'Providencia', NULL, 'rent', '{rent}', 3000, NULL, 2, 1, 80, 'long', NULL, '2026-09-08'),
  ('a9100000-0000-0000-0000-000000000009', 's-r3', 'Alquiler Justicia exacto 3000', 'available', 'es', NULL, 'BC-7709', NULL, 'PROP-2026-7709',
   'Centro', 'Justicia', 'rent', '{rent}', 3000, NULL, 3, 1, 60, NULL, 'a9000000-0000-0000-0000-0000000000a2', '2026-09-09');
INSERT INTO property_tag_links (property_id, tag_id) VALUES
  ('a9100000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000e1'),
  ('a9100000-0000-0000-0000-000000000003', 'a9000000-0000-0000-0000-0000000000e2'),
  ('a9100000-0000-0000-0000-000000000003', 'a9000000-0000-0000-0000-0000000000e1');
INSERT INTO property_photos (property_id, url, position, is_cover) VALUES
  ('a9100000-0000-0000-0000-000000000001', 'https://storage.example/s-r1-0.webp', 0, false),
  ('a9100000-0000-0000-0000-000000000001', 'https://storage.example/s-r1-1.webp', 1, true),
  ('a9100000-0000-0000-0000-000000000003', 'https://storage.example/s-d1-0.webp', 0, true);

-- Slugs de una búsqueda, en orden (solo los s-*: las fixtures comunes también son de España).
CREATE OR REPLACE FUNCTION test_util.ss(p_catalog uuid, p_filters jsonb)
RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(r->>'slug' ORDER BY o), '{}')
    FROM jsonb_array_elements((catalog_search('00000000-0000-0000-0000-0000000000f1', p_catalog, p_filters, 0, NULL))->'rows')
         WITH ORDINALITY AS x(r, o)
   WHERE r->>'slug' LIKE 's-%'
$$;
CREATE OR REPLACE FUNCTION test_util.sset(p_catalog uuid, p_filters jsonb)
RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(s ORDER BY s), '{}') FROM unnest(test_util.ss(p_catalog, p_filters)) s
$$;

SET ROLE service_role;
SELECT catalog_create(:'owner', 'Buscar', NULL) AS cat \gset
SELECT catalog_create(:'owner', 'Auto', NULL) AS cat_auto \gset

-- ── Permisos ────────────────────────────────────────────────────────────────
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'other', :'cat', '{}'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_search(NULL, %L, %L, 0, NULL)', :'cat', '{}'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', gen_random_uuid(), '{}'), 'forbidden');

-- ── Universo y estados ──────────────────────────────────────────────────────
SELECT test_util.ok(test_util.sset(:'cat', '{}') = '{s-d1,s-r1,s-r2,s-r3,s-s1}',
  'por defecto: España, disponibles y reservadas (ni vendida, ni archivadas, ni Chile)');
SELECT test_util.ok(test_util.sset(:'cat', '{"statuses":["sold"]}') = '{s-sold}', 'estado: vendidas');
SELECT test_util.ok(test_util.sset(:'cat', '{"statuses":["archived"]}') = '{s-arch,s-arch2}',
  'estado: archivadas = archived_at o status archived');
SELECT test_util.ok(test_util.sset(:'cat', '{"statuses":["reserved"]}') = '{s-r2}', 'estado: reservadas');
SELECT test_util.ok(
  (SELECT bool_and(r->>'status' = CASE r->>'slug' WHEN 's-arch' THEN 'archived' WHEN 's-arch2' THEN 'archived' WHEN 's-sold' THEN 'sold' WHEN 's-r2' THEN 'reserved' ELSE 'available' END)
     FROM jsonb_array_elements(catalog_search(:'owner', :'cat', '{"statuses":["available","reserved","sold","archived"]}', 0, NULL)->'rows') r
    WHERE r->>'slug' LIKE 's-%'),
  'cada fila trae su estado efectivo');

-- ── Operación y precio (K2) ─────────────────────────────────────────────────
SELECT test_util.ok(test_util.sset(:'cat', '{"operation":"rent"}') = '{s-d1,s-r1,s-r2,s-r3}', 'alquiler: incluye la dual');
SELECT test_util.ok(test_util.sset(:'cat', '{"operation":"sale"}') = '{s-d1,s-s1}', 'venta: dual y solo venta');
SELECT test_util.ok(test_util.sset(:'cat', '{"operation":"rent","price_max":6000}') = '{s-d1,s-r1,s-r2,s-r3}',
  'K2: la dual en alquiler compara rent_price (6000), no el de venta');
SELECT test_util.ok(test_util.sset(:'cat', '{"operation":"rent","price_max":5999}') = '{s-r1,s-r2,s-r3}', 'precio máximo: 5999 deja fuera la dual');
SELECT test_util.ok(test_util.sset(:'cat', '{"operation":"rent","price_min":3000,"price_max":3000}') = '{s-r1,s-r3}', 'precio: límites inclusivos');
SELECT test_util.ok(test_util.sset(:'cat', '{"operation":"sale","price_min":1000000}') = '{s-d1}', 'venta: la dual compara su precio de venta');
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', :'cat', '{"price_max":5000}'), 'invalid_filters');

-- ── Zonas (taxonomía en zone O subzone) ─────────────────────────────────────
SELECT test_util.ok(test_util.sset(:'cat', '{"zones":[{"kind":"barrio","name":"Recoletos"}]}') = '{s-r1}', 'barrio en subzone');
SELECT test_util.ok(test_util.sset(:'cat', '{"zones":[{"kind":"barrio","name":"Justicia"}]}') = '{s-r2,s-r3}',
  'barrio por alias (Chueca → Justicia) y en subzone');
SELECT test_util.ok(test_util.sset(:'cat', '{"zones":[{"kind":"district","name":"Chamberí"}]}') = '{s-d1}', 'distrito sin tilde en los datos');
SELECT test_util.ok(test_util.sset(:'cat', '{"zones":[{"kind":"district","name":"Salamanca"}]}') = '{s-r1,s-s1}',
  'distrito: zona Salamanca y barrio Goya en subzone');
SELECT test_util.ok(test_util.sset(:'cat', '{"zones":[{"kind":"free","name":"madrid"}]}') = '{s-s1}', 'texto libre');
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', :'cat', '{"zones":[{"kind":"district","name":"Atlantis"}]}'), 'invalid_filters');

-- ── m², dormitorios, baños, estancia ────────────────────────────────────────
SELECT test_util.ok(test_util.sset(:'cat', '{"area_min":80,"area_max":120}') = '{s-r1,s-r2}', 'm²: inclusivo; sin m² queda fuera');
SELECT test_util.ok(test_util.sset(:'cat', '{"area_max":100000}') = '{s-d1,s-r1,s-r2,s-r3}', 'm²: sin dato no cumple ningún límite');
SELECT test_util.ok(test_util.sset(:'cat', '{"bedrooms":3}') = '{s-r2,s-r3}', 'dormitorios exactos');
SELECT test_util.ok(test_util.sset(:'cat', '{"bedrooms":3,"bedrooms_mode":"min"}') = '{s-d1,s-r2,s-r3}', 'dormitorios N o más');
SELECT test_util.ok(test_util.sset(:'cat', '{"bathrooms_min":2}') = '{s-d1,s-r2}', 'baños mínimos');
SELECT test_util.ok(test_util.sset(:'cat', '{"stay":"long"}') = '{s-d1,s-r1}', 'estancia larga, estricta (sin dato fuera)');
SELECT test_util.ok(test_util.sset(:'cat', '{"stay":"short"}') = '{s-r2}', 'estancia corta');

-- ── Agencia y etiquetas ─────────────────────────────────────────────────────
SELECT test_util.ok(test_util.sset(:'cat', '{"agency_ids":["a9000000-0000-0000-0000-0000000000a2"]}') = '{s-r2,s-r3}', 'agencia');
SELECT test_util.ok(test_util.sset(:'cat', '{"tag_ids":["a9000000-0000-0000-0000-0000000000e2"]}') = '{s-d1}', 'etiqueta');
SELECT test_util.ok(test_util.sset(:'cat', '{"tag_ids":["a9000000-0000-0000-0000-0000000000e1","a9000000-0000-0000-0000-0000000000e2"]}') = '{s-d1,s-r1}',
  'etiquetas: basta una');
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', :'cat', '{"tag_ids":["no-uuid"]}'), 'invalid_filters');

-- ── Filtros combinados y valores inválidos ─────────────────────────────────
SELECT test_util.ok(test_util.sset(:'cat', '{"operation":"rent","zones":[{"kind":"district","name":"Centro"}],"bedrooms":3,"bedrooms_mode":"min","price_max":4500}') = '{s-r2,s-r3}',
  'combinados: alquiler + Centro + 3 o más + hasta 4500');
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', :'cat', '{"area_min":100,"area_max":50}'), 'invalid_filters');
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', :'cat', '{"bedrooms":2.5}'), 'invalid_filters');
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', :'cat', '{"statuses":[]}'), 'invalid_filters');
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', :'cat', '{"statuses":["rented"]}'), 'invalid_filters');
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', :'cat', '{"stay":"larga"}'), 'invalid_filters');
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', :'cat', '{"sort":"random"}'), 'invalid_filters');

-- ── Orden ───────────────────────────────────────────────────────────────────
SELECT test_util.ok(test_util.ss(:'cat', '{"operation":"rent","sort":"price_asc"}') = '{s-r3,s-r1,s-r2,s-d1}',
  'precio ascendente (empate 3000: más reciente primero)');
SELECT test_util.ok(test_util.ss(:'cat', '{"operation":"rent","sort":"price_desc"}') = '{s-d1,s-r2,s-r3,s-r1}', 'precio descendente');
SELECT test_util.ok(test_util.ss(:'cat', '{}') = '{s-r3,s-s1,s-d1,s-r2,s-r1}', 'más recientes primero (por defecto)');

-- ── Datos de cada fila ──────────────────────────────────────────────────────
SELECT r AS row_r1 FROM jsonb_array_elements(catalog_search(:'owner', :'cat', '{"operation":"rent"}', 0, NULL)->'rows') r
 WHERE r->>'slug' = 's-r1' \gset
SELECT test_util.ok((:'row_r1'::jsonb)->>'agency_name' = 'Level', 'fila: nombre de la agencia');
SELECT test_util.ok((:'row_r1'::jsonb)->'tag_names' = '["Exclusiva"]', 'fila: nombres de etiquetas');
SELECT test_util.ok((:'row_r1'::jsonb)->>'cover_url' = 'https://storage.example/s-r1-1.webp' AND ((:'row_r1'::jsonb)->>'photo_count')::int = 2,
  'fila: portada (is_cover) y número de fotos');
SELECT test_util.ok((:'row_r1'::jsonb)->>'external_id' = 'idealista-7701' AND (:'row_r1'::jsonb)->>'property_reference' = 'PROP-2026-7701',
  'fila: referencias para el buscador de texto');
SELECT test_util.ok((:'row_r1'::jsonb)->'texts' = 'null'::jsonb, 'fila: sin textos de planta salvo que se pidan');
SELECT test_util.ok(
  (SELECT r->'texts' ? 'description' FROM jsonb_array_elements(catalog_search(:'owner', :'cat', '{"with_texts":true}', 0, NULL)->'rows') r WHERE r->>'slug' = 's-r1'),
  'fila: con with_texts trae los textos para resolver la planta');
SELECT test_util.ok(
  (SELECT (r->>'eff_price')::numeric FROM jsonb_array_elements(catalog_search(:'owner', :'cat', '{"operation":"rent"}', 0, NULL)->'rows') r WHERE r->>'slug' = 's-d1') = 6000,
  'fila: precio efectivo K2 de la dual en alquiler');

-- ── Paridad con catalog_candidates (mismas reglas de operación, precio y zonas) ─
DO $$
DECLARE
  c jsonb;
  v_a uuid[];
  v_b uuid[];
BEGIN
  FOR c IN SELECT value FROM jsonb_array_elements('[
      {"operation":"any"},
      {"operation":"rent"},
      {"operation":"sale"},
      {"operation":"rent","price_min":3000,"price_max":6000},
      {"operation":"sale","price_max":500000},
      {"operation":"any","zones":[{"kind":"barrio","name":"Justicia"},{"kind":"district","name":"Chamberí"}]},
      {"operation":"rent","zones":[{"kind":"free","name":"recoletos"}]}
    ]'::jsonb) LOOP
    SELECT coalesce(array_agg(property_id ORDER BY property_id), '{}') INTO v_a
      FROM catalog_candidates(catalog_criteria_normalize(c), false, NULL);
    SELECT coalesce(array_agg((r->>'id')::uuid ORDER BY (r->>'id')::uuid), '{}') INTO v_b
      FROM jsonb_array_elements(catalog_search('00000000-0000-0000-0000-0000000000f1',
             (SELECT id FROM catalogs WHERE title = 'Buscar'), c, 0, NULL)->'rows') r;
    PERFORM test_util.ok(v_a = v_b, 'paridad con catalog_candidates: ' || c::text);
  END LOOP;
END $$;

-- ── Paginación y total ──────────────────────────────────────────────────────
SELECT test_util.ok((catalog_search(:'owner', :'cat', '{"operation":"rent"}', 1, 2)->>'total')::int
                    = (catalog_search(:'owner', :'cat', '{"operation":"rent"}', 0, NULL)->>'total')::int,
  'el total no depende de la página');
SELECT test_util.ok(jsonb_array_length(catalog_search(:'owner', :'cat', '{"operation":"rent"}', 1, 2)->'rows') = 2, 'página de 2');
SELECT test_util.ok(
  (SELECT array_agg(r->>'slug' ORDER BY o) FROM jsonb_array_elements(catalog_search(:'owner', :'cat', '{"operation":"rent","sort":"price_asc"}', 1, 2)->'rows') WITH ORDINALITY x(r, o))
  = (test_util.ss(:'cat', '{"operation":"rent","sort":"price_asc"}'))[2:3],
  'la página 2 es el trozo 2–3 de la lista completa');

-- Más de 2.000 viviendas: total real, sin corte.
RESET ROLE;
INSERT INTO properties (slug, title, status, country, zone, operation, operations, price, bedrooms, created_at)
SELECT 'bulk-' || g, 'Bulk ' || g, 'available', 'es', 'Tetuán', 'sale', '{sale}', 100000 + g, 2, '2026-01-01'::timestamptz + (g || ' minutes')::interval
  FROM generate_series(1, 2100) g;
SET ROLE service_role;
SELECT test_util.ok((catalog_search(:'owner', :'cat', '{"zones":[{"kind":"district","name":"Tetuán"}]}', 0, 50)->>'total')::int = 2100,
  'más de 2.000: total 2100');
SELECT test_util.ok(
  (SELECT r->>'slug' FROM jsonb_array_elements(catalog_search(:'owner', :'cat', '{"zones":[{"kind":"district","name":"Tetuán"}],"sort":"price_asc"}', 2099, 50)->'rows') r) = 'bulk-2100',
  'más de 2.000: la última página llega a la fila 2100');
SELECT test_util.ok(jsonb_array_length(catalog_search(:'owner', :'cat', '{"zones":[{"kind":"district","name":"Tetuán"}]}', 0, NULL)->'rows') = 2100,
  'más de 2.000: sin límite devuelve las 2100 en un solo valor');
SELECT test_util.ok(jsonb_array_length(catalog_search(:'owner', :'cat', '{}', 0, 999)->'rows') = 200, 'el límite por página se acota a 200');

-- ── in_catalog y datos del catálogo ─────────────────────────────────────────
SELECT catalog_add_property(:'owner', :'cat', 'a9100000-0000-0000-0000-000000000001');
SELECT test_util.ok(
  (SELECT bool_and((r->>'in_catalog')::boolean = (r->>'slug' = 's-r1')) FROM jsonb_array_elements(catalog_search(:'owner', :'cat', '{}', 0, NULL)->'rows') r WHERE r->>'slug' LIKE 's-%'),
  'in_catalog solo en la que está');
SELECT test_util.ok(catalog_search(:'owner', :'cat', '{}', 0, 1)->'catalog' = '{"mode":"manual","status":"active","visible":1,"max":24}',
  'datos del catálogo: modo, estado, visibles y máximo');

-- ── Máximo de 24 ────────────────────────────────────────────────────────────
SELECT catalog_create(:'owner', 'Lleno', NULL) AS full_cat \gset
SELECT count(catalog_add_property(:'owner', :'full_cat', p.id))
  FROM (SELECT id FROM properties WHERE slug LIKE 'bulk-%' ORDER BY slug LIMIT 24) p;
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'full_cat',
  (SELECT id FROM properties WHERE slug = 'bulk-999')), 'catalog_full');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'full_cat',
  (SELECT p.id FROM catalog_items ci JOIN properties p ON p.id = ci.property_id WHERE ci.catalog_id = :'full_cat' LIMIT 1)), 'already_in_catalog');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'full_cat',
  'a9100000-0000-0000-0000-000000000005'), 'property_not_available');
-- Una vendida libera plaza (cuentan las visibles).
RESET ROLE;
UPDATE properties SET status = 'sold'
 WHERE id = (SELECT ci.property_id FROM catalog_items ci WHERE ci.catalog_id = :'full_cat' ORDER BY ci.position LIMIT 1);
SET ROLE service_role;
SELECT test_util.ok(catalog_add_property(:'owner', :'full_cat', (SELECT id FROM properties WHERE slug = 'bulk-999')) > 0,
  'con una vendida, cabe otra (24 visibles)');
SELECT test_util.ok((SELECT count(*) FROM catalog_items WHERE catalog_id = :'full_cat') = 25, 'la vendida sigue guardada en la lista');
-- Un catálogo que YA tiene más de 24 no pierde nada.
RESET ROLE;
SELECT catalog_create(:'owner', 'Grande', NULL) AS big_cat \gset
INSERT INTO catalog_items (catalog_id, property_id, position)
SELECT :'big_cat', id, row_number() OVER (ORDER BY slug) * 100 FROM (SELECT id, slug FROM properties WHERE slug LIKE 'bulk-1%' ORDER BY slug LIMIT 30) x;
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'big_cat',
  (SELECT id FROM properties WHERE slug = 'bulk-2000')), 'catalog_full');
SELECT test_util.ok((SELECT count(*) FROM catalog_items WHERE catalog_id = :'big_cat') = 30, 'con 30, conserva las 30');
SELECT test_util.ok(catalog_remove_item(:'owner', :'big_cat', (SELECT ci.property_id FROM catalog_items ci WHERE ci.catalog_id = :'big_cat' LIMIT 1)) > 0,
  'quitar sigue funcionando por encima del máximo');

-- ── Operación del catálogo ──────────────────────────────────────────────────
SELECT version AS v0, criteria AS c0 FROM catalogs WHERE id = :'cat' \gset
SELECT test_util.ok(catalog_set_operation(:'owner', :'cat', 'rent') = :v0 + 1, 'operación: sube la versión');
SELECT test_util.ok((SELECT criteria FROM catalogs WHERE id = :'cat') = jsonb_set(:'c0'::jsonb, '{operation}', '"rent"'),
  'operación: solo cambia criteria.operation');
SELECT test_util.ok(catalog_set_operation(:'owner', :'cat', 'rent') = :v0 + 1, 'operación igual: no cambia la versión');
RESET ROLE;
UPDATE catalogs SET criteria = criteria || '{"price_min": 1000, "price_max": 9000}' WHERE id = :'cat';
SET ROLE service_role;
SELECT catalog_set_operation(:'owner', :'cat', 'any');
SELECT test_util.ok((SELECT criteria->>'operation' = 'any' AND criteria->'price_min' = 'null' AND criteria->'price_max' = 'null' FROM catalogs WHERE id = :'cat'),
  'con «ambas» se quitan los precios');
SELECT test_util.ok(catalog_criteria_normalize((SELECT criteria FROM catalogs WHERE id = :'cat')) IS NOT NULL, 'los criterios siguen siendo válidos');
SELECT test_util.expect_error(format('SELECT catalog_set_operation(%L, %L, %L)', :'other', :'cat', 'sale'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_set_operation(%L, %L, %L)', :'owner', :'cat', 'venta'), 'invalid_criteria');
SELECT catalog_set_mode(:'owner', :'cat_auto', 'auto', NULL);
SELECT test_util.expect_error(format('SELECT catalog_set_operation(%L, %L, %L)', :'owner', :'cat_auto', 'sale'), 'catalog_auto');
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'cat_auto', 'a9100000-0000-0000-0000-000000000001'), 'catalog_auto');

-- Un automático: in_catalog = su lista efectiva (lo que ve el lector).
SELECT test_util.ok(catalog_search(:'owner', :'cat_auto', '{}', 0, 1)->'catalog'->>'mode' = 'auto', 'automático: el buscador lo dice');

-- ── Permisos de ejecución ───────────────────────────────────────────────────
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT catalog_search(%L, %L, %L, 0, NULL)', :'owner', :'cat', '{}'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_set_operation(%L, %L, %L)', :'owner', :'cat', 'sale'), 'insufficient_privilege');
RESET ROLE;
SET ROLE anon;
SELECT test_util.expect_error(format('SELECT catalog_add_property(%L, %L, %L)', :'owner', :'cat', 'a9100000-0000-0000-0000-000000000002'), 'insufficient_privilege');
RESET ROLE;

SELECT 'test-catalog-search.sql: OK' AS resultado;
