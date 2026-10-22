-- ============================================================================
-- Reversión de 0228 (traducción automática del catálogo, como en los
-- itinerarios). Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--
-- Efecto: catalog_tr_activate vuelve a la de 0226 (un idioma solo se activa
-- COMPLETO) y se borran catalog_tr_reserve_auto, catalog_tr_publish,
-- catalog_tr_mark_reviewed, el índice nuevo y las columnas `approval` y
-- `auto`. NO se pierden traducciones ni copias: lo aprobado sola sigue
-- aprobado (sin la marca de cómo), las copias de los catálogos siguen y la
-- instantánea es la misma (ninguna huella cambia).
-- Los idiomas ya elegidos (aunque estuvieran incompletos) se CONSERVAN: lo que
-- no tenga copia vigente se sigue viendo con el aviso N5. Si se quiere volver
-- al español antes de revertir:
--   UPDATE catalogs SET default_lang = 'es', version = version + 1 WHERE default_lang <> 'es';
--   UPDATE catalog_client_links SET lang = NULL WHERE lang IS NOT NULL;
-- Para conservar el registro de cómo se aprobó cada traducción, copiar antes:
--   SELECT id, approval FROM catalog_tr_texts WHERE approval IS NOT NULL;
--   SELECT owner_id, lang, es, approval FROM catalog_tr_features WHERE approval IS NOT NULL;
--   SELECT id, auto FROM catalog_tr_jobs WHERE auto;
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS catalog_tr_reserve_auto(uuid, uuid, text, uuid, uuid, jsonb, integer, jsonb);
DROP FUNCTION IF EXISTS catalog_tr_publish(uuid, uuid, uuid, text, text, jsonb, text);
DROP FUNCTION IF EXISTS catalog_tr_mark_reviewed(uuid, uuid, text, uuid[], text[]);

-- catalog_tr_activate de 0226 (solo completo), tal cual.
CREATE OR REPLACE FUNCTION catalog_tr_activate(p_actor uuid, p_catalog uuid, p_link uuid, p_lang text, p_expected_version bigint, p_required jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_link    catalog_client_links;
  v_version bigint;
  v_items   jsonb := CASE WHEN jsonb_typeof(p_required->'items') = 'array' THEN p_required->'items' ELSE '[]'::jsonb END;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF p_link IS NOT NULL THEN
    SELECT * INTO v_link FROM catalog_client_links WHERE id = p_link AND catalog_id = p_catalog;
    IF NOT FOUND THEN RAISE EXCEPTION 'link_not_found'; END IF;
    IF v_link.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'link_revoked'; END IF;
  ELSIF p_lang IS NULL THEN
    RAISE EXCEPTION 'invalid_lang';
  END IF;
  IF p_lang IS NOT NULL AND p_lang NOT IN ('es','en','fr','it','de','ar','tr','he') THEN RAISE EXCEPTION 'invalid_lang'; END IF;

  IF p_lang IS NOT NULL AND p_lang <> 'es' THEN
    IF v_cat.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'catalog_changed'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(catalog_effective_ids(p_catalog)) AS e(pid)
                WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) r WHERE (r->>'p')::uuid = e.pid)) THEN
      RAISE EXCEPTION 'lang_incomplete';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_items) r
       WHERE NOT EXISTS (
         SELECT 1 FROM catalog_tr_copies cp
          WHERE cp.catalog_id = p_catalog AND cp.property_id = (r->>'p')::uuid AND cp.lang = p_lang AND cp.es_sig = r->>'s'
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r->'f') = 'array' THEN r->'f' ELSE '[]'::jsonb END) AS fe(es)
               WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(cp.features) pr WHERE pr->>0 = fe.es)))) THEN
      RAISE EXCEPTION 'lang_incomplete';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM catalog_tr_meta_copies m WHERE m.catalog_id = p_catalog AND m.lang = p_lang AND m.es_sig = p_required->>'meta') THEN
      RAISE EXCEPTION 'lang_incomplete';
    END IF;
  END IF;

  IF p_link IS NULL THEN
    UPDATE catalogs SET default_lang = p_lang, version = version + 1, updated_at = now()
     WHERE id = p_catalog AND default_lang IS DISTINCT FROM p_lang;
  ELSE
    UPDATE catalog_client_links SET lang = p_lang WHERE id = p_link AND lang IS DISTINCT FROM p_lang;
    IF FOUND THEN
      UPDATE catalogs SET version = version + 1, updated_at = now() WHERE id = p_catalog;
    END IF;
  END IF;
  SELECT version INTO v_version FROM catalogs WHERE id = p_catalog;
  RETURN v_version;
END
$$;
REVOKE ALL ON FUNCTION catalog_tr_activate(uuid, uuid, uuid, text, bigint, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_tr_activate(uuid, uuid, uuid, text, bigint, jsonb) TO service_role;

DROP INDEX IF EXISTS idx_catalog_tr_jobs_catalog_recent;
ALTER TABLE catalog_tr_texts DROP CONSTRAINT IF EXISTS catalog_tr_texts_approval_mode;
ALTER TABLE catalog_tr_features DROP CONSTRAINT IF EXISTS catalog_tr_features_approval_mode;
ALTER TABLE catalog_tr_texts DROP COLUMN IF EXISTS approval;
ALTER TABLE catalog_tr_features DROP COLUMN IF EXISTS approval;
ALTER TABLE catalog_tr_jobs DROP COLUMN IF EXISTS auto;

COMMIT;
