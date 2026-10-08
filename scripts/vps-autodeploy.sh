#!/usr/bin/env bash
# AUTO-DEPLOY del VPS + SINCRONIZACIÓN EN LOS DOS SENTIDOS con GitHub.
#
# La copia OPERATIVA vive en el VPS en /opt/vps-autodeploy.sh (FUERA del repo).
# Un cron de root la lanza cada minuto:
#     */1 * * * * /opt/vps-autodeploy.sh
#
# ⚠️ Si editas este fichero, cópialo también a /opt/vps-autodeploy.sh, y hazlo
# con `cp` a un temporal + `mv` (bash lee el script MIENTRAS lo ejecuta: si se
# sobrescribe en caliente, una ejecución en curso puede hacer cualquier cosa):
#     cp scripts/vps-autodeploy.sh /opt/vps-autodeploy.sh.new && \
#       mv /opt/vps-autodeploy.sh.new /opt/vps-autodeploy.sh
#
# ── Dos sitios para cambiar el código, y ninguno pisa al otro ───────────────
#
# Hasta 2026-10-07 este script hacía `git reset --hard origin/main`: cualquier
# cambio hecho directamente en /opt/smartbc-app desaparecía en silencio en
# cuanto se fusionaba algo en GitHub. Ahora se puede trabajar en paralelo:
#
#   · En GitHub (PRs, merges a main), como siempre.
#   · Directamente en el VPS, en /opt/smartbc-app.
#
# Cada minuto:
#   1. Cambios del VPS sin commitear → si llevan QUIET_SECS (5 min) sin
#      tocarse, se commitean solos ("vps: …"). Si alguien sigue editando, se
#      espera. Un `git commit` hecho a mano se sube al momento.
#   2. fetch de GitHub y se juntan las dos historias:
#        - solo GitHub tiene novedades → fast-forward.
#        - solo el VPS → nada que juntar.
#        - los dos → rebase de lo del VPS encima de lo de GitHub (si el rebase
#          no puede, se prueba un merge).
#        - CONFLICTO de verdad (los dos cambiaron las mismas líneas) → se
#          aborta y NO se toca nada: lo del VPS se sube a GitHub en una rama
#          `vps/conflicto-AAAAMMDD-HHMM` como copia de seguridad, producción
#          sigue con lo del VPS, y se avisa en el log. Lo resuelve una persona.
#   3. push a main de lo que tenga el VPS y GitHub no.
#   4. Si el commit actual no es el que está en producción → build +
#      migraciones + swap + health check (ver abajo).
#
# Ningún paso descarta trabajo: si git no puede juntar algo de forma limpia,
# el script se para y avisa en vez de elegir un ganador.
#
# Pausa manual: `touch /opt/smartbc-deploy/PAUSA` congela todo (no commitea,
# no trae de GitHub, no despliega) hasta que se borre el fichero. Útil para un
# cambio largo en el VPS que no debe salir a medias.
#
# Estado (fuera del repo, en /opt/smartbc-deploy):
#   desplegado   commit que está sirviendo producción ahora mismo.
#   fallido      último commit cuyo deploy falló: no se reintenta en bucle.
#                Para reintentar el mismo commit, borrar este fichero.
#   conflicto    par VPS/GitHub del conflicto ya avisado (no se repite el aviso).
#   lock.md5     package-lock.json con el que se instaló node_modules.
#   PAUSA        si existe, no se hace nada.
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
#   4. health     → si la app no responde, se DESHACE volviendo a `.next.prev`.
#
# `.next.prev` se conserva hasta el siguiente despliegue, así que la versión
# anterior siempre está a un `mv` de distancia.
#
# ⚠️ El paso que no es obvio: Next graba el distDir DENTRO del build
# (`required-server-files.json`). Un build hecho en `.next.new` y movido a
# `.next` arranca con "Could not find a production build in the '.next'
# directory" — comprobado. Por eso se reescribe ese campo antes del swap. Sin
# esa línea, este script tumba producción en el primer despliegue.
set -uo pipefail
APP=${SMARTBC_APP:-/opt/smartbc-app}
STATE=${SMARTBC_STATE:-/opt/smartbc-deploy}
LOG=${SMARTBC_LOG:-/var/log/smartbc-autodeploy.log}
LOCK=${SMARTBC_LOCK:-/tmp/smartbc-autodeploy.lock}
QUIET_SECS=${SMARTBC_QUIET_SECS:-300}
# Solo para probar la parte de git en una copia: no compila ni toca PM2.
SKIP_BUILD=${SMARTBC_SKIP_BUILD:-0}
MAX_FILE_BYTES=$((5 * 1024 * 1024))
BRANCH=main
PM2_APP=smartbc-portal
HEALTH_URL=http://localhost:3000/
export GIT_SSH_COMMAND=${GIT_SSH_COMMAND:-"ssh -i /root/.ssh/github-key -o IdentitiesOnly=yes -o StrictHostKeyChecking=no"}
export GIT_EDITOR=true GIT_TERMINAL_PROMPT=0

