-- Create function to safely insert profiles (bypasses RLS)
-- Used during login when a new user's profile is missing

CREATE OR REPLACE FUNCTION create_user_profile(
  p_id uuid,
  p_email text,
  p_full_name text,
  p_role text DEFAULT 'client'
)
RETURNS TABLE (
  id uuid,
  email text,
  role user_role,
  country text
) AS $$
BEGIN
  INSERT INTO profiles (id, email, role, full_name, country, created_at, updated_at)
  VALUES (
    p_id,
    p_email,
    p_role::user_role,
    p_full_name,
    'es',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN QUERY SELECT
    profiles.id,
    profiles.email,
    profiles.role,
    profiles.country
  FROM profiles
  WHERE profiles.id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add INSERT policies (in case function doesn't work)
DROP POLICY IF EXISTS "profiles_admin_insert" ON profiles;
CREATE POLICY "profiles_admin_insert" ON profiles
  FOR INSERT
  WITH CHECK (true); -- Service role bypasses RLS anyway

DROP POLICY IF EXISTS "profiles_self_insert" ON profiles;
CREATE POLICY "profiles_self_insert" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);
