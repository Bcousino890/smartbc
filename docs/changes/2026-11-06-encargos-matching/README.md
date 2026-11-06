# Encargos: varias búsquedas por cliente y matching (migración 0243)

Parte de base de datos del cambio «encargos» (especificación en
`docs/superpowers/specs/2026-11-06-encargos-matching-design.md`). Solo España.

- **Rama:** `feat/encargos-matching`
- **Estado:** implementado en la rama, sin desplegar ni aplicar en producción.

## Qué cambia

`supabase/migrations/0243_encargos_multiples.sql`, aditiva e idempotente:

- `client_preferences` pasa de 1 fila por cliente a varias («encargos»). La
  clave primaria pasa de `client_id` a un `id uuid` nuevo; `client_id` mantiene
  su FK a `profiles` y gana un índice normal. Índices, trigger `updated_at`, RLS
  y políticas no se tocan.
- Columnas nuevas: `label` (def. `'Encargo 1'`), `status` (`active|paused|closed`,
  def. `active`), `is_primary` (def. true), `position` (def. 0),
  `end_client_label`, `max_price_by_bedrooms` (jsonb), `baseline_at`.
- Índice único parcial `client_preferences_one_primary (client_id) WHERE is_primary`:
  un solo encargo principal por cliente. Las filas actuales quedan como principal
  y activo.
- Tabla nueva `encargo_matches` (vacía), única por `(encargo_id, source, canonical_id)`,
  con RLS solo para staff. La precarga del stock como «visto» la hará
  `scripts/seed-encargo-baseline.mts`, no la migración.

Efecto a vigilar: el código que haga `upsert(..., { onConflict: 'client_id' })`
sobre `client_preferences` deja de funcionar al desaparecer la PK/unique sobre
`client_id`. Se adapta en las tareas siguientes del plan; no debe desplegarse la
migración sin ellas.

Embed `client_preferences(*)` de PostgREST: mientras `client_id` era la PK
devolvía un objeto (to-one); tras 0243 es to-many y devuelve un ARRAY. Los dos
sitios (`getClients` y `getClientById`, lib/db/queries/clients.ts) lo normalizan
con `withPrimaryPreference` (lib/db/row-types.ts), que deja la fila principal
como objeto, así que `ClientWithRelations.client_preferences` y el adaptador no
cambian. `scripts/check-client-preferences-usage.mjs` (`npm run
test:encargos-usage`) falla si hay una consulta sin `is_primary` o un embed sin
normalizar. Las escrituras (update/insert/lookup) apuntan a la fila principal.

## Migración 0244 (cambio de principal atómico)

`supabase/migrations/0244_make_encargo_primary.sql`: función
`make_encargo_primary(p_encargo_id uuid) returns uuid` (plpgsql, una
transacción). Bloquea las filas del cliente, rechaza (`P0001`:
`ENCARGO_NO_EXISTE`, `ENCARGO_NO_ACTIVO`, `CLIENTE_NO_ES`) si el encargo no
existe, no está activo o el cliente no es de España, quita `is_primary` al
actual y lo pone al nuevo. `execute` solo para `service_role`. Reversión:
`rollback-0244.sql` (borra la función, sin pérdida de datos).

## Migración 0245 (aviso atómico)

`supabase/migrations/0245_encargo_notify_atomic.sql`: función
`claim_and_notify_encargo_matches(match_ids, recipients, title, body, link, data) returns int`:
en una transacción reclama las filas pendientes de `encargo_matches` y crea un aviso
`encargo_match` por destinatario (o nada si falla algo o no hay destinatarios). Añade
`encargo_matches.reasons jsonb`. `execute` solo para `service_role`. Reversión: `rollback-0245.sql`.

## Orden de puesta en marcha (importante)

1. Desplegar (migraciones 0243-0245).
2. Ejecutar `scripts/seed-encargo-baseline.mts` con `--yes` (precarga el stock como visto, sin avisos,
   y, si aún no existe, fija la marca del cron en «ahora − 15 min»).
3. Solo entonces instalar el crontab de `/api/cron/encargo-matches`. Si el cron arrancara antes, su
   primera ejecución solo inicializa la marca y lo creado entre medias no se evaluaría.

## Cómo verificar

```bash
PATH=/opt/node22-standalone/bin:$PATH bash scripts/test-encargos-migration.sh
```

Levanta un Postgres desechable (`encargos-pg-test`, puerto 54999) con el esquema
volcado en solo lectura de `supabase-db`, aplica 0243, 0244 y 0245 dos veces cada una, comprueba
datos previos, PK, índice parcial, duplicados de `encargo_matches` y el
rollback, y borra el contenedor al terminar. Nunca escribe en `supabase-db`.

El runner `scripts/apply-migrations.sh` aplica solo los `.sql` nuevos de
`supabase/migrations/`; el fichero no necesita registro.

## Cómo revertir

`docs/changes/2026-11-06-encargos-matching/rollback-0243.sql`, ejecutado por una
persona con psql. Solo es válido con una fila por cliente: si hay más, aborta
con un mensaje y no cambia nada. Borra `encargo_matches` y las columnas nuevas
(pérdida de esos datos) y devuelve la PK a `client_id`.

## Despliegue

Nada de esto se despliega ni se aplica en producción hasta que el dueño lo
apruebe. Un merge a `main` puede aplicar la migración (`apply-migrations.sh`),
así que el merge lo decide el dueño.
