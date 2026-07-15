-- ============================================================
-- SmartBC · Zinto WhatsApp Configuration
-- ============================================================
-- Stores encrypted Zinto API credentials so they can be managed from the
-- admin panel (like email_config) instead of committing them to git.
-- ============================================================

CREATE TABLE IF NOT EXISTS zinto_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_encrypted text NOT NULL,
  api_key_iv text NOT NULL,
  base_url text NOT NULL DEFAULT 'https://crm.zinto.app/api/v1',
  channel_id integer NOT NULL DEFAULT 4,
  webhook_secret_encrypted text,
  webhook_secret_iv text,
  inbound_token_encrypted text,
  inbound_token_iv text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Only one config record should exist.
CREATE UNIQUE INDEX IF NOT EXISTS idx_zinto_config_singleton
  ON zinto_config (id) WHERE id IS NOT NULL;

ALTER TABLE zinto_config ENABLE ROW LEVEL SECURITY;

-- Only admins can manage Zinto config.
DROP POLICY IF EXISTS "zinto_config_admin_all" ON zinto_config;
CREATE POLICY "zinto_config_admin_all"
  ON zinto_config FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Keep updated_at fresh (function already exists from earlier migrations).
DROP TRIGGER IF EXISTS zinto_config_updated_at ON zinto_config;
CREATE TRIGGER zinto_config_updated_at
  BEFORE UPDATE ON zinto_config
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
