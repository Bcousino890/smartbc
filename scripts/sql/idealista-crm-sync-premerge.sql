-- ============================================================================
-- Comprobación previa al MERGE (Idealista API → CRM, 0232/0233). SOLO LECTURA.
-- La ejecuta el operador autorizado (Fabricio) en producción, ANTES de fusionar
-- (cómo obtener este archivo revisado sin tocar el checkout: result.md):
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < idealista-crm-sync-premerge.sql
--
-- Todo va en una transacción READ ONLY que se deshace: no escribe nada y no
-- imprime valores sensibles (solo nombres, definiciones y atributos).
-- Cada comprobación sale como «✓» o «✗ … esperado … encontrado …». Lo que falte
-- o salga NULL cuenta como fallo.
--
-- RESULTADO, sin ambigüedad:
--   · todo bien  → «RESULTADO: APTO PARA FUSIONAR (n/n)» y psql sale con 0;
--   · algo falla → ERROR «RESULTADO: NO FUSIONAR …» y psql sale con código ≠ 0.
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN TRANSACTION READ ONLY;

-- Informativo (no decide): triggers que ya hay en las tablas que tocan 0232/0233.
SELECT 'trigger existente' AS info, event_object_table AS tabla, trigger_name, action_timing, event_manipulation
  FROM information_schema.triggers
 WHERE event_object_schema = 'public'
   AND event_object_table IN ('properties', 'property_photos', 'property_media', 'idealista_listings', 'catalog_items',
                              'catalog_adjustments', 'client_property_selections', 'client_shortlist_items',
                              'client_portal_links', 'property_collab_links', 'favorites')
 ORDER BY 2, 3, 5;

DO $chk$
DECLARE
  r   record;
  n   integer := 0;
  bad integer := 0;
