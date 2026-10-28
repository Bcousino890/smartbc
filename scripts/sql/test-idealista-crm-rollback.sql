-- ============================================================================
-- SOLO PRUEBAS LOCALES (Idealista API → CRM, T5 · corrección 6). Recuperación
-- CON DATOS: fichas generadas y existentes, operaciones y asociaciones. Se
-- ejecutan las consultas del build ANTERIOR, transcritas de 3f8ad3b2 con su
-- archivo:línea, sin contención y con ella. Las reversiones del esquema las
-- prueba el script de shell (deben negarse aquí, con datos).
-- ============================================================================
\set ON_ERROR_STOP 1
UPDATE app_settings SET value = '{"enabled": true}' WHERE key = 'idealista_crm_sync';
INSERT INTO property_tags (country, name) VALUES ('es', 'RESERVADO');

-- Datos: una ficha generada (anuncio activo) y una existente con anuncio activo.
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
DO $$
DECLARE l uuid; l2 uuid; op uuid := gen_random_uuid(); op2 uuid := gen_random_uuid(); plan jsonb; r jsonb;
BEGIN
  INSERT INTO idealista_listings (reference_code, is_inspo, inspo_title, scheduled_publish_at)
  VALUES ('BC-R001', true, 'Generada', now() - interval '1 hour') RETURNING id INTO l;
  PERFORM idealista_op_begin(op, l, 'production', 'create', NULL, 'BC-R001', '{}', '{}', NULL);
  PERFORM idealista_op_finish(op, 'confirmed', 201, 'active', 5001, NULL);
  UPDATE idealista_listings SET api_property_id = 5001, api_state = 'active', idealista_state = 'published',
         api_last_sync_at = clock_timestamp() WHERE id = l;
  plan := idealista_crm_plan(l, 'production');
  r := apply_idealista_crm_sync(l, 'production', (plan->'target'->>'seq')::bigint,
        jsonb_build_object('slug', 'generada-r001-x8k3p2m7qa', 'title', 'Generada buscable', 'operation', 'rent', 'price', 2000,
                           'zone', 'Chamberí', 'features', '[]'::jsonb), NULL, NULL);
  INSERT INTO ids VALUES ('listing_gen', l), ('gen', (r->>'property_id')::uuid);

  INSERT INTO idealista_listings (reference_code, is_inspo, property_id) VALUES ('BC-R002', false, '10000000-0000-0000-0000-000000000002') RETURNING id INTO l2;
  PERFORM idealista_op_begin(op2, l2, 'production', 'create', NULL, 'BC-R002', '{}', '{}', NULL);
  PERFORM idealista_op_finish(op2, 'confirmed', 201, 'active', 5002, NULL);
  UPDATE idealista_listings SET api_property_id = 5002, api_state = 'active', idealista_state = 'published',
         api_last_sync_at = clock_timestamp() WHERE id = l2;
  PERFORM apply_idealista_crm_sync(l2, 'production', ((idealista_crm_plan(l2, 'production'))->'target'->>'seq')::bigint, NULL, NULL, NULL);
  INSERT INTO ids VALUES ('listing_exist', l2), ('exist', '10000000-0000-0000-0000-000000000002');
END $$;
GRANT SELECT ON ids TO authenticated, anon, service_role;

\echo '== Build anterior SIN contención'
DO $$
DECLARE g uuid := (SELECT v FROM ids WHERE k = 'gen'); e uuid := (SELECT v FROM ids WHERE k = 'exist');
        lg uuid := (SELECT v FROM ids WHERE k = 'listing_gen'); le uuid := (SELECT v FROM ids WHERE k = 'listing_exist');
BEGIN
  PERFORM test_util.ok(g IS NOT NULL AND (SELECT reference_only FROM properties WHERE id = g), 'datos: hay una ficha de referencia');
  -- app/api/admin/publicacion/save-idealista-listing/route.ts:18-28 (alta no inspo sobre la propiedad elegida)
  PERFORM test_util.expect_error(format($q$INSERT INTO idealista_listings (is_inspo, property_id, reference_code) VALUES (false, %L, 'BC-R009')$q$, g),
                                 'reference_only_property');
  -- app/api/admin/idealista/process-scheduled/route.ts:16-22
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM idealista_listings
                                    WHERE scheduled_publish_at <= now() AND NOT (idealista_state = 'published') AND property_id IS NOT NULL
                                      AND property_id = g),
                       'process-scheduled: ninguna ficha apunta a la de referencia');
  -- app/(admin)/admin/propiedades/actions.ts:416-516 (deleteProperty)
  PERFORM test_util.expect_error(format('DELETE FROM properties WHERE id = %L', g), 'idealista_ad_live');
  PERFORM test_util.expect_error(format('DELETE FROM properties WHERE id = %L', e), 'idealista_ad_live');
  -- app/api/admin/idealista/delete-listing/route.ts:51 (borrado si no está «published»)
  UPDATE idealista_listings SET idealista_state = 'unpublished' WHERE id = lg;            -- update-state/route.ts:22
  PERFORM test_util.expect_error(format('DELETE FROM idealista_listings WHERE id = %L', lg), 'idealista_ad_live');
  -- lib/web/public-contract.ts:30-32 (web pública)
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM properties WHERE id = g AND status IN ('available', 'reserved')
                                     AND archived_at IS NULL AND published_web = true), 'web pública: no sale (CHECK)');
  -- lib/db/queries/suggested-properties.ts:189-198 (alertas, forAlerts)
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM properties WHERE id = g AND status = 'available' AND archived_at IS NULL
                                     AND new_listing_alerts_suppressed = false), 'alertas: no sale (CHECK)');
  -- catálogos: funciones de la base (0232)
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_candidates('{"operation":"any"}'::jsonb, false, NULL) c WHERE c.property_id = g),
                       'catálogo automático: no sale');
  -- app/s/[token]/actions.ts:406-416 (búsqueda pública de la lista, service role): SIN contención SÍ sale.
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM properties WHERE country = 'es' AND status = 'available' AND archived_at IS NULL
                                 AND (title ILIKE '%buscable%' OR bc_reference ILIKE '%buscable%' OR zone ILIKE '%buscable%') AND id = g),
                       'búsqueda de /s sin contención: la encuentra (por eso la contención es obligatoria antes de revertir)');
  -- lib/services/idealista/partner-api/publish.ts:356-367 (publicar sin registrar operación)
  UPDATE idealista_listings SET api_state = 'active', api_last_sync_at = clock_timestamp() + interval '2 minutes', idealista_state = 'published'
   WHERE id = lg;
  PERFORM test_util.ok((idealista_crm_target(lg, 'production'))->>'reason' = 'external_change',
                       'llamada del build anterior sin registrar → el código nuevo la ve como incierta');
