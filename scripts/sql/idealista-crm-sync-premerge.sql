-- ============================================================================
-- Comprobación previa al MERGE (Idealista API → CRM, 0232/0233). SOLO LECTURA.
-- La ejecuta el operador autorizado (Fabricio) en producción, ANTES de fusionar:
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < scripts/sql/idealista-crm-sync-premerge.sql
-- No escribe nada (todo dentro de una transacción READ ONLY que se deshace) y
-- no imprime ningún valor sensible: solo nombres, definiciones y recuentos.
-- Cada fila: comprobación · esperado · encontrado · ok. Si alguna sale «false»,
-- NO se fusiona y se ajusta el expediente.
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN TRANSACTION READ ONLY;

WITH cols(t, c) AS (VALUES
  ('properties','id'),('properties','slug'),('properties','title'),('properties','description'),('properties','status'),
  ('properties','country'),('properties','archived_at'),('properties','archived_reason'),('properties','archived_auto_at'),
  ('properties','published_web'),('properties','new_listing_alerts_suppressed'),('properties','source'),
  ('properties','agency_id'),('properties','external_id'),('properties','bc_reference'),('properties','source_url'),
  ('properties','internal_notes'),('properties','cover_photo_url'),('properties','operation'),('properties','price'),
  ('properties','bedrooms'),('properties','bathrooms'),('properties','square_meters'),('properties','features'),
  ('properties','zone'),('properties','address'),('properties','latitude'),('properties','longitude'),('properties','updated_at'),
  ('property_photos','property_id'),('property_photos','url'),('property_photos','position'),('property_photos','is_cover'),
  ('property_media','property_id'),('property_media','type'),('property_media','file_name'),('property_media','storage_path'),
  ('property_media','url'),('property_media','source'),
  ('idealista_listings','property_id'),('idealista_listings','is_inspo'),('idealista_listings','external_link'),
  ('idealista_listings','api_property_id'),('idealista_listings','api_state'),('idealista_listings','api_last_sync_at'),
  ('idealista_listings','reference_code'),('idealista_listings','inspo_title'),
  ('agencies','slug'),('agencies','name'),('agencies','notes'),('app_settings','key'),('app_settings','value'),
  ('property_tags','country'),('property_tags','name'),('property_tag_links','property_id'),('property_tag_links','tag_id'),
  ('catalog_items','property_id'),('catalog_adjustments','property_id'),('catalog_adjustments','kind'),
  ('client_property_selections','property_id'),('client_shortlist_items','property_id'),('client_portal_links','property_id'),
  ('property_collab_links','property_id'),('favorites','property_id'),('profiles','role')),
chk AS (
SELECT 'columna ' || t || '.' || c AS comprobacion, 'existe' AS esperado,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = c)
            THEN 'existe' ELSE 'FALTA' END AS encontrado
  FROM cols
UNION ALL
SELECT 'enum property_source incluye api', 'sí',
       CASE WHEN EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid WHERE ty.typname = 'property_source' AND e.enumlabel = 'api')
            THEN 'sí' ELSE 'no' END
UNION ALL
-- Lo que 0232 sustituye: tiene que estar EXACTAMENTE como en las migraciones del repositorio.
SELECT 'catalog_candidates (cuerpo de 0195, md5 de prosrc)', '6d3a0e5952ba363f44136eca0781ff0b',
       coalesce((SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.catalog_candidates(jsonb, boolean, text)')), 'FALTA')
UNION ALL
SELECT 'política ' || x.p, x.e, coalesce((SELECT regexp_replace(qual, '\s+', ' ', 'g') FROM pg_policies
                                          WHERE schemaname = 'public' AND policyname = x.p), 'FALTA')
  FROM (VALUES
    ('properties_auth_select', '(archived_at IS NULL)'),
    ('property_photos_select', '(EXISTS ( SELECT 1 FROM properties p WHERE ((p.id = property_photos.property_id) AND ((p.archived_at IS NULL) OR is_staff()))))')
  ) x(p, e)
UNION ALL
-- Ninguna OTRA política de lectura podría abrir las fichas de referencia a un cliente.
SELECT 'políticas en properties/property_photos (lista completa)',
       'properties_auth_select,properties_staff_select,properties_staff_write,property_photos_select,property_photos_staff_write',
       (SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies
         WHERE schemaname = 'public' AND tablename IN ('properties', 'property_photos'))
UNION ALL
SELECT 'CHECK ' || x.c, x.e, coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = x.c), 'FALTA')
  FROM (VALUES
    ('properties_archived_reason_chk', 'CHECK (((archived_reason IS NULL) OR (archived_reason = ''portal_down''::text)))'),
    ('property_media_source_check', 'CHECK ((source = ANY (ARRAY[''manual''::text, ''auto''::text, ''imported''::text])))')
  ) x(c, e)
UNION ALL
-- Lo que 0232/0233 crean: no debe existir todavía.
SELECT 'no existe aún: ' || x.o, 'no existe',
       CASE WHEN x.present THEN 'YA EXISTE' ELSE 'no existe' END
  FROM (VALUES
    ('columna properties.reference_only', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'reference_only')),
    ('columna property_photos.sync_path', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'property_photos' AND column_name = 'sync_path')),
    ('columna property_media.position',   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'property_media' AND column_name = 'position')),
    ('tabla idealista_crm_sync',           to_regclass('public.idealista_crm_sync') IS NOT NULL),
    ('tabla idealista_api_operations',     to_regclass('public.idealista_api_operations') IS NOT NULL),
    ('función idealista_listing_ad_live',  to_regprocedure('public.idealista_listing_ad_live(uuid)') IS NOT NULL),
    ('app_settings idealista_crm_sync',    EXISTS (SELECT 1 FROM app_settings WHERE key = 'idealista_crm_sync')),
    ('migración 0232 registrada', EXISTS (SELECT 1 FROM schema_migrations WHERE version LIKE '0232%')),
    ('migración 0233 registrada', EXISTS (SELECT 1 FROM schema_migrations WHERE version LIKE '0233%'))
  ) x(o, present)
UNION ALL
SELECT 'última migración aplicada', '0231_property_collab_links.sql (o anterior a 0232)',
       (SELECT max(version) FROM schema_migrations)
),
res AS (
SELECT comprobacion, esperado, encontrado,
       CASE WHEN comprobacion = 'última migración aplicada' THEN encontrado < '0232'
            ELSE regexp_replace(esperado, '\s+', ' ', 'g') = regexp_replace(encontrado, '\s+', ' ', 'g') END AS ok
  FROM chk
)
SELECT * FROM res
UNION ALL
SELECT 'RESULTADO', 'todo coincide',
       CASE WHEN bool_and(ok) THEN 'todo coincide; se puede fusionar' ELSE 'algo NO coincide; NO fusionar' END, bool_and(ok)
  FROM res;

-- Para leer a ojo: triggers que ya existen en las tablas que 0232/0233 tocan.
SELECT 'trigger existente' AS info, event_object_table AS tabla, trigger_name, action_timing, event_manipulation
  FROM information_schema.triggers
 WHERE event_object_schema = 'public'
   AND event_object_table IN ('properties', 'property_photos', 'property_media', 'idealista_listings', 'catalog_items',
                              'catalog_adjustments', 'client_property_selections', 'client_shortlist_items',
                              'client_portal_links', 'property_collab_links', 'favorites')
 ORDER BY 2, 3, 5;

ROLLBACK;
