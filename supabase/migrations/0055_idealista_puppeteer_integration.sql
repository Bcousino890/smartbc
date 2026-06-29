-- Migrate idealista_config from OAuth to Puppeteer/Playwright with username/password
-- Drop old OAuth columns and add new auth fields
ALTER TABLE idealista_config
  DROP COLUMN IF EXISTS client_id,
  DROP COLUMN IF EXISTS client_secret,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS password text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS login_failed_count integer DEFAULT 0;

-- Create table to track publishing attempts (audit trail and retry logic)
CREATE TABLE IF NOT EXISTS idealista_publish_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  idealista_property_id text,
  status text NOT NULL CHECK (status IN ('pending', 'published', 'failed', 'archived')),
  error_message text,
  attempt_count integer DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on idealista_publish_log
ALTER TABLE idealista_publish_log ENABLE ROW LEVEL SECURITY;

-- Admin can manage all publish logs
DROP POLICY IF EXISTS "admin_manage_idealista_publish_log" ON idealista_publish_log;
CREATE POLICY "admin_manage_idealista_publish_log"
  ON idealista_publish_log FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_idealista_publish_log_property_id ON idealista_publish_log(property_id);
CREATE INDEX IF NOT EXISTS idx_idealista_publish_log_status ON idealista_publish_log(status) WHERE status != 'archived';
CREATE INDEX IF NOT EXISTS idx_idealista_publish_log_published_at ON idealista_publish_log(published_at DESC) WHERE status = 'published';
