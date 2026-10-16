#!/bin/sh
# ============================================================================
# SOLO MEDICIÓN LOCAL (BCP-01 E3, corrección 4 de D-QA19). Compara con la base
# ACTUAL de main en las MISMAS condiciones (mismo Postgres temporal, mismos
# datos sintéticos, mismo script de medición):
#   · main         — 0192–0197 con los ajustes y portadas de C1 y los textos
#                    e historias de C2 (lo que hay en main antes de E3);
#   · E3           — + 0202, sin ajustes de fotos (coste del código nuevo:
#                    clave opaca de cada foto en la instantánea);
#   · E3+ajustes   — + 0202 con una foto excluida y una apertura elegida en
#                    TODAS las viviendas efectivas de los 40 catálogos (peor caso).
#   BCP_PG_DIR=<scratchpad>/pg-bcp01 scripts/sql/perf-e3.sh <prefijo-salida>
# Sin índices nuevos en properties. Cifras de este equipo y datos sintéticos:
# no demuestran el rendimiento en producción ni D13 en vivo.
# ============================================================================
set -eu
cd "$(dirname "$0")/../.."
R=scripts/sql/run-local.sh
S=scripts/sql
M=supabase/migrations
OUT=${1:?prefijo de salida}
: > "$OUT.tsv"
for N in ${PERF_SIZES:-1000 2000}; do
  echo "== $N propiedades"
  sh $R reset
  sh $R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M/0192_catalogs_core.sql $M/0193_catalog_public.sql $M/0194_catalog_contact.sql
  sh $R sqlv n=$N phase=gen gen=1 -- $S/perf-catalogs.sql
  sh $R sql $M/0195_catalog_selection.sql $M/0196_catalog_adjustments.sql
  sh $R sqlv n=$N phase=gen2 auto=1 -- $S/perf-catalogs.sql
  sh $R sql $S/perf-c1-adjust.sql $M/0197_catalog_texts.sql $S/perf-c2-texts.sql
  sh $R sqlv n=$N phase=main auto=1 "plan=$OUT-plan-main-$N.txt" -- $S/perf-catalogs.sql
  sh $R sql $M/0202_catalog_photo_prefs.sql
  sh $R sqlv n=$N phase=E3 auto=1 "plan=$OUT-plan-E3-$N.txt" -- $S/perf-catalogs.sql
  sh $R sql $S/perf-e3-prefs.sql
  sh $R sqlv n=$N phase=E3+ajustes auto=1 "plan=$OUT-plan-E3aj-$N.txt" -- $S/perf-catalogs.sql
  printf '%s\n' "\\pset format unaligned" "\\pset fieldsep '\\t'" "\\pset tuples_only on" \
    "SELECT n, phase, label, reps, p50_ms, p95_ms, max_ms, coalesce(size_bytes::text,''), coalesce(items::text,''), coalesce(total::text,'') FROM perf.results WHERE phase IN ('main', 'E3', 'E3+ajustes') ORDER BY label, phase;" \
    > "$OUT.q.sql"
  sh $R sql "$OUT.q.sql" >> "$OUT.tsv"
  rm -f "$OUT.q.sql"
done
echo "resultados: $OUT.tsv"
