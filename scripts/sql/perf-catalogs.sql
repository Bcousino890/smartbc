-- ============================================================================
-- SOLO MEDICIÓN LOCAL (BCP-01 ampliación X6, condición 3). Datos sintéticos.
-- Uso: lo llama scripts/sql/perf-catalogs.sh con -v n=<propiedades> y
-- -v phase=<base|propuesta>. Crea los datos (solo en la fase base), mide y
-- deja los resultados en perf.results.
--
-- Índices: solo los que ya declaran las migraciones del repo sobre
-- properties/property_photos (0001, 0003, 0084/0085, 0110…): (status,country),
-- (country) parcial, (zone), (subzone), (price), GIN(operations) y fotos por
-- (property_id, position). NINGUNO nuevo.
-- ============================================================================
\set ON_ERROR_STOP 1
CREATE SCHEMA IF NOT EXISTS perf;
CREATE TABLE IF NOT EXISTS perf.results (
  n int, phase text, label text, reps int,
  p50_ms numeric, p95_ms numeric, max_ms numeric, size_bytes int, items int, total int
);

CREATE OR REPLACE FUNCTION perf.measure(p_label text, p_sql text, p_reps int, p_n int, p_phase text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t0 timestamptz; d numeric[] := '{}'; i int; v jsonb;
BEGIN
  FOR i IN 1..10 LOOP EXECUTE p_sql; END LOOP;            -- calentamiento
  FOR i IN 1..p_reps LOOP
    t0 := clock_timestamp();
    EXECUTE p_sql;
    d := d || (extract(epoch FROM clock_timestamp() - t0) * 1000)::numeric;
  END LOOP;
  INSERT INTO perf.results (n, phase, label, reps, p50_ms, p95_ms, max_ms)
  SELECT p_n, p_phase, p_label, p_reps,
         round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY x)::numeric, 2),
         round(percentile_cont(0.95) WITHIN GROUP (ORDER BY x)::numeric, 2),
         round(max(x), 2)
    FROM unnest(d) x;
END $$;

\if :{?gen}
-- ── Datos (solo una vez por tamaño, antes de 0195) ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_props_status_country ON properties (status, country);
CREATE INDEX IF NOT EXISTS idx_properties_country   ON properties (country) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_props_zone           ON properties (zone);
CREATE INDEX IF NOT EXISTS idx_properties_subzone   ON properties (subzone);
CREATE INDEX IF NOT EXISTS idx_props_price          ON properties (price);
CREATE INDEX IF NOT EXISTS idx_properties_operations ON properties USING gin (operations);
CREATE INDEX IF NOT EXISTS idx_property_photos_property ON property_photos (property_id, position);

SELECT setseed(0.42);
CREATE TEMP TABLE zpool (z text, sz text);
INSERT INTO zpool VALUES
  ('Salamanca','Goya'),('Salamanca','Recoletos'),('Salamanca','Lista'),('Salamanca, Madrid',NULL),('Barrio de Salamanca',NULL),
  ('Centro','Justicia'),('Chueca',NULL),('Malasaña',NULL),('Centro','Cortes'),('Huertas - Madrid',NULL),
  ('Chamberí','Almagro'),('Chamberí','Trafalgar'),('Retiro','Ibiza'),('Retiro','Jerónimos'),('Chamartín','El Viso'),
  ('Tetuán','Cuatro Caminos'),('Madrid','Justicia'),('Moncloa-Aravaca','Argüelles'),('Pozuelo de Alarcón',NULL),
  ('Majadahonda',NULL),('Las Rozas',NULL),('',NULL),('Madrid',NULL),('Arganzuela','Delicias');
CREATE TEMP TABLE zp AS SELECT row_number() OVER () AS k, z, sz FROM zpool;

INSERT INTO properties (id, slug, title, status, country, archived_at, zone, subzone, operation, operations, price, rent_price,
                        bedrooms, bathrooms, square_meters, description, features, created_at)
