-- ─────────────────────────────────────────────────────────────────────────────
-- 0211 — Suspensión de cuentas del equipo
--
-- Una cuenta suspendida no puede entrar ni operar, pero conserva su historial
-- (clientes, captaciones, mensajes): no se borra. La suspende y la reactiva un
-- Propietario o Administrador sobre rangos inferiores (lib/auth/user-rank.ts).
--
--   suspended_at → cuándo se suspendió (NULL = cuenta activa)
--
-- Quién la suspendió y por qué queda SOLO en `permission_audit_log` (con RLS):
-- `profiles` es legible por cualquiera con la clave anónima (profiles_select
-- USING (true)), así que ahí no se guardan datos de quién ni de por qué.
--
-- La aplicación comprueba `suspended_at` en el middleware, en getCurrentProfile()
-- y en los helpers de sesión; banea la cuenta en GoTrue (no inicia sesión ni
-- renueva el token) y revoca sus sesiones abiertas con revoke_user_sessions().
--
-- Migración ADITIVA e IDEMPOTENTE: se puede re-ejecutar sin romper datos.
-- SQL estándar de PostgreSQL (psql dentro del contenedor `supabase-db`).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_suspended
  ON profiles(suspended_at) WHERE suspended_at IS NOT NULL;

-- Una cuenta suspendida no puede levantarse la suspensión sola. La política de
-- UPDATE de `profiles` deja a cada usuario editar su propia fila: con su sesión
-- aún válida podría poner `suspended_at = NULL` desde la API de datos. Este
-- disparador lo impide: solo cambia la columna el servidor (service role) o
-- quien opera directamente en la base (psql, sin JWT).
CREATE OR REPLACE FUNCTION profiles_protect_suspension()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF NEW.suspended_at IS NOT DISTINCT FROM OLD.suspended_at THEN
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

-- Cierra las sesiones abiertas de una cuenta. GoTrue valida en cada petición
-- que la sesión del JWT existe, así que al borrarla, `auth.getUser()` (el
-- middleware, las rutas de API y las páginas) deja de reconocerla en el acto,
-- sin esperar a que caduque el token (1 h). Solo la service role la ejecuta.
-- Tolera versiones de GoTrue sin alguna de las dos tablas.
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  revoked integer := 0;
  n integer;
BEGIN
  BEGIN
    DELETE FROM auth.sessions WHERE user_id = p_user_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    revoked := revoked + n;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  BEGIN
    DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
    GET DIAGNOSTICS n = ROW_COUNT;
    revoked := revoked + n;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  RETURN revoked;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;
