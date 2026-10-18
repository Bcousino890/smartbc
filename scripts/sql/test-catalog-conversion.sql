-- SOLO PRUEBAS LOCALES (BCP-01 P4). Conversión de un automático antiguo a
-- selección fija (0213): vista previa, revalidación, lo que se conserva,
-- registro y deshacer. Datos sintéticos.
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set other '00000000-0000-0000-0000-0000000000a2'

INSERT INTO properties (id, slug, title, status, country, zone, subzone, operation, operations, price, created_at) VALUES
  ('c4000000-0000-0000-0000-000000000001', 'cv-1', 'CV 1', 'available', 'es', 'Salamanca', 'Recoletos', 'sale', '{sale}', 900000,  '2026-08-01'),
  ('c4000000-0000-0000-0000-000000000002', 'cv-2', 'CV 2', 'available', 'es', 'Salamanca', 'Recoletos', 'sale', '{sale}', 1000000, '2026-08-02'),
  ('c4000000-0000-0000-0000-000000000003', 'cv-3', 'CV 3', 'reserved',  'es', 'Salamanca', 'Recoletos', 'sale', '{sale}', 1100000, '2026-08-03'),
  ('c4000000-0000-0000-0000-000000000004', 'cv-4', 'CV 4 excluida', 'available', 'es', 'Salamanca', 'Recoletos', 'sale', '{sale}', 1200000, '2026-08-04'),
  ('c4000000-0000-0000-0000-000000000005', 'cv-5', 'CV 5 fuera (Retiro) incluida', 'available', 'es', 'Retiro', 'Ibiza', 'sale', '{sale}', 800000, '2026-08-05'),
  ('c4000000-0000-0000-0000-000000000006', 'cv-6', 'CV 6 vendida incluida', 'sold', 'es', 'Salamanca', 'Recoletos', 'sale', '{sale}', 950000, '2026-08-06'),
  ('c4000000-0000-0000-0000-000000000007', 'cv-7', 'CV 7 de la lista manual vieja', 'available', 'es', 'Tetuán', NULL, 'sale', '{sale}', 500000, '2026-08-07');
INSERT INTO property_photos (property_id, url, position, is_cover)
SELECT id, 'https://storage.example/' || slug || '-' || g || '.webp', g, g = 0 FROM properties, generate_series(0, 1) g WHERE slug LIKE 'cv-%';

SET ROLE service_role;
SELECT catalog_create(:'owner', 'Conversión', NULL) AS cat \gset
-- Lista manual guardada de antes (luego pasó a automático): cv-2 y cv-7.
SELECT catalog_add_property(:'owner', :'cat', 'c4000000-0000-0000-0000-000000000002');
SELECT catalog_add_property(:'owner', :'cat', 'c4000000-0000-0000-0000-000000000007');
SELECT public_key AS key_cv2 FROM catalog_items WHERE catalog_id = :'cat' AND property_id = 'c4000000-0000-0000-0000-000000000002' \gset
SELECT catalog_text_save_draft(:'owner', :'cat', 'c4000000-0000-0000-0000-000000000002', 'Texto de la vivienda 2.', NULL, NULL, 'manual', NULL);
SELECT catalog_set_criteria(:'owner', :'cat', '{"operation":"sale","zones":[{"kind":"barrio","name":"Recoletos"}],"sort":"price_asc","max":12}');
SELECT catalog_set_mode(:'owner', :'cat', 'auto', NULL);
SELECT catalog_adjust(:'owner', :'cat', 'c4000000-0000-0000-0000-000000000004', 'exclude');
SELECT catalog_adjust(:'owner', :'cat', 'c4000000-0000-0000-0000-000000000005', 'include');
RESET ROLE;
-- Una inclusión que hoy no aparece (vendida) — se guarda directamente: catalog_adjust no deja incluir vendidas.
INSERT INTO catalog_adjustments (catalog_id, property_id, kind) VALUES (:'cat', 'c4000000-0000-0000-0000-000000000006', 'include');
SET ROLE service_role;
SELECT catalog_set_cover(:'owner', :'cat', 'c4000000-0000-0000-0000-000000000003', NULL);
SELECT token AS tok FROM catalog_share_create(:'owner', :'cat', 30) \gset
SELECT catalog_group_create(:'owner', NULL, 'Grupo de prueba') AS grp \gset
SELECT catalog_group_set_member(:'owner', :'grp', :'cat', true);
SELECT catalog_set_contact(:'owner', :'cat', 'Fabricio Andree', '+34600000000', 'asesor');

