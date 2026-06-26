-- Arregla el error "Could not find the 'country' column ... in the schema cache".
-- PostgREST sirve las consultas desde una caché de esquema; si la columna country
-- (migraciones 0038/0039) se añadió sin que PostgREST recargara, todas las
-- consultas que la usan fallan (login, panel admin, etc.).
--
-- 1) Garantiza que las columnas existen (idempotente: no-op si ya están).
ALTER TABLE profiles      ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'es' CHECK (country IN ('es', 'cl'));
ALTER TABLE properties    ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'es' CHECK (country IN ('es', 'cl'));
ALTER TABLE agencies      ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'es' CHECK (country IN ('es', 'cl'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'es' CHECK (country IN ('es', 'cl'));

-- 2) Fuerza a PostgREST a recargar la caché de esquema para que vea las columnas.
NOTIFY pgrst, 'reload schema';
