#!/bin/bash
# SOLO VERIFICACIÓN LOCAL (expediente 2026-10-17-bcp-01-pdf-worker, W10, W11, W13).
# Build de producción como el despliegue del VPS (scripts/vps-autodeploy.sh):
# compila en .next.new, reescribe distDir en required-server-files.json y
# renombra a .next; después MUEVE la app entera a otra ruta absoluta, arranca
# `next start` contra el simulador local de PostgREST (scripts/sim/) y
# descarga los PDF por la ruta pública del enlace. Comprueba:
#   · que cada PDF lo maquetó el HILO (log «pdf hilo») y ninguno el respaldo;
#   · que no quedan archivos nuevos en el TMPDIR del servidor ni en el proyecto;
#   · y deja los PDF para scripts/pdf/check-sim-pdfs.mts.
# Sin .env*, con variables ficticias y sin red real (Supabase = el simulador).
#
#   bash scripts/pdf/worker-build-gate.sh <carpeta-trabajo> <catalog-sim.json> <carpeta-img> <token>…
set -u
REPO=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$1; SIM=$2; IMG=$3; shift 3; TOKENS=$*
NODE=${NODE:-node}
OUT=$WORK/out; APP=$WORK/app; MOVED=$WORK/otra-ruta/app; HOMEW=$WORK/home; TMPW=$WORK/tmp
ENVV="PATH=$(dirname "$(command -v $NODE)"):/usr/bin:/bin HOME=$HOMEW TMPDIR=$TMPW NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture-anon-key SUPABASE_SERVICE_ROLE_KEY=fixture-service-key"
free() { for p in 3152 54399; do for pid in $(lsof -tiTCP:$p -sTCP:LISTEN); do kill $pid; done; done; sleep 1; }
fail=0; check() { if [ "$2" = 1 ]; then echo "  ✅ $1"; else echo "  ❌ $1 ${3:-}"; fail=$((fail + 1)); fi; }

free; rm -rf "$OUT" "$WORK/otra-ruta"; mkdir -p "$OUT" "$APP" "$HOMEW" "$TMPW"
rsync -a --delete --exclude '.git' --exclude '/node_modules' --exclude '/.next' --exclude '/.next.new' --exclude '.env*' "$REPO/" "$APP/"
[ -d "$APP/node_modules" ] || cp -cR "$REPO/node_modules" "$APP/node_modules"
n=$(find "$APP" -name '.env*' -not -path '*/node_modules/*' | wc -l | tr -d ' ')
check "copia sin archivos .env* ($n)" "$([ "$n" = 0 ] && echo 1)"

cd "$APP" && rm -rf .next .next.new
for try in 1 2 3; do env -i $ENVV NODE_ENV=production NEXT_BUILD_DIR=.next.new ./node_modules/.bin/next build > "$OUT/build.log" 2>&1 && break; sleep 5; done
check "next build en .next.new" "$([ -f .next.new/BUILD_ID ] && echo 1)"
python3 - "$APP/.next.new/required-server-files.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); d["config"]["distDir"] = ".next"; json.dump(d, open(p, "w"))
PY
mv .next.new .next
mkdir -p "$(dirname "$MOVED")"; mv "$APP" "$MOVED"; cd "$MOVED"
echo "  · app movida a $MOVED"

( env -i PATH=/usr/bin:/bin:$(dirname "$(command -v $NODE)") $NODE --experimental-strip-types scripts/sim/postgrest-sim.mts 54399 "$SIM" "$OUT/sim.jsonl" "$IMG" > "$OUT/sim.out" 2>&1 & )
( env -i $ENVV NODE_ENV=production PORT=3152 ./node_modules/.bin/next start -p 3152 > "$OUT/start.log" 2>&1 & )
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:3152/api/seleccion/x/estado && break; sleep 1; done

snap() { (find "$TMPW" -type f 2>/dev/null; find "$MOVED" -type f -not -path '*/node_modules/*' -not -path '*/.next/*' 2>/dev/null) | sort; }
snap > "$OUT/files-before.txt"
for t in $TOKENS; do
  code=$(curl -s -o "$OUT/$t.pdf" -w "%{http_code}" "http://127.0.0.1:3152/api/seleccion/$t/pdf")
  check "$t → 200 PDF" "$([ "$code" = 200 ] && [ "$(head -c4 "$OUT/$t.pdf")" = "%PDF" ] && echo 1)" "$code"
done
sleep 1; snap > "$OUT/files-after.txt"
check "ningún archivo nuevo en el TMPDIR del servidor ni en el proyecto (W11)" "$(cmp -s "$OUT/files-before.txt" "$OUT/files-after.txt" && echo 1)" "$(diff "$OUT/files-before.txt" "$OUT/files-after.txt" | head -3)"
nw=$(grep -c '\[catalogos\] pdf hilo:' "$OUT/start.log"); nf=$(grep -c 'pdf hilo no disponible' "$OUT/start.log")
check "cada PDF lo maquetó el hilo ($nw de $(echo $TOKENS | wc -w | tr -d ' ')) y ninguno el respaldo ($nf)" "$([ "$nw" = "$(echo $TOKENS | wc -w | tr -d ' ')" ] && [ "$nf" = 0 ] && echo 1)"
free
cd /; rm -rf "$APP"; mv "$MOVED" "$APP"
echo "PDF en $OUT"; [ $fail = 0 ] && echo "✅ Todo en verde" || echo "❌ $fail fallo(s)"
exit $fail
