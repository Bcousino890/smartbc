-- ============================================================================
-- 0243 · Encargos: varias búsquedas por cliente + registro de matches
-- ============================================================================
-- Hasta ahora `client_preferences` era 1:1 con el cliente (PK = client_id).
-- Un «encargo» es una búsqueda del cliente: ahora puede tener varias.
--
--   * `client_preferences.id` pasa a ser la clave primaria; `client_id` sigue
--     siendo FK a profiles (ya existía) y gana un índice normal.
--   * Las filas actuales quedan como el encargo principal (`is_primary`,
--     `active`, posición 0). Un índice único parcial garantiza un solo principal
--     por cliente.
--   * `encargo_matches` registra qué inmuebles/particulares ya se han casado con
--     cada encargo (para avisar una sola vez). Se crea VACÍA: la precarga del
--     stock actual como «visto» la hace scripts/seed-encargo-baseline.mts, no
--     esta migración.
--
-- Se conservan tal cual los índices, el trigger updated_at, el RLS y las
-- políticas de client_preferences (no se tocan).
-- Aditiva e idempotente. Reversión: docs/changes/2026-11-06-encargos-matching/rollback-0243.sql
-- ============================================================================

ALTER TABLE client_preferences
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT 'Encargo 1',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS position int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS end_client_label text,
  ADD COLUMN IF NOT EXISTS max_price_by_bedrooms jsonb,
  ADD COLUMN IF NOT EXISTS baseline_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE client_preferences DROP CONSTRAINT IF EXISTS client_preferences_status_check;
ALTER TABLE client_preferences
  ADD CONSTRAINT client_preferences_status_check CHECK (status IN ('active', 'paused', 'closed'));

-- PK client_id -> id (solo si todavía es la de client_id).
DO $$
DECLARE
  pk_name text;
  pk_cols text;
BEGIN
  SELECT c.conname,
         (SELECT string_agg(a.attname, ',' ORDER BY a.attname)
            FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey))
    INTO pk_name, pk_cols
    FROM pg_constraint c
   WHERE c.conrelid = 'public.client_preferences'::regclass AND c.contype = 'p';

  IF pk_cols = 'client_id' THEN
    EXECUTE format('ALTER TABLE public.client_preferences DROP CONSTRAINT %I', pk_name);
    ALTER TABLE public.client_preferences ADD CONSTRAINT client_preferences_pkey PRIMARY KEY (id);
  ELSIF pk_cols IS NULL THEN
    ALTER TABLE public.client_preferences ADD CONSTRAINT client_preferences_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS client_preferences_client_id_idx ON client_preferences (client_id);
CREATE UNIQUE INDEX IF NOT EXISTS client_preferences_one_primary
  ON client_preferences (client_id) WHERE is_primary;

COMMENT ON COLUMN client_preferences.id IS 'Identificador del encargo (PK desde 0243; antes lo era client_id).';
COMMENT ON COLUMN client_preferences.status IS 'active | paused | closed. Solo los activos generan matches y avisos. 0243.';
COMMENT ON COLUMN client_preferences.is_primary IS 'Encargo principal del cliente (uno solo por cliente). 0243.';
COMMENT ON COLUMN client_preferences.baseline_at IS 'Desde cuándo cuenta lo «nuevo» para este encargo. 0243.';

CREATE TABLE IF NOT EXISTS encargo_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encargo_id uuid NOT NULL REFERENCES client_preferences(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('property', 'particular')),
  source_id text NOT NULL,
  canonical_id text NOT NULL,
  score int,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  UNIQUE (encargo_id, source, canonical_id)
);

ALTER TABLE encargo_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "encargo_matches_staff_all" ON encargo_matches;
CREATE POLICY "encargo_matches_staff_all" ON encargo_matches
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());
REVOKE ALL ON TABLE encargo_matches FROM anon;
