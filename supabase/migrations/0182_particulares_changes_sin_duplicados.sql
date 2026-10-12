-- ============================================================
-- SmartBC · Sin duplicados de baja/reactivación en el historial
-- ============================================================
-- El crawler de Fotocasa escribía su propia fila 'deleted' además de la que
-- ya crea el disparador log_particular_active_change (0180): cada baja salía
-- dos veces en la línea de tiempo. Aquí:
--   1) se borran los duplicados existentes (mismo anuncio, mismo tipo,
--      dentro de 10 min; se conserva la más antigua);
--   2) un disparador BEFORE INSERT descarta una baja/reactivación si ya hay
--      otra igual de ese anuncio en los últimos 10 min (vale cualquier orden).
-- Idempotente.
-- ============================================================

DELETE FROM particulares_changes a
USING particulares_changes b
WHERE a.change_type IN ('deleted', 'reactivated')
  AND a.change_type = b.change_type
  AND a.particular_id = b.particular_id
  AND a.id <> b.id
  AND abs(extract(epoch FROM (a.changed_at - b.changed_at))) < 600
  AND (a.changed_at, a.id::text) > (b.changed_at, b.id::text);

CREATE OR REPLACE FUNCTION particulares_changes_skip_dup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.change_type IN ('deleted', 'reactivated') AND EXISTS (
    SELECT 1 FROM particulares_changes c
    WHERE c.particular_id = NEW.particular_id
      AND c.change_type = NEW.change_type
      AND abs(extract(epoch FROM (c.changed_at - NEW.changed_at))) < 600
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS particulares_changes_skip_dup ON particulares_changes;
CREATE TRIGGER particulares_changes_skip_dup
  BEFORE INSERT ON particulares_changes
  FOR EACH ROW EXECUTE FUNCTION particulares_changes_skip_dup();
