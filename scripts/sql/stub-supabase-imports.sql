-- ============================================================================
-- SOLO PARA PRUEBAS LOCALES (BCP-01 P5). NUNCA aplicar a una base real.
-- Se aplica DESPUÉS de stub-supabase.sql. Añade lo que 0214 da por existente
-- en el Supabase del VPS: agencias, columnas de properties que escribe la
-- importación, el índice único (agency_id, external_id) de 0016, los valores
-- por defecto de bc_reference (0011) y property_reference (0020), el trigger
-- de updated_at (0001) y un esquema storage mínimo (solo storage.buckets).
-- Todo con IF NOT EXISTS: convive con la ampliación de P2 (0212) si ya está.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agencies (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS agency_feeds (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL UNIQUE REFERENCES agencies(id) ON DELETE CASCADE
);
DO $$ BEGIN CREATE TYPE property_stay AS ENUM ('short', 'long'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE property_source AS ENUM ('manual', 'scrape', 'api'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SEQUENCE IF NOT EXISTS stub_bc_reference_seq START 5000;
CREATE SEQUENCE IF NOT EXISTS stub_property_reference_seq START 1;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS agency_id          uuid REFERENCES agencies(id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS external_id        text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_reference text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS stay               property_stay;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source             property_source NOT NULL DEFAULT 'manual';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS published_web      boolean NOT NULL DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS address            text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_url         text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude           double precision;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude          double precision;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS location_precision text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS cover_photo_url    text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_synced_at     timestamptz;
ALTER TABLE properties ALTER COLUMN bc_reference SET DEFAULT 'BC-' || nextval('stub_bc_reference_seq');
UPDATE properties SET property_reference = 'PROP-STUB-' || left(id::text, 8) WHERE property_reference IS NULL;
ALTER TABLE properties ALTER COLUMN property_reference SET DEFAULT 'PROP-2026-' || lpad(nextval('stub_property_reference_seq')::text, 4, '0');
ALTER TABLE properties ALTER COLUMN property_reference SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS properties_agency_external_id_key ON properties (agency_id, external_id) WHERE external_id IS NOT NULL;
CREATE OR REPLACE FUNCTION stub_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS properties_updated_at ON properties;
CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION stub_set_updated_at();

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id     text PRIMARY KEY,
  name   text NOT NULL,
  public boolean NOT NULL DEFAULT false
);
REVOKE ALL ON agencies, agency_feeds FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agencies, agency_feeds TO service_role;
GRANT USAGE ON SEQUENCE stub_bc_reference_seq, stub_property_reference_seq TO service_role;
