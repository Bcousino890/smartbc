-- Fix missing profile for benjamincousino1@gmail.com
-- This user exists in auth.users but has no profile row
-- Insert the profile with admin role and es country

INSERT INTO profiles (id, email, role, full_name, country, created_at, updated_at)
SELECT
  id,
  email,
  'admin'::user_role,
  COALESCE(raw_user_meta_data->>'full_name', email),
  'es'::text,
  now(),
  now()
FROM auth.users
WHERE email = 'benjamincousino1@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.users.id
  );
