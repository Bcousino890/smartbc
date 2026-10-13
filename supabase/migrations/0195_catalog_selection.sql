-- ============================================================================
-- 0195 · BCP-01 ampliación (PR-B): zonas, precio, modo automático y anuncios.
--
-- Expediente: docs/changes/2026-10-13-bcp-01-home-catalogo/ (ampliacion-*.md)
--
-- Qué añade:
--   · catalog_zone_terms: taxonomía de zonas SOLO para catálogos, generada a
--     partir de lib/madrid-zones.ts (que no cambia) con las equivalencias
--     aprobadas Chueca → Justicia, Malasaña → Universidad, Huertas → Cortes.
--     catalog_fold / catalog_zone_candidates / catalog_zone_match repiten
--     normalizeZone() (lib/catalogs/zones.ts; test de paridad).
--   · catalogs.mode ('manual' por defecto: los catálogos existentes no
--     cambian), catalogs.criteria (validado por catalog_criteria_normalize) y
--     catalogs.key_salt (interno; deriva claves opacas y estables).
--   · catalog_select: filtro COMPLETO → orden completo y estable → máximo
--     (1–24, 12 por defecto). Nunca limita candidatas antes del orden.
--   · catalog_internal_snapshot: en 'auto' la lista sale de catalog_select en
--     la MISMA sentencia; en 'manual', de catalog_items como siempre. Conserva
--     todas las claves de 0193/0194.
--   · Cambio de modo con vista previa: manual → auto deja catalog_items
--     intacto; auto → manual «volver a mi lista» o «convertir».
--   · catalog_add_property / remove_item / reorder rechazan 'catalog_auto'.
--   · catalog_property_search: búsqueda de la gestión (solo lectura).
--   · catalog_ads: anuncios de Idealista de origen (interno, nunca público).
--
-- Permisos (E1): RLS sin políticas en las tablas nuevas, REVOKE a public/anon/
-- authenticated y EXECUTE/GRANT solo a service_role. SECURITY INVOKER y
-- search_path fijo. Funciones de gestión con p_actor y comprobación de dueño.
-- Transacción e idempotencia: BEGIN/COMMIT, IF NOT EXISTS, CREATE OR REPLACE,
-- ON CONFLICT. No se crea ningún índice en properties.
-- Reversión: docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0195.sql
-- ============================================================================

BEGIN;

-- ── Taxonomía de zonas de los catálogos ────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog_zone_terms (
  term     text PRIMARY KEY,
  district text NOT NULL,
  barrio   text
);
ALTER TABLE catalog_zone_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_zone_terms FROM public, anon, authenticated;
GRANT SELECT ON TABLE catalog_zone_terms TO service_role;

