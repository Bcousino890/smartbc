-- ============================================================================
-- 0232 · Idealista API → CRM (1/2): fichas de referencia y sus protecciones.
-- Expediente: docs/changes/2026-10-28-idealista-api-crm-sync/ (spec §6, §7, §9).
--
-- Una «ficha de referencia» es una fila de properties que refleja un anuncio
-- publicado por la API de Idealista. Se comparte por su SmartLink público y
-- NADA MÁS: no entra en la web, el portal de clientes, las sugerencias, las
-- alertas, los catálogos, las colecciones de clientes ni los favoritos. Esto
-- lo hace cumplir la base (no solo la aplicación), para que aguante una vuelta
-- atrás del código.
--
--   · properties.reference_only + CHECK (sin web, alertas suprimidas) + trigger
--     de inmutabilidad (reference_only, slug, bc_reference).
--   · Lectura de clientes (properties_auth_select, property_photos_select):
--     excluye reference_only. El personal no cambia.
--   · Triggers que impiden asociar una ficha de referencia a catálogos,
--     selecciones, listas de clientes, enlaces de portal, colaboraciones,
--     favoritos e idealista_listings.property_id.
--   · catalog_candidates (definición vigente: 0195) con un único predicado más.
--   · Borrado: ni una propiedad ni una ficha de Idealista con el anuncio vivo o
--     en estado desconocido (D11). La función de «anuncio vivo» mira también el
--     registro de operaciones de 0233 si existe.
--   · archived_reason admite 'idealista_api_withdrawn' e 'idealista_crm_containment'.
--   · property_photos.sync_path, property_media.position/sync_path, source
--     'idealista_ref' (multimedia que gestiona la sincronización).
--   · Agencia técnica 'bc-idealista-referencias' (D21).
--
-- Comportamiento que cambia NADA MÁS APLICARSE (aunque la sincronización esté
-- apagada): las protecciones de borrado ya rechazan borrar propiedades o
-- fichas con anuncio vivo; las políticas y catalog_candidates ya llevan el
-- predicado (sin efecto mientras no haya fichas de referencia).
--
-- Idempotente. Transacción propia. Reversión: docs/changes/…/rollback-0232.sql
-- (se niega si hay fichas de referencia).
-- ============================================================================
BEGIN;

-- ── Columnas ────────────────────────────────────────────────────────────────
ALTER TABLE properties ADD COLUMN IF NOT EXISTS reference_only boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN properties.reference_only IS
  'Ficha de referencia de un anuncio publicado por la API de Idealista: solo se comparte por SmartLink; fuera de web, portal, sugerencias, alertas, catálogos y colecciones (0232).';

ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS sync_path text;
COMMENT ON COLUMN property_photos.sync_path IS
  'Ruta del objeto que gestiona la sincronización Idealista → CRM. NULL = foto añadida por el personal.';
ALTER TABLE property_media ADD COLUMN IF NOT EXISTS position integer;
ALTER TABLE property_media ADD COLUMN IF NOT EXISTS sync_path text;
COMMENT ON COLUMN property_media.position IS 'Orden dentro de su tipo. NULL = sin orden (filas anteriores a 0232).';
COMMENT ON COLUMN property_media.sync_path IS
  'Objeto o marcador que gestiona la sincronización Idealista → CRM. NULL = subido por el personal.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_reference_only_distribution_chk') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_reference_only_distribution_chk
      CHECK (NOT reference_only OR (published_web = false AND new_listing_alerts_suppressed = true));
  END IF;

  ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_archived_reason_chk;
  ALTER TABLE properties ADD CONSTRAINT properties_archived_reason_chk
    CHECK (archived_reason IS NULL
           OR archived_reason IN ('portal_down', 'idealista_api_withdrawn', 'idealista_crm_containment'));

  ALTER TABLE property_media DROP CONSTRAINT IF EXISTS property_media_source_check;
  ALTER TABLE property_media ADD CONSTRAINT property_media_source_check
    CHECK (source IN ('manual', 'auto', 'imported', 'idealista_ref'));
END $$;

CREATE INDEX IF NOT EXISTS idx_properties_reference_only ON properties (id) WHERE reference_only;

-- ── Agencia técnica (D21) ───────────────────────────────────────────────────
INSERT INTO agencies (slug, name, notes)
VALUES ('bc-idealista-referencias',
        'BC · Referencias de Idealista (técnica)',
        'Agencia técnica de las fichas de referencia que crea la sincronización Idealista API → CRM (0232/0233). No es una agencia colaboradora y no se muestra en el SmartLink.')
ON CONFLICT (slug) DO NOTHING;

-- ── Inmutabilidad ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION properties_reference_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_only IS DISTINCT FROM OLD.reference_only THEN
    RAISE EXCEPTION 'reference_only_immutable' USING ERRCODE = 'P0001',
      DETAIL = 'reference_only no se puede cambiar en una propiedad existente.';
  END IF;
  IF OLD.reference_only AND (NEW.slug IS DISTINCT FROM OLD.slug OR NEW.bc_reference IS DISTINCT FROM OLD.bc_reference) THEN
    RAISE EXCEPTION 'reference_slug_immutable' USING ERRCODE = 'P0001',
      DETAIL = 'El slug y la referencia de una ficha de referencia no cambian: su SmartLink tiene que ser estable.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_properties_reference_only_guard ON properties;
