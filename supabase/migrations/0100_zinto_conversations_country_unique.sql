-- ============================================================
-- SmartBC · Fix: conversación por (client_id, phone_number, country)
-- ============================================================
-- getOrCreateConversation hace upsert con
--   ON CONFLICT (client_id, phone_number, country)
-- pero el único índice único existente era de 2 columnas
-- (uq_zinto_conversations_client_phone, de 0091). Postgres devolvía 42P10
-- ("no unique or exclusion constraint matching the ON CONFLICT specification")
-- y CUALQUIER conversación nueva fallaba con "No se pudo crear la conversación"
-- (botón "Nueva" en mensajes, botón WhatsApp en solicitudes, y también los
-- mensajes entrantes de un número desconocido desde el webhook).
--
-- Reemplazamos el índice de 2 columnas por uno de 3 que incluye country. Como
-- el índice de 2 columnas era MÁS estricto, no puede haber filas duplicadas que
-- rompan el nuevo índice. Además, esto permite que el mismo número exista por
-- separado en España (#4) y Chile (#50).
-- ============================================================

DROP INDEX IF EXISTS uq_zinto_conversations_client_phone;

CREATE UNIQUE INDEX IF NOT EXISTS uq_zinto_conversations_client_phone_country
  ON zinto_conversations (client_id, phone_number, country);
