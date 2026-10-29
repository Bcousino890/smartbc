#!/bin/sh
# SOLO PRUEBAS LOCALES (Idealista API → CRM). Ejecuta las pruebas SQL en el
# Postgres temporal (scripts/sql/run-local.sh). Necesita
# BCP_PG_DIR=<scratchpad>/pg-bcp01 (y opcionalmente BCP_PG_PORT).
#   scripts/sql/test-idealista-crm-sync.sh [comportamiento|frontera|recuperacion|todo]
set -eu
cd "$(dirname "$0")/../.."
R=scripts/sql/run-local.sh
M=${CRM_MIG_DIR:-supabase/migrations}
S=scripts/sql
BASE="$S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M/0192_catalogs_core.sql $M/0193_catalog_public.sql $M/0194_catalog_contact.sql $M/0195_catalog_selection.sql $M/0196_catalog_adjustments.sql $S/stub-idealista-crm.sql"
what="${1:-todo}"

fresh() {
  $R reset
  # shellcheck disable=SC2086
  $R sql $BASE >/dev/null 2>&1
  $R sql $M/0232_idealista_reference_boundary.sql $M/0232_idealista_reference_boundary.sql \
         $M/0233_idealista_crm_sync.sql $M/0233_idealista_crm_sync.sql >/dev/null 2>&1
}

if [ "$what" = comportamiento ] || [ "$what" = todo ]; then
  echo "== comportamiento (0232 y 0233 aplicadas dos veces)"
  fresh
  $R sql $S/test-idealista-crm-sync.sql 2>&1 | grep -E "ok ·|TEST FAIL|ERROR|en verde" | sed 's/^psql:[^ ]* NOTICE:  //'
  echo "== concurrencia: dos sesiones aplican la misma ficha a la vez"
  $R sql $S/test-idealista-crm-concurrency-setup.sql >/dev/null 2>&1
  ( $R sql $S/test-idealista-crm-concurrency-run.sql >/dev/null 2>&1 & $R sql $S/test-idealista-crm-concurrency-run.sql >/dev/null 2>&1 & wait )
  $R sql $S/test-idealista-crm-concurrency-check.sql 2>&1 | grep -E "ok ·|TEST FAIL|ERROR" | sed 's/^psql:[^ ]* NOTICE:  //'
fi
if [ "$what" = frontera ] || [ "$what" = todo ]; then
  echo "== frontera de distribución"
  fresh
  $R sql $S/test-idealista-crm-boundary.sql 2>&1 | grep -E "ok ·|TEST FAIL|ERROR|en verde" | sed 's/^psql:[^ ]* NOTICE:  //'
fi
if [ "$what" = interruptor ] || [ "$what" = todo ]; then
  echo "== interruptor en el CRM (0234 aplicada dos veces)"
  fresh
  $R sql $M/0234_idealista_crm_switch.sql $M/0234_idealista_crm_switch.sql >/dev/null 2>&1
  $R sql $S/test-idealista-crm-switch.sql 2>&1 | grep -E "ok ·|TEST FAIL|ERROR|en verde" | sed 's/^psql:[^ ]* NOTICE:  //'
  echo "== reversión de 0234 (con registro: la tabla se conserva)"
  $R sql docs/changes/2026-10-29-idealista-crm-interruptor/rollback-0234.sql >/dev/null
  printf "%s\n" "DO \$\$ BEGIN PERFORM test_util.ok(to_regprocedure('public.idealista_crm_set_enabled(boolean, uuid)') IS NULL AND to_regclass('public.idealista_crm_switch_log') IS NOT NULL, 'reversión: funciones fuera, historial conservado'); END \$\$;" > "${TMPDIR:-/tmp}/rb0234.sql"
  $R sql "${TMPDIR:-/tmp}/rb0234.sql" 2>&1 | grep -E "ok ·|TEST FAIL|ERROR" | sed 's/^psql:[^ ]* NOTICE:  //'
  rm -f "${TMPDIR:-/tmp}/rb0234.sql"
  $R sql $M/0234_idealista_crm_switch.sql >/dev/null 2>&1 && echo "ok · 0234 se vuelve a aplicar"
fi
if [ "$what" = recuperacion ] || [ "$what" = todo ]; then
  echo "== recuperación con datos"
  fresh
  $R sql $S/test-idealista-crm-rollback.sql 2>&1 | grep -E "ok ·|TEST FAIL|ERROR|en verde|^==" | sed 's/^psql:[^ ]* NOTICE:  //'
  echo "== la contención ya no tiene «deshacer en bloque»"
  if $R sqlv undo=1 -- $S/idealista-crm-sync-containment.sql >/dev/null 2>&1; then echo "TEST FAIL: undo=1 se ejecutó"; exit 1; fi
  echo "ok · undo=1 se rechaza (containment_bulk_undo_removed)"
  echo "== las reversiones se niegan con datos"
  D=docs/changes/2026-10-28-idealista-api-crm-sync
  if $R sql $D/rollback-0233.sql >/dev/null 2>&1; then echo "TEST FAIL: rollback-0233 se ejecutó con datos"; exit 1; fi
  echo "ok · rollback-0233 se niega con datos"
  if $R sql $D/rollback-0232.sql >/dev/null 2>&1; then echo "TEST FAIL: rollback-0232 se ejecutó con 0233 y datos"; exit 1; fi
  echo "ok · rollback-0232 se niega con datos"
  $R sql $S/test-idealista-crm-concurrency-check.sql >/dev/null 2>&1 || true
  echo "== sin datos: la reversión deja el esquema idéntico (pg_dump -s, sin la línea «restrict», que lleva un token aleatorio)"
  $R reset
  # shellcheck disable=SC2086
  $R sql $BASE >/dev/null 2>&1
  DUMP="/opt/homebrew/opt/postgresql@16/bin/pg_dump -h 127.0.0.1 -p ${BCP_PG_PORT:-54329} -U bcp_test -s --no-owner bcp_test"
  B=$(mktemp "${TMPDIR:-/tmp}/crm-before.XXXXXX"); A=$(mktemp "${TMPDIR:-/tmp}/crm-after.XXXXXX")
  $DUMP | grep -v -E '^\\(un)?restrict ' > "$B"
  $R sql $M/0232_idealista_reference_boundary.sql $M/0233_idealista_crm_sync.sql >/dev/null 2>&1
  $R sql $D/rollback-0233.sql $D/rollback-0232.sql >/dev/null
  $DUMP | grep -v -E '^\\(un)?restrict ' > "$A"
  if diff -q "$B" "$A" >/dev/null; then echo "ok · esquema idéntico tras revertir sin datos"; else diff "$B" "$A" | head -40; echo "TEST FAIL: el esquema cambió"; rm -f "$B" "$A"; exit 1; fi
  rm -f "$B" "$A"
  $R sql $M/0232_idealista_reference_boundary.sql $M/0233_idealista_crm_sync.sql >/dev/null 2>&1
  echo "ok · 0232 y 0233 se vuelven a aplicar tras revertir"
fi
