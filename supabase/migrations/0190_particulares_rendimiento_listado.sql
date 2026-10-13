-- 0190 · Rendimiento del listado /admin/particulares
--
-- 1) Índices trigram para la búsqueda de texto («Orense 49»): el .or() del
--    listado hace ILIKE '%…%' sobre zone, description, address,
--    particular_reference y scraper_extra->>'agency_reference' (los demás
--    campos ya tienen trigram en 0185). Sin ellos Postgres recorría las ~89k
--    filas (≈1,6 s la página + ≈1,0 s el conteo); con ellos ≈0,2 s cada una.
--    Para que el planificador use BitmapOr hacen falta TODOS los campos del OR.
-- 2) Función particulares_zone_counts(): conteos por zona/portal agrupados en
--    SQL (≈2k filas) en vez de bajar ≈22k filas en 22 peticiones de 1000.
--
-- Este runner (scripts/apply-migrations.sh) NO envuelve el fichero en una
-- transacción (psql < fichero), así que CREATE INDEX CONCURRENTLY funciona y no
-- bloquea las escrituras del crawler. NO añadas BEGIN/COMMIT a este fichero.
-- Tamaño estimado: description ≈107 MB (≈35 s), el resto ≈15 MB (≈2 s).
-- Idempotente. Si una ejecución anterior se cortó y dejó un índice INVALID,
-- se borra aquí para que IF NOT EXISTS lo reconstruya.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE NOT i.indisvalid
      AND c.relname IN (
        'particulares_zone_trgm', 'particulares_description_trgm', 'particulares_address_trgm',
        'particulares_particular_reference_trgm', 'particulares_agency_reference_trgm'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.relname);
  END LOOP;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS particulares_zone_trgm
  ON particulares USING gin (zone gin_trgm_ops) WHERE zone IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS particulares_address_trgm
  ON particulares USING gin (address gin_trgm_ops) WHERE address IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS particulares_particular_reference_trgm
  ON particulares USING gin (particular_reference gin_trgm_ops) WHERE particular_reference IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS particulares_agency_reference_trgm
  ON particulares USING gin ((scraper_extra->>'agency_reference') gin_trgm_ops)
  WHERE scraper_extra->>'agency_reference' IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS particulares_description_trgm
  ON particulares USING gin (description gin_trgm_ops) WHERE description IS NOT NULL;

-- Conteos del desplegable de zonas y del desglose por portal.
-- p_advertiser: '' = todos · 'unknown' = sin clasificar · 'particular' | 'professional'.
CREATE OR REPLACE FUNCTION particulares_zone_counts(p_advertiser text DEFAULT '')
RETURNS TABLE (zone text, municipality text, is_active boolean, portal text, total bigint, missing_phone bigint)
LANGUAGE sql STABLE AS $$
  SELECT p.zone, p.scraper_extra->>'municipality', p.is_active, p.portal,
         count(*), count(*) FILTER (WHERE p.phone IS NULL)
  FROM particulares p
  WHERE CASE
          WHEN coalesce(p_advertiser, '') = '' THEN true
          WHEN p_advertiser = 'unknown' THEN (p.advertiser_type IS NULL OR p.advertiser_type = 'unknown')
          ELSE p.advertiser_type = p_advertiser
        END
  GROUP BY 1, 2, 3, 4
$$;

NOTIFY pgrst, 'reload schema';
