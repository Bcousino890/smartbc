# Roles visibles del equipo y acceso de las cuentas

Fecha: 2026-10-17 · Ramas: `fix/rls-cuentas` (urgente) y `feat/permisos-modelo-roles` · **Nada de esto está en producción todavía.**

Este documento recoge lo que cambia, cómo activarlo, cómo deshacerlo y qué queda pendiente. El modelo de permisos completo (3 roles, rol por país, alcance, motor único) está en `PERMISOS_MODELO_3_ROLES.md` y `PERMISOS_PLAN_IMPLEMENTACION.md`; esos dos ficheros no están en el repositorio. Lo de aquí **manda** sobre ellos donde difieran.

## 0. Lo primero: agujeros de seguridad que ya existían (rama `fix/rls-cuentas`)

Los encontraron dos revisiones independientes de los cambios de roles; los confirmé leyendo las migraciones y los reproduje en un Postgres desechable (`scripts/sql-tests/0210_endurecer_cuentas.test.sql`: ejecuta cada ataque antes y después). **Conviene desplegarla antes que nada, aparte del resto.**

| # | Qué se podía hacer | Causa | Migración `0210` |
|---|---|---|---|
| 1 | **Sin iniciar sesión**, con la clave anónima (pública), fijar la contraseña de **cualquier** cuenta, también la del Propietario | `password_reset_tokens` tiene políticas `USING (true)` / `WITH CHECK (true)` sin limitar el rol (0030): se inserta un token falso a nombre de la víctima y se canjea en `/api/auth/reset-password`, que solo comprueba el token. Además un administrador podía leer los tokens recién generados | Se borran todas las políticas y los privilegios de `anon`/`authenticated`: la app solo usa la service role |
| 2 | **Cualquier usuario con sesión, también un cliente, ponerse `role = 'owner'`**, o cambiarse países, rol personalizado, asesor asignado o correo | `profiles_update` (0045) no tiene `WITH CHECK`: Postgres reutiliza el `USING` | Un disparador impide que sesiones de usuario cambien esas columnas o creen perfiles que no sean de cliente. La service role, GoTrue, `handle_new_user` y psql siguen pudiendo |
| 3 | **Escribir roles por país o excepciones de permisos de cualquier usuario** (el rol por país gana sobre `profiles.role`) | `profiles_country_roles`, `custom_roles`, `user_permission_overrides` y `permission_audit_log` no tenían RLS | RLS sin políticas (la app las usa siempre con la service role) |

| 4 | **Registrarse como Propietario**: un alta con `data: {"role": "owner"}` en `/auth/v1/signup` creaba un perfil de Propietario (si el registro de GoTrue está abierto) | `handle_new_user` (0044) toma el rol de los metadatos que elige quien se registra | El perfil nace siempre como cliente; ninguna ruta pasa `role` en los metadatos |
| 5 | **Impedir que se aplique la propia migración, o bloquear todos los despliegues**, con la clave anónima | `schema_migrations` (la tabla de control del runner) se creaba sin RLS: una fila falsa `0210_endurecer_cuentas.sql` la daba por aplicada, y borrar `0001_init.sql` hacía fallar el siguiente despliegue | `scripts/apply-migrations.sh` la deja con RLS y sin privilegios para anon/authenticated en cada ejecución |
| 6 | Crear perfiles de otra persona, o con rol personalizado / asesor asignado / varios países, con una sesión de usuario | Funciones SECURITY DEFINER ejecutables por cualquiera (`create_user_profile`, `fix_missing_admin_profiles`, `cleanup_password_reset_tokens`) y un disparador de inserción que solo vigilaba `role` | Se les quita EXECUTE a PUBLIC/anon/authenticated y el disparador vigila también esas columnas |

La migración es idempotente, toca cada tabla solo si existe, y se probó **antes y después**: antes los ataques funcionan; después quedan cerrados y lo legítimo (el cliente editando su nombre y teléfono, reenviar el mismo rol, la service role, el alta por disparador) sigue funcionando.

