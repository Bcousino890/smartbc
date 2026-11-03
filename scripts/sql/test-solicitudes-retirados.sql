-- SOLO PRUEBAS LOCALES. 0241: historial de los ids de la API y anuncio
-- retirado en la vista. Corre después de test-solicitudes-retencion.sql, con
-- 0241 aplicada DOS veces.
\set ON_ERROR_STOP 1

CREATE OR REPLACE FUNCTION pg_temp.l(p_id text) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('f0000000-0000-0000-0000-' || lpad('e' || p_id, 12, '0'))::uuid
$$;
CREATE OR REPLACE FUNCTION pg_temp.lead(p_id text, p_code text, p_list uuid) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO idealista_leads (id, conversation_id, name, phone, idealista_code, matched_listing_id)
  VALUES (pg_temp.l(p_id), 'ret41-' || p_id, 'Lead ' || p_id, '6008' || lpad(p_id, 5, '0'), p_code, p_list)
  RETURNING id
$$;

-- ─── 1 · Historial de ids de la API ──────────────────────────────────────────
INSERT INTO idealista_listings (id, property_id, reference_code, idealista_property_id, is_inspo, api_property_id, photo_ids, idealista_state, api_state)
VALUES ('e0000000-0000-0000-0000-000000000941', NULL, 'BC-RET-1', NULL, true, 661001, '{}', 'published', 'active');

SELECT test_util.ok(EXISTS (SELECT 1 FROM idealista_listing_codes
  WHERE listing_id = 'e0000000-0000-0000-0000-000000000941' AND idealista_property_id = '661001' AND source = 'api' AND valid_to IS NULL),
  '0241 · al publicar por API, su id entra en el historial');

-- Se borra y se vuelve a publicar: id nuevo. El antiguo queda cerrado.
UPDATE idealista_listings SET api_property_id = 661002 WHERE id = 'e0000000-0000-0000-0000-000000000941';
SELECT test_util.ok(
  (SELECT valid_to IS NOT NULL FROM idealista_listing_codes WHERE listing_id = 'e0000000-0000-0000-0000-000000000941' AND idealista_property_id = '661001')
  AND (SELECT valid_to IS NULL FROM idealista_listing_codes WHERE listing_id = 'e0000000-0000-0000-0000-000000000941' AND idealista_property_id = '661002'),
  '0241 · republicado con otro id: el antiguo se cierra y el nuevo queda vigente');

-- Una solicitud que trajo el id ANTIGUO sigue encontrando su anuncio.
SELECT pg_temp.lead('1', '661001', NULL);
SELECT route_lead(pg_temp.l('1'));
SELECT test_util.ok(
  (SELECT property_link_method FROM idealista_leads WHERE id = pg_temp.l('1')) = 'code'
  AND (SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('1')) = 'e0000000-0000-0000-0000-000000000941',
  '0241 · el id antiguo de la API sigue llevando al mismo anuncio');

-- El clon también entra en el historial.
UPDATE idealista_listings SET api_clone_property_id = 661003 WHERE id = 'e0000000-0000-0000-0000-000000000941';
SELECT test_util.ok(EXISTS (SELECT 1 FROM idealista_listing_codes
  WHERE listing_id = 'e0000000-0000-0000-0000-000000000941' AND idealista_property_id = '661003' AND source = 'api'),
  '0241 · el id del clon también se guarda');

-- ─── 2 · Anuncio retirado en la vista ────────────────────────────────────────
SELECT test_util.ok((SELECT listing_retired FROM lead_inbox_facts WHERE id = pg_temp.l('1')) = false,
  'Vista · anuncio publicado: no retirado');

UPDATE idealista_listings SET api_state = 'inactive' WHERE id = 'e0000000-0000-0000-0000-000000000941';
SELECT test_util.ok((SELECT listing_retired FROM lead_inbox_facts WHERE id = pg_temp.l('1')) = true,
  'Vista · dado de baja por la API: retirado');

UPDATE idealista_listings SET api_state = 'active', idealista_state = 'archived', archived_at = now()
 WHERE id = 'e0000000-0000-0000-0000-000000000941';
SELECT test_util.ok((SELECT listing_retired FROM lead_inbox_facts WHERE id = pg_temp.l('1')) = true,
  'Vista · archivado en el CRM: retirado');

UPDATE idealista_listings SET idealista_state = 'published', archived_at = NULL
 WHERE id = 'e0000000-0000-0000-0000-000000000941';
SELECT test_util.ok((SELECT listing_retired FROM lead_inbox_facts WHERE id = pg_temp.l('1')) = false,
  'Vista · vuelto a publicar: deja de estar retirado');

-- Solo ficha propia: manda su archivo.
INSERT INTO properties (id, slug, title, country, bc_reference) VALUES
  ('d0000000-0000-0000-0000-000000000942', 'ret-prop', 'Ficha retirada', 'es', 'bc-ret-2');
INSERT INTO idealista_leads (id, conversation_id, name, phone, matched_property_id)
VALUES (pg_temp.l('2'), 'ret41-2', 'Lead 2', '600800002', 'd0000000-0000-0000-0000-000000000942');
UPDATE properties SET archived_at = now() WHERE id = 'd0000000-0000-0000-0000-000000000942';
SELECT test_util.ok((SELECT listing_retired FROM lead_inbox_facts WHERE id = pg_temp.l('2')) = true,
  'Vista · ficha propia archivada: retirado');

-- Sin anuncio identificado: no retirado (no hay nada que retirar).
INSERT INTO idealista_leads (id, conversation_id, name, phone) VALUES (pg_temp.l('3'), 'ret41-3', 'Lead 3', '600800003');
SELECT test_util.ok((SELECT listing_retired FROM lead_inbox_facts WHERE id = pg_temp.l('3')) = false,
  'Vista · sin anuncio: no retirado');

SELECT 'test-solicitudes-retirados.sql: OK' AS resultado;