BEGIN
  FOR r IN
    WITH
    cols(t, c, ty) AS (VALUES
      ('properties','id','uuid'),('properties','slug','text'),('properties','title','text'),('properties','description','text'),
      ('properties','status','property_status'),('properties','country','text'),('properties','archived_at','timestamp with time zone'),
      ('properties','archived_reason','text'),('properties','archived_auto_at','timestamp with time zone'),
      ('properties','published_web','boolean'),('properties','new_listing_alerts_suppressed','boolean'),
      ('properties','source','property_source'),('properties','agency_id','uuid'),('properties','external_id','text'),
      ('properties','bc_reference','text'),('properties','source_url','text'),('properties','internal_notes','text'),
      ('properties','cover_photo_url','text'),('properties','operation','property_operation'),('properties','price','numeric(12,2)'),
      ('properties','bedrooms','integer'),('properties','bathrooms','integer'),('properties','square_meters','integer'),
      ('properties','features','text[]'),('properties','zone','text'),('properties','address','text'),
      ('properties','updated_at','timestamp with time zone'),
      ('property_photos','property_id','uuid'),('property_photos','url','text'),('property_photos','position','integer'),('property_photos','is_cover','boolean'),
      ('property_media','property_id','uuid'),('property_media','type','text'),('property_media','file_name','text'),
      ('property_media','storage_path','text'),('property_media','url','text'),('property_media','source','text'),
      ('idealista_listings','property_id','uuid'),('idealista_listings','is_inspo','boolean'),('idealista_listings','external_link','text'),
      ('idealista_listings','api_property_id','bigint'),('idealista_listings','api_state','text'),
      ('idealista_listings','api_last_sync_at','timestamp with time zone'),('idealista_listings','reference_code','text'),
      ('idealista_listings','inspo_title','text'),
      ('agencies','slug','text'),('agencies','name','text'),('agencies','notes','text'),('app_settings','key','text'),('app_settings','value','jsonb'),
      ('property_tags','country','text'),('property_tags','name','text'),('property_tag_links','property_id','uuid'),('property_tag_links','tag_id','uuid'),
      ('catalog_items','property_id','uuid'),('catalog_adjustments','property_id','uuid'),('catalog_adjustments','kind','text'),
      ('client_property_selections','property_id','uuid'),('client_shortlist_items','property_id','uuid'),
      ('client_portal_links','property_id','uuid'),('property_collab_links','property_id','uuid'),('favorites','property_id','uuid')),
    -- Políticas de las que depende la frontera (0001:330-338): TODOS sus atributos.
    pol(p, cmd, perm, roles, qual, wc) AS (VALUES
      ('properties_auth_select', 'SELECT', 'PERMISSIVE', '{authenticated}', '(archived_at IS NULL)', '<ninguno>'),
      ('properties_staff_select', 'SELECT', 'PERMISSIVE', '{public}', 'is_staff()', '<ninguno>'),
      ('properties_staff_write', 'ALL', 'PERMISSIVE', '{public}', 'is_staff()', 'is_staff()'),
      ('property_photos_select', 'SELECT', 'PERMISSIVE', '{authenticated}',
       '(EXISTS ( SELECT 1 FROM properties p WHERE ((p.id = property_photos.property_id) AND ((p.archived_at IS NULL) OR is_staff()))))', '<ninguno>'),
      ('property_photos_staff_write', 'ALL', 'PERMISSIVE', '{public}', 'is_staff()', 'is_staff()')),
    chk(comprobacion, esperado, encontrado) AS (
      SELECT format('columna %s.%s', cols.t, cols.c), cols.ty,
             (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
               WHERE a.attrelid = to_regclass('public.' || cols.t) AND a.attname = cols.c AND NOT a.attisdropped)
        FROM cols
      UNION ALL SELECT 'enum property_source incluye api', 'sí',
             CASE WHEN EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid WHERE ty.typname = 'property_source' AND e.enumlabel = 'api') THEN 'sí' END
      UNION ALL SELECT 'enum property_status', '{available,reserved,sold,archived}',
             (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid WHERE ty.typname = 'property_status')
      UNION ALL SELECT 'RLS activada en ' || x.t, 'true', (SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.' || x.t))
        FROM (VALUES ('properties'), ('property_photos')) x(t)
      UNION ALL SELECT 'políticas en properties/property_photos (lista completa)',
             'properties_auth_select,properties_staff_select,properties_staff_write,property_photos_select,property_photos_staff_write',
             (SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('properties', 'property_photos'))
      UNION ALL SELECT format('política %s · %s', pol.p, a.k), a.e, a.f
        FROM pol
        LEFT JOIN pg_policies pp ON pp.schemaname = 'public' AND pp.policyname = pol.p
        CROSS JOIN LATERAL (VALUES
          ('comando', pol.cmd, pp.cmd),
          ('permisiva', pol.perm, pp.permissive),
          ('roles', pol.roles, pp.roles::text),
          ('USING', pol.qual, CASE WHEN pp.policyname IS NULL THEN NULL ELSE coalesce(pp.qual, '<ninguno>') END),
          ('WITH CHECK', pol.wc, CASE WHEN pp.policyname IS NULL THEN NULL ELSE coalesce(pp.with_check, '<ninguno>') END)) a(k, e, f)
      UNION ALL SELECT 'is_staff() · devuelve', 'boolean', (SELECT prorettype::regtype::text FROM pg_proc WHERE oid = to_regprocedure('public.is_staff()'))
      UNION ALL SELECT 'is_staff() · SECURITY DEFINER', 'true', (SELECT prosecdef::text FROM pg_proc WHERE oid = to_regprocedure('public.is_staff()'))
      UNION ALL SELECT 'is_staff() · volatilidad', 's', (SELECT provolatile::text FROM pg_proc WHERE oid = to_regprocedure('public.is_staff()'))
      UNION ALL SELECT 'is_staff() · search_path', '{search_path=public}', (SELECT proconfig::text FROM pg_proc WHERE oid = to_regprocedure('public.is_staff()'))
      UNION ALL SELECT 'is_staff() · cuerpo (0032)',
             'SELECT EXISTS ( SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''admin'', ''advisor'', ''agent_admin'', ''agent_senior'', ''agent_junior'') );',
             (SELECT btrim(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.is_staff()'))
      UNION ALL SELECT 'catalog_candidates · cuerpo de 0195 (md5 de prosrc)', '6d3a0e5952ba363f44136eca0781ff0b',
             (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.catalog_candidates(jsonb, boolean, text)'))
      UNION ALL SELECT 'catalog_candidates · SECURITY DEFINER', 'false',
             (SELECT prosecdef::text FROM pg_proc WHERE oid = to_regprocedure('public.catalog_candidates(jsonb, boolean, text)'))
      UNION ALL SELECT format('CHECK %s · %s', x.c, a.k), a.e, a.f
        FROM (VALUES
          ('properties_archived_reason_chk', 'CHECK (((archived_reason IS NULL) OR (archived_reason = ''portal_down''::text)))'),
          ('property_media_source_check', 'CHECK ((source = ANY (ARRAY[''manual''::text, ''auto''::text, ''imported''::text])))')) x(c, d)
        LEFT JOIN pg_constraint pc ON pc.conname = x.c
        CROSS JOIN LATERAL (VALUES ('definición', x.d, pg_get_constraintdef(pc.oid)), ('validada', 'true', pc.convalidated::text)) a(k, e, f)
      UNION ALL SELECT 'rol ' || x.r || ' · salta RLS', x.b, (SELECT rolbypassrls::text FROM pg_roles WHERE rolname = x.r)
        FROM (VALUES ('service_role', 'true'), ('authenticated', 'false'), ('anon', 'false')) x(r, b)
      UNION ALL SELECT 'no existe aún: ' || x.o, 'no existe', CASE WHEN x.present THEN 'YA EXISTE' ELSE 'no existe' END
        FROM (VALUES
          ('columna properties.reference_only', EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.properties') AND attname = 'reference_only' AND NOT attisdropped)),
          ('columna property_photos.sync_path', EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.property_photos') AND attname = 'sync_path' AND NOT attisdropped)),
          ('columna property_media.position',   EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.property_media') AND attname = 'position' AND NOT attisdropped)),
          ('tabla idealista_crm_sync',           to_regclass('public.idealista_crm_sync') IS NOT NULL),
          ('tabla idealista_api_operations',     to_regclass('public.idealista_api_operations') IS NOT NULL),
          ('función idealista_listing_ad_live',  to_regprocedure('public.idealista_listing_ad_live(uuid)') IS NOT NULL),
          ('app_settings idealista_crm_sync',    EXISTS (SELECT 1 FROM app_settings WHERE key = 'idealista_crm_sync')),
          ('agencia bc-idealista-referencias',   EXISTS (SELECT 1 FROM agencies WHERE slug = 'bc-idealista-referencias')),
          ('migración 0232 registrada',          EXISTS (SELECT 1 FROM schema_migrations WHERE version LIKE '0232%')),
          ('migración 0233 registrada',          EXISTS (SELECT 1 FROM schema_migrations WHERE version LIKE '0233%'))) x(o, present)
      UNION ALL SELECT 'última migración aplicada', 'anterior a 0232',
             (SELECT CASE WHEN max(version) < '0232' THEN 'anterior a 0232' ELSE max(version) END FROM schema_migrations)
    )
    SELECT comprobacion, esperado, coalesce(encontrado, 'FALTA (NULL)') AS encontrado,
           coalesce(btrim(regexp_replace(esperado, '\s+', ' ', 'g')) = btrim(regexp_replace(encontrado, '\s+', ' ', 'g')), false) AS ok
      FROM chk
  LOOP
    n := n + 1;
    IF r.ok THEN
      RAISE NOTICE '✓ %', r.comprobacion;
    ELSE
      bad := bad + 1;
      RAISE NOTICE '✗ %  — esperado: %  — encontrado: %', r.comprobacion, r.esperado, r.encontrado;
    END IF;
  END LOOP;
  IF n = 0 OR bad > 0 THEN
    RAISE EXCEPTION 'RESULTADO: NO FUSIONAR — % de % comprobaciones fallan (ver las líneas ✗)', bad, n;
  END IF;
  RAISE NOTICE '==================== RESULTADO: APTO PARA FUSIONAR (%/% comprobaciones) ====================', n, n;
END
$chk$;

ROLLBACK;
