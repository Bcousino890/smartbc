-- ============================================================================
-- 0238 · Solicitudes: vínculo exacto con lo publicado por API y caducidad
-- ============================================================================
-- Decisiones de Fabricio (2026-11-02, tras ver Solicitudes en producción):
--   · El anuncio consultado tiene que ser EXACTAMENTE el que contactó el
--     cliente. Un «Cod.» recibido se cruza también con los anuncios publicados
--     por la API en tiempo real (idealista_listings.api_property_id y su
--     clon), no solo con los publicados por la extensión.
--   · Una solicitud sin cliente caduca a los 30 días de llegar y se borra a
--     los 60: primero desaparece de la bandeja (expired_at), después se
--     elimina. Las que tienen cliente vinculado o un seguimiento futuro no
--     caducan. El barrido lo lanza la recepción de solicitudes y la ruta de
--     limpieza; no hace falta tocar el crontab del VPS.
--   · La vista enseña la portada del anuncio identificado y su código público.
-- Aditiva e idempotente, como 0237. Reversión: rollback-0238.sql.
-- ============================================================================

-- ─── 1 · Caducidad ───────────────────────────────────────────────────────────
ALTER TABLE idealista_leads ADD COLUMN IF NOT EXISTS expired_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_idealista_leads_retention
  ON idealista_leads (created_at) WHERE expired_at IS NULL AND client_id IS NULL;

-- Barrido: oculta a los p_hide_days y borra a los p_purge_days (desde la
-- llegada). Nunca toca una solicitud con cliente vinculado ni con un
-- seguimiento pendiente en el futuro. Las unificadas (merged_into_id) siguen a
-- su superviviente: si se borra la superviviente, sus donantes se van con ella
-- (si no, ON DELETE SET NULL de 0160 las haría reaparecer).
CREATE OR REPLACE FUNCTION lead_retention_sweep(p_hide_days integer DEFAULT 30, p_purge_days integer DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hidden integer := 0;
  v_purged integer := 0;
  v_donors integer := 0;
BEGIN
  IF p_hide_days IS NULL OR p_hide_days < 1 OR p_purge_days IS NULL OR p_purge_days <= p_hide_days THEN
    RAISE EXCEPTION 'invalid_retention';
  END IF;

  WITH h AS (
    UPDATE idealista_leads l
       SET expired_at = now()
     WHERE l.expired_at IS NULL
       AND l.client_id IS NULL
       AND l.merged_into_id IS NULL
       AND l.created_at < now() - make_interval(days => p_hide_days)
       AND (l.next_action_at IS NULL OR l.next_action_at < now())
    RETURNING l.id
  )
  SELECT count(*) INTO v_hidden FROM h;

  -- Donantes de una superviviente caducada: caducan con ella.
  UPDATE idealista_leads d
     SET expired_at = s.expired_at
    FROM idealista_leads s
   WHERE d.merged_into_id = s.id AND s.expired_at IS NOT NULL AND d.expired_at IS NULL;

  WITH victims AS (
    SELECT l.id FROM idealista_leads l
     WHERE l.expired_at IS NOT NULL
       AND l.client_id IS NULL
       AND l.merged_into_id IS NULL
       AND l.created_at < now() - make_interval(days => p_purge_days)
  ), donors AS (
    DELETE FROM idealista_leads d WHERE d.merged_into_id IN (SELECT id FROM victims) RETURNING d.id
  ), gone AS (
    DELETE FROM idealista_leads l WHERE l.id IN (SELECT id FROM victims) RETURNING l.id
  )
  SELECT (SELECT count(*) FROM gone), (SELECT count(*) FROM donors) INTO v_purged, v_donors;

  RETURN jsonb_build_object('hidden', v_hidden, 'purged', v_purged, 'purged_donors', v_donors);
END $$;

-- ─── 2 · «Cod.» también contra lo publicado por API ──────────────────────────
-- api_property_id es el id numérico que devuelve la Partner API al publicar;
-- api_clone_property_id, el del clon (mismo inmueble en la otra operación).
CREATE OR REPLACE FUNCTION listings_for_code(p_code text)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT x.id FROM idealista_listings x WHERE x.idealista_property_id = p_code
  UNION
  SELECT h.listing_id FROM idealista_listing_codes h WHERE h.idealista_property_id = p_code
  UNION
  SELECT x.id FROM idealista_listings x
   WHERE p_code ~ '^[0-9]{1,18}$'
     AND (x.api_property_id = p_code::bigint OR x.api_clone_property_id = p_code::bigint)
$$;

-- ─── 3 · Vista (definición viva; sustituye a la de 0237) ─────────────────────
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
  l.expired_at                                                  AS expired_at
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
  'Hechos derivados de cada lead para la Sales Inbox: WhatsApp, historial, duplicados, fusiones, estado comercial, venta/alquiler, (0237) vínculo y reparto, (0238) portada, código público y caducidad. Definición viva: migración 0238.';

-- ─── 4 · Permisos ────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['lead_retention_sweep(integer, integer)', 'listings_for_code(text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
