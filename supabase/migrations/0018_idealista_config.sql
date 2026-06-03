-- Stores Idealista API credentials for the partner integration
CREATE TABLE IF NOT EXISTS idealista_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_key text,
  client_id text,
  client_secret text,
  sandbox_mode boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE idealista_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_idealista_config"
  ON idealista_config FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') IN ('admin', 'owner'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('admin', 'owner'));
