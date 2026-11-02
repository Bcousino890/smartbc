-- SOLO LECTURA. Estado de las solicitudes sintéticas del recorrido (QA-0237).
-- Se puede ejecutar tras cada paso: no escribe nada.
\set ON_ERROR_STOP 1
BEGIN READ ONLY;
SELECT l.conversation_id AS conv, l.name, l.property_ref AS ref, l.idealista_code AS cod,
       l.property_link_method AS vinculo, l.routing_status AS reparto, l.routing_reason AS motivo,
       l.assignment_source AS origen, a.full_name AS responsable, c.full_name AS cliente,
       ca.full_name AS asesor_del_cliente
  FROM idealista_leads l
  LEFT JOIN profiles a  ON a.id = l.assigned_to
  LEFT JOIN profiles c  ON c.id = l.client_id
  LEFT JOIN profiles ca ON ca.id = c.assigned_advisor_id
 WHERE l.conversation_id LIKE '99023700%'
 ORDER BY l.conversation_id;

SELECT e.occurred_at, e.kind, l.conversation_id AS conv, pa.full_name AS antes, pn.full_name AS despues,
       act.full_name AS autor, e.reason
  FROM assignment_events e
  LEFT JOIN idealista_leads l ON l.id = e.lead_id
  LEFT JOIN profiles pa  ON pa.id = e.previous_advisor_id
  LEFT JOIN profiles pn  ON pn.id = e.new_advisor_id
  LEFT JOIN profiles act ON act.id = e.actor_id
 WHERE l.conversation_id LIKE '99023700%'
    OR e.client_id IN (SELECT client_id FROM idealista_leads WHERE conversation_id LIKE '99023700%')
    OR e.listing_id IN (SELECT id FROM idealista_listings WHERE reference_code LIKE 'QA-0237-%')
 ORDER BY e.occurred_at;

SELECT s.subject_kind, s.assignment_version, s.status, s.blocked_reason, p.full_name AS asesor
  FROM zinto_owner_sync s LEFT JOIN profiles p ON p.id = s.advisor_id
 WHERE s.subject_id IN (SELECT id FROM idealista_leads WHERE conversation_id LIKE '99023700%')
    OR s.subject_id IN (SELECT client_id FROM idealista_leads WHERE conversation_id LIKE '99023700%')
 ORDER BY s.created_at;
ROLLBACK;
