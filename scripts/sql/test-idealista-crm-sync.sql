-- ============================================================================
-- SOLO PRUEBAS LOCALES (Idealista API → CRM, T4). Base TEMPORAL con datos
-- 100 % sintéticos: stub-supabase.sql + test-util.sql + 0192–0196 +
-- stub-idealista-crm.sql + 0232 + 0233. Lo lanza test-idealista-crm-sync.sh.
-- Cada comprobación imprime «ok · …»; la primera que falla para el script.
-- ============================================================================
\set ON_ERROR_STOP 1
SET client_min_messages = notice;

CREATE SCHEMA IF NOT EXISTS crm_t;

-- ── Ayudas ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_t.listing(p_ref text, p_inspo boolean, p_property uuid DEFAULT NULL, p_link text DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO idealista_listings (reference_code, is_inspo, property_id, external_link, inspo_title)
  VALUES (p_ref, p_inspo, p_property, p_link, 'Piso de prueba ' || p_ref) RETURNING id
$$;

-- Registra una operación completa (o solo su inicio si p_outcome es NULL).
CREATE OR REPLACE FUNCTION crm_t.op(p_listing uuid, p_kind text, p_outcome text, p_state text DEFAULT 'active',
                                    p_api bigint DEFAULT NULL, p_env text DEFAULT 'production', p_op uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_op uuid := coalesce(p_op, gen_random_uuid());
BEGIN
  PERFORM idealista_op_begin(v_op, p_listing, p_env, p_kind, NULL, 'REF', '{"title":"x"}'::jsonb,
                             '{"photos":[],"plans":[],"videos":[]}'::jsonb, NULL);
  IF p_outcome IS NOT NULL THEN
    PERFORM idealista_op_finish(v_op, p_outcome, CASE p_outcome WHEN 'confirmed' THEN 200 WHEN 'rejected' THEN 400 END,
                                p_state, p_api, NULL);
  END IF;
  RETURN v_op;
END $$;

CREATE OR REPLACE FUNCTION crm_t.finish(p_op uuid, p_outcome text, p_state text DEFAULT 'active', p_api bigint DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$ SELECT idealista_op_finish(p_op, p_outcome, 200, p_state, p_api, NULL)::text IS NOT NULL AND true; $$;

CREATE OR REPLACE FUNCTION crm_t.new_property(p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('slug', p_slug, 'title', 'Piso en Chamberí', 'description', 'Descripción pública',
    'operation', 'rent', 'price', 2400, 'bedrooms', 2, 'bathrooms', 1, 'square_meters', 80,
    'features', jsonb_build_array('Ascensor', 'Terraza'), 'zone', 'Madrid', 'address', 'Calle de Prueba, 1, Madrid',
    'latitude', 40.43, 'longitude', -3.70,
    'internal_notes', 'Ficha de referencia creada por la sincronización Idealista API → CRM.')
$$;

-- plan + apply como lo hace la aplicación (sin multimedia salvo que se pase).
CREATE OR REPLACE FUNCTION crm_t.sync(p_listing uuid, p_env text DEFAULT 'production', p_media jsonb DEFAULT NULL,
                                      p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_plan jsonb; v_seq bigint;
BEGIN
  v_plan := idealista_crm_plan(p_listing, p_env);
  v_seq := (v_plan->'target'->>'seq')::bigint;
  RETURN apply_idealista_crm_sync(p_listing, p_env, v_seq,
           crm_t.new_property('ref-' || left(replace(p_listing::text, '-', ''), 12)), p_media, p_actor);
END $$;

CREATE OR REPLACE FUNCTION crm_t.prop_of(p_listing uuid) RETURNS uuid LANGUAGE sql AS $$
  SELECT property_id FROM idealista_crm_sync WHERE listing_id = p_listing AND environment = 'production'
$$;

-- ── Datos de partida ────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'staff@example.test'),
  ('00000000-0000-0000-0000-00000000c001', 'cliente@example.test')
ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, role, email) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'admin', 'staff@example.test'),
  ('00000000-0000-0000-0000-00000000c001', 'client', 'cliente@example.test')
ON CONFLICT DO NOTHING;

-- Una propiedad real, previa, importada de un portal (la que nunca se archiva sola).
INSERT INTO properties (id, slug, title, status, country, source_url, owner_name, owner_phone, internal_notes, price)
VALUES ('10000000-0000-0000-0000-0000000000e1', 'piso-real-e1', 'Piso real', 'available', 'es',
        'https://www.idealista.com/inmueble/111/', 'Dueña Real', '+34600000000', 'Nota interna real', 1000)
ON CONFLICT DO NOTHING;

-- ── 1. Sin «RESERVADO» en es: nada se crea (D2) ─────────────────────────────
UPDATE app_settings SET value = '{"enabled": true}' WHERE key = 'idealista_crm_sync';
INSERT INTO property_tags (country, name) VALUES ('cl', 'RESERVADO');   -- solo Chile: no sirve para es
DO $$
DECLARE l uuid; r jsonb; n_before int;
BEGIN
  SELECT count(*) INTO n_before FROM properties;
  l := crm_t.listing('BC-9001', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9001);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'failed' AND r->>'error_code' = 'tag_missing', 'sin RESERVADO en es → failed/tag_missing');
  PERFORM test_util.ok((SELECT count(*) FROM properties) = n_before, 'sin etiqueta no se crea ninguna propiedad');
  PERFORM test_util.ok((SELECT count(*) FROM property_tags WHERE lower(name) = 'reservado') = 1, 'nunca se crea una etiqueta');
END $$;
INSERT INTO property_tags (country, name) VALUES ('es', 'RESERVADO');

-- ── 2. Interruptor apagado: se registra, no se aplica ───────────────────────
DO $$
DECLARE l uuid; r jsonb;
BEGIN
  UPDATE app_settings SET value = '{"enabled": false}' WHERE key = 'idealista_crm_sync';
  l := crm_t.listing('BC-9002', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9002);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'disabled', 'interruptor apagado → disabled');
  PERFORM test_util.ok(crm_t.prop_of(l) IS NULL, 'apagado no crea propiedad');
  PERFORM test_util.ok((SELECT count(*) FROM idealista_api_operations WHERE listing_id = l) = 1, 'apagado sí registra la operación');
  UPDATE app_settings SET value = '{"enabled": true}' WHERE key = 'idealista_crm_sync';
