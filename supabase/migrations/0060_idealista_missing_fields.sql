-- Campos de Idealista mapeados contra el formulario real (idealista.com/tools/propiedad/nuevo)
-- que faltaban en idealista_listings.
ALTER TABLE idealista_listings
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
