-- Auto-create profile for benjamincousino1@gmail.com from auth.users
-- This function safely creates the missing profile if the auth user exists

CREATE OR REPLACE FUNCTION fix_missing_admin_profiles()
RETURNS TABLE (success boolean, message text, user_id uuid) AS $$
DECLARE
  v_user_id uuid;
  v_count int;
BEGIN
  -- Find the user in auth.users by email
  SELECT id INTO v_user_id FROM auth.users
  WHERE email = 'benjamincousino1@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'User not found in auth.users', NULL::uuid;
    RETURN;
  END IF;

  -- Check if profile already exists
  SELECT COUNT(*) INTO v_count FROM profiles WHERE id = v_user_id;

  IF v_count > 0 THEN
    RETURN QUERY SELECT FALSE, 'Profile already exists', v_user_id;
    RETURN;
  END IF;

  -- Create the profile
  INSERT INTO profiles (id, email, role, full_name, country, created_at, updated_at)
  VALUES (
    v_user_id,
    'benjamincousino1@gmail.com',
    'admin'::user_role,
    'Benjamin Cousino',
    'es',
    now(),
    now()
  );

  RETURN QUERY SELECT TRUE, 'Profile created successfully', v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the function
SELECT * FROM fix_missing_admin_profiles();
