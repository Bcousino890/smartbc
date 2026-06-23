-- Add Chile/MercadoLibre VIS fields to properties table
-- These fields are required or useful for publishing to PortalInmobiliario.com via ML API

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS commune TEXT,
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS property_type TEXT
  CHECK (property_type IN ('apartment','house','office','commercial','land','warehouse','parking')),
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'eur'
  CHECK (currency IN ('eur','clp','uf','usd')),
ADD COLUMN IF NOT EXISTS covered_area_m2 INTEGER,
ADD COLUMN IF NOT EXISTS parking_lots INTEGER;

-- Indexes for Chile real estate queries
CREATE INDEX IF NOT EXISTS idx_properties_commune
  ON properties(commune) WHERE commune IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_region
  ON properties(region) WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_property_type
  ON properties(property_type) WHERE property_type IS NOT NULL;

COMMENT ON COLUMN properties.commune IS 'Chilean commune (e.g. Las Condes, Providencia) for ML VIS FULL_ADDRESS';
COMMENT ON COLUMN properties.region IS 'Chilean region (e.g. Metropolitana de Santiago) for ML VIS FULL_ADDRESS';
COMMENT ON COLUMN properties.property_type IS 'ML VIS property category: apartment, house, office, commercial, land, warehouse, parking';
COMMENT ON COLUMN properties.currency IS 'Listing currency: eur (Spain), clp/uf/usd (Chile)';
COMMENT ON COLUMN properties.covered_area_m2 IS 'Covered/built area in m² for ML VIS COVERED_AREA attribute';
COMMENT ON COLUMN properties.parking_lots IS 'Number of parking spaces for ML VIS PARKING_LOTS attribute';