log() {
  echo "$(date -Is) $*" >> "$LOG"
  rm -f "$STATE/ultimo-aviso"
}

# Para estados que se repiten cada minuto (pausa, espera, push rechazado…):
# solo se escribe en el log la primera vez, hasta que pase otra cosa.
note() {
  [ "$(cat "$STATE/ultimo-aviso" 2>/dev/null)" = "$*" ] && return 0
  log "$*"
  echo "$*" > "$STATE/ultimo-aviso"
}

exec 9>"$LOCK"
flock -n 9 || { log "[skip] deploy en curso"; exit 0; }

mkdir -p "$STATE"
cd "$APP" || exit 1

if [ -e "$STATE/PAUSA" ]; then
  note "[pausa] existe $STATE/PAUSA: no se sincroniza ni se despliega nada"
  exit 0
fi

git_busy() {
  local p
  for p in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD; do
    [ -e "$(git rev-parse --git-path "$p")" ] && return 0
  done
  return 1
}
if git_busy; then
  note "[pausa] hay un rebase/merge a medias en $APP: se espera a que alguien lo termine"
  exit 0
fi
current=$(git symbolic-ref --short -q HEAD || echo "(detached)")
if [ "$current" != "$BRANCH" ]; then
  note "[pausa] $APP está en '$current', no en $BRANCH: no se toca nada"
  exit 0
fi

dirty() { [ -n "$(git status --porcelain -uall)" ]; }

# Fecha de modificación más reciente entre los ficheros cambiados (0 si solo
# hay borrados).
newest_change() {
  local newest=0 entry path m
  while IFS= read -r -d '' entry; do
    path=${entry:3}
    case "${entry:0:2}" in R* | C*) IFS= read -r -d '' _ || true ;; esac
    [ -e "$path" ] || [ -L "$path" ] || continue
    m=$(stat -c %Y -- "$path" 2>/dev/null || echo 0)
    [ "$m" -gt "$newest" ] && newest=$m
  done < <(git status --porcelain=v1 -z -uall)
  echo "$newest"
}

# ── 1. Cambios hechos en el VPS → commit ─────────────────────────────────────
if dirty; then
  age=$(($(date +%s) - $(newest_change)))
  if [ "$age" -lt "$QUIET_SECS" ]; then
    note "[espera] hay cambios en el VPS editándose; se commitean cuando lleven $((QUIET_SECS / 60)) min sin tocarse"
    exit 0
  fi
  git add -A
  big=$(git diff --cached --name-only -z --diff-filter=AM |
    xargs -0 -r stat -c '%s %n' -- |
    awk -v max="$MAX_FILE_BYTES" '$1 > max { sub(/^[0-9]+ /, ""); print }')
  if [ -n "$big" ]; then
    # `git reset` SIN --hard: solo saca los ficheros del índice, no los toca.
    git reset -q
    note "[pausa] cambios del VPS con ficheros de más de 5 MB (¿datos que deberían estar en .gitignore?): $(echo $big)"
    exit 0
  fi
  files=$(git diff --cached --name-status | head -50)
  if git commit -q -m "vps: cambios hechos directamente en el VPS" \
    -m "Commit automático de vps-autodeploy.sh: estos ficheros se editaron en $APP y llevaban $((QUIET_SECS / 60)) min sin tocarse.

