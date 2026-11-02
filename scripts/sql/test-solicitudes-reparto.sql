-- ============================================================================
-- SOLO PRUEBAS LOCALES. Reparto por inmueble y vínculo exacto (0237).
-- Lo lanza scripts/sql/test-solicitudes-reparto.sh sobre el Postgres temporal.
-- Los identificadores de la tabla de aceptación (R01…R12, D02…, Z01…) van en
-- cada mensaje.
-- ============================================================================
\set ON_ERROR_STOP 1
SET client_min_messages = notice;

-- ─── Personas ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'admin@test'),
  ('a0000000-0000-0000-0000-00000000000b', 'admin2@test'),
  ('a0000000-0000-0000-0000-0000000000e1', 'ejecutivo@test'),
  ('a0000000-0000-0000-0000-0000000000a5', 'admin-cl@test'),
  ('b0000000-0000-0000-0000-00000000000a', 'jaime@test'),
  ('b0000000-0000-0000-0000-00000000000b', 'sofia@test'),
  ('b0000000-0000-0000-0000-00000000000c', 'baja@test'),
  ('c0000000-0000-0000-0000-000000000001', 'lucia@test'),
  ('c0000000-0000-0000-0000-000000000002', 'marta@test'),
  ('c0000000-0000-0000-0000-000000000003', 'pedro@test');
INSERT INTO profiles (id, role, full_name, email, phone, country) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'admin',   'Admin',     'admin@test',     NULL, 'es'),
  ('a0000000-0000-0000-0000-00000000000b', 'owner',   'Admin dos', 'admin2@test',    NULL, 'es'),
  ('a0000000-0000-0000-0000-0000000000e1', 'advisor', 'Ejecutivo', 'ejecutivo@test', NULL, 'es'),
  -- admin global con rol de asesor en España: en España NO es administrador.
  ('a0000000-0000-0000-0000-0000000000a5', 'admin',   'Admin CL',  'admin-cl@test',  NULL, 'cl'),
  ('b0000000-0000-0000-0000-00000000000a', 'advisor', 'Jaime',     'jaime@test',     NULL, 'es'),
  ('b0000000-0000-0000-0000-00000000000b', 'advisor', 'Sofía',     'sofia@test',     NULL, 'es'),
  ('b0000000-0000-0000-0000-00000000000c', 'advisor', 'De baja',   'baja@test',      NULL, 'es'),
  ('c0000000-0000-0000-0000-000000000001', 'client',  'Lucía',     'lucia@test',     '+34 600 000 001', 'es'),
  ('c0000000-0000-0000-0000-000000000002', 'client',  'Marta',     'marta@test',     '+34 600 000 002', 'es'),
  ('c0000000-0000-0000-0000-000000000003', 'client',  'Pedro',     'pedro@test',     '+34 600 000 003', 'es');
INSERT INTO profiles_country_roles (user_id, country, role) VALUES
  ('a0000000-0000-0000-0000-0000000000a5', 'es', 'advisor');

-- ─── Inmuebles y anuncios ────────────────────────────────────────────────────
-- P1 Castelló · P2 Goya · P3 Velázquez · P4 Serrano. L4 es un anuncio «inspo»
-- sin ficha propia. Dos anuncios comparten «BC-DUP».
INSERT INTO properties (id, slug, title, country, bc_reference) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'castello', 'Castelló', 'es', 'bc-1'),
  ('d0000000-0000-0000-0000-000000000002', 'goya',     'Goya',     'es', 'bc-2'),
  ('d0000000-0000-0000-0000-000000000003', 'velazquez','Velázquez','es', 'bc-3'),
  ('d0000000-0000-0000-0000-000000000004', 'serrano',  'Serrano',  'es', 'bc-4'),
  ('d0000000-0000-0000-0000-0000000000c1', 'santiago', 'Las Condes','cl', 'cl-1');
INSERT INTO idealista_listings (id, property_id, reference_code, idealista_property_id, is_inspo) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'BC-100', '111', false),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'BC-200', '222', false),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'BC-300', '333', false),
  ('e0000000-0000-0000-0000-000000000004', NULL,                                   'BC-400', '444', true),
  ('e0000000-0000-0000-0000-000000000005', NULL,                                   'BC-DUP', NULL,  true),
  ('e0000000-0000-0000-0000-000000000006', NULL,                                   'BC-DUP', NULL,  true),
  ('e0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000004', 'BC-700', '777', false);

