-- ============================================================================
-- Reversión de 0226 (traducciones preparadas y revisadas del catálogo, PR6).
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--
-- Efecto: catalog_lang_snapshot vuelve a la de 0223 (sin «tr» ni «trm») y se
-- borran las funciones y las tablas nuevas.
-- SE PIERDEN las traducciones (fuentes, borradores, aprobadas, características),
-- las copias de los catálogos y el registro de trabajos de preparación. Si hay
-- que conservarlos, copiar antes:
--   SELECT * FROM catalog_tr_sources; SELECT * FROM catalog_tr_texts;
--   SELECT * FROM catalog_tr_features; SELECT * FROM catalog_tr_copies;
--   SELECT * FROM catalog_tr_meta_copies; SELECT * FROM catalog_tr_jobs;
-- Los idiomas elegidos (catalogs.default_lang, catalog_client_links.lang, de
-- 0223) se CONSERVAN: un enlace en inglés seguirá en inglés y, sin copias, el
-- lector enseñará «Descripción en preparación» en cada vivienda (N5). Si se
-- quiere volver al español antes de revertir:
--   UPDATE catalogs SET default_lang = 'es', version = version + 1 WHERE default_lang <> 'es';
--   UPDATE catalog_client_links SET lang = NULL WHERE lang IS NOT NULL;
-- En español ninguna huella cambia (la instantánea en español es la misma).
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION catalog_lang_snapshot(p_catalog uuid, p_lang text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT catalog_internal_snapshot(p_catalog) || jsonb_build_object('lang', coalesce(p_lang, 'es'))
$$;
REVOKE ALL ON FUNCTION catalog_lang_snapshot(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_lang_snapshot(uuid, text) TO service_role;

DROP FUNCTION IF EXISTS catalog_tr_activate(uuid, uuid, uuid, text, bigint, jsonb);
DROP FUNCTION IF EXISTS catalog_tr_copy_remove(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS catalog_tr_approve(uuid, uuid, uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS catalog_tr_copy_set(uuid, uuid, uuid, text, text, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS catalog_tr_text_for(uuid, uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS catalog_tr_reject(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_tr_feature_save(uuid, text, text, text);
DROP FUNCTION IF EXISTS catalog_tr_save(uuid, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS catalog_tr_finish(uuid, uuid, text, jsonb, text);
DROP FUNCTION IF EXISTS catalog_tr_cancel(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_tr_reserve(uuid, uuid, text, uuid, uuid, jsonb, integer, boolean);
DROP FUNCTION IF EXISTS catalog_tr_area_source_ensure(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS catalog_tr_source_ensure(uuid, uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS catalog_tr_es_state(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_tr_library_version(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_tr_blocker(jsonb);
DROP FUNCTION IF EXISTS catalog_tr_keys_match(jsonb, jsonb);
DROP FUNCTION IF EXISTS catalog_tr_lock(uuid, text);
DROP FUNCTION IF EXISTS catalog_tr_lang_ok(text);

DROP TABLE IF EXISTS catalog_tr_jobs;
DROP TABLE IF EXISTS catalog_tr_meta_copies;
DROP TABLE IF EXISTS catalog_tr_copies;
DROP TABLE IF EXISTS catalog_tr_features;
DROP TABLE IF EXISTS catalog_tr_texts;
DROP TABLE IF EXISTS catalog_tr_sources;

COMMIT;
