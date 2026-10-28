-- ============================================================================
-- SOLO PRUEBAS LOCALES (Idealista API → CRM). NUNCA aplicar a una base real.
--
-- Va DESPUÉS de stub-supabase.sql y de las migraciones de catálogo 0192–0196,
-- y ANTES de 0232/0233. Añade lo que esas dos migraciones dan por existente
-- en producción, copiado de la migración que se cita en cada bloque. Solo las
-- columnas que usan 0232/0233 y sus pruebas.
--
-- Diferencias con producción que NO están comprobadas: el esquema real puede
-- tener columnas, triggers o políticas que no salen en las migraciones. Para
-- eso está scripts/sql/idealista-crm-sync-premerge.sql, que ejecuta Fabricio.
-- ============================================================================
\set ON_ERROR_STOP 1

-- auth.uid() como en Supabase: el `sub` del JWT de la petición.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- 0032_fix_staff_rls.sql (copia literal de is_staff)
CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior')
  );
$$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin','agent_admin'))
$$;

-- 0001_init.sql:20,76
DO $$ BEGIN CREATE TYPE property_source AS ENUM ('manual', 'scrape', 'api');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source property_source NOT NULL DEFAULT 'manual';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS cover_photo_url text;          -- 0001:92
ALTER TABLE properties ADD COLUMN IF NOT EXISTS address text;                  -- 0001:89
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;    -- 0001:93
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_url text;               -- 0005:60
ALTER TABLE properties ADD COLUMN IF NOT EXISTS internal_notes text;           -- 0006
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_name text;               -- propiedad del CRM
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_phone text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_email text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS published_web boolean NOT NULL DEFAULT false;            -- 0051
ALTER TABLE properties ADD COLUMN IF NOT EXISTS new_listing_alerts_suppressed boolean NOT NULL DEFAULT false; -- 0214
ALTER TABLE properties ADD COLUMN IF NOT EXISTS archived_reason text;          -- 0215
ALTER TABLE properties ADD COLUMN IF NOT EXISTS archived_auto_at timestamptz;  -- 0215
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_archived_reason_chk') THEN
    ALTER TABLE properties ADD CONSTRAINT properties_archived_reason_chk
      CHECK (archived_reason IS NULL OR archived_reason IN ('portal_down'));   -- 0215:53-56
  END IF;
END $$;

-- 0011_bc_reference.sql
CREATE SEQUENCE IF NOT EXISTS property_bc_reference_seq START 1;
CREATE OR REPLACE FUNCTION next_bc_reference() RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'BC-' || lpad(nextval('property_bc_reference_seq')::text, 4, '0');
$$;
UPDATE properties SET bc_reference = next_bc_reference() WHERE bc_reference IS NULL;
ALTER TABLE properties ALTER COLUMN bc_reference SET DEFAULT next_bc_reference();
ALTER TABLE properties ALTER COLUMN bc_reference SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS properties_bc_reference_unique ON properties (bc_reference);
GRANT USAGE ON SEQUENCE property_bc_reference_seq TO service_role, authenticated;

-- 0016_property_external_id_per_agency.sql
CREATE UNIQUE INDEX IF NOT EXISTS properties_agency_external_id_key
  ON properties (agency_id, external_id) WHERE external_id IS NOT NULL;

-- 0001_init.sql:299-300, 330-338 (RLS de properties y property_photos)
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "properties_auth_select" ON properties;
DROP POLICY IF EXISTS "properties_staff_select" ON properties;
DROP POLICY IF EXISTS "properties_staff_write" ON properties;
DROP POLICY IF EXISTS "property_photos_select" ON property_photos;
DROP POLICY IF EXISTS "property_photos_staff_write" ON property_photos;
create policy "properties_auth_select" on properties for select to authenticated using (archived_at is null);
create policy "properties_staff_select" on properties for select using (is_staff());
create policy "properties_staff_write" on properties for all using (is_staff()) with check (is_staff());
create policy "property_photos_select" on property_photos for select to authenticated using (
  exists (select 1 from properties p where p.id = property_id and (p.archived_at is null or is_staff()))
);
create policy "property_photos_staff_write" on property_photos for all using (is_staff()) with check (is_staff());
GRANT SELECT ON properties, property_photos TO authenticated;

