#!/usr/bin/env bash
# Captaciones con el encargo elegido (Task 11): primero la parte pura y después la de base de datos contra un
# Postgres REAL desechable (nunca `supabase-db`, salvo el volcado de esquema en solo lectura).
#   bash scripts/test-encargos-captaciones.sh   (npm run test:encargos-captaciones)
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH=/opt/node22-standalone/bin:$PATH
node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-encargos-captaciones.mts || exit 1
NAME=encargos-pg-test-t11
source scripts/lib-encargos-testdb.sh
trap 'encargos_testdb_down "$NAME"' EXIT
encargos_testdb_up "$NAME" 54989 || exit 1
for m in 0243_encargos_multiples 0244_make_encargo_primary; do
  docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "supabase/migrations/$m.sql" >/dev/null 2>&1 || { echo "FAIL: migración $m"; exit 1; }
done
ENCARGOS_PG_CONTAINER="$NAME" node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
  --import ./scripts/shims/test-loader-encargos-captaciones.mjs scripts/test-encargos-captaciones-db.mts
