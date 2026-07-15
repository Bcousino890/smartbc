#!/bin/bash
# Script para ejecutar el scraper de particulares cada hora desde el VPS.
# Uso: agregar a crontab del servidor
# 0 * * * * /path/a/este/script.sh

set -e

# Variables de config
API_URL="${API_URL:-http://localhost:3000}"  # URL del app en el VPS (pm2 arranca next start --port 3000)
CRON_SECRET="${CRON_SECRET:-}"  # Debe estar en .env o exportado

if [ -z "$CRON_SECRET" ]; then
  echo "[ERROR] CRON_SECRET no definido. Exportarlo o agregarlo al script."
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

# Ejecuta un endpoint de cron y loguea el resultado (no aborta el script si uno
# falla — así un fallo en Idealista no impide el scraping de pisos.com).
run_endpoint() {
  local name="$1"
  local endpoint="$2"
  echo "[$TIMESTAMP] Ejecutando: $name"
  local response
  response=$(curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "$endpoint" 2>&1)
  if echo "$response" | grep -q '"ok":true'; then
    echo "[$TIMESTAMP] ✓ $name OK"
    echo "$response" | jq . 2>/dev/null || echo "$response"
  else
    echo "[$TIMESTAMP] ✗ $name error"
    echo "$response"
  fi
}

# 1) Idealista (teléfono tras DataDome; puede fallar según estado del proxy).
run_endpoint "particulares/scrape (idealista)" "$API_URL/api/cron/particulares/scrape"

# 2) pisos.com — fuente alternativa que expone el teléfono directo en el HTML
#    (sin DataDome). Mucho más fiable para conseguir teléfonos de particulares.
run_endpoint "particulares/scrape-pisos" "$API_URL/api/cron/particulares/scrape-pisos"

# 3) cross-match — copia los teléfonos recién scrapeados de pisos.com a los
#    anuncios de Idealista SIN teléfono que son (con alta confianza) la misma
#    propiedad física (mismo precio/zona/dirección). DEBE ir DESPUÉS de
#    scrape-pisos: primero se pueblan los teléfonos de pisos.com, luego se
#    cruzan. No toca DataDome — es la vía que rellena teléfonos de forma fiable
#    mientras el pool residencial esté baneado (t=bv).
run_endpoint "particulares/cross-match-phones" "$API_URL/api/cron/particulares/cross-match-phones"