-- Ayuda: crea una solicitud como la deja la ingesta.
CREATE OR REPLACE FUNCTION pg_temp.lead(p_id text, p_phone text, p_ref text, p_code text,
  p_prop text DEFAULT NULL, p_list text DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO idealista_leads (id, conversation_id, name, phone, property_ref, idealista_code,
                               matched_property_id, matched_listing_id)
  VALUES (('f0000000-0000-0000-0000-' || lpad(p_id, 12, '0'))::uuid, p_id, 'Lead ' || p_id, p_phone,
          p_ref, p_code, p_prop::uuid, p_list::uuid)
  RETURNING id
$$;
CREATE OR REPLACE FUNCTION pg_temp.l(p_id text) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('f0000000-0000-0000-0000-' || lpad(p_id, 12, '0'))::uuid
$$;

\set ADM    '''a0000000-0000-0000-0000-00000000000a'''
\set ADM2   '''a0000000-0000-0000-0000-00000000000b'''
\set EXE    '''a0000000-0000-0000-0000-0000000000e1'''
\set ADMCL  '''a0000000-0000-0000-0000-0000000000a5'''
\set JAIME  '''b0000000-0000-0000-0000-00000000000a'''
\set SOFIA  '''b0000000-0000-0000-0000-00000000000b'''
\set BAJA   '''b0000000-0000-0000-0000-00000000000c'''
\set LUCIA  '''c0000000-0000-0000-0000-000000000001'''
\set MARTA  '''c0000000-0000-0000-0000-000000000002'''
\set PEDRO  '''c0000000-0000-0000-0000-000000000003'''
\set P1 '''d0000000-0000-0000-0000-000000000001'''
\set P2 '''d0000000-0000-0000-0000-000000000002'''
\set P3 '''d0000000-0000-0000-0000-000000000003'''
\set P4 '''d0000000-0000-0000-0000-000000000004'''
\set PCL '''d0000000-0000-0000-0000-0000000000c1'''
\set L4 '''e0000000-0000-0000-0000-000000000004'''

-- ═══ R02 · solo administradores (en servidor) ═══════════════════════════════
SELECT test_util.expect_error(format(
  $q$SELECT routing_set_rules(%L, 'es', %L, '[{"property_id":"d0000000-0000-0000-0000-000000000001","expected_version":0}]')$q$,
  :EXE, :JAIME), 'forbidden');
SELECT test_util.expect_error(format(
  $q$SELECT routing_set_rules(%L, 'es', %L, '[{"property_id":"d0000000-0000-0000-0000-000000000001","expected_version":0}]')$q$,
  :ADMCL, :JAIME), 'forbidden');
SELECT test_util.ok(routing_actor_is_admin(:ADMCL, 'cl'), 'R02 · el rol por país manda: admin en Chile');
SELECT test_util.ok(NOT routing_actor_is_admin(:ADMCL, 'es'), 'R02 · y asesor en España');

-- ═══ R01 · tres pisos al mismo asesor en una operación ══════════════════════
DO $$
DECLARE r jsonb;
BEGIN
  r := routing_set_rules('a0000000-0000-0000-0000-00000000000a', 'es', 'b0000000-0000-0000-0000-00000000000a',
    '[{"property_id":"d0000000-0000-0000-0000-000000000001","expected_version":0},
      {"property_id":"d0000000-0000-0000-0000-000000000003","expected_version":0},
      {"listing_id":"e0000000-0000-0000-0000-000000000004","expected_version":0}]', 'Cartera de Jaime');
  PERFORM test_util.ok((SELECT count(*) FROM jsonb_array_elements(r) e WHERE e->>'result' = 'created') = 3,
    'R01 · tres reglas creadas en una sola operación');
END $$;
SELECT test_util.ok((SELECT count(*) FROM property_routing_rules WHERE active AND advisor_id = :JAIME) = 3,
  'R01 · las tres reglas quedan guardadas y visibles');
SELECT test_util.ok((SELECT count(DISTINCT operation_id) FROM assignment_events WHERE kind = 'rule_set') = 1
  AND (SELECT count(*) FROM assignment_events WHERE kind = 'rule_set' AND actor_id = :ADM) = 3,
  'R01 · auditoría: una operación, tres eventos, con actor');
SELECT routing_set_rules(:ADM, 'es', :SOFIA,
  '[{"property_id":"d0000000-0000-0000-0000-000000000002","expected_version":0}]');
SELECT test_util.ok((SELECT e->>'result' FROM jsonb_array_elements(routing_set_rules(:ADM, 'es', :SOFIA,
  '[{"property_id":"d0000000-0000-0000-0000-0000000000c1","expected_version":0}]')) e) = 'not_found',
  'R01 · un inmueble de otro país no entra en el reparto de España');
SELECT test_util.expect_error(format(
  $q$SELECT routing_set_rules(%L, 'es', %L, '[{"property_id":"d0000000-0000-0000-0000-000000000001","expected_version":1}]')$q$,
  :ADM, :LUCIA), 'advisor_invalid');

-- Solicitudes nuevas con vínculo exacto: por Ref., por Cod., por la Ref. de la
-- ficha propia y por un anuncio inspo.
SELECT pg_temp.lead('101', '+34 611 000 101', 'BC-100', NULL);
SELECT pg_temp.lead('102', '+34 611 000 102', NULL, '333');
SELECT pg_temp.lead('103', '+34 611 000 103', 'bc-1', NULL);
SELECT pg_temp.lead('104', '+34 611 000 104', 'BC-400', '444');
SELECT route_leads(ARRAY[pg_temp.l('101'), pg_temp.l('102'), pg_temp.l('103'), pg_temp.l('104')]);
SELECT test_util.ok((SELECT count(*) FROM idealista_leads
  WHERE id IN (pg_temp.l('101'), pg_temp.l('102'), pg_temp.l('103'), pg_temp.l('104'))
    AND assigned_to = :JAIME AND assignment_source = 'rule' AND routing_status = 'assigned') = 4,
  'R01 · los clientes nuevos de esos pisos van a Jaime');
SELECT test_util.ok((SELECT property_link_method FROM idealista_leads WHERE id = pg_temp.l('102')) = 'code'
  AND (SELECT matched_property_id FROM idealista_leads WHERE id = pg_temp.l('102')) = :P3,
  'D01 · el Cod. exacto resuelve anuncio e inmueble');
SELECT test_util.ok((SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('104')) = :L4
  AND (SELECT matched_property_id FROM idealista_leads WHERE id = pg_temp.l('104')) IS NULL,
  'D01 · un anuncio sin ficha propia también es un inmueble repartible');
SELECT test_util.ok((SELECT count(*) FROM zinto_owner_sync WHERE subject_kind = 'lead'
  AND status = 'pending' AND blocked_reason = 'contract_missing') = 4,
  'Z01 · el responsable queda en la cola de Zinto, pendiente por falta de contrato');

-- ═══ R07 · reintento del mismo lead ═════════════════════════════════════════
DO $$
DECLARE before_ev int; before_act int; before_z int;
BEGIN
  SELECT count(*) INTO before_ev FROM assignment_events;
  SELECT count(*) INTO before_act FROM lead_activity;
  SELECT count(*) INTO before_z FROM zinto_owner_sync;
  PERFORM route_lead('f0000000-0000-0000-0000-000000000101');
  PERFORM route_lead('f0000000-0000-0000-0000-000000000101');
  PERFORM test_util.ok((SELECT count(*) FROM assignment_events) = before_ev
    AND (SELECT count(*) FROM lead_activity) = before_act
    AND (SELECT count(*) FROM zinto_owner_sync) = before_z,
    'R07 · reprocesar no duplica asignación, actividad, auditoría ni sincronización');
END $$;

-- ═══ D02 · R05 · sin evidencia exacta no hay reparto ════════════════════════
-- Enlazado por calle+precio (lo que hace hoy la ingesta sin Ref. ni Cod.).
SELECT pg_temp.lead('201', '+34 611 000 201', NULL, NULL, 'd0000000-0000-0000-0000-000000000001');
-- Referencia compartida por dos anuncios.
SELECT pg_temp.lead('202', '+34 611 000 202', 'BC-DUP', NULL);
-- Ref. de un piso y Cod. de otro.
SELECT pg_temp.lead('203', '+34 611 000 203', 'BC-100', '222');
-- Piso exacto sin regla.
SELECT pg_temp.lead('204', '+34 611 000 204', 'BC-700', NULL);
-- Sin ningún dato del anuncio.
SELECT pg_temp.lead('205', '+34 611 000 205', NULL, NULL);
SELECT route_leads(ARRAY[pg_temp.l('201'), pg_temp.l('202'), pg_temp.l('203'), pg_temp.l('204'), pg_temp.l('205')]);
SELECT test_util.ok((SELECT routing_reason FROM idealista_leads WHERE id = pg_temp.l('201')) = 'link_unverified'
  AND (SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('201')) IS NULL
  AND (SELECT property_link_method FROM idealista_leads WHERE id = pg_temp.l('201')) = 'unverified',
  'D02 · un enlace por dirección no reparte aunque el piso tenga regla');
SELECT test_util.ok((SELECT routing_reason FROM idealista_leads WHERE id = pg_temp.l('202')) = 'link_ambiguous'
  AND (SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('202')) IS NULL,
  'D05 · dos anuncios candidatos: ambiguo, nunca el primero');
SELECT test_util.ok((SELECT property_link_method FROM idealista_leads WHERE id = pg_temp.l('203')) = 'conflict'
  AND (SELECT routing_reason FROM idealista_leads WHERE id = pg_temp.l('203')) = 'link_conflict',
  'D05 · Ref. y Cod. de pisos distintos: conflicto');
SELECT test_util.ok((SELECT routing_reason FROM idealista_leads WHERE id = pg_temp.l('204')) = 'no_rule',
  'R05 · piso exacto sin regla: pendiente de reparto');
SELECT test_util.ok((SELECT property_link_method FROM idealista_leads WHERE id = pg_temp.l('205')) = 'none'
  AND (SELECT routing_status FROM idealista_leads WHERE id = pg_temp.l('205')) = 'pending',
  'D04 · sin ID ni enlace: por verificar y pendiente');

-- Asesor que ya no puede llevar clientes.
SELECT routing_set_rules(:ADM, 'es', :BAJA, '[{"property_id":"d0000000-0000-0000-0000-000000000004","expected_version":0}]');
UPDATE profiles SET role = 'viewer' WHERE id = :BAJA;
SELECT pg_temp.lead('206', '+34 611 000 206', 'BC-700', NULL);
SELECT route_lead(pg_temp.l('206'));
SELECT test_util.ok((SELECT routing_reason FROM idealista_leads WHERE id = pg_temp.l('206')) = 'advisor_inactive',
  'R05 · asesor inactivo: pendiente de reparto');

-- El administrador asigna a mano lo pendiente.
SELECT assign_lead_admin(:ADM, pg_temp.l('206'), :SOFIA, NULL, 0);
SELECT test_util.ok((SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('206')) = :SOFIA
  AND (SELECT assignment_source FROM idealista_leads WHERE id = pg_temp.l('206')) = 'manual_admin',
  'R05 · asignación manual disponible para admin');
SELECT test_util.expect_error(format('SELECT assign_lead_admin(%L, %L, %L, NULL, 0)',
  :EXE, pg_temp.l('205'), :SOFIA), 'forbidden');
SELECT test_util.expect_error(format('SELECT assign_lead_admin(%L, %L, %L, NULL, 0)',
  :ADM, pg_temp.l('206'), :JAIME), 'version_conflict');
SELECT test_util.expect_error(format('SELECT assign_lead_admin(%L, %L, %L, NULL, 1)',
  :ADM, pg_temp.l('206'), :JAIME), 'reason_required');

-- ═══ R03 · la prioridad manual sobrevive a reintentos y cambios de regla ════
SELECT assign_lead_admin(:ADM, pg_temp.l('101'), :SOFIA, 'Habla francés', 1);
SELECT route_lead(pg_temp.l('101'));
SELECT routing_set_rules(:ADM, 'es', :SOFIA, '[{"property_id":"d0000000-0000-0000-0000-000000000001","expected_version":1}]');
SELECT routing_set_rules(:ADM, 'es', :JAIME, '[{"property_id":"d0000000-0000-0000-0000-000000000001","expected_version":2}]');
SELECT route_lead(pg_temp.l('101'));
SELECT test_util.ok((SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('101')) = :SOFIA
  AND (SELECT assignment_source FROM idealista_leads WHERE id = pg_temp.l('101')) = 'manual_admin',
  'R03 · la asignación manual se conserva tras reintentos y cambios de regla');
SELECT test_util.ok(EXISTS (SELECT 1 FROM assignment_events WHERE kind = 'lead_manual'
  AND lead_id = pg_temp.l('101') AND actor_id = :ADM AND previous_advisor_id = :JAIME
  AND new_advisor_id = :SOFIA AND reason = 'Habla francés' AND assignment_version = 2),
  'R03 · auditoría completa: actor, anterior, nuevo, motivo y versión');
SELECT test_util.ok(EXISTS (SELECT 1 FROM lead_activity WHERE lead_id = pg_temp.l('101')
  AND kind = 'assignment' AND author_id = :ADM), 'R03 · queda en el hilo de la solicitud con su autor');

-- ═══ R04 · cambio de asesor de un piso ══════════════════════════════════════
-- 102 llegó por P3 y es de Jaime. Una solicitud que llegó ANTES del cambio y
-- seguía pendiente no se reasigna sola.
SELECT pg_temp.lead('301', '+34 611 000 301', 'BC-300', NULL);
UPDATE idealista_leads SET created_at = now() - interval '1 day' WHERE id = pg_temp.l('301');
UPDATE property_routing_rules SET active = false, version = version + 1
 WHERE property_id = :P3;  -- sin regla cuando llegó
SELECT route_lead(pg_temp.l('301'));
SELECT routing_set_rules(:ADM, 'es', :SOFIA,
  format('[{"property_id":%s,"expected_version":2}]', to_json(:P3::text))::jsonb, 'Reparto nuevo');
SELECT route_lead(pg_temp.l('301'));
SELECT pg_temp.lead('302', '+34 611 000 302', 'BC-300', NULL);
SELECT route_lead(pg_temp.l('302'));
SELECT test_util.ok((SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('302')) = :SOFIA,
  'R04 · los nuevos siguen la regla nueva');
SELECT test_util.ok((SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('102')) = :JAIME,
  'R04 · los ya asignados conservan a su responsable');
SELECT test_util.ok((SELECT routing_reason FROM idealista_leads WHERE id = pg_temp.l('301')) = 'arrived_before_rule'
  AND (SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('301')) IS NULL,
  'R04 · el histórico no se reasigna de forma implícita');

-- ═══ R06 · dos administradores sobre el mismo reparto ═══════════════════════
DO $$
DECLARE a jsonb; b jsonb;
BEGIN
  a := routing_set_rules('a0000000-0000-0000-0000-00000000000a', 'es', 'b0000000-0000-0000-0000-00000000000a',
    '[{"property_id":"d0000000-0000-0000-0000-000000000002","expected_version":1}]');
  b := routing_set_rules('a0000000-0000-0000-0000-00000000000b', 'es', 'b0000000-0000-0000-0000-00000000000b',
    '[{"property_id":"d0000000-0000-0000-0000-000000000002","expected_version":1}]');
  PERFORM test_util.ok(a->0->>'result' = 'replaced' AND b->0->>'result' = 'version_conflict'
    AND (b->0->>'current_advisor_id')::uuid = 'b0000000-0000-0000-0000-00000000000a',
    'R06 · el segundo ve el conflicto y quién lo cambió; no sobrescribe');
  b := routing_set_rules('a0000000-0000-0000-0000-00000000000b', 'es', 'b0000000-0000-0000-0000-00000000000b',
    '[{"property_id":"d0000000-0000-0000-0000-000000000004","expected_version":0}]');
  PERFORM test_util.ok(b->0->>'result' = 'version_conflict',
    'R06 · crear una regla que otro ya creó también es conflicto');
END $$;
SELECT test_util.ok((SELECT advisor_id FROM property_routing_rules WHERE property_id = :P2) = :JAIME,
  'R06 · gana el primero, sin sobrescritura silenciosa');

-- ═══ R10 · nueva publicación de un piso ya repartido ════════════════════════
INSERT INTO idealista_listings (id, property_id, reference_code, idealista_property_id)
VALUES ('e0000000-0000-0000-0000-000000000011', :P1, 'BC-101', '112');
SELECT pg_temp.lead('401', '+34 611 000 401', NULL, '112');
SELECT route_lead(pg_temp.l('401'));
SELECT test_util.ok((SELECT matched_property_id FROM idealista_leads WHERE id = pg_temp.l('401')) = :P1
  AND (SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('401')) = :JAIME,
  'R10 · el anuncio nuevo se resuelve exacto y hereda la regla del inmueble');
SELECT test_util.ok((SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('103')) IS NULL
  OR (SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('103')) <> 'e0000000-0000-0000-0000-000000000011',
  'D11 · las solicitudes anteriores mantienen su origen');

-- ═══ R09 · Z05 · un cliente, un asesor ══════════════════════════════════════
-- Lucía (cliente verificado de Jaime) consulta Goya, que es de… Jaime ahora;
-- se pasa Goya a Sofía para que la regla diga otra cosa.
UPDATE profiles SET assigned_advisor_id = :JAIME, advisor_assignment_version = 1 WHERE id = :LUCIA;
SELECT routing_set_rules(:ADM, 'es', :SOFIA, '[{"property_id":"d0000000-0000-0000-0000-000000000002","expected_version":2}]');
SELECT pg_temp.lead('501', '+34 600 000 001', 'BC-200', NULL);
UPDATE idealista_leads SET client_id = :LUCIA, converted_at = now() WHERE id = pg_temp.l('501');
SELECT route_lead(pg_temp.l('501'));
SELECT test_util.ok((SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('501')) = :JAIME
  AND (SELECT assignment_source FROM idealista_leads WHERE id = pg_temp.l('501')) = 'inherited',
  'R09 · conserva al asesor del cliente aunque el piso sea de otra');
-- Sin vincular, el mismo teléfono no hereda (identidad sin verificar) ni se
-- reparte por regla: pendiente para que lo mire un administrador.
SELECT pg_temp.lead('502', '+34 600 000 001', 'BC-200', NULL);
SELECT route_lead(pg_temp.l('502'));
SELECT test_util.ok((SELECT routing_reason FROM idealista_leads WHERE id = pg_temp.l('502')) = 'possible_existing_client'
  AND (SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('502')) IS NULL,
  'R09 · mismo teléfono sin verificar: ni hereda ni crea un segundo asesor');

-- Cliente con asesor y solicitud con otro responsable: conflicto visible.
SELECT pg_temp.lead('503', '+34 622 000 503', NULL, NULL);
SELECT assign_lead_admin(:ADM, pg_temp.l('503'), :SOFIA, NULL, 0);
UPDATE idealista_leads SET client_id = :LUCIA, converted_at = now() WHERE id = pg_temp.l('503');
SELECT route_lead(pg_temp.l('503'));
SELECT test_util.ok((SELECT routing_status FROM idealista_leads WHERE id = pg_temp.l('503')) = 'conflict'
  AND (SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('503')) = :SOFIA,
  'R09 · dos responsables posibles: conflicto visible, nada cambia en silencio');
SELECT test_util.expect_error(format('SELECT assign_lead_admin(%L, %L, %L, %L, 1)',
  :ADM, pg_temp.l('503'), :JAIME, 'x'), 'client_linked');

-- Cliente sin asesor que se vincula a una solicitud con responsable: lo hereda.
SELECT pg_temp.lead('504', '+34 600 000 002', NULL, NULL);
SELECT assign_lead_admin(:ADM, pg_temp.l('504'), :SOFIA, NULL, 0);
UPDATE idealista_leads SET client_id = :MARTA, converted_at = now() WHERE id = pg_temp.l('504');
SELECT route_lead(pg_temp.l('504'));
SELECT test_util.ok((SELECT assigned_advisor_id FROM profiles WHERE id = :MARTA) = :SOFIA
  AND (SELECT advisor_assignment_source FROM profiles WHERE id = :MARTA) = 'lead',
  'R09 · el cliente sin asesor toma el de su primera solicitud');

-- ═══ R11 · reasignar un cliente con varias consultas ════════════════════════
SELECT pg_temp.lead('601', '+34 600 000 001', 'BC-100', NULL);
SELECT pg_temp.lead('602', '+34 600 000 001', 'BC-300', NULL);
UPDATE idealista_leads SET client_id = :LUCIA, converted_at = now(), next_action_at = now() + interval '1 day'
 WHERE id IN (pg_temp.l('601'), pg_temp.l('602'));
SELECT route_leads(ARRAY[pg_temp.l('601'), pg_temp.l('602')]);
UPDATE idealista_leads SET status = 'descartado' WHERE id = pg_temp.l('602');
INSERT INTO lead_activity (lead_id, author_id, kind, outcome) VALUES (pg_temp.l('601'), :JAIME, 'call', 'answered');

SELECT test_util.expect_error(format('SELECT reassign_client_admin(%L, %L, %L, %L, 1)',
  :EXE, :LUCIA, :SOFIA, 'x'), 'forbidden');
SELECT test_util.expect_error(format('SELECT reassign_client_admin(%L, %L, %L, NULL, 1)',
  :ADM, :LUCIA, :SOFIA), 'reason_required');
SELECT test_util.expect_error(format('SELECT reassign_client_admin(%L, %L, %L, %L, 0)',
  :ADM, :LUCIA, :SOFIA, 'x'), 'version_conflict');
DO $$
DECLARE r jsonb;
BEGIN
  r := reassign_client_admin('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-00000000000b', 'Se muda a la zona de Sofía', 1);
  PERFORM test_util.ok(r->>'outcome' = 'reassigned' AND (r->>'leads')::int = 3 AND (r->>'tasks')::int = 1,
    'R11 · alcance: tres solicitudes abiertas (incluida la de conflicto) y una tarea pendiente');
END $$;
SELECT test_util.ok((SELECT assigned_advisor_id FROM profiles WHERE id = :LUCIA) = :SOFIA
  AND (SELECT advisor_assignment_source FROM profiles WHERE id = :LUCIA) = 'manual_admin',
  'R11 · nuevo asesor en el cliente');
SELECT test_util.ok((SELECT count(*) FROM idealista_leads WHERE client_id = :LUCIA
  AND status <> 'descartado' AND assigned_to = :SOFIA AND routing_status = 'assigned') = 3,
  'R11 · y en sus solicitudes abiertas (con sus tareas)');
SELECT test_util.ok((SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('602')) = :JAIME,
  'R11 · la descartada (cerrada) no se toca');
SELECT test_util.ok(EXISTS (SELECT 1 FROM lead_activity WHERE lead_id = pg_temp.l('601')
  AND kind = 'call' AND author_id = :JAIME), 'R11 · los contactos anteriores conservan su autor');
SELECT test_util.ok((SELECT count(*) FROM zinto_owner_sync WHERE subject_kind = 'client'
  AND subject_id = :LUCIA AND advisor_id = :SOFIA AND assignment_version = 2 AND status = 'pending') = 1,
  'R11 · la conversación del cliente queda en cola para Zinto con la versión nueva');
SELECT test_util.ok((SELECT reason FROM assignment_events WHERE kind = 'client_reassign' AND client_id = :LUCIA)
  = 'Se muda a la zona de Sofía', 'R11 · el traspaso queda registrado con su motivo');
-- Después de reasignar, una consulta nueva de Lucía por un piso de Jaime sigue con Sofía.
SELECT pg_temp.lead('603', '+34 600 000 001', 'BC-100', NULL);
UPDATE idealista_leads SET client_id = :LUCIA, converted_at = now() WHERE id = pg_temp.l('603');
SELECT route_lead(pg_temp.l('603'));
SELECT test_util.ok((SELECT assigned_to FROM idealista_leads WHERE id = pg_temp.l('603')) = :SOFIA,
  'R11 · las consultas siguientes conservan a Sofía aunque lleguen por Castelló');

-- ═══ R08 · Z02 · Z03 · Zinto falla o confirma fuera de orden ════════════════
DO $$
DECLARE v1 uuid; v2 uuid; res text;
BEGIN
  -- Pedro: cliente sin asesor, dos reasignaciones seguidas → v1 y v2.
  PERFORM reassign_client_admin('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-00000000000a', 'Alta', 0);
  SELECT id INTO v1 FROM zinto_owner_sync WHERE subject_id = 'c0000000-0000-0000-0000-000000000003' AND assignment_version = 1;
  res := zinto_owner_sync_ack(v1, 1, false, 'timeout');
  PERFORM test_util.ok(res = 'error', 'Z03 · un fallo de Zinto queda como Error');
  PERFORM test_util.ok((SELECT assigned_advisor_id FROM profiles WHERE id = 'c0000000-0000-0000-0000-000000000003')
    = 'b0000000-0000-0000-0000-00000000000a', 'Z03 · y no borra al responsable del CRM');
  res := zinto_owner_sync_retry('a0000000-0000-0000-0000-00000000000a', v1);
  PERFORM test_util.ok(res = 'requeued' AND (SELECT count(*) FROM zinto_owner_sync
    WHERE subject_id = 'c0000000-0000-0000-0000-000000000003') = 1, 'Z03 · reintento sin duplicados');
  PERFORM test_util.expect_error(format('SELECT zinto_owner_sync_retry(%L, %L)',
    'a0000000-0000-0000-0000-0000000000e1', v1), 'forbidden');

  PERFORM reassign_client_admin('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000003',
    'b0000000-0000-0000-0000-00000000000b', 'Cambio', 1);
  SELECT id INTO v2 FROM zinto_owner_sync WHERE subject_id = 'c0000000-0000-0000-0000-000000000003' AND assignment_version = 2;
  PERFORM test_util.ok((SELECT status FROM zinto_owner_sync WHERE id = v1) = 'superseded',
    'Z02 · la versión vieja sin enviar queda superada');
  res := zinto_owner_sync_ack(v1, 1, true);
  PERFORM test_util.ok(res = 'stale' AND (SELECT status FROM zinto_owner_sync WHERE id = v2) = 'pending'
    AND (SELECT assigned_advisor_id FROM profiles WHERE id = 'c0000000-0000-0000-0000-000000000003')
      = 'b0000000-0000-0000-0000-00000000000b',
    'R08 · un acuse antiguo no revierte la asignación vigente');
  res := zinto_owner_sync_ack(v2, 2, true);
  PERFORM test_util.ok(res = 'acked', 'Z01 · el acuse de la versión vigente la confirma');
  res := zinto_owner_sync_retry('a0000000-0000-0000-0000-00000000000a', v1);
  PERFORM test_util.ok(res = 'not_retryable', 'Z02 · no se puede reintentar una versión superada');
END $$;

-- ═══ Vínculo: corrección con evidencia ══════════════════════════════════════
-- 701: enlazada por dirección a Goya; la captura de detalle trae la Ref. de
-- Castelló → se corrige, queda escrito y deja de estar «sin evidencia».
SELECT pg_temp.lead('701', '+34 611 000 701', NULL, NULL, 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002');
SELECT resolve_lead_link(pg_temp.l('701'), true);
SELECT test_util.ok((SELECT property_link_method FROM idealista_leads WHERE id = pg_temp.l('701')) = 'unverified',
  'Vínculo · sin Ref. ni Cod. el enlace existente es «sin evidencia»');
UPDATE idealista_leads SET property_ref = 'BC-100' WHERE id = pg_temp.l('701');
SELECT test_util.ok(resolve_lead_link(pg_temp.l('701'), false) = 'conflict'
  AND (SELECT matched_property_id FROM idealista_leads WHERE id = pg_temp.l('701')) = :P2,
  'Histórico · clasificar no reescribe: la contradicción queda como conflicto');
SELECT resolve_lead_link(pg_temp.l('701'), true);
SELECT test_util.ok((SELECT matched_property_id FROM idealista_leads WHERE id = pg_temp.l('701')) = :P1
  AND (SELECT matched_listing_id FROM idealista_leads WHERE id = pg_temp.l('701')) = 'e0000000-0000-0000-0000-000000000001'
  AND (SELECT property_link_method FROM idealista_leads WHERE id = pg_temp.l('701')) = 'ref',
  'Vínculo · la referencia exacta sustituye al enlace por dirección');
SELECT test_util.ok(EXISTS (SELECT 1 FROM assignment_events WHERE kind = 'lead_link_fixed'
  AND lead_id = pg_temp.l('701') AND details->>'previous_property_id' = 'd0000000-0000-0000-0000-000000000002'),
  'Vínculo · la corrección guarda el antes');

-- Corrección manual autorizada: ninguna captura posterior la deshace.
SELECT test_util.expect_error(format('SELECT set_lead_link_manual(%L, %L, %L, NULL, %L)',
  :ADM, pg_temp.l('205'), :P4, ''), 'reason_required');
SELECT set_lead_link_manual(:ADM, pg_temp.l('205'), :P4, NULL, 'El cliente envió el enlace');
UPDATE idealista_leads SET property_ref = 'BC-100' WHERE id = pg_temp.l('205');
SELECT resolve_lead_link(pg_temp.l('205'), true);
SELECT test_util.ok((SELECT matched_property_id FROM idealista_leads WHERE id = pg_temp.l('205')) = :P4
  AND (SELECT property_link_method FROM idealista_leads WHERE id = pg_temp.l('205')) = 'manual',
  'D12 · una corrección autorizada no la pisa una captura');
SELECT test_util.expect_error(format('SELECT set_lead_link_manual(%L, %L, %L, %L, %L)',
  :ADM, pg_temp.l('205'), :P2, 'e0000000-0000-0000-0000-000000000001', 'x'), 'link_incoherent');

-- ═══ U01 · U02 · registrar contacto + tarea, una sola vez ══════════════════
DO $$
DECLARE r jsonb; k uuid := gen_random_uuid(); n_act int; lead uuid := 'f0000000-0000-0000-0000-000000000204';
BEGIN
  PERFORM test_util.expect_error(format('SELECT lead_register_contact(%L, %L, ''call'', NULL, NULL, NULL, NULL, false, NULL)',
    'b0000000-0000-0000-0000-00000000000a', lead), 'outcome_required');
  r := lead_register_contact('b0000000-0000-0000-0000-00000000000a', lead, 'call', 'no_answer', 'No contesta',
    now() + interval '1 day', 'Volver a llamar para confirmar visita', false, k);
  PERFORM test_util.ok(r->>'outcome' = 'saved', 'U01 · No contesta + tarea: guardado');
  SELECT count(*) INTO n_act FROM lead_activity WHERE lead_id = lead;
  r := lead_register_contact('b0000000-0000-0000-0000-00000000000a', lead, 'call', 'no_answer', 'No contesta',
    now() + interval '1 day', 'Volver a llamar para confirmar visita', false, k);
  PERFORM test_util.ok(r->>'outcome' = 'duplicate' AND (SELECT count(*) FROM lead_activity WHERE lead_id = lead) = n_act,
    'U02 · el doble envío no duplica registros');
  PERFORM test_util.ok((SELECT next_action_note FROM idealista_leads WHERE id = lead) = 'Volver a llamar para confirmar visita'
    AND EXISTS (SELECT 1 FROM lead_activity WHERE lead_id = lead AND kind = 'follow_up'),
    'U01 · resultado y recordatorio visibles en actividad');
  PERFORM test_util.ok((SELECT commercial_state FROM lead_inbox_facts WHERE id = lead) = 'contacted',
    'U01 · «No contesta» cuenta como intento, no como respuesta');
  r := lead_register_contact('b0000000-0000-0000-0000-00000000000a', lead, 'call', 'answered', NULL, NULL, NULL, true, gen_random_uuid());
  PERFORM test_util.ok((SELECT next_action_at FROM idealista_leads WHERE id = lead) IS NULL
    AND (SELECT commercial_state FROM lead_inbox_facts WHERE id = lead) = 'engaged'
    AND (SELECT status FROM idealista_leads WHERE id = lead) = 'nuevo',
    'U01 · completar la tarea retira el recordatorio y no cierra la solicitud');
END $$;

-- ═══ Auditoría, vista y permisos de las funciones ══════════════════════════
SELECT test_util.expect_error('UPDATE assignment_events SET reason = ''x''', 'assignment_events_append_only');
SELECT test_util.expect_error('DELETE FROM assignment_events', 'assignment_events_append_only');

SELECT test_util.ok((SELECT routing_status FROM lead_inbox_facts WHERE id = pg_temp.l('204')) = 'pending'
  AND (SELECT property_link_method FROM lead_inbox_facts WHERE id = pg_temp.l('102')) = 'code',
  'Vista · expone el vínculo y el reparto');

SET ROLE anon;
SELECT test_util.expect_error(format('SELECT route_lead(%L)', 'f0000000-0000-0000-0000-000000000205'::uuid), 'insufficient_privilege');
SELECT test_util.expect_error(format('SELECT assign_lead_admin(%L, %L, %L, NULL, 0)',
  :ADM, 'f0000000-0000-0000-0000-000000000205'::uuid, :SOFIA), 'insufficient_privilege');
SELECT test_util.expect_error('SELECT * FROM property_routing_rules', 'insufficient_privilege');
RESET ROLE;
SET ROLE authenticated;
SELECT test_util.expect_error(format('SELECT reassign_client_admin(%L, %L, %L, %L, 3)',
  :ADM, :LUCIA, :JAIME, 'x'), 'insufficient_privilege');
SELECT test_util.expect_error('SELECT * FROM assignment_events', 'insufficient_privilege');
RESET ROLE;
SET ROLE service_role;
SELECT test_util.ok(route_lead('f0000000-0000-0000-0000-000000000205'::uuid) IS NOT NULL, 'Permisos · service_role sí puede');
RESET ROLE;

\echo 'test-solicitudes-reparto.sql: OK'
