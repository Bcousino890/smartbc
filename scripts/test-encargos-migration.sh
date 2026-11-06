#!/usr/bin/env bash
# Prueba la migración 0243 (varios encargos por cliente + encargo_matches) y su
# reversión en un contenedor Postgres DESECHABLE. Nunca toca `supabase-db` salvo
# para volcar el esquema en solo lectura (pg_dump --schema-only).
#   bash scripts/test-encargos-migration.sh
set -uo pipefail
cd "$(dirname "$0")/.."

NAME=encargos-pg-test
IMAGE="${PG_TEST_IMAGE:-supabase/postgres:15.8.1.085}"
MIG=supabase/migrations/0243_encargos_multiples.sql
ROLLBACK=docs/changes/2026-11-06-encargos-matching/rollback-0243.sql
FAILS=0

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

[ -f "$MIG" ] || { echo "FAIL: falta $MIG"; exit 1; }
[ -f "$ROLLBACK" ] || { echo "FAIL: falta $ROLLBACK"; exit 1; }

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -p 54999:5432 "$IMAGE" >/dev/null || { echo "FAIL: no arranca el contenedor"; exit 1; }
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done
sleep 3
psq() { docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
psq_loose() { docker exec -i "$NAME" psql -U postgres -d postgres -qtA "$@"; }

# Roles de Supabase y esquema (volcado de solo lectura del real).
psq_loose -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END \$\$;" >/dev/null 2>&1
docker exec supabase-db pg_dump -U postgres --schema-only --schema=public postgres 2>/dev/null \
  | docker exec -i "$NAME" psql -U postgres -d postgres -q >/dev/null 2>&1
n=$(psq -c "select count(*) from information_schema.tables where table_name='client_preferences'")
[ "$n" = "1" ] || { echo "FAIL: el esquema no se cargó (client_preferences ausente)"; exit 1; }

check() { # descripción, esperado, obtenido
  if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1 (esperado '$2', obtenido '$3')"; FAILS=$((FAILS+1)); fi
}
expect_fail() { # descripción, sql
  if psq -c "$2" >/dev/null 2>&1; then echo "FAIL - $1 (debía fallar)"; FAILS=$((FAILS+1)); else echo "ok   - $1"; fi
}

# Datos previos: 2 clientes con preferencias. Sin FK a auth.users para no depender de ella.
psq_loose -c "ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey" >/dev/null 2>&1
A=11111111-1111-1111-1111-111111111111
B=22222222-2222-2222-2222-222222222222
psq -c "INSERT INTO profiles(id, email) VALUES ('$A','a@test.local'),('$B','b@test.local')" >/dev/null || { echo "FAIL: no se pudieron crear perfiles de prueba"; exit 1; }
psq -c "INSERT INTO client_preferences(client_id, max_price) VALUES ('$A', 900),('$B', 1200)" >/dev/null || { echo "FAIL: preferencias previas"; exit 1; }

apply() { docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$1" >/dev/null 2>&1; }

apply "$MIG"; check "migración 0243 (1.ª vez)" 0 $?
apply "$MIG"; check "migración 0243 (2.ª vez, idempotente)" 0 $?

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
