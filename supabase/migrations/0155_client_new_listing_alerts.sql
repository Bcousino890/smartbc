-- ============================================================
-- SmartBC · Aviso de "nuevas propiedades" para clientes (opt-in por asesor)
-- ============================================================
-- client_preferences ya es la fila 1:1 por cliente con los criterios que usa
-- getSuggestedProperties() para hacer matching — es el sitio natural para el
-- interruptor y el reloj del digest, sin tabla nueva.
--
-- `new_listing_alerts_enabled` empieza en false: el aviso es opt-in, lo activa
-- un asesor por cliente (app/[country]/(admin)/admin/clientes/
-- property-offer-actions.ts, setNewListingAlertsEnabled) — nunca se enciende
-- solo. `new_listing_alerts_last_sent_at` es el reloj del digest: el cron
-- (app/api/cron/property-alerts) solo manda lo que entró DESPUÉS de esta
-- fecha, para no repetir propiedades ya avisadas.
-- ============================================================

ALTER TABLE client_preferences
  ADD COLUMN IF NOT EXISTS new_listing_alerts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS new_listing_alerts_last_sent_at timestamptz;
