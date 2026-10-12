-- ============================================================
-- SmartBC · Filtro de agencias (tipo Casafari) + búsqueda de texto rápida
-- ============================================================
-- · `agency_key`: nombre NORMALIZADO de la agencia (solo anuncios `professional`).
--   Junta variantes de un mismo nombre («Huspy .», «huspy», «Huspy -») en una
--   sola clave: minúsculas, sin tildes, sin comas ni «|», espacios colapsados y
--   sin puntuación suelta al principio/final. Se mantiene por trigger.
-- · `particulares_agencies(p_q, p_limit)`: autocompletado (clave, nombre a
--   mostrar, nº de anuncios activos y totales, portales), con búsqueda por texto.
-- · Índices: btree/trgm de `agency_key`; trgm de `phone`, `phone2`, `external_id`,
--   `reference` y `owner_name` para la búsqueda de texto del listado (referencia,
--   id/URL del portal, teléfono, anunciante) sin recorrer toda la tabla.
-- Idempotente. El relleno solo toca `agency_key` (no updated_at).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1) Normalización del nombre de agencia ----------------------------------
CREATE OR REPLACE FUNCTION particulares_agency_key(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(lower(coalesce(p_name, '')), 'áàäâéèëêíìïîóòöôúùüûç', 'aaaaeeeeiiiioooouuuuc'),
          '[,|]', ' ', 'g'),
        '\s+', ' ', 'g'),
      '^[\s.\-–—_·:;]+|[\s.\-–—_·:;]+$', '', 'g'),
    '');
$$;

-- 2) Columna + trigger ------------------------------------------------------
ALTER TABLE particulares ADD COLUMN IF NOT EXISTS agency_key text;

CREATE OR REPLACE FUNCTION set_particular_agency_key() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.agency_key := CASE WHEN NEW.advertiser_type = 'professional'
                         THEN particulares_agency_key(NEW.owner_name) END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS particulares_agency_key_trg ON particulares;
CREATE TRIGGER particulares_agency_key_trg
  BEFORE INSERT OR UPDATE OF owner_name, advertiser_type ON particulares
  FOR EACH ROW EXECUTE FUNCTION set_particular_agency_key();

-- 3) Relleno (solo filas cuyo resultado cambia) -----------------------------
UPDATE particulares
   SET agency_key = CASE WHEN advertiser_type = 'professional' THEN particulares_agency_key(owner_name) END
 WHERE agency_key IS DISTINCT FROM
       (CASE WHEN advertiser_type = 'professional' THEN particulares_agency_key(owner_name) END);

-- 4) Índices ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS particulares_agency_key_idx ON particulares (agency_key) WHERE agency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS particulares_agency_key_trgm ON particulares USING gin (agency_key gin_trgm_ops) WHERE agency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS particulares_phone_trgm ON particulares USING gin (phone gin_trgm_ops) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS particulares_phone2_trgm ON particulares USING gin (phone2 gin_trgm_ops) WHERE phone2 IS NOT NULL;
CREATE INDEX IF NOT EXISTS particulares_external_id_trgm ON particulares USING gin (external_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS particulares_reference_trgm ON particulares USING gin (reference gin_trgm_ops) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS particulares_owner_name_trgm ON particulares USING gin (owner_name gin_trgm_ops) WHERE owner_name IS NOT NULL;

-- 5) Autocompletado de agencias --------------------------------------------
CREATE OR REPLACE FUNCTION particulares_agencies(p_q text DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (key text, name text, total bigint, active bigint, portals text[])
LANGUAGE sql STABLE AS $$
  WITH q AS (
    SELECT particulares_agency_key(p_q) AS k
  )
  SELECT p.agency_key AS key,
         mode() WITHIN GROUP (ORDER BY btrim(regexp_replace(p.owner_name, '[\s.\-–—]+$', ''))) AS name,
         count(*) AS total,
         count(*) FILTER (WHERE p.is_active) AS active,
         array_agg(DISTINCT p.portal ORDER BY p.portal) AS portals
    FROM particulares p, q
   WHERE p.agency_key IS NOT NULL
     AND (q.k IS NULL
          OR p.agency_key LIKE '%' || replace(replace(replace(q.k, '\', '\\'), '%', '\%'), '_', '\_') || '%')
   GROUP BY p.agency_key
   ORDER BY count(*) FILTER (WHERE p.is_active) DESC, count(*) DESC, p.agency_key
   LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
$$;
