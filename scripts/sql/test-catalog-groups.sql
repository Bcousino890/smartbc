-- SOLO PRUEBAS LOCALES (HOME · grupos, 0207). Resultados escritos a mano.
-- Cubre: permisos, guardas de dueño, árbol (dos niveles, sin ciclos, sin
-- mezclar dueños, también con escrituras directas), nombres (1–60, únicos entre
-- hermanos sin mayúsculas ni tildes), límite de 100, orden, mover (D9), borrar
-- un árbol (D6), asignaciones múltiples (D1), crear y asignar atómico (C1) y,
-- después de CADA operación de organizar, que los catálogos, sus tablas, la
-- instantánea y la huella pública siguen idénticos (R2/AC4).
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-0000000000f1'
\set other '00000000-0000-0000-0000-0000000000a2'
\set client '00000000-0000-0000-0000-0000000000c3'
SELECT v AS k1 FROM test_util.carry WHERE k = 'g_k1' \gset
SELECT v AS k2 FROM test_util.carry WHERE k = 'g_k2' \gset
SELECT v AS k3 FROM test_util.carry WHERE k = 'g_k3' \gset
SELECT v AS k4 FROM test_util.carry WHERE k = 'g_k4' \gset
SELECT v AS k9 FROM test_util.carry WHERE k = 'g_k9' \gset
SELECT v AS tok FROM test_util.carry WHERE k = 'g_tok' \gset

-- Todo lo que organizar NO puede cambiar, en una sola huella.
CREATE OR REPLACE FUNCTION test_util.g_state() RETURNS text LANGUAGE sql AS $$
  SELECT md5(concat_ws('|',
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)::text FROM catalogs c),
    (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.catalog_id, i.property_id)::text, '') FROM catalog_items i),
    (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.catalog_id)::text, '') FROM catalog_shares s),
    (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.catalog_id, a.property_id)::text, '') FROM catalog_adjustments a),
    (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.catalog_id, t.property_id)::text, '') FROM catalog_texts t),
    (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.catalog_id, p.photo_id, p.kind)::text, '') FROM catalog_photo_prefs p),
    (SELECT string_agg(md5(catalog_internal_snapshot(id)::text), ',' ORDER BY id) FROM catalogs),
    (SELECT string_agg(coalesce(catalog_public_fingerprint(owner_id, id), '-'), ',' ORDER BY id) FROM catalogs),
    (SELECT (get_public_catalog(v))->>'fingerprint' FROM test_util.carry WHERE k = 'g_tok')));
$$;
CREATE OR REPLACE FUNCTION test_util.g_same(p_before text, p_what text) RETURNS void LANGUAGE sql AS $$
  SELECT test_util.ok(test_util.g_state() = p_before, 'catálogos intactos tras ' || p_what);
$$;
SELECT test_util.g_state() AS st0 \gset

-- ── Permisos ────────────────────────────────────────────────────────────────
SET ROLE anon;
SELECT test_util.expect_error('SELECT 1 FROM catalog_groups', 'insufficient_privilege');
SELECT test_util.expect_error('SELECT 1 FROM catalog_group_members', 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, NULL, %L)', :'owner', 'x'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_group_set_member(%L, gen_random_uuid(), %L, true)', :'owner', :'k1'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_create_in_group(%L, %L, NULL, %L, %L, %L, gen_random_uuid())', :'owner', 'x', 'F', '+34641457123', 'asesor'), 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error('SELECT 1 FROM catalog_groups', 'insufficient_privilege');
SELECT test_util.expect_error(format('INSERT INTO catalog_groups (owner_id, name) VALUES (%L, %L)', :'owner', 'x'), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT catalog_group_delete(%L, gen_random_uuid())', :'owner'), 'insufficient_privilege');
RESET ROLE;
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'catalog_group%' AND prosecdef)
                    AND NOT (SELECT prosecdef FROM pg_proc WHERE proname = 'catalog_create_in_group'),
  'funciones SECURITY INVOKER');
