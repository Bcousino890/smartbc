-- ============================================================
-- SmartBC · Particulares: separar TÍTULO de DIRECCIÓN
-- ============================================================
-- El crawler de Idealista guardaba el título del anuncio en `address`
-- («Piso en venta en Calle de Orense, 49», «Alquiler de dúplex en Calle Ana de
-- Austria», «Flat / apartment for sale in Calle de Lope de Vega»…). Aquí:
--   · `title` text: el título original del anuncio.
--   · particulares_clean_address(text): función pura que quita el prefijo
--     «tipo + operación en» (ES y EN) y los añadidos «, barrio, ciudad» y deja
--     «calle [+ número]». Idempotente: clean(clean(x)) = clean(x).
--   · trigger BEFORE INSERT OR UPDATE OF address: si `address` trae un título,
--     lo guarda en `title` y deja `address` limpia. Así el crawler externo, que
--     sigue escribiendo el título en `address`, queda corregido en cada upsert.
--   · backfill por lotes (solo toca address/title; no `updated_at`).
-- Casos dudosos (documentados):
--   · «Piso en venta en Goya» (solo barrio, sin calle ni número): address = NULL;
--     el barrio queda en `title`.
--   · «Beguinas, Las, 51» → «Las Beguinas, 51» (artículo invertido).
--   · Textos que son descripciones sueltas (no empiezan por un tipo de inmueble
--     seguido de «en»/«in») no se tocan.
--   · Solo se recortan «, barrio, ciudad» en Idealista o si había prefijo
--     (Fotocasa/Pisos.com ya vienen limpios y se dejan como están).
-- Idempotente.
-- ============================================================

ALTER TABLE particulares ADD COLUMN IF NOT EXISTS title text;

