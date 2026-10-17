-- ─────────────────────────────────────────────────────────────────────────────
-- 0210 — Endurecer las tablas de cuentas y credenciales
--
-- Tres agujeros que permitían, SIN iniciar sesión o con la sesión de un cliente,
-- tomar cualquier cuenta o ponerse el rol de Propietario:
--
-- 1) `password_reset_tokens` tenía políticas `USING (true)` / `WITH CHECK (true)`
--    (0030) sin limitar el rol, así que valían también para `anon`. Cualquiera
--    con la clave anónima (pública) podía insertar un token a nombre de
--    cualquier usuario y canjearlo en /api/auth/reset-password, que solo
--    comprueba el token: fijaba la contraseña de la cuenta que quisiera.
--    Además un administrador podía LEER con su sesión los tokens que acababa de
--    generar. La aplicación solo toca esta tabla con la service role, que
--    ignora RLS: no hace falta ninguna política.
--
-- 2) `profiles_update` (0045) tiene `USING (auth.uid() = id …)` sin `WITH CHECK`:
--    Postgres reutiliza el USING y cada usuario podía cambiarse a sí mismo, por
--    la API de datos, `role`, `countries`, `custom_role_id`, `assigned_advisor_id`
--    o el correo. Un cliente podía ponerse `role = 'owner'`. Un disparador impide
--    ahora que las sesiones de usuario cambien esas columnas; solo las cambia el
--    servidor (service role) o quien opera directamente en la base.
--
-- 3) `profiles_country_roles`, `custom_roles`, `user_permission_overrides` y
--    `permission_audit_log` no tenían RLS en las migraciones: con los permisos
--    por defecto de Supabase cualquiera podía escribir roles por país o
--    excepciones de permisos de cualquier usuario (y el rol por país gana sobre
--    `profiles.role`). La aplicación las usa siempre con la service role.
--
-- 4) `handle_new_user` (0044) toma el rol del perfil de
--    `raw_user_meta_data->>'role'`, que elige quien se registra: un alta en
--    /auth/v1/signup con `data: {"role": "owner"}` creaba un Propietario (si el
--    registro de GoTrue está abierto). Ahora el perfil nace SIEMPRE como
--    cliente; el rol de equipo lo pone la aplicación con la service role,
--    después de crear la cuenta. Ninguna ruta pasa `role` en los metadatos.
--
-- 5) `create_user_profile`, `fix_missing_admin_profiles` y
--    `cleanup_password_reset_tokens` son SECURITY DEFINER y, por defecto, las
--    puede ejecutar cualquiera (PUBLIC). La aplicación no las llama: se les
--    quita EXECUTE a PUBLIC, anon y authenticated.
--
-- Migración IDEMPOTENTE: se puede re-ejecutar sin romper datos. Cada tabla se
-- toca solo si existe (algunas migraciones antiguas pueden no estar aplicadas).
-- SQL estándar de PostgreSQL (psql dentro del contenedor `supabase-db`).
--
-- Lo que NO hace (a propósito, se decide aparte): `profiles_select USING (true)`
-- sigue abierto — endurecerlo exige saber qué lecturas de perfiles hacen las
-- páginas públicas y el portal del cliente con sesión de usuario.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Tokens de restablecimiento de contraseña ──────────────────────────────
DO $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.password_reset_tokens') IS NULL THEN
    RETURN;
  END IF;

  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'password_reset_tokens'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.password_reset_tokens', pol.policyname);
  END LOOP;

  EXECUTE 'ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY';
  -- Defensa en profundidad: ni siquiera los privilegios de tabla.
  EXECUTE 'REVOKE ALL ON TABLE public.password_reset_tokens FROM anon, authenticated';
END;
$$;

-- ── 3) RLS (sin políticas) en las tablas de roles, excepciones y auditoría ───
DO $$
DECLARE
  tbl text;
  pol record;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles_country_roles',
    'custom_roles',
    'user_permission_overrides',
    'permission_audit_log'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END;
$$;

-- ── 2) profiles: las columnas que dan poder solo las cambia el servidor ──────
CREATE OR REPLACE FUNCTION profiles_protect_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_role text;
  col text;
BEGIN
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    ''
  );

  -- Solo se vigilan las peticiones de sesiones de usuario (API de datos con el
  -- JWT de un usuario o de la clave anónima). La service role, GoTrue, los
  -- disparadores como handle_new_user y psql no llevan esos claims.
  IF jwt_role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Un perfil que se crea con una sesión de usuario es de cliente, sin rol
    -- personalizado, sin asesor asignado y con un solo país.
    IF NEW.role IS DISTINCT FROM 'client'
       OR coalesce(to_jsonb(NEW) -> 'custom_role_id', 'null'::jsonb) <> 'null'::jsonb
       OR coalesce(to_jsonb(NEW) -> 'assigned_advisor_id', 'null'::jsonb) <> 'null'::jsonb
       OR coalesce(to_jsonb(NEW) -> 'multi_country', 'false'::jsonb) NOT IN ('false'::jsonb, 'null'::jsonb)
       OR (jsonb_typeof(to_jsonb(NEW) -> 'countries') = 'array'
           AND jsonb_array_length(to_jsonb(NEW) -> 'countries') > 1)
    THEN
      RAISE EXCEPTION 'Un perfil nuevo solo puede crearse como cliente, sin rol ni asesor asignado'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- to_jsonb(NEW) -> col tolera que alguna columna no exista en esta base.
  FOREACH col IN ARRAY ARRAY[
    'role',
    'country',
    'countries',
    'multi_country',
    'custom_role_id',
    'assigned_advisor_id',
    'email'
  ] LOOP
    IF (to_jsonb(NEW) -> col) IS DISTINCT FROM (to_jsonb(OLD) -> col) THEN
      RAISE EXCEPTION 'La columna "%" de un perfil solo la cambia el servidor', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged ON profiles;
CREATE TRIGGER profiles_protect_privileged
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION profiles_protect_privileged_columns();

-- ── 4) handle_new_user: el perfil nace siempre como cliente ──────────────────
-- Igual que la versión de 0044 salvo la columna `role`, que ya no sale de los
-- metadatos que elige quien se registra.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, country, role, created_at, updated_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    COALESCE(new.raw_user_meta_data->>'country', 'es')::text,
    'client'::user_role,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    country = COALESCE(EXCLUDED.country, 'es'),
    updated_at = now();

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail - profile can be created in app layer
  RAISE WARNING 'handle_new_user() failed: %', SQLERRM;
  RETURN new;
END;
$$;

-- ── 5) Funciones SECURITY DEFINER que no necesita ningún usuario ─────────────
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_user_profile', 'fix_missing_admin_profiles', 'cleanup_password_reset_tokens')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
  END LOOP;
END;
$$;
