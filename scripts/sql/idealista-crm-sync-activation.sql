-- ============================================================================
-- Comprobación ANTES DE ENCENDER la sincronización Idealista API → CRM.
-- SOLO LECTURA. La ejecuta el operador autorizado (Fabricio) en producción,
-- DESPUÉS del merge, de comprobar que el build en marcha es el del merge (ver
-- result.md: no basta con origin/main) y ANTES de poner
-- app_settings.idealista_crm_sync = {"enabled": true}:
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < idealista-crm-sync-activation.sql
--
-- Transacción READ ONLY que se deshace. No imprime valores sensibles (de
-- idealista_config solo el modo y el país). Lo que falte o salga NULL falla.
--   · todo bien  → «RESULTADO: APTO PARA ENCENDER (n/n)» y psql sale con 0;
--   · algo falla → ERROR «RESULTADO: NO ENCENDER …» y psql sale con código ≠ 0.
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN TRANSACTION READ ONLY;

-- Informativo (no decide).
SELECT 'entorno de la API' AS info,
       CASE WHEN (SELECT sandbox_mode FROM idealista_config ORDER BY created_at LIMIT 1) THEN 'sandbox (no tocará el CRM, D19)' ELSE 'producción' END AS valor
UNION ALL
SELECT 'anuncios ya publicados por API antes de encender (no se rellenan, D10)',
       (SELECT count(*)::text FROM idealista_listings WHERE api_property_id IS NOT NULL);

DO $chk$
DECLARE
  r   record;
  n   integer := 0;
  bad integer := 0;
