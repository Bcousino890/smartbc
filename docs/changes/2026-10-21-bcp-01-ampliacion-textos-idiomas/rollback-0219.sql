-- ============================================================================
-- Reversión de 0219 (biblioteca de textos aprobados y reutilización).
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--
-- Efecto: catalog_add_property vuelve a la versión de 0212 (añadir ya no
-- copia textos aprobados); se borran las funciones nuevas, la columna
-- catalog_texts.copy_version_id y la tabla property_copy_versions.
-- LA BIBLIOTECA DE TEXTOS APROBADOS SE PIERDE: si hay que conservarla, copiar
-- antes  SELECT * FROM property_copy_versions;
-- Los textos ya copiados a catálogos NO se tocan: son textos normales del
-- catálogo (siguen publicados y editables). Ninguna huella pública cambia.
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS catalog_copy_candidates(uuid);
DROP FUNCTION IF EXISTS catalog_copy_state(uuid, uuid[]);
DROP FUNCTION IF EXISTS catalog_copy_withdraw(uuid, uuid, text);
DROP FUNCTION IF EXISTS catalog_copy_approve(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS catalog_copy_require_home(uuid);
DROP FUNCTION IF EXISTS catalog_copy_content_hash(text, text, text, text);

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

REVOKE ALL ON FUNCTION catalog_add_property(uuid, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_add_property(uuid, uuid, uuid) TO service_role;

ALTER TABLE catalog_texts DROP COLUMN IF EXISTS copy_version_id;
DROP TABLE IF EXISTS property_copy_versions;

COMMIT;
