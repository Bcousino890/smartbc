-- ============================================================================
-- 0223 · BCP-01: idioma del catálogo y del enlace personal (base multilingüe
-- del lector, sin IA).
--
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--   (spec.md §3, DA9, DA17, DA19, DA20; plan.md PR4).
--
-- Qué añade:
--   · catalogs.default_lang (NOT NULL DEFAULT 'es'): idioma por defecto del
--     catálogo, con la MISMA lista y comprobación que los idiomas del
--     itinerario y el shortlist (0130 vi_language_valid, 0134 cs_language_valid).
--   · catalog_client_links.lang (NULL = el del catálogo): idioma propio de
--     una asignación personal (DA9). No toca a otros enlaces (DA17).
--   · catalog_lang_snapshot(catálogo, idioma): la instantánea de
--     catalog_internal_snapshot más «lang». get_public_catalog,
--     get_catalog_states y catalog_public_fingerprint la usan con el idioma
--     del TOKEN (el del enlace personal si lo tiene, si no el del catálogo),
--     así que el idioma entra en la huella (DA19): el lector, el vigilante y
--     la captura del PDF no pueden servir el idioma de otro enlace.
--   · catalog_set_default_lang y catalog_client_link_set_lang: funciones del
--     dueño (catalog_require_owner), con 'invalid_lang' fuera de la lista.
--     Hasta el PR6 la interfaz solo ofrece 'es'; los demás idiomas se prueban
--     con fixtures y aquí.
--
-- Efecto al desplegar: TODAS las huellas públicas cambian una vez (la
-- instantánea gana «lang»); los lectores abiertos reciben una actualización
-- sin cambios visibles (todo sigue en español). Ningún dato cambia.
-- No escribe en properties. Sin IA en SQL.
-- Permisos (E1): RLS como el resto, REVOKE a public/anon/authenticated y
-- EXECUTE solo a service_role. SECURITY INVOKER y search_path fijo.
-- Idempotente. Una sola transacción.
-- Reversión: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/rollback-0223.sql
-- ============================================================================

BEGIN;

-- ── Columnas ────────────────────────────────────────────────────────────────

ALTER TABLE catalogs ADD COLUMN IF NOT EXISTS default_lang text NOT NULL DEFAULT 'es';
ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_default_lang_valid;
ALTER TABLE catalogs ADD CONSTRAINT catalogs_default_lang_valid
  CHECK (default_lang IN ('es','en','fr','it','de','ar','tr','he'));

ALTER TABLE catalog_client_links ADD COLUMN IF NOT EXISTS lang text;
ALTER TABLE catalog_client_links DROP CONSTRAINT IF EXISTS catalog_client_links_lang_valid;
ALTER TABLE catalog_client_links ADD CONSTRAINT catalog_client_links_lang_valid
  CHECK (lang IS NULL OR lang IN ('es','en','fr','it','de','ar','tr','he'));

-- ── Instantánea con idioma ──────────────────────────────────────────────────

-- La instantánea interna vigente (la última definición de
-- catalog_internal_snapshot, hoy 0222) más el idioma del enlace. Es lo que se
-- sirve y lo que se hashea: cambiar el idioma cambia la huella.
CREATE OR REPLACE FUNCTION catalog_lang_snapshot(p_catalog uuid, p_lang text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT catalog_internal_snapshot(p_catalog) || jsonb_build_object('lang', coalesce(p_lang, 'es'))
$$;

-- Como en 0218 (enlaces generales y personales), con el idioma del token.
CREATE OR REPLACE FUNCTION get_public_catalog(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
             'valid',       true,
             'expires_at',  t.expires_at,
             'fingerprint', md5(x.snap::text),
             'snapshot',    x.snap)
      FROM (
        SELECT s.catalog_id, s.expires_at, s.revoked_at, NULL::text AS lang FROM catalog_shares s WHERE s.token = p_token
        UNION ALL
        SELECT l.catalog_id, l.expires_at, l.revoked_at, l.lang FROM catalog_client_links l WHERE l.token = p_token
      ) t
      JOIN catalogs c ON c.id = t.catalog_id
      CROSS JOIN LATERAL (SELECT catalog_lang_snapshot(c.id, coalesce(t.lang, c.default_lang)) AS snap) x
     WHERE t.revoked_at IS NULL
       AND t.expires_at > now()
       AND c.status = 'active'
     LIMIT 1
  ), jsonb_build_object('valid', false))
$$;

