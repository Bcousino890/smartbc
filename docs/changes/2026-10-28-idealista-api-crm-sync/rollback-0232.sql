-- ============================================================================
-- Reversión de 0232 (fichas de referencia y protecciones).
-- SE NIEGA si hay fichas de referencia, motivos de archivo nuevos, multimedia
-- gestionada o si 0233 sigue aplicada (revertir antes 0233).
-- Restaura literalmente las definiciones de 0001 (políticas), 0115 (CHECK de
-- property_media.source), 0215 (CHECK de archived_reason) y 0195
-- (catalog_candidates, copiada de ese archivo por script).
-- ============================================================================
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.idealista_crm_sync') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback_0232_refused' USING DETAIL = '0233 sigue aplicada: revierte antes rollback-0233.sql.';
  END IF;
  IF EXISTS (SELECT 1 FROM properties WHERE reference_only)
     OR EXISTS (SELECT 1 FROM properties WHERE archived_reason IN ('idealista_api_withdrawn', 'idealista_crm_containment'))
     OR EXISTS (SELECT 1 FROM property_photos WHERE sync_path IS NOT NULL)
     OR EXISTS (SELECT 1 FROM property_media WHERE sync_path IS NOT NULL OR position IS NOT NULL OR source = 'idealista_ref') THEN
    RAISE EXCEPTION 'rollback_0232_refused'
      USING DETAIL = 'Hay fichas de referencia o datos que dependen de 0232. Usa la contención; no se revierte con datos.';
  END IF;
  IF EXISTS (SELECT 1 FROM properties p JOIN agencies a ON a.id = p.agency_id WHERE a.slug = 'bc-idealista-referencias') THEN
    RAISE EXCEPTION 'rollback_0232_refused' USING DETAIL = 'La agencia técnica tiene propiedades.';
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_items', 'catalog_adjustments', 'client_property_selections', 'client_shortlist_items',
                           'client_portal_links', 'property_collab_links', 'favorites', 'idealista_listings']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_reject_reference_only ON public.%I', t);
    END IF;
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS reject_reference_only_property();
DROP TRIGGER IF EXISTS trg_properties_delete_guard ON properties;
DROP TRIGGER IF EXISTS trg_idealista_listings_delete_guard ON idealista_listings;
DROP TRIGGER IF EXISTS trg_properties_reference_only_guard ON properties;
DROP FUNCTION IF EXISTS properties_delete_guard();
DROP FUNCTION IF EXISTS idealista_listings_delete_guard();
DROP FUNCTION IF EXISTS idealista_listing_ad_live(uuid);
DROP FUNCTION IF EXISTS properties_reference_only_guard();

-- 0001_init.sql:330 y :335-337
DROP POLICY IF EXISTS "properties_auth_select" ON properties;
create policy "properties_auth_select" on properties for select to authenticated using (archived_at is null);
DROP POLICY IF EXISTS "property_photos_select" ON property_photos;
create policy "property_photos_select" on property_photos for select to authenticated using (
  exists (select 1 from properties p where p.id = property_id and (p.archived_at is null or is_staff()))
);

-- 0195_catalog_selection.sql (literal)
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

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_reference_only_distribution_chk;
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_archived_reason_chk;
ALTER TABLE properties ADD CONSTRAINT properties_archived_reason_chk
  CHECK (archived_reason IS NULL OR archived_reason IN ('portal_down'));
ALTER TABLE property_media DROP CONSTRAINT IF EXISTS property_media_source_check;
ALTER TABLE property_media ADD CONSTRAINT property_media_source_check
  CHECK (source IN ('manual', 'auto', 'imported'));
DROP INDEX IF EXISTS idx_properties_reference_only;
ALTER TABLE properties DROP COLUMN IF EXISTS reference_only;
ALTER TABLE property_photos DROP COLUMN IF EXISTS sync_path;
ALTER TABLE property_media DROP COLUMN IF EXISTS position;
ALTER TABLE property_media DROP COLUMN IF EXISTS sync_path;
DELETE FROM agencies WHERE slug = 'bc-idealista-referencias';
COMMIT;
