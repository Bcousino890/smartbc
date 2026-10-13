#!/bin/sh
# ============================================================================
# SOLO DESARROLLO LOCAL (BCP-01, E7). Arranca `next dev` con los datos de
# prueba de los catálogos y SIN ningún sistema real:
#   · se niega si hay .env.local o .env.development.local en el repo (Next los
#     cargaría y podrían apuntar a sistemas reales);
#   · Supabase apunta a un puerto cerrado (127.0.0.1:9): cualquier llamada real
#     falla en el acto, no hay plan B;
#   · claves ficticias; solo escucha en 127.0.0.1.
# Las rutas de prueba viven en /dev-fixtures/* y exigen NODE_ENV=development
# y CATALOG_FIXTURES=1 (lib/catalogs/fixture-mode.ts).
# ============================================================================
set -eu
cd "$(dirname "$0")/.."
for f in .env.local .env.development.local .env.development; do
  if [ -e "$f" ]; then echo "dev-fixtures: existe $f; me niego a arrancar (podría apuntar a sistemas reales)" >&2; exit 2; fi
done
for v in $(env | sed -n 's/^\(DATABASE_URL[A-Za-z0-9_]*\|SUPABASE_[A-Za-z0-9_]*\|NEXT_PUBLIC_SUPABASE_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$v"; done
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:9"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="fixture-anon-key"
export SUPABASE_SERVICE_ROLE_KEY="fixture-service-key"
export CATALOG_FIXTURES=1
export NEXT_TELEMETRY_DISABLED=1
exec npx next dev --hostname 127.0.0.1 --port "${PORT:-3137}"
