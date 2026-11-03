-- ============================================================================
-- 0239 · Solicitudes: más de un teléfono por contacto
-- ============================================================================
-- Un contacto puede tener un teléfono en la ficha de Idealista y otro escrito
-- en su mensaje. `phone` sigue siendo el principal (el de la ficha); los demás
-- se guardan aquí, tal como los escribe la gente. La extensión 1.15 los manda.
-- Aditiva e idempotente. Reversión: ALTER TABLE idealista_leads DROP COLUMN extra_phones;
-- ============================================================================
ALTER TABLE idealista_leads
  ADD COLUMN IF NOT EXISTS extra_phones text[] NOT NULL DEFAULT '{}';
