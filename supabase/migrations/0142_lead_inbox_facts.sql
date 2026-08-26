-- ============================================================================
-- SmartBC · SALES INBOX — los hechos de cada lead, en una vista
-- ============================================================================
-- La bandeja pagina y filtra EN SERVIDOR, y el estado comercial se DERIVA de
-- hechos que viven en otras tablas (WhatsApp de Zinto, historial de contacto).
-- Sin esta vista habría que traerse los leads enteros al navegador para poder
-- filtrar por "nuevos" — que es exactamente el problema que veníamos a
-- arreglar.
--
-- ⚠️ La regla de derivación está escrita DOS veces: aquí, para poder filtrar y
-- ordenar en SQL, y en `lib/sales-inbox/derive.ts`, para pintar y para poder
-- probarla sin base de datos. Esa duplicación es deliberada y está vigilada:
-- `npm run test:sales-inbox` compara, lead a lead contra producción, que las
-- dos digan lo mismo. Si tocas una, toca la otra y ejecuta el test.
--
-- Idempotente: post-deploy relanza las migraciones en cada despliegue.
-- ============================================================================

CREATE OR REPLACE VIEW lead_inbox_facts AS
WITH wa AS (
  -- Un lead puede tener varias conversaciones (teléfonos distintos, rehacer el
  -- chat…). Se agregan todas: lo que importa es si SE LE ESCRIBIÓ y si CONTESTÓ.
  SELECT
    c.lead_id                                                   AS lead_id,
    min(c.id::text)                                             AS conversation_id,
    count(*) FILTER (WHERE m.type = 'sent')                     AS outbound,
    count(*) FILTER (WHERE m.type = 'received')                 AS inbound,
    min(m.created_at) FILTER (WHERE m.type = 'sent')            AS first_outbound_at,
    max(m.created_at)                                           AS last_message_at,
    max(m.created_at) FILTER (WHERE m.type = 'received')        AS last_inbound_at,
    max(m.created_at) FILTER (WHERE m.type = 'sent')            AS last_outbound_at
  FROM zinto_conversations c
  LEFT JOIN zinto_messages m ON m.conversation_id = c.id
  WHERE c.lead_id IS NOT NULL
  GROUP BY c.lead_id
),
act AS (
  SELECT
    a.lead_id,
    max(a.created_at)                                           AS last_at,
    bool_or(a.kind IN ('call', 'whatsapp', 'email'))            AS has_touch,
    bool_or(a.kind = 'call' AND a.outcome = 'answered')         AS has_answered_call,
    count(*)                                                    AS entries
  FROM lead_activity a
  GROUP BY a.lead_id
),
dup AS (
  -- Mismo teléfono en otro lead. No se fusiona nada: dos consultas de la misma
  -- persona pueden ser dos intenciones legítimas distintas.
  SELECT right(phone_digits, 9) AS tail
  FROM idealista_leads
  WHERE length(phone_digits) >= 9
  GROUP BY 1
  HAVING count(*) > 1
)
SELECT
  l.id,
  l.name,
  l.phone,
  l.phone_digits,
  l.is_international,
  l.message,
  l.property_title,
  l.property_price,
  l.property_image_url,
  l.matched_property_id,
  l.matched_listing_id,
  l.conversation_id                                             AS idealista_conversation_id,
  l.lead_type,
  l.suggested_type,
  l.status                                                      AS legacy_status,
  l.contact_status                                              AS legacy_contact_status,
  l.assigned_to,
  l.assigned_at,
  l.client_id,
  l.converted_at,
  l.converted_by,
  l.next_action_at,
  l.next_action_note,
  l.country,
  l.created_at,
  l.updated_at,

  wa.conversation_id                                            AS wa_conversation_id,
  COALESCE(wa.outbound, 0)                                      AS wa_outbound,
  COALESCE(wa.inbound, 0)                                       AS wa_inbound,
  wa.first_outbound_at                                          AS wa_first_outbound_at,
  wa.last_message_at                                            AS wa_last_message_at,
  -- Él escribió lo último y sigue sin respuesta: la señal más urgente que hay.
  COALESCE(
    wa.last_inbound_at IS NOT NULL
      AND (wa.last_outbound_at IS NULL OR wa.last_inbound_at > wa.last_outbound_at),
    false
  )                                                             AS wa_awaiting_reply,

  COALESCE(act.entries, 0)                                      AS activity_entries,
  act.last_at                                                   AS activity_last_at,
  COALESCE(act.has_touch, false)                                AS activity_has_touch,
  COALESCE(act.has_answered_call, false)                        AS activity_answered_call,

  (dup.tail IS NOT NULL)                                        AS duplicate_phone,

  -- La señal de vida más reciente, venga de donde venga.
  GREATEST(
    COALESCE(wa.last_message_at, l.created_at),
    COALESCE(act.last_at, l.created_at)
  )                                                             AS last_activity_at,

  -- ── Estado comercial ──────────────────────────────────────────────────────
  -- Mismo orden de fuerza que `deriveCommercialState`. Abrir el chat NO es
  -- contactar: hacen falta mensajes salientes o un contacto registrado.
  CASE
    WHEN l.client_id IS NOT NULL                                       THEN 'converted'
    WHEN l.status = 'descartado'                                       THEN 'discarded'
    WHEN COALESCE(wa.inbound, 0) > 0
      OR COALESCE(act.has_answered_call, false)                        THEN 'engaged'
    WHEN COALESCE(wa.outbound, 0) > 0
      OR COALESCE(act.has_touch, false)                                THEN 'contacted'
    ELSE 'new'
  END                                                           AS commercial_state
FROM idealista_leads l
LEFT JOIN wa  ON wa.lead_id = l.id::text
LEFT JOIN act ON act.lead_id = l.id
LEFT JOIN dup ON dup.tail = right(l.phone_digits, 9) AND length(l.phone_digits) >= 9;

COMMENT ON VIEW lead_inbox_facts IS
  'Hechos derivados de cada lead para la Sales Inbox: WhatsApp, historial, duplicados y estado comercial calculado. La misma regla vive en lib/sales-inbox/derive.ts y npm run test:sales-inbox vigila que no se separen.';
