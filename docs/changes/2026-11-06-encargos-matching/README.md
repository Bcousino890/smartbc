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

## Cómo verificar

```bash
PATH=/opt/node22-standalone/bin:$PATH bash scripts/test-encargos-migration.sh
```

Levanta un Postgres desechable (`encargos-pg-test`, puerto 54999) con el esquema
volcado en solo lectura de `supabase-db`, aplica 0243 dos veces, comprueba
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
