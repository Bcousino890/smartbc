-- ============================================================================
-- Reversión de 0227 (acabado fotográfico por catálogo, PR7b).
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--
-- Efecto: catalog_internal_snapshot vuelve a la de 0222 (sin «fin» ni pp.n),
-- se borran las funciones nuevas, las marcas «Sin acabado en esta foto» y la
-- columna catalogs.photo_finish, y el CHECK de catalog_photo_prefs vuelve a
-- ('exclude', 'opening'). Las exclusiones y aperturas de E3 no se tocan.
-- SE PIERDE QUÉ CATÁLOGOS TENÍAN EL ACABADO Y QUÉ FOTOS LO QUITABAN: si hay
-- que conservarlo, copiar antes
--   SELECT id FROM catalogs WHERE photo_finish;
--   SELECT * FROM catalog_photo_prefs WHERE kind = 'no_finish';
-- Solo cambian las huellas de los catálogos que lo tenían ACTIVO (sus
-- lectores abiertos se refrescan y vuelven a las fotos sin tratar); el resto,
-- igual. Las variantes tratadas ya cacheadas en el CDN caducan solas (24 h) y
-- nadie las vuelve a pedir. Ninguna foto original cambió nunca.
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
    SELECT coalesce(jsonb_agg(
             catalog_item_json(l.property_id, l.public_key)
             || coalesce(tx.j, '{}'::jsonb)
             || coalesce(st.j, '{}'::jsonb)
             || coalesce(phx.j, '{}'::jsonb)
             || coalesce(ttl.j, '{}'::jsonb)
             || coalesce(ar.j, '{}'::jsonb)
             || coalesce(atx.j, '{}'::jsonb)
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
      -- Historia aprobada (solo lectura; su vigencia se comprueba en TS).
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
      -- E3: ajustes de fotos de ESTE catálogo (solo de fotos que existen).
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('pp', jsonb_build_object(
                 'x', coalesce(jsonb_agg(catalog_photo_key(pp.photo_id) ORDER BY catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'exclude'), '[]'::jsonb),
                 'o', (array_agg(catalog_photo_key(pp.photo_id)) FILTER (WHERE pp.kind = 'opening'))[1])) AS j
          FROM catalog_photo_prefs pp
          JOIN property_photos ph ON ph.id = pp.photo_id AND ph.property_id = pp.property_id
         WHERE pp.catalog_id = c.id AND pp.property_id = l.property_id
        HAVING count(*) > 0
      ) phx ON true
      -- 0217: título propio publicado de ESTE catálogo (sin condición de
      -- vigencia: los cambios de la ficha no lo retiran).
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('title', t.pub_title) AS j
          FROM catalog_texts t
         WHERE t.catalog_id = c.id AND t.property_id = l.property_id AND t.pub_title IS NOT NULL
      ) ttl ON true
      -- 0220: zona CONFIRMADA por el dueño del catálogo, solo mientras los
      -- datos de ubicación de la ficha no hayan cambiado. Sin confirmación,
      -- nada (el lector usa la zona de la ficha, como antes). Con «sin zona
      -- verificada» (area_id nulo), nombre nulo: el lector dice «El barrio».
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('area', jsonb_build_object('name', a.name, 'level', a.level)) AS j
          FROM catalog_property_areas d
          LEFT JOIN catalog_areas a ON a.id = d.area_id
         WHERE d.owner_id = c.owner_id AND d.property_id = l.property_id
           AND d.input_sig = catalog_area_input_sig(l.property_id)
      ) ar ON true
      -- 0222: copia de la plantilla «Vivir en…» de ESTE catálogo, solo si su
      -- zona es la confirmada y vigente de la vivienda (o su distrito). Si la
      -- confirmación cambia o caduca, la copia no se ve (DA37) y se conserva.
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object('at', ac.body) AS j
          FROM catalog_area_copies ac
          JOIN catalog_property_areas d
            ON d.owner_id = c.owner_id AND d.property_id = ac.property_id
           AND d.input_sig = catalog_area_input_sig(ac.property_id)
          JOIN catalog_areas a ON a.id = d.area_id
         WHERE ac.catalog_id = c.id AND ac.property_id = l.property_id
           AND (ac.area_id = a.id OR ac.area_id = a.district_id)
      ) atx ON true
    -- OFFSET 0: evita que el planificador calcule la lista dos veces (Y5).
    OFFSET 0
  ) it
  WHERE c.id = p_catalog
$$;

REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid) TO service_role;

DROP FUNCTION IF EXISTS catalog_set_photo_finish(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS catalog_photo_no_finish(uuid, uuid, uuid, uuid, boolean);

DELETE FROM catalog_photo_prefs WHERE kind = 'no_finish';
ALTER TABLE catalog_photo_prefs DROP CONSTRAINT IF EXISTS catalog_photo_prefs_kind_ok;
ALTER TABLE catalog_photo_prefs ADD CONSTRAINT catalog_photo_prefs_kind_ok CHECK (kind IN ('exclude', 'opening'));

ALTER TABLE catalogs DROP COLUMN IF EXISTS photo_finish;

COMMIT;
