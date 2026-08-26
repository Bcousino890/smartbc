-- ============================================================================
-- SmartBC · Ingesta del scraper de mercado de Idealista (lado receptor)
-- ============================================================================
-- El scraper lo mantiene un desarrollador externo: él recorre Idealista y nos
-- EMPUJA los anuncios por `/api/v1/idealista/*`. Aquí solo vive el receptor.
--
-- ⚠️ Tres familias de tablas con "idealista" en el nombre que NO son lo mismo:
--     idealista_listings        → lo que NOSOTROS publicamos EN Idealista (0017)
--     idealista_leads           → el inbox de contactos de Idealista (0080)
--     idealista_market_*        → ESTA migración: el mercado scrapeado (entrada)
--
-- Y una cuarta, preexistente y más pobre, que sigue viva:
--     particulares              → scraper interno cross-portal (0012)
--   No se toca ni se migra aquí: cubre varios portales y solo anuncios de
--   particulares, mientras que esto cubre TODO el mercado de Idealista con la
--   ficha completa. La reconciliación entre ambas se hará cuando el scraper
--   externo esté en producción y sepamos qué se jubila.
--
-- Idempotente: post-deploy.sh relanza todas las migraciones en cada invocación.
-- ============================================================================

-- ── Listings ────────────────────────────────────────────────────────────────
-- `idealista_id` es la clave de deduplicación del upsert: el mismo payload dos
-- veces no puede crear dos filas (ver uq_idealista_market_listings_external).
CREATE TABLE IF NOT EXISTS idealista_market_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Identificación ──
  idealista_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'idealista',
  country TEXT NOT NULL DEFAULT 'es',
  listing_url TEXT,
  canonical_url TEXT,
  title TEXT,
  subtitle TEXT,
  operation TEXT CHECK (operation IN ('sale', 'rent')),
  property_type TEXT,
  property_subtype TEXT,

  -- ── Estado ──
  -- 'reactivated' NO es un estado persistente: el receptor lo acepta como
  -- entrada y lo traduce a status='active' + reactivated_at (ver contrato).
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'missing', 'off_market')),
  missing_since TIMESTAMPTZ,
  off_market_at TIMESTAMPTZ,
  reactivated_at TIMESTAMPTZ,

  -- ── Fechas internas (nuestras, no de Idealista) ──
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_search_seen_at TIMESTAMPTZ,
  last_detail_scraped_at TIMESTAMPTZ,

  -- ── Fechas declaradas por Idealista ──
  -- source_update_text es el literal ("Actualizado el 3 de agosto"); el scraper
  -- puede además resolverlo a timestamp en source_updated_at. Se guardan los
  -- dos: el literal no se pierde aunque el parseo cambie.
  source_update_text TEXT,
  source_updated_at TIMESTAMPTZ,
  source_created_at TIMESTAMPTZ,

  -- ── Precio ──
  current_price NUMERIC(14, 2),
  currency TEXT NOT NULL DEFAULT 'eur',
  price_per_m2 NUMERIC(12, 2),
  price_raw TEXT,
  previous_price NUMERIC(14, 2),
  discount_amount NUMERIC(14, 2),
  discount_percentage NUMERIC(6, 2),
  garage_price NUMERIC(14, 2),
  garage_included BOOLEAN,
  community_fees NUMERIC(12, 2),

  -- ── Descripción ──
  description TEXT,
  description_hash TEXT,

  -- ── Características ──
  constructed_m2 INTEGER,
  usable_m2 INTEGER,
  bedrooms INTEGER,
  bathrooms INTEGER,
  floor TEXT,
  total_floors INTEGER,
  is_exterior BOOLEAN,
  is_interior BOOLEAN,
  has_elevator BOOLEAN,
  property_condition TEXT,
  construction_year INTEGER,
  heating TEXT,
  heating_type TEXT,
  has_air_conditioning BOOLEAN,
  has_fitted_wardrobes BOOLEAN,
  has_storage_room BOOLEAN,
  has_terrace BOOLEAN,
  has_balcony BOOLEAN,
  has_garage BOOLEAN,
  orientation TEXT,
  is_accessible BOOLEAN,
  plot_m2 INTEGER,
  has_garden BOOLEAN,
  has_swimming_pool BOOLEAN,
  pets_allowed BOOLEAN,
  is_furnished BOOLEAN,
  has_equipped_kitchen BOOLEAN,

  -- ── Certificado energético ──
  energy_certificate TEXT,
  energy_consumption NUMERIC(10, 2),
  energy_consumption_rating TEXT,
  energy_emissions NUMERIC(10, 2),
  energy_emissions_rating TEXT,

  -- ── Crudo (lo que no cabe en columnas: se conserva sin interpretar) ──
  features_raw JSONB,
  badges_raw JSONB,
  location_raw JSONB,
  raw_payload JSONB,

  -- ── Ubicación ──
  street TEXT,
  street_number TEXT,
  area TEXT,
  subarea TEXT,
  neighborhood TEXT,
  district TEXT,
  municipality TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_precision TEXT,

  -- ── Anunciante ──
  advertiser_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (advertiser_type IN ('particular', 'professional', 'unknown')),
  advertiser_name TEXT,
  advertiser_profile_url TEXT,
  advertiser_logo TEXT,
  advertiser_source_id TEXT,
  advertiser_hash TEXT,

  -- ── Promoción / destacados ──
  is_promoted BOOLEAN NOT NULL DEFAULT FALSE,
  promotion_type TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,

  -- ── Multimedia ──
  video_url TEXT,
  virtual_tour_url TEXT,
  three_d_tour_url TEXT,
  photo_count INTEGER NOT NULL DEFAULT 0,
  photos_hash TEXT,
  features_hash TEXT,

  -- ── Hash global de la ficha (permite detectar "sin cambios" en O(1)) ──
  listing_hash TEXT,

  -- ── Trazabilidad de la integración ──
  api_client_id UUID REFERENCES api_clients(id) ON DELETE SET NULL,
  last_run_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clave del upsert. Global (no por cliente API): el id de un anuncio de
