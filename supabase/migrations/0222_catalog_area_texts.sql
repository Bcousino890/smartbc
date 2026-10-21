-- ============================================================================
-- 0222 · BCP-01: plantillas «Vivir en…» por zona (biblioteca del dueño) y su
-- copia congelada en cada catálogo.
--
-- Expediente: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/
--   (spec.md §4, DA22, DA25–DA28, DA37; plan.md PR3).
--
-- Qué añade:
--   · area_text_versions: versiones de la descripción GENERAL de una zona del
--     registro (catalog_areas, 0220) por dueño de la HOME. Estados: borrador
--     (uno como mucho por zona, editable), aprobada (una como mucho por zona)
--     y retirada (historial). Origen: introducciones de `neighborhoods`
--     (siembra, sin IA), escrita a mano o «Borrador con IA» (solo al pulsar).
--   · catalog_area_copies: la COPIA de una versión aprobada que guarda un
--     catálogo («Aplicar plantilla», o al reutilizar un texto aprobado al
--     añadir la vivienda). Actualizar o retirar la plantilla no cambia los
--     catálogos que ya la tienen (DA27).
--   · catalog_internal_snapshot: añade «at» (texto de la plantilla) solo si
--     la zona de la copia es la confirmada y vigente de la vivienda (0220) o
--     su distrito (DA37). El lector la usa solo si la descripción propia no
--     habla ya de la zona (DA25, en TS). Sin copias, nada cambia.
--   · catalog_add_property: la de 0219 más la copia de la plantilla cuando
--     se reutiliza un texto aprobado.
--
-- Nunca escribe en properties ni en neighborhoods (solo se LEEN sus textos
-- desde la gestión para sembrar borradores). Sin IA en SQL.
-- Permisos (E1): RLS sin políticas, solo service_role.
-- Idempotente. Una sola transacción.
-- Reversión: docs/changes/2026-10-21-bcp-01-ampliacion-textos-idiomas/rollback-0222.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS area_text_versions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  area_id      text        NOT NULL REFERENCES catalog_areas(id),
  seq          integer     NOT NULL,
  body         text        NOT NULL,
  status       text        NOT NULL DEFAULT 'draft',
  origin       text        NOT NULL DEFAULT 'manual',
  source_key   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  approved_at  timestamptz,
  approved_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  retired_at   timestamptz,
  CONSTRAINT area_text_versions_seq_uq   UNIQUE (owner_id, area_id, seq),
  CONSTRAINT area_text_versions_status   CHECK (status IN ('draft', 'approved', 'retired')),
  CONSTRAINT area_text_versions_origin   CHECK (origin IN ('neighborhoods', 'manual', 'ai_draft')),
  CONSTRAINT area_text_versions_body_len CHECK (btrim(body) <> '' AND char_length(body) <= 1500),
  CONSTRAINT area_text_versions_approved CHECK ((status = 'draft') = (approved_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS area_text_versions_one_draft    ON area_text_versions (owner_id, area_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS area_text_versions_one_approved ON area_text_versions (owner_id, area_id) WHERE status = 'approved';
ALTER TABLE area_text_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE area_text_versions FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE area_text_versions TO service_role;

CREATE TABLE IF NOT EXISTS catalog_area_copies (
  catalog_id   uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  property_id  uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  version_id   uuid        REFERENCES area_text_versions(id) ON DELETE SET NULL,
  area_id      text        NOT NULL REFERENCES catalog_areas(id),
  body         text        NOT NULL,
  applied_at   timestamptz NOT NULL DEFAULT now(),
  applied_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (catalog_id, property_id),
  CONSTRAINT catalog_area_copies_body_len CHECK (btrim(body) <> '' AND char_length(body) <= 1500)
);
CREATE INDEX IF NOT EXISTS idx_catalog_area_copies_property ON catalog_area_copies (property_id);
ALTER TABLE catalog_area_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_area_copies FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_area_copies TO service_role;

-- Serializa los cambios de las plantillas de una zona de un dueño.
CREATE OR REPLACE FUNCTION catalog_area_text_lock(p_owner uuid, p_area text)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('area_text:' || p_owner::text || ':' || p_area, 0))
$$;

-- Guarda el borrador de la zona (crea uno si no hay). Contacto, URL o precio
-- bloquean siempre (mismas reglas que los textos del catálogo).
CREATE OR REPLACE FUNCTION catalog_area_text_save_draft(p_actor uuid, p_area text, p_body text, p_origin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_row  area_text_versions;
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  IF NOT EXISTS (SELECT 1 FROM catalog_areas WHERE id = p_area) THEN RAISE EXCEPTION 'area_not_found'; END IF;
  IF coalesce(p_origin, 'manual') NOT IN ('manual', 'ai_draft') THEN RAISE EXCEPTION 'invalid_text'; END IF;
  IF v_body IS NULL THEN RAISE EXCEPTION 'area_text_empty'; END IF;
  IF char_length(v_body) > 1500 THEN RAISE EXCEPTION 'text_too_long'; END IF;
  IF catalog_text_blocker(v_body) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_text_blocker(v_body); END IF;
  PERFORM catalog_area_text_lock(p_actor, p_area);
  UPDATE area_text_versions SET body = v_body, origin = coalesce(p_origin, 'manual'), source_key = NULL, updated_at = now()
   WHERE owner_id = p_actor AND area_id = p_area AND status = 'draft'
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    INSERT INTO area_text_versions (owner_id, area_id, seq, body, status, origin, created_by)
    VALUES (p_actor, p_area,
            coalesce((SELECT max(seq) FROM area_text_versions WHERE owner_id = p_actor AND area_id = p_area), 0) + 1,
            v_body, 'draft', coalesce(p_origin, 'manual'), p_actor)
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('id', v_row.id, 'seq', v_row.seq);
END
$$;

-- Aprueba el borrador TAL COMO lo vio el dueño (p_body): si cambió entretanto,
-- 'draft_changed'. La aprobada anterior pasa a retirada (historial).
CREATE OR REPLACE FUNCTION catalog_area_text_approve(p_actor uuid, p_area text, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row area_text_versions;
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  PERFORM catalog_area_text_lock(p_actor, p_area);
  SELECT * INTO v_row FROM area_text_versions WHERE owner_id = p_actor AND area_id = p_area AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'area_text_not_found'; END IF;
  IF v_row.body IS DISTINCT FROM nullif(btrim(coalesce(p_body, '')), '') THEN RAISE EXCEPTION 'draft_changed'; END IF;
  IF catalog_text_blocker(v_row.body) IS NOT NULL THEN RAISE EXCEPTION '%', catalog_text_blocker(v_row.body); END IF;
  UPDATE area_text_versions SET status = 'retired', retired_at = now(), updated_at = now()
   WHERE owner_id = p_actor AND area_id = p_area AND status = 'approved';
  UPDATE area_text_versions SET status = 'approved', approved_at = now(), approved_by = p_actor, updated_at = now()
   WHERE id = v_row.id;
  RETURN jsonb_build_object('id', v_row.id, 'seq', v_row.seq);
END
$$;

-- Retira la plantilla aprobada de la zona (los catálogos que ya tienen su
-- copia no cambian). Devuelve false si no había.
CREATE OR REPLACE FUNCTION catalog_area_text_retire(p_actor uuid, p_area text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  PERFORM catalog_area_text_lock(p_actor, p_area);
  UPDATE area_text_versions SET status = 'retired', retired_at = now(), updated_at = now()
   WHERE owner_id = p_actor AND area_id = p_area AND status = 'approved';
  RETURN FOUND;
END
$$;

-- Descarta el borrador de la zona (los borradores no son historial).
CREATE OR REPLACE FUNCTION catalog_area_text_discard(p_actor uuid, p_area text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  PERFORM catalog_area_text_lock(p_actor, p_area);
  DELETE FROM area_text_versions WHERE owner_id = p_actor AND area_id = p_area AND status = 'draft';
  RETURN FOUND;
END
$$;

-- Siembra BORRADORES (sin IA) desde los textos de `neighborhoods` ya
-- asignados a una zona del registro por la gestión: [{area, body, key}].
-- Solo en zonas sin ninguna versión de este dueño; nunca aprueba nada. Los
-- textos con contacto o precio se saltan.
CREATE OR REPLACE FUNCTION catalog_area_text_seed(p_actor uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_it      jsonb;
  v_area    text;
  v_body    text;
  v_created integer := 0;
  v_skipped integer := 0;
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  IF jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 200 THEN
    RAISE EXCEPTION 'invalid_text';
  END IF;
  FOR v_it IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) LOOP
    v_area := v_it->>'area';
    v_body := nullif(btrim(coalesce(v_it->>'body', '')), '');
    IF v_area IS NULL OR NOT EXISTS (SELECT 1 FROM catalog_areas WHERE id = v_area)
       OR v_body IS NULL OR char_length(v_body) > 1500 OR catalog_text_blocker(v_body) IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    PERFORM catalog_area_text_lock(p_actor, v_area);
    IF EXISTS (SELECT 1 FROM area_text_versions WHERE owner_id = p_actor AND area_id = v_area) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO area_text_versions (owner_id, area_id, seq, body, status, origin, source_key, created_by)
    VALUES (p_actor, v_area, 1, v_body, 'draft', 'neighborhoods', left(v_it->>'key', 120), p_actor);
    v_created := v_created + 1;
  END LOOP;
  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped);
END
$$;

-- Borradores y aprobadas del dueño (las retiradas no salen).
CREATE OR REPLACE FUNCTION catalog_area_text_state(p_actor uuid)
RETURNS TABLE (id uuid, area_id text, seq integer, body text, status text, origin text, source_key text, updated_at timestamptz, approved_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM catalog_copy_require_home(p_actor);
  RETURN QUERY
    SELECT v.id, v.area_id, v.seq, v.body, v.status, v.origin, v.source_key, v.updated_at, v.approved_at
      FROM area_text_versions v
     WHERE v.owner_id = p_actor AND v.status IN ('draft', 'approved')
     ORDER BY v.area_id, v.status;
END
$$;

-- Plantilla aprobada que corresponde HOY a una vivienda: la de su zona
-- confirmada y vigente (0220) o, si es un barrio sin plantilla, la de su
-- distrito (DA23). Sin confirmación vigente, ninguna (DA37).
CREATE OR REPLACE FUNCTION catalog_area_text_for(p_owner uuid, p_property uuid)
RETURNS area_text_versions
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT v.*
    FROM catalog_property_areas d
    JOIN catalog_areas a ON a.id = d.area_id
    JOIN area_text_versions v ON v.owner_id = p_owner AND v.status = 'approved' AND v.area_id IN (a.id, a.district_id)
   WHERE d.owner_id = p_owner AND d.property_id = p_property
     AND d.input_sig = catalog_area_input_sig(p_property)
   ORDER BY (v.area_id = a.id) DESC
   LIMIT 1
$$;

-- «Aplicar plantilla»: el catálogo guarda SU copia de la plantilla que toca
-- hoy (sustituye la copia anterior de este catálogo, si la había).
CREATE OR REPLACE FUNCTION catalog_area_text_apply(p_actor uuid, p_catalog uuid, p_property uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_tpl     area_text_versions;
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF NOT catalog_text_allowed(p_catalog, p_property) THEN RAISE EXCEPTION 'not_in_catalog'; END IF;
  SELECT * INTO v_tpl FROM catalog_area_text_for(v_cat.owner_id, p_property);
  IF v_tpl.id IS NULL THEN RAISE EXCEPTION 'area_text_unavailable'; END IF;
  INSERT INTO catalog_area_copies (catalog_id, property_id, version_id, area_id, body, applied_by)
  VALUES (p_catalog, p_property, v_tpl.id, v_tpl.area_id, v_tpl.body, p_actor)
  ON CONFLICT (catalog_id, property_id) DO UPDATE
     SET version_id = EXCLUDED.version_id, area_id = EXCLUDED.area_id, body = EXCLUDED.body,
         applied_at = now(), applied_by = p_actor;
  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- «Quitar plantilla» de este catálogo.
CREATE OR REPLACE FUNCTION catalog_area_text_remove(p_actor uuid, p_catalog uuid, p_property uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  DELETE FROM catalog_area_copies WHERE catalog_id = p_catalog AND property_id = p_property;
  IF NOT FOUND THEN RAISE EXCEPTION 'area_text_not_found'; END IF;
  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Igual que 0219 más la copia de la plantilla al reutilizar un texto aprobado.
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
  v_copy    property_copy_versions;
  v_tpl     area_text_versions;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF v_cat.mode = 'auto' THEN
    RAISE EXCEPTION 'catalog_auto';
  END IF;
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
  -- El bloqueo de catalog_require_owner serializa dos altas simultáneas.
  IF (SELECT count(*) FROM catalog_items ci JOIN properties p ON p.id = ci.property_id
       WHERE ci.catalog_id = p_catalog AND p.archived_at IS NULL
         AND p.status::text IN ('available', 'reserved')) >= 24 THEN
    RAISE EXCEPTION 'catalog_full';
  END IF;
  INSERT INTO catalog_items (catalog_id, property_id, position)
  SELECT p_catalog, p_property, coalesce(max(position), 0) + 100
    FROM catalog_items WHERE catalog_id = p_catalog;

  -- 0219 · Reutilización: solo una entrada SIN ningún texto en este catálogo
  -- (ni borrador, ni publicado, ni en reserva) recibe la última versión
  -- aprobada del dueño, como texto publicado e independiente.
  IF NOT EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = p_catalog AND property_id = p_property) THEN
    SELECT * INTO v_copy FROM property_copy_versions
     WHERE owner_id = v_cat.owner_id AND property_id = p_property ORDER BY seq DESC LIMIT 1;
    IF FOUND AND (v_copy.title IS NOT NULL OR v_copy.body IS NOT NULL OR v_copy.lead IS NOT NULL) THEN
      INSERT INTO catalog_texts (catalog_id, property_id,
                                 draft_title, draft_body, draft_lead, draft_highlights, draft_origin, draft_rev, draft_updated_at, draft_updated_by,
                                 pub_title, pub_body, pub_lead, pub_highlights, pub_source_hash, pub_source, published_at, published_by,
                                 copy_version_id)
      VALUES (p_catalog, p_property,
              v_copy.title, v_copy.body, v_copy.lead, '{}', 'manual', 1, now(), p_actor,
              v_copy.title, v_copy.body, v_copy.lead, '{}', v_copy.body_source_hash, v_copy.body_source, now(), p_actor,
              v_copy.id);
      -- 0222 · Con el texto aprobado llega también la plantilla «Vivir en…»
      -- aprobada de su zona confirmada (copia congelada), si la hay y si este
      -- catálogo no tenía ya una copia propia (DA27, DA33).
      SELECT * INTO v_tpl FROM catalog_area_text_for(v_cat.owner_id, p_property);
      IF v_tpl.id IS NOT NULL THEN
        INSERT INTO catalog_area_copies (catalog_id, property_id, version_id, area_id, body, applied_by)
        VALUES (p_catalog, p_property, v_tpl.id, v_tpl.area_id, v_tpl.body, p_actor)
        ON CONFLICT (catalog_id, property_id) DO NOTHING;
      END IF;
    END IF;
  END IF;

  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Igual que 0220 más «at» (plantilla de este catálogo, con zona vigente).
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

REVOKE ALL ON FUNCTION catalog_area_text_lock(uuid, text)                FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_text_save_draft(uuid, text, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_text_approve(uuid, text, text)       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_text_retire(uuid, text)              FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_text_discard(uuid, text)             FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_text_seed(uuid, jsonb)               FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_text_state(uuid)                     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_text_for(uuid, uuid)                 FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_text_apply(uuid, uuid, uuid)         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_area_text_remove(uuid, uuid, uuid)        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_add_property(uuid, uuid, uuid)            FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)                   FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalog_area_text_lock(uuid, text)             TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_text_save_draft(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_text_approve(uuid, text, text)    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_text_retire(uuid, text)           TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_text_discard(uuid, text)          TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_text_seed(uuid, jsonb)            TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_text_state(uuid)                  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_text_for(uuid, uuid)              TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_text_apply(uuid, uuid, uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION catalog_area_text_remove(uuid, uuid, uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_add_property(uuid, uuid, uuid)         TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)                TO service_role;

COMMIT;
