-- ============================================================================
-- Reversión de 0223 (idioma del catálogo y del enlace personal).
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--
-- Efecto: get_public_catalog y get_catalog_states vuelven a las de 0218 (sin
-- «lang» en la instantánea), catalog_public_fingerprint a la de 0193, y se
-- borran las funciones y las columnas nuevas (catalogs.default_lang y
-- catalog_client_links.lang).
-- SE PIERDEN LOS IDIOMAS ELEGIDOS: si hay que conservarlos, copiar antes
--   SELECT id, default_lang FROM catalogs WHERE default_lang <> 'es';
--   SELECT id, lang FROM catalog_client_links WHERE lang IS NOT NULL;
-- Todas las huellas públicas cambian una vez (la instantánea pierde «lang»);
-- los lectores abiertos reciben una actualización sin cambios visibles y el
-- código del lector, al no recibir idioma, sigue en español.
-- ============================================================================
BEGIN;

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
        SELECT s.catalog_id, s.expires_at, s.revoked_at FROM catalog_shares s WHERE s.token = p_token
        UNION ALL
        SELECT l.catalog_id, l.expires_at, l.revoked_at FROM catalog_client_links l WHERE l.token = p_token
      ) t
      JOIN catalogs c ON c.id = t.catalog_id
      CROSS JOIN LATERAL (SELECT catalog_internal_snapshot(c.id) AS snap) x
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
              THEN md5(catalog_internal_snapshot(c.id)::text) END,
         CASE WHEN k.catalog_id IS NOT NULL AND k.revoked_at IS NULL AND k.expires_at > now() AND c.status = 'active'
              THEN k.expires_at END
    FROM unnest(p_tokens) AS t(tok)
    LEFT JOIN LATERAL (
      SELECT s.catalog_id, s.expires_at, s.revoked_at FROM catalog_shares s WHERE s.token = t.tok
      UNION ALL
      SELECT l.catalog_id, l.expires_at, l.revoked_at FROM catalog_client_links l WHERE l.token = t.tok
      LIMIT 1
    ) k ON true
    LEFT JOIN catalogs c ON c.id = k.catalog_id
$$;

CREATE OR REPLACE FUNCTION catalog_public_fingerprint(p_actor uuid, p_catalog uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor)
     OR NOT EXISTS (SELECT 1 FROM catalogs WHERE id = p_catalog AND owner_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN md5(catalog_internal_snapshot(p_catalog)::text);
END
$$;

REVOKE ALL ON FUNCTION get_public_catalog(text)                  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_catalog_states(text[])                FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_public_fingerprint(uuid, uuid)    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_catalog(text)               TO service_role;
GRANT EXECUTE ON FUNCTION get_catalog_states(text[])             TO service_role;
GRANT EXECUTE ON FUNCTION catalog_public_fingerprint(uuid, uuid) TO service_role;

DROP FUNCTION IF EXISTS catalog_client_link_set_lang(uuid, uuid, text);
DROP FUNCTION IF EXISTS catalog_set_default_lang(uuid, uuid, text);
DROP FUNCTION IF EXISTS catalog_lang_snapshot(uuid, text);

ALTER TABLE catalog_client_links DROP CONSTRAINT IF EXISTS catalog_client_links_lang_valid;
ALTER TABLE catalog_client_links DROP COLUMN IF EXISTS lang;
ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_default_lang_valid;
ALTER TABLE catalogs DROP COLUMN IF EXISTS default_lang;

COMMIT;