-- Idealista es el mismo lo mande quien lo mande, y dos proveedores no deben
-- crear dos filas del mismo piso.
CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_market_listings_external
  ON idealista_market_listings (idealista_id);

CREATE INDEX IF NOT EXISTS idx_idealista_market_listings_status
  ON idealista_market_listings (status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_idealista_market_listings_advertiser
  ON idealista_market_listings (advertiser_type, status);
CREATE INDEX IF NOT EXISTS idx_idealista_market_listings_operation
  ON idealista_market_listings (operation, status);
CREATE INDEX IF NOT EXISTS idx_idealista_market_listings_geo
  ON idealista_market_listings (municipality, district, neighborhood);
CREATE INDEX IF NOT EXISTS idx_idealista_market_listings_price
  ON idealista_market_listings (current_price) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_idealista_market_listings_last_seen
  ON idealista_market_listings (last_seen_at DESC);
-- Cola de refresco: "qué toca volver a mirar" ordena por esto en cada barrido.
CREATE INDEX IF NOT EXISTS idx_idealista_market_listings_refresh
  ON idealista_market_listings (last_detail_scraped_at NULLS FIRST)
  WHERE status = 'active';

COMMENT ON TABLE idealista_market_listings IS 'Mercado de Idealista scrapeado por el proveedor externo. Entrada por /api/v1/idealista/listings';
COMMENT ON COLUMN idealista_market_listings.idealista_id IS 'Id del anuncio en idealista.com. Clave única de upsert.';
COMMENT ON COLUMN idealista_market_listings.listing_hash IS 'Hash de la ficha completa: si no cambia, el upsert responde unchanged sin escribir.';
COMMENT ON COLUMN idealista_market_listings.raw_payload IS 'Último payload crudo recibido (auditoría y reprocesado sin re-scrapear).';

-- ── Fotos ───────────────────────────────────────────────────────────────────
-- No se descarga el archivo: se guarda la URL del CDN ya normalizada al perfil
-- SIN marca de agua (ver lib/sync/scrapers/idealista.ts · toIdealistaHighQuality).
CREATE TABLE IF NOT EXISTS idealista_market_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES idealista_market_listings(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_photo_id TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_main BOOLEAN NOT NULL DEFAULT FALSE,
  caption TEXT,
  width INTEGER,
  height INTEGER,
  content_hash TEXT,
  kind TEXT NOT NULL DEFAULT 'photo'
    CHECK (kind IN ('photo', 'floorplan', 'video', 'tour', 'other')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedupe por URL: reenviar la misma galería no duplica filas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_market_photos_url
  ON idealista_market_photos (listing_id, source_url);
CREATE INDEX IF NOT EXISTS idx_idealista_market_photos_listing
  ON idealista_market_photos (listing_id, order_index);

COMMENT ON COLUMN idealista_market_photos.source_url IS 'URL del CDN normalizada al perfil sin marca de agua. El receptor la normaliza aunque el scraper mande otro perfil.';
COMMENT ON COLUMN idealista_market_photos.kind IS 'photo | floorplan | video | tour | other — planos y multimedia extra viven aquí, no en tabla aparte.';

-- ── Teléfonos ───────────────────────────────────────────────────────────────
-- El receptor NO obtiene teléfonos: solo guarda lo que el scraper consiga.
CREATE TABLE IF NOT EXISTS idealista_market_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES idealista_market_listings(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  phone_normalized TEXT,
  -- Clave de dedupe como columna REAL y no como índice de expresión: PostgREST
  -- traduce `onConflict` a `ON CONFLICT (columnas)`, y Postgres no sabe inferir
  -- un índice sobre COALESCE(...) — el upsert fallaría con "no unique or
  -- exclusion constraint matching the ON CONFLICT specification".
  phone_key TEXT GENERATED ALWAYS AS (COALESCE(phone_normalized, phone)) STORED,
  source TEXT,
  phone_status TEXT NOT NULL DEFAULT 'available'
    CHECK (phone_status IN ('available', 'not_available', 'not_requested', 'failed', 'restricted')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedupe por número normalizado cuando existe; si no, por el crudo (ver
-- phone_key), para que el mismo número escrito de dos formas no entre dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_market_phones_number
  ON idealista_market_phones (listing_id, phone_key);
CREATE INDEX IF NOT EXISTS idx_idealista_market_phones_lookup
  ON idealista_market_phones (phone_normalized) WHERE is_active;

-- ── Enlaces adicionales ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idealista_market_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES idealista_market_listings(id) ON DELETE CASCADE,
  label TEXT,
  url TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_market_links_url
  ON idealista_market_links (listing_id, url);

-- ── Eventos ─────────────────────────────────────────────────────────────────
-- Lo que hace útil el histórico: qué cambió, cuándo y de qué a qué.
CREATE TABLE IF NOT EXISTS idealista_market_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES idealista_market_listings(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'NEW_LISTING',
    'PRICE_DOWN',
    'PRICE_UP',
    'DESCRIPTION_CHANGED',
    'PHOTOS_CHANGED',
    'FEATURES_CHANGED',
    'ADVERTISER_CHANGED',
    'PHONE_CHANGED',
    'ADDITIONAL_LINK_CHANGED',
    'BADGES_CHANGED',
    'PROMOTED',
    'PROMOTION_REMOVED',
    'MISSING',
    'OFF_MARKET',
    'REACTIVATED'
  )),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  run_id UUID,
  -- Huella del evento: mismo cambio detectado dos veces (reenvío del mismo
  -- payload) no crea dos filas. La calcula el motor de upsert.
  dedupe_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idealista_market_events_listing
  ON idealista_market_events (listing_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_idealista_market_events_type
  ON idealista_market_events (event_type, detected_at DESC);
-- Sin cláusula WHERE a propósito: un índice PARCIAL no se puede inferir desde
-- `ON CONFLICT (columnas)`, que es lo que genera PostgREST. Con dedupe_hash a
-- NULL Postgres considera las filas distintas y no deduplica — aceptable,
-- porque el motor de upsert siempre lo calcula.
CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_market_events_dedupe
  ON idealista_market_events (listing_id, event_type, dedupe_hash);

-- ── Snapshots ───────────────────────────────────────────────────────────────
-- Histórico ligero: solo hashes y precio, no el payload entero. Permite
-- reconstruir la curva de precio y saber cuándo cambió cada bloque.
CREATE TABLE IF NOT EXISTS idealista_market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES idealista_market_listings(id) ON DELETE CASCADE,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_price NUMERIC(14, 2),
  listing_hash TEXT,
  description_hash TEXT,
  features_hash TEXT,
  photos_hash TEXT,
  advertiser_hash TEXT,
  source_updated_at TIMESTAMPTZ,
  status TEXT,
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idealista_market_snapshots_listing
  ON idealista_market_snapshots (listing_id, scraped_at DESC);
-- Un snapshot por ficha y hash: reenviar lo mismo no engorda el histórico.
-- Sin WHERE por el mismo motivo que el índice de eventos (ON CONFLICT no puede
-- inferir un índice parcial).
CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_market_snapshots_hash
  ON idealista_market_snapshots (listing_id, listing_hash);

-- ── Observaciones en páginas de resultados ──────────────────────────────────
-- Dónde se vio el anuncio (shard, página, posición). Es información de la
-- BÚSQUEDA, no de la ficha: se guarda aparte para no pisar el estado principal.
CREATE TABLE IF NOT EXISTS idealista_market_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES idealista_market_listings(id) ON DELETE CASCADE,
  shard_id UUID,
  external_shard_id TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  page_number INTEGER,
  position_in_page INTEGER,
  absolute_position INTEGER,
  price_observed NUMERIC(14, 2),
  badges_observed JSONB,
  advertiser_type_observed TEXT,
  search_result_hash TEXT,
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idealista_market_observations_listing
  ON idealista_market_observations (listing_id, seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_idealista_market_observations_shard
  ON idealista_market_observations (external_shard_id, seen_at DESC);

-- ── Shards ──────────────────────────────────────────────────────────────────
-- El troceado de búsquedas lo decide el scraper (Idealista corta la paginación
-- a ~60 páginas). Aquí solo se registra lo que él reporta, para poder ver la
-- cobertura y qué trozos fallan.
CREATE TABLE IF NOT EXISTS idealista_market_shards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_shard_id TEXT NOT NULL,
  operation TEXT CHECK (operation IN ('sale', 'rent')),
  city TEXT,
  area TEXT,
  subarea TEXT,
  property_type TEXT,
  price_min NUMERIC(14, 2),
  price_max NUMERIC(14, 2),
  search_url TEXT,
  reported_results INTEGER,
  pages_expected INTEGER,
  pages_found INTEGER,
  status TEXT,
  last_scan_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  parent_shard_id UUID REFERENCES idealista_market_shards(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_market_shards_external
  ON idealista_market_shards (external_shard_id);
CREATE INDEX IF NOT EXISTS idx_idealista_market_shards_status
  ON idealista_market_shards (status, last_scan_at DESC);

-- ── Runs ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS idealista_scraper_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_run_id TEXT NOT NULL,
  worker_id TEXT,
  run_type TEXT NOT NULL
    CHECK (run_type IN ('discovery', 'full_market', 'detail_refresh', 'verification')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'partial', 'failed', 'stopped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,

  listings_seen INTEGER NOT NULL DEFAULT 0,
  listings_sent INTEGER NOT NULL DEFAULT 0,
  new_listings INTEGER NOT NULL DEFAULT 0,
  updated_listings INTEGER NOT NULL DEFAULT 0,
  unchanged_listings INTEGER NOT NULL DEFAULT 0,
  missing_listings INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  requests_used INTEGER NOT NULL DEFAULT 0,
  pages_scraped INTEGER NOT NULL DEFAULT 0,

  shards_total INTEGER,
  shards_success INTEGER,
  shards_failed INTEGER,
  reported_results INTEGER,
  unique_listing_ids_found INTEGER,
  coverage_percentage NUMERIC(6, 2),

  error_summary TEXT,
  metadata JSONB,
  api_client_id UUID REFERENCES api_clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El scraper manda el mismo external_run_id al abrir y al cerrar el run: el
-- upsert por esta clave es lo que convierte dos POST en un solo run.
CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_scraper_runs_external
  ON idealista_scraper_runs (external_run_id);
CREATE INDEX IF NOT EXISTS idx_idealista_scraper_runs_started
  ON idealista_scraper_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_idealista_scraper_runs_status
  ON idealista_scraper_runs (status, started_at DESC);

-- ── Workers / heartbeat ─────────────────────────────────────────────────────
-- Una fila por worker. El panel deduce RUNNING / STALE / ERROR comparando
-- last_heartbeat_at contra el umbral configurado.
CREATE TABLE IF NOT EXISTS idealista_scraper_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_run_type TEXT,
  current_run_id TEXT,
  current_shard TEXT,
  message TEXT,
  requests_used_month INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_idealista_scraper_workers_worker
  ON idealista_scraper_workers (worker_id);
CREATE INDEX IF NOT EXISTS idx_idealista_scraper_workers_heartbeat
  ON idealista_scraper_workers (last_heartbeat_at DESC);

-- ── Configuración ───────────────────────────────────────────────────────────
-- Los tiempos NO se hardcodean en el scraper: se editan aquí y el scraper los
-- lee en `GET /api/v1/idealista/config`. `version` sube en cada cambio, así el
-- scraper sabe si tiene que releer sin comparar campo a campo.
CREATE TABLE IF NOT EXISTS idealista_scraper_config (
  -- Singleton de verdad: el CHECK sobre la PK impide una segunda fila.
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  version INTEGER NOT NULL DEFAULT 1,

  scraping_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  discovery_interval_minutes INTEGER NOT NULL DEFAULT 5,
  full_market_sweep_interval_hours INTEGER NOT NULL DEFAULT 24,

  -- Venta: cuanto más viejo el anuncio, menos falta refrescarlo.
  sale_0_14_days_refresh_hours INTEGER NOT NULL DEFAULT 48,
  sale_15_30_days_refresh_hours INTEGER NOT NULL DEFAULT 72,
  sale_31_90_days_refresh_hours INTEGER NOT NULL DEFAULT 168,
  sale_over_90_days_refresh_hours INTEGER NOT NULL DEFAULT 336,

  -- Alquiler: se mueve mucho más rápido que la venta.
  rent_0_7_days_refresh_hours INTEGER NOT NULL DEFAULT 24,
  rent_8_30_days_refresh_hours INTEGER NOT NULL DEFAULT 48,
  rent_over_30_days_refresh_hours INTEGER NOT NULL DEFAULT 168,

  -- Particulares: son el objetivo comercial, se vigilan más de cerca.
  private_first_72h_refresh_hours INTEGER NOT NULL DEFAULT 6,
  private_day_3_7_refresh_hours INTEGER NOT NULL DEFAULT 24,

  -- Verificaciones antes de dar un anuncio por retirado.
  missing_verification_delay_hours INTEGER NOT NULL DEFAULT 24,
  off_market_confirmation_delay_hours INTEGER NOT NULL DEFAULT 72,

  -- Cuota y control de carga.
  monthly_request_budget INTEGER NOT NULL DEFAULT 250000,
  monthly_request_reserve INTEGER NOT NULL DEFAULT 50000,
  max_batch_size INTEGER NOT NULL DEFAULT 200,
  max_concurrency INTEGER NOT NULL DEFAULT 4,
  requests_per_minute INTEGER NOT NULL DEFAULT 60,

  -- Umbral del panel: sin heartbeat en este tiempo, el estado pasa a STALE.
  heartbeat_stale_minutes INTEGER NOT NULL DEFAULT 30,

  notes TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fila por defecto: el GET /config nunca debe devolver 404.
INSERT INTO idealista_scraper_config (singleton) VALUES (TRUE)
  ON CONFLICT (singleton) DO NOTHING;

-- `version` sube sola en cada UPDATE: el scraper compara un entero y ya sabe
-- si su copia está vieja. Hacerlo en trigger evita que un update desde SQL
-- (o desde otra ruta futura) se olvide de subirla.
CREATE OR REPLACE FUNCTION bump_idealista_scraper_config_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS idealista_scraper_config_version ON idealista_scraper_config;
CREATE TRIGGER idealista_scraper_config_version
  BEFORE UPDATE ON idealista_scraper_config
  FOR EACH ROW EXECUTE FUNCTION bump_idealista_scraper_config_version();

-- ── FKs diferidas de run_id ─────────────────────────────────────────────────
-- Se añaden al final porque idealista_scraper_runs se crea después de las
-- tablas que la referencian. ON DELETE SET NULL: borrar un run no borra el dato.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'idealista_market_listings_last_run_fk'
  ) THEN
    ALTER TABLE idealista_market_listings
      ADD CONSTRAINT idealista_market_listings_last_run_fk
      FOREIGN KEY (last_run_id) REFERENCES idealista_scraper_runs(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'idealista_market_events_run_fk'
  ) THEN
    ALTER TABLE idealista_market_events
      ADD CONSTRAINT idealista_market_events_run_fk
      FOREIGN KEY (run_id) REFERENCES idealista_scraper_runs(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'idealista_market_observations_shard_fk'
  ) THEN
    ALTER TABLE idealista_market_observations
      ADD CONSTRAINT idealista_market_observations_shard_fk
      FOREIGN KEY (shard_id) REFERENCES idealista_market_shards(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Triggers de updated_at ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS idealista_market_listings_updated_at ON idealista_market_listings;
CREATE TRIGGER idealista_market_listings_updated_at
  BEFORE UPDATE ON idealista_market_listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS idealista_market_photos_updated_at ON idealista_market_photos;
CREATE TRIGGER idealista_market_photos_updated_at
  BEFORE UPDATE ON idealista_market_photos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS idealista_market_phones_updated_at ON idealista_market_phones;
CREATE TRIGGER idealista_market_phones_updated_at
  BEFORE UPDATE ON idealista_market_phones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS idealista_market_shards_updated_at ON idealista_market_shards;
CREATE TRIGGER idealista_market_shards_updated_at
  BEFORE UPDATE ON idealista_market_shards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS idealista_scraper_runs_updated_at ON idealista_scraper_runs;
CREATE TRIGGER idealista_scraper_runs_updated_at
  BEFORE UPDATE ON idealista_scraper_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS idealista_scraper_workers_updated_at ON idealista_scraper_workers;
CREATE TRIGGER idealista_scraper_workers_updated_at
  BEFORE UPDATE ON idealista_scraper_workers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- La ingesta va con service role (bypassa RLS). Esto es defensa en profundidad:
-- ningún usuario del portal debe leer el mercado scrapeado.
ALTER TABLE idealista_market_listings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_market_photos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_market_phones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_market_links        ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_market_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_market_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_market_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_market_shards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_scraper_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_scraper_workers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE idealista_scraper_config      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'idealista_market_listings',
    'idealista_market_photos',
    'idealista_market_phones',
    'idealista_market_links',
    'idealista_market_events',
    'idealista_market_snapshots',
    'idealista_market_observations',
    'idealista_market_shards',
    'idealista_scraper_runs',
    'idealista_scraper_workers',
    'idealista_scraper_config'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (is_admin()) WITH CHECK (is_admin())',
      t || '_admin_all', t
    );
  END LOOP;
END $$;

COMMENT ON TABLE idealista_scraper_runs IS 'Ejecuciones reportadas por el scraper externo (POST /api/v1/idealista/runs)';
COMMENT ON TABLE idealista_scraper_workers IS 'Último heartbeat por worker; alimenta el estado del mini panel';
COMMENT ON TABLE idealista_scraper_config IS 'Frecuencias y cuotas que el scraper lee en GET /api/v1/idealista/config';

-- PostgREST cachea el esquema: sin esto, todas las rutas nuevas dan PGRST205.
NOTIFY pgrst, 'reload schema';
