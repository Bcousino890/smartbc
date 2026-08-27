-- ============================================================================
-- SmartBC · Unificación automática de leads de la misma persona
-- ============================================================================
-- Alguien escribe por un piso y al rato LLAMA: Idealista le da otro
-- conversation_id a la llamada ("call_…"), así que entra como lead aparte y el
-- asesor ve dos contactos donde hay una persona.
--
-- `merged_into_id` apunta al lead que se queda. NADA se borra: el absorbido
-- sigue en la tabla, solo deja de salir en la bandeja (WHERE de la vista), y
-- separarlo es poner la columna a NULL otra vez.
--
-- La regla de emparejamiento vive en lib/sales-inbox/merge.ts (teléfono igual
-- + segunda revisión por nombre que puede bloquear la fusión). Aquí solo está
-- el sitio donde se guarda el resultado.
--
-- Idempotente: post-deploy relanza las migraciones en cada despliegue.
-- ============================================================================

ALTER TABLE idealista_leads
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES idealista_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

-- Parcial: solo interesan las filas absorbidas, que son minoría.
CREATE INDEX IF NOT EXISTS idx_idealista_leads_merged_into
  ON idealista_leads(merged_into_id) WHERE merged_into_id IS NOT NULL;

-- Un lead absorbido no puede a su vez absorber a otro: sin esto una cadena
-- A→B→C dejaría el historial de A colgando de un lead que tampoco se ve.
ALTER TABLE idealista_leads
  DROP CONSTRAINT IF EXISTS idealista_leads_merge_not_self;
ALTER TABLE idealista_leads
  ADD CONSTRAINT idealista_leads_merge_not_self CHECK (merged_into_id IS NULL OR merged_into_id <> id);

CREATE OR REPLACE VIEW exige que las columnas ya existentes conserven
-- nombre, orden y tipo, y solo deja AÑADIR al final. Meterla en medio
-- obligaría a un DROP … CASCADE, que se llevaría por delante los permisos
-- de la vista. El resto de la definición es idéntica a la de 0142.
--
-- Idempotente: post-deploy relanza las migraciones en cada despliegue.
-- ============================================================================

CREATE OR REPLACE VIEW lead_inbox_facts AS
WITH wa AS (
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
mg AS (
  -- Leads absorbidos por cada superviviente.
  SELECT merged_into_id, count(*) AS absorbed
  FROM idealista_leads
  WHERE merged_into_id IS NOT NULL
  GROUP BY 1
),
dup AS (
  SELECT right(phone_digits, 9) AS tail
  FROM idealista_leads
  WHERE length(phone_digits) >= 9
    AND merged_into_id IS NULL
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

  GREATEST(
    COALESCE(wa.last_message_at, l.created_at),
    COALESCE(act.last_at, l.created_at)
  )                                                             AS last_activity_at,

  CASE
    WHEN l.client_id IS NOT NULL                                       THEN 'converted'
    WHEN l.status = 'descartado'                                       THEN 'discarded'
    WHEN COALESCE(wa.inbound, 0) > 0
      OR COALESCE(act.has_answered_call, false)                        THEN 'engaged'
    WHEN COALESCE(wa.outbound, 0) > 0
      OR COALESCE(act.has_touch, false)                                THEN 'contacted'
    ELSE 'new'
  END                                                           AS commercial_state,

  -- Nueva y última, por la restricción de CREATE OR REPLACE VIEW de arriba.
  l.avatar_url                                                  AS avatar_url,

  -- Cuántos leads se absorbieron en este. 0 = no se unificó nada. Se calcula
  -- aquí para que la bandeja pueda mostrar "2 consultas" sin una query extra.
  COALESCE(mg.absorbed, 0)                                      AS merged_count
FROM idealista_leads l
LEFT JOIN wa  ON wa.lead_id = l.id::text
LEFT JOIN act ON act.lead_id = l.id
LEFT JOIN mg  ON mg.merged_into_id = l.id
LEFT JOIN dup ON dup.tail = right(l.phone_digits, 9) AND length(l.phone_digits) >= 9
-- Los leads absorbidos DESAPARECEN de la bandeja: su historial ya vive en el
-- superviviente. Siguen en la tabla (nada se borra) y se pueden separar.
WHERE l.merged_into_id IS NULL;

COMMENT ON VIEW lead_inbox_facts IS
  'Hechos derivados de cada lead para la Sales Inbox: WhatsApp, historial, duplicados, estado comercial, foto de perfil y unificación. Los leads absorbidos (merged_into_id) no salen. La misma regla vive en lib/sales-inbox/derive.ts y npm run test:sales-inbox vigila que no se separen.';

COMMENT ON COLUMN idealista_leads.merged_into_id IS
  'Lead que absorbió a este (misma persona, mismo teléfono). NULL = lead normal. Nada se borra: separar es volver a poner NULL.';
