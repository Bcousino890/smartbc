-- ============================================================
-- SmartBC · Filtros tipo Casafari: parcela, condición, vistas, tipo, amueblado
-- ============================================================
-- · `plot_m2`: superficie de parcela (de «Parcela de N m²» en las
--   características, scraper_extra.plot_area_m2 o «parcela de N m²» del texto).
-- · Etiquetas nuevas en `attrs` (se suman a las de 0178/0179):
--     cond_nuevo | cond_usado | cond_muy_bueno | cond_bueno | cond_reformar | cond_reformado
--     vistas | vistas_mar | vistas_sierra | vistas_despejadas | vistas_jardin
--     sin_amueblar | patio | temporada | loft
--     + tipo de Fotocasa (scraper_extra.typology): estudio, atico, duplex, chalet, rustica, pareado, adosado
-- · Corrige `amueblado`: «unfurnished house» (inglés) ya no cuenta como amueblado.
-- Idempotente. El relleno solo toca `attrs` y `plot_m2` (no updated_at).
-- ============================================================

-- 1) Parcela ---------------------------------------------------------------
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS plot_m2 integer;

CREATE OR REPLACE FUNCTION particulares_plot_m2(p_features jsonb, p_extra jsonb, p_description text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  WITH s AS (
    SELECT coalesce(
      substring(lower(coalesce(p_features::text, '')) from 'parcela de ([0-9][0-9.]*) ?m'),
      nullif(regexp_replace(coalesce(p_extra->>'plot_area_m2', ''), '[^0-9]', '', 'g'), ''),
      substring(lower(coalesce(p_description, '')) from 'parcela de ([0-9][0-9.]*) ?m')
    ) AS v
  )
  SELECT CASE
    WHEN regexp_replace(v, '\.', '', 'g') ~ '^[0-9]{1,8}$' THEN regexp_replace(v, '\.', '', 'g')::int
  END FROM s;
$$;

CREATE OR REPLACE FUNCTION set_particular_plot_m2() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.plot_m2 := particulares_plot_m2(NEW.features, NEW.scraper_extra, NEW.description);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS particulares_plot_m2_trg ON particulares;
CREATE TRIGGER particulares_plot_m2_trg
  BEFORE INSERT OR UPDATE OF features, scraper_extra, description ON particulares
  FOR EACH ROW EXECUTE FUNCTION set_particular_plot_m2();

CREATE INDEX IF NOT EXISTS particulares_plot_m2_idx ON particulares (plot_m2) WHERE plot_m2 IS NOT NULL;

-- 2) Etiquetas nuevas ------------------------------------------------------
CREATE OR REPLACE FUNCTION particulares_attrs_casafari(
  p_condition text, p_features jsonb, p_extra jsonb, p_description text
) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  WITH h AS (
    SELECT translate(lower(coalesce(p_features::text, '')), 'áéíóúü', 'aeiouu') AS t,
           translate(lower(coalesce(p_description, '')), 'áéíóúü', 'aeiouu') AS d,
           translate(lower(coalesce(p_condition, '')), 'áéíóúü', 'aeiouu') AS c,
           coalesce(p_extra->>'conservation', '') AS cons,
           lower(coalesce(p_extra->>'typology', '')) AS ty,
           coalesce(p_extra->>'construction_type', '') AS ct,
           coalesce(p_extra->>'rental_duration', '') AS rd,
           coalesce((p_extra->'flags')::text, '') AS fl,
           coalesce((p_extra->'extras')::text, '') AS ex
  )
  SELECT coalesce(array_remove(ARRAY[
    CASE WHEN h.cons = 'ALMOST_NEW' OR h.c ~ '(^|[^a-z])(new|nuevo)' OR h.t ~ 'obra nueva|new_build|newconstruction' OR h.ct ~* 'new' THEN 'cond_nuevo' END,
    CASE WHEN h.c ~ 'segunda mano|second hand' OR h.ct = 'secondHand' THEN 'cond_usado' END,
    CASE WHEN h.cons = 'VERY_GOOD' THEN 'cond_muy_bueno' END,
    CASE WHEN h.cons = 'GOOD' OR h.c ~ 'buen estado|good condition' THEN 'cond_bueno' END,
    CASE WHEN h.cons = 'FOR_RENOVATION' OR h.c ~ 'reformar|renovating' THEN 'cond_reformar' END,
    CASE WHEN h.cons = 'REFURBISHED' OR h.c ~ 'reformad' THEN 'cond_reformado' END,

    CASE WHEN (h.d ~ 'vistas?([^a-z]|$)' AND h.d !~ 'sin (ninguna )?vistas') OR h.t ~ 'vistas|_view' THEN 'vistas' END,
    CASE WHEN h.d ~ 'vistas? (al|a la|del|de la|al maravilloso) (mar|playa|oceano)' OR h.t ~ 'sea_view|vistas al mar' THEN 'vistas_mar' END,
    CASE WHEN h.d ~ 'vistas? (a|al|de|a la|de la) (la )?(sierra|montana|monte|guadarrama)' OR h.t ~ 'mountain_view' THEN 'vistas_sierra' END,
    CASE WHEN h.d ~ 'vistas (totalmente |muy |completamente |increibles y )?despejadas|despejad[ao]s? vistas' THEN 'vistas_despejadas' END,
    CASE WHEN h.d ~ 'vistas? (al|a|del|de la|a la) (jardin|parque|piscina|zonas? comunes?)' THEN 'vistas_jardin' END,

    CASE WHEN h.t ~ 'sin amueblar|unfurnished' THEN 'sin_amueblar' END,
    CASE WHEN h.t ~ 'yard|patio' OR h.ex ~* 'patio' THEN 'patio' END,
    CASE WHEN h.rd = 'IS_TEMPORARY' OR h.fl ~ 'isTemporaryRental'
              OR (h.d ~ 'temporada|vacacional' AND h.d !~ 'no (se )?(admite|alquila|acepta)[^.]{0,40}temporada|sin temporada') THEN 'temporada' END,

    CASE WHEN h.ty ~ 'study' THEN 'estudio' END,
    CASE WHEN h.ty ~ 'attic' THEN 'atico' END,
    CASE WHEN h.ty ~ 'duplex' THEN 'duplex' END,
    CASE WHEN h.ty ~ 'house_chalet|detached' AND h.ty !~ 'semidetached' THEN 'chalet' END,
    CASE WHEN h.ty ~ 'countryhouse' THEN 'rustica' END,
    CASE WHEN h.ty ~ 'semidetached' THEN 'pareado' END,
    CASE WHEN h.ty ~ 'terraced' THEN 'adosado' END,
    CASE WHEN h.ty ~ 'loft' THEN 'loft' END
  ], NULL), '{}')
  FROM h;
