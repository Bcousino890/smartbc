-- ============================================================================
-- SOLO PRUEBAS LOCALES (expediente 2026-10-21-bcp-01-ampliacion-textos-idiomas,
-- PR2). Tests de 0220 en el Postgres temporal. Datos 100 % sintéticos.
-- ============================================================================
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set staff '00000000-0000-0000-0000-0000000000a2'
\set h2 '00000000-0000-0000-0000-0000000000b8'
\set p1 '10000000-0000-0000-0000-000000000001'
\set p2 '10000000-0000-0000-0000-000000000002'
SELECT v AS cat FROM test_util.carry WHERE k = 't20_cat' \gset
SELECT v AS tok FROM test_util.carry WHERE k = 't20_tok' \gset
SELECT v AS fp0 FROM test_util.carry WHERE k = 't20_fp' \gset

CREATE OR REPLACE FUNCTION test_util.t_area(p_tok text, p_slug text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements((get_public_catalog(p_tok))->'snapshot'->'items') x WHERE x->>'slug' = p_slug
$$;
GRANT EXECUTE ON FUNCTION test_util.t_area(text, text) TO service_role;
INSERT INTO auth.users (id, email) VALUES (:'h2', 'home.dos@ejemplo.test');
INSERT INTO profiles (id, role, full_name, email) VALUES (:'h2', 'admin', 'Home Dos', 'home.dos@ejemplo.test');
INSERT INTO home_owners (profile_id) VALUES (:'h2');
SELECT zone, subzone, address FROM properties WHERE id = :'p1' \gset p1_

-- 1. Registro.
SELECT test_util.ok((SELECT count(*) FROM catalog_areas) = 165 AND (SELECT count(*) FROM catalog_areas WHERE level = 'distrito') = 21, 'registro: 21 distritos y 144 barrios');
SELECT test_util.ok((SELECT district_id = 'madrid/salamanca' AND level = 'barrio' FROM catalog_areas WHERE id = 'madrid/salamanca/recoletos'), 'Recoletos es barrio de Salamanca con identidad estable');
SELECT test_util.ok((SELECT official_id = 'madrid/centro/justicia' FROM catalog_areas WHERE id = 'madrid/centro/chueca'), 'Chueca apunta a su barrio oficial (Justicia)');
SELECT test_util.ok((SELECT 'aguilas' = ANY (terms) FROM catalog_areas WHERE id = 'madrid/latina/las-aguilas') AND NOT EXISTS (SELECT 1 FROM catalog_areas WHERE id = 'madrid/latina/aguilas'),
  'casi-duplicado: «Águilas» es alias de «Las Águilas»');

-- 2. Sin confirmaciones nada cambia (compatibilidad).
SET ROLE service_role;
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' = :'fp0' AND NOT (test_util.t_area(:'tok', 'atico-demo-1') ? 'area'),
  'sin confirmaciones: misma huella y sin «area» en la instantánea');

-- 3. Confirmar la zona: entra en la instantánea del catálogo del dueño.
SELECT catalog_area_confirm(:'owner', :'p1', 'madrid/salamanca/recoletos');
SELECT test_util.ok(test_util.t_area(:'tok', 'atico-demo-1')->'area' = '{"name": "Recoletos", "level": "barrio"}'::jsonb, 'confirmada: «area» con el nombre del registro');
SELECT test_util.ok((get_public_catalog(:'tok'))->>'fingerprint' <> :'fp0', 'confirmada: la huella cambia y los lectores abiertos la reciben');
SELECT test_util.ok(NOT (test_util.t_area(:'tok', 'piso-demo-2') ? 'area'), 'otra vivienda sin confirmar: sin «area»');
SELECT test_util.ok((SELECT still_current FROM catalog_area_decisions(:'owner', ARRAY[:'p1']::uuid[])), 'decisión vigente');

-- 4. La confirmación de otro dueño no toca los catálogos de este (y viceversa).
SELECT catalog_area_confirm(:'h2', :'p2', 'madrid/retiro');
SELECT test_util.ok(NOT (test_util.t_area(:'tok', 'piso-demo-2') ? 'area'), 'otro dueño: su confirmación no cambia este catálogo');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_area_decisions(:'h2', ARRAY[:'p1']::uuid[])), 'otro dueño: no ve las confirmaciones ajenas');

-- 5. «Sin zona verificada»: nombre nulo (el lector dirá «El barrio»).
SELECT catalog_area_confirm(:'owner', :'p2', NULL);
SELECT test_util.ok(test_util.t_area(:'tok', 'piso-demo-2')->'area' = '{"name": null, "level": null}'::jsonb, '«sin zona verificada»: nombre nulo');

-- 6. Cambia la dirección de la ficha: la confirmación deja de valer (no se publica).
RESET ROLE;
UPDATE properties SET address = 'Calle Goya 30' WHERE id = :'p1';
SET ROLE service_role;
SELECT test_util.ok(NOT (test_util.t_area(:'tok', 'atico-demo-1') ? 'area'), 'ficha cambiada: la confirmación deja de publicarse');
SELECT test_util.ok(NOT (SELECT still_current FROM catalog_area_decisions(:'owner', ARRAY[:'p1']::uuid[])), 'ficha cambiada: el gestor ve «revisar»');
SELECT catalog_area_confirm(:'owner', :'p1', 'madrid/salamanca/goya');
SELECT test_util.ok(test_util.t_area(:'tok', 'atico-demo-1')->'area'->>'name' = 'Goya', 'volver a confirmar con la ficha nueva');

-- 7. Quitar la confirmación.
SELECT catalog_area_clear(:'owner', :'p1');
SELECT test_util.ok(NOT (test_util.t_area(:'tok', 'atico-demo-1') ? 'area'), 'quitar la confirmación: vuelve la zona de la ficha');

-- 8. Validaciones y permisos.
SELECT test_util.expect_error(format('SELECT catalog_area_confirm(%L, %L, %L)', :'owner', :'p1', 'madrid/inventado'), 'area_not_found');
SELECT test_util.expect_error(format('SELECT catalog_area_confirm(%L, %L, %L)', :'staff', :'p1', 'madrid/retiro'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_area_clear(%L, %L)', :'staff', :'p1'), 'forbidden');
SELECT test_util.expect_error(format('SELECT * FROM catalog_area_decisions(%L, ARRAY[%L]::uuid[])', :'staff', :'p1'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_area_confirm(%L, %L, %L)', :'owner', '10000000-0000-0000-0000-0000000000ff', 'madrid/retiro'), 'property_not_found');
RESET ROLE;
SET ROLE anon;
SELECT test_util.expect_error('SELECT * FROM catalog_areas', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT * FROM catalog_property_areas', 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT catalog_area_confirm(%L, %L, %L)', :'owner', :'p1', 'madrid/retiro'), 'insufficient_privilege');
RESET ROLE;

-- 9. La ficha del CRM no cambia por confirmar (solo la cambió la prueba 6, a mano).
SELECT test_util.ok((SELECT zone = 'Salamanca' AND subzone = 'Recoletos' AND address = 'Calle Goya 30' FROM properties WHERE id = :'p1'), 'confirmar no toca zona, barrio ni dirección de la ficha');
-- 10. Independiente de los grupos y de los términos de búsqueda.
SELECT test_util.ok((SELECT count(*) FROM catalog_zone_terms) > 0 AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name IN ('catalog_groups', 'catalog_zone_terms') AND column_name LIKE '%area%'),
  'grupos y términos de búsqueda sin cambios');
