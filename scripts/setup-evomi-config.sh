#!/bin/bash
# Setup script para dejar Evomi como proxy residencial PRINCIPAL en SmartBC.
# Uso: bash scripts/setup-evomi-config.sh   (ejecutar EN LA VPS, dentro del repo)
#
# Guarda en app_settings["scraping.proxyUrl"] — fuente de verdad que lee
# lib/sync/proxy-config.ts (readStaticProxyUrl) en cada scraping de
# Idealista. Esta clave tiene PRIORIDAD sobre el fallback PROXY_URL de
# .env.production, así que este script es el paso que de verdad activa
# Evomi como principal (el .env solo es un respaldo si la BD falla).
#
# Alternativa sin SSH: pegar la misma URL en /admin/configuracion → Proxy
# configuration → Evomi → guardar. Hace exactamente este mismo UPSERT.

set -e

echo "🔧 Configurando Evomi como proxy PRINCIPAL en SmartBC..."
echo ""

if command -v docker &> /dev/null && docker ps | grep -q supabase-db; then
  DB_CMD="docker exec -i supabase-db psql -U postgres -d postgres"
  echo "✅ Docker disponible - usando contenedor supabase-db"
elif command -v psql &> /dev/null; then
  DB_CMD="psql -U postgres -d postgres"
  echo "✅ psql disponible - usando conexión local"
else
  echo "❌ No se encontró Docker ni psql"
  exit 1
fi

echo ""

# Credencial tal cual la da el panel de Evomi (host:puerto:usuario:password).
# lib/sync/proxy-config.ts la normaliza y ancla sesión/país/lifetime en cada
# request (buildEvomiUrl); no hace falta pegarla con modificadores.
PROXY_URL="core-residential.evomi.com:1000:portales3:Um72i6DQURDoxb1Ez1xs_country-ES"

echo "Guardando configuración en la BD..."
echo ""

$DB_CMD -v proxy_url="$PROXY_URL" << 'EOF'
INSERT INTO app_settings (key, value, updated_at)
VALUES ('scraping.proxyUrl', to_jsonb(:'proxy_url'::text), now())
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();

INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'scraping.proxyConfigs',
  to_jsonb(jsonb_build_array(
    jsonb_build_object(
      'provider', 'evomi',
      'url', :'proxy_url',
      'enabled', true,
      'notes', 'Residencial - principal'
    )
  )::text),
  now()
)
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();

SELECT key, value FROM app_settings WHERE key LIKE 'scraping%' ORDER BY key;
EOF

echo ""
echo "✅ Evomi guardado como proxy PRINCIPAL (scraping.proxyUrl + scraping.proxyConfigs)."
echo "   Verifica en /admin/configuracion o con /api/admin/particulares/proxy-health"
echo ""
