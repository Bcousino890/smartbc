-- ============================================================================
-- SmartBC · Reparación de los índices de dedupe de la ingesta de Idealista
-- ============================================================================
-- La primera versión de 0122 definió tres índices que el upsert NO podía usar:
--
--   idealista_market_phones     · índice de EXPRESIÓN sobre COALESCE(...)
--   idealista_market_events     · índice PARCIAL (WHERE dedupe_hash IS NOT NULL)
--   idealista_market_snapshots  · índice PARCIAL (WHERE listing_hash IS NOT NULL)
--
-- PostgREST traduce `onConflict: "a,b"` a `ON CONFLICT (a, b)`, y Postgres solo
-- sabe inferir de ahí un índice único NORMAL sobre esas columnas. Con uno
-- parcial o de expresión responde:
--
--   ERROR: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- El efecto era silencioso y feo: teléfonos, eventos y snapshots no se
-- guardaban, mientras la respuesta de la API seguía diciendo que sí. Lo
-- destapó scripts/test-idealista-ingest.mts.
--
-- 0122 ya está corregida para instalaciones nuevas; esta migración repara las
-- bases donde la versión antigua llegó a aplicarse. Idempotente.
-- ============================================================================

-- ── Teléfonos: la clave de dedupe pasa a ser una columna real ───────────────
ALTER TABLE idealista_market_phones
  ADD COLUMN IF NOT EXISTS phone_key TEXT
  GENERATED ALWAYS AS (COALESCE(phone_normalized, phone)) STORED;

DROP INDEX IF EXISTS uq_idealista_market_phones_number;
CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_market_phones_number
  ON idealista_market_phones (listing_id, phone_key);

COMMENT ON COLUMN idealista_market_phones.phone_key IS
  'Clave de dedupe (columna generada, no índice de expresión): ON CONFLICT no sabe inferir COALESCE(...)';

-- ── Eventos ─────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS uq_idealista_market_events_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_market_events_dedupe
  ON idealista_market_events (listing_id, event_type, dedupe_hash);

-- ── Snapshots ───────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS uq_idealista_market_snapshots_hash;
CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_market_snapshots_hash
  ON idealista_market_snapshots (listing_id, listing_hash);

NOTIFY pgrst, 'reload schema';
