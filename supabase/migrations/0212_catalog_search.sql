-- ============================================================================
-- 0212 · BCP-01 P2: buscador del catálogo (como el de Propiedades), máximo de
-- 24 viviendas en la selección explícita y ajuste «Operación del catálogo».
-- Expediente: docs/changes/2026-10-18-bcp-01-buscar-e-importar/ (I-1 a I-7).
--
-- · catalog_search_normalize(filtros) — valida y normaliza los filtros
--   (espejo: lib/catalogs/search-filters.ts). Operación, zonas y precio se
--   validan con catalog_criteria_normalize (0195): mismas reglas que hoy.
-- · catalog_search(actor, catálogo, filtros, offset, limit) → UN jsonb
--   {total, rows, catalog}. Un solo valor para no chocar con db-max-rows de
--   PostgREST. limit NULL = todas (el servidor aplica texto y planta en TS con
--   matchesPropertySearch y resolveFloor, y pagina él).
--   Reglas de catalog_candidates (0195): España, operación y precio K2
--   (rent_price en duales que se alquilan), zonas por la taxonomía en zone O
--   subzone. Además: estados (por defecto disponibles y reservadas), m²,
--   dormitorios exactos o «N o más», baños mínimos, estancia, agencia y
--   etiquetas (basta una). Solo el dueño de la HOME y SU catálogo.
-- · catalog_add_property: igual que 0195 + máximo de 24 viviendas visibles
--   (disponibles o reservadas, no archivadas) → 'catalog_full'. Comprueba en
--   este orden: automático, archivado, propiedad, «ya está», lleno. Un
--   catálogo que ya tenga más de 24 no pierde nada: solo deja de admitir altas.
-- · catalog_set_operation(actor, catálogo, op) — cambia SOLO
--   criteria.operation (y quita precios con 'any', que no los admite) y sube
--   la versión. Rechaza el modo automático.
--
-- Sin cambios de datos. Idempotente (CREATE OR REPLACE). Reversión:
-- docs/changes/2026-10-18-bcp-01-buscar-e-importar/rollback-0212.sql.
-- El build anterior no llama a las funciones nuevas; con él, solo cambia que
-- añadir una vivienda número 25 a un catálogo responde 'catalog_full'.
-- ============================================================================

BEGIN;

-- Entero opcional dentro de [lo, hi]; NULL si falta. 'invalid_filters' si no.
CREATE OR REPLACE FUNCTION catalog_search_int(p jsonb, p_key text, p_lo numeric, p_hi numeric)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p->p_key IS NULL OR jsonb_typeof(p->p_key) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p->p_key) <> 'number' OR (p->>p_key)::numeric <> trunc((p->>p_key)::numeric)
     OR (p->>p_key)::numeric < p_lo OR (p->>p_key)::numeric > p_hi THEN
    RAISE EXCEPTION 'invalid_filters';
  END IF;
  RETURN (p->>p_key)::integer;
END
$$;

