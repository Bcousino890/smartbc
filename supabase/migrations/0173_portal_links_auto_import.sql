-- ============================================================
-- SmartBC · Fichas automáticas para los enlaces de portales
-- ============================================================
-- Cada enlace que entra en "Enlaces de portales" (extensión de Chrome o
-- "Añadir enlaces") se convierte en ficha solo, en segundo plano
-- (lib/portal-links/auto-import.ts). Un cron cada 5 min recoge lo que se quedó
-- a medias. Estas columnas evitan reintentar sin fin un anuncio que el portal
-- no deja leer: 3 intentos, separados al menos 10 min, y el motivo del último
-- fallo a la vista.
-- ============================================================

ALTER TABLE client_portal_links
  ADD COLUMN IF NOT EXISTS import_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS import_error text,
  ADD COLUMN IF NOT EXISTS import_tried_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cpl_import_pending
  ON client_portal_links (created_at)
  WHERE property_id IS NULL AND status NOT IN ('discarded', 'converted');
