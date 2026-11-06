-- Reversión de 0245_encargo_notify_atomic.sql: borra la función y la columna `reasons`
-- (se pierden los motivos guardados; no toca avisos ni coincidencias).
-- Tras esto, el runner (lib/encargos/runner.ts) deja de poder avisar.
--   psql … -v ON_ERROR_STOP=1 -f docs/changes/2026-11-06-encargos-matching/rollback-0245.sql
DROP FUNCTION IF EXISTS public.claim_and_notify_encargo_matches(uuid[], uuid[], text, text, text, jsonb);
ALTER TABLE IF EXISTS encargo_matches DROP COLUMN IF EXISTS reasons;
