#!/bin/sh
# SOLO PRUEBAS LOCALES (Solicitudes · reparto, 0237). Postgres temporal de
# run-local.sh. Necesita BCP_PG_DIR=<scratchpad>/pg-bcp01.
set -eu
cd "$(dirname "$0")/../.."
R=scripts/sql/run-local.sh
S=scripts/sql
M=supabase/migrations
D=docs/changes/2026-11-02-solicitudes-reparto
BASE="$S/stub-supabase.sql $S/test-util.sql $S/stub-solicitudes-reparto.sql $M/0080_idealista_leads.sql $M/0082_idealista_leads_properties.sql $M/0083_idealista_leads_avatar.sql $M/0086_idealista_leads_assignment.sql $M/0123_idealista_leads_matched_listing.sql $M/0141_sales_inbox.sql $M/0160_lead_merge.sql $M/0161_lead_inbox_operation.sql"
M37=$M/0237_solicitudes_reparto.sql
M38=$M/0238_solicitudes_vinculo_exacto_retencion.sql
M41=$M/0241_solicitudes_anuncios_retirados.sql
M42=$M/0242_solicitudes_telefonos_contacto.sql
LOCK_ERR_A=$(mktemp)
LOCK_ERR_B=$(mktemp)

echo "== 1. 0237 aplicada DOS veces (idempotente) + escenarios"
$R reset
$R sql $BASE $M37 $M37 $S/test-solicitudes-reparto.sql
echo "== 1b. 0238 aplicada DOS veces (idempotente) + API, caducidad y vista"
$R sql $M38 $M38 $S/test-solicitudes-retencion.sql
echo "== 1c. 0241 aplicada DOS veces (idempotente) + historial de la API y anuncios retirados"
$R sql $M41 $M41 $S/test-solicitudes-retirados.sql
echo "== 1d. 0242 aplicada DOS veces (idempotente) + teléfonos de WhatsApp y de llamadas"
$R sql $M42 $M42 $S/test-solicitudes-telefonos.sql

echo "== 2. R12: dos primeras consultas a la vez del mismo cliente"
$R sql $S/test-solicitudes-reparto-conc-setup.sql
$R sql $S/test-solicitudes-reparto-conc-a.sql &
CONC_A=$!
sleep 0.5
$R sql $S/test-solicitudes-reparto-conc-b.sql
wait $CONC_A
$R sql $S/test-solicitudes-reparto-conc-check.sql

echo "== 2b. Hallazgo 2: reparto y reasignación del mismo cliente a la vez"
$R sql $S/test-solicitudes-reparto-lock-setup.sql
set +e
$R sql $S/test-solicitudes-reparto-lock-a.sql > /dev/null 2>"$LOCK_ERR_A" &
LOCK_A=$!
sleep 0.5
$R sql $S/test-solicitudes-reparto-lock-b.sql > /dev/null 2>"$LOCK_ERR_B"
LOCK_B_RC=$?
wait $LOCK_A
LOCK_A_RC=$?
set -e
if [ "$LOCK_A_RC" -ne 0 ] || [ "$LOCK_B_RC" -ne 0 ]; then
  echo "TEST FAIL: H2 · sesión A=$LOCK_A_RC B=$LOCK_B_RC"
  grep -h "ERROR" "$LOCK_ERR_A" "$LOCK_ERR_B" || true
  exit 1
fi
echo "   ok · H2 · las dos sesiones terminan sin interbloqueo"
$R sql $S/test-solicitudes-reparto-lock-check.sql

echo "== 3. reversión y reaplicación"
$R sql $D/rollback-0242.sql $S/test-rollback-0242.sql $M42
echo "   0242 se vuelve a aplicar tras su reversión"
$R sql $D/rollback-0241.sql $S/test-rollback-0241.sql $M41
echo "   0241 se vuelve a aplicar tras su reversión"
$R sql $D/rollback-0241.sql
$R sql $D/rollback-0238.sql $S/test-rollback-0238.sql $M38 $M41
echo "   0238 se vuelve a aplicar tras su reversión"
$R sql $D/rollback-0238.sql $D/rollback-0237.sql $S/test-rollback-0237.sql $M37 $M38 $M41
echo "   0237 y 0238 se vuelven a aplicar tras revertir las dos"

echo "== 4. DEFENSIVO (NO es el esquema actual): varios anuncios por inmueble, en una base aparte"
$R reset
$R sql $BASE $M37 $M38 $M41 $S/test-solicitudes-reparto-multianuncio.sql

echo "test-solicitudes-reparto.sh: todos los escenarios en verde"
