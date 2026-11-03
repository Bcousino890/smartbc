-- ============================================================================
-- 0241 · Solicitudes: anuncios retirados y republicados sin perder el origen
-- ============================================================================
-- Fabricio (2026-11-03): los anuncios se suben y se bajan a menudo. Lo nuevo
-- tiene que verse como nuevo; lo de anuncios ya retirados, aparte, mientras
-- dure su plazo (30 días, 0238); y el origen de cada cliente siempre.
--
--   · El historial de códigos (0237, idealista_listing_codes) seguía solo el
--     código de la extensión (idealista_property_id). Un anuncio borrado y
--     vuelto a publicar por la API cambia de api_property_id: sin historial,
--     las solicitudes que trajeron el id antiguo dejarían de encontrar su
--     anuncio. Ahora también se guardan api_property_id y su clon.
--   · La vista dice si el anuncio identificado ya está retirado
--     (listing_retired): archivado en el CRM, dado de baja por la API o
--     despublicado. «Por piso» los separa de los publicados.
--
-- Un anuncio publicado no se borra nunca de la base (se archiva, ver
-- /api/admin/idealista/delete-listing), y la solicitud guarda además el
-- título, el precio y el código que llegaron: el origen no se pierde.
-- Aditiva e idempotente. Reversión: rollback-0241.sql.
-- ============================================================================

-- ─── 1 · Historial también de los ids de la API ──────────────────────────────
ALTER TABLE idealista_listing_codes DROP CONSTRAINT IF EXISTS idealista_listing_codes_source_check;
ALTER TABLE idealista_listing_codes
  ADD CONSTRAINT idealista_listing_codes_source_check CHECK (source IN ('catalogo', 'inicial', 'api'));

CREATE OR REPLACE FUNCTION idealista_listing_api_code_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old text;
  v_new text;
  i integer;
BEGIN
  FOR i IN 1..2 LOOP
    IF i = 1 THEN
      v_new := NEW.api_property_id::text;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.api_property_id::text END;
    ELSE
      v_new := NEW.api_clone_property_id::text;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN OLD.api_clone_property_id::text END;
    END IF;
    CONTINUE WHEN TG_OP = 'UPDATE' AND v_old IS NOT DISTINCT FROM v_new;
    IF v_old IS NOT NULL THEN
      UPDATE idealista_listing_codes SET valid_to = now()
       WHERE listing_id = NEW.id AND idealista_property_id = v_old AND valid_to IS NULL;
    END IF;
    IF v_new IS NOT NULL THEN
      INSERT INTO idealista_listing_codes (listing_id, idealista_property_id, reference_code, property_id, source)
      VALUES (NEW.id, v_new, NEW.reference_code, NEW.property_id, 'api')
      ON CONFLICT (listing_id, idealista_property_id) DO UPDATE SET valid_to = NULL;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_idealista_listing_api_code_history ON idealista_listings;
CREATE TRIGGER trg_idealista_listing_api_code_history
  AFTER INSERT OR UPDATE OF api_property_id, api_clone_property_id ON idealista_listings
  FOR EACH ROW EXECUTE FUNCTION idealista_listing_api_code_history();

-- Punto de partida: los ids de la API vigentes.
INSERT INTO idealista_listing_codes (listing_id, idealista_property_id, reference_code, property_id, source)
SELECT x.id, v.code, x.reference_code, x.property_id, 'api'
  FROM idealista_listings x
  CROSS JOIN LATERAL (VALUES (x.api_property_id::text), (x.api_clone_property_id::text)) AS v(code)
 WHERE v.code IS NOT NULL
ON CONFLICT (listing_id, idealista_property_id) DO NOTHING;

REVOKE ALL ON FUNCTION idealista_listing_api_code_history() FROM PUBLIC, anon, authenticated;

