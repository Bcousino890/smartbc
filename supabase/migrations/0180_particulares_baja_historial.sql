-- ============================================================
-- SmartBC · Historial de bajas y reactivaciones de particulares
-- ============================================================
-- Un anuncio puede retirarse y volver a publicarse. Cada cambio de
-- `is_active` de un PARTICULAR queda en `particulares_changes`:
--   'deleted'      → fecha = taken_down_at (la real si el crawler la conoce)
--   'reactivated'  → fecha = ahora
-- Lo hace un disparador, así vale igual para el crawler, el botón de la ficha
-- y cualquier otro camino. Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION log_particular_active_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.advertiser_type IS DISTINCT FROM 'particular' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  IF NEW.is_active = false THEN
    INSERT INTO particulares_changes (particular_id, change_type, old_value, new_value, changed_at)
    VALUES (
      NEW.id, 'deleted', NULL,
      jsonb_build_object('taken_down_at', COALESCE(NEW.taken_down_at, now()), 'source_text', NEW.source_update_text),
      COALESCE(NEW.taken_down_at, now())
    );
  ELSE
    INSERT INTO particulares_changes (particular_id, change_type, old_value, new_value, changed_at)
    VALUES (
      NEW.id, 'reactivated',
      jsonb_build_object('taken_down_at', OLD.taken_down_at),
      jsonb_build_object('reactivated_at', now()),
      now()
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS particulares_active_log ON particulares;
CREATE TRIGGER particulares_active_log
  AFTER UPDATE OF is_active ON particulares
  FOR EACH ROW EXECUTE FUNCTION log_particular_active_change();