BEGIN
  FOR r IN
    WITH
    pol(p, cmd, perm, roles, qual, wc) AS (VALUES
      ('properties_auth_select', 'SELECT', 'PERMISSIVE', '{authenticated}', '((archived_at IS NULL) AND (NOT reference_only))', '<ninguno>'),
      ('properties_staff_select', 'SELECT', 'PERMISSIVE', '{public}', 'is_staff()', '<ninguno>'),
      ('properties_staff_write', 'ALL', 'PERMISSIVE', '{public}', 'is_staff()', 'is_staff()'),
      ('property_photos_select', 'SELECT', 'PERMISSIVE', '{authenticated}',
       '(EXISTS ( SELECT 1 FROM properties p WHERE ((p.id = property_photos.property_id) AND (((p.archived_at IS NULL) AND (NOT p.reference_only)) OR is_staff()))))', '<ninguno>'),
      ('property_photos_staff_write', 'ALL', 'PERMISSIVE', '{public}', 'is_staff()', 'is_staff()')),
    trg(t, g) AS (VALUES
      ('catalog_items', 'trg_reject_reference_only'), ('catalog_adjustments', 'trg_reject_reference_only'),
      ('client_property_selections', 'trg_reject_reference_only'), ('client_shortlist_items', 'trg_reject_reference_only'),
      ('client_portal_links', 'trg_reject_reference_only'), ('property_collab_links', 'trg_reject_reference_only'),
      ('favorites', 'trg_reject_reference_only'), ('idealista_listings', 'trg_reject_reference_only'),
      ('properties', 'trg_properties_reference_only_guard'), ('properties', 'trg_properties_delete_guard'),
      ('idealista_listings', 'trg_idealista_listings_delete_guard'),
      ('idealista_api_operations', 'trg_append_only'), ('idealista_api_operations', 'trg_append_only_truncate'),
      ('idealista_api_operation_results', 'trg_append_only'), ('idealista_api_operation_results', 'trg_append_only_truncate'),
      ('idealista_api_operation_steps', 'trg_append_only'), ('idealista_api_operation_steps', 'trg_append_only_truncate'),
      ('idealista_crm_sync', 'trg_idealista_crm_sync_guard')),
    secdef(f) AS (VALUES
      ('public.reject_reference_only_property()'), ('public.idealista_listing_ad_live(uuid)'), ('public.idealista_property_ad_live(uuid)'),
      ('public.properties_delete_guard()'), ('public.idealista_listings_delete_guard()'), ('public.idealista_listing_create_unresolved(uuid)')),
    fns(f) AS (VALUES
      ('public.apply_idealista_crm_sync(uuid, text, bigint, jsonb, jsonb, uuid)'), ('public.idealista_crm_plan(uuid, text)'),
      ('public.idealista_op_begin(uuid, uuid, text, text, bigint, text, jsonb, jsonb, uuid)'), ('public.idealista_crm_target(uuid, text)'),
      ('public.idealista_crm_release_containment(uuid, text, uuid)'), ('public.idealista_crm_resolve_review(uuid, text, text, uuid, uuid)'),
      ('public.idealista_property_ad_live(uuid)')),
    tbls(t) AS (VALUES ('idealista_api_operations'), ('idealista_api_operation_results'), ('idealista_api_operation_steps'),
                       ('idealista_crm_sync'), ('idealista_crm_media_objects'), ('idealista_crm_media_sources')),
    chk(comprobacion, esperado, encontrado) AS (
      SELECT 'migraciones 0232 y 0233 registradas', '2',
             (SELECT count(*)::text FROM schema_migrations WHERE version IN ('0232_idealista_reference_boundary.sql', '0233_idealista_crm_sync.sql'))
      UNION ALL SELECT 'RLS activada en ' || x.t, 'true', (SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.' || x.t))
        FROM (SELECT 'properties' UNION ALL SELECT 'property_photos' UNION ALL SELECT t FROM tbls) x(t)
      UNION ALL SELECT 'políticas en properties/property_photos (lista completa)',
             'properties_auth_select,properties_staff_select,properties_staff_write,property_photos_select,property_photos_staff_write',
             (SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('properties', 'property_photos'))
      UNION ALL SELECT format('política %s · %s', pol.p, a.k), a.e, a.f
        FROM pol
        LEFT JOIN pg_policies pp ON pp.schemaname = 'public' AND pp.policyname = pol.p
        CROSS JOIN LATERAL (VALUES
          ('comando', pol.cmd, pp.cmd), ('permisiva', pol.perm, pp.permissive), ('roles', pol.roles, pp.roles::text),
          ('USING', pol.qual, CASE WHEN pp.policyname IS NULL THEN NULL ELSE coalesce(pp.qual, '<ninguno>') END),
          ('WITH CHECK', pol.wc, CASE WHEN pp.policyname IS NULL THEN NULL ELSE coalesce(pp.with_check, '<ninguno>') END)) a(k, e, f)
      UNION ALL SELECT 'políticas en las tablas nuevas (ninguna: solo service_role)', '0',
             (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename IN (SELECT t FROM tbls))
      UNION ALL SELECT 'is_staff() · SECURITY DEFINER', 'true', (SELECT prosecdef::text FROM pg_proc WHERE oid = to_regprocedure('public.is_staff()'))
      UNION ALL SELECT 'is_staff() · cuerpo (0032)',
             'SELECT EXISTS ( SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''admin'', ''advisor'', ''agent_admin'', ''agent_senior'', ''agent_junior'') );',
             (SELECT btrim(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.is_staff()'))
      UNION ALL SELECT format('trigger %s en %s · activado', trg.g, trg.t), 'O',
             (SELECT tg.tgenabled::text FROM pg_trigger tg WHERE tg.tgrelid = to_regclass('public.' || trg.t) AND tg.tgname = trg.g AND NOT tg.tgisinternal)
        FROM trg
      UNION ALL SELECT 'SECURITY DEFINER · ' || secdef.f, 'true', (SELECT prosecdef::text FROM pg_proc WHERE oid = to_regprocedure(secdef.f))
        FROM secdef
      UNION ALL SELECT format('EXECUTE de %s · %s', a.ro, fns.f), a.e,
             CASE WHEN to_regprocedure(fns.f) IS NULL THEN NULL ELSE has_function_privilege(a.ro, to_regprocedure(fns.f), 'EXECUTE')::text END
        FROM fns CROSS JOIN (VALUES ('anon', 'false'), ('authenticated', 'false'), ('service_role', 'true')) a(ro, e)
      UNION ALL SELECT format('SELECT de %s · %s', a.ro, tbls.t), a.e,
             CASE WHEN to_regclass('public.' || tbls.t) IS NULL THEN NULL ELSE has_table_privilege(a.ro, to_regclass('public.' || tbls.t), 'SELECT')::text END
        FROM tbls CROSS JOIN (VALUES ('anon', 'false'), ('authenticated', 'false'), ('service_role', 'true')) a(ro, e)
      UNION ALL SELECT 'catalog_candidates · con el predicado de 0232 (md5 de prosrc)', '01e71e7d6e251918be0d6a759b82ad98',
             (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.catalog_candidates(jsonb, boolean, text)'))
      UNION ALL SELECT format('CHECK %s · %s', x.c, a.k), a.e, a.f
        FROM (VALUES
          ('properties_reference_only_distribution_chk', 'CHECK (((NOT reference_only) OR ((published_web = false) AND (new_listing_alerts_suppressed = true))))'),
          ('properties_archived_reason_chk', 'CHECK (((archived_reason IS NULL) OR (archived_reason = ANY (ARRAY[''portal_down''::text, ''idealista_api_withdrawn''::text, ''idealista_crm_containment''::text]))))'),
          ('property_media_source_check', 'CHECK ((source = ANY (ARRAY[''manual''::text, ''auto''::text, ''imported''::text, ''idealista_ref''::text])))')) x(c, d)
        LEFT JOIN pg_constraint pc ON pc.conname = x.c
        CROSS JOIN LATERAL (VALUES ('definición', x.d, pg_get_constraintdef(pc.oid)), ('validada', 'true', pc.convalidated::text)) a(k, e, f)
      UNION ALL SELECT 'rol service_role · salta RLS', 'true', (SELECT rolbypassrls::text FROM pg_roles WHERE rolname = 'service_role')
      UNION ALL SELECT 'una sola «RESERVADO» en es', '1',
             (SELECT count(*)::text FROM property_tags WHERE country = 'es' AND lower(btrim(name)) = 'reservado')
      UNION ALL SELECT 'agencia técnica bc-idealista-referencias', '1', (SELECT count(*)::text FROM agencies WHERE slug = 'bc-idealista-referencias')
      UNION ALL SELECT 'interruptor (aún apagado)', 'false',
             (SELECT (value->>'enabled') FROM app_settings WHERE key = 'idealista_crm_sync')
      UNION ALL SELECT 'país de la API de Idealista', 'Spain', (SELECT api_country FROM idealista_config ORDER BY created_at LIMIT 1)
      UNION ALL SELECT 'aún no hay fichas de referencia', '0', (SELECT count(*)::text FROM properties WHERE reference_only)
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
    RAISE EXCEPTION 'RESULTADO: NO ENCENDER — % de % comprobaciones fallan (ver las líneas ✗)', bad, n;
  END IF;
  RAISE NOTICE '==================== RESULTADO: APTO PARA ENCENDER (%/% comprobaciones) ====================', n, n;
END
$chk$;

ROLLBACK;
