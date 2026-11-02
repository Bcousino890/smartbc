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

echo "== 1. 0237 aplicada DOS veces (idempotente) + escenarios"
$R reset
$R sql $BASE $M37 $M37 $S/test-solicitudes-reparto.sql

echo "== 2. R12: dos primeras consultas a la vez del mismo cliente"
$R sql $S/test-solicitudes-reparto-conc-setup.sql
$R sql $S/test-solicitudes-reparto-conc-a.sql &
CONC_A=$!
sleep 0.5
$R sql $S/test-solicitudes-reparto-conc-b.sql
wait $CONC_A
$R sql $S/test-solicitudes-reparto-conc-check.sql

echo "== 3. reversión y reaplicación"
$R sql $D/rollback-0237.sql $S/test-rollback-0237.sql $M37
echo "   0237 se vuelve a aplicar tras su reversión"

echo "test-solicitudes-reparto.sh: todos los escenarios en verde"
