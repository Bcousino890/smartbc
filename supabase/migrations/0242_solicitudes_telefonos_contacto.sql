-- ============================================================================
-- 0242 · Solicitudes: teléfono de WhatsApp (Zinto) y teléfono de llamadas
-- ============================================================================
-- Un contacto puede escribir por WhatsApp desde un número y atender llamadas en
-- otro. La ficha guarda los dos por separado: «Abrir Zinto» usa `zinto_phone`
-- y «Llamar» usa `call_phone`.
--
-- NULL = todavía no se ha configurado uno distinto: se usa `phone`, el que
-- llegó de Idealista. `phone` NO se toca nunca desde la ficha: es la evidencia
-- del origen (y de él salen `phone_digits`, los duplicados y la fusión).
--
-- Aditiva e idempotente. Reversión: docs/changes/2026-11-02-solicitudes-reparto/rollback-0242.sql
-- ============================================================================
ALTER TABLE idealista_leads
  ADD COLUMN IF NOT EXISTS zinto_phone text,
  ADD COLUMN IF NOT EXISTS call_phone text;

-- Lo que valida el servidor (7–15 dígitos), con margen para espacios y «+».
ALTER TABLE idealista_leads DROP CONSTRAINT IF EXISTS idealista_leads_zinto_phone_len;
ALTER TABLE idealista_leads
  ADD CONSTRAINT idealista_leads_zinto_phone_len CHECK (zinto_phone IS NULL OR char_length(zinto_phone) BETWEEN 7 AND 32);
ALTER TABLE idealista_leads DROP CONSTRAINT IF EXISTS idealista_leads_call_phone_len;
ALTER TABLE idealista_leads
  ADD CONSTRAINT idealista_leads_call_phone_len CHECK (call_phone IS NULL OR char_length(call_phone) BETWEEN 7 AND 32);

COMMENT ON COLUMN idealista_leads.zinto_phone IS
  'Teléfono para WhatsApp (Zinto) configurado en la ficha. NULL = el recibido de Idealista (phone). 0242.';
COMMENT ON COLUMN idealista_leads.call_phone IS
  'Teléfono para llamadas configurado en la ficha. NULL = el recibido de Idealista (phone). 0242.';
