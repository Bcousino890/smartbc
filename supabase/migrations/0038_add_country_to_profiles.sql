-- Add country field to profiles for multi-country support
-- Allows routing users to their respective country dashboards (es vs cl)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'es' CHECK (country IN ('es', 'cl'));

-- Index for country-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country);
