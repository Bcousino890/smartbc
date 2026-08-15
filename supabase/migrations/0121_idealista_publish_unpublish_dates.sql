-- Estado "unpublished" (Despublicado) + fechas de subida/bajada, para saber
-- siempre cuándo se publicó y cuándo se despublicó una ficha sin tener que
-- abrir el historial completo.
ALTER TABLE idealista_listings
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS unpublished_at timestamptz;

-- BEFORE UPDATE: al entrar en "published" registra published_at; al entrar
-- en "unpublished" registra unpublished_at. Se guardan siempre (no solo la
-- primera vez) para reflejar la última subida/bajada.
CREATE OR REPLACE FUNCTION set_idealista_publish_dates()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.idealista_state = 'published' AND OLD.idealista_state IS DISTINCT FROM 'published') THEN
    NEW.published_at := now();
  END IF;
  IF (NEW.idealista_state = 'unpublished' AND OLD.idealista_state IS DISTINCT FROM 'unpublished') THEN
    NEW.unpublished_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS idealista_set_publish_dates_trigger ON idealista_listings;
CREATE TRIGGER idealista_set_publish_dates_trigger
  BEFORE UPDATE ON idealista_listings
  FOR EACH ROW
  EXECUTE FUNCTION set_idealista_publish_dates();

NOTIFY pgrst, 'reload schema';