SELECT (get_public_catalog(:'tok'))->>'fingerprint' AS fp0 \gset
SELECT (get_public_catalog(:'tok'))->'snapshot'->'items' AS items0 \gset
SELECT version AS v0, criteria AS crit0 FROM catalogs WHERE id = :'cat' \gset

-- ── Vista previa ────────────────────────────────────────────────────────────
SELECT catalog_conversion_preview(:'owner', :'cat') AS pv \gset
SELECT test_util.ok((SELECT array_agg(p.slug ORDER BY o) FROM jsonb_array_elements((:'pv'::jsonb)->'items') WITH ORDINALITY x(i, o) JOIN properties p ON p.id = (x.i->>'property_id')::uuid)
                    = ARRAY['cv-5', 'cv-1', 'cv-2', 'cv-3'],
  'vista previa: la lista efectiva en su orden (incluida a mano, sin la excluida ni la vendida)');
SELECT test_util.ok(((:'pv'::jsonb)->>'version')::bigint = :v0, 'vista previa: con la versión');
SELECT test_util.ok((:'pv'::jsonb)->'dropped_inclusions' = '["c4000000-0000-0000-0000-000000000006"]', 'vista previa: la inclusión vendida no pasa (se avisa)');
SELECT test_util.ok((:'pv'::jsonb)->'archived_manual' = '["c4000000-0000-0000-0000-000000000007"]', 'vista previa: la fila de la lista manual vieja que se archiva');
SELECT test_util.ok(((:'pv'::jsonb)->'items'->2->>'public_key') = :'key_cv2', 'vista previa: la vivienda que ya tenía clave la conserva');
SELECT test_util.expect_error(format('SELECT catalog_conversion_preview(%L, %L)', :'other', :'cat'), 'forbidden');
SELECT ARRAY(SELECT (x->>'property_id')::uuid FROM jsonb_array_elements((:'pv'::jsonb)->'items') WITH ORDINALITY x(x, o) ORDER BY o) AS ids \gset

-- ── Revalidación: nada se convierte en silencio ─────────────────────────────
SELECT test_util.expect_error(format('SELECT catalog_convert_explicit(%L, %L, %s, %L)', :'owner', :'cat', :v0 - 1, :'ids'), 'selection_changed');
SELECT test_util.expect_error(format('SELECT catalog_convert_explicit(%L, %L, %s, %L)', :'owner', :'cat', :v0,
  ARRAY['c4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000005', 'c4000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000003']::uuid[]), 'selection_changed');
-- Cambia la lista entre la vista previa y la confirmación (se vende una).
RESET ROLE;
UPDATE properties SET status = 'sold' WHERE slug = 'cv-1';
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_convert_explicit(%L, %L, %s, %L)', :'owner', :'cat', :v0, :'ids'), 'selection_changed');
SELECT test_util.ok((SELECT mode FROM catalogs WHERE id = :'cat') = 'auto' AND NOT EXISTS (SELECT 1 FROM catalog_conversions WHERE catalog_id = :'cat'),
  'con la lista cambiada no se convierte nada (sigue automático, sin registro)');
RESET ROLE;
UPDATE properties SET status = 'available' WHERE slug = 'cv-1';
SET ROLE service_role;
SELECT test_util.expect_error(format('SELECT catalog_convert_explicit(%L, %L, %s, %L)', :'other', :'cat', :v0, :'ids'), 'forbidden');