$$;

-- «amueblado»: el inglés «unfurnished» ya no cuenta.
CREATE OR REPLACE FUNCTION particulares_compute_attrs(
  p_features jsonb, p_extra jsonb, p_has_lift boolean, p_description text DEFAULT NULL
) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  WITH h AS (
    SELECT translate(lower(coalesce(p_features::text, '')), 'áéíóúü', 'aeiouu') AS t,
           translate(lower(coalesce(p_description, '')), 'áéíóúü', 'aeiouu') AS d
  ), x AS (
    SELECT coalesce(p_extra, '{}'::jsonb) AS e
  )
  SELECT coalesce(array_remove(ARRAY[
    CASE WHEN h.t ~ 'aire acondicionado|air_conditioner' OR (x.e->>'air_conditioning') = '1' THEN 'aire' END,
    CASE WHEN h.t ~ 'armarios empotrados|cabinets' THEN 'armarios' END,
    CASE WHEN h.t ~ 'terraza|terrace' OR (x.e->>'terrace') = '1' THEN 'terraza' END,
    CASE WHEN h.t ~ 'balcon|balcony' THEN 'balcon' END,
    CASE WHEN h.t ~ 'jardin|garden' OR (x.e->>'garden') = '1' THEN 'jardin' END,
    CASE WHEN h.t ~ 'piscina|pool' OR (x.e->>'pool') = '1' THEN 'piscina' END,
    CASE WHEN h.t ~ 'garaje|parking' OR (x.e->>'parking') = '1' THEN 'garaje' END,
    CASE WHEN h.t ~ 'trastero|storage_room' THEN 'trastero' END,
    CASE WHEN p_has_lift IS TRUE OR h.t ~ 'con ascensor|elevator' THEN 'ascensor' END,
    CASE WHEN (h.t ~ '(^|[^n])furnished|amueblado' AND h.t !~ 'sin amueblar') OR (x.e->>'furnished') = '1' THEN 'amueblado' END,
    CASE WHEN h.t ~ 'movilidad reducida|accesible' THEN 'accesible' END,
    CASE WHEN h.t ~ 'calefaccion' OR coalesce(x.e->>'heating', '') <> '' THEN 'calefaccion' END,
    CASE WHEN h.t ~ 'calefaccion central' THEN 'calefaccion_central' END,
    CASE WHEN h.t ~ 'parquet' THEN 'parquet' END,
    CASE WHEN h.t ~ 'video_intercom|videoportero' THEN 'videoportero' END,
    CASE WHEN h.t ~ 'obra nueva|new_build' THEN 'obra_nueva' END,
    CASE WHEN h.t ~ 'atico|penthouse' OR h.d ~ '(^|[^a-z])atico([^a-z]|$)' THEN 'atico' END,
    CASE WHEN h.t ~ 'duplex' OR h.d ~ '(^|[^a-z])duplex([^a-z]|$)' THEN 'duplex' END,
    CASE WHEN h.t ~ 'sin habitacion|studio' THEN 'estudio' END,
    CASE WHEN h.t ~ 'chalet adosado|adosado' THEN 'adosado' END,
    CASE WHEN h.t ~ 'pareado' THEN 'pareado' END,
    CASE WHEN h.t ~ 'casa o chalet independiente|independiente' THEN 'chalet' END,
    CASE WHEN h.t ~ 'rustic' THEN 'rustica' END
  ], NULL), '{}')
  FROM h, x;
