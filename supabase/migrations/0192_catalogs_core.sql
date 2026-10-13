-- ============================================================================
-- 0192 · BCP-01 fase 1: HOME de Fabricio y catálogos (núcleo de datos).
--
-- Expediente: docs/changes/2026-10-13-bcp-01-home-catalogo/
--
-- Qué añade (solo objetos NUEVOS; no altera ninguna tabla existente):
--   · home_owners     quién puede usar la HOME. Se autoriza por id de perfil.
--   · catalogs        catálogos editoriales comunes (no ligados a un cliente).
--   · catalog_items   propiedades de cada catálogo, con su orden. Una misma
--                     propiedad puede estar en varios catálogos (no se copia).
--   · catalog_shares  enlaces para compartir (se usan a partir de la fase 2).
--   · funciones de gestión atómicas: cada una sube catalogs.version en la
--     misma transacción.
--
-- Permisos (E1). RLS activado y SIN políticas, y además:
--   · tablas: se retira todo a public/anon/authenticated; solo service_role.
--   · funciones: SECURITY INVOKER, search_path fijo, EXECUTE solo para
--     service_role. Cada una recibe p_actor y lanza 'forbidden' si ese perfil
--     no está en home_owners o no es el dueño del catálogo (defensa además de
--     la guarda del servidor, lib/catalogs/owner.ts).
--
-- Siembra: el id del ÚNICO usuario de auth.users con el correo de Fabricio
-- (profiles.id = auth.users.id). Con 0 o con varias coincidencias no se
-- inserta nada: nadie entra hasta resolverlo (fallo cerrado).
--
-- Todo va en una transacción: el runner (scripts/apply-migrations.sh) no la
-- pone por su cuenta, y un fallo a mitad no debe dejar objetos a medias.
-- Es idempotente: se puede aplicar dos veces.
--
-- Reversión: docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0192.sql
-- (borra solo estos objetos y sus datos). La ejecuta una persona, nunca un
-- agente contra datos reales.
-- ============================================================================

BEGIN;

-- ── Tablas ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS home_owners (
  profile_id uuid        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalogs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  title       text        NOT NULL,
  intro       text,
  status      text        NOT NULL DEFAULT 'active',
  version     bigint      NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT catalogs_title_len  CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT catalogs_intro_len  CHECK (intro IS NULL OR char_length(intro) <= 2000),
  CONSTRAINT catalogs_status_ok  CHECK (status IN ('active', 'archived'))
);
CREATE INDEX IF NOT EXISTS idx_catalogs_owner ON catalogs (owner_id, status);

CREATE TABLE IF NOT EXISTS catalog_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id  uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  -- CASCADE a propósito: borrar una propiedad en el CRM debe seguir
  -- funcionando igual que hoy; el catálogo simplemente la pierde.
  property_id uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  -- Clave opaca para el lector público (fase 2): nunca se expone un UUID.
  public_key  text        NOT NULL DEFAULT generate_url_safe_token(12),
  position    integer     NOT NULL,
  added_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_items_unique_property UNIQUE (catalog_id, property_id),
  CONSTRAINT catalog_items_unique_key      UNIQUE (catalog_id, public_key)
);
CREATE INDEX IF NOT EXISTS idx_catalog_items_catalog  ON catalog_items (catalog_id, position);
CREATE INDEX IF NOT EXISTS idx_catalog_items_property ON catalog_items (property_id);

CREATE TABLE IF NOT EXISTS catalog_shares (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id  uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_shares_token_len   CHECK (char_length(token) >= 24),
  CONSTRAINT catalog_shares_expiry_sane CHECK (expires_at > created_at)
);
-- Un solo enlace activo por catálogo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_shares_one_active
  ON catalog_shares (catalog_id) WHERE revoked_at IS NULL;

-- ── RLS y permisos de tablas (E1) ───────────────────────────────────────────

ALTER TABLE home_owners    ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_shares ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE home_owners, catalogs, catalog_items, catalog_shares FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE home_owners, catalogs, catalog_items, catalog_shares TO service_role;

-- ── Funciones de gestión ────────────────────────────────────────────────────

-- Comprueba que p_actor es dueño de la HOME y, si se pasa catálogo, que es
-- SU catálogo (lo bloquea FOR UPDATE para serializar cambios concurrentes).
-- Un catálogo inexistente o ajeno responde igual ('forbidden'): no se revela
-- si existe.
CREATE OR REPLACE FUNCTION catalog_require_owner(p_actor uuid, p_catalog uuid)
RETURNS catalogs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v catalogs;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_catalog IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v FROM catalogs WHERE id = p_catalog FOR UPDATE;
  IF NOT FOUND OR v.owner_id <> p_actor THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN v;
END
$$;

CREATE OR REPLACE FUNCTION catalog_create(p_actor uuid, p_title text, p_intro text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM catalog_require_owner(p_actor, NULL);
  INSERT INTO catalogs (owner_id, title, intro)
  VALUES (p_actor, btrim(coalesce(p_title, '')), nullif(btrim(coalesce(p_intro, '')), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION catalog_update_meta(p_actor uuid, p_catalog uuid, p_title text, p_intro text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  UPDATE catalogs
     SET title = btrim(coalesce(p_title, '')),
         intro = nullif(btrim(coalesce(p_intro, '')), ''),
         version = version + 1,
         updated_at = now()
   WHERE id = p_catalog
  RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Solo propiedades EXISTENTES, de España (V1), no vendidas ni archivadas.
-- No escribe nada en properties.
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

-- Recibe la lista COMPLETA en el orden nuevo. Si falta alguna propiedad, sobra
-- alguna o hay repetidas, no cambia nada ('order_mismatch').
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

CREATE OR REPLACE FUNCTION catalog_set_status(p_actor uuid, p_catalog uuid, p_status text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF p_status IS NULL OR p_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  UPDATE catalogs
     SET status = p_status,
         archived_at = CASE WHEN p_status = 'archived' THEN now() ELSE NULL END,
         version = version + 1,
         updated_at = now()
   WHERE id = p_catalog
  RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- ── Permisos de funciones (E1) ──────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_require_owner(uuid, uuid)              FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_create(uuid, text, text)               FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_update_meta(uuid, uuid, text, text)    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_add_property(uuid, uuid, uuid)         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_remove_item(uuid, uuid, uuid)          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_reorder(uuid, uuid, uuid[])            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_status(uuid, uuid, text)           FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION catalog_require_owner(uuid, uuid)           TO service_role;
GRANT EXECUTE ON FUNCTION catalog_create(uuid, text, text)            TO service_role;
GRANT EXECUTE ON FUNCTION catalog_update_meta(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_add_property(uuid, uuid, uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION catalog_remove_item(uuid, uuid, uuid)       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_reorder(uuid, uuid, uuid[])         TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_status(uuid, uuid, text)        TO service_role;

-- ── Siembra del dueño (fallo cerrado) ───────────────────────────────────────

INSERT INTO home_owners (profile_id)
SELECT p.id
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
 WHERE lower(u.email) = 'fabricio.andree@bcousinoprop.com'
   AND (SELECT count(*) FROM auth.users WHERE lower(email) = 'fabricio.andree@bcousinoprop.com') = 1
ON CONFLICT (profile_id) DO NOTHING;

COMMIT;
