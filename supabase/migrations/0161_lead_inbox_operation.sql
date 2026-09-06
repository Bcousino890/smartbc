-- ============================================================================
-- SmartBC · SALES INBOX — venta o alquiler, derivado de hechos
-- ============================================================================
-- `idealista_leads` no tiene columna de operación, y no la va a tener: el
-- inbox de Idealista no la da. Se deriva de tres señales, EN ESTE ORDEN:
--
--   1 · EL PRECIO DE LA TARJETA  ("2.400 €/mes" vs "450.000 €")
--       Va primero aunque parezca la señal más frágil, por tres razones: es lo
--       que el contacto MIRÓ al escribir (la ficha pudo cambiar de operación
--       después); es lo único que traen los leads sin ficha propia, que son
--       más de la mitad; y sus dos reglas fuertes son casi imposibles de
--       contradecir. Cuando no es concluyente, CALLA y cede el turno.
--
--   2 · idealista_listings.operation, SOLO cuando vale 'sale'.
--       'rent' ahí no es información: es el DEFAULT de la migración 0059, que
--       nunca se backfilleó, y además la ruta de guardado escribe
--       `body.operation ?? "rent"`. Dos defaults encadenados: 'rent' en esa
--       columna significa "nadie lo dijo".
--
--   3 · properties.operation, SALVO que la propiedad sea DUAL.
--       Si operations contiene 'sale' Y 'rent', la ficha no sabe qué quería el
--       contacto: se abstiene en vez de inventar. Ahí el precio ya habrá
--       hablado, o no habla nadie.
--
-- Cuarto valor posible: 'mixed'. Un hilo puede preguntar por varias
-- propiedades (idealista_leads.properties, jsonb) con operaciones distintas.
-- Ni 'sale' ni 'rent' serían ciertos y NULL lo escondería de los dos filtros;
-- 'mixed' entra en ambos y no miente en ninguno.
--
-- Y NULL = "sin determinar" es un estado de PRIMERA CLASE, no un hueco: hoy lo
-- tiene mucha gente, y esconderlo sería peor que enseñarlo.
--
-- ⚠️ Igual que el estado comercial (0142), la rama del PRECIO vive dos veces:
-- aquí, en `lead_price_operation()`, para poder filtrar en SQL sin traerse la
-- bandeja al navegador, y en `deriveOperationFromPrice()` de
-- lib/sales-inbox/derive.ts para pintar y para poder probarla sin base de
-- datos. `npm run test:sales-inbox` compara las dos lead a lead contra
-- producción. Si tocas una, toca la otra y ejecuta el test.
--
-- ⚠️ Esta migración es la ÚLTIMA que define `lead_inbox_facts`, y por eso es la
-- que vale. Antes lo hicieron la 0142, la 0159 (avatar) y la 0160 (fusión de
-- leads): las tres siguen en el repo con su definición entera, y bajo un
-- replay completo (el botón de /admin/configuracion) fallan con "cannot drop
-- columns from view". Es ruido conocido, no un problema — pero si añades
-- columnas, hazlo en una migración NUEVA, nunca editando una vieja.
--
-- La definición de abajo es la de la 0160 (incluido el `WHERE
-- l.merged_into_id IS NULL` que oculta los leads absorbidos) con las dos
-- columnas nuevas añadidas al final.
--
-- Idempotente.
-- ============================================================================

