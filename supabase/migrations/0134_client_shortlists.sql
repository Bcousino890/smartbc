-- ============================================================================
-- SmartBC · Private Client Shortlist
-- ============================================================================
-- La fase que faltaba entre "BCP elige" y "BCP organiza el día":
--
--     selección de BCP → SHORTLIST → prioridades del cliente → itinerario
--
-- BCP y el cliente ven juntos 14 casas. El cliente necesita decidir en casa
-- cuáles quiere visitar de verdad, en qué orden, cuáles deja de alternativa y
-- cuáles descarta. Hoy eso acaba en WhatsApp.
--
-- ── Por qué DOS tablas y no una columna en client_property_selections ───────
--
-- 1. La curación de BCP y la respuesta del cliente son cosas distintas y
--    deben convivir. "BCP se la propuso y Paul dijo que no" es justo el dato
--    que interesa conservar; machacar `status` lo perdería.
-- 2. El shortlist es una INSTANTÁNEA. Si BCP toca su selección mientras Paul
--    ordena, lo que Paul está ordenando no puede cambiarle debajo. Por eso los
--    items guardan su propio property_id y no apuntan a la selección.
-- 3. Puede haber varios shortlists por cliente a lo largo del tiempo, con
--    estados separados.
--
-- El token va DENTRO de client_shortlists en vez de en una tabla de shares
-- aparte: un shortlist es un enlace, y renovar o revocar es cambiar dos fechas.
-- (Las colecciones sí separan share porque una se puede republicar.)
--
-- ⚠️ Esta superficie ESCRIBE, a diferencia del Private Book. Toda la
-- autorización se resuelve en servidor desde el token; aquí abajo quedan las
-- invariantes que no deben depender del formulario.
--
-- Idempotente: post-deploy relanza las migraciones en cada despliegue.
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_shortlists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  title      text,
  language   text NOT NULL DEFAULT 'es',
  country    text NOT NULL DEFAULT 'es',

  -- Estado del TRABAJO del cliente. No confundir con el del enlace.
  status     text NOT NULL DEFAULT 'reviewing',

  -- Estado del ENLACE. Mismo patrón que viewing_collection_shares.
  token       text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,

  -- Rastro temporal: cuándo lo mandó y cuándo tocó algo por última vez. Si
  -- client_updated_at > submitted_at, el cliente cambió cosas DESPUÉS de
  -- enviar, y el agente tiene que enterarse.
  submitted_at      timestamptz,
  client_updated_at timestamptz,
  first_opened_at   timestamptz,
  -- Sube en cada escritura del cliente: permite detectar estado rancio entre
  -- dos pestañas sin montar colaboración en tiempo real.
  revision   integer NOT NULL DEFAULT 0,

  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cs_status_valid   CHECK (status IN ('reviewing','submitted','archived')),
  CONSTRAINT cs_language_valid CHECK (language IN ('es','en','fr','it','de','ar','tr','he')),
  CONSTRAINT cs_country_valid  CHECK (country IN ('es','cl')),
  -- Mínimo del token: la cuenta de entropía está en 0132. No bajar de aquí.
  CONSTRAINT cs_token_len      CHECK (char_length(token) >= 16),
  -- No se puede crear un enlace ya caducado (mismo criterio que vcs_expiry_sane).
  CONSTRAINT cs_expiry_sane    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_client_shortlists_client
  ON client_shortlists (client_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_shortlists_token
  ON client_shortlists (token);

-- ── Items: la instantánea de lo que se mandó, más lo que el cliente decida ──
CREATE TABLE IF NOT EXISTS client_shortlist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id uuid NOT NULL REFERENCES client_shortlists(id) ON DELETE CASCADE,
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,

  -- Quién la puso ahí. No se pierde nunca: una casa que añadió el cliente no
  -- puede acabar pareciendo una recomendación de BCP.
  origin   text NOT NULL DEFAULT 'bcp_curated',

  -- La decisión del cliente. 'undecided' es el estado de partida y es lo que
  -- permite medir el progreso (9 de 14 decididas).
  decision text NOT NULL DEFAULT 'undecided',

  -- Prioridad DESEADA dentro de las 'must_visit'. No es un horario.
  rank integer,

  -- Comentario del cliente. Vive aparte de agent_notes a propósito: son dos
  -- voces distintas y no deben mezclarse nunca.
  client_comment text,

  -- Orden en el que BCP las mandó, para que la lista salga estable.
  position   integer NOT NULL DEFAULT 0,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT csi_unique_property UNIQUE (shortlist_id, property_id),
  CONSTRAINT csi_origin_valid   CHECK (origin IN ('bcp_curated','client_added')),
  CONSTRAINT csi_decision_valid CHECK (decision IN ('undecided','must_visit','maybe','not_for_me')),
  -- Un rank sin 'must_visit' no significa nada: el orden solo existe entre las
  -- prioritarias. Se impone aquí para que ningún camino lo deje inconsistente.
  CONSTRAINT csi_rank_only_must_visit CHECK (rank IS NULL OR decision = 'must_visit'),
  CONSTRAINT csi_rank_positive CHECK (rank IS NULL OR rank > 0),
  -- El comentario es una nota corta, no un ensayo: acota lo que puede escribir
  -- una superficie pública en la base.
  CONSTRAINT csi_comment_len CHECK (
    client_comment IS NULL OR char_length(client_comment) <= 500
  )
);

CREATE INDEX IF NOT EXISTS idx_csi_shortlist
  ON client_shortlist_items (shortlist_id, position);

-- ── Origen nuevo en la selección de BCP ─────────────────────────────────────
-- Cuando el agente convierte las prioridades en itinerario, una casa que
-- añadió el cliente necesita su fila en client_property_selections (es lo que
-- exige una parada). Se marca de dónde vino en vez de disfrazarla de curación.
ALTER TABLE client_property_selections DROP CONSTRAINT IF EXISTS cps_source_valid;
ALTER TABLE client_property_selections ADD CONSTRAINT cps_source_valid
  CHECK (source IN ('suggestion','favorite','search','manual','client_shortlist'));

-- ── Analítica ───────────────────────────────────────────────────────────────
-- page_events.event_type es un CHECK cerrado (ver 0126). Se amplía con los
-- eventos de esta superficie. 'property_view' se llama así y no 'stop_view'
-- porque aquí no hay paradas todavía: no hay visita organizada.
ALTER TABLE page_events DROP CONSTRAINT IF EXISTS valid_event_type;
ALTER TABLE page_events ADD CONSTRAINT valid_event_type CHECK (event_type IN (
  -- Existentes: verificados en producción, no tocar.
  'photo_view', 'video_play', 'plan_view', 'scroll',
  'contact_click', 'visit_request', 'share_click', 'time_on_page',
  -- Viewing Collections.
  'collection_open', 'stop_view', 'stop_expand',
  -- Client Shortlist.
  'shortlist_open', 'property_view', 'decision_change', 'priority_change',
  'property_discarded', 'property_restored', 'property_added',
  'comment_added', 'shortlist_submitted'
));

COMMENT ON TABLE client_shortlists IS
  'Sesión de priorización del cliente. El token vive aquí: un shortlist es un enlace.';
COMMENT ON TABLE client_shortlist_items IS
  'Instantánea de las propiedades enviadas + la decisión del cliente. NO sustituye a client_property_selections.';
