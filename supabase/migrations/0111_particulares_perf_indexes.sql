-- Fase 2 del plan de mejoras de Particulares — índices para las 4 consultas
-- calientes del módulo, que hoy solo tienen índices sueltos por columna
-- (idx_particulares_created_at, idx_particulares_zone, etc., de la
-- migración 0012) y no compuestos con `is_active`, que es el primer filtro
-- de prácticamente todas ellas.

-- Feed principal del panel (/admin/particulares): activos ordenados por
-- fecha de detección, y retirados ordenados por fecha de baja.
CREATE INDEX IF NOT EXISTS idx_particulares_active_created
  ON particulares (is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_particulares_inactive_taken_down
  ON particulares (is_active, taken_down_at DESC)
  WHERE is_active = false;

-- Colas de mantenimiento del cron/admin (refresh-phones, verify-phones,
-- backfillPhonesViaAjax): "más antiguo actualizado primero", filtrando por
-- si tiene o no teléfono. Son las queries de mayor volumen del módulo — el
-- cron corre cada hora y el workflow de barrido por distrito las golpea en
-- tandas.
CREATE INDEX IF NOT EXISTS idx_particulares_active_missing_phone
  ON particulares (is_active, updated_at ASC)
  WHERE is_active = true AND phone IS NULL;

CREATE INDEX IF NOT EXISTS idx_particulares_active_with_phone
  ON particulares (is_active, updated_at ASC)
  WHERE is_active = true AND phone IS NOT NULL;
