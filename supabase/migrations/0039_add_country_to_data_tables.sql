-- Add country field to key tables for multi-country data isolation
-- Allows Spain and Chile to have separate properties, agencies, and clients

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'es' CHECK (country IN ('es', 'cl'));

ALTER TABLE agencies
ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'es' CHECK (country IN ('es', 'cl'));

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'es' CHECK (country IN ('es', 'cl'));

-- Indexes for country-based filtering
CREATE INDEX IF NOT EXISTS idx_properties_country ON properties(country) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agencies_country ON agencies(country);
CREATE INDEX IF NOT EXISTS idx_conversations_country ON conversations(country);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_properties_country_operation
ON properties(country, operation) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_properties_country_status
ON properties(country, status) WHERE archived_at IS NULL;
