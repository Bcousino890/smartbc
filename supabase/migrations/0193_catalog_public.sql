-- ============================================================================
-- 0193 · BCP-01 fase 2: enlace público del catálogo, instantánea y huella.
--
-- Expediente: docs/changes/2026-10-13-bcp-01-home-catalogo/
--
-- Qué añade (solo funciones NUEVAS; no altera tablas):
--   · catalog_internal_snapshot(catalog)  instantánea INTERNA del catálogo en
--     una sola sentencia (no sale tal cual a ningún navegador: el servidor la
--     filtra con lib/catalogs/to-public.ts).
--   · get_public_catalog(token)           acceso + instantánea + huella.
--   · get_catalog_states(tokens[])        validez + huella de varios enlaces en
--     una consulta (lo usa el vigilante del servidor cada 300 ms).
--   · catalog_public_fingerprint(actor, catalog)  huella para la medición.
--   · catalog_share_create/renew/revoke   gestión del enlace (dueño, p_actor).
--
-- Huella (E3): md5 de la instantánea interna COMPLETA. Cambia con cualquier
-- cambio de membresía (incluido el borrado en cascada de una propiedad), de
-- orden, de metadatos, de cualquier campo de cualquier propiedad del catálogo,
-- de su disponibilidad (vendida/archivada sale, reservada lleva marca), de
-- features/floor_override y de sus fotos (alta, baja, orden, portada, URL).
-- La instantánea es UNA sentencia: lo que lee sale de un mismo instante.
--
-- Permisos (E1): todas SECURITY INVOKER, search_path fijo y EXECUTE solo para
-- service_role (revocado a public/anon/authenticated). La lectura pública pasa
-- por las rutas de Next, que validan el token y limitan peticiones.
--
-- Transacción e idempotencia: todo dentro de BEGIN/COMMIT; CREATE OR REPLACE.
-- Reversión: docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0193.sql
-- ============================================================================

BEGIN;

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

-- Acceso + instantánea + huella, en una sola sentencia. Un enlace inexistente,
-- revocado, caducado o de un catálogo archivado devuelve {"valid": false}, sin
-- decir cuál de las cuatro cosas pasa.
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

-- Validez y huella de varios enlaces a la vez (vigilante del servidor).
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

-- Huella del catálogo para la medición de D13 (la HOME la publica tras guardar).
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

-- ── Enlaces (D11): 1–365 días, renovación con el mismo token, revocación ────

CREATE OR REPLACE FUNCTION catalog_share_create(p_actor uuid, p_catalog uuid, p_days integer)
RETURNS TABLE (token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat catalogs;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF v_cat.status <> 'active' THEN
    RAISE EXCEPTION 'catalog_archived';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'invalid_days';
  END IF;
  IF EXISTS (SELECT 1 FROM catalog_shares s WHERE s.catalog_id = p_catalog AND s.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'share_exists';
  END IF;
  RETURN QUERY
    INSERT INTO catalog_shares (catalog_id, token, expires_at, created_by)
    VALUES (p_catalog, generate_url_safe_token(21), now() + make_interval(days => p_days), p_actor)
    RETURNING catalog_shares.token, catalog_shares.expires_at;
END
$$;

-- Renueva el enlace vigente (aunque ya hubiera caducado) con el MISMO token.
CREATE OR REPLACE FUNCTION catalog_share_renew(p_actor uuid, p_catalog uuid, p_days integer)
RETURNS TABLE (token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat catalogs;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF v_cat.status <> 'active' THEN
    RAISE EXCEPTION 'catalog_archived';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'invalid_days';
  END IF;
  RETURN QUERY
    UPDATE catalog_shares s
       SET expires_at = now() + make_interval(days => p_days)
     WHERE s.catalog_id = p_catalog AND s.revoked_at IS NULL
    RETURNING s.token, s.expires_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_share';
  END IF;
END
$$;

-- Revoca el enlace vigente. Un enlace revocado no vuelve a funcionar: si se
-- crea otro, tendrá otro token.
CREATE OR REPLACE FUNCTION catalog_share_revoke(p_actor uuid, p_catalog uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  UPDATE catalog_shares SET revoked_at = now()
   WHERE catalog_id = p_catalog AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_share';
  END IF;
END
$$;

-- ── Permisos (E1) ───────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)               FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_public_catalog(text)                      FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION get_catalog_states(text[])                    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_public_fingerprint(uuid, uuid)        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_share_create(uuid, uuid, integer)     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_share_renew(uuid, uuid, integer)      FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_share_revoke(uuid, uuid)              FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)            TO service_role;
GRANT EXECUTE ON FUNCTION get_public_catalog(text)                   TO service_role;
GRANT EXECUTE ON FUNCTION get_catalog_states(text[])                 TO service_role;
GRANT EXECUTE ON FUNCTION catalog_public_fingerprint(uuid, uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_share_create(uuid, uuid, integer)  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_share_renew(uuid, uuid, integer)   TO service_role;
GRANT EXECUTE ON FUNCTION catalog_share_revoke(uuid, uuid)           TO service_role;

COMMIT;
