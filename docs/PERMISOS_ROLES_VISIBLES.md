# Roles visibles del equipo y acceso de las cuentas

Fecha: 2026-10-17 · Rama: `feat/permisos-modelo-roles` · **Nada de esto está en producción todavía.**

Este documento recoge lo que cambia con esa rama, cómo activarlo, cómo deshacerlo y qué queda pendiente. El modelo de permisos completo (3 roles, rol por país, alcance, motor único) está descrito en `PERMISOS_MODELO_3_ROLES.md` y `PERMISOS_PLAN_IMPLEMENTACION.md`; esos dos ficheros no están en el repositorio. Lo de aquí **manda** sobre ellos donde difieran.

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

- **El Asesor tiene dos perfiles** (toda la cartera / solo su cartera). Es lo que cada uno ya tiene hoy, así que **nadie gana ni pierde acceso** con esta rama. Se ajusta permiso a permiso desde «Permisos».
- **Convertir un perfil heredado** (`agent_admin` o `agent_junior`) es una decisión por persona: el Propietario la toma desde «Editar» eligiendo el perfil nuevo. Pasar un `agent_admin` a Administrador le **da más acceso** (el Administrador tiene todo salvo secretos): conviene mirarlo uno a uno.

## 2. Qué incluye la rama

| Cambio | Dónde |
|---|---|
| Pantalla de Usuarios con tres grupos (Administradores, Asesores, Captadoras) más Clientes y Otros; desaparece «Agentes Inmobiliarios» | `usuarios-client.tsx` |
| Al crear un Asesor se elige «toda la cartera» o «solo su cartera»; la captadora se crea fija en Chile | `usuarios-client.tsx`, `usuarios/create` |
| Solo se asignan Administrador, Asesor (dos perfiles), Captadora y cliente; nunca Propietario ni perfiles heredados | `lib/auth/user-rank.ts` |
| La captadora se guarda con Chile; con España se rechaza (no se recorta en silencio) | `lib/auth/role-model.ts`, `usuarios/create`, `usuarios/update` |
| **Nadie fija la contraseña de otra persona**; se le envía un enlace (24 h, no se devuelve ni se audita, un envío por cuenta y minuto) | `usuarios/update`, `usuarios/[id]/reset-password` |
| **Suspender y reactivar cuentas** sin borrar nada; el login dice «cuenta suspendida» | `usuarios/[id]/suspend`, migración `0210`, `middleware.ts`, `getCurrentProfile()` |

Corrige además dos fallos que ya existían: editar una captadora desde Usuarios la convertía en «Visualizador» (el adaptador no conocía el rol), y los asesores de «solo su cartera» no salían en el selector «Asignado a» al crear un cliente.

## 3. Cómo se activa

1. Esta rama incluye las 7 de la vía 1 de `PERMISOS_ORDEN_DE_MERGE.md` y depende de ellas (el middleware, `user-rank` y las rutas de usuarios). **Se mergea la última**, cuando las 7 estén en `main`; entonces GitHub solo enseña los commits nuevos.
2. **Migración `0210`** (columnas `suspended_at`, `suspended_by`, `suspended_reason` y un disparador). Es aditiva e idempotente y la aplica el autodeploy. Antes de mergear, copia de la base: `/opt/backup-db.sh`.
3. El despliegue **no depende del orden** entre código y migración: el middleware reintenta la consulta sin `suspended_at` si la columna aún no existe, y la ruta de suspensión contesta 503 «falta aplicar la migración 0210» en vez de fallar a medias.

### Qué comprobar después de desplegar
1. `/es/admin/usuarios`: se ven Administradores, Asesores y Clientes (y Captadoras si hay alguna); no hay «Agentes Inmobiliarios».
2. En `/cl/admin/usuarios`: «Crear captadora» abre un formulario sin selector de países; guardar una captadora existente no la cambia a «Visualizador».
3. Crear un Asesor de prueba con «Solo su cartera»; luego, desde «Editar» (acceso de la cuenta), **enviar el enlace** a un correo tuyo: llega, se puede elegir contraseña, y el panel no la muestra.
4. **Suspender** esa cuenta de prueba: no puede entrar (el login dice «cuenta suspendida») y, si tenía una sesión abierta, vuelve al login. **Reactivar** y comprobar que entra.
5. Un Administrador no ve «Acceso de la cuenta» al editar a otro Administrador o al Propietario.

## 4. Cómo se deshace

- **Código:** revertir el merge de la rama. Las columnas `suspended_*` y el disparador pueden quedarse: sin código que las use no hacen nada.
- **Si una cuenta quedó suspendida por error y no se puede reactivar desde la pantalla** (psql dentro de `supabase-db`):
  ```sql
  update profiles set suspended_at = null, suspended_by = null, suspended_reason = null where email = 'persona@bcousinoprop.com';
  update auth.users set banned_until = null where email = 'persona@bcousinoprop.com';
  ```
- **Quitar el disparador** (solo si diera problemas con algún `UPDATE` de `profiles`):
  `drop trigger if exists profiles_protect_suspension on profiles;`

## 5. Qué NO está hecho (sigue pendiente)

- **Resultado del SQL de verificación** (`PERMISOS_VERIFICACION_BD.sql`): sin él no se sabe quién es Propietario en la base real ni si una cuenta puede cambiarse el rol desde la API de datos. El disparador de `0210` protege solo las columnas de suspensión.
- **`ADMIN_EMAILS` y el correo fijo en el login** (`app/(auth)/actions.ts`): al entrar, una cuenta cuyo correo esté en la lista se «asciende» a `admin` si su rol no es ya `admin`, lo que **degradaría a un `owner`** con ese correo; y la lista de roles de staff del login no incluye `owner` ni `captadora` (el middleware lo arregla redirigiendo, pero es frágil). No se ha tocado: hay que confirmar antes quién es Propietario en la base.
- **Dos rutas antiguas de Zinto** (`api/admin/zinto/conversations/**`) leen la sesión sin pasar por `getCurrentProfile()`: una cuenta suspendida podría usarlas hasta que caduque su token (≤ 1 h).
- **Rol por país con matriz propia, alcance «todo / solo lo suyo» como excepción editable, motor único de permisos** (Fases 1 a 5 del plan): sin empezar. Hoy el alcance depende del perfil (`advisor` ve todo, `agent_senior` solo lo suyo).
- **Perfiles heredados:** decidir, persona a persona, qué pasa con los `agent_admin` y `agent_junior` que existan (ver la consulta 7 del SQL de verificación).
- **CI:** el workflow no ejecuta las pruebas de permisos (`test:role-model`, `test:user-rank`, `test:api-guards`, `test:api-session-policy`…).
