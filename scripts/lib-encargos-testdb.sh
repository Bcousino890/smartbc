#!/usr/bin/env bash
# Contenedor Postgres DESECHABLE para las pruebas de encargos. Nunca escribe en
# `supabase-db`: solo lo usa para volcar el esquema en solo lectura (pg_dump).
# Se carga con `source`; define encargos_testdb_up NOMBRE PUERTO y encargos_testdb_down NOMBRE.
ENCARGOS_PG_IMAGE="${PG_TEST_IMAGE:-supabase/postgres:15.8.1.085}"

encargos_testdb_down() { docker rm -f "$1" >/dev/null 2>&1 || true; }

# Arranca el contenedor, crea los roles de Supabase y carga el esquema public.
# Devuelve 0 si client_preferences quedó cargada.
encargos_testdb_up() {
  local name="$1" port="$2"
  encargos_testdb_down "$name"
  docker run -d --name "$name" -e POSTGRES_PASSWORD=test -p "$port:5432" "$ENCARGOS_PG_IMAGE" >/dev/null || { echo "FAIL: no arranca el contenedor"; return 1; }
  for _ in $(seq 1 60); do
    docker exec "$name" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
    sleep 1
  done
  sleep 3
  docker exec -i "$name" psql -U postgres -d postgres -qtA -c "DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END \$\$;" >/dev/null 2>&1
  docker exec supabase-db pg_dump -U postgres --schema-only --schema=public postgres 2>/dev/null \
    | docker exec -i "$name" psql -U postgres -d postgres -q >/dev/null 2>&1
  local n
  n=$(docker exec -i "$name" psql -U postgres -d postgres -qtA -c "select count(*) from information_schema.tables where table_name='client_preferences'")
  [ "$n" = "1" ] || { echo "FAIL: el esquema no se cargó (client_preferences ausente)"; return 1; }
  # Sin FK a auth.users para no depender de ella.
  docker exec -i "$name" psql -U postgres -d postgres -qtA -c "ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey" >/dev/null 2>&1
  return 0
}
