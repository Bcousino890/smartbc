-- Tabla para registrar el historial de cambios de estado en fichas de Idealista
CREATE TABLE IF NOT EXISTS idealista_listing_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES idealista_listings(id) ON DELETE CASCADE,
  old_state text,
  new_state text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idealista_status_history_listing_id_idx
  ON idealista_listing_status_history (listing_id);

CREATE INDEX IF NOT EXISTS idealista_status_history_changed_at_idx
  ON idealista_listing_status_history (changed_at DESC);

-- Trigger: registra cambios en idealista_state
CREATE OR REPLACE FUNCTION log_idealista_state_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.idealista_state IS DISTINCT FROM NEW.idealista_state) THEN
    INSERT INTO idealista_listing_status_history (listing_id, old_state, new_state, reason)
    VALUES (NEW.id, OLD.idealista_state, NEW.idealista_state, 'state_change');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS idealista_state_change_trigger ON idealista_listings;
CREATE TRIGGER idealista_state_change_trigger
  AFTER UPDATE ON idealista_listings
  FOR EACH ROW
  EXECUTE FUNCTION log_idealista_state_change();

-- Trigger: registra archivado/desarchivado
CREATE OR REPLACE FUNCTION log_idealista_archive_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.archived_at IS DISTINCT FROM NEW.archived_at) THEN
    IF NEW.archived_at IS NOT NULL THEN
      INSERT INTO idealista_listing_status_history (listing_id, old_state, new_state, reason)
      VALUES (NEW.id, 'active', 'archived', 'archived');
    ELSE
      INSERT INTO idealista_listing_status_history (listing_id, old_state, new_state, reason)
      VALUES (NEW.id, 'archived', 'active', 'restored');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS idealista_archive_change_trigger ON idealista_listings;
CREATE TRIGGER idealista_archive_change_trigger
  AFTER UPDATE ON idealista_listings
  FOR EACH ROW
  EXECUTE FUNCTION log_idealista_archive_change();

NOTIFY pgrst, 'reload schema';
