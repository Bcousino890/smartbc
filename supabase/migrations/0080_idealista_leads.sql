-- Leads capturados del inbox de idealista/tools por la extensión de Chrome.
-- Cada fila es una conversación del inbox; conversation_id (de la URL
-- /inbox/CONVERSATION_XXXXX) es la clave de deduplicación.
CREATE TABLE IF NOT EXISTS idealista_leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL DEFAULT '',
  phone               TEXT,
  phone_country       TEXT,                          -- "IT" de "(IT) Internacional"
  is_international    BOOLEAN NOT NULL DEFAULT false,
  message             TEXT,                          -- snippet de lista; texto completo al enriquecer
  profile             JSONB,                         -- { "bullets": [...], "presentacion": "..." | null }
  property_title      TEXT,
  property_price      TEXT,                          -- "2.000 €/mes" tal cual lo muestra Idealista
  property_type       TEXT,
  idealista_code      TEXT,                          -- "Cod. XXXXX" del modal de detalle
  property_ref        TEXT,                          -- "Ref. bc386" (referencia de agencia)
  matched_property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  message_date        TEXT,                          -- etiqueta cruda (fechas relativas de Idealista)
  source_page         TEXT NOT NULL DEFAULT 'list' CHECK (source_page IN ('list','detail')),
  detail_captured     BOOLEAN NOT NULL DEFAULT false,
  suggested_type      TEXT CHECK (suggested_type IN ('particular','agencia','relocation')),
  suggestion_keywords TEXT[] NOT NULL DEFAULT '{}',
  lead_type           TEXT CHECK (lead_type IN ('particular','agencia','relocation')),
  status              TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo','fichado','descartado')),
  country             TEXT NOT NULL DEFAULT 'es',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idealista_leads_status_idx     ON idealista_leads(status);
CREATE INDEX IF NOT EXISTS idealista_leads_created_at_idx ON idealista_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idealista_leads_lead_type_idx  ON idealista_leads(lead_type);

-- Todos los accesos de la app van por service role (ingesta y admin), así que la
-- RLS solo bloquea el rol anon de PostgREST; lectura permitida solo a staff.
ALTER TABLE idealista_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "idealista_leads_staff_select" ON idealista_leads;
CREATE POLICY "idealista_leads_staff_select" ON idealista_leads FOR SELECT USING (is_staff());
