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
-- escribe esas tres columnas.
--
-- Regla del dueño (opt-in): SOLO se scrapea lo marcado. priority 'off' = sin
-- marcar = cero créditos; 'normal' y 'alta' = marcada ('alta' = se revisa el
-- doble de seguido). Las zonas nuevas que descubre el crawler entran como 'off'
-- (por eso el DEFAULT es 'off'); zona desconocida = no se procesa.
--
-- Idempotente: la siembra de ajustes usa ON CONFLICT DO NOTHING, así que reaplicarla no
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
  priority         text NOT NULL DEFAULT 'off' CHECK (priority IN ('alta', 'normal', 'off')),
  sale_active      boolean NOT NULL DEFAULT true,
  rent_active      boolean NOT NULL DEFAULT true,
  listings_sale    int,
  listings_rent    int,
  listings_private int,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  PRIMARY KEY (portal, zone_key)
);

-- Árbol de zonas (distrito -> barrio, municipio -> zonas): lo publica el crawler.
ALTER TABLE scraper_zones ADD COLUMN IF NOT EXISTS parent_key text;

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

-- ---------- Zonas: NO se siembran ----------
-- Las zonas las define y publica el CRAWLER (comando zones-refresh): zone_key =
-- ruta real de Idealista tal como la usa shards.py. Mientras la tabla esté
-- vacía, el panel avisa de que el crawler aún no las ha publicado.

-- ---------- Tareas reales del crawler en idealista_scraper_runs ----------
-- El check original solo admitía 4 tipos y el crawler escribe una fila por
-- tarea real. Se amplía (idempotente: se vuelve a crear con la lista completa).
ALTER TABLE idealista_scraper_runs DROP CONSTRAINT IF EXISTS idealista_scraper_runs_run_type_check;
ALTER TABLE idealista_scraper_runs ADD CONSTRAINT idealista_scraper_runs_run_type_check CHECK (run_type = ANY (ARRAY[
  'discovery','full_market','detail_refresh','verification',
  'agencies','sweep','refresh','phones','verify','sync',
  'fotocasa-radar','fotocasa-safety','fotocasa-sweep','fotocasa-verify'
]));

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