SELECT test_util.ok((SELECT relrowsecurity FROM pg_class WHERE relname = 'catalog_groups')
                    AND (SELECT relrowsecurity FROM pg_class WHERE relname = 'catalog_group_members'), 'RLS activado');

SET ROLE service_role;
-- Fuera de home_owners: forbidden.
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, NULL, %L)', :'client', 'x'), 'forbidden');

-- ── Crear el árbol del ejemplo ──────────────────────────────────────────────
SELECT catalog_group_create(:'owner', NULL, 'Salamanca') AS sal \gset
SELECT catalog_group_create(:'owner', :'sal', 'Recoletos') AS rec \gset
SELECT catalog_group_create(:'owner', :'sal', 'Castellana') AS cas \gset
SELECT catalog_group_create(:'owner', :'sal', 'Lista') AS lis \gset
SELECT catalog_group_create(:'owner', :'sal', 'Goya') AS goy \gset
SELECT catalog_group_create(:'owner', NULL, 'Chamberí') AS cha \gset
SELECT catalog_group_create(:'owner', NULL, 'Retiro') AS ret \gset
SELECT test_util.g_same(:'st0', 'crear grupos');
SELECT test_util.ok((SELECT string_agg(name, ',' ORDER BY position) FROM catalog_groups WHERE owner_id = :'owner' AND parent_id IS NULL) = 'Salamanca,Chamberí,Retiro',
  'grupos de primer nivel en orden de creación (posiciones 0…n−1)');
SELECT test_util.ok((SELECT string_agg(position::text || name, ',' ORDER BY position) FROM catalog_groups WHERE parent_id = :'sal') = '0Recoletos,1Castellana,2Lista,3Goya',
  'subgrupos de Salamanca en orden');

-- ── Nombres (D12) ───────────────────────────────────────────────────────────
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, NULL, %L)', :'owner', 'salamanca'), 'duplicate_name');
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, NULL, %L)', :'owner', 'SALAMANCÁ'), 'duplicate_name');
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, NULL, %L)', :'owner', '  Chamberi  '), 'duplicate_name');
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, %L, %L)', :'owner', :'sal', 'recoletos'), 'duplicate_name');
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, NULL, %L)', :'owner', '   '), 'invalid_name');
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, NULL, %L)', :'owner', repeat('a', 61)), 'invalid_name');
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, NULL, %L)', :'owner', 'con' || chr(7) || 'control'), 'invalid_name');
SELECT catalog_group_create(:'owner', NULL, '  Clientes    internacionales ') AS cli \gset
SELECT test_util.ok((SELECT name FROM catalog_groups WHERE id = :'cli') = 'Clientes internacionales', 'nombre normalizado (espacios sobrantes fuera)');
SELECT catalog_group_create(:'owner', :'cha', 'Recoletos') AS cha_rec \gset
SELECT test_util.ok(:'cha_rec' IS NOT NULL, 'el mismo nombre en OTRO nivel o grupo se permite');
SELECT catalog_group_create(:'owner', NULL, repeat('b', 60)) AS long60 \gset
SELECT test_util.ok((SELECT char_length(name) FROM catalog_groups WHERE id = :'long60') = 60, 'nombre de 60 caracteres permitido');
SELECT catalog_group_delete(:'owner', :'long60');
SELECT catalog_group_delete(:'owner', :'cha_rec');
SELECT catalog_group_rename(:'owner', :'cli', 'Internacionales');
SELECT test_util.expect_error(format('SELECT catalog_group_rename(%L, %L, %L)', :'owner', :'cli', 'retiro'), 'duplicate_name');
SELECT catalog_group_rename(:'owner', :'cli', 'INTERNACIONALES');
SELECT test_util.ok((SELECT name FROM catalog_groups WHERE id = :'cli') = 'INTERNACIONALES', 'renombrar cambiando solo mayúsculas del propio nombre se permite');
SELECT test_util.g_same(:'st0', 'nombres y renombrar');

