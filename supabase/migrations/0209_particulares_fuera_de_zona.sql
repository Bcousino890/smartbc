-- ============================================================
-- SmartBC · Anuncios «fuera de zona» de particulares
-- ============================================================
-- El crawler marca con scraper_extra.fuera_de_zona = 'true' (y fuera_de_zona_desde) los anuncios cuya zona
-- ya no está marcada en Sindicación: siguen activos/retirados como estaban, pero dejan de rastrearse.
-- La lista de /admin/particulares los oculta por defecto (?fuera_zona=1 los muestra).
--
-- 1) Índice PARCIAL sobre la expresión (solo las filas marcadas, ≈19k de ≈90k): lo usan el cruce
--    (linking-runner: «dame los fuera de zona») y cualquier consulta `scraper_extra->>'fuera_de_zona' = 'true'`.
-- 2) particulares_zone_counts() gana p_include_fuera (por defecto false: no cuenta los fuera de zona).
--
-- El runner (scripts/apply-migrations.sh) NO envuelve el fichero en transacción, así que
-- CREATE INDEX CONCURRENTLY funciona y no bloquea al crawler. NO añadas BEGIN/COMMIT. Idempotente.
-- ============================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE NOT i.indisvalid AND c.relname = 'particulares_fuera_de_zona_idx'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.relname);
  END LOOP;
END $$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS particulares_fuera_de_zona_idx
  ON particulares ((scraper_extra->>'fuera_de_zona'))
  WHERE scraper_extra->>'fuera_de_zona' = 'true';

-- Se cambia la firma: se borra la versión de 1 parámetro para no dejar dos sobrecargas (PostgREST las vería ambiguas).
DROP FUNCTION IF EXISTS particulares_zone_counts(text);

CREATE OR REPLACE FUNCTION particulares_zone_counts(p_advertiser text DEFAULT '', p_include_fuera boolean DEFAULT false)
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
    AND (p_include_fuera OR coalesce(p.scraper_extra->>'fuera_de_zona', '') <> 'true')
  GROUP BY 1, 2, 3, 4
$$;

NOTIFY pgrst, 'reload schema';
