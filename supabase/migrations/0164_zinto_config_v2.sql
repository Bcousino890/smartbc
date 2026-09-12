-- ============================================================
-- SmartBC · Zinto API v2 config (en paralelo a v1, apagada por flag)
-- ============================================================
-- v2 (https://crm.zinto.app/api/v2) es un contrato nuevo y distinto de v1:
-- exige un header X-Zinto-Integration-Id además del Bearer, y sí soporta
-- mensajes entrantes de forma nativa (message.received) sin necesitar el
-- "Flujo" manual que usa v1. Se guarda en la MISMA fila singleton de
-- zinto_config (no una tabla nueva) para no duplicar el patrón de
-- config-cifrada-en-panel; todas las columnas son nullable/con default para
-- no romper la fila v1 ya existente. enabled_v2 arranca en false: el envío/
-- recepción real sigue por v1 hasta que se verifique v2 en sandbox y se
-- decida el corte.
-- ============================================================

ALTER TABLE zinto_config
  ADD COLUMN IF NOT EXISTS api_key_v2_encrypted text,
  ADD COLUMN IF NOT EXISTS api_key_v2_iv text,
  ADD COLUMN IF NOT EXISTS base_url_v2 text NOT NULL DEFAULT 'https://crm.zinto.app/api/v2',
  ADD COLUMN IF NOT EXISTS integration_id integer,
  ADD COLUMN IF NOT EXISTS webhook_secret_v2_encrypted text,
  ADD COLUMN IF NOT EXISTS webhook_secret_v2_iv text,
  ADD COLUMN IF NOT EXISTS enabled_v2 boolean NOT NULL DEFAULT false;
