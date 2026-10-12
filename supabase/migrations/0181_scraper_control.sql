-- ============================================================
-- SmartBC · Control del crawler desde el panel (scraper_settings / scraper_zones)
-- ============================================================
-- Contrato panel <-> crawler (/opt/idealista-dev/CONTRATO-CONTROL.md): el panel
-- «Configuración de scrapers» escribe aquí lo que el dueño decide (prioridad
-- de cada zona, interruptores, presupuesto, clave de Crawio) y el crawler lo
-- lee. Solo el service role toca estas tablas: RLS ACTIVADA y SIN políticas a
-- propósito (la clave de Crawio vive en scraper_settings; ningún cliente con
-- sesión de usuario debe poder leerla por PostgREST).
--
-- Regla de oro: el crawler actualiza listings_* con upsert SIN priority /
-- sale_active / rent_active (nunca pisa lo que eligió el dueño); el panel solo
-- escribe esas tres columnas. Zona ausente o desconocida = normal y activa.
--
-- Idempotente: la siembra usa ON CONFLICT DO NOTHING, así que reaplicarla no
-- deshace las prioridades que el dueño haya cambiado.
-- ============================================================

CREATE TABLE IF NOT EXISTS scraper_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS scraper_zones (
  portal           text NOT NULL,
  zone_key         text NOT NULL,
  label            text NOT NULL,
  scope            text NOT NULL CHECK (scope IN ('capital', 'provincia')),
  priority         text NOT NULL DEFAULT 'normal' CHECK (priority IN ('alta', 'normal', 'off')),
  sale_active      boolean NOT NULL DEFAULT true,
  rent_active      boolean NOT NULL DEFAULT true,
  listings_sale    int,
  listings_rent    int,
  listings_private int,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  PRIMARY KEY (portal, zone_key)
);

-- Portales conocidos (si mañana hay otro, se amplía el CHECK en otra migración).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scraper_zones_portal_check') THEN
    ALTER TABLE scraper_zones ADD CONSTRAINT scraper_zones_portal_check CHECK (portal IN ('idealista', 'fotocasa'));
  END IF;
END $$;

ALTER TABLE scraper_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_zones    ENABLE ROW LEVEL SECURITY;
-- (sin CREATE POLICY: solo el service role, que se salta RLS, puede leer/escribir)

GRANT ALL ON scraper_settings, scraper_zones TO service_role;

