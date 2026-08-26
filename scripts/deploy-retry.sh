#!/usr/bin/env bash
# "Reintentar despliegue" — reinstala node_modules si hace falta y fuerza UN
# ciclo completo de build+swap+salud sobre el commit YA descargado (HEAD).
#
# Por qué existe: vps-autodeploy.sh solo intenta compilar cuando hay un commit
# NUEVO en origin/main (compara HEAD con origin/main). Pero el `git reset
# --hard` ocurre ANTES del build, así que en cuanto un build falla una vez,
# HEAD queda igualado a origin/main y los siguientes minutos de cron ya no ven
# ninguna diferencia — dejan de intentarlo. Si lo que rompió el build fue algo
# transitorio (node_modules corrupto, sin memoria un momento, sin disco un
# momento), el despliegue se queda atascado indefinidamente sin que llegue
# ningún commit nuevo que lo despierte.
#
# Este script es el "vuelve a intentarlo" para esa situación exacta: se puede
# invocar a mano por SSH, o desde el botón "Reintentar despliegue" en
# /admin/configuracion (POST /api/admin/deploy/retry). No toca git para nada:
# solo repite reinstalación + build + swap sobre lo que ya haya en disco.
#
# Vive DENTRO del repo (a diferencia de vps-autodeploy.sh) porque no necesita
# sobrevivir a un `git reset --hard` a mitad de ejecución — si este script se
# está ejecutando, el checkout ya está quieto.
set -uo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG=/var/log/smartbc-autodeploy.log
PM2_APP=smartbc-portal
HEALTH_URL=http://localhost:3000/
MIN_FREE_MB=1024

log() { echo "$(date -Is) [retry] $*" >>"$LOG"; }

exec 9>/tmp/smartbc-autodeploy.lock
flock -n 9 || { log "[skip] deploy en curso (cron u otro reintento ya tiene el lock)"; exit 1; }

cd "$APP" || exit 1

FREE_MB=$(df -Pm . | awk 'NR==2 {print $4}')
if [ "${FREE_MB:-0}" -lt "$MIN_FREE_MB" ]; then
  log "[error] solo ${FREE_MB}MB libres en disco (minimo $MIN_FREE_MB MB) - libera espacio antes de reintentar, npm install volveria a fallar a medias"
  exit 1
fi

log "[deps] reinstalando node_modules"
rm -rf node_modules >>"$LOG" 2>&1
npm install >>"$LOG" 2>&1

# Verificación explícita: si este fichero (siempre presente en un `next`
# instalado bien) no está, no tiene sentido perder minutos compilando para
# fallar con el mismo ENOENT de siempre.
if [ ! -f node_modules/next/dist/build/polyfills/polyfill-nomodule.js ]; then
  log "[error] npm install termino pero node_modules/next sigue incompleto - revisa el log de npm justo arriba (registro npm caido, disco, permisos)"
  exit 1
fi

rm -rf .next.new >>"$LOG" 2>&1
rm -rf .next/types >>"$LOG" 2>&1

if ! NODE_OPTIONS="--max-old-space-size=4096" NEXT_BUILD_DIR=.next.new npm run build >>"$LOG" 2>&1; then
  rm -rf .next.new >>"$LOG" 2>&1
  log "[error] build fallo; .next INTACTO, la app sigue con la version anterior"
  exit 1
fi

if ! bash scripts/apply-migrations.sh >>"$LOG" 2>&1; then
  rm -rf .next.new >>"$LOG" 2>&1
  log "[error] MIGRACIONES fallaron; no se cambia de version (sigue la anterior)"
  exit 1
fi

# El distDir grabado dentro del build tiene que coincidir con el sitio donde
# se va a servir (ver la nota larga en vps-autodeploy.sh) — sin esto no arranca.
python3 - <<'PY' >>"$LOG" 2>&1 || { log "[error] no se pudo reescribir distDir; se aborta"; exit 1; }
import json
p = ".next.new/required-server-files.json"
d = json.load(open(p))
d["config"]["distDir"] = ".next"
json.dump(d, open(p, "w"))
PY

rm -rf .next.prev >>"$LOG" 2>&1
if [ -d .next ]; then mv .next .next.prev >>"$LOG" 2>&1; fi
mv .next.new .next >>"$LOG" 2>&1
pm2 restart "$PM2_APP" >>"$LOG" 2>&1

healthy=0
for _ in $(seq 1 30); do
  sleep 2
  code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 10 "$HEALTH_URL" || echo 000)
  case "$code" in 2*|3*) healthy=1; break ;; esac
done

if [ "$healthy" = "1" ]; then
  log "[ok] reintento completado - anterior en .next.prev por si hay que volver"
  exit 0
else
  log "[error] la version nueva NO responde; VOLVIENDO a la anterior"
  rm -rf .next.failed >>"$LOG" 2>&1
  mv .next .next.failed >>"$LOG" 2>&1
  if [ -d .next.prev ]; then
    mv .next.prev .next >>"$LOG" 2>&1
    pm2 restart "$PM2_APP" >>"$LOG" 2>&1
    log "[rollback] restaurada la version anterior; el build roto queda en .next.failed"
  else
    log "[rollback] NO habia version anterior guardada - revisar a mano"
  fi
  exit 1
fi