-- ─── 1 · La regla del precio, escrita una sola vez ──────────────────────────
-- El texto llega acotado desde la extensión ("número + € [+ /mes]"), no como
-- frase libre, así que no hay que defenderse de prosa.
--
-- El tipo de retorno es `text` y NO debe cambiar: la vista depende de esta
-- función y Postgres no deja alterar la firma con dependientes.
CREATE OR REPLACE FUNCTION lead_price_operation(price text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE
    -- Sin precio no hay nada que deducir.
    WHEN price IS NULL OR btrim(price) = ''  THEN NULL
    -- "2.400 €/mes", "1.500 € /mes". Ninguna ficha de venta lleva "/mes".
    WHEN price ~* '/\s*mes'                  THEN 'rent'
    WHEN strpos(price, '€') = 0              THEN NULL
    -- "450.000 €" → 450000. Se corta en el € (nunca se mira lo que venga
    -- detrás) y se tira la parte decimal ("1.250,50 €" → 1250) ANTES de
    -- quitar los puntos de millar, o la coma inflaría el importe a 125050.
    --
    -- 50.000 € es el suelo, y es el mismo SALE_PRICE_FLOOR de
    -- lib/sales-inbox/types.ts. Por debajo puede ser un alquiler al que no se
    -- le capturó el "/mes", o una plaza de garaje; por encima no hay alquiler
    -- posible en esta cartera. Si el importe no se puede leer, la comparación
    -- da NULL y cae al ELSE.
    WHEN NULLIF(
           regexp_replace(
             split_part(split_part(price, '€', 1), ',', 1),
             '[^0-9]', '', 'g'
           ), ''
         )::numeric >= 50000                 THEN 'sale'
    ELSE NULL
  END
$fn$;

COMMENT ON FUNCTION lead_price_operation(text) IS
  'Venta/alquiler a partir del precio crudo de una tarjeta de Idealista ("2.400 €/mes" / "450.000 €"). Devuelve NULL cuando el texto no es concluyente. Gemelo en TypeScript: deriveOperationFromPrice() en lib/sales-inbox/derive.ts, vigilado por npm run test:sales-inbox.';

-- ─── 2 · La vista ──────────────────────────────────────────────────────────
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
),
cards AS (
  -- Solo los hilos con MÁS DE UNA tarjeta: son los únicos que pueden mezclar
  -- operaciones, y son minoría (33 de 460 en producción). El caso normal no
  -- paga esta expansión del jsonb: se resuelve con property_price.
  --
  -- El filtro va DENTRO del argumento, no en un WHERE: `jsonb_array_elements`
  -- se evalúa en el FROM, antes que el WHERE, y reventaría la vista entera si
  -- una sola fila tuviera algo que no sea un array.
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

  -- Nueva y última, por la restricción de CREATE OR REPLACE VIEW de arriba.
  l.avatar_url                                                  AS avatar_url,

  -- Cuántos leads se absorbieron en este. 0 = no se unificó nada. Se calcula
  -- aquí para que la bandeja pueda mostrar "2 consultas" sin una query extra.
  COALESCE(mg.absorbed, 0)                                      AS merged_count,

  -- ── Venta o alquiler ──────────────────────────────────────────────────────
  -- NULL = "sin determinar". Es un estado de primera clase, no un hueco: hoy
  -- lo tienen los leads a los que no se les capturó precio, y esconderlos
  -- sería peor que enseñarlos.
  CASE
    WHEN px.op IS NOT NULL                                             THEN px.op
    WHEN il.operation = 'sale'                                         THEN 'sale'
    WHEN p.id IS NOT NULL
     AND NOT (p.operations @> ARRAY['sale', 'rent']::text[])           THEN p.operation::text
    ELSE NULL
  END                                                           AS lead_operation,

  -- De dónde salió. No es adorno: es lo que permite contestar "¿por qué este
  -- sale como venta?" sin rehacer tres joins a mano, y lo que hace testeable
  -- el gemelo en TypeScript, que solo puede recalcular la rama del precio.
  CASE
    WHEN px.op IS NOT NULL                                             THEN 'price'
    WHEN il.operation = 'sale'                                         THEN 'listing'
    WHEN p.id IS NOT NULL
     AND NOT (p.operations @> ARRAY['sale', 'rent']::text[])           THEN 'property'
    ELSE NULL
  END                                                           AS operation_source
FROM idealista_leads l
LEFT JOIN wa  ON wa.lead_id = l.id::text
LEFT JOIN act ON act.lead_id = l.id
LEFT JOIN mg  ON mg.merged_into_id = l.id
LEFT JOIN dup ON dup.tail = right(l.phone_digits, 9) AND length(l.phone_digits) >= 9
-- Los dos joins nuevos van por clave primaria y son LEFT, así que el planner
-- puede ELIMINARLOS cuando la consulta no mira sus columnas — que es el caso
-- de los count(exact) de la cabecera, que solo piden `id`. Comprobable con:
--   EXPLAIN ANALYZE SELECT count(*) FROM lead_inbox_facts;
LEFT JOIN properties         p  ON p.id  = l.matched_property_id
LEFT JOIN idealista_listings il ON il.id = l.matched_listing_id
LEFT JOIN cards                 ON cards.lead_id = l.id
CROSS JOIN LATERAL (
  -- Varias tarjetas que no se ponen de acuerdo → 'mixed'. Una sola opinión →
  -- esa. Ninguna (hilo de una tarjeta, o ninguna concluyente) → el precio
  -- principal, que es properties[0] ya desnormalizado en la fila.
  SELECT CASE
    WHEN cardinality(cards.ops) > 1 THEN 'mixed'
    WHEN cardinality(cards.ops) = 1 THEN cards.ops[1]
    ELSE lead_price_operation(l.property_price)
  END AS op
) px
-- Los leads absorbidos DESAPARECEN de la bandeja: su historial ya vive en el
-- superviviente. Siguen en la tabla (nada se borra) y se pueden separar.
WHERE l.merged_into_id IS NULL;

COMMENT ON VIEW lead_inbox_facts IS
  'Hechos derivados de cada lead para la Sales Inbox: WhatsApp, historial, duplicados, fusiones, estado comercial y venta/alquiler. Las mismas reglas viven en lib/sales-inbox/derive.ts y npm run test:sales-inbox vigila que no se separen. Definición viva: migración 0161.';

-- Sin esto PostgREST no ve las columnas nuevas hasta reiniciar el contenedor:
-- pedir `lead_operation` daría PGRST204 y la pantalla entera respondería 500,
-- no solo el filtro.
NOTIFY pgrst, 'reload schema';