-- ── Convertir ───────────────────────────────────────────────────────────────
SELECT catalog_convert_explicit(:'owner', :'cat', :v0, :'ids') AS cv \gset
SELECT test_util.ok(((:'cv'::jsonb)->>'version')::bigint = :v0 + 1 AND ((:'cv'::jsonb)->>'count')::int = 4, 'convertida: versión nueva y 4 viviendas');
SELECT test_util.ok((SELECT mode FROM catalogs WHERE id = :'cat') = 'manual', 'ahora es selección fija (modo manual)');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp0', 'el lector ve LO MISMO: misma huella');
SELECT test_util.ok((get_public_catalog(:'tok'))->'snapshot'->'items' = :'items0'::jsonb, 'mismas viviendas, claves, orden, textos y fotos en la instantánea');
SELECT test_util.ok((SELECT array_agg(public_key ORDER BY position) FROM catalog_items WHERE catalog_id = :'cat')
                    = ARRAY(SELECT x->>'public_key' FROM jsonb_array_elements((:'pv'::jsonb)->'items') WITH ORDINALITY x(x, o) ORDER BY o),
  'las claves son las de la vista previa');
SELECT test_util.ok((SELECT criteria FROM catalogs WHERE id = :'cat') = :'crit0'::jsonb, 'criterios intactos (la operación la leen el lector y el PDF)');
SELECT test_util.ok((SELECT count(*) FROM catalog_adjustments WHERE catalog_id = :'cat') = 3, 'ajustes conservados (inertes)');
SELECT test_util.ok((SELECT cover_property_id FROM catalogs WHERE id = :'cat') = 'c4000000-0000-0000-0000-000000000003', 'portada intacta');
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_texts WHERE catalog_id = :'cat' AND property_id = 'c4000000-0000-0000-0000-000000000002'), 'texto intacto');
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_group_members WHERE catalog_id = :'cat' AND group_id = :'grp'), 'grupo de la HOME intacto');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'valid' = 'true' AND (SELECT contact_name FROM catalogs WHERE id = :'cat') = 'Fabricio Andree', 'enlace y contacto intactos');
SELECT test_util.ok((SELECT previous_items @> '[{"property_id":"c4000000-0000-0000-0000-000000000007"}]' AND jsonb_array_length(adjustments) = 3
                       AND criteria = :'crit0'::jsonb AND from_version = :v0 FROM catalog_conversions WHERE catalog_id = :'cat'),
  'registro: lista manual vieja, ajustes, criterios y versión, para poder volver atrás');
SELECT test_util.expect_error(format('SELECT catalog_conversion_preview(%L, %L)', :'owner', :'cat'), 'catalog_manual');
SELECT test_util.expect_error(format('SELECT catalog_convert_explicit(%L, %L, %s, %L)', :'owner', :'cat', :v0 + 1, :'ids'), 'catalog_manual');
-- Ya es una selección fija normal: se ordena, se añade y se quita.
SELECT test_util.ok(catalog_reorder(:'owner', :'cat', (SELECT array_agg(property_id ORDER BY position DESC) FROM catalog_items WHERE catalog_id = :'cat')) > 0, 'se puede ordenar a mano');
SELECT test_util.ok(catalog_add_property(:'owner', :'cat', 'c4000000-0000-0000-0000-000000000007') > 0, 'y añadir');

-- ── Un catálogo archivado no se convierte ───────────────────────────────────
SELECT catalog_create(:'owner', 'Auto archivado', NULL) AS cat2 \gset
SELECT catalog_set_criteria(:'owner', :'cat2', '{"operation":"sale","zones":[{"kind":"barrio","name":"Recoletos"}],"sort":"price_asc","max":12}');
SELECT catalog_set_mode(:'owner', :'cat2', 'auto', NULL);
SELECT catalog_set_status(:'owner', :'cat2', 'archived');
SELECT version AS v2 FROM catalogs WHERE id = :'cat2' \gset
SELECT test_util.expect_error(format('SELECT catalog_convert_explicit(%L, %L, %s, %L)', :'owner', :'cat2', :v2, '{}'), 'catalog_archived');

-- Permisos de ejecución.
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT catalog_conversion_preview(%L, %L)', :'owner', :'cat'), 'insufficient_privilege');
SELECT test_util.expect_error('SELECT count(*) FROM catalog_conversions', 'insufficient_privilege');
RESET ROLE;
-- Guardado para el deshacer (siguiente fichero).
CREATE TABLE IF NOT EXISTS test_util.carry (k text PRIMARY KEY, v text);
INSERT INTO test_util.carry VALUES ('cv_cat', :'cat'), ('cv_tok', :'tok'), ('cv_fp_auto', :'fp0')
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
SELECT 'test-catalog-conversion.sql: OK' AS resultado;
