#!/bin/sh
# SOLO PRUEBAS LOCALES (Idealista API → CRM). Las comprobaciones de solo lectura
# del operador (antes del merge y antes de encender) contra el Postgres temporal:
# dicen APTO con el esquema esperado y fallan (código ≠ 0 y una línea ✗ concreta)
# con cada alteración. Necesita BCP_PG_DIR (y BCP_PG_PORT) como run-local.sh.
set -eu
cd "$(dirname "$0")/../.."
R=scripts/sql/run-local.sh
M=supabase/migrations
S=scripts/sql
BASE="$S/stub-supabase.sql $S/test-util.sql $S/fixtures-core.sql $M/0192_catalogs_core.sql $M/0193_catalog_public.sql $M/0194_catalog_contact.sql $M/0195_catalog_selection.sql $M/0196_catalog_adjustments.sql $S/stub-idealista-crm.sql"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/crm-pre.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
fails=0

base() { $R reset; $R sql $BASE >/dev/null 2>&1; }
migrated() {
  base
  $R sql $M/0232_idealista_reference_boundary.sql $M/0233_idealista_crm_sync.sql >/dev/null 2>&1
  printf "%s\n" "INSERT INTO schema_migrations VALUES ('0232_idealista_reference_boundary.sql'),('0233_idealista_crm_sync.sql');" \
    "INSERT INTO property_tags (country, name) VALUES ('es', 'RESERVADO');" > "$TMP/m.sql"
  $R sql "$TMP/m.sql" >/dev/null
}
alter() { printf "%s\n" "$1" > "$TMP/a.sql"; $R sql "$TMP/a.sql" >/dev/null 2>&1; }
expect_ok() {  # nombre, archivo, texto del resultado
  if $R sql "$2" > "$TMP/out" 2>&1 && grep -q "$3" "$TMP/out"; then echo "ok · $1"; else echo "TEST FAIL: $1"; tail -5 "$TMP/out"; fails=$((fails + 1)); fi
}
expect_fail() {  # nombre, archivo, texto de la línea ✗
  if $R sql "$2" > "$TMP/out" 2>&1; then echo "TEST FAIL: $1 (salió con 0)"; fails=$((fails + 1)); return; fi
  if grep -q "RESULTADO: NO" "$TMP/out" && grep -q "✗ $3" "$TMP/out"; then echo "ok · $1"; else echo "TEST FAIL: $1"; grep "✗\|RESULTADO" "$TMP/out" | head -5; fails=$((fails + 1)); fi
}
PRE=$S/idealista-crm-sync-premerge.sql
ACT=$S/idealista-crm-sync-activation.sql

echo "== antes del merge"
base; expect_ok "esquema esperado → APTO PARA FUSIONAR" $PRE "RESULTADO: APTO PARA FUSIONAR"
base; alter "create policy extra_select on properties for select to authenticated using (true);"
expect_fail "política extra → NO FUSIONAR" $PRE "políticas en properties/property_photos (lista completa)"
base; alter "drop policy properties_auth_select on properties; create policy properties_auth_select on properties for select using (archived_at is null);"
expect_fail "roles cambiados (public en vez de authenticated)" $PRE "política properties_auth_select · roles"
base; alter "drop policy properties_staff_select on properties; create policy properties_staff_select on properties as restrictive for select using (is_staff());"
expect_fail "política restrictiva en vez de permisiva" $PRE "política properties_staff_select · permisiva"
base; alter "drop policy property_photos_select on property_photos;"
expect_fail "política que falta → sus atributos salen NULL" $PRE "política property_photos_select · USING"
base; alter "alter table properties disable row level security;"
expect_fail "RLS desactivada" $PRE "RLS activada en properties"
base; alter "alter function is_staff() security invoker;"
expect_fail "is_staff() sin SECURITY DEFINER" $PRE "is_staff() · SECURITY DEFINER"
base; alter "create or replace function is_staff() returns boolean language sql security definer stable set search_path = public as \$\$ select true \$\$;"
expect_fail "is_staff() con otro cuerpo" $PRE "is_staff() · cuerpo (0032)"
base; alter "create or replace function catalog_candidates(p_criteria jsonb, p_require_photo boolean, p_text text) returns table (property_id uuid, sale_group integer, eff_price numeric, created_at timestamptz) language sql stable as \$\$ select null::uuid, 0, 0::numeric, now() \$\$;"
expect_fail "catalog_candidates distinta" $PRE "catalog_candidates · cuerpo de 0195"
base; alter "alter table properties drop constraint properties_archived_reason_chk; alter table properties add constraint properties_archived_reason_chk check (archived_reason is null or archived_reason in ('portal_down')) not valid;"
expect_fail "CHECK sin validar" $PRE "CHECK properties_archived_reason_chk · validada"
base; alter "delete from schema_migrations;"
expect_fail "sin registro de migraciones → NULL" $PRE "última migración aplicada"
base; $R sql $M/0232_idealista_reference_boundary.sql >/dev/null 2>&1
expect_fail "0232 ya aplicada" $PRE "no existe aún: columna properties.reference_only"

echo "== antes de encender"
migrated; expect_ok "tras las migraciones → APTO PARA ENCENDER" $ACT "RESULTADO: APTO PARA ENCENDER"
migrated; alter "delete from property_tags where name = 'RESERVADO';"
expect_fail "sin RESERVADO" $ACT "una sola «RESERVADO» en es"
migrated; alter "update app_settings set value = '{\"enabled\": true}' where key = 'idealista_crm_sync';"
expect_fail "interruptor ya encendido" $ACT "interruptor (aún apagado)"
migrated; alter "alter table favorites disable trigger trg_reject_reference_only;"
expect_fail "trigger desactivado" $ACT "trigger trg_reject_reference_only en favorites · activado"
migrated; alter "grant execute on function apply_idealista_crm_sync(uuid, text, bigint, jsonb, jsonb, uuid) to authenticated;"
expect_fail "EXECUTE concedido a authenticated" $ACT "EXECUTE de authenticated · public.apply_idealista_crm_sync"
migrated; alter "alter function reject_reference_only_property() security invoker;"
expect_fail "protección sin SECURITY DEFINER" $ACT "SECURITY DEFINER · public.reject_reference_only_property()"
migrated; alter "insert into properties (slug, title, reference_only, published_web, new_listing_alerts_suppressed) values ('ref-x', 'x', true, false, true);"
expect_fail "ya hay fichas de referencia" $ACT "aún no hay fichas de referencia"

[ "$fails" -eq 0 ] && echo "comprobaciones previas: todo en verde" || { echo "comprobaciones previas: $fails fallos"; exit 1; }