$$;

-- 3) Disparador de attrs: base + planta + etiquetas nuevas (sin duplicados) ----
CREATE OR REPLACE FUNCTION set_particular_attrs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.attrs := ARRAY(
    SELECT DISTINCT a FROM unnest(
      particulares_compute_attrs(NEW.features, NEW.scraper_extra, NEW.has_lift, NEW.description)
      || particulares_floor_pos(NEW.floor, NEW.features)
      || particulares_attrs_casafari(NEW.condition, NEW.features, NEW.scraper_extra, NEW.description)
    ) AS a ORDER BY a
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS particulares_attrs ON particulares;
CREATE TRIGGER particulares_attrs
  BEFORE INSERT OR UPDATE OF features, scraper_extra, has_lift, description, condition, floor ON particulares
  FOR EACH ROW EXECUTE FUNCTION set_particular_attrs();

-- 4) Relleno (solo filas cuyo resultado cambia) -----------------------------
UPDATE particulares p
   SET attrs = n.a, plot_m2 = n.pl
  FROM (
    SELECT id,
           ARRAY(SELECT DISTINCT x FROM unnest(
             particulares_compute_attrs(features, scraper_extra, has_lift, description)
             || particulares_floor_pos(floor, features)
             || particulares_attrs_casafari(condition, features, scraper_extra, description)
           ) AS x ORDER BY x) AS a,
           particulares_plot_m2(features, scraper_extra, description) AS pl
      FROM particulares
  ) n
 WHERE p.id = n.id
   AND (p.attrs IS DISTINCT FROM n.a OR p.plot_m2 IS DISTINCT FROM n.pl);