END $$;

-- ── 3. Alta confirmada de una inspo nueva → ficha de referencia ─────────────
DO $$
DECLARE l uuid; r jsonb; p record; n int; tag uuid;
BEGIN
  l := crm_t.listing('BC-9003', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9003);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'synced' AND r->>'origin' = 'generated', 'alta confirmada → ficha generada');
  SELECT * INTO p FROM properties WHERE id = (r->>'property_id')::uuid;
  PERFORM test_util.ok(p.reference_only AND p.source = 'api' AND p.external_id = 'idealista-api-' || l || '-production',
                       'procedencia: reference_only, source api, external_id propio');
  PERFORM test_util.ok(p.agency_id = (SELECT id FROM agencies WHERE slug = 'bc-idealista-referencias'), 'agencia técnica');
  PERFORM test_util.ok(NOT p.published_web AND p.new_listing_alerts_suppressed, 'fuera de la web y sin alertas');
  PERFORM test_util.ok(p.source_url IS NULL AND p.owner_name IS NULL AND p.owner_phone IS NULL, 'sin source_url ni datos de propietario');
  PERFORM test_util.ok(p.status = 'available' AND p.archived_at IS NULL, 'disponible (la etiqueta no reserva nada)');
  SELECT id INTO tag FROM property_tags WHERE country = 'es' AND name = 'RESERVADO';
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM property_tag_links WHERE property_id = p.id AND tag_id = tag), 'etiqueta RESERVADO de es');
  PERFORM test_util.ok((SELECT property_id FROM idealista_listings WHERE id = l) IS NULL, 'idealista_listings.property_id NO se escribe (D17)');
  PERFORM test_util.ok(r->>'smartlink_path' = '/compartir/' || lower(replace(p.bc_reference, '-', '')) || '-' || p.slug, 'ruta del SmartLink');
  -- Repetir la misma operación: no duplica.
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'reason' = 'already_applied' AND r->>'status' = 'synced', 'repetir la pasada → already_applied');
  SELECT count(*) INTO n FROM properties WHERE external_id = 'idealista-api-' || l || '-production';
  PERFORM test_util.ok(n = 1, 'una sola ficha tras repetir');
END $$;

