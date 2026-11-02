#!/bin/sh
# SOLO LOCAL. Recorre validacion.md (pasos 1–4b) a nivel de base contra el
# Postgres DESECHABLE de scripts/sql/run-local.sh, con los mismos scripts del
# entorno de pruebas (siembra, republicar, comprobaciones, limpieza). La
# ingesta se imita con upsert + route_leads + reprocesado; la unificación por
# teléfono (TypeScript) la cubre npm run test:lead-merge.
#
#   BCP_PG_DIR=<scratchpad>/pg-bcp01 BCP_PG_PORT=54331 scripts/sql/run-local.sh start
#   BCP_PG_DIR=… BCP_PG_PORT=54331 sh scripts/qa/solicitudes-reparto-pruebas/simular-en-local.sh
set -eu
SP=scripts/qa/solicitudes-reparto-pruebas/simulacion-local; R=scripts/sql/run-local.sh; S=scripts/sql; M=supabase/migrations; Q=scripts/qa/solicitudes-reparto-pruebas
BASE="$S/stub-supabase.sql $S/test-util.sql $S/stub-solicitudes-reparto.sql $M/0080_idealista_leads.sql $M/0082_idealista_leads_properties.sql $M/0083_idealista_leads_avatar.sql $M/0086_idealista_leads_assignment.sql $M/0123_idealista_leads_matched_listing.sql $M/0141_sales_inbox.sql $M/0160_lead_merge.sql $M/0161_lead_inbox_operation.sql"
$R reset >/dev/null; $R sql $BASE $M/0237_solicitudes_reparto.sql $SP/sim-pruebas.sql >/dev/null 2>&1
P="${BCP_PGBIN:-/opt/homebrew/opt/postgresql@16/bin}/psql -X -q -h 127.0.0.1 -p $BCP_PG_PORT -U bcp_test -d bcp_test"
echo "-- guardas:"; $P -f $Q/siembra.sql; $P -v entorno=otro -f $Q/siembra.sql
$P -v entorno=pruebas -v ref=BC-100 -v codigo=1 -f $Q/republicar-anuncio.sql
$P -tA -v entorno=pruebas -f $Q/siembra.sql >/dev/null; $P -tA -v entorno=pruebas -f $Q/siembra.sql | tail -3
$P -f $SP/sim-pasos.sql 2>&1 | grep -E "ok ·|FAIL|ERROR" | sed 's/^psql:[^ ]* NOTICE:  //'
echo "-- republicar A:"; $P -v entorno=pruebas -v ref=QA-0237-A -v codigo=990237009 -f $Q/republicar-anuncio.sql
$P -f $SP/sim-pasos-2.sql 2>&1 | grep -E "ok ·|FAIL|ERROR" | sed 's/^psql:[^ ]* NOTICE:  //'
echo "-- republicar C:"; $P -tA -v entorno=pruebas -v ref=QA-0237-C -v codigo=990237013 -f $Q/republicar-anuncio.sql
$P -f $SP/sim-pasos-3.sql 2>&1 | grep -E "ok ·|FAIL|ERROR" | sed 's/^psql:[^ ]* NOTICE:  //'
echo "-- comprobaciones (solo lectura), primer bloque:"; $P -f $Q/comprobaciones.sql | sed -n 1,12p
echo "-- limpieza:"; $P -v entorno=pruebas -f $Q/limpieza.sql
echo "-- restos: leads=$($P -tA -c "select count(*) from idealista_leads where conversation_id like '99023700%'") anuncios=$($P -tA -c "select count(*) from idealista_listings where reference_code like 'QA-0237-%'") historial=$($P -tA -c "select count(*) from idealista_listing_codes") reglas=$($P -tA -c "select count(*) from property_routing_rules")"
