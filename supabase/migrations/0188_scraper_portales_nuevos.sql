-- ============================================================
-- SmartBC · Portales nuevos solo de particulares: Pisos.com y Habitaclia
-- ============================================================
-- Contrato con el crawler: settings `pisos.*` / `habitaclia.*` y claves
-- `crawio.key.pisos` / `crawio.key.habitaclia`; workers `vps-pisos` /
-- `vps-habitaclia`; tareas (run_type) pisos-radar, pisos-verify,
-- habitaclia-sweep, habitaclia-verify. Sin zonas propias (control por portal).
--
-- Idempotente (modelo: 0181): el CHECK se vuelve a crear con la lista completa
-- y la siembra usa ON CONFLICT DO NOTHING (no pisa lo que el dueño haya cambiado).
-- ============================================================

-- ---------- Tareas reales del crawler en idealista_scraper_runs ----------
ALTER TABLE idealista_scraper_runs DROP CONSTRAINT IF EXISTS idealista_scraper_runs_run_type_check;
ALTER TABLE idealista_scraper_runs ADD CONSTRAINT idealista_scraper_runs_run_type_check CHECK (run_type = ANY (ARRAY[
  'discovery','full_market','detail_refresh','verification',
  'agencies','sweep','refresh','phones','verify','sync',
  'fotocasa-radar','fotocasa-safety','fotocasa-sweep','fotocasa-verify',
  'pisos-radar','pisos-verify',
  'habitaclia-sweep','habitaclia-verify'
]));

-- ---------- Portales conocidos en scraper_zones ----------
-- (0181 lo restringió a idealista/fotocasa; se amplía por si el crawler publica
-- alguna fila de zona de los nuevos. scraper_stats_daily.portal no tiene CHECK.)
ALTER TABLE scraper_zones DROP CONSTRAINT IF EXISTS scraper_zones_portal_check;
ALTER TABLE scraper_zones ADD CONSTRAINT scraper_zones_portal_check CHECK (portal IN ('idealista', 'fotocasa', 'pisos', 'habitaclia'));

-- ---------- Siembra de ajustes: apagados por defecto ----------
-- La clave de Crawio (crawio.key.pisos / crawio.key.habitaclia) NO se siembra.
INSERT INTO scraper_settings (key, value) VALUES
  ('pisos.enabled',         'false'::jsonb),
  ('pisos.operations',      '{"sale": true, "rent": true}'::jsonb),
  ('habitaclia.enabled',    'false'::jsonb),
  ('habitaclia.operations', '{"sale": true, "rent": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