END $$;

\echo '== Portal de clientes (build anterior, con sesión): app/(cliente)/propiedades → lib/db/queries/properties.ts:9-42'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false);
DO $$
BEGIN
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM properties WHERE archived_at IS NULL AND status = 'available'
                                     AND id = (SELECT v FROM ids WHERE k = 'gen')), 'portal de clientes: no sale (política)');
END $$;
RESET ROLE;

\echo '== Contención (ensayo, aplicar)'
\set dry 1
\i scripts/sql/idealista-crm-sync-containment.sql
\unset dry
DO $$ BEGIN
  PERFORM test_util.ok((SELECT archived_at IS NULL FROM properties WHERE id = (SELECT v FROM ids WHERE k = 'gen')), 'ensayo: no cambia nada');
END $$;
\i scripts/sql/idealista-crm-sync-containment.sql

\echo '== Build anterior CON contención'
DO $$
DECLARE g uuid := (SELECT v FROM ids WHERE k = 'gen'); e uuid := (SELECT v FROM ids WHERE k = 'exist');
BEGIN
  PERFORM test_util.ok((SELECT archived_reason = 'idealista_crm_containment' AND status = 'available' FROM properties WHERE id = g),
                       'contención: archivada con su motivo, sin cambiar el estado');
  PERFORM test_util.ok((SELECT archived_at IS NULL FROM properties WHERE id = e), 'contención: la existente no se toca');
  -- app/s/[token]/actions.ts:406-416
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM properties WHERE country = 'es' AND status = 'available' AND archived_at IS NULL
                                     AND (title ILIKE '%buscable%') AND id = g), 'búsqueda de /s con contención: no la encuentra');
  -- lib/db/queries/properties.ts:86-122 (SmartLink: archived_at IS NULL y status <> archived)
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM properties WHERE id = g AND archived_at IS NULL AND status <> 'archived'),
                       'SmartLink en contención: no se sirve');
  -- lib/db/queries/suggested-properties.ts:189-190 (lista de sugeridas de la ficha del cliente, de donde sale el correo de oferta)
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM properties WHERE id = g AND status = 'available' AND archived_at IS NULL),
                       'sugeridas (origen del correo de oferta): no sale');
  -- Con la contención aplicada el código nuevo no la desarchiva sola.
  PERFORM idealista_op_begin('20000000-0000-0000-0000-000000000099', (SELECT v FROM ids WHERE k = 'listing_gen'), 'production', 'observe', 5001, NULL, NULL, NULL, NULL);
  PERFORM idealista_op_finish('20000000-0000-0000-0000-000000000099', 'confirmed', 200, 'active', 5001, NULL);
  UPDATE idealista_listings SET api_last_sync_at = NULL WHERE id = (SELECT v FROM ids WHERE k = 'listing_gen');
  PERFORM apply_idealista_crm_sync((SELECT v FROM ids WHERE k = 'listing_gen'), 'production',
           ((idealista_crm_plan((SELECT v FROM ids WHERE k = 'listing_gen'), 'production'))->'target'->>'seq')::bigint, NULL, NULL, NULL);
  PERFORM test_util.ok((SELECT archived_reason FROM properties WHERE id = g) = 'idealista_crm_containment',
                       'el código nuevo respeta la contención (no desarchiva)');
END $$;

\echo '== Deshacer la contención'
\set undo 1
\i scripts/sql/idealista-crm-sync-containment.sql
\unset undo
DO $$ BEGIN
  PERFORM test_util.ok((SELECT archived_at IS NULL AND archived_reason IS NULL FROM properties WHERE id = (SELECT v FROM ids WHERE k = 'gen')),
                       'deshacer: vuelve a estar visible solo por SmartLink');
END $$;
\echo 'test-idealista-crm-rollback.sql: todas las comprobaciones en verde'
