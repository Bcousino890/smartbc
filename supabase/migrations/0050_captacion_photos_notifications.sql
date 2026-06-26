-- Fotos snapshot de captaciones (para preservar cuando el link vence)
CREATE TABLE captacion_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captacion_id UUID NOT NULL REFERENCES captaciones(id) ON DELETE CASCADE,
  url TEXT NOT NULL,               -- URL original (puede vencer)
  storage_path TEXT,               -- ruta en bucket si ya fue descargada
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_captacion_photos_captacion_id ON captacion_photos(captacion_id);

ALTER TABLE captacion_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "captacion_photos_view" ON captacion_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('admin', 'agent'))
        )
    )
  );

CREATE POLICY "captacion_photos_insert" ON captacion_photos FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE role IN ('admin', 'agent', 'captadora')));

-- Notificaciones simples para el CRM
CREATE TABLE IF NOT EXISTS crm_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,              -- 'captacion_completed', 'captacion_assigned', etc.
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  data JSONB
);

CREATE INDEX idx_crm_notifications_user_id ON crm_notifications(user_id, read, created_at DESC);

ALTER TABLE crm_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own" ON crm_notifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins pueden crear notificaciones para cualquier usuario
CREATE POLICY "notifications_admin_insert" ON crm_notifications FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT id FROM user_profiles WHERE role = 'admin'));

-- También agregar campo scrape_status a captaciones para saber si fue scrapeada
ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS scrape_status TEXT DEFAULT 'pending'
  CHECK (scrape_status IN ('pending', 'scraped', 'failed', 'not_available'));
ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS scrape_error TEXT;
ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE captaciones ADD COLUMN IF NOT EXISTS description TEXT;