-- ── Árbol: dos niveles, sin ciclos, sin mezclar dueños (D3) ─────────────────
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, %L, %L)', :'owner', :'rec', 'Tercer nivel'), 'too_deep');
RESET ROLE;
SELECT test_util.expect_error(format('INSERT INTO catalog_groups (owner_id, parent_id, name) VALUES (%L, %L, %L)', :'owner', :'rec', 'Directo'), 'too_deep');
SELECT test_util.expect_error(format('UPDATE catalog_groups SET parent_id = %L WHERE id = %L', :'cha', :'sal'), 'too_deep');
SELECT test_util.expect_error(format('UPDATE catalog_groups SET parent_id = %L WHERE id = %L', :'ret', :'ret'), 'too_deep');   -- su propio padre: lo para el disparador (antes que el CHECK)
SET ROLE service_role;

-- ── Otro dueño de la HOME: nada cruza ───────────────────────────────────────
SELECT catalog_group_create(:'other', NULL, 'Salamanca') AS osal \gset
SELECT test_util.ok(:'osal' IS NOT NULL, 'otro dueño puede tener su propio «Salamanca»');
SELECT test_util.expect_error(format('SELECT catalog_group_rename(%L, %L, %L)', :'owner', :'osal', 'x'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_group_delete(%L, %L)', :'owner', :'osal'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, %L, %L)', :'owner', :'osal', 'Hijo'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_group_set_member(%L, %L, %L, true)', :'owner', :'osal', :'k1'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_group_set_member(%L, %L, %L, true)', :'other', :'osal', :'k1'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_group_set_member(%L, %L, %L, true)', :'owner', :'sal', :'k9'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_group_set_member(%L, %L, gen_random_uuid(), true)', :'owner', :'sal'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_group_move(%L, %L, %L)', :'owner', :'rec', :'osal'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_group_reorder(%L, %L, ARRAY[%L]::uuid[])', :'owner', :'osal', :'osal'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_group_preview_delete(%L, %L)', :'owner', :'osal'), 'forbidden');
RESET ROLE;
SELECT test_util.expect_error(format('INSERT INTO catalog_groups (owner_id, parent_id, name) VALUES (%L, %L, %L)', :'other', :'sal', 'Mezcla'), 'forbidden');
SELECT test_util.expect_error(format('INSERT INTO catalog_group_members (group_id, catalog_id) VALUES (%L, %L)', :'osal', :'k1'), 'forbidden');
SELECT test_util.expect_error(format('UPDATE catalog_groups SET owner_id = %L WHERE id = %L', :'other', :'ret'), 'forbidden');
SET ROLE service_role;

-- ── Asignaciones múltiples (D1) ─────────────────────────────────────────────
SELECT catalog_group_set_member(:'owner', :'rec', :'k1', true);
SELECT catalog_group_set_member(:'owner', :'cas', :'k1', true);
SELECT catalog_group_set_member(:'owner', :'sal', :'k1', true);
SELECT catalog_group_set_member(:'owner', :'sal', :'k1', true);   -- repetir no falla ni duplica
SELECT catalog_group_set_member(:'owner', :'sal', :'k2', true);
SELECT catalog_group_set_member(:'owner', :'goy', :'k4', true);
SELECT catalog_group_set_member(:'owner', :'cli', :'k4', true);
SELECT catalog_group_set_member(:'owner', :'ret', :'k3', true);   -- archivado: se asigna igual
SELECT test_util.g_same(:'st0', 'asignar');
SELECT test_util.ok((SELECT count(*) FROM catalog_group_members WHERE catalog_id = :'k1') = 3, 'K1 en Salamanca, Recoletos y Castellana (3 filas, sin duplicar)');
SELECT test_util.ok((SELECT count(DISTINCT m.catalog_id) FROM catalog_group_members m JOIN catalog_groups g ON g.id = m.group_id
                      WHERE g.id = :'sal' OR g.parent_id = :'sal') = 3, '«Todo Salamanca»: 3 catálogos distintos (K1, K2, K4), K1 una vez');
SELECT catalog_group_set_member(:'owner', :'sal', :'k1', false);
SELECT test_util.ok((SELECT count(*) FROM catalog_group_members WHERE catalog_id = :'k1') = 2, 'quitar la asignación al padre no quita las de los hijos');
SELECT catalog_group_set_member(:'owner', :'sal', :'k1', false);  -- quitar lo que no está no falla
SELECT catalog_group_set_member(:'owner', :'sal', :'k1', true);
SELECT test_util.g_same(:'st0', 'quitar y volver a asignar');

-- ── Orden manual (D4) ───────────────────────────────────────────────────────
SELECT catalog_group_reorder(:'owner', NULL, ARRAY[:'ret', :'sal', :'cli', :'cha']::uuid[]);
SELECT test_util.ok((SELECT string_agg(name, ',' ORDER BY position) FROM catalog_groups WHERE owner_id = :'owner' AND parent_id IS NULL) = 'Retiro,Salamanca,INTERNACIONALES,Chamberí',
  'reordenar el primer nivel');
SELECT catalog_group_reorder(:'owner', :'sal', ARRAY[:'goy', :'rec', :'cas', :'lis']::uuid[]);
SELECT test_util.ok((SELECT string_agg(position::text || name, ',' ORDER BY position) FROM catalog_groups WHERE parent_id = :'sal') = '0Goya,1Recoletos,2Castellana,3Lista',
  'reordenar los subgrupos');
SELECT test_util.expect_error(format('SELECT catalog_group_reorder(%L, NULL, ARRAY[%L, %L]::uuid[])', :'owner', :'ret', :'sal'), 'invalid_order');
SELECT test_util.expect_error(format('SELECT catalog_group_reorder(%L, NULL, ARRAY[%L, %L, %L, %L]::uuid[])', :'owner', :'ret', :'sal', :'cli', :'cli'), 'invalid_order');
SELECT test_util.expect_error(format('SELECT catalog_group_reorder(%L, NULL, ARRAY[%L, %L, %L, %L]::uuid[])', :'owner', :'ret', :'sal', :'cli', :'rec'), 'invalid_order');
SELECT test_util.expect_error(format('SELECT catalog_group_reorder(%L, NULL, ARRAY[%L, %L, %L, %L]::uuid[])', :'owner', :'ret', :'sal', :'cli', :'osal'), 'invalid_order');
SELECT test_util.g_same(:'st0', 'ordenar');

-- ── Mover un subgrupo (D9) ──────────────────────────────────────────────────
SELECT catalog_group_move(:'owner', :'goy', :'cha');
SELECT test_util.ok((SELECT parent_id FROM catalog_groups WHERE id = :'goy') = :'cha'::uuid
                    AND (SELECT position FROM catalog_groups WHERE id = :'goy') = 0, 'Goya pasa a Chamberí, al final');
SELECT test_util.ok((SELECT string_agg(position::text || name, ',' ORDER BY position) FROM catalog_groups WHERE parent_id = :'sal') = '0Recoletos,1Castellana,2Lista',
  'Salamanca se renumera sin huecos');
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_group_members WHERE group_id = :'goy' AND catalog_id = :'k4'), 'mover conserva las asignaciones del subgrupo');
SELECT test_util.expect_error(format('SELECT catalog_group_move(%L, %L, %L)', :'owner', :'ret', :'sal'), 'invalid_move');
SELECT test_util.expect_error(format('SELECT catalog_group_move(%L, %L, %L)', :'owner', :'rec', :'goy'), 'too_deep');
SELECT test_util.expect_error(format('SELECT catalog_group_move(%L, %L, NULL)', :'owner', :'rec'), 'invalid_move');
SELECT test_util.expect_error(format('SELECT catalog_group_move(%L, %L, %L)', :'owner', :'rec', :'rec'), 'invalid_move');
SELECT catalog_group_move(:'owner', :'rec', :'sal');   -- al mismo grupo: no hace nada
SELECT test_util.ok((SELECT position FROM catalog_groups WHERE id = :'rec') = 0, 'mover al mismo grupo no cambia nada');
SELECT catalog_group_create(:'owner', :'cha', 'LISTA') AS cha_lis \gset
SELECT test_util.expect_error(format('SELECT catalog_group_move(%L, %L, %L)', :'owner', :'lis', :'cha'), 'duplicate_name');
SELECT catalog_group_delete(:'owner', :'cha_lis');
SELECT test_util.g_same(:'st0', 'mover');