-- Devuelve el prefijo-título detectado (NULL si no hay): se usa para saber si
-- el texto ES un título.
CREATE OR REPLACE FUNCTION particulares_address_has_title(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p ~* ('^(alquiler de |venta de |alquiler y venta de )?'
    || '(piso|apartamento|estudio|loft|[aá]tico|d[uú]plex|tríplex|triplex|chalet( adosado| pareado| independiente)?|'
    || 'casa( o chalet( independiente| adosado| pareado)?| rural| de pueblo| terrera| adosada| pareada| independiente)?|'
    || 'finca r[uú]stica|caser[oó]n|cortijo|mas[ií]a|palacio|torre|local( comercial)?|garaje|trastero|habitaci[oó]n|'
    || 'terreno|solar|nave( industrial)?|oficina|edificio|bajo|planta baja|villa|masia)'
    || '( en (venta|alquiler|alquiler con opci[oó]n a compra|traspaso))? en .')
  OR p ~* ('^(flat / apartment|flat|apartment|studio|penthouse|duplex|triplex|loft|detached house|terraced house|'
    || 'semi-detached house|house|villa|village house|country house|estate|rural manor|masía|mansion|'
    || 'commercial premises|garage|storage room|room|land|plot|office|building|chalet)'
    || ' for (sale|rent) in .');
$$;

-- ¿Empieza por un tipo de vía (calle, avenida, paseo, plaza, «c/»…)?
CREATE OR REPLACE FUNCTION particulares_looks_like_street(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p ~* '^((calle|avenida|paseo|plaza|camino|carretera|travesía|travesia|ronda|glorieta|pasaje|pasadizo|cuesta|bulevar|urbanización|calzada|costanilla|corredera|ribera|vía|via|senda|sendero|callejón|cañada|rambla|poblado|barrio)( |$)|(c/|c\.|cl\.?|av\.?|avda\.?|pza\.?|ctra\.?|pº)( |/|$)|de la |del |de los |de las |de )'
$$;

CREATE OR REPLACE FUNCTION particulares_clean_address(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text;
  segs text[];
  street text;
  num text;
  i int;
  titled boolean;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  s := btrim(regexp_replace(p, '\s+', ' ', 'g'));
  IF s = '' THEN RETURN NULL; END IF;

  titled := particulares_address_has_title(s);
  IF titled THEN
    -- quita «[Alquiler de ]tipo[ en venta|alquiler] en » / «Type for sale in »
    s := regexp_replace(s, '^.*? (en|in) ', '', 'i');
    -- el prefijo puede llevar un «en» interno: «Piso en venta en X» => el
    -- primer «en»/«in» es el de «en venta»; si lo que queda empieza por
    -- venta/alquiler/traspaso + « en », se vuelve a quitar.
    s := regexp_replace(s, '^(venta|alquiler|alquiler con opci[oó]n a compra|traspaso) en ', '', 'i');
    s := regexp_replace(s, '^(sale|rent) in ', '', 'i');
  ELSIF NOT particulares_looks_like_street(s) THEN
    -- sin prefijo de título y sin pinta de calle (barrio suelto, descripción…): no se toca
    RETURN s;
  END IF;

  -- Solo se parte por comas (no se intenta rescatar calles de descripciones).
  segs := regexp_split_to_array(s, '\s*,\s*');
  street := segs[1];
  IF street IS NULL OR street = '' THEN RETURN s; END IF;
  -- artículo invertido: «Beguinas, Las» → «Las Beguinas»
  IF array_length(segs, 1) >= 2 AND segs[2] ~* '^(el|la|los|las)$' THEN
    street := segs[2] || ' ' || street;
    segs := segs[2:];  -- el artículo ocupa ahora el hueco de la calle
    segs[1] := street;
  END IF;
  num := NULL;
  FOR i IN 2..coalesce(array_length(segs, 1), 1) LOOP
    IF segs[i] ~* '^(s/n|sn|km ?\d+([.,]\d+)?|\d{1,4} ?[a-z]?( |/|-|$))' AND num IS NULL THEN
      num := substring(segs[i] from '(?i)^(s/n|sn|km ?\d+(?:[.,]\d+)?|\d{1,4}(?: ?[a-z](?![a-zñáéíóú]))?)');
      EXIT;
    END IF;
  END LOOP;
  IF num IS NOT NULL THEN
    RETURN btrim(street) || ', ' || btrim(num);
  END IF;
  -- título con solo un barrio/municipio («Piso en venta en Goya»): sin calle ni
  -- número no es una dirección (el barrio sigue en `title`).
  IF titled AND street !~ '[0-9]' AND NOT particulares_looks_like_street(street) THEN
    RETURN NULL;
  END IF;
  RETURN btrim(street);
END $$;

-- Trigger: título en address → title; address limpia.
CREATE OR REPLACE FUNCTION set_particular_address_title() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cleaned text;
BEGIN
  IF NEW.address IS NULL THEN RETURN NEW; END IF;
  IF particulares_address_has_title(btrim(NEW.address)) THEN
    -- es un título fresco del portal: se guarda tal cual (refresca el anterior)
    NEW.title := btrim(regexp_replace(NEW.address, '\s+', ' ', 'g'));
  ELSIF NEW.portal IS DISTINCT FROM 'idealista' THEN
    RETURN NEW;
  END IF;
  cleaned := particulares_clean_address(NEW.address);
  NEW.address := cleaned;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS particulares_address_title ON particulares;
CREATE TRIGGER particulares_address_title
  BEFORE INSERT OR UPDATE OF address ON particulares
  FOR EACH ROW EXECUTE FUNCTION set_particular_address_title();

-- Backfill: `SET address = address` dispara el trigger de arriba (que rellena
-- `title` y limpia `address`). Solo se tocan esas dos columnas: ningún otro
-- trigger de la tabla escucha `address`, y `updated_at` no se modifica.
-- Por lotes de ~10.000 filas (cada lote es idempotente: lo ya limpio no vuelve a
-- coincidir) para no mantener una transacción larga.
DO $$
DECLARE
  n int;
BEGIN
  LOOP
    WITH batch AS (
      SELECT id FROM particulares
      WHERE address IS NOT NULL
        AND (particulares_address_has_title(btrim(address))
             OR (portal = 'idealista' AND address IS DISTINCT FROM particulares_clean_address(address)))
      LIMIT 10000
    )
    UPDATE particulares p SET address = p.address
    FROM batch WHERE p.id = batch.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    EXIT WHEN n = 0;
  END LOOP;
END $$;
