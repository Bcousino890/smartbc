-- SOLO PRUEBAS LOCALES (Postgres desechable de run-local.sh). Lo ejecuta ../simular-en-local.sh.
\set ON_ERROR_STOP 1
-- B2 · reparto (como la pantalla): A → QA 1, B → QA 2. C se queda SIN regla.
SELECT routing_set_rules('a1000000-0000-0000-0000-000000000001','es','a1000000-0000-0000-0000-000000000002',
  jsonb_build_array(jsonb_build_object('listing_id',(SELECT id FROM idealista_listings WHERE reference_code='QA-0237-A'),'expected_version',0)));
SELECT routing_set_rules('a1000000-0000-0000-0000-000000000001','es','a1000000-0000-0000-0000-000000000003',
  jsonb_build_array(jsonb_build_object('listing_id',(SELECT id FROM idealista_listings WHERE reference_code='QA-0237-B'),'expected_version',0)));
-- Ingesta simulada (upsert + route_leads + reprocesado). SIN tocar effective_from.
CREATE OR REPLACE FUNCTION pg_temp.ingesta(p_conv text, p_name text, p_phone text, p_ref text, p_code text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v uuid; r jsonb;
BEGIN
  INSERT INTO idealista_leads (conversation_id, name, phone, property_ref, idealista_code)
  VALUES (p_conv, p_name, p_phone, p_ref, p_code)
  ON CONFLICT (conversation_id) DO UPDATE SET updated_at = now() RETURNING id INTO v;
  r := route_leads(ARRAY[v]);
  PERFORM reconcile_unresolved_code_leads(50);
  RETURN r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.c(p_conv text) RETURNS idealista_leads LANGUAGE sql AS $$
  SELECT * FROM idealista_leads WHERE conversation_id = p_conv $$;
-- 1
SELECT pg_temp.ingesta('990237001','QA Persona Uno','+34 600 990 001','QA-0237-A','990237001');
SELECT test_util.ok((pg_temp.c('990237001')).assigned_to = 'a1000000-0000-0000-0000-000000000002', 'C1 · reparto por inmueble → QA 1');
-- 2
SELECT reassign_client_admin('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000003','Validación 0237',0);
SELECT pg_temp.ingesta('990237002','QA Cliente Dos','+34 600 990 002','QA-0237-A','990237001');
SELECT test_util.ok((pg_temp.c('990237002')).routing_reason = 'possible_existing_client' AND (pg_temp.c('990237002')).assigned_to IS NULL, 'C2 · antes de vincular: pendiente por posible cliente');
UPDATE idealista_leads SET client_id='a1000000-0000-0000-0000-000000000004', converted_at=now() WHERE conversation_id='990237002';
SELECT route_lead((pg_temp.c('990237002')).id);
SELECT test_util.ok((pg_temp.c('990237002')).assigned_to='a1000000-0000-0000-0000-000000000003', 'C2 · tras vincular: asesor del cliente (QA 2)');
-- 2b · misma persona que L1, otro anuncio (B): otra solicitud, sin repartir a QA 2 por la regla de B
SELECT pg_temp.ingesta('990237003','QA Persona Uno','+34 600 990 001','QA-0237-B','990237002');
SELECT test_util.ok((pg_temp.c('990237003')).merged_into_id IS NULL AND (pg_temp.c('990237001')).merged_into_id IS NULL
  AND (pg_temp.c('990237003')).routing_reason = 'possible_existing_client', 'C2b · otra solicitud visible, pendiente hasta vincularla a la persona');
-- 2b · se crea el cliente desde L1 (como «Crear cliente» en la ficha) y se vincula L3
UPDATE idealista_leads SET client_id='a1000000-0000-0000-0000-000000000005', converted_at=now() WHERE conversation_id='990237001';
SELECT route_lead((pg_temp.c('990237001')).id);
UPDATE idealista_leads SET client_id='a1000000-0000-0000-0000-000000000005', converted_at=now() WHERE conversation_id='990237003';
SELECT route_lead((pg_temp.c('990237003')).id);
SELECT test_util.ok((pg_temp.c('990237003')).assigned_to='a1000000-0000-0000-0000-000000000002'
  AND (SELECT assigned_advisor_id FROM profiles WHERE id='a1000000-0000-0000-0000-000000000005')='a1000000-0000-0000-0000-000000000002'
  AND (pg_temp.c('990237003')).merged_into_id IS NULL,
  'C2b · al vincularla, la otra solicitud comparte cliente y asesor (QA 1), sin unirse');
-- 3
SELECT lead_register_contact('a1000000-0000-0000-0000-000000000003',(pg_temp.c('990237002')).id,'call','no_answer',NULL, now()+interval '1 day','Volver a llamar',false, gen_random_uuid());
SELECT test_util.ok((reassign_client_admin('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000002','Validación 0237',1))->>'tasks' = '1', 'C3 · reasignación con su tarea');
SELECT test_util.expect_error($q$SELECT reassign_client_admin('a1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000003','x',2)$q$, 'forbidden');
-- 4 · antes de republicar
SELECT pg_temp.ingesta('990237004','QA Persona Dos','+34 600 990 004','QA-0237-A','990237009');
SELECT test_util.ok((pg_temp.c('990237004')).routing_reason = 'link_code_unresolved' AND (pg_temp.c('990237004')).matched_listing_id IS NULL, 'C4 · código sin catalogar: pendiente, sin anuncio A');
-- 4b · antes: C sin regla
SELECT pg_temp.ingesta('990237006','QA Persona Seis','+34 600 990 006','QA-0237-C','990237013');
SELECT test_util.ok((pg_temp.c('990237006')).routing_reason = 'link_code_unresolved', 'C4b · código sin catalogar en C: pendiente');
