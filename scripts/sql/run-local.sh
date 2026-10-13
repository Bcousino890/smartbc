#!/bin/sh
# ============================================================================
# Postgres TEMPORAL para las pruebas SQL de BCP-01 (E7). SOLO local.
#
# Se niega a funcionar con cualquier otro destino:
#   · datos solo en una carpeta llamada pg-bcp01 dentro de un scratchpad
#     (BCP_PG_DIR=<scratchpad>/pg-bcp01) y fuera del repo;
#   · host 127.0.0.1, puerto 54329, usuario y base bcp_test;
#   · limpia del entorno DATABASE_URL*, SUPABASE_*, NEXT_PUBLIC_SUPABASE_* y
#     las variables de conexión de libpq; nunca lee .env.
#
# Uso:
#   BCP_PG_DIR=<scratchpad>/pg-bcp01 scripts/sql/run-local.sh start
#   … reset            (borra y crea de nuevo la base bcp_test)
#   … sql f1.sql f2…   (aplica ficheros en orden; se para en el primer error)
#   … stop | clean     (clean = stop + borrar SOLO esa carpeta)
# ============================================================================
set -eu

PGBIN=/opt/homebrew/opt/postgresql@16/bin
DIR="${BCP_PG_DIR:-}"

case "$DIR" in
  /*/scratchpad/pg-bcp01) ;;
  *) echo "run-local: BCP_PG_DIR debe ser <scratchpad>/pg-bcp01 (recibido: '$DIR')" >&2; exit 2 ;;
esac
REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
case "$DIR" in
  "$REPO_ROOT"/*) echo "run-local: la carpeta de datos no puede estar dentro del repo" >&2; exit 2 ;;
esac

# Entorno saneado: nada de credenciales ni destinos heredados.
for v in $(env | sed -n 's/^\(DATABASE_URL[A-Za-z0-9_]*\|SUPABASE_[A-Za-z0-9_]*\|NEXT_PUBLIC_SUPABASE_[A-Za-z0-9_]*\|PG[A-Z]*\)=.*/\1/p'); do
  unset "$v"
done
export PGHOST=127.0.0.1 PGPORT=54329 PGUSER=bcp_test PGDATABASE=bcp_test PGPASSFILE="$DIR/.sin-pgpass" PGSERVICEFILE="$DIR/.sin-pgservice"

guard() {
  [ "$PGHOST" = "127.0.0.1" ] && [ "$PGPORT" = "54329" ] && [ "$PGDATABASE" = "bcp_test" ] || {
    echo "run-local: destino inesperado, me niego" >&2; exit 2; }
}

cmd="${1:-}"; [ $# -gt 0 ] && shift
case "$cmd" in
  start)
    if [ ! -d "$DIR" ]; then
      "$PGBIN/initdb" -D "$DIR" -U bcp_test --auth=trust -E UTF8 --locale=C >/dev/null
    fi
    "$PGBIN/pg_ctl" -D "$DIR" -l "$DIR/server.log" -w \
      -o "-p 54329 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null
    guard
    "$PGBIN/psql" -q -d postgres -c "SELECT 1" >/dev/null
    "$PGBIN/psql" -q -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='bcp_test'" | grep -q 1 \
      || "$PGBIN/psql" -q -d postgres -c "CREATE DATABASE bcp_test" >/dev/null
    echo "run-local: Postgres temporal en 127.0.0.1:54329 (base bcp_test)"
    ;;
  reset)
    guard
    "$PGBIN/psql" -q -d postgres -c "DROP DATABASE IF EXISTS bcp_test" -c "CREATE DATABASE bcp_test" >/dev/null
    ;;
  sql)
    guard
    for f in "$@"; do
      "$PGBIN/psql" -q -tA -v ON_ERROR_STOP=1 -X -f "$f"
    done
    ;;
  stop)
    [ -d "$DIR" ] && "$PGBIN/pg_ctl" -D "$DIR" -m fast stop >/dev/null 2>&1 || true
    ;;
  clean)
    [ -d "$DIR" ] && "$PGBIN/pg_ctl" -D "$DIR" -m fast stop >/dev/null 2>&1 || true
    case "$DIR" in /*/scratchpad/pg-bcp01) rm -rf "$DIR" ;; esac
    ;;
  *)
    echo "uso: run-local.sh start|reset|sql <ficheros…>|stop|clean" >&2; exit 2 ;;
esac
