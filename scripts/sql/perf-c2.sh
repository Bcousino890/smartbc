#!/bin/sh
# ============================================================================
# SOLO MEDICIÓN LOCAL (BCP-01 ampliación C2, Z7). Mide la instantánea y la
# consulta del vigilante en el MISMO Postgres temporal y los mismos datos:
#   · C1         — 0192–0196 con los ajustes y portadas de perf-c1-adjust.sql
#                  (lo que hay en producción tras C1);
#   · C2         — + 0197, sin textos ni historias (coste del código nuevo);
#   · C2+textos  — + texto del catálogo de ≈5.900 caracteres publicado en
#                  TODAS las viviendas de los 40 catálogos e historia aprobada
#                  (7 capítulos) en 1 de cada 3 propiedades (peor caso).
# Tamaños por defecto 1.000 (~840 candidatas, cerca de las 818 de producción),
# 2.000 y 10.000 propiedades sintéticas (~8 fotos cada una).
#   BCP_PG_DIR=<scratchpad>/pg-bcp01 scripts/sql/perf-c2.sh <prefijo-salida>
# Sin índices nuevos. Cifras de este equipo y datos sintéticos: no demuestran
# el rendimiento ni D13 en vivo.
# ============================================================================
set -eu
cd "$(dirname "$0")/../.."
R=scripts/sql/run-local.sh
S=scripts/sql
OUT=${1:?prefijo de salida}
MIG="supabase/migrations/0192_catalogs_core.sql supabase/migrations/0193_catalog_public.sql supabase/migrations/0194_catalog_contact.sql"
: > "$OUT.tsv"
for N in ${PERF_SIZES:-1000 2000 10000}; do
  echo "== $N propiedades"
  sh $R reset
  sh $R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $MIG
  sh $R sqlv n=$N phase=gen gen=1 -- $S/perf-catalogs.sql
  sh $R sql supabase/migrations/0195_catalog_selection.sql supabase/migrations/0196_catalog_adjustments.sql
  # Crea los 20 catálogos automáticos (y mide C1 sin ajustes, como referencia).
  sh $R sqlv n=$N phase=C1-sin-ajustes auto=1 "plan=$OUT-plan-C1base-$N.txt" -- $S/perf-catalogs.sql
  sh $R sql $S/perf-c1-adjust.sql
  sh $R sqlv n=$N phase=C1 auto=1 "plan=$OUT-plan-C1-$N.txt" -- $S/perf-catalogs.sql
  sh $R sql supabase/migrations/0197_catalog_texts.sql
  sh $R sqlv n=$N phase=C2 auto=1 "plan=$OUT-plan-C2-$N.txt" -- $S/perf-catalogs.sql
  sh $R sql $S/perf-c2-texts.sql
  sh $R sqlv n=$N phase=C2+textos auto=1 "plan=$OUT-plan-C2tx-$N.txt" -- $S/perf-catalogs.sql
  printf '%s\n' "\\pset format unaligned" "\\pset fieldsep '\\t'" "\\pset tuples_only on" \
    "SELECT n, phase, label, reps, p50_ms, p95_ms, max_ms, coalesce(size_bytes::text,''), coalesce(items::text,''), coalesce(total::text,'') FROM perf.results WHERE phase <> 'gen' ORDER BY label, phase;" \
    > "$OUT.q.sql"
  sh $R sql "$OUT.q.sql" >> "$OUT.tsv"
  rm -f "$OUT.q.sql"
done
echo "resultados: $OUT.tsv"
