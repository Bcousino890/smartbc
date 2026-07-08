-- Avisos de la misma propiedad publicados por distintas corredoras.
-- Cada captación puede tener N URLs (Portal Inmobiliario, toctoc, etc.);
-- cada una se scrapea completa y se guarda aquí. Además se registra un
-- historial de precios por aviso para trazabilidad: quién subió/bajó el
-- precio, cuántas corredoras tienen la propiedad, etc.

CREATE TABLE IF NOT EXISTS captacion_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captacion_id UUID NOT NULL REFERENCES captaciones(id) ON DELETE CASCADE,

  source_url TEXT NOT NULL,
  source_site TEXT,

  -- Corredora y su código interno para la propiedad
  broker_name TEXT,
  external_reference TEXT,

  -- Ficha completa scrapeada del aviso
  title TEXT,
  description TEXT,
  price NUMERIC,
  currency TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  square_meters INTEGER,
  region TEXT,
  commune TEXT,
  zone TEXT,
  address_scraped TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  cover_photo_url TEXT,
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,

  scrape_status TEXT,
  scrape_error TEXT,
  scraped_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE (captacion_id, source_url)
);

-- Historial de precios por aviso (un snapshot por cada cambio detectado)
CREATE TABLE IF NOT EXISTS captacion_listing_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES captacion_listings(id) ON DELETE CASCADE,
  price NUMERIC,
  currency TEXT,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_captacion_listings_captacion ON captacion_listings(captacion_id);
CREATE INDEX IF NOT EXISTS idx_captacion_listings_reference
  ON captacion_listings(external_reference) WHERE external_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_captacion_listing_prices_listing
  ON captacion_listing_prices(listing_id, scraped_at DESC);

ALTER TABLE captacion_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE captacion_listing_prices ENABLE ROW LEVEL SECURITY;

-- Mismos permisos que la captación padre (defensa en profundidad: la app
-- accede con service role). Patrón de 0065 (tabla profiles, roles reales).
DROP POLICY IF EXISTS "captacion_listings_staff" ON captacion_listings;
CREATE POLICY "captacion_listings_staff" ON captacion_listings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM captaciones c
      WHERE c.id = captacion_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (
            SELECT id FROM profiles
            WHERE role IN ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior', 'captadora')
          )
        )
    )
  );

DROP POLICY IF EXISTS "captacion_listing_prices_staff" ON captacion_listing_prices;
CREATE POLICY "captacion_listing_prices_staff" ON captacion_listing_prices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM captacion_listings l
      JOIN captaciones c ON c.id = l.captacion_id
      WHERE l.id = listing_id
        AND (
          c.created_by = auth.uid()
          OR c.assigned_to = auth.uid()
          OR auth.uid() IN (
            SELECT id FROM profiles
            WHERE role IN ('admin', 'advisor', 'agent_admin', 'agent_senior', 'agent_junior', 'captadora')
          )
        )
    )
  );

COMMENT ON TABLE captacion_listings IS 'Avisos de la misma propiedad en distintas corredoras (ficha completa scrapeada por URL)';
COMMENT ON TABLE captacion_listing_prices IS 'Historial de precios por aviso de corredora (trazabilidad de subidas/bajadas)';

-- Fuerza a PostgREST a recargar la caché de esquema.
NOTIFY pgrst, 'reload schema';
