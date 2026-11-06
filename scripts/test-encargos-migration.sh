#!/usr/bin/env bash
# Prueba las migraciones 0243-0246 (varios encargos por cliente + encargo_matches, RLS) y su
# reversión en un contenedor Postgres DESECHABLE. Nunca toca `supabase-db` salvo
# para volcar el esquema en solo lectura (pg_dump --schema-only).
#   bash scripts/test-encargos-migration.sh
set -uo pipefail
cd "$(dirname "$0")/.."

NAME=encargos-pg-test
IMAGE="${PG_TEST_IMAGE:-supabase/postgres:15.8.1.085}"
MIG=supabase/migrations/0243_encargos_multiples.sql
MIG2=supabase/migrations/0244_make_encargo_primary.sql
MIG3=supabase/migrations/0245_encargo_notify_atomic.sql
MIG4=supabase/migrations/0246_encargos_rls_y_consentimiento.sql
ROLLBACK4=docs/changes/2026-11-06-encargos-matching/rollback-0246.sql
ROLLBACK3=docs/changes/2026-11-06-encargos-matching/rollback-0245.sql
ROLLBACK2=docs/changes/2026-11-06-encargos-matching/rollback-0244.sql
ROLLBACK=docs/changes/2026-11-06-encargos-matching/rollback-0243.sql
FAILS=0

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

[ -f "$MIG" ] || { echo "FAIL: falta $MIG"; exit 1; }
[ -f "$ROLLBACK" ] || { echo "FAIL: falta $ROLLBACK"; exit 1; }

