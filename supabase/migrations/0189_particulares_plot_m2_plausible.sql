-- ============================================================
-- SmartBC · Parcela plausible (corrige 0183: parcelas de 1-9 m²)
-- ============================================================
-- Medición previa (6.500 con parcela): 14 con 1-9 m² (casi todo chalets/adosados de
-- 75-340 m² construidos; el dato viene así del portal, scraper_extra.plot_area_m2 = 1..9),
-- 34 más con 10+ m² pero menos del 15 % de lo construido, y 11 con >200.000 m² (todas
-- fincas/casas rurales: son reales). Reglas nuevas, en `particulares_plot_m2`:
--   · < 10 m²                              -> NULL (dato inválido)
--   · < 15 % de los m² construidos          -> NULL (una parcela no cabe en la casa)
--   · > 200.000 m² y sin pinta rústica      -> NULL (finca/rústica/rural/cortijo/…)
--   · descripción (no en pisos/áticos): «parcela de 1.200,5 m²» (millar con punto, decimal con coma) y
--     «1.200 m² de parcela»; ya no se lee «1 parcela» ni números sin «m».
-- El trigger pasa también title y square_meters. Backfill SOLO de las filas cuyo valor
-- cambia, sin tocar updated_at. Idempotente.
-- ============================================================

DROP FUNCTION IF EXISTS particulares_plot_m2(jsonb, jsonb, text);

CREATE OR REPLACE FUNCTION particulares_plot_m2(
  p_features jsonb, p_extra jsonb, p_description text,
  p_title text DEFAULT NULL, p_sqm numeric DEFAULT NULL
) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  WITH raw AS (
    SELECT
      lower(coalesce(p_features::text, '')) AS f,
      lower(coalesce(p_description, '')) AS d,
      p_extra->'plot_area_m2' AS e,
      lower(coalesce(p_title, '') || ' ' || coalesce(p_features::text, '') || ' ' || coalesce(p_description, '')
            || ' ' || coalesce(p_extra->>'typology', '')) AS txt
  ), cand AS (
    SELECT
      coalesce(
        substring(f from 'parcela de ([0-9]+(?:\.[0-9]{3})*(?:,[0-9]+)?) ?m'),
        CASE WHEN jsonb_typeof(e) = 'number' THEN round((e)::text::numeric)::text
             WHEN jsonb_typeof(e) = 'string' THEN nullif(regexp_replace(e #>> '{}', '[^0-9]', '', 'g'), '') END,
        -- la descripción de un piso/ático habla de la urbanización: no cuenta
        CASE WHEN lower(coalesce(p_title, '')) ~ 'piso|ático|atico|apartamento|estudio|loft|dúplex|duplex|flat|apartment|penthouse' THEN NULL
             ELSE coalesce(
               substring(d from 'parcela de ([0-9]+(?:\.[0-9]{3})*(?:,[0-9]+)?) ?m'),
               substring(d from '([0-9]+(?:\.[0-9]{3})*(?:,[0-9]+)?) ?m2? de parcela')) END
      ) AS v,
      txt
    FROM raw
  ), num AS (
    SELECT CASE WHEN v ~ '^[0-9]+(\.[0-9]{3})*(,[0-9]+)?$'
                THEN round(replace(replace(v, '.', ''), ',', '.')::numeric)
                WHEN v ~ '^[0-9]{1,9}$' THEN v::numeric END AS n,
           txt
    FROM cand
  )
  SELECT CASE
    WHEN n IS NULL OR n < 10 THEN NULL
    WHEN p_sqm IS NOT NULL AND p_sqm > 0 AND n < 0.15 * p_sqm THEN NULL
    WHEN n > 200000 AND txt !~ 'rustic|rústic|rural|finca|cortijo|masía|masia|dehesa|hacienda|farm|country' THEN NULL
    WHEN n > 100000000 THEN NULL
    ELSE n::int
  END FROM num;
$$;

CREATE OR REPLACE FUNCTION set_particular_plot_m2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.plot_m2 := particulares_plot_m2(NEW.features, NEW.scraper_extra, NEW.description, NEW.title, NEW.square_meters);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS particulares_plot_m2_trg ON particulares;
CREATE TRIGGER particulares_plot_m2_trg
  BEFORE INSERT OR UPDATE OF features, scraper_extra, description, title, square_meters ON particulares
  FOR EACH ROW EXECUTE FUNCTION set_particular_plot_m2();

-- Backfill: solo filas cuyo valor cambia. No hay trigger de updated_at en esta tabla y
-- `UPDATE OF plot_m2` no dispara el de parcela, así que se escribe directo.
UPDATE particulares p
   SET plot_m2 = particulares_plot_m2(p.features, p.scraper_extra, p.description, p.title, p.square_meters)
 WHERE p.plot_m2 IS DISTINCT FROM particulares_plot_m2(p.features, p.scraper_extra, p.description, p.title, p.square_meters);
