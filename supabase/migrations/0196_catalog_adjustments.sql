-- ============================================================================
-- 0196 · BCP-01 ampliación C1: ajustes del automático y portada elegida.
--
-- Expediente: docs/changes/2026-10-13-bcp-01-home-catalogo/ampliacion-c-enmienda.md
--
-- Qué añade:
--   · catalog_adjustments: inclusiones y exclusiones PERSISTENTES de un
--     catálogo automático (una vivienda tiene como mucho un ajuste). Se
--     conservan en manual y al «Convertir», y vuelven a aplicarse en automático.
--   · catalog_select (misma entrada; columnas nuevas `matched` y `via`):
--       1. coincidencias (con foto) MENOS exclusiones;
--       2. MÁS inclusiones disponibles (España, sin archivar, disponible o
--          reservada; sin foto se permiten). Plaza asegurada;
--       3. el resto de plazas hasta el máximo, con las mejores coincidencias;
--       4. todo junto, en el orden de los criterios. Una inclusión de otra
--          operación va en un grupo POSTERIOR ordenado por su propio importe
--          (nunca se compara un alquiler mensual con un precio de venta).
--     Si las inclusiones disponibles superan el máximo (solo puede pasar si una
--     vendida vuelve a estar disponible), entran las primeras en el orden y la
--     gestión lo avisa.
--   · catalog_adjust / catalog_adjust_clear, y catalog_set_criteria rechaza un
--     máximo por debajo de las inclusiones disponibles.
--   · Vistas previas, conversión y búsqueda sobre la lista EFECTIVA.
--   · catalogs.cover_property_id / cover_photo_id + catalog_set_cover. La
--     instantánea lleva `cover` SOLO si hay elección (sin ella la huella no
--     cambia): la clave pública de la vivienda si está en la lista y el
--     identificador opaco de la foto (md5 de su URL, el mismo de `photos[].u`).
--   · Nada de los ajustes llega a la instantánea: solo la lista que resulta.
--
-- Permisos (E1): RLS sin políticas, REVOKE a public/anon/authenticated y
-- EXECUTE/GRANT solo a service_role. SECURITY INVOKER y search_path fijo.
-- Funciones de gestión con p_actor y comprobación de dueño. Sin índices en
-- properties. Idempotente (IF NOT EXISTS, CREATE OR REPLACE, DROP … IF EXISTS
-- solo de funciones cuyo tipo de resultado cambia).
-- Reversión: docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0196.sql
-- ============================================================================

BEGIN;