-- Generado por catalogZoneTermsSql() (lib/catalogs/zones.ts). Un test de
-- scripts/test-catalogs-public.mts falla si este bloque y el TS se separan.
-- BEGIN catalog_zone_terms
INSERT INTO catalog_zone_terms (term, district, barrio) VALUES
  ('abrantes', 'Carabanchel', 'Abrantes'),
  ('acacias', 'Arganzuela', 'Acacias'),
  ('adelfas', 'Retiro', 'Adelfas'),
  ('aeropuerto', 'Barajas', 'Aeropuerto'),
  ('aguilas', 'Latina', 'Águilas'),
  ('alameda de osuna', 'Barajas', 'Alameda de Osuna'),
  ('almagro', 'Chamberí', 'Almagro'),
  ('almenara', 'Tetuán', 'Almenara'),
  ('almendrales', 'Usera', 'Almendrales'),
  ('aluche', 'Latina', 'Aluche'),
  ('ambroz', 'Vicálvaro', 'Ambroz'),
  ('amposta', 'San Blas-Canillejas', 'Amposta'),
  ('apostol santiago', 'Hortaleza', 'Apóstol Santiago'),
  ('arapiles', 'Chamberí', 'Arapiles'),
  ('aravaca', 'Moncloa-Aravaca', 'Aravaca'),
  ('arcos', 'San Blas-Canillejas', 'Arcos'),
  ('arganzuela', 'Arganzuela', NULL),
  ('arguelles', 'Moncloa-Aravaca', 'Argüelles'),
  ('arroyofresno', 'Fuencarral-El Pardo', 'Arroyofresno'),
  ('atalaya', 'Ciudad Lineal', 'Atalaya'),
  ('atocha', 'Arganzuela', 'Atocha'),
  ('barajas', 'Barajas', NULL),
  ('barrio del pilar', 'Fuencarral-El Pardo', 'Barrio del Pilar'),
  ('bellas vistas', 'Tetuán', 'Bellas Vistas'),
  ('berruguete', 'Tetuán', 'Berruguete'),
  ('buenavista', 'Carabanchel', 'Buenavista'),
  ('butarque', 'Villaverde', 'Butarque'),
  ('campamento', 'Latina', 'Campamento'),
  ('canillas', 'Hortaleza', 'Canillas'),
  ('canillejas', 'San Blas-Canillejas', 'Canillejas'),
  ('carabanchel', 'Carabanchel', NULL),
  ('casa de campo', 'Moncloa-Aravaca', 'Casa de Campo'),
  ('casco historico de barajas', 'Barajas', 'Casco Histórico de Barajas'),
  ('casco historico de vallecas', 'Villa de Vallecas', 'Casco Histórico de Vallecas'),
  ('casco historico de vicalvaro', 'Vicálvaro', 'Casco Histórico de Vicálvaro'),
  ('castellana', 'Salamanca', 'Castellana'),
  ('castilla', 'Chamartín', 'Castilla'),
  ('castillejos', 'Tetuán', 'Castillejos'),
  ('centro', 'Centro', NULL),
  ('chamartin', 'Chamartín', NULL),
  ('chamberi', 'Chamberí', NULL),
  ('chopera', 'Arganzuela', 'Chopera'),
  ('chueca', 'Centro', 'Justicia'),
  ('ciudad jardin', 'Chamartín', 'Ciudad Jardín'),
  ('ciudad lineal', 'Ciudad Lineal', NULL),
  ('ciudad universitaria', 'Moncloa-Aravaca', 'Ciudad Universitaria'),
  ('colina', 'Ciudad Lineal', 'Colina'),
  ('comillas', 'Carabanchel', 'Comillas'),
  ('concepcion', 'Ciudad Lineal', 'Concepción'),
  ('corralejos', 'Barajas', 'Corralejos'),
  ('cortes', 'Centro', 'Cortes'),
  ('costillares', 'Ciudad Lineal', 'Costillares'),
  ('cuatro caminos', 'Tetuán', 'Cuatro Caminos'),
  ('cuatro vientos', 'Latina', 'Cuatro Vientos'),
  ('delicias', 'Arganzuela', 'Delicias'),
  ('el canaveral', 'Vicálvaro', 'El Cañaveral'),
  ('el goloso', 'Fuencarral-El Pardo', 'El Goloso'),
  ('el pardo', 'Fuencarral-El Pardo', 'El Pardo'),
  ('el plantio', 'Moncloa-Aravaca', 'El Plantío'),
  ('el viso', 'Chamartín', 'El Viso'),
  ('embajadores', 'Centro', 'Embajadores'),
  ('ensanche de vallecas', 'Villa de Vallecas', 'Ensanche de Vallecas'),
  ('entrevias', 'Puente de Vallecas', 'Entrevías'),
  ('estrella', 'Retiro', 'Estrella'),
  ('fontarron', 'Moratalaz', 'Fontarrón'),
  ('fuencarral-el pardo', 'Fuencarral-El Pardo', NULL),
  ('fuente del berro', 'Salamanca', 'Fuente del Berro'),
  ('fuentelarreina', 'Fuencarral-El Pardo', 'Fuentelarreina'),
  ('gaztambide', 'Chamberí', 'Gaztambide'),
  ('goya', 'Salamanca', 'Goya'),
  ('guindalera', 'Salamanca', 'Guindalera'),
  ('hellin', 'San Blas-Canillejas', 'Hellín'),
  ('hispanoamerica', 'Chamartín', 'Hispanoamérica'),
  ('horcajo', 'Moratalaz', 'Horcajo'),
  ('hortaleza', 'Hortaleza', NULL),
  ('huertas', 'Centro', 'Cortes'),
  ('ibiza', 'Retiro', 'Ibiza'),
  ('imperial', 'Arganzuela', 'Imperial'),
  ('jeronimos', 'Retiro', 'Jerónimos'),
  ('justicia', 'Centro', 'Justicia'),
  ('la latina', 'Centro', 'La Latina'),
  ('la paz', 'Fuencarral-El Pardo', 'La Paz'),
  ('las aguilas', 'Latina', 'Las Águilas'),
  ('las tablas', 'Fuencarral-El Pardo', 'Las Tablas'),
  ('latina', 'Latina', NULL),
  ('lavapies', 'Centro', 'Lavapiés'),
  ('legazpi', 'Arganzuela', 'Legazpi'),
  ('lista', 'Salamanca', 'Lista'),
  ('los angeles', 'Villaverde', 'Los Ángeles'),
  ('los carmenes', 'Latina', 'Los Cármenes'),
  ('los rosales', 'Villaverde', 'Los Rosales'),
  ('lucero', 'Latina', 'Lucero'),
  ('malasana', 'Centro', 'Universidad'),
  ('marroquina', 'Moratalaz', 'Marroquina'),
  ('media legua', 'Moratalaz', 'Media Legua'),
  ('mirasierra', 'Fuencarral-El Pardo', 'Mirasierra'),
  ('moncloa-aravaca', 'Moncloa-Aravaca', NULL),
  ('montecarmelo', 'Fuencarral-El Pardo', 'Montecarmelo'),
  ('moratalaz', 'Moratalaz', NULL),
  ('moscardo', 'Usera', 'Moscardó'),
  ('nino jesus', 'Retiro', 'Niño Jesús'),
  ('nueva espana', 'Chamartín', 'Nueva España'),
  ('numancia', 'Puente de Vallecas', 'Numancia'),
  ('opanel', 'Carabanchel', 'Opañel'),
  ('orcasitas', 'Usera', 'Orcasitas'),
  ('orcasur', 'Usera', 'Orcasur'),
  ('pacifico', 'Retiro', 'Pacífico'),
  ('palacio', 'Centro', 'Palacio'),
  ('palomas', 'Hortaleza', 'Palomas'),
  ('palomeras bajas', 'Puente de Vallecas', 'Palomeras Bajas'),
  ('palomeras sureste', 'Puente de Vallecas', 'Palomeras Sureste'),
  ('palos de la frontera', 'Arganzuela', 'Palos de la Frontera'),
  ('palos de moguer', 'Arganzuela', 'Palos de Moguer'),
  ('pavones', 'Moratalaz', 'Pavones'),
  ('penagrande', 'Fuencarral-El Pardo', 'Peñagrande'),
  ('pinar del rey', 'Hortaleza', 'Pinar del Rey'),
  ('piovera', 'Hortaleza', 'Piovera'),
  ('portazgo', 'Puente de Vallecas', 'Portazgo'),
  ('pradolongo', 'Usera', 'Pradolongo'),
  ('prosperidad', 'Chamartín', 'Prosperidad'),
  ('pueblo nuevo', 'Ciudad Lineal', 'Pueblo Nuevo'),
  ('puente de vallecas', 'Puente de Vallecas', NULL),
  ('puerta bonita', 'Carabanchel', 'Puerta Bonita'),
  ('puerta del angel', 'Latina', 'Puerta del Ángel'),
  ('quintana', 'Ciudad Lineal', 'Quintana'),
  ('recoletos', 'Salamanca', 'Recoletos'),
  ('rejas', 'San Blas-Canillejas', 'Rejas'),
  ('retiro', 'Retiro', NULL),
  ('rios rosas', 'Chamberí', 'Ríos Rosas'),
  ('rosas', 'San Blas-Canillejas', 'Rosas'),
  ('salamanca', 'Salamanca', NULL),
  ('salvador', 'San Blas-Canillejas', 'Salvador'),
  ('san andres', 'Villaverde', 'San Andrés'),
  ('san blas-canillejas', 'San Blas-Canillejas', NULL),
  ('san cristobal', 'Villaverde', 'San Cristóbal'),
  ('san diego', 'Puente de Vallecas', 'San Diego'),
  ('san fermin', 'Usera', 'San Fermín'),
  ('san isidro', 'Carabanchel', 'San Isidro'),
  ('san juan bautista', 'Ciudad Lineal', 'San Juan Bautista'),
  ('san pascual', 'Ciudad Lineal', 'San Pascual'),
  ('sanchinarro', 'Hortaleza', 'Sanchinarro'),
  ('santa eugenia', 'Villa de Vallecas', 'Santa Eugenia'),
  ('simancas', 'San Blas-Canillejas', 'Simancas'),
  ('sol', 'Centro', 'Sol'),
  ('tetuan', 'Tetuán', NULL),
  ('timon', 'Barajas', 'Timón'),
  ('trafalgar', 'Chamberí', 'Trafalgar'),
  ('tres olivos', 'Fuencarral-El Pardo', 'Tres Olivos'),
  ('universidad', 'Centro', 'Universidad'),
  ('usera', 'Usera', NULL),
  ('valdeacederas', 'Tetuán', 'Valdeacederas'),
  ('valdebebas', 'Hortaleza', 'Valdebebas'),
  ('valdebernardo', 'Vicálvaro', 'Valdebernardo'),
  ('valdefuentes', 'Hortaleza', 'Valdefuentes'),
  ('valdemarin', 'Moncloa-Aravaca', 'Valdemarín'),
  ('valderrivas', 'Vicálvaro', 'Valderrivas'),
  ('valdezarza', 'Moncloa-Aravaca', 'Valdezarza'),
  ('vallehermoso', 'Chamberí', 'Vallehermoso'),
  ('valverde', 'Fuencarral-El Pardo', 'Valverde'),
  ('ventas', 'Ciudad Lineal', 'Ventas'),
  ('ventilla', 'Tetuán', 'Ventilla'),
  ('vicalvaro', 'Vicálvaro', NULL),
  ('villa de vallecas', 'Villa de Vallecas', NULL),
  ('villaverde', 'Villaverde', NULL),
  ('vinateros', 'Moratalaz', 'Vinateros'),
  ('vista alegre', 'Carabanchel', 'Vista Alegre'),
  ('zofio', 'Usera', 'Zofío')