CREATE OR REPLACE FUNCTION get_catalog_states(p_tokens text[])
RETURNS TABLE (token text, valid boolean, fingerprint text, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT t.tok,
         (k.catalog_id IS NOT NULL AND k.revoked_at IS NULL AND k.expires_at > now() AND c.status = 'active'),
         CASE WHEN k.catalog_id IS NOT NULL AND k.revoked_at IS NULL AND k.expires_at > now() AND c.status = 'active'
              THEN md5(catalog_lang_snapshot(c.id, coalesce(k.lang, c.default_lang))::text) END,
         CASE WHEN k.catalog_id IS NOT NULL AND k.revoked_at IS NULL AND k.expires_at > now() AND c.status = 'active'
              THEN k.expires_at END
    FROM unnest(p_tokens) AS t(tok)
    LEFT JOIN LATERAL (
      SELECT s.catalog_id, s.expires_at, s.revoked_at, NULL::text AS lang FROM catalog_shares s WHERE s.token = t.tok
      UNION ALL
      SELECT l.catalog_id, l.expires_at, l.revoked_at, l.lang FROM catalog_client_links l WHERE l.token = t.tok
      LIMIT 1
    ) k ON true
    LEFT JOIN catalogs c ON c.id = k.catalog_id
$$;

-- Huella para la medición de D13 (la HOME la compara con la del enlace
-- general): la misma que ve el enlace general, con el idioma del catálogo.
CREATE OR REPLACE FUNCTION catalog_public_fingerprint(p_actor uuid, p_catalog uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lang text;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor)
     OR NOT EXISTS (SELECT 1 FROM catalogs WHERE id = p_catalog AND owner_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT default_lang INTO v_lang FROM catalogs WHERE id = p_catalog;
  RETURN md5(catalog_lang_snapshot(p_catalog, v_lang)::text);
END
$$;

-- ── Funciones del dueño ─────────────────────────────────────────────────────

-- Idioma por defecto del catálogo. Sube la versión como cualquier escritura
-- de gestión (lectura coherente). Errores: 'forbidden', 'catalog_not_found',
-- 'invalid_lang'.
CREATE OR REPLACE FUNCTION catalog_set_default_lang(p_actor uuid, p_catalog uuid, p_lang text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF p_lang IS NULL OR p_lang NOT IN ('es','en','fr','it','de','ar','tr','he') THEN
    RAISE EXCEPTION 'invalid_lang';
  END IF;
  UPDATE catalogs SET default_lang = p_lang, version = version + 1, updated_at = now()
   WHERE id = p_catalog AND default_lang IS DISTINCT FROM p_lang;
END
$$;

-- Idioma propio de una asignación personal (NULL = el del catálogo). Solo
-- cambia ESE enlace (DA17). Errores: 'link_not_found', 'forbidden',
-- 'link_revoked', 'invalid_lang'.
CREATE OR REPLACE FUNCTION catalog_client_link_set_lang(p_actor uuid, p_link uuid, p_lang text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_link catalog_client_links;
BEGIN
  SELECT * INTO v_link FROM catalog_client_links WHERE id = p_link;
  IF NOT FOUND THEN RAISE EXCEPTION 'link_not_found'; END IF;
  PERFORM catalog_require_owner(p_actor, v_link.catalog_id);
  IF v_link.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'link_revoked'; END IF;
  IF p_lang IS NOT NULL AND p_lang NOT IN ('es','en','fr','it','de','ar','tr','he') THEN
    RAISE EXCEPTION 'invalid_lang';
  END IF;
  UPDATE catalog_client_links SET lang = p_lang WHERE id = p_link AND lang IS DISTINCT FROM p_lang;
  -- Sube la versión del catálogo como cualquier escritura de gestión.
  UPDATE catalogs SET version = version + 1, updated_at = now() WHERE id = v_link.catalog_id;
END
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_lang_snapshot(uuid, text)                FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_public_catalog(text)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_catalog_states(text[])                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_public_fingerprint(uuid, uuid)            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_default_lang(uuid, uuid, text)        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_client_link_set_lang(uuid, uuid, text)    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_lang_snapshot(uuid, text)              TO service_role;
GRANT EXECUTE ON FUNCTION get_public_catalog(text)                       TO service_role;
GRANT EXECUTE ON FUNCTION get_catalog_states(text[])                     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_public_fingerprint(uuid, uuid)         TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_default_lang(uuid, uuid, text)     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_client_link_set_lang(uuid, uuid, text) TO service_role;

COMMIT;
