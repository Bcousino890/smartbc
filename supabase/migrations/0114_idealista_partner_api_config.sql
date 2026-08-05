-- Idealista Partner API (OAuth2 client_credentials) — credenciales oficiales
-- para publicar fichas por API real, además del flujo actual por
-- Playwright/extensión de Chrome (que se mantiene intacto como respaldo).
--
-- feed_key y sandbox_mode ya existían (migración 0018). client_id/client_secret
-- habían sido eliminados en la 0055 cuando se pasó a Playwright; se reintroducen
-- aquí para el partner API real. El secret se guarda cifrado (AES-256-GCM, mismo
-- esquema que zinto_config / email_config vía EMAIL_ENCRYPTION_KEY), nunca en claro.
ALTER TABLE idealista_config
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS client_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS client_secret_iv text,
  ADD COLUMN IF NOT EXISTS api_last_test_at timestamptz,
  ADD COLUMN IF NOT EXISTS api_last_test_ok boolean;

NOTIFY pgrst, 'reload schema';
