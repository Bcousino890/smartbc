#!/bin/sh
# SOLO PRUEBAS LOCALES (Idealista API → CRM). Código real de crm-sync contra las
# funciones reales de 0233 en el Postgres temporal. El adaptador psql solo acepta
# 127.0.0.1:54329, así que BCP_PG_PORT tiene que ser 54329 (o no ponerlo).
# Necesita node_modules (ejecutar en la copia exportada) y BCP_PG_DIR.
set -eu
cd "$(dirname "$0")/../.."
[ "${BCP_PG_PORT:-54329}" = 54329 ] || { echo "test-idealista-crm-flow: el adaptador psql exige el puerto 54329" >&2; exit 2; }
R=scripts/sql/run-local.sh
M=supabase/migrations
S=scripts/sql
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M/0192_catalogs_core.sql $M/0193_catalog_public.sql \
       $M/0194_catalog_contact.sql $M/0195_catalog_selection.sql $M/0196_catalog_adjustments.sql $S/stub-idealista-crm.sql \
       $M/0232_idealista_reference_boundary.sql $M/0233_idealista_crm_sync.sql $M/0236_idealista_crm_target_sin_decisiva.sql >/dev/null 2>&1
SEED=$(mktemp "${TMPDIR:-/tmp}/crm-flow.XXXXXX")
cat > "$SEED" <<'SQL'
UPDATE app_settings SET value = '{"enabled": true}' WHERE key = 'idealista_crm_sync';
INSERT INTO property_tags (country, name) VALUES ('es', 'RESERVADO');
INSERT INTO idealista_listings (reference_code, is_inspo, inspo_title) VALUES ('BC-F001', true, 'Piso luminoso en Chamberí');
SQL
$R sql "$SEED"
rm -f "$SEED"
node --experimental-strip-types --no-warnings --import ./scripts/node-ts-loader.mjs scripts/test-idealista-crm-flow.mts