-- Lista opcional de uuid (máx. 50, sin repetir). 'invalid_filters' si no.
CREATE OR REPLACE FUNCTION catalog_search_uuids(p jsonb, p_key text)
RETURNS uuid[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v uuid[] := '{}';
  e jsonb;
BEGIN
  IF p->p_key IS NULL OR jsonb_typeof(p->p_key) = 'null' THEN
    RETURN v;
  END IF;
  IF jsonb_typeof(p->p_key) <> 'array' OR jsonb_array_length(p->p_key) > 50 THEN
    RAISE EXCEPTION 'invalid_filters';
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p->p_key) LOOP
    IF jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid_filters';
    END IF;
    IF NOT ((e #>> '{}')::uuid = ANY (v)) THEN
      v := v || (e #>> '{}')::uuid;
    END IF;
  END LOOP;
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION catalog_search_normalize(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_crit     jsonb;
  v_amin     integer;
  v_amax     integer;
  v_bed      integer;
  v_bed_mode text;
  v_bath     integer;
  v_stay     text;
  v_sort     text;
  v_status   text[] := '{}';
  e          jsonb;
BEGIN
  IF p IS NULL OR p = 'null'::jsonb THEN
    p := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'invalid_filters';
  END IF;
  -- Operación, zonas y precio: las MISMAS reglas que los criterios (0195).
  BEGIN
    v_crit := catalog_criteria_normalize(jsonb_build_object(
      'operation', coalesce(p->'operation', '"any"'::jsonb),
      'zones', coalesce(p->'zones', '[]'::jsonb),
      'price_min', p->'price_min',
      'price_max', p->'price_max'));
  EXCEPTION WHEN raise_exception THEN
    RAISE EXCEPTION 'invalid_filters';
  END;
  v_amin := catalog_search_int(p, 'area_min', 0, 100000);
  v_amax := catalog_search_int(p, 'area_max', 0, 100000);
  IF v_amin IS NOT NULL AND v_amax IS NOT NULL AND v_amin > v_amax THEN RAISE EXCEPTION 'invalid_filters'; END IF;
  v_bed := catalog_search_int(p, 'bedrooms', 0, 50);
  v_bed_mode := coalesce(p->>'bedrooms_mode', 'exact');
  IF v_bed_mode NOT IN ('exact', 'min') THEN RAISE EXCEPTION 'invalid_filters'; END IF;
  v_bath := catalog_search_int(p, 'bathrooms_min', 0, 50);
  v_stay := p->>'stay';
  IF v_stay IS NOT NULL AND v_stay NOT IN ('long', 'short') THEN RAISE EXCEPTION 'invalid_filters'; END IF;
  v_sort := coalesce(p->>'sort', 'newest');
  IF v_sort NOT IN ('newest', 'price_asc', 'price_desc') THEN RAISE EXCEPTION 'invalid_filters'; END IF;
  IF p->'statuses' IS NULL OR jsonb_typeof(p->'statuses') = 'null' THEN
    v_status := ARRAY['available', 'reserved'];
  ELSE
    IF jsonb_typeof(p->'statuses') <> 'array' OR jsonb_array_length(p->'statuses') = 0 THEN
      RAISE EXCEPTION 'invalid_filters';
    END IF;
    FOR e IN SELECT value FROM jsonb_array_elements(p->'statuses') LOOP
      IF jsonb_typeof(e) <> 'string' OR (e #>> '{}') NOT IN ('available', 'reserved', 'sold', 'archived') THEN
        RAISE EXCEPTION 'invalid_filters';
      END IF;
      IF NOT ((e #>> '{}') = ANY (v_status)) THEN v_status := v_status || (e #>> '{}'); END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object(
    'operation', v_crit->'operation',
    'zones', v_crit->'zones',
    'price_min', v_crit->'price_min',
    'price_max', v_crit->'price_max',
    'area_min', v_amin,
    'area_max', v_amax,
    'bedrooms', v_bed,
    'bedrooms_mode', CASE WHEN v_bed IS NULL THEN NULL ELSE v_bed_mode END,
    'bathrooms_min', v_bath,
    'stay', v_stay,
    'agency_ids', to_jsonb(catalog_search_uuids(p, 'agency_ids')),
    'tag_ids', to_jsonb(catalog_search_uuids(p, 'tag_ids')),
    'statuses', to_jsonb((SELECT array_agg(s ORDER BY array_position(ARRAY['available','reserved','sold','archived'], s)) FROM unnest(v_status) s)),
    'sort', v_sort,
    'with_texts', coalesce(p->>'with_texts', 'false') = 'true'
  );
END
$$;

CREATE OR REPLACE FUNCTION catalog_search(
  p_actor uuid, p_catalog uuid, p_filters jsonb, p_offset integer, p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_f       jsonb;
  v_cat     catalogs;
  v_ids     uuid[];
  v_visible integer;
  v_total   bigint;
  v_rows    jsonb;
  v_off     integer := greatest(coalesce(p_offset, 0), 0);
  v_lim     integer := CASE WHEN p_limit IS NULL THEN NULL ELSE least(greatest(p_limit, 1), 200) END;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_cat FROM catalogs WHERE id = p_catalog AND owner_id = p_actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_f := catalog_search_normalize(p_filters);
  v_ids := catalog_effective_ids(p_catalog);
  v_visible := coalesce(cardinality(v_ids), 0);

  WITH k AS (
    SELECT v_f->>'operation' AS op,
           (v_f->>'price_min')::numeric AS pmin,
           (v_f->>'price_max')::numeric AS pmax,
           (v_f->>'area_min')::integer AS amin,
           (v_f->>'area_max')::integer AS amax,
           (v_f->>'bedrooms')::integer AS bed,
           v_f->>'bedrooms_mode' AS bed_mode,
           (v_f->>'bathrooms_min')::integer AS bath,
           v_f->>'stay' AS stay,
           ARRAY(SELECT jsonb_array_elements_text(v_f->'agency_ids'))::uuid[] AS agencies,
           ARRAY(SELECT jsonb_array_elements_text(v_f->'tag_ids'))::uuid[] AS tags,
           ARRAY(SELECT jsonb_array_elements_text(v_f->'statuses')) AS statuses,
           coalesce((SELECT array_agg(z->>'name') FROM jsonb_array_elements(v_f->'zones') z WHERE z->>'kind' = 'district'), '{}') AS dists,
           coalesce((SELECT array_agg(z->>'name') FROM jsonb_array_elements(v_f->'zones') z WHERE z->>'kind' = 'barrio'), '{}') AS barrs,
           coalesce((SELECT array_agg(catalog_fold(z->>'name')) FROM jsonb_array_elements(v_f->'zones') z WHERE z->>'kind' = 'free'), '{}') AS frees,
           jsonb_array_length(v_f->'zones') > 0 AS has_zones,
           v_f->>'sort' AS sort
  ),
  base AS MATERIALIZED (
    SELECT p.id, p.zone, p.subzone, p.created_at,
           CASE WHEN p.archived_at IS NOT NULL OR p.status::text = 'archived' THEN 'archived' ELSE p.status::text END AS st,
           CASE WHEN k.op = 'any' THEN CASE WHEN p.operation::text = 'sale' THEN 0 ELSE 1 END ELSE 0 END AS grp,
           -- Precio efectivo K2 (igual que catalog_candidates, 0195).
           nullif(greatest(coalesce(
             CASE WHEN k.op = 'rent' AND p.operation::text <> 'rent' THEN p.rent_price ELSE p.price END, 0), 0), 0) AS eff
      FROM properties p CROSS JOIN k
     WHERE p.country = 'es'
       AND (k.op = 'any'
            OR (k.op = 'sale' AND p.operation::text = 'sale')
            OR (k.op = 'rent' AND (p.operation::text = 'rent' OR 'rent' = ANY (p.operations))))
       AND (k.amin IS NULL OR (p.square_meters IS NOT NULL AND p.square_meters >= k.amin))
       AND (k.amax IS NULL OR (p.square_meters IS NOT NULL AND p.square_meters <= k.amax))
       AND (k.bed IS NULL OR (k.bed_mode = 'exact' AND p.bedrooms = k.bed) OR (k.bed_mode = 'min' AND p.bedrooms >= k.bed))
       AND (k.bath IS NULL OR p.bathrooms >= k.bath)
       AND (k.stay IS NULL OR p.stay::text = k.stay)
       AND (cardinality(k.agencies) = 0 OR p.agency_id = ANY (k.agencies))
       AND (cardinality(k.tags) = 0 OR EXISTS (
             SELECT 1 FROM property_tag_links l WHERE l.property_id = p.id AND l.tag_id = ANY (k.tags)))
  ),
  filtered AS MATERIALIZED (
    SELECT b.*
      FROM base b CROSS JOIN k
     WHERE b.st = ANY (k.statuses)
       AND (k.pmin IS NULL OR (b.eff IS NOT NULL AND b.eff >= k.pmin))
       AND (k.pmax IS NULL OR (b.eff IS NOT NULL AND b.eff <= k.pmax))
  ),
  texts AS MATERIALIZED (
    SELECT DISTINCT t
      FROM (SELECT f.zone AS t FROM filtered f UNION ALL SELECT f.subzone FROM filtered f) x
     WHERE t IS NOT NULL AND (SELECT has_zones FROM k)
  ),
  -- Zonas: las mismas reglas que catalog_candidates (zone O subzone).
  ok AS MATERIALIZED (
    SELECT coalesce(array_agg(z.t), '{}') AS ts
      FROM (SELECT t, catalog_zone_match(t) AS m, catalog_zone_candidates(t) AS c FROM texts) z
      CROSS JOIN k
     WHERE z.m[1] = ANY (k.dists)
        OR z.m[2] = ANY (k.barrs)
        OR (cardinality(k.frees) > 0 AND z.c && k.frees)
  ),
  matched AS MATERIALIZED (
    SELECT f.*,
           row_number() OVER (ORDER BY
             CASE WHEN k.sort <> 'newest' THEN f.grp END,
             CASE WHEN k.sort = 'price_asc'  THEN f.eff END ASC NULLS LAST,
             CASE WHEN k.sort = 'price_desc' THEN f.eff END DESC NULLS LAST,
             f.created_at DESC, f.id) AS ord
      FROM filtered f CROSS JOIN k CROSS JOIN ok
     WHERE (NOT k.has_zones OR f.zone = ANY (ok.ts) OR f.subzone = ANY (ok.ts))
  ),
  page AS (
    SELECT m.* FROM matched m
     WHERE m.ord > v_off AND (v_lim IS NULL OR m.ord <= v_off + v_lim)
  )
  SELECT (SELECT count(*) FROM matched),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'slug', p.slug,
           'title', p.title,
           'bc_reference', p.bc_reference,
           'external_id', p.external_id,
           'property_reference', p.property_reference,
           'zone', p.zone,
           'subzone', p.subzone,
           'agency_id', p.agency_id,
           'agency_name', a.name,
           'tag_names', coalesce((SELECT jsonb_agg(t.name ORDER BY t.name)
                                    FROM property_tag_links l JOIN property_tags t ON t.id = l.tag_id
                                   WHERE l.property_id = p.id), '[]'::jsonb),
           'status', pg.st,
           'operation', p.operation,
           'operations', to_jsonb(p.operations),
           'price', p.price,
           'rent_price', p.rent_price,
           'currency', p.currency,
           'eff_price', pg.eff,
           'bedrooms', p.bedrooms,
           'bathrooms', p.bathrooms,
           'square_meters', p.square_meters,
           'stay', p.stay,
           'created_at', p.created_at,
           'photo_count', (SELECT count(*) FROM property_photos ph WHERE ph.property_id = p.id),
           'cover_url', (SELECT ph.url FROM property_photos ph WHERE ph.property_id = p.id
                          ORDER BY ph.is_cover DESC, ph.position, ph.id LIMIT 1),
           'in_catalog', CASE WHEN v_cat.mode = 'auto' THEN p.id = ANY (v_ids)
                              ELSE EXISTS (SELECT 1 FROM catalog_items ci WHERE ci.catalog_id = p_catalog AND ci.property_id = p.id) END,
           'texts', CASE WHEN (v_f->>'with_texts')::boolean THEN jsonb_build_object(
                      'floor_override', p.floor_override,
                      'features', to_jsonb(p.features),
                      'features_manual', to_jsonb(p.features_manual),
                      'description', p.description) END
         ) ORDER BY pg.ord), '[]'::jsonb)
    INTO v_total, v_rows
    FROM page pg
    JOIN properties p ON p.id = pg.id
    LEFT JOIN agencies a ON a.id = p.agency_id;

  RETURN jsonb_build_object(
    'total', v_total,
    'rows', v_rows,
    'filters', v_f,
    'catalog', jsonb_build_object('mode', v_cat.mode, 'status', v_cat.status, 'visible', v_visible, 'max', 24));
END
$$;

-- Igual que 0195 + máximo de 24 viviendas visibles (I-6).
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
  -- El bloqueo de catalog_require_owner serializa dos altas simultáneas.
  IF (SELECT count(*) FROM catalog_items ci JOIN properties p ON p.id = ci.property_id
       WHERE ci.catalog_id = p_catalog AND p.archived_at IS NULL
         AND p.status::text IN ('available', 'reserved')) >= 24 THEN
    RAISE EXCEPTION 'catalog_full';
  END IF;
  INSERT INTO catalog_items (catalog_id, property_id, position)
  SELECT p_catalog, p_property, coalesce(max(position), 0) + 100
    FROM catalog_items WHERE catalog_id = p_catalog;
  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- «Operación del catálogo» (I-7): qué precio ven el lector y el PDF. Cambia
-- SOLO criteria.operation; con 'any' quita los precios (no los admite). No
-- aplica en automático (allí la operación es un criterio de pertenencia).
CREATE OR REPLACE FUNCTION catalog_set_operation(p_actor uuid, p_catalog uuid, p_operation text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_crit    jsonb;
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF p_operation IS NULL OR p_operation NOT IN ('sale', 'rent', 'any') THEN
    RAISE EXCEPTION 'invalid_criteria';
  END IF;
  IF v_cat.mode = 'auto' THEN
    RAISE EXCEPTION 'catalog_auto';
  END IF;
  IF v_cat.status <> 'active' THEN
    RAISE EXCEPTION 'catalog_archived';
  END IF;
  IF v_cat.criteria->>'operation' = p_operation THEN
    RETURN v_cat.version;
  END IF;
  v_crit := jsonb_set(v_cat.criteria, '{operation}', to_jsonb(p_operation));
  IF p_operation = 'any' THEN
    v_crit := v_crit || '{"price_min": null, "price_max": null}'::jsonb;
  END IF;
  UPDATE catalogs SET criteria = v_crit, version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

REVOKE ALL ON FUNCTION catalog_search_int(jsonb, text, numeric, numeric)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_search_uuids(jsonb, text)                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_search_normalize(jsonb)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_search(uuid, uuid, jsonb, integer, integer)      FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_add_property(uuid, uuid, uuid)                   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_operation(uuid, uuid, text)                  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_search_int(jsonb, text, numeric, numeric)    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_search_uuids(jsonb, text)                     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_search_normalize(jsonb)                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_search(uuid, uuid, jsonb, integer, integer)   TO service_role;
GRANT EXECUTE ON FUNCTION catalog_add_property(uuid, uuid, uuid)                TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_operation(uuid, uuid, text)               TO service_role;

COMMIT;
