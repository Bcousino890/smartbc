-- ============================================================================
-- SOLO PARA PRUEBAS LOCALES (BCP-01, E7). NUNCA aplicar a una base real.
--
-- Esquema mínimo que imita lo que las migraciones del catálogo dan por
-- existente en el Supabase propio del VPS: roles anon/authenticated/
-- service_role, auth.users, profiles, properties, property_photos y el helper
-- generate_url_safe_token (copiado de 0125). Solo las columnas que usan las
-- migraciones y los tests de BCP-01.
--
-- Diferencias con producción que NO están comprobadas: versión de Postgres,
-- permisos y extensiones reales de Supabase, esquema real de auth/storage.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE ROLE anon NOLOGIN;                   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN;          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Supabase concede por defecto a anon/authenticated sobre lo que se crea en
-- public. Se imita para que los tests demuestren que 0192 lo RETIRA, en vez
-- de pasar porque aquí nunca se hubiera concedido.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO service_role;
CREATE TABLE IF NOT EXISTS auth.users (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);

CREATE TABLE IF NOT EXISTS profiles (
  id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'client',
  full_name text,
  email     text NOT NULL
);

DO $$ BEGIN
  CREATE TYPE property_status AS ENUM ('available', 'reserved', 'sold', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS properties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  title        text NOT NULL,
  status       property_status NOT NULL DEFAULT 'available',
  country      text NOT NULL DEFAULT 'es',
  archived_at  timestamptz,
  bc_reference text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS property_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url         text NOT NULL,
  position    int  NOT NULL DEFAULT 0,
  is_cover    boolean NOT NULL DEFAULT false
);

CREATE OR REPLACE FUNCTION generate_url_safe_token(n_bytes integer DEFAULT 21)
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT translate(encode(gen_random_bytes(n_bytes), 'base64'), '+/', '-_');
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users, profiles, properties, property_photos TO service_role;
