#!/bin/bash
# Setup script para guardar credenciales de Smartproxy en la BD
# Uso: bash scripts/setup-smartproxy-config.sh
#
# Guarda en app_settings:
#   - scraping.smartproxy.app_key: tu app_key de Smartproxy

set -e

echo "🔧 Configurando Smartproxy en SmartBC..."
echo ""

# Detectar si estamos en Docker o local
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
echo "Smartproxy Configuration"
echo "========================"
echo ""
echo "App Key: Tu clave API de Smartproxy"
echo "Obtén la URL completa en: https://www.smartproxy.org/ → Configuración de proxy"
echo "Ejemplo: https://www.smartproxy.org/web_v1/ip/get-ip-v3?app_key=9cf8f476185ea51d90a811dfedf19974&..."
echo ""

# Valores a guardar (edita estos valores directamente en el script)
APP_KEY="9cf8f476185ea51d90a811dfedf19974"
PROXY_URL="http://smart-b04nrjtamr8a_area-ES_city-MADRID:ZLOutsGkCC5kgmwS@eu.smartproxy.net:3120"

echo "Guardando configuración en la BD..."
echo ""

# Guardar app_key
$DB_CMD << EOF
INSERT INTO app_settings (key, value, created_at, updated_at)
VALUES ('scraping.smartproxy.app_key', '$APP_KEY', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET value = '$APP_KEY', updated_at = NOW();

INSERT INTO app_settings (key, value, created_at, updated_at)
VALUES ('scraping.proxyUrl', '$PROXY_URL', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET value = '$PROXY_URL', updated_at = NOW();

SELECT key, value FROM app_settings WHERE key LIKE 'scraping%' ORDER BY key;
EOF

echo ""
echo "✅ Configuración guardada:"
echo "   • scraping.smartproxy.app_key: $APP_KEY"
echo "   • scraping.proxyUrl: $PROXY_URL (fallback)"
echo ""
echo "🚀 El VPS usará estas credenciales en la próxima extracción de teléfono"
echo ""