CREATE TRIGGER trg_properties_reference_only_guard
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION properties_reference_only_guard();

-- ── Lectura de quien no es personal ─────────────────────────────────────────
-- Definición anterior: 0001_init.sql:330 y :335-337.
DROP POLICY IF EXISTS "properties_auth_select" ON properties;
CREATE POLICY "properties_auth_select" ON properties FOR SELECT TO authenticated
  USING (archived_at IS NULL AND NOT reference_only);

DROP POLICY IF EXISTS "property_photos_select" ON property_photos;
CREATE POLICY "property_photos_select" ON property_photos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM properties p
           WHERE p.id = property_id
             AND ((p.archived_at IS NULL AND NOT p.reference_only) OR is_staff()))
);

-- ── Asociaciones que una ficha de referencia no puede tener ─────────────────
-- SECURITY DEFINER: quien inserta puede ser un cliente con sesión (favoritos),
-- que por la política de arriba NO ve las fichas de referencia; sin esto el
-- EXISTS daría false y la protección no serviría. Igual en las de borrado:
-- un asesor no ve idealista_listings por RLS.
CREATE OR REPLACE FUNCTION reject_reference_only_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.property_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- IF anidado: PL/pgSQL no garantiza que AND corte, y las demás tablas no tienen `kind`.
  IF TG_TABLE_NAME = 'catalog_adjustments' THEN
    IF to_jsonb(NEW)->>'kind' IS DISTINCT FROM 'include' THEN
      RETURN NEW;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM properties WHERE id = NEW.property_id AND reference_only) THEN
    RAISE EXCEPTION 'reference_only_property' USING ERRCODE = 'P0001',
      DETAIL = format('Una ficha de referencia de Idealista solo se comparte por SmartLink (%s).', TG_TABLE_NAME);
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_items', 'catalog_adjustments', 'client_property_selections',
                           'client_shortlist_items', 'client_portal_links', 'property_collab_links',
                           'favorites', 'idealista_listings']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_reject_reference_only ON public.%I', t);
      IF t = 'catalog_adjustments' THEN
        EXECUTE format('CREATE TRIGGER trg_reject_reference_only BEFORE INSERT OR UPDATE OF property_id, kind ON public.%I
                          FOR EACH ROW EXECUTE FUNCTION reject_reference_only_property()', t);
      ELSE
        EXECUTE format('CREATE TRIGGER trg_reject_reference_only BEFORE INSERT OR UPDATE OF property_id ON public.%I
                          FOR EACH ROW EXECUTE FUNCTION reject_reference_only_property()', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── Catálogo automático ─────────────────────────────────────────────────────
-- Definición vigente: 0195_catalog_selection.sql. ÚNICO cambio: la línea
-- «AND NOT p.reference_only» en `base`. Los permisos de 0195 se conservan
-- (CREATE OR REPLACE no los toca).
CREATE OR REPLACE FUNCTION catalog_candidates(p_criteria jsonb, p_require_photo boolean, p_text text)
RETURNS TABLE (property_id uuid, sale_group integer, eff_price numeric, created_at timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH k AS (
    SELECT p_criteria->>'operation' AS op,
           (p_criteria->>'price_min')::numeric AS pmin,
           (p_criteria->>'price_max')::numeric AS pmax,
           coalesce((SELECT array_agg(z->>'name') FROM jsonb_array_elements(p_criteria->'zones') z WHERE z->>'kind' = 'district'), '{}') AS dists,
           coalesce((SELECT array_agg(z->>'name') FROM jsonb_array_elements(p_criteria->'zones') z WHERE z->>'kind' = 'barrio'), '{}') AS barrs,
           coalesce((SELECT array_agg(catalog_fold(z->>'name')) FROM jsonb_array_elements(p_criteria->'zones') z WHERE z->>'kind' = 'free'), '{}') AS frees,
           jsonb_array_length(coalesce(p_criteria->'zones', '[]'::jsonb)) > 0 AS has_zones,
           nullif(catalog_fold(p_text), '') AS q
  ),
  base AS (
    SELECT p.id, p.zone, p.subzone, p.created_at,
           CASE WHEN k.op = 'any' THEN CASE WHEN p.operation::text = 'sale' THEN 0 ELSE 1 END ELSE 0 END AS grp,
           nullif(greatest(coalesce(
             CASE WHEN k.op = 'rent' AND p.operation::text <> 'rent' THEN p.rent_price ELSE p.price END, 0), 0), 0) AS eff,
           p.bc_reference, p.title
      FROM properties p CROSS JOIN k
     WHERE p.country = 'es'
       AND p.archived_at IS NULL
       AND NOT p.reference_only
       AND p.status::text IN ('available', 'reserved')
       AND (k.op = 'any'
            OR (k.op = 'sale' AND p.operation::text = 'sale')
            OR (k.op = 'rent' AND (p.operation::text = 'rent' OR 'rent' = ANY (p.operations))))
  ),
  filtered AS MATERIALIZED (
    SELECT b.*
      FROM base b CROSS JOIN k
     WHERE (k.pmin IS NULL OR (b.eff IS NOT NULL AND b.eff >= k.pmin))
       AND (k.pmax IS NULL OR (b.eff IS NOT NULL AND b.eff <= k.pmax))
       AND (k.q IS NULL OR catalog_fold(coalesce(b.bc_reference, '') || ' ' || coalesce(b.title, '')) LIKE '%' || replace(replace(replace(k.q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ),
  texts AS MATERIALIZED (
    SELECT DISTINCT t
      FROM (SELECT f.zone AS t FROM filtered f UNION ALL SELECT f.subzone FROM filtered f) x
     WHERE t IS NOT NULL AND (SELECT has_zones FROM k)
  ),
  -- Textos de zona que cumplen el criterio. Toda condición de zona es «zone O
  -- subzone», así que una vivienda casa si alguno de sus dos textos está aquí.
  ok AS MATERIALIZED (
    SELECT coalesce(array_agg(z.t), '{}') AS ts
      FROM (SELECT t, catalog_zone_match(t) AS m, catalog_zone_candidates(t) AS c FROM texts) z
      CROSS JOIN k
     WHERE z.m[1] = ANY (k.dists)
        OR z.m[2] = ANY (k.barrs)
        OR (cardinality(k.frees) > 0 AND z.c && k.frees)
  )
  SELECT f.id, f.grp, f.eff, f.created_at
    FROM filtered f
    CROSS JOIN k
    CROSS JOIN ok
   WHERE (NOT k.has_zones OR f.zone = ANY (ok.ts) OR f.subzone = ANY (ok.ts))
     AND (NOT p_require_photo OR EXISTS (SELECT 1 FROM property_photos ph WHERE ph.property_id = f.id))
$$;

-- ── Anuncio vivo (D11) ──────────────────────────────────────────────────────
-- Una ficha de Idealista controla un anuncio «vivo o desconocido» si:
--   · tiene api_property_id y su estado no es una baja (inactive / deleted), o
--   · el registro de operaciones (0233) tiene un alta incierta o sin id guardado.
-- Mientras 0233 no exista, solo cuenta lo primero.
CREATE OR REPLACE FUNCTION idealista_listing_ad_live(p_listing uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l record;
BEGIN
  SELECT id, api_property_id, api_state INTO l FROM idealista_listings WHERE id = p_listing;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF l.api_property_id IS NOT NULL AND coalesce(l.api_state, 'unknown') NOT IN ('inactive', 'deleted') THEN
    RETURN true;
  END IF;
  IF to_regprocedure('public.idealista_listing_create_unresolved(uuid)') IS NOT NULL THEN
    RETURN (SELECT idealista_listing_create_unresolved(p_listing));
  END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION idealista_listings_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF idealista_listing_ad_live(OLD.id) THEN
    RAISE EXCEPTION 'idealista_ad_live' USING ERRCODE = 'P0001',
      DETAIL = 'Esta ficha controla un anuncio de Idealista activo o en estado desconocido: no se puede borrar. Dalo de baja por API o archívala.';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_idealista_listings_delete_guard ON idealista_listings;
CREATE TRIGGER trg_idealista_listings_delete_guard
  BEFORE DELETE ON idealista_listings
  FOR EACH ROW EXECUTE FUNCTION idealista_listings_delete_guard();

CREATE OR REPLACE FUNCTION properties_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_live boolean;
BEGIN
  SELECT bool_or(idealista_listing_ad_live(il.id)) INTO v_live
    FROM idealista_listings il WHERE il.property_id = OLD.id;
  IF coalesce(v_live, false) THEN
    RAISE EXCEPTION 'idealista_ad_live' USING ERRCODE = 'P0001',
      DETAIL = 'Esta propiedad tiene un anuncio de Idealista activo o en estado desconocido: no se puede borrar. Archívala.';
  END IF;
  IF to_regclass('public.idealista_crm_sync') IS NOT NULL THEN
    EXECUTE 'SELECT bool_or(idealista_listing_ad_live(s.listing_id)) FROM idealista_crm_sync s WHERE s.property_id = $1'
      INTO v_live USING OLD.id;
    IF coalesce(v_live, false) THEN
      RAISE EXCEPTION 'idealista_ad_live' USING ERRCODE = 'P0001',
        DETAIL = 'Esta propiedad está asociada a un anuncio de Idealista activo o en estado desconocido: no se puede borrar. Archívala.';
    END IF;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_properties_delete_guard ON properties;
CREATE TRIGGER trg_properties_delete_guard
  BEFORE DELETE ON properties
  FOR EACH ROW EXECUTE FUNCTION properties_delete_guard();

REVOKE ALL ON FUNCTION idealista_listing_ad_live(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION idealista_listing_ad_live(uuid) TO service_role;

COMMIT;
