-- ============================================================
-- SmartBC · Media columns for Zinto messages
-- ============================================================
-- Inbound WhatsApp image/audio/document messages carry a media descriptor
-- (URL, mime, filename) instead of text. Store it so the inbox can render the
-- attachment. Also keep the provider (Meta/wamid) id alongside our msg id.
-- ============================================================

ALTER TABLE zinto_messages ADD COLUMN IF NOT EXISTS external_provider_id text;
ALTER TABLE zinto_messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE zinto_messages ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE zinto_messages ADD COLUMN IF NOT EXISTS media_mime text;
ALTER TABLE zinto_messages ADD COLUMN IF NOT EXISTS media_filename text;
ALTER TABLE zinto_messages ADD COLUMN IF NOT EXISTS media_caption text;
