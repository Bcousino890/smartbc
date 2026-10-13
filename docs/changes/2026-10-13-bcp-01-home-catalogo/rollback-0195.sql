-- ============================================================================
-- Reversión de 0195_catalog_selection.sql (BCP-01 ampliación, PR-B).
--
-- Deja la base como estaba tras 0194:
--   · SE PIERDEN los criterios, el modo y los anuncios asociados.
--   · Los catálogos que estaban en automático vuelven a su lista MANUAL, que
--     0195 nunca toca salvo «convertir» (en ese caso queda la lista convertida).
--   · catalog_add_property / remove_item / reorder vuelven a la versión de 0192
--     y la instantánea a la de 0194.
-- Hay que revertir también el código (git revert del merge).
--
-- La ejecuta una PERSONA (Fabricio) solo si hace falta; ningún agente la
-- ejecuta contra datos reales. Después, quitar la fila
-- 0195_catalog_selection.sql de schema_migrations si se quiere volver a aplicar.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS catalog_ad_remove(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_ad_add(uuid, uuid, uuid, text, text);
DROP TABLE IF EXISTS catalog_ads;
DROP FUNCTION IF EXISTS catalog_property_search(uuid, uuid, jsonb, text, integer, integer);
DROP FUNCTION IF EXISTS catalog_set_mode(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS catalog_mode_preview(uuid, uuid, text);
DROP FUNCTION IF EXISTS catalog_auto_preview(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS catalog_set_criteria(uuid, uuid, jsonb);

-- Instantánea de 0194 (antes de borrar las funciones que usaba la de 0195).
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
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'key',            ci.public_key,
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
      ) ORDER BY ci.position, ci.id)
        FROM catalog_items ci
        JOIN properties p ON p.id = ci.property_id
       WHERE ci.catalog_id = c.id
         AND p.archived_at IS NULL
         AND p.status::text NOT IN ('sold', 'archived')
    ), '[]'::jsonb)
  )
  FROM catalogs c
  WHERE c.id = p_catalog
$$;

DROP FUNCTION IF EXISTS catalog_item_json(uuid, text);
DROP FUNCTION IF EXISTS catalog_select(uuid, jsonb);
DROP FUNCTION IF EXISTS catalog_candidates(jsonb, boolean, text);
DROP FUNCTION IF EXISTS catalog_criteria_normalize(jsonb);
DROP FUNCTION IF EXISTS catalog_zone_match(text);
DROP FUNCTION IF EXISTS catalog_zone_candidates(text);
DROP FUNCTION IF EXISTS catalog_fold(text);
DROP TABLE IF EXISTS catalog_zone_terms;

ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_mode_ok;
ALTER TABLE catalogs DROP COLUMN IF EXISTS mode;
ALTER TABLE catalogs DROP COLUMN IF EXISTS criteria;
ALTER TABLE catalogs DROP COLUMN IF EXISTS key_salt;

-- Funciones de lista de 0192 (sin el rechazo 'catalog_auto').
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
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
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
  v_n       integer := coalesce(cardinality(p_properties), 0);
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
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

REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_add_property(uuid, uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_remove_item(uuid, uuid, uuid)  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_reorder(uuid, uuid, uuid[])    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_add_property(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_remove_item(uuid, uuid, uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_reorder(uuid, uuid, uuid[])    TO service_role;

COMMIT;
