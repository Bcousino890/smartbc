-- ============================================================
-- SmartBC · Número de planta filtrable + interior/exterior
-- ============================================================
-- `floor_num`: -1 sótano, 0 bajo/entreplanta, N = planta N (de `floor`, o de
-- las características si `floor` viene vacío). Idempotente.
-- ============================================================
CREATE OR REPLACE FUNCTION particulares_floor_num(p_floor text, p_features jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  WITH t AS (
    SELECT translate(lower(coalesce(nullif(p_floor, ''), '')), 'áéíóúü', 'aeiouu') AS f,
           translate(lower(coalesce(p_features::text, '')), 'áéíóúü', 'aeiouu') AS x
  )
  SELECT CASE
    WHEN f ~ 'sotano|basement' OR (f = '' AND x ~ 'sotano') THEN -1
    WHEN f ~ 'entreplanta|bajo|ground floor' THEN 0
    WHEN f ~ '[0-9]+ *(ª|º|st|nd|rd|th)? *(planta|floor)' THEN (substring(f from '([0-9]+) *(?:ª|º|st|nd|rd|th)? *(?:planta|floor)'))::int
    -- Sin `floor`: solo con símbolo ordinal («3ª planta»), para no confundir «2 plantas» de un chalet.
    WHEN f = '' AND x ~ '[0-9]+ *(ª|º|st|nd|rd|th) *(planta|floor)' THEN (substring(x from '([0-9]+) *(?:ª|º|st|nd|rd|th) *(?:planta|floor)'))::int
    WHEN f = '' AND x ~ '(bajo|entreplanta) (exterior|interior)' THEN 0
    ELSE NULL
  END FROM t;
$$;

ALTER TABLE particulares ADD COLUMN IF NOT EXISTS floor_num integer;

CREATE OR REPLACE FUNCTION set_particular_floor_num() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.floor_num := particulares_floor_num(NEW.floor, NEW.features);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS particulares_floor_num_trg ON particulares;
CREATE TRIGGER particulares_floor_num_trg
  BEFORE INSERT OR UPDATE OF floor, features ON particulares
  FOR EACH ROW EXECUTE FUNCTION set_particular_floor_num();

-- interior / exterior como atributos (se recalculan con el trigger de attrs).
CREATE OR REPLACE FUNCTION particulares_floor_pos(p_floor text, p_features jsonb)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(p_floor, '') || coalesce(p_features::text, '') ~* 'planta exterior|floor exterior|bajo exterior|entreplanta exterior' THEN ARRAY['exterior']
    WHEN coalesce(p_floor, '') || coalesce(p_features::text, '') ~* 'planta interior|floor interior|bajo interior|entreplanta interior' THEN ARRAY['interior']
    ELSE '{}'::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION set_particular_attrs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.attrs := particulares_compute_attrs(NEW.features, NEW.scraper_extra, NEW.has_lift, NEW.description)
               || particulares_floor_pos(NEW.floor, NEW.features);
  RETURN NEW;
END $$;

UPDATE particulares
   SET floor_num = particulares_floor_num(floor, features),
       attrs = particulares_compute_attrs(features, scraper_extra, has_lift, description)
               || particulares_floor_pos(floor, features)
 WHERE floor_num IS NULL OR attrs IS NULL OR NOT (attrs && ARRAY['exterior','interior']);

CREATE INDEX IF NOT EXISTS particulares_floor_num_idx ON particulares (floor_num) WHERE floor_num IS NOT NULL;
