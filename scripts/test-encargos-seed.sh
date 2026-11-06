#!/usr/bin/env bash
# Prueba el script de los encargos de Yeanette contra un Postgres REAL desechable (nunca `supabase-db`,
# salvo el volcado de esquema en solo lectura).   bash scripts/test-encargos-seed.sh   (npm run test:encargos-seed)
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH=/opt/node22-standalone/bin:$PATH
RUN=(node --experimental-strip-types --import ./scripts/node-ts-loader.mjs --import ./scripts/shims/test-loader-encargos-sources.mjs)
NAME=encargos-pg-test-t10
source scripts/lib-encargos-testdb.sh
trap 'encargos_testdb_down "$NAME"' EXIT
encargos_testdb_up "$NAME" 54990 || exit 1
for m in 0243_encargos_multiples 0244_make_encargo_primary 0245_encargo_notify_atomic 0246_encargos_rls_y_consentimiento; do
  docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "supabase/migrations/$m.sql" >/dev/null 2>&1 || { echo "FAIL: migración $m"; exit 1; }
done
docker exec -i "$NAME" psql -U postgres -d postgres -qtA -c "ALTER TABLE crm_notifications DROP CONSTRAINT IF EXISTS crm_notifications_user_id_fkey" >/dev/null 2>&1
ENCARGOS_PG_CONTAINER="$NAME" "${RUN[@]}" scripts/test-encargos-seed.mts
