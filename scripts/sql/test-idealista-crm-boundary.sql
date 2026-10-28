-- ============================================================================
-- SOLO PRUEBAS LOCALES (Idealista API → CRM, T5). Frontera de distribución de
-- las fichas de referencia, con roles SINTÉTICOS en la base temporal. Prueba
-- las políticas y triggers NUEVOS de 0232; no es una sonda contra ningún
-- despliegue real. Lo lanza test-idealista-crm-sync.sh (frontera).
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set client '00000000-0000-0000-0000-0000000000c3'
\set normal '10000000-0000-0000-0000-000000000001'

-- Una ficha de referencia creada por el camino real (op + plan + apply).
UPDATE app_settings SET value = '{"enabled": true}' WHERE key = 'idealista_crm_sync';
INSERT INTO property_tags (country, name) VALUES ('es', 'RESERVADO');
CREATE TEMP TABLE ref AS SELECT NULL::uuid AS id;
DO $$
DECLARE l uuid; op uuid := gen_random_uuid(); plan jsonb; r jsonb;
BEGIN
  INSERT INTO idealista_listings (reference_code, is_inspo, inspo_title) VALUES ('BC-B001', true, 'Ref') RETURNING id INTO l;
  PERFORM idealista_op_begin(op, l, 'production', 'create', NULL, 'BC-B001', '{}', '{}', NULL);
  PERFORM idealista_op_finish(op, 'confirmed', 201, 'active', 8001, NULL);
  plan := idealista_crm_plan(l, 'production');
  r := apply_idealista_crm_sync(l, 'production', (plan->'target'->>'seq')::bigint,
         jsonb_build_object('slug', 'ref-frontera-x7k2m9q4wz', 'title', 'Ref frontera', 'operation', 'sale', 'price', 500000,
                            'zone', 'Madrid', 'features', '[]'::jsonb, 'internal_notes', 'procedencia'), NULL, NULL);
  UPDATE ref SET id = (r->>'property_id')::uuid;
  INSERT INTO property_photos (property_id, url, position) VALUES ((r->>'property_id')::uuid, 'https://s.test/ref.jpg', 0);
END $$;
INSERT INTO property_photos (property_id, url, position) VALUES (:'normal', 'https://s.test/normal.jpg', 0);
SELECT id AS ref_id FROM ref \gset
GRANT SELECT ON ref TO authenticated, anon, service_role;

-- ── Lectura de un cliente (políticas nuevas) ────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'client', false);
DO $$
DECLARE r uuid := (SELECT id FROM ref);
BEGIN
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM properties WHERE id = r), 'cliente: no ve la ficha de referencia');
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM properties WHERE id = '10000000-0000-0000-0000-000000000001'), 'cliente: sí ve una propiedad normal');
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM property_photos WHERE property_id = r), 'cliente: no ve sus fotos');
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM property_photos WHERE property_id = '10000000-0000-0000-0000-000000000001'), 'cliente: ve fotos normales');
  -- Aunque no la vea, el trigger (SECURITY DEFINER) le impide añadirla a favoritos.
  PERFORM test_util.expect_error(format($q$INSERT INTO favorites (client_id, property_id) VALUES (%L, %L)$q$,
                                        '00000000-0000-0000-0000-0000000000c3', r), 'reference_only_property');
  INSERT INTO favorites (client_id, property_id) VALUES ('00000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-000000000001');
  PERFORM test_util.ok(true, 'cliente: favorito normal sí');
END $$;
RESET ROLE;

-- ── El personal lo ve todo ──────────────────────────────────────────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'owner', false);
DO $$
BEGIN
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM properties WHERE id = (SELECT id FROM ref)), 'personal: ve la ficha de referencia');
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM property_photos WHERE property_id = (SELECT id FROM ref)), 'personal: ve sus fotos');
END $$;
RESET ROLE;