-- ── Ajustes ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog_adjustments (
  catalog_id  uuid        NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  property_id uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind        text        NOT NULL,
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_id, property_id),
  CONSTRAINT catalog_adjustments_kind_ok CHECK (kind IN ('include', 'exclude'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_adjustments_property ON catalog_adjustments (property_id);
ALTER TABLE catalog_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE catalog_adjustments FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE catalog_adjustments TO service_role;

-- Portada elegida. La foto se guarda por su id SIN clave foránea: si se borra,
-- la gestión puede avisar de que ya no existe (y el lector usa la de portada
-- de la vivienda).
ALTER TABLE catalogs ADD COLUMN IF NOT EXISTS cover_property_id uuid REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE catalogs ADD COLUMN IF NOT EXISTS cover_photo_id    uuid;
ALTER TABLE catalogs DROP CONSTRAINT IF EXISTS catalogs_cover_photo_needs_property;
ALTER TABLE catalogs ADD CONSTRAINT catalogs_cover_photo_needs_property
  CHECK (cover_photo_id IS NULL OR cover_property_id IS NOT NULL);

-- Inclusiones que hoy pueden aparecer (España, sin archivar, disponible o reservada).
CREATE OR REPLACE FUNCTION catalog_available_inclusions(p_catalog uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)::integer
    FROM catalog_adjustments a
    JOIN properties p ON p.id = a.property_id
   WHERE a.catalog_id = p_catalog
     AND a.kind = 'include'
     AND p.country = 'es'
     AND p.archived_at IS NULL
     AND p.status::text IN ('available', 'reserved')
$$;

-- ── Selección efectiva ──────────────────────────────────────────────────────

-- Cambia el tipo de resultado (columnas nuevas): hay que borrarla antes.
DROP FUNCTION IF EXISTS catalog_select(uuid, jsonb);
CREATE FUNCTION catalog_select(p_catalog uuid, p_criteria jsonb)
RETURNS TABLE (property_id uuid, public_key text, ord bigint, total bigint, matched bigint, via text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH c AS (SELECT id, key_salt FROM catalogs WHERE id = p_catalog),
  k AS (SELECT p_criteria->>'operation' AS op,
               coalesce((p_criteria->>'max')::integer, 12) AS mx),
  adj AS (SELECT a.property_id, a.kind FROM catalog_adjustments a WHERE a.catalog_id = p_catalog),
  -- 1. Coincidencias (con foto), sin las exclusiones.
  m AS (
    SELECT x.property_id, x.sale_group AS grp, x.eff_price AS eff, x.created_at
      FROM catalog_candidates(p_criteria, true, NULL) x
     WHERE NOT EXISTS (SELECT 1 FROM adj WHERE adj.property_id = x.property_id AND adj.kind = 'exclude')
  ),
  -- 2. Inclusiones disponibles, con el grupo y el importe que les tocan.
  i AS (
    SELECT p.id AS property_id,
           CASE WHEN NOT f.fits THEN 2
                WHEN k.op = 'any' THEN CASE WHEN p.operation::text = 'sale' THEN 0 ELSE 1 END
                ELSE 0 END AS grp,
           nullif(greatest(coalesce(
             CASE WHEN f.fits AND k.op = 'rent' AND p.operation::text <> 'rent' THEN p.rent_price ELSE p.price END, 0), 0), 0) AS eff,
           p.created_at
      FROM adj
      JOIN properties p ON p.id = adj.property_id
      CROSS JOIN k
      CROSS JOIN LATERAL (SELECT (k.op = 'any'
                                  OR (k.op = 'sale' AND p.operation::text = 'sale')
                                  OR (k.op = 'rent' AND (p.operation::text = 'rent' OR 'rent' = ANY (p.operations)))) AS fits) f
     WHERE adj.kind = 'include'
       AND p.country = 'es'
       AND p.archived_at IS NULL
       AND p.status::text IN ('available', 'reserved')
  ),
  u AS (
    SELECT coalesce(m.property_id, i.property_id) AS id,
           coalesce(m.grp, i.grp) AS grp,
           coalesce(m.eff, i.eff) AS eff,
           coalesce(m.created_at, i.created_at) AS created_at,
           m.property_id IS NOT NULL AS is_m,
           i.property_id IS NOT NULL AS is_i
      FROM m FULL JOIN i ON i.property_id = m.property_id
  ),
  -- Orden COMPLETO y estable de todas (grupo, importe, más reciente, id).
  o AS (
    SELECT u.*,
           row_number() OVER (ORDER BY u.grp,
             CASE WHEN p_criteria->>'sort' = 'price_asc'  THEN u.eff END ASC NULLS LAST,
             CASE WHEN p_criteria->>'sort' = 'price_desc' THEN u.eff END DESC NULLS LAST,
             u.created_at DESC, u.id) AS k_all,
           count(*) OVER () AS total,
           count(*) FILTER (WHERE u.is_m) OVER () AS matched,
           count(*) FILTER (WHERE u.is_i) OVER () AS n_incl
      FROM u
  ),
  -- 3. Plazas: las inclusiones primero (hasta el máximo) y el resto para las
  --    mejores coincidencias que no están incluidas.
  r AS (
    SELECT o.*, row_number() OVER (PARTITION BY o.is_i ORDER BY o.k_all) AS r_cls
      FROM o
  ),
  sel AS (
    SELECT r.*
      FROM r CROSS JOIN k
     WHERE (r.is_i AND r.r_cls <= k.mx)
        OR (NOT r.is_i AND r.r_cls <= k.mx - least(r.n_incl, k.mx))
  )
  SELECT s.id,
         coalesce(ci.public_key, left(md5(c.key_salt || s.id::text), 16)),
         row_number() OVER (ORDER BY s.k_all) AS ord,
         s.total, s.matched,
         CASE WHEN s.is_m AND s.is_i THEN 'both' WHEN s.is_i THEN 'include' ELSE 'match' END
    FROM sel s
    CROSS JOIN c
    LEFT JOIN catalog_items ci ON ci.catalog_id = c.id AND ci.property_id = s.id
   ORDER BY s.k_all
$$;

-- ── Instantánea: 0195 + portada elegida (una sola sentencia) ────────────────
-- La lista se calcula UNA vez; la portada se resuelve contra esa misma lista.
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
  ) it
  WHERE c.id = p_catalog
$$;

-- ── Gestión ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION catalog_set_criteria(p_actor uuid, p_catalog uuid, p_criteria jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_crit    jsonb;
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  v_crit := catalog_criteria_normalize(p_criteria);
  IF catalog_available_inclusions(p_catalog) > (v_crit->>'max')::integer THEN
    RAISE EXCEPTION 'max_below_inclusions';
  END IF;
  UPDATE catalogs SET criteria = v_crit, version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Incluir o excluir una vivienda (sustituye el ajuste contrario).
CREATE OR REPLACE FUNCTION catalog_adjust(p_actor uuid, p_catalog uuid, p_property uuid, p_kind text)
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
  v_prev    text;
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF p_kind IS NULL OR p_kind NOT IN ('include', 'exclude') THEN RAISE EXCEPTION 'invalid_adjustment'; END IF;
  IF v_cat.mode <> 'auto' THEN RAISE EXCEPTION 'catalog_manual'; END IF;
  IF v_cat.status <> 'active' THEN RAISE EXCEPTION 'catalog_archived'; END IF;
  SELECT status::text, country, archived_at INTO v_status, v_country, v_arch
    FROM properties WHERE id = p_property;
  IF NOT FOUND THEN RAISE EXCEPTION 'property_not_found'; END IF;
  SELECT kind INTO v_prev FROM catalog_adjustments WHERE catalog_id = p_catalog AND property_id = p_property;
  IF v_prev = p_kind THEN
    -- Ya estaba así: nada cambia (ni la versión).
    RETURN v_cat.version;
  END IF;
  IF p_kind = 'include' THEN
    IF v_arch IS NOT NULL OR v_status IN ('sold', 'archived') THEN RAISE EXCEPTION 'property_not_available'; END IF;
    IF v_country IS DISTINCT FROM 'es' THEN RAISE EXCEPTION 'property_not_es'; END IF;
    IF catalog_available_inclusions(p_catalog) + 1 > coalesce((v_cat.criteria->>'max')::integer, 12) THEN
      RAISE EXCEPTION 'too_many_inclusions';
    END IF;
  END IF;
  INSERT INTO catalog_adjustments (catalog_id, property_id, kind, created_by)
  VALUES (p_catalog, p_property, p_kind, p_actor)
  ON CONFLICT (catalog_id, property_id)
  DO UPDATE SET kind = EXCLUDED.kind, created_by = EXCLUDED.created_by, created_at = now();
  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Quitar el ajuste: la vivienda vuelve a seguir los criterios.
CREATE OR REPLACE FUNCTION catalog_adjust_clear(p_actor uuid, p_catalog uuid, p_property uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  DELETE FROM catalog_adjustments WHERE catalog_id = p_catalog AND property_id = p_property;
  IF NOT FOUND THEN RAISE EXCEPTION 'adjustment_not_found'; END IF;
  UPDATE catalogs SET version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Lista efectiva de un catálogo (la misma que ve el lector), para validar la
-- portada. Interna.
CREATE OR REPLACE FUNCTION catalog_effective_ids(p_catalog uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN c.mode = 'auto' THEN
    (SELECT coalesce(array_agg(s.property_id ORDER BY s.ord), '{}') FROM catalog_select(c.id, c.criteria) s)
  ELSE
    (SELECT coalesce(array_agg(ci.property_id ORDER BY ci.position, ci.id), '{}')
       FROM catalog_items ci JOIN properties p ON p.id = ci.property_id
      WHERE ci.catalog_id = c.id AND p.archived_at IS NULL AND p.status::text NOT IN ('sold', 'archived'))
  END
  FROM catalogs c WHERE c.id = p_catalog
$$;

-- Portada elegida: una vivienda de la lista efectiva y, si se quiere, una de
-- sus fotos (sin foto: la de portada de la vivienda). NULL quita la elección.
CREATE OR REPLACE FUNCTION catalog_set_cover(p_actor uuid, p_catalog uuid, p_property uuid, p_photo uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_version bigint;
BEGIN
  PERFORM catalog_require_owner(p_actor, p_catalog);
  IF p_property IS NULL THEN
    IF p_photo IS NOT NULL THEN RAISE EXCEPTION 'invalid_cover_photo'; END IF;
  ELSE
    IF NOT p_property = ANY (catalog_effective_ids(p_catalog)) THEN RAISE EXCEPTION 'cover_not_in_catalog'; END IF;
    IF p_photo IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM property_photos WHERE id = p_photo AND property_id = p_property) THEN
      RAISE EXCEPTION 'invalid_cover_photo';
    END IF;
  END IF;
  UPDATE catalogs SET cover_property_id = p_property, cover_photo_id = p_photo,
                      version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Resultado automático con unos criterios (guardados o no), sin escribir.
DROP FUNCTION IF EXISTS catalog_auto_preview(uuid, uuid, jsonb);
CREATE FUNCTION catalog_auto_preview(p_actor uuid, p_catalog uuid, p_criteria jsonb)
RETURNS TABLE (property_id uuid, ord bigint, total bigint, matched bigint, via text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_crit jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor)
     OR NOT EXISTS (SELECT 1 FROM catalogs WHERE id = p_catalog AND owner_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_crit := catalog_criteria_normalize(coalesce(p_criteria, (SELECT criteria FROM catalogs WHERE id = p_catalog)));
  RETURN QUERY SELECT s.property_id, s.ord, s.total, s.matched, s.via FROM catalog_select(p_catalog, v_crit) s;
END
$$;

-- Qué entra y qué sale si se cambia de modo (lista efectiva, sin escribir).
CREATE OR REPLACE FUNCTION catalog_mode_preview(p_actor uuid, p_catalog uuid, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_manual  uuid[];
  v_auto    uuid[];
  v_total   bigint;
  v_matched bigint;
  v_now     uuid[];
  v_next    uuid[];
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_cat FROM catalogs WHERE id = p_catalog;
  IF NOT FOUND OR v_cat.owner_id <> p_actor THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('manual', 'auto') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  SELECT coalesce(array_agg(ci.property_id ORDER BY ci.position, ci.id), '{}') INTO v_manual
    FROM catalog_items ci JOIN properties p ON p.id = ci.property_id
   WHERE ci.catalog_id = p_catalog AND p.archived_at IS NULL AND p.status::text NOT IN ('sold', 'archived');
  SELECT coalesce(array_agg(s.property_id ORDER BY s.ord), '{}'), coalesce(max(s.total), 0), coalesce(max(s.matched), 0)
    INTO v_auto, v_total, v_matched
    FROM catalog_select(p_catalog, v_cat.criteria) s;
  v_now  := CASE WHEN v_cat.mode = 'auto' THEN v_auto ELSE v_manual END;
  v_next := CASE WHEN p_mode = 'auto' THEN v_auto ELSE v_manual END;
  RETURN jsonb_build_object(
    'from', v_cat.mode,
    'to', p_mode,
    'entering', to_jsonb(ARRAY(SELECT x FROM unnest(v_next) x WHERE NOT x = ANY (v_now))),
    'leaving',  to_jsonb(ARRAY(SELECT x FROM unnest(v_now) x WHERE NOT x = ANY (v_next))),
    'auto_total', v_total,
    'auto_matched', v_matched,
    'auto_count', cardinality(v_auto),
    'manual_count', cardinality(v_manual)
  );
END
$$;

-- «Convertir» copia la lista EFECTIVA (con ajustes); los ajustes se conservan.
CREATE OR REPLACE FUNCTION catalog_set_mode(p_actor uuid, p_catalog uuid, p_mode text, p_strategy text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cat     catalogs;
  v_ids     uuid[];
  v_keys    text[];
  v_version bigint;
BEGIN
  v_cat := catalog_require_owner(p_actor, p_catalog);
  IF p_mode IS NULL OR p_mode NOT IN ('manual', 'auto') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  IF v_cat.mode = p_mode THEN RAISE EXCEPTION 'mode_unchanged'; END IF;
  IF p_mode = 'manual' THEN
    IF p_strategy IS NULL OR p_strategy NOT IN ('restore', 'convert') THEN RAISE EXCEPTION 'invalid_strategy'; END IF;
    IF p_strategy = 'convert' THEN
      SELECT coalesce(array_agg(s.property_id ORDER BY s.ord), '{}'), coalesce(array_agg(s.public_key ORDER BY s.ord), '{}')
        INTO v_ids, v_keys
        FROM catalog_select(p_catalog, v_cat.criteria) s;
      DELETE FROM catalog_items WHERE catalog_id = p_catalog;
      INSERT INTO catalog_items (catalog_id, property_id, public_key, position)
      SELECT p_catalog, u.pid, u.pkey, (u.ord * 100)::integer
        FROM unnest(v_ids, v_keys) WITH ORDINALITY AS u(pid, pkey, ord);
    END IF;
  ELSIF p_strategy IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_strategy';
  END IF;
  UPDATE catalogs SET mode = p_mode, version = version + 1, updated_at = now()
   WHERE id = p_catalog RETURNING version INTO v_version;
  RETURN v_version;
END
$$;

-- Búsqueda de la gestión: mismos filtros, sin foto obligatoria ni máximo.
-- `in_catalog` mira la lista EFECTIVA (en automático, la que ve el lector) y
-- `adjustment` dice si la vivienda está incluida o excluida a mano.
DROP FUNCTION IF EXISTS catalog_property_search(uuid, uuid, jsonb, text, integer, integer);
CREATE FUNCTION catalog_property_search(
  p_actor uuid, p_catalog uuid, p_criteria jsonb, p_text text, p_limit integer, p_offset integer)
RETURNS TABLE (property_id uuid, total bigint, in_catalog boolean, adjustment text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_crit jsonb;
  v_ids  uuid[];
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM home_owners WHERE profile_id = p_actor)
     OR NOT EXISTS (SELECT 1 FROM catalogs WHERE id = p_catalog AND owner_id = p_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_crit := catalog_criteria_normalize(p_criteria);
  v_ids := catalog_effective_ids(p_catalog);
  RETURN QUERY
    SELECT r.property_id, r.total,
           (CASE WHEN (SELECT mode FROM catalogs WHERE id = p_catalog) = 'auto'
                 THEN r.property_id = ANY (v_ids)
                 ELSE EXISTS (SELECT 1 FROM catalog_items ci WHERE ci.catalog_id = p_catalog AND ci.property_id = r.property_id) END),
           (SELECT a.kind FROM catalog_adjustments a WHERE a.catalog_id = p_catalog AND a.property_id = r.property_id)
      FROM (
        SELECT x.property_id,
               row_number() OVER (ORDER BY x.sale_group,
                 CASE WHEN v_crit->>'sort' = 'price_asc'  THEN x.eff_price END ASC NULLS LAST,
                 CASE WHEN v_crit->>'sort' = 'price_desc' THEN x.eff_price END DESC NULLS LAST,
                 x.created_at DESC, x.property_id) AS ord,
               count(*) OVER () AS total
          FROM catalog_candidates(v_crit, false, p_text) x
      ) r
     WHERE r.ord > greatest(coalesce(p_offset, 0), 0)
       AND r.ord <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 20), 1), 50)
     ORDER BY r.ord;
END
$$;

-- ── Permisos (E1) ───────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION catalog_available_inclusions(uuid)                              FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_select(uuid, jsonb)                                     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_internal_snapshot(uuid)                                 FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_criteria(uuid, uuid, jsonb)                         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_adjust(uuid, uuid, uuid, text)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_adjust_clear(uuid, uuid, uuid)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_effective_ids(uuid)                                     FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_cover(uuid, uuid, uuid, uuid)                       FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_auto_preview(uuid, uuid, jsonb)                         FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_mode_preview(uuid, uuid, text)                          FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_set_mode(uuid, uuid, text, text)                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION catalog_property_search(uuid, uuid, jsonb, text, integer, integer) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION catalog_available_inclusions(uuid)                           TO service_role;
GRANT EXECUTE ON FUNCTION catalog_select(uuid, jsonb)                                  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_internal_snapshot(uuid)                              TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_criteria(uuid, uuid, jsonb)                      TO service_role;
GRANT EXECUTE ON FUNCTION catalog_adjust(uuid, uuid, uuid, text)                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_adjust_clear(uuid, uuid, uuid)                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_effective_ids(uuid)                                  TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_cover(uuid, uuid, uuid, uuid)                    TO service_role;
GRANT EXECUTE ON FUNCTION catalog_auto_preview(uuid, uuid, jsonb)                      TO service_role;
GRANT EXECUTE ON FUNCTION catalog_mode_preview(uuid, uuid, text)                       TO service_role;
GRANT EXECUTE ON FUNCTION catalog_set_mode(uuid, uuid, text, text)                     TO service_role;
GRANT EXECUTE ON FUNCTION catalog_property_search(uuid, uuid, jsonb, text, integer, integer) TO service_role;

COMMIT;
