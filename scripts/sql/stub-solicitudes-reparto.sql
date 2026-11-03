-- ============================================================================
-- SOLO PRUEBAS LOCALES (Solicitudes · reparto, 0237). NUNCA aplicar a una base
-- real.
--
-- Va DESPUÉS de stub-supabase.sql y test-util.sql, y ANTES de las migraciones
-- reales de la bandeja (0080, 0086, 0123, 0141, 0160, 0161) y de 0237. Añade lo
-- que esas migraciones dan por existente en producción, citando su origen.
--
-- Diferencias con producción que NO están comprobadas: profiles.role es el
-- enum user_role en producción (aquí text; 0237 compara con ::text en los dos
-- casos) y las tablas reales tienen más columnas, triggers y políticas.
-- ============================================================================
\set ON_ERROR_STOP 1

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

-- 0032_fix_staff_rls.sql
CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior')
  );
$$;

-- 0001_init.sql:36 · 0038 · teléfono de 0001
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'es';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_advisor_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- 0090_country_roles_and_custom_roles.sql (role es el enum user_role allí)
CREATE TABLE IF NOT EXISTS profiles_country_roles (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  country text NOT NULL CHECK (country IN ('es', 'cl')),
  role    text NOT NULL,
  UNIQUE (user_id, country)
);

-- idealista_listings con las RESTRICCIONES REALES del esquema:
--   · 0017: un anuncio por inmueble (property_id UNIQUE; 0019 lo hizo nullable
--     para los «inspo», pero no quitó la unicidad).
--   · 0062: reference_code único solo entre anuncios no-inspo; los «inspo»
--     pueden repetirla.
-- (stub-supabase.sql lo crea con reference_code UNIQUE global y sin la
-- unicidad de property_id; aquí se deja como en producción.)
ALTER TABLE idealista_listings DROP CONSTRAINT IF EXISTS idealista_listings_reference_code_key;
DO $$ BEGIN
  ALTER TABLE idealista_listings ADD CONSTRAINT idealista_listings_property_id_key UNIQUE (property_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idealista_listings_reference_code_unique
  ON idealista_listings (reference_code) WHERE is_inspo = false AND reference_code IS NOT NULL;
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS operation text DEFAULT 'rent';
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 0091/0092/0094/0095 (solo lo que lee la vista)
CREATE TABLE IF NOT EXISTS zinto_conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    text,
  phone_number text,
  channel_id   integer,
  lead_id      text,
  country      text NOT NULL DEFAULT 'es'
);
CREATE TABLE IF NOT EXISTS zinto_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES zinto_conversations(id) ON DELETE CASCADE,
  type            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles_country_roles, zinto_conversations, zinto_messages TO service_role;

-- 0001 (portada de la ficha propia), 0019 (fotos del anuncio) y 0118 (ids de
-- la Partner API): lo que lee la vista de 0238 y listings_for_code.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS cover_photo_url text;
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS photo_ids text[] DEFAULT '{}';
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS api_property_id bigint;
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS api_clone_property_id bigint;

-- 0118 (estado del anuncio en la API): lo que lee la vista de 0241.
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS api_state text;
