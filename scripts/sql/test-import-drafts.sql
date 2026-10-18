-- SOLO PRUEBAS LOCALES (BCP-01 P5). Prueba 0214 contra el Postgres temporal:
-- permisos, creación de la ficha UNA vez, valores forzados (disponible, sin
-- publicar, alertas apagadas), duplicados (clave, usar existente, actualizar
-- con updated_at), fotos idempotentes y pasos. Datos sintéticos.
\set ON_ERROR_STOP 1
\set fab '00000000-0000-0000-0000-0000000000f1'
\set other '00000000-0000-0000-0000-0000000000a2'

INSERT INTO agencies (id, name, slug) VALUES
  ('b5000000-0000-0000-0000-0000000000a1', 'Portales externos', 'portales-externos'),
  ('b5000000-0000-0000-0000-0000000000a2', 'Level', 'level')
ON CONFLICT DO NOTHING;
INSERT INTO agency_feeds (agency_id) VALUES ('b5000000-0000-0000-0000-0000000000a2') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION test_util.draft(p_actor uuid, p_key text, p_notify boolean DEFAULT false, p_agency uuid DEFAULT 'b5000000-0000-0000-0000-0000000000a1')
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO property_import_drafts (created_by, source_kind, source_url, request_key, agency_id, notify_clients)
  VALUES (p_actor, 'link', 'https://www.idealista.com/inmueble/1/', p_key, p_agency, p_notify) RETURNING id
$$;
CREATE OR REPLACE FUNCTION test_util.row(p_ext text, p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('title', 'Piso importado', 'zone', 'Salamanca', 'subzone', 'Recoletos', 'price', 3000,
    'operation', 'rent', 'stay', 'long', 'bedrooms', 2, 'bathrooms', 1, 'square_meters', 80, 'address', 'Calle Falsa 1',
    'features', '["Ascensor","Terraza"]'::jsonb, 'external_id', p_ext, 'slug', p_slug, 'source_url', 'https://www.idealista.com/inmueble/1/',
    'latitude', 40.42, 'longitude', -3.68, 'location_precision', 'approximate',
    -- Columnas que NO se deben poder forzar desde aquí:
    'status', 'sold', 'published_web', true, 'country', 'cl', 'new_listing_alerts_suppressed', false)
$$;

-- ── Permisos ────────────────────────────────────────────────────────────────
SET ROLE authenticated;
SELECT test_util.expect_error('SELECT count(*) FROM property_import_drafts', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT import_draft_create_property(%L, gen_random_uuid(), 1, %L)', :'fab', '{}'), 'insufficient_privilege');
RESET ROLE;
SET ROLE anon;
SELECT test_util.expect_error('SELECT count(*) FROM property_import_drafts', 'insufficient_privilege');
RESET ROLE;
SELECT test_util.ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'property_import_drafts'), 'RLS activada (sin políticas)');
SELECT test_util.ok(EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'property-import-drafts' AND NOT public), 'bucket privado');
SELECT test_util.ok((SELECT count(*) FROM properties WHERE new_listing_alerts_suppressed) = 0, 'columna nueva: false en todas las fichas existentes');

SET ROLE service_role;
SELECT test_util.draft(:'fab', 'req-aaaaaaaa') AS d1 \gset
SELECT test_util.expect_error(format('INSERT INTO property_import_drafts (created_by, source_kind, request_key) VALUES (%L, %L, %L)', :'fab', 'link', 'req-aaaaaaaa'), 'unique_violation');

-- ── Crear la ficha ──────────────────────────────────────────────────────────
SELECT test_util.expect_error(format('SELECT import_draft_create_property(%L, %L, 1, %L)', :'other', :'d1', test_util.row('idealista-1', 'piso-importado-d1')), 'draft_not_found');
SELECT test_util.expect_error(format('SELECT import_draft_create_property(%L, %L, 7, %L)', :'fab', :'d1', test_util.row('idealista-1', 'piso-importado-d1')), 'draft_changed');
SELECT test_util.expect_error(format('SELECT import_draft_create_property(%L, %L, 1, %L)', :'fab', :'d1', test_util.row('idealista-1', 'piso-importado-d1') || '{"title":" "}'), 'title_required');
SELECT test_util.expect_error(format('SELECT import_draft_create_property(%L, %L, 1, %L)', :'fab', :'d1', test_util.row('idealista-1', 'piso-importado-d1') || '{"price":0}'), 'price_required');
SELECT test_util.expect_error(format('SELECT import_draft_create_property(%L, %L, 1, %L)', :'fab', :'d1', test_util.row('idealista-1', 'Piso Raro!')), 'slug_invalid');
SELECT test_util.ok((SELECT count(*) FROM properties WHERE slug = 'piso-importado-d1') = 0, 'los errores no crean nada');

