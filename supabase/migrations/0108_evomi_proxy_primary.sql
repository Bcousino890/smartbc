-- Deja Evomi como proxy residencial PRINCIPAL para el scraping de Idealista.
-- app_settings["scraping.proxyUrl"] es la fuente de verdad que lee
-- lib/sync/proxy-config.ts (readStaticProxyUrl) en cada request de scraping;
-- tiene prioridad sobre el fallback PROXY_URL de .env.production.
--
-- Credencial tal cual la da el panel de Evomi (host:puerto:usuario:password);
-- normalizeProxyUrl()/buildEvomiUrl() en lib/sync/proxy-config.ts la
-- normalizan y anclan sesión/país/lifetime en cada request, así que no hace
-- falta guardarla ya con modificadores.
-- Conocida y ya marcada como filtrada (Fase 0 del plan de mejoras de
-- Particulares) — rotar en el dashboard de Evomi, NUNCA reemplazar acá
-- (las migraciones son código versionado para siempre). -- gitleaks:allow
INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'scraping.proxyUrl',
  to_jsonb('core-residential.evomi.com:1000:portales3:Um72i6DQURDoxb1Ez1xs_country-ES'::text),
  now()
)
ON CONFLICT (key) DO UPDATE SET
  value = excluded.value,
  updated_at = now();
