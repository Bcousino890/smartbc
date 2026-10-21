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

-- ── Ampliación para la fase 2 (0193): columnas que lee la instantánea ──────
DO $$ BEGIN
  CREATE TYPE property_operation AS ENUM ('rent', 'sale');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS zone            text NOT NULL DEFAULT 'Madrid';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS subzone         text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS operation       property_operation NOT NULL DEFAULT 'sale';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS operations      text[] NOT NULL DEFAULT '{}';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS price           numeric(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rent_price      numeric;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS currency        text DEFAULT 'eur';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS bedrooms        int NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS bathrooms       int NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS square_meters   int;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS description     text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS features        text[] NOT NULL DEFAULT '{}';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS features_manual text[] NOT NULL DEFAULT '{}';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS floor_override  text;
ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS source_width  integer;
ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS source_height integer;
CREATE TABLE IF NOT EXISTS property_client_descriptions (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  language    text NOT NULL,
  src         text NOT NULL,
  description text,
  features    text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (property_id, language)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON property_client_descriptions TO service_role;

-- ── BCP-01 ampliación PR-B (0195): columnas y tablas que lee la selección ──
-- Solo pruebas locales. En producción ya existen (0001 y 0017+).
ALTER TABLE properties ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS idealista_listings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           uuid REFERENCES properties(id) ON DELETE CASCADE,
  reference_code        text UNIQUE,
  inspo_title           text,
  is_inspo              boolean DEFAULT false,
  idealista_property_id text,
  idealista_state       text DEFAULT 'draft',
  price                 integer,
  created_at            timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON idealista_listings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON idealista_listings TO service_role;

-- ── Ampliación C2 (0197): historias de SmartLink y clase de foto ───────────
-- Solo pruebas locales. En producción ya existen (0144, 0150, 0151).
CREATE TABLE IF NOT EXISTS property_story_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source_hash      text NOT NULL,
  status           text NOT NULL DEFAULT 'generated',
  notes            text,
  prelude          text,
  prelude_status   text,
  prelude_headline text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS property_story_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES property_story_versions(id) ON DELETE CASCADE,
  chapter    text NOT NULL,
  copy       text NOT NULL,
  position   int  NOT NULL DEFAULT 0,
  status     text NOT NULL DEFAULT 'generated'
);
-- Los mismos índices que ya declara 0144 en producción (no son nuevos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_story_approved_per_property ON property_story_versions(property_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_story_versions_property ON property_story_versions(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_blocks_version ON property_story_blocks(version_id, position);
ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS ai_class       text;
ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS ai_confidence  numeric;
ALTER TABLE property_photos ADD COLUMN IF NOT EXISTS class_override text;
REVOKE ALL ON property_story_versions, property_story_blocks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON property_story_versions, property_story_blocks TO service_role;

-- ── BCP-01 P2 (0212): columnas y tablas que lee el buscador del catálogo ──
-- Solo pruebas locales. En producción ya existen (0001, 0005, 0020, 0201).
CREATE TABLE IF NOT EXISTS agencies (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS agency_feeds (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL UNIQUE REFERENCES agencies(id) ON DELETE CASCADE
);
DO $$ BEGIN
  CREATE TYPE property_stay AS ENUM ('short', 'long');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS agency_id          uuid REFERENCES agencies(id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS external_id        text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_reference text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS stay               property_stay;
CREATE TABLE IF NOT EXISTS property_tags (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL DEFAULT 'es',
  name    text NOT NULL,
  color   text NOT NULL DEFAULT '#B8913E'
);
CREATE TABLE IF NOT EXISTS property_tag_links (
  property_id uuid NOT NULL REFERENCES properties(id)    ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES property_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (property_id, tag_id)
);
REVOKE ALL ON agencies, agency_feeds, property_tags, property_tag_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agencies, agency_feeds, property_tags, property_tag_links TO service_role;

-- ── Ampliación 0218: asesor y país del cliente, y avisos del CRM ───────────
-- Solo pruebas locales. En producción ya existen (0001, 0038 y 0050).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_advisor_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'es';
CREATE TABLE IF NOT EXISTS crm_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  link       text,
  read       boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  data       jsonb
);
REVOKE ALL ON crm_notifications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm_notifications TO service_role;

-- ── Ampliación 0220: dirección de la ficha (en producción existe desde 0001) ──
ALTER TABLE properties ADD COLUMN IF NOT EXISTS address text;
