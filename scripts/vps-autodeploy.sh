#!/usr/bin/env bash
# AUTO-DEPLOY del VPS por polling (copia de referencia).
#
# La copia OPERATIVA vive en el VPS en /opt/vps-autodeploy.sh (FUERA del repo,
# para que `git reset --hard` no la sobrescriba mientras se ejecuta). Un cron de
# root la lanza cada 5 minutos:
#     */5 * * * * /opt/vps-autodeploy.sh
#
# Qué hace: si main tiene commits nuevos, sincroniza y reconstruye. Usa una
# clave SSH dedicada de solo-lectura (/root/.ssh/github_pull, cuya pública está
# en la cuenta de GitHub con acceso al repo). Lock con flock para no solaparse.
# El build es ATÓMICO (compila a `.next.new` y hace swap solo si tiene éxito),
# así un build fallido no corrompe el `.next` en producción: la app sigue de
# verdad con la build anterior. Log en /var/log/smartbc-autodeploy.log.
#
# Si editas este script, recuerda copiarlo también a /opt/vps-autodeploy.sh.
set -uo pipefail
APP=/opt/smartbc-app
LOG=/var/log/smartbc-autodeploy.log
export GIT_SSH_COMMAND="ssh -i /root/.ssh/github_pull -o StrictHostKeyChecking=no"

exec 9>/tmp/smartbc-autodeploy.lock
flock -n 9 || { echo "$(date -Is) [skip] deploy en curso" >> "$LOG"; exit 0; }

cd "$APP" || exit 1
git fetch origin main --quiet 2>>"$LOG" || { echo "$(date -Is) [warn] fetch fallo (clave en GitHub?)" >> "$LOG"; exit 0; }
REMOTE=$(git rev-parse origin/main)
LOCAL=$(git rev-parse HEAD 2>/dev/null || echo none)
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "$(date -Is) [deploy] $LOCAL -> $REMOTE" >> "$LOG"
git reset --hard origin/main >>"$LOG" 2>&1
npm install >>"$LOG" 2>&1

# Build ATÓMICO. Antes se compilaba EN SITIO sobre `.next`: si el build moría a
# medias (OOM en el VPS), dejaba `.next` corrupto (HTML pidiendo chunks que ya
# no existían) y, como no se reiniciaba, el proceso VIEJO seguía sirviendo ese
# `.next` roto -> 400 en .css/.js y "client-side exception" en producción, sin
# auto-curarse (el cron no reintenta porque HEAD ya == origin/main).
#
# Ahora compilamos a `.next.new` (vía NEXT_BUILD_DIR, ver next.config.ts) sin
# tocar el `.next` que se está sirviendo. Solo si el build tiene ÉXITO hacemos
# el swap con `mv` (rename atómico, mismo filesystem) y reiniciamos. Si falla,
# `.next` queda INTACTO y la app sigue de verdad con la build anterior.
#
# Heap de 4GB: el build creció (mapas, gráficos, chat) y se quedaba sin memoria
# (OOM/SIGABRT). El VPS tiene 7.6GB RAM + swap, así que 4GB de heap entra bien.
rm -rf .next.new >>"$LOG" 2>&1

# Tipos generados RANCIOS del build anterior: Next mete `.next/types/**/*.ts` en
# el `include` de tsconfig, así que el typecheck valida también los .d.ts del
# build viejo. Si un commit BORRA una ruta de API, su fichero de tipos sigue
# apuntando a un módulo inexistente y el build falla entero ("Cannot find
# module '.../route.js'") — el deploy se queda atascado sin causa aparente.
# Solo se usan al compilar, así que borrarlos no afecta al proceso en marcha.
rm -rf .next/types >>"$LOG" 2>&1

if NODE_OPTIONS="--max-old-space-size=4096" NEXT_BUILD_DIR=.next.new npm run build >>"$LOG" 2>&1; then
  # Swap atómico: mueve el `.next` viejo a un lado, pon el nuevo en su sitio y
  # reinicia. Si el reinicio arranca bien, borra el viejo.
  rm -rf .next.old >>"$LOG" 2>&1
  mv .next .next.old >>"$LOG" 2>&1 || true
  mv .next.new .next >>"$LOG" 2>&1
  pm2 restart smartbc-portal >>"$LOG" 2>&1
  rm -rf .next.old >>"$LOG" 2>&1
  if bash scripts/apply-migrations.sh >>"$LOG" 2>&1; then
    echo "$(date -Is) [ok] deploy completado" >> "$LOG"
  else
    echo "$(date -Is) [warn] app desplegada pero MIGRACIONES fallaron — revisar" >> "$LOG"
  fi
else
  rm -rf .next.new >>"$LOG" 2>&1
  echo "$(date -Is) [error] build fallo; .next INTACTO, la app sigue con la build anterior" >> "$LOG"
fi
