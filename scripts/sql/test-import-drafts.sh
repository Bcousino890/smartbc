#!/bin/sh
# SOLO PRUEBAS LOCALES (BCP-01 P5). Tests de 0214 en el Postgres temporal
# (ver run-local.sh). Necesita BCP_PG_DIR=<scratchpad>/pg-bcp01.
set -eu
cd "$(dirname "$0")/../.."
R=scripts/sql/run-local.sh
S=scripts/sql
M=supabase/migrations
BASE="$S/stub-supabase.sql $S/stub-supabase-imports.sql $S/test-util.sql $S/fixtures-core.sql $M/0192_catalogs_core.sql $M/0193_catalog_public.sql $M/0194_catalog_contact.sql $M/0195_catalog_selection.sql $M/0196_catalog_adjustments.sql $M/0197_catalog_texts.sql $M/0202_catalog_photo_prefs.sql $M/0207_catalog_groups.sql"
M14=$M/0214_property_import_drafts.sql
RB14=docs/changes/2026-10-18-bcp-01-buscar-e-importar/rollback-0214.sql

echo "== 1. 0214 aplicada DOS veces + tests"
$R reset
$R sql $BASE $M14 $M14 $S/test-import-drafts.sql

echo "== 2. dos confirmaciones a la vez del mismo borrador"
$R sql $S/test-import-drafts-conc-setup.sql
$R sql $S/test-import-drafts-conc-a.sql &
CONC_A=$!
sleep 0.5
$R sql $S/test-import-drafts-conc-b.sql
wait $CONC_A
$R sql $S/test-import-drafts-conc-check.sql

echo "== 3. reversión y reaplicación"
$R sql $RB14 $S/test-rollback-0214.sql $M14
$R sql $S/test-util.sql
echo "   0214 se vuelve a aplicar tras su reversión"

echo "== 4. 0214 sobre los tests de la selección (2k): nada cambia"
$R reset
$R sql $BASE $M14 $S/test-catalog-operations.sql

echo "test-import-drafts.sh: todos los escenarios en verde"
