#!/usr/bin/env bash
# Prueba los cargadores de lib/encargos/sources.ts contra un Postgres REAL desechable
# (nunca `supabase-db`, salvo el volcado de esquema en solo lectura), después de la parte pura.
#   bash scripts/test-encargos-sources.sh
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH=/opt/node22-standalone/bin:$PATH
RUN=(node --experimental-strip-types --import ./scripts/node-ts-loader.mjs --import ./scripts/shims/test-loader-encargos-sources.mjs)
"${RUN[@]}" scripts/test-encargos-sources.mts || exit 1
NAME=encargos-pg-test-t5
source scripts/lib-encargos-testdb.sh
trap 'encargos_testdb_down "$NAME"' EXIT
encargos_testdb_up "$NAME" 54997 || exit 1
for m in 0243_encargos_multiples 0244_make_encargo_primary; do
  docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "supabase/migrations/$m.sql" >/dev/null 2>&1 || { echo "FAIL: migración $m"; exit 1; }
done
ENCARGOS_PG_CONTAINER="$NAME" "${RUN[@]}" scripts/test-encargos-sources-db.mts
