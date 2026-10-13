-- ============================================================================
-- Reversión de 0196_catalog_adjustments.sql (BCP-01 ampliación C1).
--
-- Deja la base como estaba tras 0195:
--   · SE PIERDEN las inclusiones y exclusiones (catalog_adjustments) y la
--     portada elegida (catalogs.cover_property_id / cover_photo_id).
--   · Los catálogos automáticos vuelven a ser solo sus criterios; la lista
--     manual guardada no se toca.
--   · catalog_select, la instantánea y las funciones de gestión vuelven a su
--     definición de 0195 (copiada literalmente de 0195_catalog_selection.sql).
-- Hay que revertir también el código (git revert del merge).
--
-- La ejecuta una PERSONA (Fabricio) solo si hace falta; ningún agente la
-- ejecuta contra datos reales. Copia previa opcional de lo que se pierde:
--   SELECT * FROM catalog_adjustments;
--   SELECT id, cover_property_id, cover_photo_id FROM catalogs WHERE cover_property_id IS NOT NULL;
-- Después, quitar la fila 0196_catalog_adjustments.sql de schema_migrations si
-- se quiere volver a aplicar.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS catalog_set_cover(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_adjust(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS catalog_adjust_clear(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_effective_ids(uuid);
DROP FUNCTION IF EXISTS catalog_available_inclusions(uuid);
DROP FUNCTION IF EXISTS catalog_select(uuid, jsonb);
DROP FUNCTION IF EXISTS catalog_auto_preview(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS catalog_property_search(uuid, uuid, jsonb, text, integer, integer);

-- ── Definiciones de 0195 ────────────────────────────────────────────────────
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

DROP TABLE IF EXISTS catalog_adjustments;
ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_cover_photo_needs_property;
ALTER TABLE catalogs DROP COLUMN IF EXISTS cover_photo_id;
ALTER TABLE catalogs DROP COLUMN IF EXISTS cover_property_id;

-- Permisos de 0195 (las funciones recreadas pierden los suyos).
REVOKE ALL ON FUNCTION catalog_select(uuid, jsonb)                                     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)                                 FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_criteria(uuid, uuid, jsonb)                         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_auto_preview(uuid, uuid, jsonb)                         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_mode_preview(uuid, uuid, text)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_mode(uuid, uuid, text, text)                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_property_search(uuid, uuid, jsonb, text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_select(uuid, jsonb)                                  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)                              TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_criteria(uuid, uuid, jsonb)                      TO service_role;
GRANT EXECUTE ON FUNCTION catalog_auto_preview(uuid, uuid, jsonb)                      TO service_role;
GRANT EXECUTE ON FUNCTION catalog_mode_preview(uuid, uuid, text)                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_mode(uuid, uuid, text, text)                     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_property_search(uuid, uuid, jsonb, text, integer, integer) TO service_role;

COMMIT;
