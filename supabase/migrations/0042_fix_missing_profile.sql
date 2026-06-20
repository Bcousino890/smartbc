-- Fix missing profile for benjamincousino1@gmail.com
-- This user exists in auth.users but has no profile row
-- Insert the profile with admin role and es country

-- This migration handles the case where a user was created in auth.users
-- before the handle_new_user() trigger was in place or when it failed.
-- The signInAction now auto-creates profiles, but this migration ensures
-- consistency if the user tries to log in before the app code updates.

INSERT INTO profiles (id, email, role, full_name, country, created_at, updated_at)
SELECT
  u.id,
  u.email,
  'admin'::user_role,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  'es'::text,
  now(),
  now()
FROM auth.users u
WHERE u.email = 'benjamincousino1@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = u.id
  )
ON CONFLICT (id) DO NOTHING;
