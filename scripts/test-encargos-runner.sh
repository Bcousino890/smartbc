#!/usr/bin/env bash
# Prueba el plan, el runner (pasada periódica y pase inicial), la ruta de cron y el script de
# baseline contra un Postgres REAL desechable (nunca `supabase-db`, salvo el volcado de esquema).
#   bash scripts/test-encargos-runner.sh   (npm run test:encargos-runner)
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH=/opt/node22-standalone/bin:$PATH
RUN=(node --experimental-strip-types --import ./scripts/node-ts-loader.mjs --import ./scripts/shims/test-loader-encargos-sources.mjs)
"${RUN[@]}" scripts/test-encargos-plan.mts || exit 1
NAME=encargos-pg-test-t7
source scripts/lib-encargos-testdb.sh
trap 'encargos_testdb_down "$NAME"' EXIT
encargos_testdb_up "$NAME" 54995 || exit 1
for m in 0243_encargos_multiples 0244_make_encargo_primary 0245_encargo_notify_atomic; do
  docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "supabase/migrations/$m.sql" >/dev/null 2>&1 || { echo "FAIL: migración $m"; exit 1; }
done
# Sin FK de crm_notifications a auth.users (como la de profiles en el helper): los usuarios de prueba no existen en auth.
docker exec -i "$NAME" psql -U postgres -d postgres -qtA -c "ALTER TABLE crm_notifications DROP CONSTRAINT IF EXISTS crm_notifications_user_id_fkey" >/dev/null 2>&1
ENCARGOS_PG_CONTAINER="$NAME" CRON_SECRET="test-cron-secret-0123456789" "${RUN[@]}" scripts/test-encargos-runner.mts
