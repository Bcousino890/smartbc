# Supabase setup

## Cómo aplicar el schema (primera vez)

1. Abrir el proyecto en https://supabase.com → **SQL Editor** (icono de terminal en la barra lateral)
2. Click en **+ New query**
3. Copiar el contenido completo de `migrations/0001_init.sql` y pegarlo
4. Click en **Run** (o `Cmd+Enter`). Debe terminar sin errores.
5. Repetir el proceso con `seed.sql` (catálogo inicial de tags y agencias ejemplo).

## Crear primer admin

Después de aplicar el schema, registrar el usuario admin:

1. Authentication → Users → **Add user** → "Create new user"
2. Email + contraseña (la contraseña se puede resetear luego)
3. Confirmar el email automáticamente: marcar **Auto confirm user**
4. Una vez creado, ir a **Table editor** → `profiles` → buscar el registro recién creado → editar `role` → `admin`

## Estructura

- `migrations/0001_init.sql` — schema base (tablas, enums, índices, RLS, storage)
- `migrations/0002_phase3a_filters.sql` — filtros y campos extras Fase 3a
- `migrations/0003_sale_agreed_commission.sql` — comisión acordada de venta
- `migrations/0004_client_create_own_conversation.sql` — política RLS para conversaciones
- `migrations/0005_phase4_syndication.sql` — infraestructura de sindicación (Fase 4): `agency_feeds`, `sync_logs`, enums `sync_status`/`feed_health`, columna `properties.source_url`
- `seed.sql` — datos iniciales (catálogo de tags, agencias ejemplo)

## Re-aplicar tras cambios

Por ahora cada migración se ejecuta manualmente desde el SQL Editor. Si en el futuro quieres usar Supabase CLI con `supabase db push`, los archivos están listos para migrarse.

## Fase 4 · Sindicación

Para arrancar la sincronización de propiedades desde webs de agencias:

1. Aplicar la migración `0005_phase4_syndication.sql` en el SQL Editor.
2. Añadir `CRON_SECRET=<string aleatorio>` a `.env.local` (ya está en `.env.example`).
3. Desde el panel admin → **Sindicación** → **Nuevo feed** → seleccionar agencia + scraper.
4. El scraper `_test` devuelve 3 propiedades fake y sirve para validar el motor end-to-end sin tocar HTML real (útil mientras se desarrollan scrapers reales en Fase 5).
5. Sincronización automática: Vercel Cron está configurado en `vercel.json` para llamar a `/api/cron/sync` cada 6 horas. En local, se puede disparar manualmente con `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3137/api/cron/sync`.

