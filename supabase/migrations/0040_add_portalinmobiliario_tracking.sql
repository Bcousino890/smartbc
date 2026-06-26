-- Add Portalinmobiliario publication tracking fields to properties table
-- Allows tracking which properties have been published to Portalinmobiliario

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS portalinmobiliario_id text,
ADD COLUMN IF NOT EXISTS portalinmobiliario_published_at timestamptz,
ADD COLUMN IF NOT EXISTS portalinmobiliario_sync_status text CHECK (portalinmobiliario_sync_status IN ('pending', 'synced', 'failed', 'archived'));

-- Indexes for Portalinmobiliario sync tracking
CREATE INDEX IF NOT EXISTS idx_properties_portalinmobiliario_id
ON properties(portalinmobiliario_id) WHERE portalinmobiliario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_portalinmobiliario_status
ON properties(country, portalinmobiliario_sync_status) WHERE country = 'cl';