-- 0143 (property_history + trg_property_history), solo el cambio de estado.
CREATE TABLE IF NOT EXISTS property_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('price','status','published_web')),
  old_value   text,
  new_value   text,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION trg_property_history_fn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO property_history (property_id, kind, old_value, new_value)
    VALUES (NEW.id, 'status', OLD.status::text, NEW.status::text);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_property_history ON properties;
CREATE TRIGGER trg_property_history AFTER UPDATE OF price, status, published_web ON properties
  FOR EACH ROW EXECUTE FUNCTION trg_property_history_fn();
GRANT SELECT, INSERT ON property_history TO service_role;

-- 0016_property_media.sql + 0115 (source/format) + 0117 (idealista_listing_id)
CREATE TABLE IF NOT EXISTS property_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid REFERENCES properties(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('photo','video','plan')),
  file_name    text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  url          text NOT NULL CONSTRAINT valid_url CHECK (url ~ '^https?://'),
  has_watermark boolean DEFAULT false,
  source       text NOT NULL DEFAULT 'manual',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_media_source_check') THEN
    ALTER TABLE property_media ADD CONSTRAINT property_media_source_check
      CHECK (source IN ('manual', 'auto', 'imported'));                        -- 0115:73-77
  END IF;
END $$;
ALTER TABLE property_media ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON property_media TO service_role;

-- idealista_listings: columnas de 0019, 0060, 0063, 0118 que se usan aquí.
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS photo_ids text[] DEFAULT '{}';
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS plan_ids  text[] DEFAULT '{}';
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS video_ids text[] DEFAULT '{}';
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS external_link text;
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS api_property_id bigint;
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS api_state text;
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS api_last_sync_at timestamptz;
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS api_last_error text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_idealista_listings_api_property_id
  ON idealista_listings (api_property_id) WHERE api_property_id IS NOT NULL;   -- 0118:58-60

-- 0001_init.sql:214-218
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON app_settings TO service_role;

-- Tablas donde un cliente o un enlace público puede acabar viendo una propiedad.
-- 0001:favorites · 0122 · 0134 · 0135 · 0231 (solo las columnas que importan).
CREATE TABLE IF NOT EXISTS favorites (
  client_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, property_id)
);
CREATE TABLE IF NOT EXISTS client_property_selections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  CONSTRAINT cps_unique_client_property UNIQUE (client_id, property_id)
);
CREATE TABLE IF NOT EXISTS client_shortlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
CREATE TABLE IF NOT EXISTS client_shortlist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id uuid NOT NULL REFERENCES client_shortlists(id) ON DELETE CASCADE,
  property_id  uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  CONSTRAINT csi_unique_property UNIQUE (shortlist_id, property_id)
);
CREATE TABLE IF NOT EXISTS client_portal_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url         text NOT NULL,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS property_collab_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON favorites, client_property_selections, client_shortlists,
  client_shortlist_items, client_portal_links, property_collab_links TO service_role;
GRANT SELECT, INSERT ON favorites TO authenticated;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "favorites_self_all" ON favorites;
create policy "favorites_self_all" on favorites for all using (auth.uid() = client_id) with check (auth.uid() = client_id); -- 0001:355

-- 0013: la agencia genérica de importados (para comprobar que no se usa).
INSERT INTO agencies (slug, name) VALUES ('portales-externos', 'Portales externos') ON CONFLICT (slug) DO NOTHING;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS notes text;

\echo 'stub-idealista-crm.sql: esquema de apoyo listo'

-- scripts/apply-migrations.sh: tabla de control (para las comprobaciones previas).
CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz DEFAULT now());
INSERT INTO schema_migrations (version) VALUES ('0231_property_collab_links.sql') ON CONFLICT DO NOTHING;

-- 0018 + 0118: idealista_config (solo modo y país, para la comprobación de activación).
CREATE TABLE IF NOT EXISTS idealista_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_mode boolean DEFAULT true,
  api_country text DEFAULT 'Spain',
  created_at timestamptz DEFAULT now()
);
INSERT INTO idealista_config (sandbox_mode) SELECT false WHERE NOT EXISTS (SELECT 1 FROM idealista_config);

-- 0056: publicación programada (para transcribir la consulta de process-scheduled).
ALTER TABLE idealista_listings ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz;
