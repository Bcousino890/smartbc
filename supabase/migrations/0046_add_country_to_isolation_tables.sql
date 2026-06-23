-- Add country field to isolation tables for multi-country support
-- Default to 'es' (Spain) to avoid breaking existing data
-- Chile data should manually update to 'cl' or be backfilled

-- 1. Add country to visit_requests
ALTER TABLE visit_requests
ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'es'
CHECK (country IN ('es', 'cl'));

-- 2. Add country to internal_notes
ALTER TABLE internal_notes
ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'es'
CHECK (country IN ('es', 'cl'));

-- 3. Add country to client_preferences
ALTER TABLE client_preferences
ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'es'
CHECK (country IN ('es', 'cl'));

-- Create indexes for performance (filtering by country frequently)
CREATE INDEX IF NOT EXISTS idx_visit_requests_country
ON visit_requests(country);

CREATE INDEX IF NOT EXISTS idx_visit_requests_country_status
ON visit_requests(country, status);

CREATE INDEX IF NOT EXISTS idx_internal_notes_country
ON internal_notes(country);

CREATE INDEX IF NOT EXISTS idx_client_preferences_country
ON client_preferences(country);

-- Add comment for documentation
COMMENT ON COLUMN visit_requests.country IS 'Country code: es (Spain) or cl (Chile) for data isolation';
COMMENT ON COLUMN internal_notes.country IS 'Country code: es (Spain) or cl (Chile) for data isolation';
COMMENT ON COLUMN client_preferences.country IS 'Country code: es (Spain) or cl (Chile) for data isolation';
