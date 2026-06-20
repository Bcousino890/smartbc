-- Pre-populate app_settings keys for MercadoLibre Chile integration
-- Values are empty; they get filled via OAuth flow from admin panel

INSERT INTO app_settings (key, value, updated_at)
VALUES
  ('ml.chile.client_secret', '""', now()),
  ('ml.chile.access_token',  '""', now()),
  ('ml.chile.refresh_token', '""', now()),
  ('ml.chile.user_id',       '""', now()),
  ('ml.chile.token_expires_at', '""', now())
ON CONFLICT (key) DO NOTHING;
