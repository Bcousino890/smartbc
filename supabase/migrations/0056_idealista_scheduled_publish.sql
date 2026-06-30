-- Programación de publicación en Idealista
ALTER TABLE idealista_listings
  ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;

-- Índice para el cron job que busca fichas pendientes de publicar
CREATE INDEX IF NOT EXISTS idealista_listings_scheduled_idx
  ON idealista_listings (scheduled_publish_at)
  WHERE scheduled_publish_at IS NOT NULL AND idealista_state != 'published';
