-- ============================================================================
-- SmartBC · Origen del rechazo de una captación
-- ============================================================================
-- Bug reportado: al borrar una captación por la API (queda en la etapa
-- "Rechazada"), un reenvío posterior del proveedor la actualizaba por dentro
-- pero la dejaba estancada en esa etapa para siempre — `stage_id` estaba
-- protegido como "campo del equipo" (solo se escribe si está vacío), y una vez
-- rechazada nunca vuelve a estar vacía. Ver migración 0107 y el cambio en
-- lib/captaciones/write/field-policy.ts (TEAM_FIELDS) y
-- lib/captaciones/write/upsert-captacion.ts (auto-restauración).
--
-- La solución: cuando un proveedor reenvía datos de una captación que sigue
-- rechazada, sin pedir etapa explícita, se entiende como "esto sigue vivo" y
-- vuelve sola a la etapa de entrada del pipeline. PERO solo si el rechazo lo
-- causó la propia API — si fue una PERSONA quien la rechazó desde el panel,
-- no se reabre sola (podría ser fraude, duplicado, o cualquier motivo real que
-- el equipo decidió).
--
-- `rejected_by` distingue quién causó el último rechazo:
--   'api'   → DELETE /api/v1/captaciones/{id} o POST .../etapa hacia una etapa
--             de tipo 'rejected'. Se puede reabrir sola.
--   'panel' → el equipo movió la captación a una etapa 'rejected' desde
--             /cl/admin/captaciones. NO se reabre sola.
--   NULL    → no está rechazada, o el estado es anterior a esta migración.
-- ============================================================================

ALTER TABLE captaciones
  ADD COLUMN IF NOT EXISTS rejected_by TEXT CHECK (rejected_by IN ('api', 'panel'));

COMMENT ON COLUMN captaciones.rejected_by IS 'Quién causó el último rechazo: api (se puede reabrir sola en el siguiente envío) o panel (el equipo decidió, no se reabre sola). NULL si no está rechazada.';

-- Fuerza a PostgREST a recargar la caché de esquema.
NOTIFY pgrst, 'reload schema';