-- ─── 2 · Vista (definición viva; sustituye a la de 0238) ─────────────────────
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
),
cards AS (
  SELECT
    l.id AS lead_id,
    array_agg(DISTINCT d.op) FILTER (WHERE d.op IS NOT NULL) AS ops
  FROM idealista_leads l
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(l.properties) = 'array'
       AND jsonb_array_length(l.properties) > 1 THEN l.properties
      ELSE '[]'::jsonb
    END
  ) AS c(card)
  CROSS JOIN LATERAL (SELECT lead_price_operation(c.card ->> 'price')) AS d(op)
  GROUP BY l.id
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

  l.avatar_url                                                  AS avatar_url,

  COALESCE(mg.absorbed, 0)                                      AS merged_count,

  CASE
    WHEN px.op IS NOT NULL                                             THEN px.op
    WHEN il.operation = 'sale'                                         THEN 'sale'
    WHEN p.id IS NOT NULL
     AND NOT (p.operations @> ARRAY['sale', 'rent']::text[])           THEN p.operation::text
    ELSE NULL
  END                                                           AS lead_operation,

  CASE
    WHEN px.op IS NOT NULL                                             THEN 'price'
    WHEN il.operation = 'sale'                                         THEN 'listing'
    WHEN p.id IS NOT NULL
     AND NOT (p.operations @> ARRAY['sale', 'rent']::text[])           THEN 'property'
    ELSE NULL
  END                                                           AS operation_source,

  -- ── 0237 · nuevas, al final ──
  l.property_link_method                                        AS property_link_method,
  l.routing_status                                              AS routing_status,
  l.routing_reason                                              AS routing_reason,
  l.assignment_source                                           AS assignment_source,
  l.assignment_version                                          AS assignment_version,
  -- Para buscar por ID del anuncio y por referencia interna.
  l.idealista_code                                              AS idealista_code,
  l.property_ref                                                AS property_ref,
  -- ── 0238 · nuevas, al final ──
  -- Portada del anuncio IDENTIFICADO (ficha propia o anuncio de Idealista):
  -- la pantalla solo la enseña con vínculo exacto.
  COALESCE(p.cover_photo_url, il.photo_ids[1])                  AS listing_cover_url,
  -- Código público del anuncio en idealista.com, para enlazarlo.
  COALESCE(il.idealista_property_id, il.api_property_id::text)  AS listing_ad_code,
  l.expired_at                                                  AS expired_at,
  -- ── 0241 · nueva, al final ──
  -- El anuncio identificado ya no está publicado (archivado en el CRM, dado
  -- de baja por la API o despublicado). Manda el anuncio de Idealista; si
  -- solo hay ficha propia, su archivo.
  CASE
    WHEN il.id IS NOT NULL THEN (il.archived_at IS NOT NULL
                                 OR il.idealista_state IN ('archived', 'unpublished')
                                 OR il.api_state IN ('inactive', 'deleted'))
    WHEN p.id  IS NOT NULL THEN (p.archived_at IS NOT NULL)
    ELSE false
  END                                                           AS listing_retired
FROM idealista_leads l
LEFT JOIN wa  ON wa.lead_id = l.id::text
LEFT JOIN act ON act.lead_id = l.id
LEFT JOIN mg  ON mg.merged_into_id = l.id
LEFT JOIN dup ON dup.tail = right(l.phone_digits, 9) AND length(l.phone_digits) >= 9
LEFT JOIN properties         p  ON p.id  = l.matched_property_id
LEFT JOIN idealista_listings il ON il.id = l.matched_listing_id
LEFT JOIN cards                 ON cards.lead_id = l.id
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN cardinality(cards.ops) > 1 THEN 'mixed'
    WHEN cardinality(cards.ops) = 1 THEN cards.ops[1]
    ELSE lead_price_operation(l.property_price)
  END AS op
) px
WHERE l.merged_into_id IS NULL
  AND l.expired_at IS NULL;

COMMENT ON VIEW lead_inbox_facts IS
  'Hechos derivados de cada lead para la Sales Inbox: WhatsApp, historial, duplicados, fusiones, estado comercial, venta/alquiler, (0237) vínculo y reparto, (0238) portada, código público y caducidad, (0241) anuncio retirado. Definición viva: migración 0241.';

NOTIFY pgrst, 'reload schema';