ON CONFLICT (term) DO UPDATE SET district = EXCLUDED.district, barrio = EXCLUDED.barrio;
-- END catalog_zone_terms

-- Minúsculas y sin tildes (como fold() de lib/madrid-zones.ts). Se traducen
-- también las mayúsculas acentuadas: lower() no las conoce en locale C.
CREATE OR REPLACE FUNCTION catalog_fold(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(lower(translate(coalesce(p, ''),
    'ÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãåéèëêíìïîóòöôõúùüûñç',
    'aaaaaaeeeeiiiiooooouuuuncaaaaaaeeeeiiiiooooouuuunc')))
$$;

-- Texto completo + fragmentos, normalizados y sin «barrio/distrito/zona (de)».
CREATE OR REPLACE FUNCTION catalog_zone_candidates(p text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(f ORDER BY ord), '{}')
    FROM (
      SELECT ord, regexp_replace(catalog_fold(part), '^(barrio|distrito|zona)[[:space:]]+(de[[:space:]]+)?', '') AS f
        FROM (
          SELECT 0::bigint AS ord, btrim(p) AS part
           WHERE btrim(coalesce(p, '')) <> ''
          UNION ALL
          SELECT s.ord, btrim(s.part)
            FROM regexp_split_to_table(btrim(coalesce(p, '')), '[,–—/·-]| en ') WITH ORDINALITY AS s(part, ord)
           WHERE btrim(coalesce(p, '')) <> ''
        ) x
       WHERE btrim(part) <> ''
    ) y
$$;

-- {distrito, barrio} del primer término conocido; NULL si no se reconoce.
CREATE OR REPLACE FUNCTION catalog_zone_match(p text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ARRAY[t.district, t.barrio]
    FROM unnest(catalog_zone_candidates(p)) WITH ORDINALITY AS c(term, ord)
    JOIN catalog_zone_terms t ON t.term = c.term
   ORDER BY c.ord
   LIMIT 1
$$;

-- ── Criterios ───────────────────────────────────────────────────────────────

-- Mismas reglas que normalizeCriteria() (lib/catalogs/criteria.ts).
CREATE OR REPLACE FUNCTION catalog_criteria_normalize(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_op    text;
  v_sort  text;
  v_max   integer;
  v_min   numeric;
  v_pmax  numeric;
  v_zones jsonb := '[]'::jsonb;
  v_seen  text[] := '{}';
  z       jsonb;
  v_kind  text;
  v_name  text;
  v_key   text;
BEGIN
  IF p IS NULL OR p = 'null'::jsonb THEN
    p := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'invalid_criteria';
  END IF;
  v_op := coalesce(p->>'operation', 'any');
  IF v_op NOT IN ('sale', 'rent', 'any') THEN RAISE EXCEPTION 'invalid_criteria'; END IF;
  v_sort := coalesce(p->>'sort', 'price_asc');
  IF v_sort NOT IN ('price_asc', 'price_desc', 'newest') THEN RAISE EXCEPTION 'invalid_criteria'; END IF;

  IF p->'max' IS NULL OR jsonb_typeof(p->'max') = 'null' THEN
    v_max := 12;
  ELSIF jsonb_typeof(p->'max') <> 'number' OR (p->>'max')::numeric <> trunc((p->>'max')::numeric)
        OR (p->>'max')::numeric NOT BETWEEN 1 AND 24 THEN
    RAISE EXCEPTION 'invalid_criteria';
  ELSE
    v_max := (p->>'max')::integer;
  END IF;

  FOREACH v_key IN ARRAY ARRAY['price_min', 'price_max'] LOOP
    IF p->v_key IS NOT NULL AND jsonb_typeof(p->v_key) <> 'null' THEN
      IF jsonb_typeof(p->v_key) <> 'number' OR (p->>v_key)::numeric <> trunc((p->>v_key)::numeric)
         OR (p->>v_key)::numeric < 0 OR (p->>v_key)::numeric > 1000000000 THEN
        RAISE EXCEPTION 'invalid_criteria';
      END IF;
    END IF;
  END LOOP;
  v_min  := CASE WHEN jsonb_typeof(p->'price_min') = 'number' THEN (p->>'price_min')::numeric END;
  v_pmax := CASE WHEN jsonb_typeof(p->'price_max') = 'number' THEN (p->>'price_max')::numeric END;
  IF (v_min IS NOT NULL OR v_pmax IS NOT NULL) AND v_op = 'any' THEN RAISE EXCEPTION 'invalid_criteria'; END IF;
  IF v_min IS NOT NULL AND v_pmax IS NOT NULL AND v_min > v_pmax THEN RAISE EXCEPTION 'invalid_criteria'; END IF;

  IF p->'zones' IS NOT NULL AND jsonb_typeof(p->'zones') <> 'null' THEN
    IF jsonb_typeof(p->'zones') <> 'array' OR jsonb_array_length(p->'zones') > 30 THEN
      RAISE EXCEPTION 'invalid_criteria';
    END IF;
    FOR z IN SELECT value FROM jsonb_array_elements(p->'zones') LOOP
      IF jsonb_typeof(z) <> 'object' OR jsonb_typeof(z->'name') <> 'string' THEN RAISE EXCEPTION 'invalid_criteria'; END IF;
      v_kind := z->>'kind';
      v_name := btrim(z->>'name');
      IF char_length(v_name) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'invalid_criteria'; END IF;
      IF v_kind = 'district' THEN
        IF NOT EXISTS (SELECT 1 FROM catalog_zone_terms WHERE barrio IS NULL AND district = v_name) THEN
          RAISE EXCEPTION 'invalid_criteria';
        END IF;
      ELSIF v_kind = 'barrio' THEN
        -- Solo barrios con nombre propio (no las equivalencias: Chueca → Justicia).
        IF NOT EXISTS (SELECT 1 FROM catalog_zone_terms WHERE barrio = v_name AND term = catalog_fold(v_name)) THEN
          RAISE EXCEPTION 'invalid_criteria';
        END IF;
      ELSIF v_kind IS DISTINCT FROM 'free' THEN
        RAISE EXCEPTION 'invalid_criteria';
      END IF;
      v_key := v_kind || ':' || catalog_fold(v_name);
      IF v_key = ANY (v_seen) THEN CONTINUE; END IF;
      v_seen := v_seen || v_key;
      v_zones := v_zones || jsonb_build_array(jsonb_build_object('kind', v_kind, 'name', v_name));
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'operation', v_op,
    'zones', v_zones,
    'price_min', v_min,
    'price_max', v_pmax,
    'sort', v_sort,
    'max', v_max
  );
END
$$;

ALTER TABLE catalogs ADD COLUMN IF NOT EXISTS mode     text  NOT NULL DEFAULT 'manual';
ALTER TABLE catalogs ADD COLUMN IF NOT EXISTS criteria jsonb NOT NULL
  DEFAULT '{"operation":"any","zones":[],"price_min":null,"price_max":null,"sort":"price_asc","max":12}'::jsonb;
-- Interno: deriva las claves públicas de las viviendas automáticas. Nunca sale.
ALTER TABLE catalogs ADD COLUMN IF NOT EXISTS key_salt text NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_mode_ok;
ALTER TABLE catalogs ADD CONSTRAINT catalogs_mode_ok CHECK (mode IN ('manual', 'auto'));

-- ── Selección ───────────────────────────────────────────────────────────────

-- Candidatas que cumplen TODOS los filtros (sin orden ni máximo). La usan la
-- selección automática (con foto obligatoria) y la búsqueda manual.
-- Rendimiento (medido en X6), sin cambiar el resultado (test de paridad TS ↔
-- SQL): la zona se resuelve UNA vez por texto de zona distinto (hay muchos
-- menos textos que propiedades) y la comprobación de fotos va al FINAL, solo
-- para las que ya pasaron todos los demás filtros.
CREATE OR REPLACE FUNCTION catalog_candidates(p_criteria jsonb, p_require_photo boolean, p_text text)
RETURNS TABLE (property_id uuid, sale_group integer, eff_price numeric, created_at timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH k AS (
    SELECT p_criteria->>'operation' AS op,
           (p_criteria->>'price_min')::numeric AS pmin,
           (p_criteria->>'price_max')::numeric AS pmax,
           coalesce((SELECT array_agg(z->>'name') FROM jsonb_array_elements(p_criteria->'zones') z WHERE z->>'kind' = 'district'), '{}') AS dists,
           coalesce((SELECT array_agg(z->>'name') FROM jsonb_array_elements(p_criteria->'zones') z WHERE z->>'kind' = 'barrio'), '{}') AS barrs,
           coalesce((SELECT array_agg(catalog_fold(z->>'name')) FROM jsonb_array_elements(p_criteria->'zones') z WHERE z->>'kind' = 'free'), '{}') AS frees,
           jsonb_array_length(coalesce(p_criteria->'zones', '[]'::jsonb)) > 0 AS has_zones,
           nullif(catalog_fold(p_text), '') AS q
  ),
  base AS (
    SELECT p.id, p.zone, p.subzone, p.created_at,
           CASE WHEN k.op = 'any' THEN CASE WHEN p.operation::text = 'sale' THEN 0 ELSE 1 END ELSE 0 END AS grp,
           nullif(greatest(coalesce(
             CASE WHEN k.op = 'rent' AND p.operation::text <> 'rent' THEN p.rent_price ELSE p.price END, 0), 0), 0) AS eff,
           p.bc_reference, p.title
      FROM properties p CROSS JOIN k
     WHERE p.country = 'es'
       AND p.archived_at IS NULL
       AND p.status::text IN ('available', 'reserved')
       AND (k.op = 'any'
            OR (k.op = 'sale' AND p.operation::text = 'sale')
            OR (k.op = 'rent' AND (p.operation::text = 'rent' OR 'rent' = ANY (p.operations))))
  ),
  filtered AS MATERIALIZED (
    SELECT b.*
      FROM base b CROSS JOIN k
     WHERE (k.pmin IS NULL OR (b.eff IS NOT NULL AND b.eff >= k.pmin))
       AND (k.pmax IS NULL OR (b.eff IS NOT NULL AND b.eff <= k.pmax))
       AND (k.q IS NULL OR catalog_fold(coalesce(b.bc_reference, '') || ' ' || coalesce(b.title, '')) LIKE '%' || replace(replace(replace(k.q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ),
  texts AS MATERIALIZED (
    SELECT DISTINCT t
      FROM (SELECT f.zone AS t FROM filtered f UNION ALL SELECT f.subzone FROM filtered f) x
     WHERE t IS NOT NULL AND (SELECT has_zones FROM k)
  ),
  -- Textos de zona que cumplen el criterio. Toda condición de zona es «zone O
  -- subzone», así que una vivienda casa si alguno de sus dos textos está aquí.
  ok AS MATERIALIZED (
    SELECT coalesce(array_agg(z.t), '{}') AS ts
      FROM (SELECT t, catalog_zone_match(t) AS m, catalog_zone_candidates(t) AS c FROM texts) z
      CROSS JOIN k
     WHERE z.m[1] = ANY (k.dists)
        OR z.m[2] = ANY (k.barrs)
        OR (cardinality(k.frees) > 0 AND z.c && k.frees)
  )
  SELECT f.id, f.grp, f.eff, f.created_at
    FROM filtered f
    CROSS JOIN k
    CROSS JOIN ok
   WHERE (NOT k.has_zones OR f.zone = ANY (ok.ts) OR f.subzone = ANY (ok.ts))
     AND (NOT p_require_photo OR EXISTS (SELECT 1 FROM property_photos ph WHERE ph.property_id = f.id))
$$;

-- Filtro completo → orden completo y estable → máximo. Devuelve también el
-- total de coincidencias y la clave pública (la de su fila manual si existe;
-- si no, derivada de la sal del catálogo: estable y opaca).
CREATE OR REPLACE FUNCTION catalog_select(p_catalog uuid, p_criteria jsonb)
RETURNS TABLE (property_id uuid, public_key text, ord bigint, total bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH c AS (SELECT id, key_salt FROM catalogs WHERE id = p_catalog),
  ranked AS (
    SELECT x.property_id,
           row_number() OVER (ORDER BY x.sale_group,
             CASE WHEN p_criteria->>'sort' = 'price_asc'  THEN x.eff_price END ASC NULLS LAST,
             CASE WHEN p_criteria->>'sort' = 'price_desc' THEN x.eff_price END DESC NULLS LAST,
             x.created_at DESC, x.property_id) AS ord,
           count(*) OVER () AS total
      FROM catalog_candidates(p_criteria, true, NULL) x
  )
  SELECT r.property_id,
         coalesce(ci.public_key, left(md5(c.key_salt || r.property_id::text), 16)),
         r.ord, r.total
    FROM ranked r
    CROSS JOIN c
    LEFT JOIN catalog_items ci ON ci.catalog_id = c.id AND ci.property_id = r.property_id
   WHERE r.ord <= coalesce((p_criteria->>'max')::integer, 12)
   ORDER BY r.ord
$$;

-- JSON interno de una vivienda (el mismo de 0193/0194).
CREATE OR REPLACE FUNCTION catalog_item_json(p_property uuid, p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'key',            p_key,
    'slug',           p.slug,
    'title',          p.title,
    'zone',           p.zone,
    'subzone',        p.subzone,
    'operation',      p.operation,
    'operations',     p.operations,
    'price',          p.price,
    'rent_price',     p.rent_price,
    'currency',       p.currency,
    'status',         p.status,
    'bedrooms',       p.bedrooms,
    'bathrooms',      p.bathrooms,
    'square_meters',  p.square_meters,
    'description',    p.description,
    'features',       p.features,
    'features_manual', p.features_manual,
    'floor_override', p.floor_override,
    'clean', (
      SELECT jsonb_build_object('src', d.src, 'description', d.description, 'features', d.features)
        FROM property_client_descriptions d
       WHERE d.property_id = p.id AND d.language = 'es'
    ),
    'photos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'u', md5(ph.url), 'w', ph.source_width, 'h', ph.source_height, 'c', ph.is_cover)
             ORDER BY ph.position, ph.id)
        FROM property_photos ph
       WHERE ph.property_id = p.id
    ), '[]'::jsonb)
  )
  FROM properties p
  WHERE p.id = p_property
$$;

-- ── Instantánea: 0194 + pertenencia automática (una sola sentencia) ─────────
CREATE OR REPLACE FUNCTION catalog_internal_snapshot(p_catalog uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'title',      c.title,
    'intro',      c.intro,
    'created_at', c.created_at,
    'status',     c.status,
    'owner_name', (SELECT pr.full_name FROM profiles pr WHERE pr.id = c.owner_id),
    'contact', jsonb_build_object(
      'name',  c.contact_name,
      'phone', c.contact_phone,
      'role',  c.contact_role
    ),
    'items', CASE WHEN c.mode = 'auto' THEN
      coalesce((
        SELECT jsonb_agg(catalog_item_json(s.property_id, s.public_key) ORDER BY s.ord)
          FROM catalog_select(c.id, c.criteria) s
      ), '[]'::jsonb)
    ELSE
      coalesce((
        SELECT jsonb_agg(catalog_item_json(ci.property_id, ci.public_key) ORDER BY ci.position, ci.id)
          FROM catalog_items ci
          JOIN properties p ON p.id = ci.property_id
         WHERE ci.catalog_id = c.id
           AND p.archived_at IS NULL
           AND p.status::text NOT IN ('sold', 'archived')
      ), '[]'::jsonb)
    END
  )
  FROM catalogs c
  WHERE c.id = p_catalog
$$;

-- ── Gestión: criterios, vista previa, modo y búsqueda ──────────────────────

CREATE OR REPLACE FUNCTION catalog_set_criteria(p_actor uuid, p_catalog uuid, p_criteria jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_crit    jsonb;
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  v_crit := catalog_criteria_normalize(p_criteria);
  UPDATE catalogs SET criteria = v_crit, version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Resultado automático con unos criterios (guardados o no), sin escribir.
CREATE OR REPLACE FUNCTION catalog_auto_preview(p_actor uuid, p_catalog uuid, p_criteria jsonb)
RETURNS TABLE (property_id uuid, ord bigint, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_crit jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor)
     OR NOT EXISTS (SELECT 1 FROM catalogs WHERE id = p_catalog AND owner_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_crit := catalog_criteria_normalize(coalesce(p_criteria, (SELECT criteria FROM catalogs WHERE id = p_catalog)));
  RETURN QUERY SELECT s.property_id, s.ord, s.total FROM catalog_select(p_catalog, v_crit) s;
END
$$;

-- Qué entra y qué sale si se cambia de modo (sin escribir nada).
CREATE OR REPLACE FUNCTION catalog_mode_preview(p_actor uuid, p_catalog uuid, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat    catalogs;
  v_manual uuid[];
  v_auto   uuid[];
  v_total  bigint;
  v_now    uuid[];
  v_next   uuid[];
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_cat FROM catalogs WHERE id = p_catalog;
  IF NOT FOUND OR v_cat.owner_id <> p_actor THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('manual', 'auto') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  SELECT coalesce(array_agg(ci.property_id ORDER BY ci.position, ci.id), '{}') INTO v_manual
    FROM catalog_items ci JOIN properties p ON p.id = ci.property_id
   WHERE ci.catalog_id = p_catalog AND p.archived_at IS NULL AND p.status::text NOT IN ('sold', 'archived');
  SELECT coalesce(array_agg(s.property_id ORDER BY s.ord), '{}'), coalesce(max(s.total), 0) INTO v_auto, v_total
    FROM catalog_select(p_catalog, v_cat.criteria) s;
  v_now  := CASE WHEN v_cat.mode = 'auto' THEN v_auto ELSE v_manual END;
  v_next := CASE WHEN p_mode = 'auto' THEN v_auto ELSE v_manual END;
  RETURN jsonb_build_object(
    'from', v_cat.mode,
    'to', p_mode,
    'entering', to_jsonb(ARRAY(SELECT x FROM unnest(v_next) x WHERE NOT x = ANY (v_now))),
    'leaving',  to_jsonb(ARRAY(SELECT x FROM unnest(v_now) x WHERE NOT x = ANY (v_next))),
    'auto_total', v_total,
    'auto_count', cardinality(v_auto),
    'manual_count', cardinality(v_manual)
  );
END
$$;

-- manual → auto: catalog_items NO se toca (se conserva para volver).
-- auto → manual: 'restore' (vuelve la lista manual guardada) o 'convert'
-- (la selección actual pasa a ser la lista manual, con sus claves y orden).
CREATE OR REPLACE FUNCTION catalog_set_mode(p_actor uuid, p_catalog uuid, p_mode text, p_strategy text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_ids     uuid[];
  v_keys    text[];
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF p_mode IS NULL OR p_mode NOT IN ('manual', 'auto') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  IF v_cat.mode = p_mode THEN RAISE EXCEPTION 'mode_unchanged'; END IF;
  IF p_mode = 'manual' THEN
    IF p_strategy IS NULL OR p_strategy NOT IN ('restore', 'convert') THEN RAISE EXCEPTION 'invalid_strategy'; END IF;
    IF p_strategy = 'convert' THEN
      -- Primero se calcula la selección (con las claves que ya ve el lector) y
      -- después se sustituye la lista manual: misma transacción.
      SELECT coalesce(array_agg(s.property_id ORDER BY s.ord), '{}'), coalesce(array_agg(s.public_key ORDER BY s.ord), '{}')
        INTO v_ids, v_keys
        FROM catalog_select(p_catalog, v_cat.criteria) s;
      DELETE FROM catalog_items WHERE catalog_id = p_catalog;
      INSERT INTO catalog_items (catalog_id, property_id, public_key, position)
      SELECT p_catalog, u.pid, u.pkey, (u.ord * 100)::integer
        FROM unnest(v_ids, v_keys) WITH ORDINALITY AS u(pid, pkey, ord);
    END IF;
  ELSIF p_strategy IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_strategy';
  END IF;
  UPDATE catalogs SET mode = p_mode, version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Búsqueda de la gestión (modo manual): mismos filtros, sin foto obligatoria
-- y sin máximo; paginada. Solo lectura.
CREATE OR REPLACE FUNCTION catalog_property_search(
  p_actor uuid, p_catalog uuid, p_criteria jsonb, p_text text, p_limit integer, p_offset integer)
RETURNS TABLE (property_id uuid, total bigint, in_catalog boolean)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_crit jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor)
     OR NOT EXISTS (SELECT 1 FROM catalogs WHERE id = p_catalog AND owner_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_crit := catalog_criteria_normalize(p_criteria);
  RETURN QUERY
    SELECT r.property_id, r.total,
           EXISTS (SELECT 1 FROM catalog_items ci WHERE ci.catalog_id = p_catalog AND ci.property_id = r.property_id)
      FROM (
        SELECT x.property_id,
               row_number() OVER (ORDER BY x.sale_group,
                 CASE WHEN v_crit->>'sort' = 'price_asc'  THEN x.eff_price END ASC NULLS LAST,
                 CASE WHEN v_crit->>'sort' = 'price_desc' THEN x.eff_price END DESC NULLS LAST,
                 x.created_at DESC, x.property_id) AS ord,
               count(*) OVER () AS total
          FROM catalog_candidates(v_crit, false, p_text) x
      ) r
     WHERE r.ord > greatest(coalesce(p_offset, 0), 0)
       AND r.ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 20), 1), 50)
     ORDER BY r.ord;
END
$$;

-- ── Lista manual: rechaza en modo automático (sin modelo híbrido) ──────────

CREATE OR REPLACE FUNCTION catalog_add_property(p_actor uuid, p_catalog uuid, p_property uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_status  text;
  v_country text;
  v_arch    timestamptz;
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF v_cat.mode = 'auto' THEN
    RAISE EXCEPTION 'catalog_auto';
  END IF;
  IF v_cat.status <> 'active' THEN
    RAISE EXCEPTION 'catalog_archived';
  END IF;
  SELECT status::text, country, archived_at INTO v_status, v_country, v_arch
    FROM properties WHERE id = p_property;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;
  IF v_arch IS NOT NULL OR v_status IN ('sold', 'archived') THEN
    RAISE EXCEPTION 'property_not_available';
  END IF;
  IF v_country IS DISTINCT FROM 'es' THEN
    RAISE EXCEPTION 'property_not_es';
  END IF;
  IF EXISTS (SELECT 1 FROM catalog_items WHERE catalog_id = p_catalog AND property_id = p_property) THEN
    RAISE EXCEPTION 'already_in_catalog';
  END IF;
  INSERT INTO catalog_items (catalog_id, property_id, position)
  SELECT p_catalog, p_property, coalesce(max(position), 0) + 100
    FROM catalog_items WHERE catalog_id = p_catalog;
  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

CREATE OR REPLACE FUNCTION catalog_remove_item(p_actor uuid, p_catalog uuid, p_property uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF v_cat.mode = 'auto' THEN
    RAISE EXCEPTION 'catalog_auto';
  END IF;
  DELETE FROM catalog_items WHERE catalog_id = p_catalog AND property_id = p_property;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_in_catalog';
  END IF;
  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

CREATE OR REPLACE FUNCTION catalog_reorder(p_actor uuid, p_catalog uuid, p_properties uuid[])
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_n       integer := coalesce(cardinality(p_properties), 0);
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF v_cat.mode = 'auto' THEN
    RAISE EXCEPTION 'catalog_auto';
  END IF;
  IF (SELECT count(*) FROM catalog_items WHERE catalog_id = p_catalog) <> v_n
     OR (SELECT count(DISTINCT x) FROM unnest(p_properties) AS x) <> v_n
     OR EXISTS (
       SELECT 1 FROM unnest(p_properties) AS x
        WHERE NOT EXISTS (SELECT 1 FROM catalog_items ci WHERE ci.catalog_id = p_catalog AND ci.property_id = x)
     ) THEN
    RAISE EXCEPTION 'order_mismatch';
  END IF;
  UPDATE catalog_items ci
     SET position = o.ord * 100
    FROM unnest(p_properties) WITH ORDINALITY AS o(pid, ord)
   WHERE ci.catalog_id = p_catalog AND ci.property_id = o.pid;
  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- ── Anuncios de Idealista de origen (interno) ───────────────────────────────

CREATE TABLE IF NOT EXISTS catalog_ads (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id           uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  -- Ficha guardada (idealista_listings). Si se borra, queda el código.
  idealista_listing_id uuid        REFERENCES idealista_listings(id) ON DELETE SET NULL,
  -- Código del anuncio en Idealista (los dígitos de /inmueble/<código>/).
  ad_code              text,
  note                 text,
  created_by           uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_ads_ref      CHECK (idealista_listing_id IS NOT NULL OR ad_code IS NOT NULL),
  CONSTRAINT catalog_ads_code_ok  CHECK (ad_code IS NULL OR ad_code ~ '^[0-9]{5,12}$'),
  CONSTRAINT catalog_ads_note_len CHECK (note IS NULL OR char_length(note) <= 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_ads_listing ON catalog_ads (catalog_id, idealista_listing_id) WHERE idealista_listing_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_ads_code    ON catalog_ads (catalog_id, ad_code) WHERE ad_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_ads_listing_any ON catalog_ads (idealista_listing_id);
ALTER TABLE catalog_ads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_ads FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_ads TO service_role;

CREATE OR REPLACE FUNCTION catalog_ad_add(p_actor uuid, p_catalog uuid, p_listing uuid, p_code text, p_note text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id   uuid;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF p_listing IS NULL AND v_code IS NULL THEN RAISE EXCEPTION 'ad_required'; END IF;
  IF v_code IS NOT NULL AND v_code !~ '^[0-9]{5,12}$' THEN RAISE EXCEPTION 'invalid_ad_code'; END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 200 THEN RAISE EXCEPTION 'invalid_ad_note'; END IF;
  IF p_listing IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM idealista_listings WHERE id = p_listing) THEN RAISE EXCEPTION 'listing_not_found'; END IF;
    -- Se guarda también su código (si lo tiene) para no perderlo si la ficha se borra.
    IF v_code IS NULL THEN
      SELECT CASE WHEN idealista_property_id ~ '^[0-9]{5,12}$' THEN idealista_property_id END
        INTO v_code FROM idealista_listings WHERE id = p_listing;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM catalog_ads
              WHERE catalog_id = p_catalog
                AND ((p_listing IS NOT NULL AND idealista_listing_id = p_listing)
                     OR (v_code IS NOT NULL AND ad_code = v_code))) THEN
    RAISE EXCEPTION 'ad_exists';
  END IF;
  INSERT INTO catalog_ads (catalog_id, idealista_listing_id, ad_code, note, created_by)
  VALUES (p_catalog, p_listing, v_code, v_note, p_actor)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION catalog_ad_remove(p_actor uuid, p_ad uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_catalog uuid;
BEGIN
  SELECT catalog_id INTO v_catalog FROM catalog_ads WHERE id = p_ad;
  IF NOT FOUND THEN
    -- Mismo error que un catálogo ajeno: no se revela si existe.
    PERFORM catalog_require_owner(p_actor, NULL);
    RAISE EXCEPTION 'forbidden';
  END IF;
  PERFORM catalog_require_owner(p_actor, v_catalog);
  DELETE FROM catalog_ads WHERE id = p_ad;
END
$$;

-- ── Permisos (E1) ───────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_fold(text)                                              FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_zone_candidates(text)                                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_zone_match(text)                                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_criteria_normalize(jsonb)                               FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_candidates(jsonb, boolean, text)                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_select(uuid, jsonb)                                     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_item_json(uuid, text)                                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)                                 FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_criteria(uuid, uuid, jsonb)                         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_auto_preview(uuid, uuid, jsonb)                         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_mode_preview(uuid, uuid, text)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_mode(uuid, uuid, text, text)                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_property_search(uuid, uuid, jsonb, text, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_add_property(uuid, uuid, uuid)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_remove_item(uuid, uuid, uuid)                           FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_reorder(uuid, uuid, uuid[])                             FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_ad_add(uuid, uuid, uuid, text, text)                    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_ad_remove(uuid, uuid)                                   FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION catalog_fold(text)                                           TO service_role;
GRANT EXECUTE ON FUNCTION catalog_zone_candidates(text)                                TO service_role;
GRANT EXECUTE ON FUNCTION catalog_zone_match(text)                                     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_criteria_normalize(jsonb)                            TO service_role;
GRANT EXECUTE ON FUNCTION catalog_candidates(jsonb, boolean, text)                     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_select(uuid, jsonb)                                  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_item_json(uuid, text)                                TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)                              TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_criteria(uuid, uuid, jsonb)                      TO service_role;
GRANT EXECUTE ON FUNCTION catalog_auto_preview(uuid, uuid, jsonb)                      TO service_role;
GRANT EXECUTE ON FUNCTION catalog_mode_preview(uuid, uuid, text)                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_mode(uuid, uuid, text, text)                     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_property_search(uuid, uuid, jsonb, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_add_property(uuid, uuid, uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_remove_item(uuid, uuid, uuid)                        TO service_role;
GRANT EXECUTE ON FUNCTION catalog_reorder(uuid, uuid, uuid[])                          TO service_role;
GRANT EXECUTE ON FUNCTION catalog_ad_add(uuid, uuid, uuid, text, text)                 TO service_role;
GRANT EXECUTE ON FUNCTION catalog_ad_remove(uuid, uuid)                                TO service_role;

COMMIT;
