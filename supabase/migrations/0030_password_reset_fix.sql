-- ============================================================
-- 0030: Password reset tokens — fix policies and add service_role bypass
-- ============================================================
-- The password_reset_tokens table was created in 0021 but it only had
-- policies for authenticated users (is_admin()) and the user itself.
-- Server-side API calls use the service_role key which bypasses RLS
-- entirely, so inserts/selects/updates from the API routes work
-- correctly without needing additional policies.
--
-- This migration adds:
-- 1. A policy allowing service_role to manage all tokens (belt-and-
--    suspenders in case RLS bypass is misconfigured)
-- 2. An INSERT policy so the admin client can create tokens
-- 3. An UPDATE policy so the admin client can mark tokens as used
-- 4. A function to clean up expired tokens automatically
-- ============================================================

-- Add INSERT policy for service_role (no auth.uid() required)
-- The service_role key already bypasses RLS, but being explicit is safer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'password_reset_tokens'
      AND policyname = 'password_reset_tokens_service_insert'
  ) THEN
    CREATE POLICY "password_reset_tokens_service_insert"
      ON password_reset_tokens FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- Add UPDATE policy for marking tokens as used (service_role)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'password_reset_tokens'
      AND policyname = 'password_reset_tokens_service_update'
  ) THEN
    CREATE POLICY "password_reset_tokens_service_update"
      ON password_reset_tokens FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Add SELECT policy so service_role can verify tokens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'password_reset_tokens'
      AND policyname = 'password_reset_tokens_service_select'
  ) THEN
    CREATE POLICY "password_reset_tokens_service_select"
      ON password_reset_tokens FOR SELECT
      USING (true);
  END IF;
END $$;

-- Function to delete expired/used tokens (call periodically for cleanup)
CREATE OR REPLACE FUNCTION cleanup_password_reset_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM password_reset_tokens
  WHERE expires_at < now() OR used_at IS NOT NULL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