SELECT gen_random_uuid(), 'perf-' || g, 'Vivienda sintética ' || g,
       (ARRAY['available','available','available','available','available','available','available','available','reserved','sold'])[1 + (g % 10)]::property_status,
       CASE WHEN g % 50 = 0 THEN 'cl' ELSE 'es' END,
       CASE WHEN g % 20 = 0 THEN now() END,
       zp.z, zp.sz,
       CASE WHEN g % 10 < 6 THEN 'sale' ELSE 'rent' END::property_operation,
       CASE WHEN g % 10 = 0 THEN ARRAY['sale','rent'] WHEN g % 10 < 6 THEN ARRAY['sale'] ELSE ARRAY['rent'] END,
       CASE WHEN g % 20 = 1 THEN 0 WHEN g % 10 < 6 THEN 250000 + (g::bigint * 7919 % 40) * 50000 ELSE 900 + (g::bigint * 104729 % 30) * 250 END,
       CASE WHEN g % 10 = 0 THEN 2000 + (g % 20) * 250 END,
       1 + g % 5, 1 + g % 3, 50 + g % 200,
       repeat('Descripción sintética de la vivienda con luz, techos altos y buena distribución. ', 6),
       ARRAY['Ascensor','Terraza','Calefacción central'],
       '2026-01-01'::timestamptz + (g % 5000) * interval '1 hour'
  FROM generate_series(1, :n) g
  JOIN zp ON zp.k = 1 + (g::bigint * 31 % (SELECT count(*) FROM zp));
-- ~8 fotos por propiedad (3 % sin fotos).
INSERT INTO property_photos (property_id, url, position, is_cover, source_width, source_height)
SELECT p.id, 'https://storage.example/perf/' || p.slug || '/' || k || '.webp', k, k = 0, 1600, 1067
  FROM properties p CROSS JOIN generate_series(0, 7) k
 WHERE p.slug LIKE 'perf-%' AND (substr(p.slug, 6)::int % 33) <> 0;
ANALYZE properties; ANALYZE property_photos;

-- 20 catálogos manuales de 12 viviendas, con enlace.
SET ROLE service_role;
DO $$
DECLARE i int; c uuid; pid uuid;
BEGIN
  FOR i IN 1..20 LOOP
    c := catalog_create('00000000-0000-0000-0000-0000000000f1', 'Perf manual ' || i, NULL);
    FOR pid IN SELECT id FROM properties WHERE slug LIKE 'perf-%' AND country = 'es' AND archived_at IS NULL
                 AND status::text IN ('available','reserved') ORDER BY slug OFFSET i * 12 LIMIT 12 LOOP
      PERFORM catalog_add_property('00000000-0000-0000-0000-0000000000f1', c, pid);
    END LOOP;
    PERFORM catalog_share_create('00000000-0000-0000-0000-0000000000f1', c, 60);
  END LOOP;
END $$;
RESET ROLE;
\endif

-- ── Medición ────────────────────────────────────────────────────────────────
SELECT array_agg(s.token ORDER BY c.title) AS manual_tokens
  FROM catalogs c JOIN catalog_shares s ON s.catalog_id = c.id WHERE c.title LIKE 'Perf manual %' \gset
SELECT c.id AS manual_cat FROM catalogs c WHERE c.title = 'Perf manual 1' \gset

SELECT perf.measure('manual 12 · instantánea', format('SELECT md5(catalog_internal_snapshot(%L)::text)', :'manual_cat'), 200, :n, :'phase');
SELECT perf.measure('manual · get_catalog_states ×1',  format('SELECT count(*) FROM get_catalog_states((%L::text[])[1:1])',  :'manual_tokens'), 200, :n, :'phase');
SELECT perf.measure('manual · get_catalog_states ×5',  format('SELECT count(*) FROM get_catalog_states((%L::text[])[1:5])',  :'manual_tokens'), 200, :n, :'phase');
SELECT perf.measure('manual · get_catalog_states ×20', format('SELECT count(*) FROM get_catalog_states((%L::text[])[1:20])', :'manual_tokens'), 100, :n, :'phase');
UPDATE perf.results SET size_bytes = (SELECT octet_length(catalog_internal_snapshot(:'manual_cat')::text)),
                        items = (SELECT jsonb_array_length(catalog_internal_snapshot(:'manual_cat')->'items'))
 WHERE n = :n AND phase = :'phase' AND label = 'manual 12 · instantánea';

