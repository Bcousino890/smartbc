-- ============================================================================
-- 0241 · Clientes: más de un teléfono
-- ============================================================================
-- Al crear un cliente desde una solicitud de Idealista el contacto puede traer
-- dos números (el de la ficha y el que escribió en su mensaje, ver 0239).
-- `phone` sigue siendo el principal; los demás se guardan aquí.
-- Aditiva e idempotente. Reversión: ALTER TABLE profiles DROP COLUMN extra_phones;
-- ============================================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS extra_phones text[] NOT NULL DEFAULT '{}';