$files" >>"$LOG" 2>&1; then
    log "[vps] commit automático $(git rev-parse --short HEAD) con los cambios hechos en el VPS"
  else
    log "[error] no se pudieron commitear los cambios del VPS"
    exit 1
  fi
fi

# ── 2. Traer GitHub y juntar ─────────────────────────────────────────────────
# Si GitHub no responde se sigue igualmente: lo que haya en el VPS se despliega
# y se sube cuando vuelva la conexión.
online=1
if ! git fetch -q origin "$BRANCH" 2>>"$LOG"; then
  log "[warn] fetch falló (¿red o clave de GitHub?); se reintenta en el próximo minuto"
  online=0
fi

in_conflict=0
if [ "$online" = 1 ]; then
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH")
  if [ "$LOCAL" = "$REMOTE" ] || git merge-base --is-ancestor "origin/$BRANCH" HEAD; then
    # Iguales, o solo el VPS tiene novedades (se suben en el paso 3).
    rm -f "$STATE/conflicto"
  elif git merge-base --is-ancestor HEAD "origin/$BRANCH"; then
    # Solo GitHub tiene novedades. --ff-only nunca pisa nada: si un fichero
    # sin commitear se interpone, git se niega y se reintenta luego.
    if git merge -q --ff-only "origin/$BRANCH" >>"$LOG" 2>&1; then
      log "[github→vps] ${LOCAL:0:7} -> ${REMOTE:0:7}"
      rm -f "$STATE/conflicto"
    else
      note "[espera] no se pudo traer GitHub (un fichero sin commitear se interpone); se reintenta"
      exit 0
    fi
  elif [ "$(cat "$STATE/conflicto" 2>/dev/null)" = "$LOCAL $REMOTE" ]; then
    # Mismo conflicto que ya se avisó: nada ha cambiado, no se reintenta.
    in_conflict=1
  elif dirty; then
    note "[espera] hay cambios sin commitear en el VPS; se junta con GitHub en cuanto se commiteen"
    exit 0
  else
    # Los dos lados tienen novedades.
    if git rebase -q "origin/$BRANCH" >>"$LOG" 2>&1; then
      log "[sync] cambios del VPS reaplicados encima de GitHub: ${LOCAL:0:7} + ${REMOTE:0:7} -> $(git rev-parse --short HEAD)"
      rm -f "$STATE/conflicto"
    else
      git_busy && git rebase --abort >>"$LOG" 2>&1
      if git merge -q --no-edit -m "vps: juntar los cambios del VPS con los de GitHub" "origin/$BRANCH" >>"$LOG" 2>&1; then
        log "[sync] merge de VPS + GitHub: ${LOCAL:0:7} + ${REMOTE:0:7} -> $(git rev-parse --short HEAD)"
        rm -f "$STATE/conflicto"
      else
        [ -e "$(git rev-parse --git-path MERGE_HEAD)" ] && git merge --abort >>"$LOG" 2>&1
        if [ "$(git rev-parse HEAD)" != "$LOCAL" ] || git_busy || dirty; then
          log "[error] tras abortar el rebase/merge el checkout no quedó como estaba: revisar a mano"
          exit 1
        fi
        in_conflict=1
        backup="vps/conflicto-$(date +%Y%m%d-%H%M)"
        if git push -q origin "HEAD:refs/heads/$backup" >>"$LOG" 2>&1; then
          echo "$LOCAL $REMOTE" > "$STATE/conflicto"
          log "[CONFLICTO] GitHub (${REMOTE:0:7}) y el VPS (${LOCAL:0:7}) cambiaron las mismas líneas. No se ha descartado nada: producción sigue con lo del VPS, lo del VPS está a salvo en GitHub en la rama $backup, y lo nuevo de GitHub sigue en main. Hay que resolverlo a mano (ver DEPLOY.md)."
        else
          log "[CONFLICTO] GitHub (${REMOTE:0:7}) y el VPS (${LOCAL:0:7}) cambiaron las mismas líneas, y no se pudo subir la rama de seguridad (se reintenta). Lo del VPS sigue en main local del VPS."
        fi
      fi
    fi
  fi
fi