-- ── 4. Actualizar, reaplicar etiqueta, baja, reactivar ──────────────────────
DO $$
DECLARE l uuid; r jsonb; pid uuid; slug0 text; path0 text; tag uuid;
BEGIN
  l := (SELECT id FROM idealista_listings WHERE reference_code = 'BC-9003');
  pid := crm_t.prop_of(l);
  SELECT slug INTO slug0 FROM properties WHERE id = pid;
  SELECT smartlink_path INTO path0 FROM idealista_crm_sync WHERE listing_id = l;
  SELECT id INTO tag FROM property_tags WHERE country = 'es' AND name = 'RESERVADO';
  DELETE FROM property_tag_links WHERE property_id = pid AND tag_id = tag;      -- alguien la quita a mano

  PERFORM crm_t.op(l, 'update', 'confirmed', 'active', 9003);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'synced' AND (r->>'property_id')::uuid = pid, 'actualización → misma ficha');
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM property_tag_links WHERE property_id = pid AND tag_id = tag), 'etiqueta reaplicada en la actualización (D16)');
  PERFORM test_util.ok((SELECT count(*) FROM properties WHERE external_id LIKE 'idealista-api-' || l || '%') = 1, 'sin duplicados tras actualizar');

  PERFORM crm_t.op(l, 'deactivate', 'confirmed', 'inactive', 9003);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'note' = 'archived', 'baja confirmada → archivada');
  PERFORM test_util.ok((SELECT archived_reason = 'idealista_api_withdrawn' AND status = 'archived' AND archived_at IS NOT NULL
                          FROM properties WHERE id = pid), 'archivada con motivo idealista_api_withdrawn');
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM property_history WHERE property_id = pid AND kind = 'status' AND new_value = 'archived'),
                       'queda rastro en property_history');
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM property_tag_links WHERE property_id = pid), 'archivada conserva su etiqueta');

  PERFORM crm_t.op(l, 'reactivate', 'confirmed', 'active', 9003);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'note' = 'unarchived' AND (r->>'property_id')::uuid = pid, 'reactivar → la misma ficha, desarchivada');
  PERFORM test_util.ok((SELECT slug FROM properties WHERE id = pid) = slug0
                       AND (SELECT smartlink_path FROM idealista_crm_sync WHERE listing_id = l) = path0, 'el SmartLink no cambia');
END $$;

-- ── 5. Publicar dos veces no impide que la baja archive (AC3) ───────────────
DO $$
DECLARE l uuid; r jsonb; pid uuid;
BEGIN
  l := crm_t.listing('BC-9005', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9005);  PERFORM crm_t.sync(l);
  PERFORM crm_t.op(l, 'update', 'confirmed', 'active', 9005);  PERFORM crm_t.sync(l);
  PERFORM crm_t.op(l, 'update', 'confirmed', 'active', 9005);  PERFORM crm_t.sync(l);
  pid := crm_t.prop_of(l);
  PERFORM test_util.ok((SELECT property_origin FROM idealista_crm_sync WHERE listing_id = l) = 'generated', 'el origen sigue siendo generated');
  PERFORM crm_t.op(l, 'deactivate', 'confirmed', 'inactive', 9005);
  r := crm_t.sync(l);
  PERFORM test_util.ok((SELECT status FROM properties WHERE id = pid) = 'archived', 'tras varias publicaciones, la baja archiva la generada');
END $$;

-- ── 6. Propiedad existente por enlace explícito (I4, D12) ───────────────────
DO $$
DECLARE l uuid; r jsonb; before jsonb; after jsonb; tag uuid;
BEGIN
  INSERT INTO properties (id, slug, title, status, country, owner_name, internal_notes, price)
  VALUES ('10000000-0000-0000-0000-0000000000e2', 'piso-real-e2', 'Piso real 2', 'available', 'es', 'Dueño', 'Nota', 2000);
  l := crm_t.listing('BC-9006', false, '10000000-0000-0000-0000-0000000000e2');
  SELECT to_jsonb(p) - 'updated_at' INTO before FROM properties p WHERE id = '10000000-0000-0000-0000-0000000000e2';
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9006);
  r := crm_t.sync(l);
  SELECT to_jsonb(p) - 'updated_at' INTO after FROM properties p WHERE id = '10000000-0000-0000-0000-0000000000e2';
  PERFORM test_util.ok(r->>'origin' = 'existing', 'enlace explícito → existing');
  PERFORM test_util.ok(before = after, 'la existente no cambia en ningún campo');
  SELECT id INTO tag FROM property_tags WHERE country = 'es' AND name = 'RESERVADO';
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM property_tag_links WHERE property_id = '10000000-0000-0000-0000-0000000000e2' AND tag_id = tag),
                       'la existente recibe la etiqueta');
  PERFORM crm_t.op(l, 'deactivate', 'confirmed', 'inactive', 9006);
  UPDATE idealista_listings SET api_state = 'inactive' WHERE id = l;
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'note' = 'existing_untouched', 'baja de una existente → no se toca');
  PERFORM test_util.ok((SELECT status = 'available' AND archived_at IS NULL FROM properties WHERE id = '10000000-0000-0000-0000-0000000000e2'),
                       'la existente NO se archiva nunca');
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM property_tag_links WHERE property_id = '10000000-0000-0000-0000-0000000000e2' AND tag_id = tag),
                       'la existente conserva la etiqueta tras la baja (D12)');
