#!/bin/sh
# SOLO PRUEBAS LOCALES (BCP-01 T1). Ejecuta todos los tests de 0192 en el
# Postgres temporal (ver run-local.sh). Necesita BCP_PG_DIR=<scratchpad>/pg-bcp01.
set -eu
cd "$(dirname "$0")/../.."
R=scripts/sql/run-local.sh
M=supabase/migrations/0192_catalogs_core.sql
RB=docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0192.sql
S=scripts/sql

echo "== 1. escenario normal: 0192 aplicada DOS veces + tests"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M $S/test-catalogs-core.sql

echo "== 2. reversión y reaplicación"
$R sql $RB $S/test-rollback-0192.sql $M
$R sql $S/test-util.sql
echo "   0192 se vuelve a aplicar tras la reversión"

echo "== 2b. 0193: instantánea pública, huella, enlaces (aplicada dos veces)"
M3=supabase/migrations/0193_catalog_public.sql
RB3=docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0193.sql
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M3 $S/test-catalog-public.sql
$R sql $RB3 $S/test-rollback-0193.sql $M3
echo "   0193 se vuelve a aplicar tras su reversión"

echo "== 3. siembra sin coincidencias"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/seed-case-none.sql $M $S/test-seed-empty.sql

echo "== 4. siembra ambigua (dos usuarios)"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/seed-case-dup.sql $M $S/test-seed-empty.sql

echo "test-catalogs-core.sh: todos los escenarios en verde"
