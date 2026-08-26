-- ============================================================
-- SmartBC · Allow the 'read' delivery status on Zinto messages
-- ============================================================
-- Zinto's status webhook can report message.read (double blue tick). The
-- original CHECK constraint only allowed pending/sent/delivered/failed, so a
-- 'read' update would be rejected. Widen it to include 'read'.
-- ============================================================

ALTER TABLE zinto_messages DROP CONSTRAINT IF EXISTS zinto_messages_status_check;

ALTER TABLE zinto_messages
  ADD CONSTRAINT zinto_messages_status_check
  CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed'));