END $$;

-- ── 7. Asociación registrada antes que property_id (corrección 2) ───────────
DO $$
DECLARE l uuid; r jsonb; pid uuid;
BEGIN
  l := crm_t.listing('BC-9007', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9007);  PERFORM crm_t.sync(l);
  pid := crm_t.prop_of(l);
  -- Alguien (o el build anterior) le pone un property_id explícito distinto.
  UPDATE idealista_listings SET property_id = '10000000-0000-0000-0000-0000000000e1' WHERE id = l;
  PERFORM crm_t.op(l, 'update', 'confirmed', 'active', 9007);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'needs_review' AND r->>'reason' = 'explicit_link_changed',
                       'property_id distinto de la asociación → revisar, no se reclasifica');
  UPDATE idealista_listings SET property_id = NULL WHERE id = l;
  -- Con su propia ficha generada en property_id, la asociación manda: sigue siendo generada.
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'synced' AND (SELECT property_origin FROM idealista_crm_sync WHERE listing_id = l) = 'generated',
                       'la asociación registrada manda');
END $$;

-- ── 8. Coincidencia por URL de origen → revisión (D9) ───────────────────────
DO $$
DECLARE l uuid; l2 uuid; r jsonb; n int;
BEGIN
  SELECT count(*) INTO n FROM properties;
  l := crm_t.listing('BC-9008', true, NULL, 'https://idealista.com/inmueble/111');
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9008);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'needs_review' AND r->>'reason' = 'source_url_match', 'misma URL de origen → revisar');
  PERFORM test_util.ok((SELECT count(*) FROM properties) = n, 'la revisión no crea nada');
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM property_tag_links WHERE property_id = '10000000-0000-0000-0000-0000000000e1'),
                       'la revisión no etiqueta la existente');
  PERFORM test_util.ok((idealista_crm_resolve_review(l, 'production', 'use_existing', '10000000-0000-0000-0000-0000000000e1', NULL))->>'error' = 'actor_required',
                       'resolver exige usuario');
  PERFORM test_util.ok((idealista_crm_resolve_review(l, 'production', 'use_existing', '10000000-0000-0000-0000-0000000000e2',
                        '00000000-0000-0000-0000-00000000a001'))->>'error' = 'not_a_candidate', 'solo una candidata real');
  r := idealista_crm_resolve_review(l, 'production', 'use_existing', '10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a001');
  PERFORM test_util.ok((r->>'ok')::boolean, 'resolver: usar la existente');
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'origin' = 'existing' AND (SELECT origin_decided_by FROM idealista_crm_sync WHERE listing_id = l) = '00000000-0000-0000-0000-00000000a001',
                       'queda como existente con quién lo decidió');
  -- Otra con la misma URL, resuelta como «crear ficha de referencia».
  l2 := crm_t.listing('BC-9018', true, NULL, 'https://www.idealista.com/inmueble/111/?x=1');
  PERFORM crm_t.op(l2, 'create', 'confirmed', 'active', 9018);
  PERFORM test_util.ok((crm_t.sync(l2))->>'status' = 'needs_review', 'la segunda también pide revisión');
  PERFORM idealista_crm_resolve_review(l2, 'production', 'generate', NULL, '00000000-0000-0000-0000-00000000a001');
  r := crm_t.sync(l2);
  PERFORM test_util.ok(r->>'origin' = 'generated', 'resolver: crear ficha de referencia');
  PERFORM test_util.expect_error(format($q$UPDATE idealista_crm_sync SET property_origin = 'existing' WHERE listing_id = %L$q$, l2),
                                 'idealista_crm_origin_immutable');
END $$;