# shellcheck source=scripts/lib-encargos-testdb.sh
source scripts/lib-encargos-testdb.sh
encargos_testdb_up "$NAME" 54999 || exit 1
psq() { docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
psq_loose() { docker exec -i "$NAME" psql -U postgres -d postgres -qtA "$@"; }

check() { # descripción, esperado, obtenido
  if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1 (esperado '$2', obtenido '$3')"; FAILS=$((FAILS+1)); fi
}
expect_fail() { # descripción, sql
  if psq -c "$2" >/dev/null 2>&1; then echo "FAIL - $1 (debía fallar)"; FAILS=$((FAILS+1)); else echo "ok   - $1"; fi
}

# Datos previos: 2 clientes con preferencias.
A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222
psq -c "INSERT INTO profiles(id, email) VALUES ('$A','a@test.local'),('$B','b@test.local')" >/dev/null || { echo "FAIL: no se pudieron crear perfiles de prueba"; exit 1; }
psq -c "INSERT INTO client_preferences(client_id, max_price) VALUES ('$A', 900),('$B', 1200)" >/dev/null || { echo "FAIL: preferencias previas"; exit 1; }

apply() { docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$1" >/dev/null 2>&1; }

apply "$MIG"; check "migración 0243 (1.ª vez)" 0 $?
apply "$MIG"; check "migración 0243 (2.ª vez, idempotente)" 0 $?

apply "$MIG2"; check "migración 0244 (1.ª vez)" 0 $?
apply "$MIG2"; check "migración 0244 (2.ª vez, idempotente)" 0 $?
check "make_encargo_primary solo ejecutable por service_role" "t|f|f" "$(psq -c "select has_function_privilege('service_role','make_encargo_primary(uuid)','execute') || '|' || has_function_privilege('anon','make_encargo_primary(uuid)','execute') || '|' || has_function_privilege('authenticated','make_encargo_primary(uuid)','execute')" | sed 's/true/t/g;s/false/f/g')"

apply "$MIG3"; check "migración 0245 (1.ª vez)" 0 $?
apply "$MIG3"; check "migración 0245 (2.ª vez, idempotente)" 0 $?
SIG="claim_and_notify_encargo_matches(uuid[],uuid[],text,text,text,jsonb)"
check "claim_and_notify solo ejecutable por service_role" "t|f|f" "$(psq -c "select has_function_privilege('service_role','$SIG','execute') || '|' || has_function_privilege('anon','$SIG','execute') || '|' || has_function_privilege('authenticated','$SIG','execute')" | sed 's/true/t/g;s/false/f/g')"
check "encargo_matches.reasons existe (jsonb)" jsonb "$(psq -c "select data_type from information_schema.columns where table_name='encargo_matches' and column_name='reasons'")"

check "filas previas intactas" 2 "$(psq -c "select count(*) from client_preferences")"
check "filas previas: is_primary y active" 2 "$(psq -c "select count(*) from client_preferences where is_primary and status='active' and position=0 and label='Encargo 1' and id is not null and baseline_at is not null")"
check "PK es id" "id" "$(psq -c "select string_agg(a.attname,',') from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid='client_preferences'::regclass and i.indisprimary")"
check "FK client_id sigue existiendo" 1 "$(psq -c "select count(*) from pg_constraint where conrelid='client_preferences'::regclass and contype='f' and conkey=(select array_agg(attnum) from pg_attribute where attrelid='client_preferences'::regclass and attname='client_id')")"
check "índice normal por client_id" 1 "$(psq -c "select count(*) from pg_indexes where tablename='client_preferences' and indexname='client_preferences_client_id_idx'")"
check "RLS sigue activo en client_preferences" t "$(psq -c "select relrowsecurity from pg_class where oid='client_preferences'::regclass")"
check "políticas de client_preferences conservadas" 3 "$(psq -c "select count(*) from pg_policies where tablename='client_preferences'")"

psq -c "INSERT INTO client_preferences(client_id, is_primary, label, position) VALUES ('$A', false, 'Encargo 2', 1)" >/dev/null 2>&1; check "2.ª fila del mismo cliente con is_primary=false" 0 $?
expect_fail "2.ª fila is_primary=true del mismo cliente falla" "INSERT INTO client_preferences(client_id) VALUES ('$A')"
expect_fail "status inválido falla" "INSERT INTO client_preferences(client_id, is_primary, status) VALUES ('$A', false, 'borrado')"

E=$(psq -c "select id from client_preferences where client_id='$A' and not is_primary limit 1")
psq -c "INSERT INTO encargo_matches(encargo_id, source, source_id, canonical_id, score) VALUES ('$E','property','p1','c1',80)" >/dev/null 2>&1; check "insertar match" 0 $?
expect_fail "match duplicado (encargo, source, canonical_id) falla" "INSERT INTO encargo_matches(encargo_id, source, source_id, canonical_id) VALUES ('$E','property','p9','c1')"
expect_fail "source inválido falla" "INSERT INTO encargo_matches(encargo_id, source, source_id, canonical_id) VALUES ('$E','otro','p9','c2')"
psq -c "INSERT INTO encargo_matches(encargo_id, source, source_id, canonical_id) VALUES ('$E','particular','l1','c1')" >/dev/null 2>&1; check "mismo canonical_id con otro source es válido" 0 $?

# claim_and_notify: atómica
M=$(psq -c "select id from encargo_matches where encargo_id='$E' and source='property'")
U=33333333-3333-3333-3333-333333333333
GHOST=44444444-4444-4444-4444-444444444444
psq -c "INSERT INTO auth.users(id) VALUES ('$U')" >/dev/null 2>&1; check "usuario de prueba en auth.users" 0 $?
check "sin destinatarios: no reclama nada" 0 "$(psq -c "select claim_and_notify_encargo_matches(array['$M']::uuid[], array[]::uuid[], 't', 'b', '/l', '{}'::jsonb)")"
check "sin destinatarios: notified_at sigue nulo" 1 "$(psq -c "select count(*) from encargo_matches where id='$M' and notified_at is null")"
psq -c "select claim_and_notify_encargo_matches(array['$M']::uuid[], array['$GHOST']::uuid[], 't', 'b', '/l', '{}'::jsonb)" >/dev/null 2>&1
check "destinatario inexistente: falla" 1 "$([ $? -ne 0 ] && echo 1 || echo 0)"
check "fallo del aviso: nada reclamado (todo o nada)" 1 "$(psq -c "select count(*) from encargo_matches where id='$M' and notified_at is null")"
check "reclama y avisa: devuelve 1" 1 "$(psq -c "select claim_and_notify_encargo_matches(array['$M']::uuid[], array['$U']::uuid[], 't', 'b', '/l', '{}'::jsonb)")"
check "aviso creado (tipo encargo_match)" 1 "$(psq -c "select count(*) from crm_notifications where user_id='$U' and type='encargo_match'")"
check "segunda llamada: 0 reclamadas y sin aviso nuevo" "0|1" "$(psq -c "select claim_and_notify_encargo_matches(array['$M']::uuid[], array['$U']::uuid[], 't', 'b', '/l', '{}'::jsonb)")|$(psq -c "select count(*) from crm_notifications where user_id='$U'")"

# ── 0246: RLS del cliente solo sobre su principal + CHECK + make_encargo_primary hereda las alertas ──
check "precondición 0246: ningún principal no activo" 0 "$(psq -c "select count(*) from client_preferences where is_primary and status <> 'active'")"
apply "$MIG4"; check "migración 0246 (1.ª vez)" 0 $?
apply "$MIG4"; check "migración 0246 (2.ª vez, idempotente)" 0 $?
check "make_encargo_primary (0246) solo ejecutable por service_role" "t|f|f" "$(psq -c "select has_function_privilege('service_role','make_encargo_primary(uuid)','execute') || '|' || has_function_privilege('anon','make_encargo_primary(uuid)','execute') || '|' || has_function_privilege('authenticated','make_encargo_primary(uuid)','execute')" | sed 's/true/t/g;s/false/f/g')"
expect_fail "CHECK: un principal no puede quedar pausado" "UPDATE client_preferences SET status='paused' WHERE client_id='$B' AND is_primary"
# Como cliente A del portal (rol authenticated + JWT con su id): auth.uid() = A.
as_a() { psq -c "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL \"request.jwt.claim.sub\" = '$A'; SET LOCAL \"request.jwt.claims\" = '{\"sub\":\"$A\",\"role\":\"authenticated\"}'; $1; COMMIT;"; }
check "precondición: A tiene principal + 1 encargo no principal" "1|1" "$(psq -c "select count(*) filter (where is_primary) || '|' || count(*) filter (where not is_primary) from client_preferences where client_id='$A'")"
check "cliente: auth.uid() simulado es A" "$A" "$(as_a "select auth.uid()")"
check "cliente: solo VE su principal (no los otros encargos ni sus notas)" "1|t" "$(as_a "select count(*) || '|' || bool_and(is_primary) from client_preferences" | sed 's/true/t/g')"
check "cliente: insertar un encargo no principal → denegado por RLS" 1 "$(as_a "INSERT INTO client_preferences(client_id, is_primary, label, position) VALUES ('$A', false, 'Mío', 9)" 2>&1 | grep -c 'row-level security')"
check "cliente: actualizar su principal sí (sin tocar is_primary)" "777.00" "$(as_a "UPDATE client_preferences SET max_price=777 WHERE client_id='$A' AND is_primary" >/dev/null 2>&1; psq -c "select max_price from client_preferences where client_id='$A' and is_primary")"
check "cliente: is_primary=false → denegado por RLS" 1 "$(as_a "UPDATE client_preferences SET is_primary=false WHERE client_id='$A' AND is_primary" 2>&1 | grep -c 'row-level security')"
as_a "UPDATE client_preferences SET label='hackeado' WHERE NOT is_primary" >/dev/null 2>&1
as_a "DELETE FROM client_preferences WHERE NOT is_primary" >/dev/null 2>&1
check "cliente: no puede tocar ni borrar un encargo no principal" "1|0" "$(psq -c "select count(*) from client_preferences where client_id='$A' and not is_primary")|$(psq -c "select count(*) from client_preferences where label='hackeado'")"
check "cliente: no ve filas de otro cliente" 0 "$(as_a "select count(*) from client_preferences where client_id='$B'")"
# make_encargo_primary hereda las alertas del principal anterior.
psq -c "UPDATE profiles SET country='es' WHERE id='$A'" >/dev/null
psq -c "UPDATE client_preferences SET new_listing_alerts_enabled=true, new_listing_alerts_frequency='weekly', new_listing_alerts_last_sent_at='2026-01-02T03:04:05Z' WHERE client_id='$A' AND is_primary" >/dev/null
E2=$(psq -c "select id from client_preferences where client_id='$A' and not is_primary limit 1")
psq -c "select make_encargo_primary('$E2')" >/dev/null 2>&1; check "make_encargo_primary (0246) funciona" 0 $?
check "el nuevo principal hereda enabled/frequency/last_sent_at" "t|t|weekly|2026-01-02 03:04:05+00" "$(psq -c "select is_primary || '|' || new_listing_alerts_enabled || '|' || new_listing_alerts_frequency || '|' || (new_listing_alerts_last_sent_at at time zone 'UTC') || '+00' from client_preferences where id='$E2'" | sed 's/true/t/g')"
expect_fail "make_encargo_primary: errores de 0244 intactos (ENCARGO_NO_EXISTE)" "select make_encargo_primary('99999999-9999-9999-9999-999999999999')"

apply "$ROLLBACK4"; check "rollback 0246" 0 $?
check "rollback 0246: políticas de 0001 y sin CHECK" "0|0" "$(psq -c "select count(*) from pg_policies where tablename='client_preferences' and (qual like '%is_primary%' or with_check like '%is_primary%')")|$(psq -c "select count(*) from pg_constraint where conname='client_preferences_primary_active_check'")"
check "rollback 0246: la función vuelve a 0244 (sin herencia de alertas)" 0 "$(psq -c "select count(*) from pg_proc where proname='make_encargo_primary' and prosrc like '%new_listing_alerts%'")"
apply "$ROLLBACK4"; check "rollback 0246 idempotente" 0 $?
apply "$MIG4"; check "0246 reaplicable tras rollback" 0 $?
apply "$ROLLBACK4"

apply "$ROLLBACK3"; check "rollback 0245" 0 $?
check "rollback 0245: función y columna fuera" "|0" "$(psq -c "select to_regprocedure('public.$SIG')")|$(psq -c "select count(*) from information_schema.columns where table_name='encargo_matches' and column_name='reasons'")"
apply "$ROLLBACK3"; check "rollback 0245 idempotente" 0 $?
apply "$MIG3"; check "0245 reaplicable tras rollback" 0 $?

apply "$ROLLBACK2"; check "rollback 0244" 0 $?
check "rollback 0244: función borrada" "" "$(psq -c "select to_regprocedure('public.make_encargo_primary(uuid)')")"
apply "$ROLLBACK2"; check "rollback 0244 idempotente" 0 $?
apply "$MIG2"

# Reversión: con 2 filas del cliente A debe abortar y no cambiar nada.
docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$ROLLBACK" >/dev/null 2>&1
rc=$?; [ "$rc" -ne 0 ] && rc=1; check "rollback aborta con más de una fila por cliente" 1 $rc
check "tras el aborto sigue la PK id" "id" "$(psq -c "select string_agg(a.attname,',') from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid='client_preferences'::regclass and i.indisprimary")"

psq -c "DELETE FROM client_preferences WHERE NOT is_primary" >/dev/null
apply "$ROLLBACK"; check "rollback con una fila por cliente" 0 $?
check "rollback: PK vuelve a client_id" "client_id" "$(psq -c "select string_agg(a.attname,',') from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid='client_preferences'::regclass and i.indisprimary")"
check "rollback: encargo_matches borrada" "" "$(psq -c "select to_regclass('public.encargo_matches')")"
check "rollback: columnas nuevas fuera" 0 "$(psq -c "select count(*) from information_schema.columns where table_name='client_preferences' and column_name in ('id','label','status','is_primary','position','end_client_label','max_price_by_bedrooms','baseline_at')")"
check "rollback: filas intactas" 2 "$(psq -c "select count(*) from client_preferences")"
apply "$ROLLBACK"; check "rollback idempotente" 0 $?
apply "$MIG"; check "migración reaplicable tras rollback" 0 $?

echo
if [ "$FAILS" -eq 0 ]; then echo "PASS: todas las comprobaciones"; else echo "FAIL: $FAILS comprobaciones fallidas"; exit 1; fi
