-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-21-bcp-01-ampliacion-textos-idiomas,
-- traducción con precios). Tests de 0229 en el Postgres temporal. Sintéticos.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'

SET ROLE service_role;
-- 1. En lo traducido, la base de datos ya no bloquea un precio (caso real).
SELECT test_util.ok(catalog_tr_blocker('{"t": "Calle de Padilla, 24 Kiralık Daire", "b": [{"k": "intro", "x": "Kısa süreli kiralama: 5.500 €/ay."}, {"k": "building", "x": "Opsiyonel garaj yeri, aylık ek 150 € ücrete tabidir."}]}'::jsonb) IS NULL,
  'bloques con el precio del original: sin bloqueo en la base de datos');
SELECT test_util.ok(catalog_tr_blocker('{"t": "Catalog", "i": "Rent 2,000 € per month"}'::jsonb) IS NULL, 'introducción del catálogo con importe: sin bloqueo');
-- 2. El contacto sigue bloqueando siempre.
SELECT test_util.ok(catalog_tr_blocker('{"t": "X", "b": [{"k": "intro", "x": "Arayın: 612 345 678"}]}'::jsonb) = 'text_has_contact', 'teléfono en un bloque: bloqueado');
SELECT test_util.ok(catalog_tr_blocker('{"t": "Bilgi: info@ejemplo.com", "b": []}'::jsonb) = 'text_has_contact', 'correo en el título: bloqueado');
SELECT test_util.ok(catalog_tr_blocker('{"t": "X", "i": "www.ejemplo.com"}'::jsonb) = 'text_has_contact', 'web en la introducción: bloqueado');
SELECT test_util.ok(catalog_tr_text_blocker('150 €') IS NULL AND catalog_tr_text_blocker('612 345 678') = 'text_has_contact' AND catalog_tr_text_blocker(NULL) IS NULL,
  'catalog_tr_text_blocker: solo contacto');
-- 3. La regla de publicar textos en ESPAÑOL no cambia (0197).
SELECT test_util.ok(catalog_text_blocker('Alquiler: 5.500 €/mes') = 'text_has_price', 'el español sigue bloqueando «€» al publicar (sin cambios)');
-- 4. Características traducidas con importe: se guardan; con contacto, no.
SELECT catalog_tr_feature_save(:'owner', 'tr', 'Plaza de garaje: 150 mensuales', 'Garaj yeri: aylık 150 €');
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_tr_features WHERE es = 'Plaza de garaje: 150 mensuales' AND lang = 'tr' AND tr = 'Garaj yeri: aylık 150 €'),
  'característica con importe: guardada');
SELECT test_util.expect_error(format('SELECT catalog_tr_feature_save(%L, %L, %L, %L)', :'owner', 'tr', 'Contacto', 'İletişim 612 345 678'), 'text_has_contact');
RESET ROLE;
-- 5. Permisos sin cambios.
SET ROLE anon;
SELECT test_util.expect_error('SELECT catalog_tr_text_blocker(''x'')', 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error('SELECT catalog_tr_blocker(''{}''::jsonb)', 'insufficient_privilege');
RESET ROLE;
