#!/usr/bin/env bash
# Rebuild ATÓMICO + reinicio de la app. Recuperación de producción SIN SSH.
#
# Para qué: cuando el `.next` que sirve PM2 queda inconsistente (el HTML pide un
# .css/.js que ya no está en disco), toda la web sale sin estilos y no se cura
# sola — el auto-deploy no reintenta si HEAD ya es igual a origin/main. Este
# script fuerza una reconstrucción completa y reinicia el proceso.
#
# Lo dispara el botón de /admin/configuracion (vía scripts/post-deploy.sh), o se
# puede lanzar a mano por SSH:  bash scripts/rebuild-restart.sh
#
# ATÓMICO: compila a `.next.new` (NEXT_BUILD_DIR, ver next.config.ts) sin tocar
# el `.next` que se está sirviendo, y solo hace el swap si el build tiene ÉXITO.
# Si falla, producción se queda exactamente como estaba.
set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${REBUILD_LOG:-/tmp/smartbc-rebuild.log}"
cd "$APP_DIR" || exit 1

# Un solo rebuild a la vez: el botón se puede pulsar dos veces sin romper nada.
exec 9>/tmp/smartbc-rebuild.lock
flock -n 9 || {
  echo "$(date -Is) [skip] ya hay un rebuild en curso" >>"$LOG"
  exit 0
}

COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
echo "=== $(date -Is) rebuild iniciado — $APP_DIR @ $COMMIT ===" >>"$LOG"

rm -rf .next.new >>"$LOG" 2>&1

# Tipos generados RANCIOS del build anterior. Next añade `.next/types/**/*.ts`
# al `include` de tsconfig, así que el typecheck del build nuevo también valida
# los .d.ts que dejó el build viejo. Si un commit BORRA una ruta de API, su
# fichero de tipos sigue en `.next/types` apuntando a un módulo que ya no
# existe y el build entero falla con "Cannot find module '.../route.js'".
# Como el build atómico solo hace swap si tiene éxito, producción se queda
# clavada en la versión anterior sin motivo aparente. Estos .d.ts solo se usan
# al compilar (el servidor en marcha no los lee), así que borrarlos es seguro.
rm -rf .next/types >>"$LOG" 2>&1

if NODE_OPTIONS="--max-old-space-size=4096" NEXT_BUILD_DIR=.next.new npm run build >>"$LOG" 2>&1; then
  rm -rf .next.old >>"$LOG" 2>&1
  mv .next .next.old >>"$LOG" 2>&1 || true
  mv .next.new .next >>"$LOG" 2>&1
  echo "$(date -Is) [ok] build correcto — reiniciando PM2" >>"$LOG"
  # El nombre del proceso varía según cómo se dio de alta en el VPS
  # (smartbc-portal en el auto-deploy, smartbc-main en ecosystem.config.js).
  pm2 restart smartbc-portal >>"$LOG" 2>&1 ||
    pm2 restart smartbc-main >>"$LOG" 2>&1 ||
    pm2 restart all >>"$LOG" 2>&1
  rm -rf .next.old >>"$LOG" 2>&1
  echo "$(date -Is) [ok] rebuild completado" >>"$LOG"
else
  rm -rf .next.new >>"$LOG" 2>&1
  echo "$(date -Is) [error] build FALLÓ — .next intacto, la app sigue como estaba" >>"$LOG"
  exit 1
fi