# ── 3. Subir a GitHub lo que solo tiene el VPS ───────────────────────────────
if [ "$online" = 1 ] && [ "$in_conflict" = 0 ] && ! git merge-base --is-ancestor HEAD "origin/$BRANCH"; then
  if git push -q origin "HEAD:refs/heads/$BRANCH" >>"$LOG" 2>&1; then
    log "[vps→github] subido $(git rev-parse --short HEAD) a $BRANCH"
  else
    note "[warn] push a GitHub rechazado (¿alguien subió algo a la vez?); se reintenta en el próximo minuto"
  fi
fi

# ── 4. Desplegar si producción no está en este commit ───────────────────────
TARGET=$(git rev-parse HEAD)
[ "$TARGET" = "$(cat "$STATE/desplegado" 2>/dev/null)" ] && exit 0
[ "$TARGET" = "$(cat "$STATE/fallido" 2>/dev/null)" ] && exit 0

log "[deploy] $(cat "$STATE/desplegado" 2>/dev/null || echo ninguno) -> $TARGET"

fail() {
  echo "$TARGET" > "$STATE/fallido"
  log "$*"
  exit 1
}

if [ "$SKIP_BUILD" = 1 ]; then
  echo "$TARGET" > "$STATE/desplegado"
  rm -f "$STATE/fallido"
  log "[ok] (prueba, sin build) desplegado $TARGET"
  exit 0
fi

# `npm install` reescribe node_modules bajo los pies del proceso vivo, que carga
# módulos de forma perezosa por ruta. Solo se toca si las dependencias han
# cambiado de verdad desde la última instalación.
LOCK_NOW=$(md5sum package-lock.json 2>/dev/null | cut -d' ' -f1)
if [ "$LOCK_NOW" != "$(cat "$STATE/lock.md5" 2>/dev/null)" ]; then
  log "[deps] package-lock cambió: npm install"
  lock_was_clean=0
  git diff --quiet -- package-lock.json && lock_was_clean=1
  if npm install >>"$LOG" 2>&1; then
    echo "$LOCK_NOW" > "$STATE/lock.md5"
  else
    log "[warn] npm install falló; se intenta compilar igualmente"
  fi
  # Si npm ha reescrito el lock por su cuenta (otra versión de npm), se deja
  # como estaba en git: si no, el paso 1 lo commitearía y subiría solo.
  if [ "$lock_was_clean" = 1 ] && ! git diff --quiet -- package-lock.json; then
    git checkout -q -- package-lock.json
    log "[deps] npm reescribió package-lock.json por su cuenta; se deja la versión de git"
  fi
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
  fail "[error] build falló; .next INTACTO, la app sigue con la versión anterior. No se reintenta este commit (borra $STATE/fallido para forzarlo)"
fi

# Migraciones ANTES del swap: el código nuevo puede necesitar el esquema nuevo,
# y si algo va mal preferimos no cambiar de versión.
if ! bash scripts/apply-migrations.sh >>"$LOG" 2>&1; then
  rm -rf .next.new >>"$LOG" 2>&1
  fail "[error] MIGRACIONES fallaron; no se cambia de versión (sigue la anterior)"
fi

# El distDir grabado dentro del build tiene que coincidir con el sitio donde se
# va a servir. Ver la nota de arriba: sin esto, no arranca.
python3 - <<'PY' >>"$LOG" 2>&1 || fail "[error] no se pudo reescribir distDir; se aborta"
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
  case "$code" in 2* | 3*) healthy=1; break ;; esac
done

if [ "$healthy" = "1" ]; then
  echo "$TARGET" > "$STATE/desplegado"
  rm -f "$STATE/fallido"
  log "[ok] deploy completado ($TARGET) — anterior en .next.prev por si hay que volver"
else
  log "[error] la versión nueva NO responde; VOLVIENDO a la anterior"
  rm -rf .next.failed >>"$LOG" 2>&1
  mv .next .next.failed >>"$LOG" 2>&1
  if [ -d .next.prev ]; then
    mv .next.prev .next >>"$LOG" 2>&1
    pm2 restart "$PM2_APP" >>"$LOG" 2>&1
    log "[rollback] restaurada la versión anterior; el build roto queda en .next.failed"
  else
    log "[rollback] NO había versión anterior guardada — revisar a mano"
  fi
  fail "[error] deploy de $TARGET deshecho; no se reintenta este commit (borra $STATE/fallido para forzarlo)"
fi