SELECT import_draft_create_property(:'fab', :'d1', 1, test_util.row('idealista-1', 'piso-importado-d1')) AS r1 \gset
SELECT test_util.ok((:'r1'::jsonb)->>'created' = 'true' AND (:'r1'::jsonb)->>'slug' = 'piso-importado-d1', 'crea la ficha');
SELECT (:'r1'::jsonb)->>'property_id' AS p1 \gset
SELECT test_util.ok((SELECT status::text = 'available' AND NOT published_web AND new_listing_alerts_suppressed AND country = 'es'
                       AND source::text = 'manual' AND archived_at IS NULL AND agency_id = 'b5000000-0000-0000-0000-0000000000a1'
                     FROM properties WHERE id = :'p1'),
  'forzado en el servidor: disponible, SIN publicar, alertas apagadas, España, source manual (lo que intente el navegador da igual)');
SELECT test_util.ok((SELECT bc_reference IS NOT NULL AND property_reference IS NOT NULL AND features = '{Ascensor,Terraza}'
                       AND stay::text = 'long' AND operation::text = 'rent' AND latitude = 40.42 FROM properties WHERE id = :'p1'),
  'valores por defecto (BC, PROP) respetados y campos copiados');
SELECT test_util.ok((SELECT state = 'created' AND property_id = :'p1' AND duplicate_choice = 'new' AND version = 2 FROM property_import_drafts WHERE id = :'d1'),
  'borrador: creado, con su ficha y versión nueva');
-- Reintento / doble clic: la MISMA ficha, sin crear otra (aunque mande otra versión).
SELECT import_draft_create_property(:'fab', :'d1', 1, test_util.row('idealista-1', 'piso-importado-d1')) AS r1b \gset
SELECT test_util.ok((:'r1b'::jsonb)->>'property_id' = :'p1' AND (:'r1b'::jsonb)->>'created' = 'false', 'reintento: devuelve la misma ficha');
SELECT test_util.ok((SELECT count(*) FROM properties WHERE external_id = 'idealista-1') = 1, 'reintento: una sola ficha');

-- Con «Avisar por correo»: alertas encendidas.
SELECT test_util.draft(:'fab', 'req-notify01', true) AS d2 \gset
SELECT (import_draft_create_property(:'fab', :'d2', 1, test_util.row('idealista-2', 'piso-notify-d2'))->>'property_id') AS p2 \gset
SELECT test_util.ok((SELECT NOT new_listing_alerts_suppressed FROM properties WHERE id = :'p2'), 'con «Avisar por correo» marcado, no se suprimen');

-- Misma agencia + referencia: duplicate_key, sin crear nada.
SELECT test_util.draft(:'fab', 'req-dupkey01') AS d3 \gset
SELECT test_util.expect_error(format('SELECT import_draft_create_property(%L, %L, 1, %L)', :'fab', :'d3', test_util.row('idealista-1', 'otro-slug-d3')), 'duplicate_key');
SELECT test_util.ok((SELECT state = 'review' AND property_id IS NULL FROM property_import_drafts WHERE id = :'d3'), 'duplicate_key: el borrador sigue en revisión');
-- Otra agencia con la misma referencia sí se puede (índice por agencia, 0016).
SELECT test_util.draft(:'fab', 'req-otheragn', false, 'b5000000-0000-0000-0000-0000000000a2') AS d4 \gset
SELECT test_util.ok((import_draft_create_property(:'fab', :'d4', 1, test_util.row('link:idealista:1', 'piso-level-d4'))->>'created') = 'true',
  'colaboradora con referencia con espacio de nombres: se crea');

-- ── Usar la existente (no escribe en ella) ──────────────────────────────────
SELECT updated_at AS u1 FROM properties WHERE id = :'p1' \gset
SELECT test_util.ok((import_draft_use_existing(:'fab', :'d3', 1, :'p1')->>'choice') = 'existing', 'usar la existente');
SELECT test_util.ok((SELECT updated_at FROM properties WHERE id = :'p1') = :'u1'::timestamptz, 'usar la existente: no toca la ficha');
SELECT test_util.expect_error(format('SELECT import_draft_attach_photo(%L, %L, %L, 0, true)', :'fab', :'d3', 'https://x/a.webp'), 'draft_without_new_property');

-- ── Actualizar la existente (con updated_at) ────────────────────────────────
SELECT test_util.draft(:'fab', 'req-update01') AS d5 \gset
RESET ROLE;
UPDATE properties SET status = 'reserved', published_web = true WHERE id = :'p1';
SET ROLE service_role;
SELECT updated_at AS u2, created_at AS c2 FROM properties WHERE id = :'p1' \gset
SELECT test_util.expect_error(format('SELECT import_draft_update_existing(%L, %L, 1, %L, %L, %L)', :'fab', :'d5', :'p1', '2020-01-01', '{"price": 3500}'), 'property_changed');
SELECT test_util.expect_error(format('SELECT import_draft_update_existing(%L, %L, 1, %L, %L, %L)', :'fab', :'d5', :'p1', :'u2', '{"status": "available"}'), 'invalid_fields');
SELECT test_util.ok((import_draft_update_existing(:'fab', :'d5', 1, :'p1', :'u2', '{"price": 3500, "title": "Título nuevo"}')->>'choice') = 'update', 'actualizar la existente');
SELECT test_util.ok((SELECT price = 3500 AND title = 'Título nuevo' AND zone = 'Salamanca' AND status::text = 'reserved' AND published_web
                       AND created_at = :'c2'::timestamptz AND new_listing_alerts_suppressed FROM properties WHERE id = :'p1'),
  'actualizar: solo los campos pedidos; estado, publicación, created_at y supresión intactos');