-- ── 9. Incertidumbre (corrección 5) ─────────────────────────────────────────
DO $$
DECLARE l uuid; r jsonb; op uuid; pid uuid;
BEGIN
  -- 9a. Operación posterior sin resultado → incierto; un «unknown» sigue incierto; observe lo resuelve.
  l := crm_t.listing('BC-9009', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9009);  PERFORM crm_t.sync(l);
  pid := crm_t.prop_of(l);
  op := crm_t.op(l, 'deactivate', NULL);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'uncertain', 'baja sin resultado → incierto');
  PERFORM crm_t.finish(op, 'unknown', NULL);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'uncertain' AND (SELECT status FROM properties WHERE id = pid) = 'available',
                       'baja «unknown» → incierto y sin archivar');
  PERFORM crm_t.op(l, 'observe', 'confirmed', 'inactive', 9009);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'note' = 'archived', 'observe inactive tras una baja incierta → archivada');

  -- 9b. observe inactive sin baja nuestra → revisar, no se archiva.
  l := crm_t.listing('BC-9019', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9019);  PERFORM crm_t.sync(l);
  PERFORM crm_t.op(l, 'observe', 'confirmed', 'dropped_by_quality', 9019);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'needs_review' AND (SELECT status FROM properties WHERE id = crm_t.prop_of(l)) = 'available',
                       'baja que no hicimos (calidad) → revisar, sin archivar');

  -- 9c. Solape → incierto; observe posterior lo resuelve.
  l := crm_t.listing('BC-9029', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9029);  PERFORM crm_t.sync(l);
  op := crm_t.op(l, 'deactivate', NULL);
  PERFORM crm_t.op(l, 'reactivate', 'confirmed', 'active', 9029);
  PERFORM crm_t.finish(op, 'confirmed', 'inactive', 9029);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'uncertain' AND r->>'reason' = 'overlap', 'dos operaciones a la vez → incierto (solape)');
  PERFORM crm_t.op(l, 'observe', 'confirmed', 'active', 9029);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'synced', 'observe posterior resuelve el solape');

  -- 9d. Cambio fuera del registro (api_last_sync_at posterior) → incierto.
  UPDATE idealista_listings SET api_last_sync_at = clock_timestamp() + interval '5 minutes' WHERE id = l;
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'uncertain' AND r->>'reason' = 'external_change', 'llamada fuera del registro → incierto');
  UPDATE idealista_listings SET api_last_sync_at = NULL WHERE id = l;

  -- 9e. Rechazos no cuentan ni cuentan como externos.
  PERFORM crm_t.op(l, 'update', 'rejected', NULL);
  UPDATE idealista_listings SET api_last_sync_at = clock_timestamp() WHERE id = l;
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'synced', 'un rechazo (4xx) y su escritura de api_last_sync_at no crean incertidumbre');
END $$;

-- ── 10. Alta sin id / alta incierta (corrección 5) ──────────────────────────
DO $$
DECLARE l uuid; r jsonb; op uuid;
BEGIN
  l := crm_t.listing('BC-9010', true);
  op := crm_t.op(l, 'create', NULL);
  PERFORM crm_t.finish(op, 'unknown', NULL);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'status' = 'uncertain_create', 'alta unknown → uncertain_create');
  PERFORM test_util.ok((idealista_create_guard(l, 'production'))->>'allowed' = 'false', 'no se permite otra alta');
  PERFORM test_util.expect_error(format('DELETE FROM idealista_listings WHERE id = %L', l), 'idealista_ad_live');
  -- «Reconciliar» encuentra el anuncio sin ambigüedad.
  PERFORM crm_t.op(l, 'observe_reconcile', 'confirmed', 'active', 9010);
  PERFORM test_util.ok((idealista_crm_target(l, 'production'))->>'state' = 'published', 'observe_reconcile con id resuelve el alta');

  l := crm_t.listing('BC-9020', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', NULL);       -- 2xx sin propertyId
  PERFORM test_util.ok((idealista_crm_target(l, 'production'))->>'state' = 'uncertain_create', 'alta confirmada sin id → uncertain_create');

  l := crm_t.listing('BC-9030', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9030);       -- id devuelto, no guardado en la ficha
  PERFORM test_util.ok((idealista_create_guard(l, 'production'))->>'reason' = 'recover_id', 'alta con id sin guardar → recuperar id');
  PERFORM test_util.expect_error(format('DELETE FROM idealista_listings WHERE id = %L', l), 'idealista_ad_live');
  r := idealista_recover_api_property_id(l, 'production');
  PERFORM test_util.ok((r->>'ok')::boolean AND (SELECT api_property_id FROM idealista_listings WHERE id = l) = 9030,
                       'recuperar id: local, desde la operación confirmada');
  PERFORM test_util.ok((idealista_create_guard(l, 'production'))->>'allowed' = 'true', 'con el id guardado ya no se bloquea');
END $$;

-- ── 11. Estados a mano y archivado ajeno (C3, C4) ───────────────────────────
DO $$
DECLARE l uuid; r jsonb; pid uuid;
BEGIN
  l := crm_t.listing('BC-9011', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9011);  PERFORM crm_t.sync(l);
  pid := crm_t.prop_of(l);
  UPDATE properties SET status = 'reserved' WHERE id = pid;
  PERFORM crm_t.op(l, 'deactivate', 'confirmed', 'inactive', 9011);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'reason' = 'manual_status' AND (SELECT status FROM properties WHERE id = pid) = 'reserved',
                       'reservada a mano → no se archiva, se pide revisión');

  l := crm_t.listing('BC-9021', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9021);  PERFORM crm_t.sync(l);
  pid := crm_t.prop_of(l);
  UPDATE properties SET status = 'archived', archived_at = now() WHERE id = pid;   -- archivada a mano
  PERFORM crm_t.op(l, 'reactivate', 'confirmed', 'active', 9021);
  r := crm_t.sync(l);
  PERFORM test_util.ok(r->>'note' = 'archived_by_someone_else' AND (SELECT status FROM properties WHERE id = pid) = 'archived',
                       'archivada a mano → reactivar no la desarchiva');
