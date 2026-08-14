-- ============================================================================
-- SmartBC · Zinto Integration API (contrato nuevo, /_integration-api)
-- ============================================================================
-- Capa nueva y separada de la integración legacy de WhatsApp/leads
-- (zinto_conversations, zinto_messages, zinto_leads, ...), que sigue
-- funcionando sin cambios. Estas tablas son exclusivas del cliente
-- ZintoIntegrationApiClient (lib/services/zinto-integration/**).
--
-- Idempotente: post-deploy.sh relanza todas las migraciones en cada deploy.
-- ============================================================================

-- ── Mapeo persistente SmartBC ↔ Zinto ───────────────────────────────────────
-- Une el id local de SmartBC (cuando existe) con el id de Zinto para cada
-- tipo de entidad. `smartbc_id` es nullable porque, hasta que exista un
-- modelo local de deals/tasks/pipelines, un registro puede empezar como
-- "solo lectura" (solo conocemos el lado Zinto).
CREATE TABLE IF NOT EXISTS zinto_integration_id_map (
  id bigserial PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('contact', 'conversation', 'deal', 'task', 'pipeline')),
  zinto_id text NOT NULL,
  smartbc_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_zinto_integration_id_map_entity_zinto
  ON zinto_integration_id_map (entity_type, zinto_id);

CREATE INDEX IF NOT EXISTS idx_zinto_integration_id_map_smartbc
  ON zinto_integration_id_map (entity_type, smartbc_id)
  WHERE smartbc_id IS NOT NULL;

-- ── Checkpoints de sincronización incremental ───────────────────────────────
-- Un checkpoint por recurso (contacts, conversations, deals, tasks, ...).
-- Guarda el último cursor y el instante `updated_since` usado, con el
-- pequeño solapamiento temporal que pide docs/PAGINATION.md aplicado por el
-- código, no por la tabla.
CREATE TABLE IF NOT EXISTS zinto_integration_sync_checkpoints (
  resource text PRIMARY KEY,
  last_cursor text,
  last_synced_at timestamptz,
  last_page_completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Dedupe de eventos de webhook por event.id ───────────────────────────────
-- Distinto de zinto_webhook_deliveries (legacy, dedupea por X-Zinto-Delivery-Id).
-- El contrato nuevo pide deduplicar por el `id` del evento en el cuerpo JSON.
CREATE TABLE IF NOT EXISTS zinto_integration_webhook_events (
  event_id uuid PRIMARY KEY,
  event_type text NOT NULL,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  processed_at timestamptz,
  processing_error text
);

CREATE INDEX IF NOT EXISTS idx_zinto_integration_webhook_events_type
  ON zinto_integration_webhook_events (event_type, received_at DESC);

-- ── Registro de llamadas salientes (request_id, ids de Zinto, estado) ───────
-- Auditoría ligera: no guarda cuerpos completos de mensajes (docs/AUTHENTICATION.md
-- "no registrar cuerpos completos"), solo metadatos de la llamada.
CREATE TABLE IF NOT EXISTS zinto_integration_api_log (
  id bigserial PRIMARY KEY,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  request_id text,
  zinto_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zinto_integration_api_log_created_at
  ON zinto_integration_api_log (created_at DESC);