**Dos cosas que solo puedes hacer tú en el servidor:**
1. **Comprobar si el registro de GoTrue está abierto:** `docker exec supabase-auth printenv GOTRUE_DISABLE_SIGNUP`. Si dice `false` (o nada), cualquiera puede crearse una cuenta de cliente. Con la 0210 ya no obtiene rol de equipo, pero la aplicación no usa el registro público (no hay ningún `signUp` en el código): lo normal es `GOTRUE_DISABLE_SIGNUP=true`. Es una decisión tuya.
2. **Comprobar que la migración se aplicó de verdad**, no que se dio por aplicada: `select version, applied_at from schema_migrations where version in ('0210_endurecer_cuentas.sql','0211_profiles_suspension.sql');` las fechas deben ser las del despliegue. Si no lo son (alguien pudo insertar la fila antes), aplícala a mano: `docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0210_endurecer_cuentas.sql`

**Qué comprobar tras desplegarla:** `select policyname from pg_policies where tablename = 'password_reset_tokens';` debe devolver 0 filas; entrar en el panel, «Olvidé mi contraseña» con una cuenta de prueba (el correo llega y el enlace funciona), editar el nombre desde «Mi perfil» de un cliente, y crear/editar un usuario desde Usuarios.

**Lo que esta migración NO hace** y sigue abierto: `profiles_select USING (true)` deja que cualquiera con la clave anónima **lea todos los perfiles** (correo, teléfono, rol de cada persona, clientes incluidos). Está marcado como «TODO endurecer» en la propia migración 0045. Arreglarlo exige revisar qué lecturas de perfiles hacen las páginas públicas y el portal del cliente con sesión de usuario; probarlo a ciegas rompería pantallas. **Es lo siguiente más grave.**

## 1. Qué decidió el dueño

Solo quedan tres roles de equipo: **Administrador, Asesor y Captadora (esta, solo en Chile)**.

- La captadora **no** pasa a «Asesor con excepciones»: se mantiene como rol propio, con acceso solo a Chile y solo a las Captaciones que se le asignan.
- Los roles internos de la base de datos **no se migran**. El tipo `user_role` de Postgres no puede perder valores, y reescribir los permisos de cada persona sin revisarlos uno a uno daría o quitaría acceso por sorpresa. Cambian lo que se ve y lo que se puede asignar (`lib/auth/role-model.ts`):

| Rol interno | Se ve como | ¿Se asigna desde la aplicación? |
|---|---|---|
| `owner` | Propietario (dentro de «Administradores») | No: es la cuenta del dueño |
| `admin` | Administrador | Sí, solo el Propietario |
| `agent_admin` | Administrador · acceso limitado (heredado) | No: quien lo tiene lo conserva |
| `advisor` | Asesor · toda la cartera | Sí |
| `agent_senior` | Asesor · solo su cartera | Sí |
| `agent_junior` | Asesor · solo lectura (heredado) | No: quien lo tiene lo conserva |
| `captadora` | Captadora · solo Chile | Sí |

- **El Asesor tiene dos perfiles** (toda la cartera / solo su cartera). Es lo que cada uno ya tiene hoy, así que **nadie gana ni pierde acceso** por esto. Se ajusta permiso a permiso desde «Permisos».
- **Convertir un perfil heredado** (`agent_admin` o `agent_junior`) es una decisión por persona: el Propietario la toma desde «Editar» eligiendo el perfil nuevo. Pasar un `agent_admin` a Administrador le **da más acceso** (el Administrador tiene todo salvo secretos): conviene mirarlo uno a uno.

## 2. Qué incluye la rama `feat/permisos-modelo-roles`