END $$;

-- ── 12. Obsolescencia (I6) ──────────────────────────────────────────────────
DO $$
DECLARE l uuid; r jsonb; old_seq bigint;
BEGIN
  l := crm_t.listing('BC-9012', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9012);
  old_seq := ((idealista_crm_plan(l, 'production'))->'target'->>'seq')::bigint;
  PERFORM crm_t.sync(l);
  PERFORM crm_t.op(l, 'deactivate', 'confirmed', 'inactive', 9012);
  PERFORM crm_t.sync(l);
  r := apply_idealista_crm_sync(l, 'production', old_seq, crm_t.new_property('x'), NULL, NULL);
  PERFORM test_util.ok(r->>'status' = 'moved' AND (SELECT status FROM properties WHERE id = crm_t.prop_of(l)) = 'archived',
                       'una pasada con un seq antiguo no aplica nada (moved) y no desarchiva');
END $$;

-- ── 13. Sandbox (D19) ───────────────────────────────────────────────────────
DO $$
DECLARE l uuid; r jsonb;
BEGIN
  l := crm_t.listing('BC-9013', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9013, 'sandbox');
  r := crm_t.sync(l, 'sandbox');
  PERFORM test_util.ok(r->>'status' = 'sandbox' AND NOT EXISTS (SELECT 1 FROM properties WHERE external_id LIKE 'idealista-api-' || l || '%'),
                       'sandbox: se registra y no toca el CRM');
END $$;

