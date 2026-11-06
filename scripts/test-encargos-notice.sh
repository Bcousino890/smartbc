#!/usr/bin/env bash
# Parte pura (aviso y selección) + resolveRecipients contra un Postgres DESECHABLE
# (nunca `supabase-db`, salvo el volcado de esquema en solo lectura).
#   bash scripts/test-encargos-notice.sh
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH=/opt/node22-standalone/bin:$PATH
RUN=(node --experimental-strip-types --import ./scripts/node-ts-loader.mjs --import ./scripts/shims/test-loader-encargos-sources.mjs)
"${RUN[@]}" scripts/test-encargos-notice.mts || exit 1
NAME=encargos-pg-test-t6
source scripts/lib-encargos-testdb.sh
trap 'encargos_testdb_down "$NAME"' EXIT
encargos_testdb_up "$NAME" 54996 || exit 1
ENCARGOS_PG_CONTAINER="$NAME" "${RUN[@]}" scripts/test-encargos-recipients-db.mts
