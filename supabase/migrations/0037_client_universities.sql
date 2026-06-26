-- Add universities field to client preferences
-- Allows clients to specify preferred universities for proximity filtering
ALTER TABLE client_preferences
ADD COLUMN IF NOT EXISTS universities text;

-- Index for faster queries when filtering by universities
CREATE INDEX IF NOT EXISTS idx_client_preferences_universities
ON client_preferences USING GIN(
  to_tsvector('spanish', COALESCE(universities, ''))
);
