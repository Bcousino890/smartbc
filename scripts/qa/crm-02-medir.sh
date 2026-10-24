#!/usr/bin/env bash
# SOLO PRUEBAS LOCALES (CRM-02). Mide un commit con el arnés de navegación en
# una COPIA AISLADA: exportación de git sin ningún fichero .env*, compilada con
# variables ficticias y servida contra el simulador PostgREST con datos
# sintéticos. No toca el checkout ni sus ficheros de entorno.
#
#   scripts/qa/crm-02-medir.sh <commit> <etiqueta> <carpeta-salida> [pasadas] [variantes]
#
#   pasadas    (3)  por variante: cada pasada arranca un servidor nuevo y corre el
#                   arnés dos veces seguidas: «frio-N» y «caliente-N».
#   variantes  ("escritorio movil escritorio-lat40")
#                   escritorio-lat40 = escritorio con 40 ms SIMULADOS por consulta.
#
# Necesita node_modules del checkout principal (NODE_MODULES_DIR, por defecto
# el de `git worktree list` en primera posición) con la versión de `next` del
# lockfile del commit. Puertos: 3271 (app) y 54371 (simulador).
set -euo pipefail

COMMIT=${1:?commit}
LABEL=${2:?etiqueta}
OUT=${3:?carpeta-salida}
PASADAS=${4:-3}
VARIANTES=${5:-"escritorio movil escritorio-lat40"}
APP_PORT=3271
SIM_PORT=54371

REPO=$(git rev-parse --show-toplevel)
MAIN_CHECKOUT=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')
NODE_MODULES_DIR=${NODE_MODULES_DIR:-$MAIN_CHECKOUT/node_modules}
COPY="$OUT/app-$LABEL"
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
COPY="$OUT/app-$LABEL"

stop() { lsof -ti "tcp:$1" -sTCP:LISTEN | xargs kill 2>/dev/null || true; sleep 0.7; }
trap 'stop $APP_PORT; stop $SIM_PORT' EXIT

echo "· copia aislada de $COMMIT en $COPY"
rm -rf "$COPY" && mkdir -p "$COPY"
git -C "$REPO" archive "$COMMIT" | tar -x -C "$COPY" --exclude='.env*'
if find "$COPY" -maxdepth 3 -name '.env*' -not -name '.env.example' | grep -q .; then
  echo "La copia contiene ficheros .env: se aborta." >&2
  exit 1
fi
rm -f "$COPY/.env.example"
ln -s "$NODE_MODULES_DIR" "$COPY/node_modules"
want=$(node -e "const l=require('$COPY/package-lock.json');console.log(l.packages['node_modules/next'].version)")
have=$(node -p "require('$NODE_MODULES_DIR/next/package.json').version")
[ "$want" = "$have" ] || { echo "next $have en node_modules ≠ $want del lockfile" >&2; exit 1; }

ENVV=(NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$SIM_PORT NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon SUPABASE_SERVICE_ROLE_KEY=dummy-service NEXT_TELEMETRY_DISABLED=1)
echo "· build"
(cd "$COPY" && env "${ENVV[@]}" npx next build > "$OUT/build-$LABEL.log" 2>&1) || { echo "build fallido: $OUT/build-$LABEL.log" >&2; exit 1; }

echo "· datos sintéticos"
(cd "$COPY" && node --experimental-strip-types scripts/sim/fixtures/crm-01-admin.gen.mts "$OUT/fixture.json" "$OUT/img" 2>/dev/null)

start_sim() {
  stop $SIM_PORT
  (cd "$COPY" && node --experimental-strip-types scripts/sim/postgrest-sim.mts $SIM_PORT "$OUT/fixture.json" "$OUT/sim-$LABEL.jsonl" "$OUT/img" --auth "$@" > "$OUT/sim-$LABEL.out" 2>&1 &)
  sleep 1.5
}
start_app() {
  stop $APP_PORT
  (cd "$COPY" && env "${ENVV[@]}" npx next start -H 127.0.0.1 -p $APP_PORT > "$OUT/server-$LABEL.log" 2>&1 &)
  for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$APP_PORT/login" && return 0; sleep 0.5; done
  echo "el servidor no arrancó" >&2; exit 1
}
run() {
  local variant=$1 pasada=$2 vv=$1
  [ "$variant" = "escritorio-lat40" ] && vv=escritorio
  (cd "$COPY" && BASE=http://127.0.0.1:$APP_PORT SIM_LOG="$OUT/sim-$LABEL.jsonl" OUT="$OUT/$LABEL-$variant-$pasada.json" \
    LABEL="$LABEL-$variant" PASADA="$pasada" VARIANT=$vv \
    node --experimental-strip-types scripts/qa/crm-01-navegacion.mts > "$OUT/run-$LABEL-$variant-$pasada.log" 2>&1) || true
  echo "  $variant $pasada: $(grep -e 'comprobaciones' -e 'Error' "$OUT/run-$LABEL-$variant-$pasada.log" | head -1)"
}

for variant in $VARIANTES; do
  if [ "$variant" = "escritorio-lat40" ]; then start_sim --latency 40; else start_sim; fi
  for n in $(seq 1 "$PASADAS"); do
    start_app
    run "$variant" "frio-$n"
    run "$variant" "caliente-$n"
  done
done
echo "· resultados en $OUT"
