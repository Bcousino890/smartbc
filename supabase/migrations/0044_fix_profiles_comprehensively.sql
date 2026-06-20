-- Comprehensive fix for profile creation issues
-- This migration ensures profiles are ALWAYS created correctly

-- 1. Drop old problematic trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Create improved handle_new_user function that includes country
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
    COALESCE(new.raw_user_meta_data->>'role', 'client')::user_role,
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

-- 3. Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 4. Drop conflicting RLS policies (we'll recreate them correctly)
DROP POLICY IF EXISTS "profiles_admin_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_self_insert" ON profiles;

-- 5. Create correct RLS policies for INSERT
-- Anyone can insert their own profile (for auth trigger and login flow)
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Service role (admin client) can always insert (bypasses RLS anyway, but explicit)
CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- 6. Backfill missing profiles for existing auth users
-- This ensures users who exist in auth.users but not profiles get created
INSERT INTO profiles (id, email, full_name, country, role, created_at, updated_at)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  'es'::text,
  CASE
    WHEN u.email = 'benjamincousino1@gmail.com' THEN 'admin'::user_role
    ELSE 'client'::user_role
  END,
  now(),
  now()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- 7. Add comment documenting the flow
COMMENT ON FUNCTION handle_new_user() IS
  'Auto-creates profile when user is created in auth.users. ' ||
  'Includes country (default es) and role (default client). ' ||
  'Called automatically by on_auth_user_created trigger.';

COMMENT ON FUNCTION create_user_profile(uuid, text, text, text) IS
  'Public RPC function for explicit profile creation during login. ' ||
  'Has SECURITY DEFINER to bypass RLS. Used as fallback if trigger fails.';