-- ── 14. Multimedia (corrección 3) ───────────────────────────────────────────
DO $$
DECLARE l uuid; r jsonb; plan jsonb; pid uuid; seq bigint; a text; b text; c text; m jsonb; staff uuid;
BEGIN
  l := crm_t.listing('BC-9014', true);
  PERFORM crm_t.op(l, 'create', 'confirmed', 'active', 9014);
  plan := idealista_crm_plan(l, 'production');
  pid := (plan->'classification'->>'property_id')::uuid;
  seq := (plan->'target'->>'seq')::bigint;
  PERFORM test_util.ok(pid IS NOT NULL AND plan->'classification'->>'kind' = 'generate_new', 'el plan reserva el id de la ficha');
  PERFORM test_util.ok((plan->'classification'->>'property_id')::uuid = ((idealista_crm_plan(l, 'production'))->'classification'->>'property_id')::uuid,
                       'el id reservado no cambia entre planes');
  a := pid || '/idealista-ref/photo/aaa-' || seq || '.jpg';
  b := pid || '/idealista-ref/photo/bbb-' || seq || '.jpg';
  c := pid || '/idealista-ref/plan/ccc-' || seq || '.jpg';
  PERFORM test_util.ok((idealista_crm_media_stage(pid, 'otra/ruta.jpg', 'photo', 'x', 1, 'image/jpeg', seq, NULL))->>'error' = 'bad_path',
                       'solo rutas bajo {propertyId}/idealista-ref/');
  PERFORM idealista_crm_media_stage(pid, a, 'photo', 'aaa', 10, 'image/jpeg', seq, 'src-a');
  PERFORM idealista_crm_media_stage(pid, b, 'photo', 'bbb', 10, 'image/jpeg', seq, 'src-b');
  PERFORM idealista_crm_media_stage(pid, c, 'plan',  'ccc', 10, 'image/jpeg', seq, 'src-c');
  m := jsonb_build_object('mode', 'replace',
    'photos', jsonb_build_array(jsonb_build_object('path', b, 'url', 'https://s.test/' || b), jsonb_build_object('path', a, 'url', 'https://s.test/' || a)),
    'plans', jsonb_build_array(jsonb_build_object('path', c, 'url', 'https://s.test/' || c)),
    'videos', jsonb_build_array(jsonb_build_object('url', 'https://v.test/1.mp4', 'marker', 'idealista-ref:' || pid || ':v1')));
  r := apply_idealista_crm_sync(l, 'production', seq, crm_t.new_property('media-' || left(pid::text, 8)), m, NULL);
  PERFORM test_util.ok(r->>'status' = 'synced', 'alta con multimedia');
  PERFORM test_util.ok((SELECT array_agg(sync_path ORDER BY position) FROM property_photos WHERE property_id = pid) = ARRAY[b, a],
                       'fotos en el orden del anuncio');
  PERFORM test_util.ok((SELECT is_cover FROM property_photos WHERE property_id = pid AND sync_path = b)
                       AND (SELECT cover_photo_url FROM properties WHERE id = pid) = 'https://s.test/' || b, 'portada = primera foto');
  PERFORM test_util.ok((SELECT count(*) FROM property_media WHERE property_id = pid AND type = 'plan' AND position = 0) = 1
                       AND (SELECT count(*) FROM property_media WHERE property_id = pid AND type = 'video' AND source = 'idealista_ref') = 1,
                       'plano con orden y vídeo referenciado');
  -- El personal añade una foto; una actualización reordena y quita una.
  INSERT INTO property_photos (property_id, url, position) VALUES (pid, 'https://s.test/staff.jpg', 9) RETURNING id INTO staff;
  PERFORM crm_t.op(l, 'update', 'confirmed', 'active', 9014);
  plan := idealista_crm_plan(l, 'production');
  m := jsonb_build_object('mode', 'replace', 'photos', jsonb_build_array(jsonb_build_object('path', a, 'url', 'https://s.test/' || a)),
                          'plans', '[]'::jsonb, 'videos', '[]'::jsonb);
  r := apply_idealista_crm_sync(l, 'production', (plan->'target'->>'seq')::bigint, crm_t.new_property('x'), m, NULL);
  PERFORM test_util.ok((SELECT array_agg(coalesce(sync_path, 'staff') ORDER BY position) FROM property_photos WHERE property_id = pid) = ARRAY[a, 'staff'],
                       'actualización: quita, reordena y deja la del personal detrás');
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM property_media WHERE property_id = pid AND sync_path IS NOT NULL), 'planos y vídeos gestionados se reemplazan');
  -- Referenciar algo no subido → falla sin cambiar nada.
  PERFORM crm_t.op(l, 'update', 'confirmed', 'active', 9014);
  plan := idealista_crm_plan(l, 'production');
  m := jsonb_build_object('mode', 'replace', 'photos', jsonb_build_array(jsonb_build_object('path', pid || '/idealista-ref/photo/zzz.jpg', 'url', 'https://s.test/z')));
  r := apply_idealista_crm_sync(l, 'production', (plan->'target'->>'seq')::bigint, crm_t.new_property('x'), m, NULL);
  PERFORM test_util.ok(r->>'error_code' = 'media_missing'
                       AND (SELECT array_agg(coalesce(sync_path, 'staff') ORDER BY position) FROM property_photos WHERE property_id = pid) = ARRAY[a, 'staff'],
                       'objeto no subido → failed/media_missing y nada cambia');
  -- Limpieza: dentro del plazo no se borra nada; fuera, solo lo que no se usa.
  PERFORM test_util.ok(cardinality(idealista_crm_media_collect(pid, interval '24 hours')) = 0, 'limpieza: nada dentro del plazo de 24 h');
  PERFORM test_util.ok(idealista_crm_media_collect(pid, interval '0 seconds') @> ARRAY[b, c]
                       AND NOT (idealista_crm_media_collect(pid, interval '0 seconds') @> ARRAY[a]),
                       'limpieza: se recoge lo que no se usa y nunca lo que está en uso');
  PERFORM test_util.ok((idealista_crm_media_stage(pid, b, 'photo', 'bbb', 10, 'image/jpeg', seq, 'src-b'))->>'error' = 'path_deleted',
                       'una ruta borrada no se reutiliza (versión nueva obligatoria)');
  PERFORM test_util.ok(NOT (idealista_crm_media_lookup(pid, ARRAY['src-b']) ? 'src-b') AND (idealista_crm_media_lookup(pid, ARRAY['src-a']) ? 'src-a'),
                       'la caché de orígenes no devuelve objetos borrados');
END $$;

