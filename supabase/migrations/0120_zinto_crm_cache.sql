-- ============================================================================
-- SmartBC · Caché local de datos CRM de Zinto (contactos, notas, tags)
-- ============================================================================
-- Alimentada por dos caminos, ambos en lib/services/zinto-integration/sync.ts:
--   1. Webhook (contact.*, note.*, tag.*) → actualización puntual del contacto
--      afectado, casi en tiempo real.
--   2. Backfill periódico (paginateAll /api/v1/contacts) → corrige lo que un
--      webhook perdido o duplicado no hubiera aplicado.
--
-- Separada de zinto_integration_id_map (que solo guarda el mapeo de IDs): esta
-- tabla guarda el contenido en sí para que el panel de /admin/mensajes lo lea
-- sin tener que llamar a Zinto en cada render.
--
-- Idempotente: post-deploy.sh relanza todas las migraciones en cada deploy.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zinto_crm_contacts (
  zinto_contact_id text PRIMARY KEY,
  phone text,
  name text NOT NULL,
  email text,
  tags text[] NOT NULL DEFAULT '{}',
  archived boolean NOT NULL DEFAULT false,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  zinto_created_at timestamptz,
  zinto_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- El panel busca por teléfono (así es como hoy se localiza una conversación
-- de WhatsApp); normalizado sin "+" ni espacios, igual que
-- normalizePhoneNumber() en lib/services/zinto/client.ts.
CREATE INDEX IF NOT EXISTS idx_zinto_crm_contacts_phone ON zinto_crm_contacts (phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS zinto_crm_notes (
  zinto_note_id text PRIMARY KEY,
  zinto_contact_id text NOT NULL REFERENCES zinto_crm_contacts (zinto_contact_id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by_id text,
  zinto_created_at timestamptz,
  zinto_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zinto_crm_notes_contact ON zinto_crm_notes (zinto_contact_id, zinto_created_at DESC);