| Cambio | Dónde |
|---|---|
| Pantalla de Usuarios con tres grupos (Administradores, Asesores, Captadoras) más Clientes y Otros; desaparece «Agentes Inmobiliarios». Ya no sale la palabra «agente» en la barra lateral ni en Captaciones | `usuarios-client.tsx`, `dictionary.ts` |
| Al crear un Asesor se elige «toda la cartera» o «solo su cartera»; la captadora se crea fija en Chile | `usuarios-client.tsx`, `usuarios/create` |
| Solo se asignan Administrador, Asesor (dos perfiles), Captadora y cliente; nunca Propietario ni perfiles heredados | `lib/auth/user-rank.ts` |
| La captadora se guarda con Chile; con España o con los dos países se rechaza. Al pasar una cuenta a Captadora se borran sus roles por país y su rol personalizado (ganaban sobre el rol de la cuenta); una captadora no puede tener rol por país, ni «captadora» se asigna por país | `lib/auth/role-model.ts`, `usuarios/update` |
| **Nadie fija la contraseña de otra persona.** `usuarios/update` rechaza `password` si no es la cuenta propia; a las demás se les envía un enlace (24 h, no se devuelve ni se audita, un envío por cuenta y minuto, no a correos internos de clientes sin email) | `usuarios/update`, `usuarios/[id]/reset-password` |
| **Crear una cuenta de equipo ya no pide contraseña:** se crea con una aleatoria que nadie conoce y se envía a la persona un enlace (7 días) para que elija la suya. Si el correo no sale, la cuenta existe y se reenvía desde «Editar» | `usuarios/create`, `lib/email/password-reset.ts` |
| **Suspender y reactivar cuentas** sin borrar nada: banea en GoTrue, marca `profiles.suspended_at`, **cierra sus sesiones abiertas** y el login dice «cuenta suspendida». Funciona también para clientes. Repetir la petición arregla una cuenta que quedó a medias | `usuarios/[id]/suspend`, migración `0211`, `middleware.ts`, `getCurrentProfile()`, `lib/db/auth-helpers.ts` |
| Cambiar el correo de una cuenta deja rastro en el historial (quién, de qué a qué) | `usuarios/update`, `permission_audit_log` |
| El CI ejecuta las pruebas de permisos | `.github/workflows/ci.yml` |

Corrige además dos fallos que ya existían: editar una captadora desde Usuarios la convertía en «Visualizador», y los asesores de «solo su cartera» no salían en el selector «Asignado a» al crear un cliente.

**Sobre la suspensión y las sesiones.** Al suspender se borran sus sesiones en GoTrue, que (en la versión de este servidor, 2.186) comprueba en cada petición que la sesión del token existe: desde ese instante el panel, las páginas y las rutas de API deberían dejar de reconocer a la persona. **No se ha podido probar contra el GoTrue real**; el punto 4 de la lista de comprobaciones de abajo lo verifica. La **API de datos (PostgREST)** solo valida la firma del token, no la sesión: una cuenta suspendida podría seguir leyendo y escribiendo lo que sus políticas de base de datos le permitan hasta que caduque el token (como máximo una hora). Cerrarlo del todo exigiría que las políticas conozcan la suspensión (`is_staff()`/`is_admin()`), que no se ha tocado.

## 3. Cómo se activa

Orden recomendado (cada paso se despliega solo al mergear a `main`; **de uno en uno**, esperando a que la web responda):

1. **`fix/rls-cuentas`** (migración `0210`): antes que nada. Copia de la base antes: `/opt/backup-db.sh`.
2. Los 7 PR de la vía 1 de `PERMISOS_ORDEN_DE_MERGE.md`.
3. **`feat/permisos-modelo-roles`** (migración `0211`): la última; incluye las 7 anteriores, así que GitHub solo enseñará los commits nuevos. Es aditiva e idempotente. El despliegue **no depende del orden** entre código y migración: el middleware y los helpers de sesión repiten la consulta sin `suspended_at` si la columna aún no existe, y la ruta de suspensión contesta 503 «falta aplicar la migración 0211» en vez de fallar a medias.

