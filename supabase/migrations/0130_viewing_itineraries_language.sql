-- ============================================================================
-- SmartBC · Idioma de la colección pública
-- ============================================================================
-- La Viewing Collection se sirve en el idioma del cliente, elegido por el
-- agente al preparar el itinerario. El panel del CRM sigue en español; esto
-- solo afecta a la superficie pública /v/[token] y a su previsualización.
--
-- 'ar' y 'he' se sirven en RTL (la vista lo deriva del idioma, no hace falta
-- columna aparte).
--
-- Idempotente: post-deploy relanza las migraciones en cada despliegue.
-- ============================================================================

ALTER TABLE viewing_itineraries
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'es';

-- CHECK aparte del ADD COLUMN para poder recrearlo de forma idempotente.
ALTER TABLE viewing_itineraries DROP CONSTRAINT IF EXISTS vi_language_valid;
ALTER TABLE viewing_itineraries ADD CONSTRAINT vi_language_valid
  CHECK (language IN ('es','en','fr','it','de','ar','tr','he'));
