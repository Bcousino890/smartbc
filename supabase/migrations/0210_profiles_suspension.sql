-- ─────────────────────────────────────────────────────────────────────────────
-- 0210 — Suspensión de cuentas del equipo
--
-- Una cuenta suspendida no puede entrar ni operar, pero conserva su historial
-- (clientes, captaciones, mensajes): no se borra. La suspende y la reactiva un
-- Propietario o Administrador sobre rangos inferiores (lib/auth/user-rank.ts).
--
--   suspended_at     → cuándo se suspendió (NULL = cuenta activa)
--   suspended_by     → quién la suspendió
--   suspended_reason → motivo, texto libre (opcional)
--
-- La aplicación comprueba `suspended_at` en el middleware y en
-- getCurrentProfile(), y además banea la cuenta en GoTrue para que no pueda
-- iniciar sesión ni renovar el token.
--
-- Migración ADITIVA e IDEMPOTENTE: se puede re-ejecutar sin romper datos.
-- SQL estándar de PostgreSQL (psql dentro del contenedor `supabase-db`).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_reason text;

CREATE INDEX IF NOT EXISTS idx_profiles_suspended
  ON profiles(suspended_at) WHERE suspended_at IS NOT NULL;

-- Una cuenta suspendida no puede levantarse la suspensión sola. Si la política
-- de UPDATE de `profiles` deja a cada usuario editar su propia fila, con su
-- sesión aún válida podría poner `suspended_at = NULL` desde la API de datos.
-- Este disparador lo impide: solo cambia estas columnas el servidor (service
-- role) o quien opera directamente en la base (psql, sin JWT).
CREATE OR REPLACE FUNCTION profiles_protect_suspension()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF NEW.suspended_at IS NOT DISTINCT FROM OLD.suspended_at
     AND NEW.suspended_by IS NOT DISTINCT FROM OLD.suspended_by
     AND NEW.suspended_reason IS NOT DISTINCT FROM OLD.suspended_reason THEN
    RETURN NEW;
  END IF;

  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );

  IF jwt_role IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'La suspensión de una cuenta solo la gestiona el servidor'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_suspension ON profiles;
CREATE TRIGGER profiles_protect_suspension
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION profiles_protect_suspension();
