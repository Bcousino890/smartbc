-- ============================================================================
-- Reversión de 0218 (asignaciones a clientes, enlaces personales y opiniones).
-- Expediente: docs/changes/2026-10-20-bcp-01-compacto-y-opiniones/
--
-- Efecto: get_public_catalog y get_catalog_states vuelven a la versión de
-- 0193 (solo enlaces generales: los enlaces personales dejan de abrir); se
-- borran las funciones nuevas y las tablas catalog_client_links y
-- catalog_feedback. LAS OPINIONES Y ASIGNACIONES SE PIERDEN: si hay que
-- conservarlas, copiar antes
--   SELECT * FROM catalog_feedback;  SELECT * FROM catalog_client_links;
-- Los avisos ya creados en crm_notifications (type 'catalog_feedback') NO se
-- borran: son del usuario que los recibió. Si se quieren quitar:
--   DELETE FROM crm_notifications WHERE type = 'catalog_feedback';
-- Ninguna huella pública cambia (las opiniones nunca entraron en ella).
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS catalog_feedback_set(text, text, integer, text);
DROP FUNCTION IF EXISTS catalog_feedback_get(text);
DROP FUNCTION IF EXISTS catalog_client_links_list(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_client_link_revoke(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_client_link_renew(uuid, uuid, integer);
DROP FUNCTION IF EXISTS catalog_client_link_create(uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS catalog_client_link_valid(text);
DROP FUNCTION IF EXISTS catalog_public_keys(uuid);

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
             'expires_at',  s.expires_at,
             'fingerprint', md5(x.snap::text),
             'snapshot',    x.snap)
      FROM catalog_shares s
      JOIN catalogs c ON c.id = s.catalog_id
      CROSS JOIN LATERAL (SELECT catalog_internal_snapshot(c.id) AS snap) x
     WHERE s.token = p_token
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND c.status = 'active'
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
         (s.id IS NOT NULL AND s.revoked_at IS NULL AND s.expires_at > now() AND c.status = 'active'),
         CASE WHEN s.id IS NOT NULL AND s.revoked_at IS NULL AND s.expires_at > now() AND c.status = 'active'
              THEN md5(catalog_internal_snapshot(c.id)::text) END,
         CASE WHEN s.id IS NOT NULL AND s.revoked_at IS NULL AND s.expires_at > now() AND c.status = 'active'
              THEN s.expires_at END
    FROM unnest(p_tokens) AS t(tok)
    LEFT JOIN catalog_shares s ON s.token = t.tok
    LEFT JOIN catalogs c ON c.id = s.catalog_id
$$;

REVOKE ALL ON FUNCTION get_public_catalog(text)   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_catalog_states(text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_catalog(text)   TO service_role;
GRANT EXECUTE ON FUNCTION get_catalog_states(text[]) TO service_role;

DROP TABLE IF EXISTS catalog_feedback;
DROP TABLE IF EXISTS catalog_client_links;

COMMIT;
