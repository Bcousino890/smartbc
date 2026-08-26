-- ─────────────────────────────────────────────────────────────────────────────
-- 0089 — Registro de auditoría de permisos y roles (Fase 3)
--
-- Guarda quién cambia qué (roles, overrides de permisos, país) sobre qué usuario.
-- Se consulta desde el drawer de permisos para mostrar un historial.
--
-- Migración ADITIVA e IDEMPOTENTE: se puede re-ejecutar sin romper datos.
-- SQL estándar de PostgreSQL (aplicable con psql dentro del contenedor
-- `supabase-db` del VPS). NO usa nada específico de Supabase Cloud.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1) Tabla permission_audit_log ────────────────────────────────────────────
-- Cada fila es un evento de cambio de permisos/rol/país sobre un usuario.
--   actor_id        → quién hizo el cambio (NULL si el actor ya no existe)
--   target_user_id  → sobre qué usuario se aplicó el cambio
--   event_type      → 'role_changed' | 'country_changed' | 'permissions_updated'
--                     | 'user_created' (texto libre, no restringido con CHECK)
--   resource/action → recurso/acción de permiso afectados (opcional)
--   country         → país afectado si el evento es por país (opcional)
--   old_value/new_value → snapshot/diff del cambio en JSON (opcional)
CREATE TABLE IF NOT EXISTS permission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id),
  target_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  resource text,
  action text,
  country text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz DEFAULT now()
);


-- ── 2) Índice para el historial por usuario ──────────────────────────────────
-- El drawer pide las entradas de un usuario ordenadas de más reciente a más
-- antigua; este índice cubre exactamente ese acceso.
CREATE INDEX IF NOT EXISTS idx_permission_audit_log_target_created
  ON permission_audit_log(target_user_id, created_at DESC);