-- ── Borrar un árbol (D6) ────────────────────────────────────────────────────
-- K1: Salamanca, Recoletos, Castellana · K2: Salamanca · K4: Goya (ya en
-- Chamberí) e INTERNACIONALES · K3: Retiro.
SELECT test_util.ok(catalog_group_preview_delete(:'owner', :'sal')
                    = '{"groups": 4, "subgroups": ["Recoletos", "Castellana", "Lista"], "assignments": 4, "catalogs": 2, "unorganized": 2}'::jsonb,
  'vista previa: 4 grupos, 4 asignaciones, 2 catálogos y 2 quedan sin organizar');
SELECT test_util.g_same(:'st0', 'la vista previa');
SELECT catalog_group_delete(:'owner', :'sal') AS del \gset
SELECT test_util.ok(:'del'::jsonb ->> 'unorganized' = '2', 'el borrado devuelve los mismos recuentos');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_groups WHERE id IN (:'sal', :'rec', :'cas', :'lis')), 'Salamanca y sus 3 subgrupos borrados');
SELECT test_util.ok((SELECT count(*) FROM catalogs WHERE id IN (:'k1', :'k2', :'k3', :'k4')) = 4, 'ningún catálogo borrado');
SELECT test_util.ok(NOT EXISTS (SELECT 1 FROM catalog_group_members WHERE catalog_id IN (:'k1', :'k2')), 'K1 y K2 sin asignaciones: «Sin organizar»');
SELECT test_util.ok((SELECT count(*) FROM catalog_group_members WHERE catalog_id = :'k4') = 2
                    AND (SELECT count(*) FROM catalog_group_members WHERE catalog_id = :'k3') = 1, 'las asignaciones a otros grupos siguen (K4 en Goya e INTERNACIONALES, K3 en Retiro)');
