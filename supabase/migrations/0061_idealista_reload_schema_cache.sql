-- Arregla que al guardar una ficha/inspo de Idealista el insert falle en silencio
-- ("Could not find the 'X' column of 'idealista_listings' in the schema cache").
-- Las columnas de 0059 (operation) y 0060 (missing fields) no estaban en la caché
-- de esquema de PostgREST. Esta migración las reasegura (idempotente) y fuerza a
-- PostgREST a recargar la caché.

-- 1) Reasegurar columnas (no-op si ya existen).
ALTER TABLE idealista_listings
  ADD COLUMN IF NOT EXISTS operation text DEFAULT 'rent' CHECK (operation IN ('sale', 'rent')),
  ADD COLUMN IF NOT EXISTS cadastral_reference text DEFAULT '',
  ADD COLUMN IF NOT EXISTS has_no_number boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS building_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_last_floor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS community_fees numeric,
  ADD COLUMN IF NOT EXISTS sale_exception text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS is_bank_property boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS heating_type text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS construction_year integer,
  ADD COLUMN IF NOT EXISTS has_adapted_access boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_wheelchair_access boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_link text DEFAULT '';

-- 2) Forzar a PostgREST a recargar la caché de esquema.
NOTIFY pgrst, 'reload schema';
