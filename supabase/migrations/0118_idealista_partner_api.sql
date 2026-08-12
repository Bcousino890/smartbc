-- ============================================================================
-- SmartBC · Partner API de Idealista ("API en tiempo real")
-- ============================================================================
-- Hasta ahora los anuncios de Idealista se publicaban con la extensión de
-- Chrome (rellenando su formulario). Con las credenciales del Partner API
-- pasamos a publicar por API, y eso obliga a guardar tres relaciones que antes
-- no existían y que Idealista exige tener controladas para el paso a
-- producción:
--
--   1. anuncio nuestro  ↔ propertyId de Idealista
--   2. contacto nuestro ↔ contactId de Idealista
--   3. foto nuestra     ↔ imageId de Idealista (con el checksum MD5 del
--      original, que es lo que ellos facilitan para poder emparejarlas)
--
-- Idempotente: post-deploy.sh relanza todas las migraciones en cada deploy.
-- ============================================================================

-- ── Credenciales y ajustes del API ──────────────────────────────────────────
-- `client_id`, `feed_key` y `sandbox_mode` ya existían (migración 0018). El
-- secreto se guarda cifrado (AES-256-GCM), igual que el resto de integraciones.
ALTER TABLE idealista_config
  ADD COLUMN IF NOT EXISTS api_client_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS api_client_secret_iv text,
  ADD COLUMN IF NOT EXISTS api_scope text DEFAULT 'idealista',
  ADD COLUMN IF NOT EXISTS api_country text DEFAULT 'Spain',
  ADD COLUMN IF NOT EXISTS api_language text DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS api_send_code boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS api_last_test_at timestamptz,
  ADD COLUMN IF NOT EXISTS api_last_test_ok boolean,
  ADD COLUMN IF NOT EXISTS api_last_test_message text;

-- ── Estado del anuncio en Idealista ─────────────────────────────────────────
-- `idealista_property_id` (texto) se queda como está: lo rellena el flujo de la
-- extensión sacándolo de la URL. El API devuelve un id numérico propio, así que
-- va en su columna para no mezclar dos cosas que se rellenan de forma distinta.
ALTER TABLE idealista_listings
  ADD COLUMN IF NOT EXISTS api_property_id bigint,
  ADD COLUMN IF NOT EXISTS api_state text,
  ADD COLUMN IF NOT EXISTS api_scope text,
  ADD COLUMN IF NOT EXISTS api_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS api_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS api_last_error text,
  -- Anuncio clonado: el mismo inmueble publicado a la vez en venta y alquiler
  -- gastando un único hueco (POST /v1/properties/{id}/clone).
  ADD COLUMN IF NOT EXISTS api_clone_property_id bigint,
  ADD COLUMN IF NOT EXISTS api_virtual_tour_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_idealista_listings_api_property_id
  ON idealista_listings (api_property_id)
  WHERE api_property_id IS NOT NULL;

-- ── Contactos ───────────────────────────────────────────────────────────────
-- Un anuncio sólo puede llevar un contacto, y el contacto tiene que existir en
-- Idealista antes de publicar. Esta tabla es el espejo de los suyos: se llena
-- con "Find All Contacts" y con cada alta que hacemos.
CREATE TABLE IF NOT EXISTS idealista_api_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id bigint NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  last_name text,
  email text NOT NULL DEFAULT '',
  phone_prefix text,
  phone text,
  secondary_phone_prefix text,
  secondary_phone text,
  -- Los contactos de agente no se pueden modificar por API (Idealista
  -- responde 409); se marcan para poder avisar antes de intentarlo.
  is_agent boolean DEFAULT false,
  agent_email text,
  active boolean DEFAULT true,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idealista_api_contacts_email ON idealista_api_contacts (lower(email));

-- ── Imágenes ────────────────────────────────────────────────────────────────
-- El PUT de imágenes es una foto fija: manda todas o se borran las que falten.
-- Aquí guardamos qué imageId de Idealista corresponde a cada URL nuestra, con
-- el checksum MD5 del original que ellos devuelven en el GET.
CREATE TABLE IF NOT EXISTS idealista_api_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES idealista_listings(id) ON DELETE CASCADE,
  idealista_image_id bigint,
  url text NOT NULL,
  original_md5 text,
  label text,
  position integer,
  state text,
  synced_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idealista_api_images_unique
  ON idealista_api_images (listing_id, idealista_image_id)
  WHERE idealista_image_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_idealista_api_images_listing ON idealista_api_images (listing_id);
CREATE INDEX IF NOT EXISTS idx_idealista_api_images_md5 ON idealista_api_images (original_md5);

-- ── Vídeos ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idealista_api_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES idealista_listings(id) ON DELETE CASCADE,
  idealista_video_id bigint,
  url text NOT NULL,
  position integer,
  state text,
  synced_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idealista_api_videos_unique
  ON idealista_api_videos (listing_id, idealista_video_id)
  WHERE idealista_video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_idealista_api_videos_listing ON idealista_api_videos (listing_id);

-- ── Registro de llamadas ────────────────────────────────────────────────────
-- Idealista revisa las peticiones antes de dar el visto bueno a producción, y
-- cuando algo falla lo primero que preguntan es qué se les mandó exactamente.
CREATE TABLE IF NOT EXISTS idealista_api_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES idealista_listings(id) ON DELETE SET NULL,
  operation text NOT NULL,
  method text,
  path text,
  status integer,
  ok boolean DEFAULT false,
  request_body jsonb,
  response_body jsonb,
  error_message text,
  duration_ms integer,
  sandbox boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idealista_api_log_listing ON idealista_api_log (listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idealista_api_log_created ON idealista_api_log (created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo criterio que el resto de tablas de Idealista: sólo admin. La app entra
-- con service role, que se salta RLS.
ALTER TABLE idealista_api_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_api_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_api_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_api_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_idealista_api_contacts" ON idealista_api_contacts;
CREATE POLICY "admin_manage_idealista_api_contacts" ON idealista_api_contacts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_manage_idealista_api_images" ON idealista_api_images;
CREATE POLICY "admin_manage_idealista_api_images" ON idealista_api_images
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_manage_idealista_api_videos" ON idealista_api_videos;
CREATE POLICY "admin_manage_idealista_api_videos" ON idealista_api_videos
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_manage_idealista_api_log" ON idealista_api_log;
CREATE POLICY "admin_manage_idealista_api_log" ON idealista_api_log
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
