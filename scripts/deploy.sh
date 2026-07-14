#!/usr/bin/env bash
# Despliega smartbc al VPS Hetzner en UN SOLO comando.
#
#   ./scripts/deploy.sh
#
# Hace, en orden y abortando si algo falla (set -e):
#   1. rsync del código al servidor (sin pisar .env.local, node_modules, .next)
#   2. npm install + npm run build + pm2 restart en el servidor
#   3. aplica migraciones de BD pendientes (runner con tabla de control)
#
# Requisitos: acceso SSH a root@178.105.176.3 (clave ~/.ssh/id_ed25519).
#
# Antes de desplegar, asegúrate de tener el código que quieres subir en tu
# working tree local (haz `git pull` / merge de los cambios del jefe primero).
set -euo pipefail

VPS="root@178.105.176.3"
APP_DIR="/opt/smartbc-app"
PM2_APP="smartbc-portal"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▶ [1/3] Subiendo código al servidor (rsync)…"
rsync -az \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env.local' \
  --exclude 'tsconfig.tsbuildinfo' \
  "$REPO_DIR/" "$VPS:$APP_DIR/"

echo "▶ [2/3] Instalando deps, compilando (build atómico) y reiniciando…"
# Build ATÓMICO: compila a `.next.new` sin tocar el `.next` en uso; solo si el
# build tiene éxito hace el swap y reinicia. Si falla, `.next` queda intacto y
# la app sigue con la build anterior (ver next.config.ts / vps-autodeploy.sh).
ssh "$VPS" "cd $APP_DIR && npm install && rm -rf .next.new && NODE_OPTIONS='--max-old-space-size=4096' NEXT_BUILD_DIR=.next.new npm run build && rm -rf .next.old && { mv .next .next.old 2>/dev/null || true; } && mv .next.new .next && pm2 restart $PM2_APP && rm -rf .next.old"

echo "▶ [3/3] Aplicando migraciones de BD pendientes…"
ssh "$VPS" "bash $APP_DIR/scripts/apply-migrations.sh"

echo ""
echo "✅ Deploy completo."
echo "   Portal:  https://crm.bcousinoprop.com/admin/particulares"
echo "   (recarga con Cmd+Shift+R para saltar la caché del navegador)"
