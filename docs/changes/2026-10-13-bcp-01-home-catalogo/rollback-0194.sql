-- ============================================================================
-- Reversión de 0194_catalog_contact.sql (BCP-01 ampliación, PR-A).
--
-- Deja la base como estaba tras 0193: borra las funciones nuevas, las
-- restricciones y las columnas de contacto (SE PIERDEN los contactos editados
-- por catálogo) y vuelve a crear catalog_create (0192) y la instantánea
-- (0193) tal como eran. Hay que revertir también el código (el lector de
-- antes vuelve a usar el perfil del dueño y el teléfono de la agencia).
--
-- La ejecuta una PERSONA (Fabricio) solo si hace falta; ningún agente la
-- ejecuta contra datos reales. Después, quitar la fila
-- 0194_catalog_contact.sql de schema_migrations si se quiere volver a aplicar.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS catalog_set_contact(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS catalog_create_v2(uuid, text, text, text, text, text);
ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_contact_name_ok;
ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_contact_phone_ok;
ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_contact_role_ok;
DROP FUNCTION IF EXISTS catalog_contact_name_ok(text);
ALTER TABLE catalogs DROP COLUMN IF EXISTS contact_name;
ALTER TABLE catalogs DROP COLUMN IF EXISTS contact_phone;
ALTER TABLE catalogs DROP COLUMN IF EXISTS contact_role;

-- catalog_create de 0192
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

-- catalog_internal_snapshot de 0193
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

REVOKE ALL ON FUNCTION catalog_create(uuid, text, text)  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)   FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_create(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)  TO service_role;

COMMIT;