\if :{?auto}
-- Catálogos automáticos (solo con 0195).
SET ROLE service_role;
DO $$
DECLARE i int; c uuid; crit jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM catalogs WHERE title LIKE 'Perf auto %') THEN RETURN; END IF;
  FOR i IN 1..20 LOOP
    crit := CASE i % 4
      WHEN 1 THEN '{"operation":"sale","zones":[{"kind":"district","name":"Salamanca"},{"kind":"barrio","name":"Justicia"}],"price_min":500000,"price_max":2000000,"max":12}'
      WHEN 2 THEN '{"operation":"sale","max":24}'
      WHEN 3 THEN '{"operation":"rent","zones":[{"kind":"district","name":"Chamberí"},{"kind":"district","name":"Retiro"},{"kind":"free","name":"Pozuelo de Alarcón"}],"price_max":5000,"max":24}'
      ELSE        '{"operation":"any","zones":[{"kind":"district","name":"Centro"}],"sort":"newest","max":12}'
    END;
    c := catalog_create('00000000-0000-0000-0000-0000000000f1', 'Perf auto ' || lpad(i::text, 2, '0'), NULL);
    PERFORM catalog_set_criteria('00000000-0000-0000-0000-0000000000f1', c, crit);
    PERFORM catalog_set_mode('00000000-0000-0000-0000-0000000000f1', c, 'auto', NULL);
    PERFORM catalog_share_create('00000000-0000-0000-0000-0000000000f1', c, 60);
  END LOOP;
END $$;
RESET ROLE;
SELECT array_agg(s.token ORDER BY c.title) AS auto_tokens
  FROM catalogs c JOIN catalog_shares s ON s.catalog_id = c.id WHERE c.title LIKE 'Perf auto %' \gset
SELECT id AS narrow FROM catalogs WHERE title = 'Perf auto 01' \gset
SELECT id AS broad  FROM catalogs WHERE title = 'Perf auto 02' \gset
SELECT id AS rentc  FROM catalogs WHERE title = 'Perf auto 03' \gset
SELECT perf.measure('auto estrecho (Salamanca+Justicia, venta, rango, 12) · instantánea', format('SELECT md5(catalog_internal_snapshot(%L)::text)', :'narrow'), 200, :n, :'phase');
SELECT perf.measure('auto amplio (toda venta, 24) · instantánea', format('SELECT md5(catalog_internal_snapshot(%L)::text)', :'broad'), 200, :n, :'phase');
SELECT perf.measure('auto alquiler (3 zonas, ≤5.000, 24) · instantánea', format('SELECT md5(catalog_internal_snapshot(%L)::text)', :'rentc'), 200, :n, :'phase');
SELECT perf.measure('auto · get_catalog_states ×1',  format('SELECT count(*) FROM get_catalog_states((%L::text[])[2:2])', :'auto_tokens'), 200, :n, :'phase');
SELECT perf.measure('auto · get_catalog_states ×5',  format('SELECT count(*) FROM get_catalog_states((%L::text[])[1:5])',  :'auto_tokens'), 100, :n, :'phase');
SELECT perf.measure('auto · get_catalog_states ×20', format('SELECT count(*) FROM get_catalog_states((%L::text[])[1:20])', :'auto_tokens'), 30, :n, :'phase');
SELECT perf.measure('mixto · get_catalog_states 5 manual + 5 auto', format('SELECT count(*) FROM get_catalog_states((%L::text[])[1:5] || (%L::text[])[1:5])', :'manual_tokens', :'auto_tokens'), 100, :n, :'phase');
UPDATE perf.results r SET size_bytes = octet_length(catalog_internal_snapshot(x.id)::text),
                          items = jsonb_array_length(catalog_internal_snapshot(x.id)->'items'),
                          total = (SELECT max(total) FROM catalog_select(x.id, (SELECT criteria FROM catalogs WHERE id = x.id)))
  FROM (VALUES ('auto estrecho (Salamanca+Justicia, venta, rango, 12) · instantánea', :'narrow'::uuid),
               ('auto amplio (toda venta, 24) · instantánea', :'broad'::uuid),
               ('auto alquiler (3 zonas, ≤5.000, 24) · instantánea', :'rentc'::uuid)) x(label, id)
 WHERE r.n = :n AND r.phase = :'phase' AND r.label = x.label;
\o :plan
EXPLAIN (ANALYZE, BUFFERS) SELECT md5(catalog_internal_snapshot(:'broad')::text);
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM catalog_select(:'broad', (SELECT criteria FROM catalogs WHERE id = :'broad'));
\o
\endif
