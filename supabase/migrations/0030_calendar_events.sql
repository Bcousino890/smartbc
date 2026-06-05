-- Tabla de eventos de calendario del equipo
-- Permite registrar reuniones, llamadas y tareas agendadas
-- assigned_to: agente asignado al evento (puede diferir del creador)

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 500),
  description text,
  event_type text NOT NULL DEFAULT 'meeting'
    CHECK (event_type IN ('meeting', 'call', 'task', 'visit', 'other')),
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  client_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  google_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_assigned_to ON calendar_events(assigned_to, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_at ON calendar_events(start_at);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- El creador y el asignado pueden ver el evento
CREATE POLICY IF NOT EXISTS "calendar_events_participant_select" ON calendar_events
  FOR SELECT
  USING (
    auth.uid() = created_by
    OR auth.uid() = assigned_to
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Solo el creador o admin puede insertar
CREATE POLICY IF NOT EXISTS "calendar_events_creator_insert" ON calendar_events
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- El creador o admin puede actualizar/borrar
CREATE POLICY IF NOT EXISTS "calendar_events_creator_update" ON calendar_events
  FOR UPDATE
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY IF NOT EXISTS "calendar_events_creator_delete" ON calendar_events
  FOR DELETE
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
