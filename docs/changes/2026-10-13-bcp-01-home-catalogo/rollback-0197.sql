-- ============================================================================
-- Reversión de 0197_catalog_texts.sql (BCP-01 ampliación C2).
--
-- Deja la base como estaba tras 0196:
--   · SE PIERDEN todos los textos de los catálogos (borradores y publicados).
--   · La instantánea deja de llevar textos, historias y clases de foto; el
--     lector vuelve a la descripción limpia (como en PR-B/C1).
--   · catalog_item_json vuelve a la definición de 0195 y la instantánea a la
--     de 0196 (copiadas literalmente).
-- Hay que revertir también el código (git revert del merge).
--
-- La ejecuta una PERSONA (Fabricio) solo si hace falta; ningún agente la
-- ejecuta contra datos reales. ANTES, copia de lo que se pierde (por ejemplo
-- con \copy desde psql):
--   \copy (SELECT * FROM catalog_texts) TO 'catalog_texts_backup.csv' CSV HEADER
-- Después, quitar la fila 0197_catalog_texts.sql de schema_migrations si se
-- quiere volver a aplicar.
-- ============================================================================

BEGIN;

-- ── Definiciones anteriores (0195 y 0196) ───────────────────────────────────
CREATE OR REPLACE FUNCTION catalog_item_json(p_property uuid, p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'key',            p_key,
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
  )
  FROM properties p
  WHERE p.id = p_property
$$;

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
    'items', it.items
  ) || CASE WHEN c.cover_property_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('cover', jsonb_build_object(
    -- Clave pública de la vivienda elegida, solo si está en la lista.
    'key', (SELECT e->>'key' FROM jsonb_array_elements(it.items) e
             WHERE e->>'key' = coalesce(
               (SELECT ci.public_key FROM catalog_items ci WHERE ci.catalog_id = c.id AND ci.property_id = c.cover_property_id),
               left(md5(c.key_salt || c.cover_property_id::text), 16))
             LIMIT 1),
    -- Identificador opaco de la foto elegida (si sigue existiendo y es suya).
    'photo', (SELECT md5(ph.url) FROM property_photos ph
               WHERE ph.id = c.cover_photo_id AND ph.property_id = c.cover_property_id)
  )) END
  FROM catalogs c
  CROSS JOIN LATERAL (
    SELECT CASE WHEN c.mode = 'auto' THEN
      coalesce((
        SELECT jsonb_agg(catalog_item_json(s.property_id, s.public_key) ORDER BY s.ord)
          FROM catalog_select(c.id, c.criteria) s
      ), '[]'::jsonb)
    ELSE
      coalesce((
        SELECT jsonb_agg(catalog_item_json(ci.property_id, ci.public_key) ORDER BY ci.position, ci.id)
          FROM catalog_items ci
          JOIN properties p ON p.id = ci.property_id
         WHERE ci.catalog_id = c.id
           AND p.archived_at IS NULL
           AND p.status::text NOT IN ('sold', 'archived')
      ), '[]'::jsonb)
    END AS items
    -- OFFSET 0: sin esto el planificador «aplana» la subconsulta y copia la
    -- expresión en cada uso de it.items, así que con portada elegida la lista
    -- se calculaba DOS veces (medido en Y5: el doble de tiempo).
    OFFSET 0
  ) it
  WHERE c.id = p_catalog
$$;

DROP FUNCTION IF EXISTS catalog_text_states(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_text_delete(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_text_withdraw(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_text_publish(uuid, uuid, uuid, integer);
DROP FUNCTION IF EXISTS catalog_text_save_draft(uuid, uuid, uuid, text, text, text[], text, integer);
DROP FUNCTION IF EXISTS catalog_text_allowed(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_text_blocker(text);
DROP FUNCTION IF EXISTS catalog_source_hash(uuid);
DROP FUNCTION IF EXISTS catalog_source_facts(uuid);
DROP TABLE IF EXISTS catalog_texts;

REVOKE ALL ON FUNCTION catalog_item_json(uuid, text)    FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_item_json(uuid, text)   TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid) TO service_role;

COMMIT;
