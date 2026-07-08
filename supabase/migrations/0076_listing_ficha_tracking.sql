-- Ficha completa por aviso de corredora + tracking de la web propia de la
-- corredora. Cada aviso guarda: operación (venta/arriendo — la misma propiedad
-- puede estar publicada en ambas), número de publicación del portal
-- (Publicación #3914632576), antigüedad del aviso ("Publicado hace 2 meses")
-- y la URL de la misma propiedad en la web interna de la corredora, que se
-- chequea aparte para detectar cambios de precio o baja del aviso.

ALTER TABLE captacion_listings
  ADD COLUMN IF NOT EXISTS operation TEXT,                    -- 'venta' | 'arriendo'
  ADD COLUMN IF NOT EXISTS portal_publication_number TEXT,    -- Publicación #… del portal
  ADD COLUMN IF NOT EXISTS published_ago TEXT,                -- "Publicado hace 2 meses"
  ADD COLUMN IF NOT EXISTS broker_website_url TEXT,           -- URL en la web de la corredora
  ADD COLUMN IF NOT EXISTS broker_price NUMERIC,              -- último precio visto en esa web
  ADD COLUMN IF NOT EXISTS broker_currency TEXT,
  ADD COLUMN IF NOT EXISTS broker_scraped_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS broker_scrape_error TEXT;

-- El historial de precios ahora distingue de dónde salió cada snapshot:
-- del portal ('portal') o de la web propia de la corredora ('broker_web').
ALTER TABLE captacion_listing_prices
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'portal';

-- Los mismos datos del aviso principal en la ficha de la captación.
ALTER TABLE captaciones
  ADD COLUMN IF NOT EXISTS operation TEXT,
  ADD COLUMN IF NOT EXISTS portal_publication_number TEXT,
  ADD COLUMN IF NOT EXISTS published_ago TEXT;

COMMENT ON COLUMN captacion_listings.operation IS 'venta | arriendo (la misma propiedad puede tener un aviso de cada tipo)';
COMMENT ON COLUMN captacion_listings.portal_publication_number IS 'Número de publicación del portal (Publicación #…)';
COMMENT ON COLUMN captacion_listings.published_ago IS 'Antigüedad del aviso según el portal ("Publicado hace 2 meses")';
COMMENT ON COLUMN captacion_listings.broker_website_url IS 'URL de la misma propiedad en la web interna de la corredora (se trackea aparte)';
COMMENT ON COLUMN captacion_listing_prices.source IS 'portal (aviso original) | broker_web (web propia de la corredora)';

-- Fuerza a PostgREST a recargar la caché de esquema.
NOTIFY pgrst, 'reload schema';
