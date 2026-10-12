-- ============================================================
-- SmartBC · Atributos filtrables de los anuncios de particulares
-- ============================================================
-- `attrs` es una lista de etiquetas normalizadas (aire, terraza, piscina,
-- garaje, atico, adosado, mascotas…) calculada a partir de las características
-- del anuncio (`features`, en español o inglés), los datos extra del scraper
-- (`scraper_extra`) y `has_lift`. Permite filtrar con `attrs @> '{piscina}'`
-- (índice GIN) sin recorrer texto libre en cada consulta.
-- Idempotente. El trigger la mantiene al día en altas y cambios de ficha.
-- ============================================================

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
    CASE WHEN h.t ~ 'amueblado|furnished' AND h.t !~ 'sin amueblar' OR (x.e->>'furnished') = '1' THEN 'amueblado' END,
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

ALTER TABLE particulares ADD COLUMN IF NOT EXISTS attrs text[];

CREATE OR REPLACE FUNCTION set_particular_attrs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.attrs := particulares_compute_attrs(NEW.features, NEW.scraper_extra, NEW.has_lift, NEW.description);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS particulares_attrs ON particulares;
CREATE TRIGGER particulares_attrs
  BEFORE INSERT OR UPDATE OF features, scraper_extra, has_lift, description ON particulares
  FOR EACH ROW EXECUTE FUNCTION set_particular_attrs();

-- Relleno inicial (solo filas sin calcular): no toca updated_at ni otras columnas.
UPDATE particulares
   SET attrs = particulares_compute_attrs(features, scraper_extra, has_lift, description)
 WHERE attrs IS NULL;

CREATE INDEX IF NOT EXISTS particulares_attrs_gin ON particulares USING gin (attrs);