-- ── Anónimo ─────────────────────────────────────────────────────────────────
SET ROLE anon;
DO $$
BEGIN
  PERFORM test_util.expect_error('SELECT 1 FROM idealista_crm_sync', 'insufficient_privilege');
END $$;
RESET ROLE;

-- ── Asociaciones prohibidas (service_role: el camino de las rutas) ──────────
SET ROLE service_role;
DO $$
DECLARE r uuid := (SELECT id FROM ref); cat uuid; sl uuid;
BEGIN
  cat := catalog_create('00000000-0000-0000-0000-0000000000f1', 'Frontera', 'intro');
  PERFORM test_util.expect_error(format($q$SELECT catalog_add_property(%L, %L, %L)$q$,
                                        '00000000-0000-0000-0000-0000000000f1', cat, r), 'reference_only_property');
  PERFORM test_util.expect_error(format($q$INSERT INTO catalog_adjustments (catalog_id, property_id, kind) VALUES (%L, %L, 'include')$q$, cat, r),
                                 'reference_only_property');
  PERFORM test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_candidates('{"operation":"any"}'::jsonb, false, NULL) c WHERE c.property_id = r),
                       'catálogo automático: no la propone');
  PERFORM test_util.ok(EXISTS (SELECT 1 FROM catalog_candidates('{"operation":"any"}'::jsonb, false, NULL) c
                                WHERE c.property_id = '10000000-0000-0000-0000-000000000001'),
                       'catálogo automático: sigue proponiendo las normales');
  PERFORM test_util.expect_error(format($q$INSERT INTO client_property_selections (client_id, property_id) VALUES (%L, %L)$q$,
                                        '00000000-0000-0000-0000-0000000000c3', r), 'reference_only_property');
  INSERT INTO client_shortlists DEFAULT VALUES RETURNING id INTO sl;
  PERFORM test_util.expect_error(format($q$INSERT INTO client_shortlist_items (shortlist_id, property_id) VALUES (%L, %L)$q$, sl, r),
                                 'reference_only_property');
  PERFORM test_util.expect_error(format($q$INSERT INTO client_portal_links (client_id, url, property_id) VALUES (%L, 'https://x.test/1', %L)$q$,
                                        '00000000-0000-0000-0000-0000000000c3', r), 'reference_only_property');
  INSERT INTO client_portal_links (client_id, url) VALUES ('00000000-0000-0000-0000-0000000000c3', 'https://x.test/2');
  PERFORM test_util.expect_error(format($q$UPDATE client_portal_links SET property_id = %L WHERE url = 'https://x.test/2'$q$, r),
                                 'reference_only_property');
  PERFORM test_util.expect_error(format($q$INSERT INTO property_collab_links (property_id) VALUES (%L)$q$, r), 'reference_only_property');
  PERFORM test_util.expect_error(format($q$INSERT INTO idealista_listings (reference_code, is_inspo, property_id) VALUES ('BC-B002', false, %L)$q$, r),
                                 'reference_only_property');
  PERFORM test_util.expect_error(format($q$UPDATE properties SET published_web = true WHERE id = %L$q$, r), 'check_violation');
  PERFORM test_util.expect_error(format($q$UPDATE properties SET new_listing_alerts_suppressed = false WHERE id = %L$q$, r), 'check_violation');
  -- Lo normal sigue funcionando.
  INSERT INTO client_property_selections (client_id, property_id) VALUES ('00000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-000000000001');
  INSERT INTO catalog_adjustments (catalog_id, property_id, kind) VALUES (cat, r, 'exclude');
  PERFORM test_util.expect_error(format($q$UPDATE catalog_adjustments SET kind = 'include' WHERE catalog_id = %L AND property_id = %L$q$, cat, r),
                                 'reference_only_property');
  PERFORM test_util.ok(true, 'excluir una ficha de referencia de un catálogo sí se permite (no distribuye)');
END $$;
RESET ROLE;

\echo 'test-idealista-crm-boundary.sql: todas las comprobaciones en verde'
