# Alcance por sección (Ver / Editar × Todo / Solo lo suyo)

Documento para el dueño y para quien mantenga el código. Rama `feat/permisos-alcance`. Plan: `docs/superpowers/plans/2026-10-20-permisos-alcance-ver-editar.md`.

## 1. Modelo

Cada sección con registros personales tiene dos alcances independientes:

| Alcance | Valores | Significado |
|---|---|---|
| **Ver** | Todo / Solo lo suyo | Qué registros aparecen en listados y fichas |
| **Editar** | Todo / Solo lo suyo | Sobre qué registros puede cambiar, eliminar o publicar |

Reglas:

- **Editar nunca es más amplio que Ver.** Si Ver = «Solo lo suyo», Editar queda en «Solo lo suyo» (la UI lo bloquea y la API lo rechaza o normaliza).
- **Los valores por defecto vienen del perfil** (`getViewRestriction`: `all` → Todo, el resto → Solo lo suyo; Editar = Ver). En base de datos solo se guardan las **diferencias** respecto al perfil.
- Las excepciones pueden ser **globales** o **por país** (`es` / `cl`); la del país gana. Sin país en la llamada solo cuentan las globales.
- El alcance no sustituye al permiso de la acción (`ver`, `editar`, `crear`...): primero se comprueba el permiso y después el alcance.

### Qué es «lo suyo» en cada sección

| Sección | «Lo suyo» |
|---|---|
| Clientes | Clientes asignados a la persona (`assigned_advisor`) |
| Solicitudes y visitas | Leads asignados a la persona; los leads sin dueño cuentan como de todos (cola sin asignar). Las visitas se acotan por su cliente |
| Documentación | Solicitudes de documentos de sus clientes asignados |
| Colecciones de visitas | Las de sus clientes asignados (también enlaces de portales y shortlists) |
| Captaciones (Chile) | Asignadas o creadas por la persona (más las reglas propias del rol: `confirmed_and_own`, `assigned_only`...) |

### Mapa acción → alcance

| Acción | Alcance que se comprueba |
|---|---|
| ver, exportar | Ver |
| editar, eliminar, publicar | Editar |
| crear | Ninguno (sin alcance; en colecciones se exige Ver sobre el cliente) |

## 2. Arquitectura

- `lib/permissions-scope.ts`: modelo puro (sin `server-only`): `defaultScopes`, `applyScopeOverrides`, `resolveRestriction`, `resolveCaptacionRestriction`, `validateScopeOverrides`, `isEscalation`, `planScopeChanges`, `buildScopeOverrides`. Pruebas: `npm run test:permission-scope`.
- `lib/db/queries/view-scope.ts`: `resolveViewScope(resource, kind, country?)`, `canActOnClient(clientId, resource, kind, country?)` (si no se pasa país usa el del cliente) y `canActOnLead` / `canActOnLeads`.
- `lib/db/queries/permissions.ts`: `getScopeOverrides` (devuelve `[]` si la tabla no existe) y `getEffectiveScopes`.
- Tabla `user_scope_overrides` (migración `supabase/migrations/0216_user_scope_overrides.sql`): `user_id`, `resource`, `kind` (`view`/`edit`), `scope` (`all`/`own`), `country` nulo o `es`/`cl`. RLS activa sin políticas: solo service role. Test SQL: `scripts/sql-tests/0216_user_scope_overrides.test.sql`.
- API `app/api/admin/usuarios/[id]/permissions/route.ts`:
  - `GET` devuelve `scopes` (efectivos, admite `?country=`) y `scopeDefaults` (del perfil).
  - `POST` acepta `scopeOverrides`: el cliente envía el conjunto **completo**; el servidor reemplaza las filas del subconjunto (país) afectado. Sin `scopeOverrides` no toca nada. 400 si es inválido (p. ej. Ver `own` + Editar `all`), 403 si intenta conceder más alcance del que tiene quien edita.
- Panel: `components/admin/permissions/{permission-matrix,permissions-drawer,permission-details}` con chips «Todo / Solo lo suyo» bajo Ver y Editar, punto dorado si difiere del perfil.
- Documentación pasa a ser permiso propio (`documentacion`) y ya no cuelga de Solicitudes: `lib/property-applications/staff-access.ts` y `staff-gate.ts`.

## 3. Qué cubre la fase 1

Clientes, Solicitudes y visitas, Documentación, Colecciones de visitas (con enlaces de portales y shortlists) y Captaciones.

**No cubre (fase 2):** Calendario, Mensajes, Propiedades y Particulares. Tampoco las secciones sin registros personales (configuración, usuarios, etc.): ahí solo existe el permiso de la acción.

## 4. Cambios de comportamiento a confirmar

Del plan:

1. «Asesor · solo su cartera» (`agent_senior` / `agent_junior`) antes solo tenía filtrados los listados: podía abrir por URL la ficha de un cliente ajeno y editar solicitudes, colecciones o captaciones ajenas. Ahora no (Editar = Ver del perfil por defecto).
2. Documentación deja de colgar de «Solicitudes y visitas»: quien tenga Solicitudes › Ver activo y Documentación › Ver apagado pierde la pantalla (ver consulta previa en la sección 6).
3. Clientes y Documentación respetan las excepciones por persona (antes solo miraban el rol).

Encontrados durante la revisión:

