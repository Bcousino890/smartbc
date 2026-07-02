-- Pipeline de estado de las fichas de Idealista: además de draft/published/
-- failed, ahora una ficha publicada se puede marcar como "bajada" del portal.
-- En vez de borrarla (perdiendo fotos y datos), se ARCHIVA: se guarda cuándo
-- se archivó y se oculta de la lista activa, pero la fila sigue existiendo.
ALTER TABLE idealista_listings
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idealista_listings_archived_at_idx
  ON idealista_listings (archived_at);

NOTIFY pgrst, 'reload schema';
