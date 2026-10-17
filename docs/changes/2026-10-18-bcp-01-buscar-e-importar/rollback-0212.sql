-- ============================================================================
-- Reversión de 0212 (BCP-01 P2: buscador del catálogo, máximo de 24 y
-- operación del catálogo).
--
-- No se pierde ningún dato: 0212 solo crea funciones y redefine
-- catalog_add_property. Tras revertir, catalog_add_property vuelve a la
-- definición de 0195 (sin máximo) y el buscador nuevo deja de funcionar (el
-- código que lo usa responde con error), así que se revierte junto con el
-- build anterior a P2/P3. La operación que se haya guardado con
-- catalog_set_operation se queda en criteria.operation (es un dato válido).
-- La ejecuta una persona, nunca un agente contra datos reales.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS catalog_search(uuid, uuid, jsonb, integer, integer);
DROP FUNCTION IF EXISTS catalog_search_normalize(jsonb);
DROP FUNCTION IF EXISTS catalog_search_uuids(jsonb, text);
DROP FUNCTION IF EXISTS catalog_search_int(jsonb, text, numeric, numeric);
DROP FUNCTION IF EXISTS catalog_set_operation(uuid, uuid, text);

-- catalog_add_property tal como la deja 0195.
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

REVOKE ALL ON FUNCTION catalog_add_property(uuid, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_add_property(uuid, uuid, uuid) TO service_role;

COMMIT;
