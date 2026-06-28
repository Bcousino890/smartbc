ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS published_web boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_properties_published_web
  ON properties (published_web)
  WHERE published_web = true AND archived_at IS NULL;