-- ── 15. Protecciones de borrado (D11) ───────────────────────────────────────
DO $$
DECLARE l uuid; pid uuid;
BEGIN
  l := crm_t.listing('BC-9015', false, '10000000-0000-0000-0000-0000000000e1');
  UPDATE idealista_listings SET api_property_id = 9015, api_state = 'active' WHERE id = l;
  PERFORM test_util.expect_error($q$DELETE FROM properties WHERE id = '10000000-0000-0000-0000-0000000000e1'$q$, 'idealista_ad_live');
  UPDATE idealista_listings SET api_state = NULL WHERE id = l;
  PERFORM test_util.expect_error($q$DELETE FROM properties WHERE id = '10000000-0000-0000-0000-0000000000e1'$q$, 'idealista_ad_live');
  PERFORM test_util.expect_error(format('DELETE FROM idealista_listings WHERE id = %L', l), 'idealista_ad_live');
  -- La generada, asociada solo por la tabla de sincronización.
  l := (SELECT id FROM idealista_listings WHERE reference_code = 'BC-9009');
  pid := crm_t.prop_of(l);
  UPDATE idealista_listings SET api_property_id = 9009, api_state = 'pending' WHERE id = l;
  PERFORM test_util.expect_error(format('DELETE FROM properties WHERE id = %L', pid), 'idealista_ad_live');
  UPDATE idealista_listings SET api_state = 'inactive' WHERE id = l;
  EXECUTE format('DELETE FROM properties WHERE id = %L', pid);
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM properties WHERE id = pid), 'tras una baja confirmada sí se puede borrar');
  PERFORM test_util.ok((SELECT property_id IS NULL AND property_origin = 'generated' FROM idealista_crm_sync WHERE listing_id = l),
                       'la asociación conserva el origen aunque se borre la propiedad');
  PERFORM crm_t.op(l, 'reactivate', 'confirmed', 'active', 9009);
  PERFORM test_util.ok((crm_t.sync(l))->>'reason' = 'property_deleted', 'reactivar sin la propiedad → revisar, nunca otra en silencio');
END $$;

-- ── 16. Registro de solo añadir e inmutabilidad (I5, I10) ───────────────────
DO $$
BEGIN
  PERFORM test_util.expect_error('UPDATE idealista_api_operations SET kind = kind', 'idealista_ops_append_only');
  PERFORM test_util.expect_error('DELETE FROM idealista_api_operation_results', 'idealista_ops_append_only');
  PERFORM idealista_op_step((SELECT op_id FROM idealista_api_operations ORDER BY seq LIMIT 1), 'crm_sync', false, 'prueba');
  PERFORM test_util.expect_error('UPDATE idealista_api_operation_steps SET ok = ok', 'idealista_ops_append_only');
  PERFORM test_util.ok((SELECT outcome FROM idealista_api_operation_results r JOIN idealista_api_operations o USING (op_id)
                         ORDER BY o.seq LIMIT 1) = 'confirmed', 'un paso fallido no cambia la confirmación principal');
  PERFORM test_util.expect_error('TRUNCATE idealista_api_operations CASCADE', 'idealista_ops_append_only');
  PERFORM test_util.ok((SELECT idealista_op_finish(op_id, 'rejected', 400, NULL, NULL, NULL) FROM idealista_api_operation_results LIMIT 1) = 'already',
                       'un resultado no se sobrescribe');
  PERFORM test_util.expect_error($q$UPDATE properties SET reference_only = false WHERE reference_only$q$, 'reference_only_immutable');
  PERFORM test_util.expect_error($q$UPDATE properties SET slug = slug || '-x' WHERE reference_only$q$, 'reference_slug_immutable');
  PERFORM test_util.expect_error($q$UPDATE properties SET published_web = true WHERE reference_only$q$, 'check_violation');
END $$;

-- ── 17. Permisos (I12) ──────────────────────────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
DO $$
BEGIN
  PERFORM test_util.expect_error($q$SELECT apply_idealista_crm_sync(gen_random_uuid(), 'production', 1, NULL, NULL, NULL)$q$, 'insufficient_privilege');
  PERFORM test_util.expect_error($q$SELECT idealista_op_begin(gen_random_uuid(), gen_random_uuid(), 'production', 'create', NULL, NULL, NULL, NULL, NULL)$q$, 'insufficient_privilege');
  PERFORM test_util.expect_error('SELECT * FROM idealista_crm_sync', 'insufficient_privilege');
  PERFORM test_util.expect_error('SELECT * FROM idealista_api_operations', 'insufficient_privilege');
END $$;
RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
  PERFORM test_util.expect_error($q$SELECT idealista_crm_target(gen_random_uuid(), 'production')$q$, 'insufficient_privilege');
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$
DECLARE l uuid := gen_random_uuid();
BEGIN
  PERFORM idealista_op_begin(gen_random_uuid(), l, 'production', 'create', NULL, NULL, NULL, NULL, NULL);
  PERFORM test_util.ok(true, 'service_role puede registrar operaciones');
END $$;
RESET ROLE;

\echo 'test-idealista-crm-sync.sql: todas las comprobaciones en verde'
