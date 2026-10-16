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

echo "== 2l. 0202 (E3): fotos por catálogo (catálogo previo + aplicada dos veces, concurrencia y reversión)"
M8=supabase/migrations/0202_catalog_photo_prefs.sql
RB8=docs/changes/2026-10-13-bcp-01-home-catalogo/rollback-0202.sql
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $M6 $M7 $S/test-catalog-photos-pre.sql $M8 $M8 $S/test-catalog-photos.sql
# E3-1 con dos transacciones independientes y simultáneas.
$R sql $S/test-catalog-photos-conc-a.sql &
CONC_A=$!
sleep 0.5
$R sql $S/test-catalog-photos-conc-b.sql
wait $CONC_A
$R sql $S/test-catalog-photos-conc-check.sql
$R sql $RB8 $S/test-rollback-0202.sql $M8
$R sql $S/test-util.sql
echo "   0202 se vuelve a aplicar tras su reversión"

echo "== 2m. 0202 sobre la selección (2k) y la paridad TS ↔ SQL"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $M6 $M7 $M8 $S/test-catalog-operations.sql
PAR=$(mktemp "${TMPDIR:-/tmp}/bcp-parity.XXXXXX")
node --experimental-strip-types --import ./scripts/node-ts-loader.mjs $S/gen-catalog-parity.mts > "$PAR" 2>/dev/null
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $M6 $M7 $M8 "$PAR"
rm -f "$PAR"

echo "== 2n. 0207 (HOME · grupos): catálogos previos + aplicada dos veces, concurrencia, contraprueba y reversión"
M9=supabase/migrations/0207_catalog_groups.sql
RB9=docs/changes/2026-10-16-bcp-01-home-grupos/rollback-0207.sql
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $M6 $M7 $M8 $S/test-catalog-groups-pre.sql $M9 $M9 $S/test-catalog-groups.sql
# Borrar un grupo mientras otra sesión le asigna un catálogo.
$R sql $S/test-catalog-groups-conc-a.sql &
CONC_A=$!
sleep 0.5
$R sql $S/test-catalog-groups-conc-b.sql
wait $CONC_A
$R sql $S/test-catalog-groups-conc-check.sql
# Límite de 100 con dos sesiones simultáneas (con el bloqueo del dueño).
$R sqlv drop=98 -- $S/test-catalog-groups-lim-setup.sql
$R sqlv name=ParaleloA -- $S/test-catalog-groups-lim-a.sql &
LIM_A=$!
sleep 0.5
$R sqlv name=ParaleloB expect_fail=1 -- $S/test-catalog-groups-lim-b.sql
wait $LIM_A
$R sqlv nolock=0 -- $S/test-catalog-groups-lim-check.sql
# Contraprueba, solo en la base temporal: sin el bloqueo, el límite se rompe.
$R sql $S/test-catalog-groups-nolock.sql
$R sqlv drop=97 -- $S/test-catalog-groups-lim-setup.sql
$R sqlv name=SinBloqueoA -- $S/test-catalog-groups-lim-a.sql &
LIM_A=$!
sleep 0.5
$R sqlv name=SinBloqueoB expect_fail=0 -- $S/test-catalog-groups-lim-b.sql
wait $LIM_A
$R sqlv nolock=1 -- $S/test-catalog-groups-lim-check.sql
$R sql $M9
# Reversión y reaplicación.
$R sql $S/test-catalog-groups-state.sql $RB9 $S/test-rollback-0207.sql $M9 $M9
$R sql $S/test-util.sql
echo "   0207 se vuelve a aplicar tras su reversión"

echo "== 2o. 0207 sobre la selección (2k) y la paridad TS ↔ SQL"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $M6 $M7 $M8 $M9 $S/test-catalog-operations.sql
PAR=$(mktemp "${TMPDIR:-/tmp}/bcp-parity.XXXXXX")
node --experimental-strip-types --import ./scripts/node-ts-loader.mjs $S/gen-catalog-parity.mts > "$PAR" 2>/dev/null
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M $M3 $M4 $M5 $M6 $M7 $M8 $M9 "$PAR"
rm -f "$PAR"

echo "== 3. siembra sin coincidencias"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/seed-case-none.sql $M $S/test-seed-empty.sql

echo "== 4. siembra ambigua (dos usuarios)"
$R reset
$R sql $S/stub-supabase.sql $S/test-util.sql $S/seed-case-dup.sql $M $S/test-seed-empty.sql

echo "test-catalogs-core.sh: todos los escenarios en verde"
