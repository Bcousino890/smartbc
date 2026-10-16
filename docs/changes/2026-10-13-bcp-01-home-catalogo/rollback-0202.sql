-- ============================================================================
-- Reversión de 0202_catalog_photo_prefs.sql (BCP-01 E3, fotos por catálogo).
--
-- Deja la base como estaba tras 0197 (y 0198–0201, que no tocan catálogos):
--   · SE PIERDEN todos los ajustes de fotos de todos los catálogos (excluidas
--     y aperturas elegidas). Un rollback con SQL no los reconstruye.
--   · catalog_item_json y catalog_internal_snapshot vuelven a la definición
--     de 0197 (copiadas literalmente): sin 'f' ni 'pp'. La huella de todos
--     los catálogos cambia otra vez y los lectores vuelven a ver TODAS las
--     fotos, también las que E3 excluía.
--   · Las fichas y las fotos del CRM no se tocan.
-- El código también hay que revertirlo (git revert del merge); el código
-- anterior con el esquema nuevo funciona, pero enseña todas las fotos.
--
-- La ejecuta una PERSONA (Fabricio) solo si hace falta; ningún agente la
-- ejecuta contra datos reales. ANTES, copia de lo que se pierde:
--   \copy (SELECT * FROM catalog_photo_prefs) TO 'catalog_photo_prefs_backup.csv' CSV HEADER
-- Después, quitar la fila 0202_catalog_photo_prefs.sql de schema_migrations
-- si se quiere volver a aplicar.
-- ============================================================================

BEGIN;

-- ── Definiciones anteriores (0197) ──────────────────────────────────────────
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
      -- 0197: la clase de la foto (para elegir la foto de cada sección) solo
      -- se añade si se conoce: la corregida a mano manda; la de la IA, solo
      -- con confianza ≥ 0,75 (la misma regla que el renderer de SmartLink).
      SELECT jsonb_agg(jsonb_build_object(
               'u', md5(ph.url), 'w', ph.source_width, 'h', ph.source_height, 'c', ph.is_cover)
             || CASE WHEN coalesce(ph.class_override, CASE WHEN coalesce(ph.ai_confidence, 0) >= 0.75 THEN ph.ai_class END) IS NULL
                     THEN '{}'::jsonb
                     ELSE jsonb_build_object('k', coalesce(ph.class_override, CASE WHEN coalesce(ph.ai_confidence, 0) >= 0.75 THEN ph.ai_class END)) END
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
    -- La lista efectiva (automática o manual) y, en la MISMA consulta, el
    -- texto publicado vigente de este catálogo y la historia aprobada de cada
    -- vivienda. Una función por vivienda costaba ~30 % más (medido en Z7).
    SELECT coalesce(jsonb_agg(
             catalog_item_json(l.property_id, l.public_key)
             || coalesce(tx.j, '{}'::jsonb)
             || coalesce(st.j, '{}'::jsonb)
             ORDER BY l.o1, l.o2), '[]'::jsonb) AS items
      FROM (
        SELECT s.property_id, s.public_key, s.ord AS o1, NULL::uuid AS o2
          FROM catalog_select(c.id, c.criteria) s
         WHERE c.mode = 'auto'
        UNION ALL
        SELECT ci.property_id, ci.public_key, ci.position::bigint, ci.id
          FROM catalog_items ci
          JOIN properties p ON p.id = ci.property_id
         WHERE c.mode <> 'auto'
           AND ci.catalog_id = c.id
           AND p.archived_at IS NULL
           AND p.status::text NOT IN ('sold', 'archived')
      ) l
      -- Texto del catálogo: solo si está publicado y su fuente no cambió.
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('text', jsonb_build_object('b', t.pub_body, 'l', t.pub_lead, 'h', to_jsonb(t.pub_highlights))) AS j
          FROM catalog_texts t
         WHERE t.catalog_id = c.id AND t.property_id = l.property_id
           AND (t.pub_body IS NOT NULL OR t.pub_lead IS NOT NULL)
           AND t.pub_source_hash = catalog_source_hash(l.property_id)
      ) tx ON true
      -- Historia aprobada (solo lectura; su vigencia se comprueba en TS con
      -- la huella del motor). Bloques aprobados con texto, en su orden.
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('story', jsonb_build_object(
                 'h',  v.source_hash,
                 'p',  CASE WHEN v.prelude_status = 'approved' THEN v.prelude END,
                 'ph', CASE WHEN v.prelude_status = 'approved' THEN v.prelude_headline END,
                 'b',  bl.blocks)) AS j
          FROM property_story_versions v
          CROSS JOIN LATERAL (
            SELECT jsonb_agg(jsonb_build_object('c', b.chapter, 't', b.copy) ORDER BY b.position, b.id) AS blocks
              FROM property_story_blocks b
             WHERE b.version_id = v.id AND b.status = 'approved' AND btrim(b.copy) <> ''
          ) bl
         WHERE v.property_id = l.property_id AND v.status = 'approved' AND bl.blocks IS NOT NULL
         LIMIT 1
      ) st ON true
    -- OFFSET 0: sin esto el planificador «aplana» la subconsulta y copia la
    -- expresión en cada uso de it.items, así que con portada elegida la lista
    -- se calculaba DOS veces (medido en Y5: el doble de tiempo).
    OFFSET 0
  ) it
  WHERE c.id = p_catalog
$$;

DROP FUNCTION IF EXISTS catalog_photo_opening(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS catalog_photo_exclude(uuid, uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS catalog_photo_excluded_urls(uuid, uuid);
DROP FUNCTION IF EXISTS catalog_photo_key(uuid);
DROP TABLE IF EXISTS catalog_photo_prefs;

REVOKE ALL ON FUNCTION catalog_item_json(uuid, text)     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)   FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_item_json(uuid, text)  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid) TO service_role;

COMMIT;
