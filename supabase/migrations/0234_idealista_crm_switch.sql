-- ============================================================================
-- 0234 · Idealista API → CRM: interruptor en el CRM con comprobación integrada.
-- Expediente: docs/changes/2026-10-29-idealista-crm-interruptor/.
--
--   · idealista_crm_activation_report(): SOLO LECTURA. Las mismas
--     comprobaciones que scripts/sql/idealista-crm-sync-activation.sql (sin
--     «interruptor apagado» ni «aún no hay fichas»): políticas con todos sus
--     atributos, RLS, is_staff(), triggers activados, SECURITY DEFINER,
--     privilegios, CHECK, «RESERVADO» en es, agencia técnica y país de la API.
--     Lo que falta o sale NULL cuenta como fallo.
--   · idealista_crm_set_enabled(p_enabled, p_actor): encender SOLO si el informe
--     sale entero bien (la regla vive aquí, no en la pantalla); apagar siempre.
--   · idealista_crm_switch_log: quién lo cambió, cuándo y con qué informe.
--
-- Todo solo para service_role. No toca datos ni llama a nada fuera de la base.
-- Idempotente. Transacción propia. Reversión: docs/changes/…/rollback-0234.sql.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS idealista_crm_switch_log (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enabled    boolean     NOT NULL,
  actor_id   uuid        NOT NULL,
  report_ok  boolean     NOT NULL,
  failing    text[],
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE idealista_crm_switch_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON idealista_crm_switch_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON idealista_crm_switch_log TO service_role;

-- SECURITY DEFINER: tiene que poder leer schema_migrations e idealista_config
-- aunque service_role no tenga permisos directos sobre ellas. No escribe nada.
CREATE OR REPLACE FUNCTION idealista_crm_activation_report()
RETURNS TABLE (comprobacion text, esperado text, encontrado text, ok boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
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
    ('public.idealista_property_ad_live(uuid)'), ('public.idealista_crm_set_enabled(boolean, uuid)'),
    ('public.idealista_crm_activation_report()')),
  tbls(t) AS (VALUES ('idealista_api_operations'), ('idealista_api_operation_results'), ('idealista_api_operation_steps'),
                     ('idealista_crm_sync'), ('idealista_crm_media_objects'), ('idealista_crm_media_sources'), ('idealista_crm_switch_log')),
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
        ('comando', pol.cmd, pp.cmd::text), ('permisiva', pol.perm, pp.permissive), ('roles', pol.roles, pp.roles::text),
        ('USING', pol.qual, CASE WHEN pp.policyname IS NULL THEN NULL ELSE coalesce(pp.qual, '<ninguno>') END),
        ('WITH CHECK', pol.wc, CASE WHEN pp.policyname IS NULL THEN NULL ELSE coalesce(pp.with_check, '<ninguno>') END)) a(k, e, f)
    UNION ALL SELECT 'políticas en las tablas nuevas (ninguna: solo service_role)', '0',
           (SELECT count(*)::text FROM pg_policies WHERE schemaname = 'public' AND tablename IN (SELECT t FROM tbls))
    UNION ALL SELECT 'is_staff() · SECURITY DEFINER', 'true', (SELECT prosecdef::text FROM pg_proc WHERE oid = to_regprocedure('public.is_staff()'))
    UNION ALL SELECT 'is_staff() · cuerpo (0032)',
           'SELECT EXISTS ( SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''owner'', ''admin'', ''advisor'', ''agent_admin'', ''agent_senior'', ''agent_junior'') );',
           (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.is_staff()'))
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
    UNION ALL SELECT 'país de la API de Idealista', 'Spain', (SELECT api_country FROM idealista_config ORDER BY created_at LIMIT 1)
  )
  SELECT comprobacion, esperado, coalesce(encontrado, 'FALTA (NULL)'),
         coalesce(btrim(regexp_replace(esperado, '\s+', ' ', 'g')) = btrim(regexp_replace(encontrado, '\s+', ' ', 'g')), false)
    FROM chk
$$;

CREATE OR REPLACE FUNCTION idealista_crm_set_enabled(p_enabled boolean, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_failing text[];
  v_total   integer;
BEGIN
  IF p_actor IS NULL OR p_enabled IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('idealista_crm_switch', 0));

  SELECT array_agg(r.comprobacion) FILTER (WHERE NOT r.ok), count(*) INTO v_failing, v_total
    FROM idealista_crm_activation_report() r;

  IF p_enabled AND (v_total = 0 OR v_failing IS NOT NULL) THEN
    -- Nada cambia: encender exige el informe entero bien (D2).
    RETURN jsonb_build_object('ok', false, 'error', 'checks_failing', 'failing', to_jsonb(coalesce(v_failing, '{}')));
  END IF;

  UPDATE app_settings
     SET value = jsonb_build_object('enabled', p_enabled, 'changed_by', p_actor, 'changed_at', now())
   WHERE key = 'idealista_crm_sync';
  IF NOT FOUND THEN
    INSERT INTO app_settings (key, value)
    VALUES ('idealista_crm_sync', jsonb_build_object('enabled', p_enabled, 'changed_by', p_actor, 'changed_at', now()));
  END IF;
  INSERT INTO idealista_crm_switch_log (enabled, actor_id, report_ok, failing)
  VALUES (p_enabled, p_actor, v_failing IS NULL AND v_total > 0, v_failing);

  RETURN jsonb_build_object('ok', true, 'enabled', p_enabled);
END $$;

REVOKE ALL ON FUNCTION idealista_crm_activation_report() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION idealista_crm_set_enabled(boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION idealista_crm_activation_report() TO service_role;
GRANT EXECUTE ON FUNCTION idealista_crm_set_enabled(boolean, uuid) TO service_role;

COMMIT;
