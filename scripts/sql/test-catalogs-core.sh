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

echo "== 2c. 0194: contacto del catálogo (datos previos + aplicada dos veces)"
M4=supabase/migrations/0194_catalog_contact.sql
RB4=docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0194.sql
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $S/test-catalog-contact-pre.sql $M4 $M4 $S/test-catalog-contact.sql
$R sql $RB4 $S/test-rollback-0194.sql $M4 $S/test-catalog-public.sql
echo "   0194 se vuelve a aplicar tras su reversión y los tests de 0193 siguen en verde"

echo "== 2d. 0195: zonas, criterios, modo automático y anuncios (catálogo previo + aplicada dos veces)"
M5=supabase/migrations/0195_catalog_selection.sql
RB5=docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0195.sql
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $S/test-catalog-auto-pre.sql $M5 $M5 $S/test-catalog-auto.sql
$R sql $RB5 $S/test-rollback-0195.sql $M5 $S/test-catalog-contact-pre.sql
echo "   0195 se vuelve a aplicar tras su reversión"

M6=supabase/migrations/0196_catalog_adjustments.sql
echo "== 2e. paridad TS ↔ SQL de zonas y selección (datos sintéticos deterministas)"
PAR=$(mktemp "${TMPDIR:-/tmp}/bcp-parity.XXXXXX")
node --experimental-strip-types --import ./scripts/node-ts-loader.mjs $S/gen-catalog-parity.mts > "$PAR" 2>/dev/null
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $M6 supabase/migrations/0197_catalog_texts.sql "$PAR"
rm -f "$PAR"

echo "== 2f. 0196 sobre los tests de 0195: ajustes y portada no cambian nada sin usarse"
RB6=docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0196.sql
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $S/test-catalog-auto-pre.sql $M5 $M6 $M6 $S/test-catalog-auto.sql

echo "== 2g. 0196: ajustes del automático y portada (catálogos previos + aplicada dos veces)"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $S/test-catalog-adjust-pre.sql $M6 $M6 $S/test-catalog-adjust.sql
$R sql $RB6 $S/test-rollback-0196.sql $M6
$R sql $S/test-util.sql
echo "   0196 se vuelve a aplicar tras su reversión"

echo "== 2h. 0197: textos del catálogo e historia (catálogos previos + aplicada dos veces)"
M7=supabase/migrations/0197_catalog_texts.sql
RB7=docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0197.sql
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $M6 $S/test-catalog-texts-pre.sql $M7 $M7 $S/test-catalog-texts.sql
$R sql $RB7 $S/test-rollback-0197.sql $M7
$R sql $S/test-util.sql
echo "   0197 se vuelve a aplicar tras su reversión"

echo "== 2i. 0197 sobre los tests de 0196 (ajustes y portada siguen igual)"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $S/test-catalog-adjust-pre.sql $M6 $M7 $S/test-catalog-adjust.sql

echo "== 2k. operación e importe: alquiler, duales, precio principal ausente e inclusiones de otra operación (0192–0197)"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $M6 $M7 $S/test-catalog-operations.sql

echo "== 3. siembra sin coincidencias"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/seed-case-none.sql $M $S/test-seed-empty.sql

echo "== 4. siembra ambigua (dos usuarios)"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/seed-case-dup.sql $M $S/test-seed-empty.sql

echo "test-catalogs-core.sh: todos los escenarios en verde"