4. `agent_junior` pierde verificar, analizar y subida automática de documentos (su matriz tiene `documentacion.edit = false`).
5. Los roles `agent_junior` y `agent` legado pierden listings, broker-check y scrape sobre captaciones ajenas.
6. El personal no puede aprobar, rechazar, reabrir, actualizar ni recalcular su **propia** solicitud de documentos (evita la auto-aprobación). No afecta a los clientes.
7. Un asesor restringido a «Solo lo suyo» no puede quitar ni reasignar leads de otros; sí puede coger leads sin dueño. Tampoco puede reasignar clientes ajenos ni «tomar» un cliente sin asignar.
8. Un administrador con excepción Editar = «Solo lo suyo» no reasigna ni borra captaciones ajenas.
9. Se conserva que un perfil con permiso de cambio de estado mueva o convierta captaciones **confirmadas** ajenas, pero solo si son visibles por su regla de Ver. La excepción vale para cualquier actor con Ver que la permita, no solo para senior.

## 5. Límites conocidos (pendientes, no bloquean)

- La lista y página de Documentación **no** se filtra por país: un usuario con excepción por país ve solicitudes de otros países en esa pantalla (como hoy). Decisión del dueño.
- `getClientStats` cuenta de forma global para alcance «Solo lo suyo»; `clientes/search` no recibe país.
- `assertPermission` no recibe país; el rol por país no se usa en los valores por defecto del alcance (solo el rol global del perfil, salvo en Captaciones).
- `DELETE /api/admin/cl/captaciones/[id]` usa el rol global en `canAccess(delete)`.
- `co-applicants/route` sin gate de alcance; `getClientApplications` va bajo `clientes.view`; `documents/upload` usa una lista local de 5 roles (el límite real es la RLS de `getApplicationById`, como antes).
- `convertLeadToClient` y `confirmPrepareVisits` con `existingClientId`: se exige el alcance de colecciones, no `clientes` Editar.
- `createItineraryFromShortlist` escribe selecciones con solo alcance Ver (decisión: crear → Ver). `getClientCountry` no falla cerrado ante un error de lectura.
- Acciones masivas de leads descartan en silencio los ids fuera de alcance. `canActOnLead` devuelve `false` si el lead no existe.
- `updateCaptacionData` (sin uso ni gate; conviene borrarla). `GET contacts` de captaciones se gatea con Editar en vez de Ver. `captacionMatchesView` sin país.
- Lead sin dueño con Editar «Solo lo suyo»: editable por todos (coherente con la cola sin asignar).
- Un clic en Ver → «Solo lo suyo» cuenta como 2 excepciones (Ver y Editar). Si se apaga el interruptor de un recurso, su excepción de alcance queda oculta pero guardada.
- Panel: ids duplicados `scope-lock-*` (tabla y móvil a la vez en el DOM), chip táctil pequeño (~24 px), `text-xs` en lugar de 11 px; la descripción de `captaciones.view` aún dice «según el perfil» en algún texto.
- Auditoría de permisos: registra el input, no el estado resultante. `created_by` de la tabla sin `ON DELETE`.
- El guardado no es atómico (primero permisos, luego alcance); un fallo intermedio deja permisos guardados y alcance sin cambiar.
- `npm run test:typography` ya falla en `main` por otros archivos (no por esta rama).

## 6. Lista de activación

### 6.1 Antes de fusionar (lo ejecuta el DUEÑO, no el agente)

Personas con Solicitudes › Ver activo y Documentación › Ver apagado por excepción individual (perderían la pantalla de Documentación):

```sql
SELECT s.user_id
FROM user_permission_overrides s
JOIN user_permission_overrides d
  ON d.user_id = s.user_id AND d.country IS NOT DISTINCT FROM s.country
WHERE s.resource = 'solicitudes' AND s.action = 'view' AND s.allowed
  AND d.resource = 'documentacion' AND d.action = 'view' AND NOT d.allowed;
```

Perfiles personalizados con el mismo patrón (tabla `custom_roles`, columnas `label` y `matrix`, ver migración 0090):

```sql
SELECT id, label
FROM custom_roles
WHERE matrix->'solicitudes'->>'view' = 'true'
  AND matrix->'documentacion'->>'view' = 'false';
```

Si devuelve filas, decidir si esas personas deben conservar Documentación (activarles `documentacion › Ver` antes de fusionar).

### 6.2 Migración

`0216_user_scope_overrides.sql` se aplica sola en el despliegue. Es aditiva e idempotente (`CREATE TABLE/INDEX IF NOT EXISTS`); no toca datos existentes.

### 6.3 Cómo deshacer

- Vaciar `user_scope_overrides` (`DELETE FROM user_scope_overrides;`) devuelve los valores por defecto de cada perfil (que ya incluyen el cierre de Editar = Ver para `agent_senior`/`agent_junior`).
- La app tolera que la tabla no exista (`getScopeOverrides` devuelve `[]`).
- Para revertir también el cierre por defecto o la separación de Documentación hay que volver a la versión anterior del código.

### 6.4 Comprobaciones manuales tras desplegar

1. Usuarios → Permisos de un asesor de prueba: Clientes › Ver = «Solo lo suyo», guardar, recargar: el chip persiste y Editar queda bloqueado en «Solo lo suyo».
2. Como ese asesor: el listado de clientes solo muestra los suyos; abrir por URL la ficha de un cliente **no asignado** da 404; editar uno ajeno por acción da «No tienes acceso a este cliente».
3. Con Ver = Todo y Editar = «Solo lo suyo»: ve todos, pero no puede editar los ajenos.
4. Solicitudes: un lead ajeno no se puede reasignar ni descartar; uno sin dueño sí se puede coger.
5. Documentación: sin el permiso la entrada del menú desaparece; con él, aprobar la solicitud de un cliente ajeno falla.
6. Captaciones (Chile): abrir una ajena por URL da 404 para un perfil restringido.
7. Excepción por país: crear una en `es` y comprobar que no afecta a `cl`.
8. Un asesor con cero clientes asignados y «Solo lo suyo»: listados vacíos, sin error.
9. Administrador: intentar conceder a otro más alcance del que tiene uno mismo devuelve 403.
