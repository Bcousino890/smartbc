-- Permite asignar cada lead del inbox de Idealista a un asesor/agente
-- concreto, y llevar un estado de seguimiento del contacto (más allá de
-- nuevo/fichado/descartado, que es el estado del lead en sí).
ALTER TABLE idealista_leads
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

ALTER TABLE idealista_leads
ADD COLUMN IF NOT EXISTS contact_status TEXT NOT NULL DEFAULT 'ninguno'
  CHECK (contact_status IN ('ninguno', 'contactado_whatsapp', 'contactado_llamada', 'contactado_email', 'sin_respuesta'));

CREATE INDEX IF NOT EXISTS idealista_leads_assigned_to_idx ON idealista_leads(assigned_to);
