#!/usr/bin/env bash
# AUTO-DEPLOY del VPS por polling (copia de referencia).
#
# La copia OPERATIVA vive en el VPS en /opt/vps-autodeploy.sh (FUERA del repo,
# para que `git reset --hard` no la sobrescriba mientras se ejecuta). Un cron de
# root la lanza cada minuto:
#     */1 * * * * /opt/vps-autodeploy.sh
#
# ⚠️ Si editas este fichero, cópialo también a /opt/vps-autodeploy.sh. Durante
# meses la copia del VPS fue una versión vieja que compilaba EN SITIO, y por eso
# cada despliegue tiraba la web un par de minutos.
#
# ── Cómo despliega, y por qué así ────────────────────────────────────────────
#
# El proceso en producción NUNCA lee un directorio que se esté reconstruyendo:
#
#   1. build      → compila a `.next.new` (NEXT_BUILD_DIR, ver next.config.ts).
#                   `.next` no se toca: la web sigue sirviendo la versión viva
#                   durante los 2-3 minutos que dura la compilación.
#   2. migrations → si fallan, NO se cambia nada: sigue viva la versión anterior.
#   3. swap       → `mv` (rename atómico, mismo filesystem) y reinicio de PM2.
#   4. health     → si la app no responde, se DESHACE volviendo a `.next.old`.
#
# `.next.old` se conserva hasta el siguiente despliegue, así que la versión
# anterior siempre está a un `mv` de distancia.
#
# ⚠️ El paso que no es obvio: Next graba el distDir DENTRO del build
# (`required-server-files.json`). Un build hecho en `.next.new` y movido a
# `.next` arranca con "Could not find a production build in the '.next'
# directory" — comprobado. Por eso se reescribe ese campo antes del swap. Sin
# esa línea, este script tumba producción en el primer despliegue.
set -uo pipefail
APP=/opt/smartbc-app
LOG=/var/log/smartbc-autodeploy.log
PM2_APP=smartbc-portal
HEALTH_URL=http://localhost:3000/
export GIT_SSH_COMMAND="ssh -i /root/.ssh/github_pull -o StrictHostKeyChecking=no"

log() { echo "$(date -Is) $*" >> "$LOG"; }

exec 9>/tmp/smartbc-autodeploy.lock
flock -n 9 || { log "[skip] deploy en curso"; exit 0; }

cd "$APP" || exit 1
git fetch origin main --quiet 2>>"$LOG" || { log "[warn] fetch fallo (clave en GitHub?)"; exit 0; }
REMOTE=$(git rev-parse origin/main)
LOCAL=$(git rev-parse HEAD 2>/dev/null || echo none)
[ "$LOCAL" = "$REMOTE" ] && exit 0

log "[deploy] $LOCAL -> $REMOTE"
LOCK_BEFORE=$(md5sum package-lock.json 2>/dev/null | cut -d' ' -f1)
git reset --hard origin/main >>"$LOG" 2>&1
LOCK_AFTER=$(md5sum package-lock.json 2>/dev/null | cut -d' ' -f1)

# `npm install` reescribe node_modules bajo los pies del proceso vivo, que carga
# módulos de forma perezosa por ruta. Solo se toca si las dependencias han
# cambiado de verdad.
if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  log "[deps] package-lock cambió: npm install"
  npm install >>"$LOG" 2>&1
fi

rm -rf .next.new >>"$LOG" 2>&1

# Tipos generados RANCIOS del build anterior: Next mete `.next/types/**/*.ts` en
# el `include` de tsconfig, así que el typecheck valida también los .d.ts del
# build viejo. Si un commit BORRA una ruta de API, su fichero de tipos sigue
# apuntando a un módulo inexistente y el build falla entero. Solo se usan al
# compilar, así que borrarlos no afecta al proceso en marcha.
rm -rf .next/types >>"$LOG" 2>&1

# Heap de 4GB: el build creció (mapas, gráficos, chat) y se quedaba sin memoria
# (OOM/SIGABRT). El VPS tiene 7.6GB RAM + swap, así que 4GB de heap entra bien.
if ! NODE_OPTIONS="--max-old-space-size=4096" NEXT_BUILD_DIR=.next.new npm run build >>"$LOG" 2>&1; then
  rm -rf .next.new >>"$LOG" 2>&1
  log "[error] build fallo; .next INTACTO, la app sigue con la version anterior"
  exit 1
fi

# Migraciones ANTES del swap: el código nuevo puede necesitar el esquema nuevo,
# y si algo va mal preferimos no cambiar de versión.
if ! bash scripts/apply-migrations.sh >>"$LOG" 2>&1; then
  rm -rf .next.new >>"$LOG" 2>&1
  log "[error] MIGRACIONES fallaron; no se cambia de version (sigue la anterior)"
  exit 1
fi

# El distDir grabado dentro del build tiene que coincidir con el sitio donde se
# va a servir. Ver la nota de arriba: sin esto, no arranca.
python3 - <<'PY' >>"$LOG" 2>&1 || { log "[error] no se pudo reescribir distDir; se aborta"; exit 1; }
import json
p = ".next.new/required-server-files.json"
d = json.load(open(p))
d["config"]["distDir"] = ".next"
json.dump(d, open(p, "w"))
PY

# ── Swap atómico ─────────────────────────────────────────────────────────────
rm -rf .next.prev >>"$LOG" 2>&1
if [ -d .next ]; then mv .next .next.prev >>"$LOG" 2>&1; fi
mv .next.new .next >>"$LOG" 2>&1
pm2 restart "$PM2_APP" >>"$LOG" 2>&1

# ── Health check ─────────────────────────────────────────────────────────────
healthy=0
for _ in $(seq 1 30); do
  sleep 2
  code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 10 "$HEALTH_URL" || echo 000)
  case "$code" in 2*|3*) healthy=1; break ;; esac
done

if [ "$healthy" = "1" ]; then
  log "[ok] deploy completado ($REMOTE) — anterior en .next.prev por si hay que volver"
else
  log "[error] la version nueva NO responde; VOLVIENDO a la anterior"
  rm -rf .next.failed >>"$LOG" 2>&1
  mv .next .next.failed >>"$LOG" 2>&1
  if [ -d .next.prev ]; then
    mv .next.prev .next >>"$LOG" 2>&1
    pm2 restart "$PM2_APP" >>"$LOG" 2>&1
    log "[rollback] restaurada la version anterior; el build roto queda en .next.failed"
  else
    log "[rollback] NO habia version anterior guardada — revisar a mano"
  fi
  exit 1
fi