### Qué comprobar después de desplegar `feat/permisos-modelo-roles`
1. `/es/admin/usuarios`: se ven Administradores, Asesores y Clientes (y Captadoras si hay alguna); no hay «Agentes Inmobiliarios».
2. En `/cl/admin/usuarios`: «Crear captadora» abre un formulario sin selector de países; guardar una captadora existente no la cambia a «Visualizador».
3. **Crear un Asesor de prueba** con «Solo su cartera» y un correo tuyo: no pide contraseña, llega el correo con el enlace y se puede elegir. Luego, desde «Editar», **enviar el enlace** otra vez: llega, y el panel no muestra ninguna contraseña.
4. **Suspender** esa cuenta con una sesión abierta en otro navegador: la sesión cae en la siguiente carga, el login dice «cuenta suspendida». **Reactivar** y comprobar que entra.
5. Un Administrador no ve «Acceso de la cuenta» al editar a otro Administrador o al Propietario.

## 4. Cómo se deshace

- **Código:** revertir el merge de la rama. Las columnas, el disparador y la función de `0211` pueden quedarse: sin código que los use no hacen nada. `0210` no debería revertirse (cierra los agujeros); si diera problemas con algún `UPDATE` de `profiles`: `drop trigger if exists profiles_protect_privileged on profiles;`
- **Si una cuenta quedó suspendida por error y no se puede reactivar desde la pantalla** (psql dentro de `supabase-db`):
  ```sql
  update profiles set suspended_at = null where email = 'persona@bcousinoprop.com';
  update auth.users set banned_until = null where email = 'persona@bcousinoprop.com';
  ```

## 5. Qué NO está hecho (sigue pendiente)

- **`profiles_select USING (true)`** (ver sección 0): cualquiera con la clave anónima lee todos los perfiles. Lo más urgente que queda.
- **Otras tablas con datos privados sin RLS en ninguna migración** (la segunda revisión las lista; confírmalo con la consulta 2 del SQL de verificación): `team_messages`, `team_direct_messages`, `team_direct_conversations`, `contact_requests`, `client_shortlists` y `client_shortlist_items`, `zinto_crm_notes`, `property_history`. Mismo patrón que el agujero 3: con los privilegios por defecto de Supabase, cualquiera con la clave anónima podría leerlas o escribirlas. No se han tocado: hay que comprobar antes que ninguna pantalla las lea con una sesión de usuario.
- **La jerarquía de cuentas** (`canManageUser`, `canSuspendUser`, `canResetPassword`) mira solo `profiles.role`, no el rol por país ni el rol personalizado: una persona con rol por país heredado `agent_admin` la gestiona un Administrador del mismo rango.
- **Resultado del SQL de verificación** (`PERMISOS_VERIFICACION_BD.sql`): sin él no se sabe quién es Propietario en la base real, y sirve para confirmar que `0210` quedó aplicada tal como se probó.
- **`ADMIN_EMAILS` y el correo fijo en el login** (`app/(auth)/actions.ts`): al entrar, una cuenta cuyo correo esté en la lista se «asciende» a `admin` si su rol no es ya `admin`, lo que **degradaría a un `owner`** con ese correo; y la lista de roles de staff del login no incluye `owner` ni `captadora` (el middleware lo arregla redirigiendo, pero es frágil). No se ha tocado: hay que confirmar antes quién es Propietario en la base.
- **Cambiar el correo de una cuenta de rango inferior** lo puede hacer quien la administra y, con el enlace de restablecimiento, entrar como esa persona. Ahora queda en el historial, pero **no se avisa a la persona** (ni al correo anterior).
- **Dos rutas antiguas de Zinto** (`api/admin/zinto/conversations/**`) validan el token directamente y no pasan por `getCurrentProfile()`; con la sesión cerrada al suspender deberían dejar de funcionar, pero no comprueban la suspensión por sí mismas.
- **Rol por país con matriz propia, alcance «todo / solo lo suyo» como excepción editable, motor único de permisos** (Fases 1 a 5 del plan): sin empezar. Hoy el alcance depende del perfil (`advisor` ve todo, `agent_senior` solo lo suyo).
- **Perfiles heredados:** decidir, persona a persona, qué pasa con los `agent_admin` y `agent_junior` que existan (consulta 7 del SQL de verificación).
- Las pruebas de las rutas (`usuarios/*`) se limitan a las reglas puras (`role-model`, `user-rank`); la lógica de cada ruta está revisada pero no tiene prueba automática.
