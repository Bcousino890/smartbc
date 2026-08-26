-- ============================================================
-- SmartBC · Frecuencia del aviso de "nuevas propiedades" (2026-08-25)
-- ============================================================
-- El enlace de baja del digest (app/api/public/property-alerts/unsubscribe)
-- ahora ofrece, además de darse de baja del todo, "recibir con menos
-- frecuencia" — un resumen semanal en vez del chequeo normal del cron. Este
-- campo es lo que ese botón cambia.
--
-- Dos valores nada más, a propósito: no hay pedido de más granularidad
-- (mensual, etc.) y añadir opciones especulativas solo complica el cron sin
-- que nadie las use. 'immediate' es el default: se manda en cuanto el cron
-- encuentra algo nuevo (el comportamiento de siempre).
-- ============================================================

ALTER TABLE client_preferences
  ADD COLUMN IF NOT EXISTS new_listing_alerts_frequency text NOT NULL DEFAULT 'immediate';

ALTER TABLE client_preferences
  DROP CONSTRAINT IF EXISTS cp_alerts_frequency_valid;
ALTER TABLE client_preferences
  ADD CONSTRAINT cp_alerts_frequency_valid
    CHECK (new_listing_alerts_frequency IN ('immediate', 'weekly'));