-- ── Fotos ───────────────────────────────────────────────────────────────────
SELECT test_util.draft(:'fab', 'req-photos01') AS d6 \gset
SELECT import_draft_add_photo(:'fab', :'d6', jsonb_build_object('sha', repeat('a', 64), 'path', 'drafts/x/' || repeat('a', 64) || '.webp', 'w', 1600, 'h', 1200)) AS ph1 \gset
SELECT import_draft_add_photo(:'fab', :'d6', jsonb_build_object('sha', repeat('a', 64), 'path', 'drafts/x/otra.webp')) AS ph1b \gset
SELECT test_util.ok((:'ph1'::jsonb)->>'id' = (:'ph1b'::jsonb)->>'id' AND (SELECT jsonb_array_length(photos) FROM property_import_drafts WHERE id = :'d6') = 1,
  'la misma foto (mismo hash) no se repite');
SELECT test_util.expect_error(format('SELECT import_draft_add_photo(%L, %L, %L)', :'fab', :'d6', '{"sha":"zz"}'), 'invalid_photo');
SELECT test_util.expect_error(format('SELECT import_draft_add_photo(%L, %L, %L)', :'other', :'d6', jsonb_build_object('sha', repeat('b', 64))), 'draft_not_found');
SELECT version AS v6 FROM property_import_drafts WHERE id = :'d6' \gset
SELECT (import_draft_create_property(:'fab', :'d6', :v6, test_util.row('idealista-6', 'piso-fotos-d6'))->>'property_id') AS p6 \gset
SELECT test_util.ok(import_draft_attach_photo(:'fab', :'d6', 'https://store/imports/d6/0.webp', 0, true), 'foto 1 a la ficha');
SELECT test_util.ok(NOT import_draft_attach_photo(:'fab', :'d6', 'https://store/imports/d6/0.webp', 0, true), 'misma foto otra vez: no se repite');
SELECT test_util.ok(import_draft_attach_photo(:'fab', :'d6', 'https://store/imports/d6/1.webp', 1, false), 'foto 2');
SELECT test_util.ok((SELECT count(*) FROM property_photos WHERE property_id = :'p6') = 2 AND (SELECT cover_photo_url FROM properties WHERE id = :'p6') = 'https://store/imports/d6/0.webp',
  'dos fotos y la portada');
SELECT test_util.expect_error(format('SELECT import_draft_add_photo(%L, %L, %L)', :'fab', :'d6', jsonb_build_object('sha', repeat('c', 64))), 'draft_not_reviewable');

-- ── Pasos ───────────────────────────────────────────────────────────────────
SELECT import_draft_set_step(:'fab', :'d6', 'photos', '{"status":"ok","done":2,"total":2}');
SELECT import_draft_set_step(:'fab', :'d6', 'catalog', '{"status":"failed","error":"catalog_full"}');
SELECT test_util.ok((SELECT state FROM property_import_drafts WHERE id = :'d6') = 'created', 'un paso fallido: sigue «creado» (se puede reintentar)');
SELECT import_draft_set_step(:'fab', :'d6', 'catalog', '{"status":"ok"}');
SELECT test_util.ok((SELECT state FROM property_import_drafts WHERE id = :'d6') = 'done', 'todos los pasos bien: «hecho»');
SELECT test_util.expect_error(format('SELECT import_draft_set_step(%L, %L, %L, %L)', :'fab', :'d6', 'otro', '{"status":"ok"}'), 'invalid_step');
SELECT test_util.expect_error(format('SELECT import_draft_set_step(%L, %L, %L, %L)', :'fab', :'d1', 'photos', '{"status":"raro"}'), 'invalid_step');

-- ── Descartado ──────────────────────────────────────────────────────────────
SELECT test_util.draft(:'fab', 'req-discard1') AS d7 \gset
UPDATE property_import_drafts SET state = 'discarded' WHERE id = :'d7';
SELECT test_util.expect_error(format('SELECT import_draft_create_property(%L, %L, 1, %L)', :'fab', :'d7', test_util.row('idealista-7', 'piso-d7')), 'draft_not_reviewable');
SELECT test_util.expect_error(format('UPDATE property_import_drafts SET state = %L WHERE id = %L', 'created', :'d7'), 'check_violation');

-- El borrador nunca es una ficha: no hay filas de properties por borradores en revisión.
SELECT test_util.ok((SELECT count(*) FROM property_import_drafts d JOIN properties p ON p.id = d.property_id WHERE d.state = 'review') = 0,
  'un borrador en revisión no tiene ficha');
RESET ROLE;

SELECT 'test-import-drafts.sql: OK' AS resultado;
