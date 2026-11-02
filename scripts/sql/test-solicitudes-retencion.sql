-- SOLO PRUEBAS LOCALES. 0238: «Cod.» contra lo publicado por API, caducidad
-- a 30/60 días y vista con portada y sin caducadas. Corre en la misma base
-- que test-solicitudes-reparto.sql, después de aplicar 0238 DOS veces.
\set ON_ERROR_STOP 1

-- Prefijo «d» para no chocar con los ids de los escenarios de concurrencia.
CREATE OR REPLACE FUNCTION pg_temp.l(p_id text) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('f0000000-0000-0000-0000-' || lpad('d' || p_id, 12, '0'))::uuid
$$;
-- Solicitud como la deja la ingesta, con antigüedad y lo que haga falta.
CREATE OR REPLACE FUNCTION pg_temp.lead(p_id text, p_days integer, p_code text DEFAULT NULL,
  p_client uuid DEFAULT NULL, p_next timestamptz DEFAULT NULL, p_merged text DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO idealista_leads (id, conversation_id, name, phone, idealista_code, client_id, next_action_at,
                               merged_into_id, created_at)
  VALUES (pg_temp.l(p_id), 'ret-' || p_id, 'Lead ' || p_id, '6009' || lpad(p_id, 5, '0'), p_code, p_client, p_next,
          CASE WHEN p_merged IS NULL THEN NULL ELSE pg_temp.l(p_merged) END, now() - make_interval(days => p_days))
  RETURNING id
$$;

-- Un cliente de la cartera (las solicitudes con cliente no caducan).
INSERT INTO auth.users (id, email) VALUES ('b0000000-0000-0000-0000-0000000000c1', 'retenido@test');
INSERT INTO profiles (id, role, full_name, email, phone, country) VALUES
  ('b0000000-0000-0000-0000-0000000000c1', 'client', 'Cliente Retenido', 'retenido@test', NULL, 'es');

-- ─── 1 · Anuncios publicados por API ─────────────────────────────────────────
INSERT INTO properties (id, slug, title, country, bc_reference, cover_photo_url) VALUES
  ('d0000000-0000-0000-0000-000000000901', 'api-1', 'Publicado por API', 'es', 'bc-api-1', 'https://img.sim/portada-901.jpg');
INSERT INTO idealista_listings (id, property_id, reference_code, idealista_property_id, is_inspo, api_property_id, api_clone_property_id, photo_ids) VALUES
  ('e0000000-0000-0000-0000-000000000901', 'd0000000-0000-0000-0000-000000000901', 'BC-API-1', NULL, false, 555001, 555002, '{}'),
  ('e0000000-0000-0000-0000-000000000902', NULL, 'BC-API-2', NULL, true, 555003, NULL, '{https://img.sim/anuncio-902.jpg}');

SELECT test_util.ok(
  (SELECT array_agg(x ORDER BY x) FROM listings_for_code('555001') x) = ARRAY['e0000000-0000-0000-0000-000000000901'::uuid]
  AND (SELECT array_agg(x ORDER BY x) FROM listings_for_code('555002') x) = ARRAY['e0000000-0000-0000-0000-000000000901'::uuid]
  AND (SELECT array_agg(x ORDER BY x) FROM listings_for_code('555003') x) = ARRAY['e0000000-0000-0000-0000-000000000902'::uuid]
  AND (SELECT count(*) FROM listings_for_code('BC-API-1')) = 0
  AND (SELECT count(*) FROM listings_for_code('99999999999999999999')) = 0,
  '0238 · un «Cod.» encuentra el anuncio publicado por API, su clon, y nada con texto o números absurdos');

-- Un «Cod.» de un anuncio publicado por API → vínculo exacto 'code' y la
-- vista enseña la portada de la ficha propia y el código público.
SELECT pg_temp.lead('901', 1, '555001');
SELECT route_lead(pg_temp.l('901'));
SELECT test_util.ok(
  (SELECT property_link_method FROM idealista_leads WHERE id = pg_temp.l('901')) = 'code'
  AND (SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('901')) = 'e0000000-0000-0000-0000-000000000901'
  AND (SELECT matched_property_id FROM idealista_leads WHERE id = pg_temp.l('901')) = 'd0000000-0000-0000-0000-000000000901'
  AND (SELECT listing_cover_url FROM lead_inbox_facts WHERE id = pg_temp.l('901')) = 'https://img.sim/portada-901.jpg'
  AND (SELECT listing_ad_code FROM lead_inbox_facts WHERE id = pg_temp.l('901')) = '555001',
  '0238 · «Cod.» de la API → vínculo exacto, portada de la ficha y código público en la vista');

SELECT pg_temp.lead('902', 1, '555003');
SELECT route_lead(pg_temp.l('902'));
SELECT test_util.ok(
  (SELECT property_link_method FROM idealista_leads WHERE id = pg_temp.l('902')) = 'code'
  AND (SELECT listing_cover_url FROM lead_inbox_facts WHERE id = pg_temp.l('902')) = 'https://img.sim/anuncio-902.jpg',
  '0238 · anuncio sin ficha propia: la portada sale de sus fotos');

-- ─── 2 · Caducidad ───────────────────────────────────────────────────────────
-- 40 días sin cliente → se oculta.
SELECT pg_temp.lead('911', 40);
-- 40 días con cliente → se queda.
SELECT pg_temp.lead('912', 40, NULL, 'b0000000-0000-0000-0000-0000000000c1');
-- 40 días con seguimiento FUTURO → se queda.
SELECT pg_temp.lead('913', 40, NULL, NULL, now() + interval '3 days');
-- 40 días con seguimiento PASADO → se oculta.
SELECT pg_temp.lead('914', 40, NULL, NULL, now() - interval '3 days');
-- 10 días → no se toca.
SELECT pg_temp.lead('915', 10);
-- 70 días, ya oculta hace 40 → se borra, con su actividad y su donante.
SELECT pg_temp.lead('916', 70);
UPDATE idealista_leads SET expired_at = now() - interval '40 days' WHERE id = pg_temp.l('916');
INSERT INTO lead_activity (lead_id, kind, body) VALUES (pg_temp.l('916'), 'note', 'se borra con la solicitud');
SELECT pg_temp.lead('917', 75, NULL, NULL, NULL, '916');
-- 70 días, oculta, pero CON cliente (vinculado después) → nunca se borra.
SELECT pg_temp.lead('918', 70, NULL, 'b0000000-0000-0000-0000-0000000000c1');
UPDATE idealista_leads SET expired_at = now() - interval '40 days' WHERE id = pg_temp.l('918');

SELECT test_util.ok((SELECT count(*) FROM lead_inbox_facts WHERE id = pg_temp.l('916')) = 0
  AND (SELECT count(*) FROM lead_inbox_facts WHERE id = pg_temp.l('911')) = 1,
  'Vista · lo caducado no sale; lo vigente sí');

SELECT test_util.ok((lead_retention_sweep()) = '{"hidden": 2, "purged": 1, "purged_donors": 1}'::jsonb,
  'Barrido · oculta 2 (40 días sin cliente; seguimiento pasado), borra 1 y su donante');

SELECT test_util.ok(
  (SELECT expired_at IS NOT NULL FROM idealista_leads WHERE id = pg_temp.l('911'))
  AND (SELECT expired_at IS NULL FROM idealista_leads WHERE id = pg_temp.l('912'))
  AND (SELECT expired_at IS NULL FROM idealista_leads WHERE id = pg_temp.l('913'))
  AND (SELECT expired_at IS NOT NULL FROM idealista_leads WHERE id = pg_temp.l('914'))
  AND (SELECT expired_at IS NULL FROM idealista_leads WHERE id = pg_temp.l('915'))
  AND NOT EXISTS (SELECT 1 FROM idealista_leads WHERE id IN (pg_temp.l('916'), pg_temp.l('917')))
  AND NOT EXISTS (SELECT 1 FROM lead_activity WHERE lead_id = pg_temp.l('916'))
  AND EXISTS (SELECT 1 FROM idealista_leads WHERE id = pg_temp.l('918')),
  'Barrido · con cliente o seguimiento futuro no caduca; lo borrado se va con su actividad y su donante; con cliente nunca se borra');

SELECT test_util.ok((SELECT count(*) FROM lead_inbox_facts WHERE id IN (pg_temp.l('911'), pg_temp.l('914'))) = 0
  AND (SELECT count(*) FROM lead_inbox_facts WHERE id IN (pg_temp.l('912'), pg_temp.l('913'), pg_temp.l('915'))) = 3,
  'Vista · tras el barrido, las ocultas desaparecen de la bandeja');

-- Segundo barrido: nada nuevo (idempotente).
SELECT test_util.ok((lead_retention_sweep()) = '{"hidden": 0, "purged": 0, "purged_donors": 0}'::jsonb,
  'Barrido · repetirlo no hace nada');

SELECT test_util.expect_error('SELECT lead_retention_sweep(60, 30)', 'invalid_retention');
SELECT test_util.expect_error('SELECT lead_retention_sweep(0, 60)', 'invalid_retention');

-- Volver a escribir revive: la recepción pone expired_at a NULL cuando llega
-- un mensaje nuevo; aquí solo se comprueba que una revivida vuelve a la vista.
UPDATE idealista_leads SET expired_at = NULL WHERE id = pg_temp.l('911');
SELECT test_util.ok((SELECT count(*) FROM lead_inbox_facts WHERE id = pg_temp.l('911')) = 1,
  'Vista · una solicitud revivida vuelve a salir');

-- ─── 3 · Permisos ────────────────────────────────────────────────────────────
SET ROLE anon;
SELECT test_util.expect_error('SELECT lead_retention_sweep()', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT listings_for_code(''555001'')', 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error('SELECT lead_retention_sweep()', 'insufficient_privilege');
RESET ROLE;

SELECT 'test-solicitudes-retencion.sql: OK' AS resultado;
