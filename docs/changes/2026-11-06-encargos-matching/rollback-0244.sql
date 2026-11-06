-- Reversión de 0244_make_encargo_primary.sql: borra la función. No toca datos.
-- Tras esto, `makePrimary` (lib/db/queries/encargos.ts) deja de funcionar.
--   psql … -v ON_ERROR_STOP=1 -f docs/changes/2026-11-06-encargos-matching/rollback-0244.sql
DROP FUNCTION IF EXISTS public.make_encargo_primary(uuid);
