#!/bin/sh
# ============================================================================
# SOLO MEDICIÓN LOCAL (BCP-01 ampliación X6). Mide la instantánea y la
# consulta del vigilante ANTES (0192–0194, «base») y DESPUÉS (0195,
# «propuesta») en el MISMO Postgres temporal, con 2.000, 10.000 y 40.000
# propiedades sintéticas (~8 fotos cada una).
#   BCP_PG_DIR=<scratchpad>/pg-bcp01 scripts/sql/perf-catalogs.sh <prefijo-salida>
# No crea índices nuevos en properties. Las cifras son de este equipo y de
# datos sintéticos: no demuestran el rendimiento ni D13 en vivo.
# ============================================================================
set -eu
cd "$(dirname "$0")/../.."
R=scripts/sql/run-local.sh
S=scripts/sql
OUT=${1:?prefijo de salida}
MIG="supabase/migrations/0192_catalogs_core.sql supabase/migrations/0193_catalog_public.sql supabase/migrations/0194_catalog_contact.sql"
: > "$OUT.tsv"
for N in ${PERF_SIZES:-2000 10000 40000}; do
  echo "== $N propiedades"
  sh $R reset
  sh $R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $MIG
  sh $R sqlv n=$N phase=base gen=1 -- $S/perf-catalogs.sql
  sh $R sql supabase/migrations/0195_catalog_selection.sql
  sh $R sqlv n=$N phase=propuesta auto=1 "plan=$OUT-plan-$N.txt" -- $S/perf-catalogs.sql
  printf '%s\n' "\\pset format unaligned" "\\pset fieldsep '\\t'" "\\pset tuples_only on" \
    "SELECT n, phase, label, reps, p50_ms, p95_ms, max_ms, coalesce(size_bytes::text,''), coalesce(items::text,''), coalesce(total::text,'') FROM perf.results ORDER BY phase, label;" \
    > "$OUT.q.sql"
  sh $R sql "$OUT.q.sql" >> "$OUT.tsv"
  rm -f "$OUT.q.sql"
done
echo "resultados: $OUT.tsv"
