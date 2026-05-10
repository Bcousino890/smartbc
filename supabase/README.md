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

- `migrations/0001_init.sql` — schema completo (tablas, enums, índices, RLS, storage)
- `seed.sql` — datos iniciales (catálogo de tags, agencias ejemplo)

## Re-aplicar tras cambios

Por ahora cada migración se ejecuta manualmente desde el SQL Editor. Si en el futuro quieres usar Supabase CLI con `supabase db push`, los archivos están listos para migrarse.
