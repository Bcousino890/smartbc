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

# 2) Fotocasa — la otra mitad del cruce. Muchos dueños publican el mismo piso
#    en Idealista y en Fotocasa pero sólo enseñan el teléfono en uno de los
#    dos, y Fotocasa lo trae en el JSON del propio LISTADO (sin abrir la ficha
#    ni pelear con DataDome): ~95% de los particulares vienen con teléfono.
#    Necesita el proxy de Evomi sí o sí — desde la IP del VPS responde 403.
#
#    Recorre las zonas marcadas en el panel (Particulares → "Zonas a scrapear
#    en Fotocasa"). Incremental por defecto: 3 páginas por zona bastan porque
#    el listado va ordenado por fecha. El barrido completo de cada zona
#    (`?toPage=40`) se lanza una vez al día — hacerlo en cada pasada dispara
#    el gasto de proxy.
run_endpoint "particulares/scrape-fotocasa" "$API_URL/api/cron/particulares/scrape-fotocasa"

# 3) pisos.com — fuente alternativa que expone el teléfono directo en el HTML
#    (sin DataDome). Mucho más fiable para conseguir teléfonos de particulares.
run_endpoint "particulares/scrape-pisos" "$API_URL/api/cron/particulares/scrape-pisos"

# 4) cross-match — copia los teléfonos recién scrapeados de Fotocasa y pisos.com
#    a los anuncios de Idealista SIN teléfono que son (con alta confianza) la
#    misma propiedad física (mismo precio/zona/dirección). DEBE ir EL ÚLTIMO:
#    primero se pueblan los teléfonos de las otras fuentes, luego se cruzan.
#    No toca DataDome — es la vía que rellena teléfonos de forma fiable
#    mientras el pool residencial esté baneado (t=bv).
run_endpoint "particulares/cross-match-phones" "$API_URL/api/cron/particulares/cross-match-phones"
