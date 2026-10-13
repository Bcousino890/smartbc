-- ============================================================================
-- 0194 · BCP-01 ampliación (PR-A): contacto público por catálogo.
--
-- Expediente: docs/changes/2026-10-13-bcp-01-home-catalogo/ (ampliacion-*.md)
--
-- Qué añade:
--   · catalogs.contact_name / contact_phone (E.164) / contact_role
--     ('asesor' | 'asesora'). Es lo que el lector enseña en la portada
--     («Preparada por») y en el cierre. Solo cambia lo que se MUESTRA: no da
--     acceso a la HOME a nadie (eso sigue siendo home_owners).
--   · Catálogos existentes: se rellenan con el nombre del perfil del dueño y
--     el teléfono de la agencia (+34 641 457 123), que es lo que ya se veía.
--     Desde aquí el lector lee lo GUARDADO en el catálogo, no el perfil ni
--     una constante.
--   · catalog_create (misma firma, para el build anterior) ya guarda esos
--     valores por defecto; catalog_create_v2 recibe el contacto.
--   · catalog_set_contact(actor, catalog, name, phone, role).
--   · catalog_internal_snapshot: añade 'contact' y CONSERVA todas las claves
--     de 0193 (incluida owner_name) para el build anterior.
--
-- Permisos (E1): SECURITY INVOKER, search_path fijo, EXECUTE solo service_role.
-- Transacción e idempotencia: BEGIN/COMMIT, IF NOT EXISTS, CREATE OR REPLACE;
-- el relleno solo toca valores NULL.
-- Reversión: docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0194.sql
-- ============================================================================

BEGIN;

ALTER TABLE catalogs ADD COLUMN IF NOT EXISTS contact_name  text;
ALTER TABLE catalogs ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE catalogs ADD COLUMN IF NOT EXISTS contact_role  text;

-- ── Relleno de los catálogos existentes (lo que ya se veía) ─────────────────
UPDATE catalogs c
   SET contact_name = left(btrim(p.full_name), 80)
  FROM profiles p
 WHERE p.id = c.owner_id
   AND c.contact_name IS NULL
   AND char_length(btrim(coalesce(p.full_name, ''))) >= 2;
UPDATE catalogs SET contact_phone = '+34641457123' WHERE contact_phone IS NULL;
UPDATE catalogs SET contact_role  = 'asesor'       WHERE contact_role  IS NULL;

-- ── Validación (también la hace el servidor antes de llegar aquí) ───────────
-- Nombre: 2–80 caracteres, sin correos, URLs ni secuencias de 6+ cifras.
CREATE OR REPLACE FUNCTION catalog_contact_name_ok(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_name IS NOT NULL
     AND char_length(btrim(p_name)) BETWEEN 2 AND 80
     AND p_name !~ '@'
     AND p_name !~* '(https?://|www\.)'
     AND p_name !~ '[0-9]([[:space:].-]?[0-9]){5,}'
$$;

ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_contact_name_ok;
ALTER TABLE catalogs ADD CONSTRAINT catalogs_contact_name_ok
  CHECK (contact_name IS NULL OR catalog_contact_name_ok(contact_name));
ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_contact_phone_ok;
ALTER TABLE catalogs ADD CONSTRAINT catalogs_contact_phone_ok
  CHECK (contact_phone IS NULL OR contact_phone ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_contact_role_ok;
ALTER TABLE catalogs ADD CONSTRAINT catalogs_contact_role_ok
  CHECK (contact_role IS NULL OR contact_role IN ('asesor', 'asesora'));

-- ── Crear: misma firma que 0192 (build anterior) con valores por defecto ────
CREATE OR REPLACE FUNCTION catalog_create(p_actor uuid, p_title text, p_intro text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id   uuid;
  v_name text;
BEGIN
  PERFORM catalog_require_owner(p_actor, NULL);
  SELECT left(btrim(full_name), 80) INTO v_name FROM profiles WHERE id = p_actor;
  IF NOT catalog_contact_name_ok(v_name) THEN
    v_name := NULL;
  END IF;
  INSERT INTO catalogs (owner_id, title, intro, contact_name, contact_phone, contact_role)
  VALUES (p_actor, btrim(coalesce(p_title, '')), nullif(btrim(coalesce(p_intro, '')), ''),
          v_name, '+34641457123', 'asesor')
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- Crear con el contacto elegido en el formulario.
CREATE OR REPLACE FUNCTION catalog_create_v2(
  p_actor uuid, p_title text, p_intro text, p_name text, p_phone text, p_role text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM catalog_require_owner(p_actor, NULL);
  IF NOT catalog_contact_name_ok(p_name) THEN
    RAISE EXCEPTION 'invalid_contact_name';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'invalid_contact_phone';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('asesor', 'asesora') THEN
    RAISE EXCEPTION 'invalid_contact_role';
  END IF;
  INSERT INTO catalogs (owner_id, title, intro, contact_name, contact_phone, contact_role)
  VALUES (p_actor, btrim(coalesce(p_title, '')), nullif(btrim(coalesce(p_intro, '')), ''),
          btrim(p_name), p_phone, p_role)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- Editar el contacto público de un catálogo (también archivado).
CREATE OR REPLACE FUNCTION catalog_set_contact(
  p_actor uuid, p_catalog uuid, p_name text, p_phone text, p_role text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF NOT catalog_contact_name_ok(p_name) THEN
    RAISE EXCEPTION 'invalid_contact_name';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'invalid_contact_phone';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('asesor', 'asesora') THEN
    RAISE EXCEPTION 'invalid_contact_role';
  END IF;
  UPDATE catalogs
     SET contact_name  = btrim(p_name),
         contact_phone = p_phone,
         contact_role  = p_role,
         version       = version + 1,
         updated_at    = now()
   WHERE id = p_catalog
  RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- ── Instantánea: 0193 + 'contact' (una sola sentencia) ──────────────────────
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

-- ── Permisos (E1) ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION catalog_contact_name_ok(text)                               FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_create(uuid, text, text)                            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_create_v2(uuid, text, text, text, text, text)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_contact(uuid, uuid, text, text, text)           FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)                             FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION catalog_contact_name_ok(text)                            TO service_role;
GRANT EXECUTE ON FUNCTION catalog_create(uuid, text, text)                         TO service_role;
GRANT EXECUTE ON FUNCTION catalog_create_v2(uuid, text, text, text, text, text)    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_contact(uuid, uuid, text, text, text)        TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)                          TO service_role;

COMMIT;
