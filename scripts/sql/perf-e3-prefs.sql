-- ============================================================================
-- SOLO MEDICIÓN LOCAL (BCP-01 E3). Peor caso de ajustes de fotos: en TODAS las
-- viviendas efectivas de los catálogos de medición, la 2.ª foto excluida y la
-- 3.ª elegida como apertura (si las hay). Directo a la tabla (es una medición,
-- no una prueba de las reglas). Lo llama perf-e3.sh.
-- ============================================================================
\set ON_ERROR_STOP 1
INSERT INTO catalog_photo_prefs (catalog_id, property_id, photo_id, kind)
SELECT c.id, e.pid, ph.id, CASE ph.rn WHEN 2 THEN 'exclude' ELSE 'opening' END
  FROM catalogs c
  CROSS JOIN LATERAL unnest(catalog_effective_ids(c.id)) AS e(pid)
  JOIN LATERAL (
    SELECT id, row_number() OVER (ORDER BY position, id) AS rn FROM property_photos WHERE property_id = e.pid
  ) ph ON ph.rn IN (2, 3)
 WHERE c.title LIKE 'Perf %'
ON CONFLICT DO NOTHING;
ANALYZE catalog_photo_prefs;
SELECT count(*) FILTER (WHERE kind = 'exclude') AS excluidas, count(*) FILTER (WHERE kind = 'opening') AS aperturas FROM catalog_photo_prefs;
