#!/bin/sh
# SOLO PRUEBAS LOCALES (BCP-01 P5). Flujo de importación de punta a punta contra
# 0214 en el Postgres temporal. Necesita BCP_PG_DIR=<scratchpad>/pg-bcp01.
set -eu
cd "$(dirname "$0")/../.."
R=scripts/sql/run-local.sh
S=scripts/sql
M=supabase/migrations
$R reset
$R sql $S/stub-supabase.sql $S/stub-supabase-imports.sql $S/test-util.sql $S/fixtures-core.sql \
  $M/0192_catalogs_core.sql $M/0193_catalog_public.sql $M/0194_catalog_contact.sql $M/0195_catalog_selection.sql \
  $M/0196_catalog_adjustments.sql $M/0197_catalog_texts.sql $M/0202_catalog_photo_prefs.sql $M/0207_catalog_groups.sql \
  $M/0214_property_import_drafts.sql $S/test-import-drafts-flow-setup.sql > /dev/null
env -i PATH="$(dirname "$(command -v node)"):/usr/bin:/bin" HOME="${TMPDIR:-/tmp}" \
  node --experimental-strip-types --import ./scripts/node-ts-loader.mjs --import ./scripts/shims/test-loader-db-psql.mjs \
  scripts/test-import-drafts-flow.mts
