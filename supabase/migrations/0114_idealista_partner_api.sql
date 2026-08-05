-- Idealista Partner API (REST oficial, OAuth2 client_credentials) — en paralelo
-- a la automatización por Playwright que ya existe (lib/services/idealista/publisher.ts).
--
-- idealista_config ya tenía feed_key y sandbox_mode desde 0018 (época OAuth original,
-- migrada a Playwright en 0055 quitando client_id/client_secret). Los recuperamos aquí
-- porque ahora sí vamos a usar el Partner API real en paralelo al login por cookies.
ALTER TABLE idealista_config
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS client_secret text,
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS default_contact_id integer,
  ADD COLUMN IF NOT EXISTS default_contact_name text,
  ADD COLUMN IF NOT EXISTS default_contact_email text,
  ADD COLUMN IF NOT EXISTS default_contact_phone text,
  ADD COLUMN IF NOT EXISTS api_enabled boolean NOT NULL DEFAULT false;

-- Distingue qué mecanismo publicó cada intento (Playwright vs Partner API real).
ALTER TABLE idealista_publish_log
  ADD COLUMN IF NOT EXISTS publish_method text NOT NULL DEFAULT 'playwright'
    CHECK (publish_method IN ('playwright', 'api'));

-- El id numérico de propiedad que devuelve el Partner API (distinto del id que
-- extrae el scraping de Playwright, aunque ambos se guardan en la misma columna
-- text idealista_property_id — no hay colisión porque cada fila de publish_log
-- solo se publica por un método a la vez).
CREATE INDEX IF NOT EXISTS idx_idealista_publish_log_method ON idealista_publish_log(publish_method);

-- Estado de publicación vía Partner API, separado de idealista_state (que es el
-- estado del flujo por Playwright/extensión). Una misma ficha puede estar
-- "published" por Playwright y "api_failed" por la API, o viceversa — son
-- caminos independientes hacia el mismo anuncio en Idealista.
ALTER TABLE idealista_listings
  ADD COLUMN IF NOT EXISTS api_state text NOT NULL DEFAULT 'not_published'
    CHECK (api_state IN ('not_published', 'pending', 'published', 'failed')),
  ADD COLUMN IF NOT EXISTS api_idealista_property_id bigint,
  ADD COLUMN IF NOT EXISTS api_error text,
  ADD COLUMN IF NOT EXISTS api_published_at timestamptz;