SELECT test_util.ok((SELECT string_agg(position::text || name, ',' ORDER BY position) FROM catalog_groups WHERE owner_id = :'owner' AND parent_id IS NULL) = '0Retiro,1INTERNACIONALES,2Chamberí',
  'los grupos que quedan se renumeran sin huecos');
SELECT test_util.g_same(:'st0', 'borrar un árbol');
SELECT test_util.expect_error(format('SELECT catalog_group_delete(%L, %L)', :'owner', :'sal'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_group_set_member(%L, %L, %L, true)', :'owner', :'rec', :'k1'), 'forbidden');

-- ── Límite de 100 (D13), en el otro dueño (1 grupo ya) ──────────────────────
SELECT count(*) FROM (SELECT catalog_group_create(:'other', NULL, 'Grupo ' || n) FROM generate_series(1, 98) n) x;
SELECT catalog_group_create(:'other', :'osal', 'Subgrupo 100') AS o100 \gset
SELECT test_util.ok((SELECT count(*) FROM catalog_groups WHERE owner_id = :'other') = 100, '100 grupos (subgrupos incluidos)');
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, NULL, %L)', :'other', 'El 101'), 'too_many_groups');
SELECT test_util.expect_error(format('SELECT catalog_group_create(%L, %L, %L)', :'other', :'osal', 'El 101'), 'too_many_groups');
SELECT catalog_group_delete(:'other', :'o100');
SELECT catalog_group_create(:'other', NULL, 'Otra vez 100') AS o100b \gset
SELECT test_util.ok((SELECT count(*) FROM catalog_groups WHERE owner_id = :'other') = 100, 'tras borrar uno se puede crear otro');
SELECT test_util.g_same(:'st0', 'el límite');

-- ── Crear y asignar en una sola operación (D10, C1) ─────────────────────────
SELECT count(*) AS n0 FROM catalogs \gset
SELECT catalog_create_in_group(:'owner', 'Nuevo en Retiro', NULL, 'Fabricio Andree', '+34641457123', 'asesor', :'ret') AS k5 \gset
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_group_members WHERE group_id = :'ret' AND catalog_id = :'k5')
                    AND (SELECT count(*) FROM catalogs) = :n0 + 1, 'crear con grupo: el catálogo existe y ya está en Retiro');