-- ---------- Siembra de zonas (todas en prioridad normal) ----------
-- Idealista: 21 distritos de Madrid capital + 6 zonas del resto de la Comunidad.
-- Fotocasa: los 21 distritos de fotocasa_zones.json + Pozuelo y La Moraleja
-- (las dos zonas de fuera de la capital que ya vigilaba el scraper antiguo).
INSERT INTO scraper_zones (portal, zone_key, label, scope) VALUES
  ('idealista', 'madrid/arganzuela', 'Arganzuela', 'capital'),
  ('idealista', 'madrid/barajas', 'Barajas', 'capital'),
  ('idealista', 'madrid/carabanchel', 'Carabanchel', 'capital'),
  ('idealista', 'madrid/centro', 'Centro', 'capital'),
  ('idealista', 'madrid/chamartin', 'Chamartín', 'capital'),
  ('idealista', 'madrid/chamberi', 'Chamberí', 'capital'),
  ('idealista', 'madrid/ciudad-lineal', 'Ciudad Lineal', 'capital'),
  ('idealista', 'madrid/fuencarral-el-pardo', 'Fuencarral-El Pardo', 'capital'),
  ('idealista', 'madrid/hortaleza', 'Hortaleza', 'capital'),
  ('idealista', 'madrid/latina', 'Latina', 'capital'),
  ('idealista', 'madrid/moncloa-aravaca', 'Moncloa-Aravaca', 'capital'),
  ('idealista', 'madrid/moratalaz', 'Moratalaz', 'capital'),
  ('idealista', 'madrid/puente-de-vallecas', 'Puente de Vallecas', 'capital'),
  ('idealista', 'madrid/retiro', 'Retiro', 'capital'),
  ('idealista', 'madrid/salamanca', 'Salamanca', 'capital'),
  ('idealista', 'madrid/san-blas-canillejas', 'San Blas-Canillejas', 'capital'),
  ('idealista', 'madrid/tetuan', 'Tetuán', 'capital'),
  ('idealista', 'madrid/usera', 'Usera', 'capital'),
  ('idealista', 'madrid/vicalvaro', 'Vicálvaro', 'capital'),
  ('idealista', 'madrid/villa-de-vallecas', 'Villa de Vallecas', 'capital'),
  ('idealista', 'madrid/villaverde', 'Villaverde', 'capital'),
  ('idealista', 'madrid/zona-norte', 'Zona Norte', 'provincia'),
  ('idealista', 'madrid/zona-sur', 'Zona Sur', 'provincia'),
  ('idealista', 'madrid/zona-sureste', 'Zona Sureste', 'provincia'),
  ('idealista', 'madrid/zona-suroeste', 'Zona Suroeste', 'provincia'),
  ('idealista', 'madrid/zona-noroeste', 'Zona Noroeste', 'provincia'),
  ('idealista', 'madrid/corredor-del-henares', 'Corredor del Henares', 'provincia'),
  ('fotocasa', 'madrid-capital/arganzuela', 'Arganzuela', 'capital'),
  ('fotocasa', 'madrid-capital/barajas', 'Barajas', 'capital'),
  ('fotocasa', 'madrid-capital/barrio-de-salamanca', 'Barrio de Salamanca', 'capital'),
  ('fotocasa', 'madrid-capital/carabanchel', 'Carabanchel', 'capital'),
  ('fotocasa', 'madrid-capital/centro', 'Centro', 'capital'),
  ('fotocasa', 'madrid-capital/chamartin', 'Chamartín', 'capital'),
  ('fotocasa', 'madrid-capital/chamberi', 'Chamberí', 'capital'),
  ('fotocasa', 'madrid-capital/ciudad-lineal', 'Ciudad Lineal', 'capital'),
  ('fotocasa', 'madrid-capital/fuencarral-el-pardo', 'Fuencarral - El Pardo', 'capital'),
  ('fotocasa', 'madrid-capital/hortaleza', 'Hortaleza', 'capital'),
  ('fotocasa', 'madrid-capital/latina', 'Latina', 'capital'),
  ('fotocasa', 'madrid-capital/moncloa-aravaca', 'Moncloa - Aravaca', 'capital'),
  ('fotocasa', 'madrid-capital/moratalaz', 'Moratalaz', 'capital'),
  ('fotocasa', 'madrid-capital/puente-de-vallecas', 'Puente de Vallecas', 'capital'),
  ('fotocasa', 'madrid-capital/retiro', 'Retiro', 'capital'),
  ('fotocasa', 'madrid-capital/san-blas', 'San Blas', 'capital'),
  ('fotocasa', 'madrid-capital/tetuan', 'Tetuán', 'capital'),
  ('fotocasa', 'madrid-capital/usera', 'Usera', 'capital'),
  ('fotocasa', 'madrid-capital/vicalvaro', 'Vicálvaro', 'capital'),
  ('fotocasa', 'madrid-capital/villa-de-vallecas', 'Villa de Vallecas', 'capital'),
  ('fotocasa', 'madrid-capital/villaverde', 'Villaverde', 'capital'),
  ('fotocasa', 'pozuelo-de-alarcon/todas-las-zonas', 'Pozuelo de Alarcón (todo el municipio)', 'provincia'),
  ('fotocasa', 'la-moraleja/todas-las-zonas', 'La Moraleja (toda la zona)', 'provincia')
ON CONFLICT (portal, zone_key) DO NOTHING;

-- ---------- Siembra de ajustes (valores por defecto del contrato) ----------
-- La clave de Crawio (crawio.key.idealista / crawio.key.fotocasa) NO se siembra:
-- la pone el dueño desde el panel; mientras no exista, el crawler usa la de su .env.
INSERT INTO scraper_settings (key, value) VALUES
  ('crawio.plan_credits',        '750000'::jsonb),
  ('crawio.budget_credits',      '350000'::jsonb),
  ('crawio.reserve_credits',     '30000'::jsonb),
  ('crawio.billing_day',         '8'::jsonb),
  ('idealista.enabled',          'true'::jsonb),
  ('idealista.operations',       '{"sale": true, "rent": true}'::jsonb),
  ('idealista.agencies_enabled', 'true'::jsonb),
  ('idealista.verify_days',      '2'::jsonb),
  ('fotocasa.enabled',           'false'::jsonb),
  ('fotocasa.operations',        '{"sale": true, "rent": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- PostgREST (API del CRM) debe ver las tablas nuevas sin reiniciar.
NOTIFY pgrst, 'reload schema';
