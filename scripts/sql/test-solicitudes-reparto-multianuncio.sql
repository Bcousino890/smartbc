-- ============================================================================
-- SOLO PRUEBAS LOCALES. DEFENSIVO: NO representa el esquema actual.
--
-- En el esquema real un inmueble tiene UN anuncio (idealista_listings.
-- property_id es único desde 0017). Estas pruebas QUITAN esa unicidad en su
-- propia base para cubrir la lógica de 0237 que elige entre varios anuncios
-- del mismo inmueble (H1/H1b), por si algún día el catálogo los admite. Que
-- pasen no demuestra nada sobre el flujo actual: eso lo cubre
-- test-solicitudes-reparto.sql con las restricciones reales.
-- ============================================================================
\set ON_ERROR_STOP 1
ALTER TABLE idealista_listings DROP CONSTRAINT idealista_listings_property_id_key;

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-00000000000a', 'admin@test'),
  ('b0000000-0000-0000-0000-00000000000a', 'jaime@test');
INSERT INTO profiles (id, role, full_name, email, country) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'admin', 'Admin', 'admin@test', 'es'),
  ('b0000000-0000-0000-0000-00000000000a', 'advisor', 'Jaime', 'jaime@test', 'es');
INSERT INTO properties (id, slug, title, country, bc_reference) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'castello', 'Castelló', 'es', 'bc-1'),
  ('d0000000-0000-0000-0000-000000000005', 'castellana', 'Castellana', 'es', 'bc-5');
INSERT INTO idealista_listings (id, property_id, reference_code, idealista_property_id, is_inspo) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'BC-100', '111', true),
  ('e0000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000001', 'BC-101', '112', true),
  ('e0000000-0000-0000-0000-000000000051', 'd0000000-0000-0000-0000-000000000005', 'BC-500', '551', true),
  ('e0000000-0000-0000-0000-000000000052', 'd0000000-0000-0000-0000-000000000005', 'BC-500', '552', true),
  ('e0000000-0000-0000-0000-000000000053', 'd0000000-0000-0000-0000-000000000005', 'BC-503', '553', true);

CREATE OR REPLACE FUNCTION pg_temp.lead(p_id text, p_ref text, p_code text, p_prop text DEFAULT NULL, p_list text DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO idealista_leads (id, conversation_id, name, phone, property_ref, idealista_code, matched_property_id, matched_listing_id)
  VALUES (('f0000000-0000-0000-0000-' || lpad(p_id, 12, '0'))::uuid, p_id, 'Lead ' || p_id, '+34 655 000 ' || p_id,
          p_ref, p_code, p_prop::uuid, p_list::uuid)
  RETURNING id
$$;
CREATE OR REPLACE FUNCTION pg_temp.l(p_id text) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('f0000000-0000-0000-0000-' || lpad(p_id, 12, '0'))::uuid
$$;

SELECT pg_temp.lead('901', NULL, '112', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001');
SELECT resolve_lead_link(pg_temp.l('901'), true);
SELECT test_util.ok((SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('901')) = 'e0000000-0000-0000-0000-000000000011',
  'Defensivo · dos anuncios del mismo inmueble: se enlaza el del Cod. recibido');
SELECT pg_temp.lead('902', 'bc-1', NULL, 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000011');
SELECT resolve_lead_link(pg_temp.l('902'), true);
SELECT test_util.ok((SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('902')) = 'e0000000-0000-0000-0000-000000000011',
  'Defensivo · referencia de la ficha sin anuncio concreto: se conserva el guardado del mismo inmueble');
SELECT pg_temp.lead('903', 'BC-500', '552', 'd0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000051');
SELECT resolve_lead_link(pg_temp.l('903'), true);
SELECT test_util.ok((SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('903')) = 'e0000000-0000-0000-0000-000000000052',
  'Defensivo · Ref. compartida en el inmueble + Cod. único: el anuncio del código');
SELECT pg_temp.lead('904', 'BC-503', '551', 'd0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000053');
SELECT test_util.ok(resolve_lead_link(pg_temp.l('904'), true) = 'conflict'
  AND (SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('904')) = 'e0000000-0000-0000-0000-000000000053',
  'Defensivo · Ref. y Cod. de anuncios distintos del mismo inmueble: conflicto, sin reescribir');
SELECT pg_temp.lead('905', 'BC-500', NULL);
SELECT resolve_lead_link(pg_temp.l('905'), true);
SELECT test_util.ok((SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('905')) IS NULL
  AND (SELECT matched_property_id FROM idealista_leads WHERE id = pg_temp.l('905')) = 'd0000000-0000-0000-0000-000000000005',
  'Defensivo · solo la referencia compartida en el inmueble: inmueble exacto, ningún anuncio afirmado');
\echo 'test-solicitudes-reparto-multianuncio.sql (defensivo): OK'