SELECT test_util.expect_error(format('SELECT catalog_create_in_group(%L, %L, NULL, %L, %L, %L, %L)', :'owner', 'En grupo borrado', 'Fabricio Andree', '+34641457123', 'asesor', :'sal'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_create_in_group(%L, %L, NULL, %L, %L, %L, %L)', :'owner', 'En grupo ajeno', 'Fabricio Andree', '+34641457123', 'asesor', :'osal'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_create_in_group(%L, %L, NULL, %L, %L, %L, NULL)', :'owner', 'Sin grupo', 'Fabricio Andree', '+34641457123', 'asesor'), 'forbidden');
SELECT test_util.expect_error(format('SELECT catalog_create_in_group(%L, %L, NULL, %L, %L, %L, %L)', :'owner', 'Contacto malo', 'Fabricio Andree', '641', 'asesor', :'ret'), 'invalid_contact_phone');
SELECT test_util.ok((SELECT count(*) FROM catalogs) = :n0 + 1
                    AND NOT EXISTS (SELECT 1 FROM catalogs WHERE title IN ('En grupo borrado', 'En grupo ajeno', 'Sin grupo', 'Contacto malo')),
  'si la asignación (o el catálogo) falla, no queda ningún catálogo: se deshace todo');
SELECT catalog_create_v2(:'owner', 'En grupo borrado', NULL, 'Fabricio Andree', '+34641457123', 'asesor') AS k6 \gset
SELECT test_util.ok((SELECT count(*) FROM catalogs WHERE title = 'En grupo borrado') = 1, 'reintentar sin la casilla crea UN catálogo');
SELECT test_util.expect_error(format('SELECT catalog_create_in_group(%L, %L, NULL, %L, %L, %L, %L)', :'client', 'Sin HOME', 'X', '+34641457123', 'asesor', :'ret'), 'forbidden');

-- El catálogo nuevo tampoco cambia al organizar.
SELECT test_util.g_state() AS st1 \gset
SELECT catalog_group_set_member(:'owner', :'cha', :'k5', true);
SELECT catalog_group_rename(:'owner', :'ret', 'Retiro y Jerónimos');
SELECT catalog_group_delete(:'owner', :'cha');
SELECT test_util.g_same(:'st1', 'organizar con el catálogo nuevo');
SELECT test_util.ok(EXISTS (SELECT 1 FROM catalog_group_members WHERE catalog_id = :'k5'), 'K5 sigue en Retiro tras borrar Chamberí');
-- Control: la huella de comprobación SÍ detecta un cambio real del catálogo.
SELECT catalog_update_meta(:'owner', :'k2', 'Áticos en Salamanca (editado)', NULL);
SELECT test_util.ok(test_util.g_state() <> :'st1', 'control: editar el título de un catálogo SÍ cambia la huella de comprobación');
SELECT test_util.g_state() AS st2 \gset
SELECT catalog_add_property(:'owner', :'k1', '10000000-0000-0000-0000-000000000004');
SELECT test_util.ok(test_util.g_state() <> :'st2', 'control: añadir una propiedad SÍ cambia la huella de comprobación');
RESET ROLE;

INSERT INTO test_util.carry VALUES ('g_ret', :'ret'), ('g_cli', :'cli'), ('g_osal', :'osal')
ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
\echo 'test-catalog-groups.sql: todo en verde'
