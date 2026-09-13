-- ============================================================================
-- SmartBC · Credenciales de la Integration API dentro de zinto_config
-- ============================================================================
-- Hasta ahora había DOS credenciales en DOS sitios distintos:
--   · el cliente legacy (lib/services/zinto/config.ts) leía la clave de esta
--     tabla, descifrada, y el panel la refrescaba;
--   · el cliente nuevo (lib/services/zinto-integration/**) leía SOLO
--     process.env.ZINTO_API_KEY y no miraba la base de datos jamás.
-- Consecuencia medida el 2026-09-13: "Probar Conexión" decía que todo iba bien
-- mientras la capa nueva llevaba cuatro semanas muerta, porque cada botón
-- probaba una credencial distinta. Estas columnas unifican el sitio.
--
-- Las cuatro son OPCIONALES a propósito:
--   · integration_api_key_*  → vacío = usar api_key_* (el caso normal: una
--     sola clave para las dos capas). Existe por si Zinto acaba entregando una
--     clave aparte para el contrato de integración.
--   · integration_base_url   → vacío = derivar de base_url quitando el sufijo
--     /api/v1 (ver normalizeIntegrationBaseUrl en server-config.ts). El
--     cliente nuevo compone las rutas como /api/v1/... sobre la base, así que
--     necesita la base SIN ese sufijo o acabaría pidiendo /api/v1/api/v1/...
--
-- integration_webhook_secret_* NO es el mismo secreto que webhook_secret_*:
-- aquel firma los webhooks legacy de estado de entrega, éste es el `whsec_`
-- que devuelve UNA sola vez POST /api/v1/webhooks del contrato nuevo. No
-- fusionarlos: tienen formato de firma distinto y ciclo de vida distinto.
--
-- Idempotente: post-deploy.sh relanza TODAS las migraciones en cada deploy.
-- ============================================================================

ALTER TABLE zinto_config
  ADD COLUMN IF NOT EXISTS integration_api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS integration_api_key_iv text,
  ADD COLUMN IF NOT EXISTS integration_base_url text,
  ADD COLUMN IF NOT EXISTS integration_webhook_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS integration_webhook_secret_iv text,
  ADD COLUMN IF NOT EXISTS integration_webhook_id text;

COMMENT ON COLUMN zinto_config.integration_api_key_encrypted IS
  'Clave de la Integration API. NULL = usar api_key_encrypted (una sola credencial).';
COMMENT ON COLUMN zinto_config.integration_base_url IS
  'Base de la Integration API SIN el sufijo /api/v1. NULL = derivar de base_url.';
COMMENT ON COLUMN zinto_config.integration_webhook_secret_encrypted IS
  'whsec_ devuelto por POST /api/v1/webhooks. Distinto de webhook_secret_encrypted (legacy).';
COMMENT ON COLUMN zinto_config.integration_webhook_id IS
  'Id del endpoint registrado en Zinto, para listarlo/borrarlo sin duplicar.';
