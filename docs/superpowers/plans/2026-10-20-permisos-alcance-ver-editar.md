# Alcance por sección (Ver / Editar) en Permisos — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans. Los pasos usan casillas `- [ ]`.

**Objetivo:** que en el panel de Permisos de cada persona se pueda fijar, por sección, si **Ver** y **Editar** alcanzan a «Todo» o «Solo lo suyo» (sus clientes asignados + lo que se le asigna directamente), y que el servidor lo cumpla.

**Arquitectura:** un módulo puro (`lib/permissions-scope.ts`) define el modelo y la resolución; una tabla nueva `user_scope_overrides` guarda solo lo que difiere del perfil (como `user_permission_overrides`); `resolveViewScope` pasa a leerla y aparece un gate de registro (`canActOnClient`, `canActOnLead`) que usan las acciones de edición. El panel añade un selector bajo Ver y bajo Editar.

**Stack:** Next.js (App Router, server actions), TypeScript, PostgreSQL self-hosted, tests `.mts` con `node --experimental-strip-types`.

**Spec:** aprobada en chat el 2026-10-20 (sin documento aparte). Resumen:
- Cada sección con datos «de alguien» tiene dos alcances, Ver y Editar, en `all` | `own`. «Lo suyo» = clientes con `profiles.assigned_advisor_id` = la persona, más lo asignado directamente (captaciones `assigned_to`/`created_by`, leads `assigned_to`) y lo que creó. Se fija por persona y país.
- Exportar sigue a Ver; Eliminar y Publicar siguen a Editar; Crear no tiene alcance. Editar nunca es más amplio que Ver.
- Por defecto se hereda el del perfil; solo se guarda lo que difiere (punto dorado, cuenta como excepción).
- Documentación pasa a ser un permiso real con su propio alcance.
- **Esta fase (1)**: Clientes, Solicitudes y visitas, Documentación, Colecciones de visitas, Captaciones. **Fase 2 (plan aparte)**: Calendario, Mensajes, Propiedades, Particulares. Usuarios, Configuración, Sindicación, Reportes, Agencias, Publicación y Diagnóstico no llevan selector.

## Restricciones globales

- Producción se despliega sola desde `main` y **las migraciones se aplican en el despliegue**: nada a `main` sin PR con CI verde; no empujar ni abrir PR sin que el dueño lo diga. Migración aditiva, idempotente y con RLS activada.
- Política P-1: no ejecutar SQL contra producción ni el VPS. Las pruebas SQL van contra una base desechable (patrón de `scripts/sql-tests/0211_profiles_suspension.test.sql`).
- Rama `feat/permisos-alcance`, worktree `/root/wt-permisos-alcance`. Migración **0216** (0215 la reserva la rama de vigilancia de enlaces).
- Commits: `git -c user.name="Claude Code" -c user.email="noreply@anthropic.com" commit`, mensaje en español acabado en `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Textos de la interfaz en español, sentence case. Tests: `node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-<x>.mts`, enlazados como script `test:<x>` en `package.json` y como paso en `.github/workflows/ci.yml`.
- Sin excepción guardada, el comportamiento es el de hoy, salvo los «Cambios de comportamiento» de abajo.

## Cambios de comportamiento a confirmar al revisar

1. «Asesor · solo su cartera» (`agent_senior`/`agent_junior`) hoy solo tiene filtrados los **listados**: puede abrir por URL la ficha de un cliente ajeno y editar solicitudes, colecciones o captaciones ajenas. Esta fase lo cierra (por defecto Editar = Ver del perfil).
2. Documentación deja de colgar de «Solicitudes y visitas»: quien tenga hoy Solicitudes › Ver activo y Documentación › Ver apagado perderá la pantalla. Antes de fusionar, el dueño ejecuta la consulta de la Tarea 11.
3. Las pantallas Clientes y Documentación pasan a respetar las excepciones por persona (hoy miran solo el rol con `canAccess`).

## Review focus

1. Tabla `user_scope_overrides` aún sin crear: la app sigue con el comportamiento de hoy, sin error.
2. Alcance «Solo lo suyo» con cero clientes asignados: listados vacíos y ficha 404, no error.
3. POST con Ver `own` + Editar `all` → 400; cliente antiguo sin `scopeOverrides` no borra ni cambia filas de alcance.
4. Excepciones por país: las de `es` no afectan a `cl`; sin país solo cuentan las globales.
5. Lead sin dueño (`assigned_to` nulo) con Editar `own`: editable por todos, coherente con la cola sin asignar que ya ve todo el mundo.

## Estructura de archivos

- Crear `lib/permissions-scope.ts` (modelo puro), `scripts/test-permission-scope.mts`, `supabase/migrations/0216_user_scope_overrides.sql`, `scripts/sql-tests/0216_user_scope_overrides.test.sql`, `docs/PERMISOS_ALCANCE.md`.
- Modificar `lib/permissions.ts`, `lib/db/queries/permissions.ts`, `lib/db/queries/view-scope.ts`, `app/api/admin/usuarios/[id]/permissions/route.ts`, `components/admin/permissions/{permission-matrix.tsx,permissions-drawer.tsx,permission-details.ts}`, y los puntos de enforcement de las Tareas 6–10.

---

### Tarea 1: Modelo puro de alcance

**Files:** Create `lib/permissions-scope.ts`, `scripts/test-permission-scope.mts`. Modify `lib/permissions.ts` (en `getViewRestriction`, añadir `documentacion` a `isScopedBusinessData`), `package.json`, `.github/workflows/ci.yml`.

**Interfaces — Produces** (exportado desde `lib/permissions-scope.ts`, sin `server-only`):
```ts
export type ScopeValue = "all" | "own";
export type ScopeKind = "view" | "edit";
export type ScopeCell = { view: ScopeValue; edit: ScopeValue };
export const SCOPED_RESOURCES = ["clientes","solicitudes","documentacion","viewing_collections","captaciones"] as const;
export type ScopedResource = (typeof SCOPED_RESOURCES)[number];
export type ScopeMatrix = Record<ScopedResource, ScopeCell>;
export type ScopeOverride = { resource: string; kind: string; scope: string; country?: string | null };
export type ScopeOverrideInput = { resource: ScopedResource; kind: ScopeKind; scope: ScopeValue };
export const SCOPE_LABELS: Record<ScopeValue, string>; // all:"Todo", own:"Solo lo suyo"
export function isScopedResource(r: string): r is ScopedResource;
export function scopeKindForAction(a: PermissionAction): ScopeKind | null; // view,export→view; edit,delete,publish→edit; create→null
export function normalizeCell(c: ScopeCell): ScopeCell;        // view own ⇒ edit own
export function defaultScopes(role: string): ScopeMatrix;      // desde getViewRestriction: "all"→all, resto→own; edit = view
export function applyScopeOverrides(base: ScopeMatrix, o: ScopeOverride[], country?: string | null): ScopeMatrix; // globales, luego país; ignora desconocidos; normaliza
export function setScopeCell(m: ScopeMatrix, r: ScopedResource, k: ScopeKind, v: ScopeValue): ScopeMatrix; // inmutable; view own fuerza edit own
export function scopeToRestriction(v: ScopeValue): ViewRestriction; // all→"all", own→"own_only"
export function resolveRestriction(role: string, r: ScopedResource, k: ScopeKind, o: ScopeOverride[], country?: string | null): ViewRestriction;
  // legacy = getViewRestriction(role,r); "none"→"none"; si la celda efectiva == la del perfil → legacy; si no → scopeToRestriction
export function resolveCaptacionRestriction(role: string, o: ScopeOverride[]): CaptacionViewRestriction;
  // celda == perfil → getCaptacionViewRestriction(role); all → "all"; own → "own_only"
export function validateScopeOverrides(input: unknown): { ok: true; value: ScopeOverrideInput[] } | { ok: false; error: string };
export function isEscalation(actor: ScopeMatrix, o: ScopeOverrideInput): boolean; // scope "all" y actor[r][k] !== "all"
```

- [ ] **Paso 1: test que falla** en `scripts/test-permission-scope.mts` (estilo de `test-permission-areas.mts`), casos:
  - `scopeKindForAction`: `view`/`export`→`"view"`; `edit`/`delete`/`publish`→`"edit"`; `create`→`null`.
  - `normalizeCell({view:"own",edit:"all"})` deepEqual `{view:"own",edit:"own"}`; `{view:"all",edit:"own"}` no cambia.
  - Paridad con hoy: para cada rol de `PERMISSIONS_BY_ROLE` × `SCOPED_RESOURCES` × `["view","edit"]`, `resolveRestriction(role,r,k,[])` === `getViewRestriction(role,r)`.
  - `defaultScopes("agent_senior")`: `clientes`, `solicitudes`, `documentacion`, `viewing_collections` = `{own,own}`; `defaultScopes("advisor")` todo `all`; `captadora` todo `own`.
  - Excepción Ver `own` sobre `advisor` en `clientes` ⇒ `resolveRestriction(...,"view",...)==="own_only"` y `"edit"` también.
  - Excepción Editar `own` con Ver `all` ⇒ view `"all"`, edit `"own_only"`.
  - País: `[{clientes,view,own,country:"es"}]` aplicada con `"cl"` no cambia nada; sin país solo cuentan filas con `country` nulo.
  - Valores desconocidos (recurso, tipo, alcance) se ignoran.
  - `validateScopeOverrides`: lista vacía ok; recurso no escalable (`usuarios`), duplicado, valor inválido y `view own`+`edit all` del mismo recurso → `ok:false` con mensaje en español; `isEscalation` true/false.
  - `resolveCaptacionRestriction("agent_senior",[])==="confirmed_and_own"`; con Ver `all` → `"all"`; con Ver `own` sobre `advisor` → `"own_only"`.
- [ ] **Paso 2:** ejecutar el test; esperado: FALLA (módulo inexistente).
- [ ] **Paso 3:** implementar `lib/permissions-scope.ts` con las firmas de arriba y el cambio de `isScopedBusinessData` en `lib/permissions.ts`.
- [ ] **Paso 4:** añadir `test:permission-scope` a `package.json` y un paso en `ci.yml` junto a los de «Permisos». Ejecutar el test y `npx tsc --noEmit`; esperado: PASS.
- [ ] **Paso 5:** commit «Alcance por sección: modelo puro y pruebas».

---

### Tarea 2: Tabla `user_scope_overrides`

**Files:** Create `supabase/migrations/0216_user_scope_overrides.sql`, `scripts/sql-tests/0216_user_scope_overrides.test.sql`.

- [ ] **Paso 1:** escribir la prueba SQL (patrón 0211): aplicar la migración dos veces; `anon` y `authenticated` no leen ni escriben (error de permisos); `service_role` inserta; dos filas globales iguales `(user_id,resource,kind)` chocan; una global y una de país coexisten; `kind='x'`, `scope='x'` y `country='fr'` fallan por CHECK; borrar el perfil borra sus filas.
- [ ] **Paso 2:** escribir la migración, idempotente: `CREATE TABLE IF NOT EXISTS user_scope_overrides (id uuid PK default gen_random_uuid(), user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, resource text NOT NULL, kind text NOT NULL CHECK (kind IN ('view','edit')), scope text NOT NULL CHECK (scope IN ('all','own')), country text CHECK (country IS NULL OR country IN ('es','cl')), created_by uuid REFERENCES profiles(id), created_at timestamptz DEFAULT now())`; índices únicos parciales `uq_uso_global (user_id,resource,kind) WHERE country IS NULL` y `uq_uso_country (user_id,resource,kind,country) WHERE country IS NOT NULL`; índice por `user_id`; `ENABLE ROW LEVEL SECURITY` sin políticas; `REVOKE ALL ... FROM anon, authenticated`.
- [ ] **Paso 3:** ejecutar la prueba en un contenedor desechable (instrucciones en la cabecera del archivo, como 0211); esperado: todo OK. No tocar el VPS.
- [ ] **Paso 4:** commit «Alcance por sección: migración 0216».

---

### Tarea 3: Carga y resolución en servidor

**Files:** Modify `lib/db/queries/permissions.ts`, `lib/db/queries/view-scope.ts`.

**Interfaces — Consumes:** Tarea 1. **Produces:**
```ts
// permissions.ts
export async function getScopeOverrides(userId: string): Promise<ScopeOverride[]>; // [] si falla o la tabla no existe
export async function getEffectiveScopes(userId: string, role: string, country?: string): Promise<{ scopes: ScopeMatrix; defaults: ScopeMatrix }>;
// view-scope.ts
export async function resolveViewScope(resource: PermissionResource, kind?: ScopeKind /*"view"*/, country?: string): Promise<ViewScope>;
export async function canActOnClient(clientId: string, resource: ScopedResource, kind: ScopeKind, country?: string): Promise<boolean>;
export async function canActOnLead(leadId: string, kind: ScopeKind): Promise<boolean>; // lead_inbox_facts.assigned_to == yo o nulo; "all" → true
```
- [ ] **Paso 1:** implementar `getScopeOverrides` (cliente admin, `select resource, kind, scope, country`, `try/catch` devolviendo `[]`) y `getEffectiveScopes` (`defaultScopes(role)` + `applyScopeOverrides`). El `role` es `profile.role`, el mismo que usa `resolveViewScope` hoy (el rol por país queda fuera, como ahora).
- [ ] **Paso 2:** `resolveViewScope`: si `isScopedResource(resource)`, restricción = `resolveRestriction(role, resource, kind, await getScopeOverrides(profile.id), country)`; si no, igual que hoy. Sin perfil → `"all"`, como hoy.
- [ ] **Paso 3:** `canActOnClient`: misma lógica que `canAccessClient` de `lib/db/queries/viewing-collections.ts` pero con `resolveViewScope(resource, kind, country)`; `canActOnLead`: admin client, `select assigned_to` de `lead_inbox_facts` por id; `own` ⇒ `assigned_to` nulo o igual a `userId`.
- [ ] **Paso 4:** `npx tsc --noEmit` y `npm run test:permission-scope`; esperado: PASS. Commit «Alcance por sección: resolución en servidor».

---

### Tarea 4: API de permisos (GET/POST)

**Files:** Modify `app/api/admin/usuarios/[id]/permissions/route.ts`.

- [ ] **Paso 1 (GET):** añadir a la respuesta `scopes: ScopeMatrix` (efectivo, con `?country=` igual que los permisos) y `scopeDefaults: ScopeMatrix` (`defaultScopes(role)`, con `role` = `profiles.role`).
- [ ] **Paso 2 (POST):** aceptar `scopeOverrides` opcional. Si falta, no tocar filas de alcance. Si viene (incluso `[]`): `validateScopeOverrides` → 400 con su mensaje; comprobar escalada con `isEscalation(actorScopes, o)` solo para entradas que no estaban ya guardadas con ese valor (mismo criterio que las concesiones de permisos) → 403 «No puedes conceder alcance “Todo” en <recurso>: tú no lo tienes»; guardar solo diferencias respecto a `defaultScopes`: borrar las filas del subconjunto de país (`country` nulo o igual) e insertar las nuevas con `created_by`.
- [ ] **Paso 3:** `logPermissionEvent` con `newValue` ampliado: `scopeOverrideCount` y `scopeOverrides`. Añadir en `EVENT`/historial del drawer el texto «N excepciones de alcance» (Tarea 5).
- [ ] **Paso 4:** `npm run test:api-guards` y `npx tsc --noEmit`; esperado: PASS. Commit «Alcance por sección: API de permisos».

---

### Tarea 5: Panel

**Files:** Modify `components/admin/permissions/permission-matrix.tsx`, `permissions-drawer.tsx`, `permission-details.ts`.

**Interfaces — Consumes:** `ScopeMatrix`, `setScopeCell`, `isScopedResource`, `SCOPE_LABELS`. **Produces:** nuevas props de `PermissionMatrix`: `scopes: ScopeMatrix | null; scopeDefaults: ScopeMatrix | null; onScope: (r: ScopedResource, k: ScopeKind, v: ScopeValue) => void`.

- [ ] **Paso 1:** drawer: estado `scopes`, `scopeDefaults`, `savedScopes` cargados del GET; `overrideCount` suma las excepciones de alcance; `dirty` y `discardChanges`/`resetToRole` incluyen los alcances; `handleSave` envía `scopeOverrides` (solo celdas que difieren del perfil).
- [ ] **Paso 2:** matriz (tabla y tarjeta móvil): bajo los interruptores **Ver** y **Editar** de las filas con `isScopedResource`, un botón-chip que alterna «Todo» / «Solo lo suyo» (visible solo con el interruptor encendido). El de Editar se muestra bloqueado, con `title` «Si solo ve lo suyo, solo puede editar lo suyo», cuando Ver es `own`. Punto dorado (`ModifiedDot`) si difiere del perfil; `rowIsModified` y el filtro «Solo excepciones» lo tienen en cuenta. Sin `canEdit` el chip no responde. Estilo de la maqueta aprobada (chip dorado suave en «Solo lo suyo»).
- [ ] **Paso 3:** textos: reemplazar «El alcance de los datos (toda la cartera o solo la suya) lo fija el perfil» por una frase que explique los chips; en `permission-details.ts` quitar «Si ve todos o solo los suyos lo fija el perfil» de Clientes, cambiar las seis líneas «Sin efecto hoy» de `documentacion` por su función real (Tarea 8), y añadir una línea «Alcance» en el desplegable de cada fila escalable.
- [ ] **Paso 4:** `npx tsc --noEmit`, `npm run test:typography`, `npm run test:permission-areas`; esperado: PASS. Si `/root/ux-harness` (ver `BRIEF.md`) permite montar el drawer con datos de prueba, sacar captura; si no, la comprobación visual queda para tras el despliegue y se dice en el informe.
- [ ] **Paso 5:** commit «Alcance por sección: selector en el panel».

---

### Tarea 6: Clientes

**Files:** Modify `app/[country]/(admin)/admin/clientes/page.tsx`, `clientes/[id]/page.tsx`, `clientes/[id]/actions.ts`, `clientes/shortlist-actions.ts`, `clientes/property-offer-actions.ts`, `app/api/admin/clientes/[clientId]/suggested-properties/route.ts`, `.../suggested-particulares/route.ts`, `lib/db/queries/clients.ts`.

- [ ] **Paso 1:** `clientes/page.tsx`: sustituir `canAccess(role,"clientes","view")` + redirect por `await guardPage("clientes", country)`. `getClients(country)`: pasar `country` a `resolveViewScope("clientes","view",country)`.
- [ ] **Paso 2:** `clientes/[id]/page.tsx`: tras `guardPage`, `if (!(await canActOnClient(id,"clientes","view",country))) notFound();` **antes** de `getClientById`. (`inScope` de Colecciones se mantiene.)
- [ ] **Paso 3:** en `updateClientIdentity`, `assignClientAdvisor`, `saveClientPreferencesFull` (`[id]/actions.ts`): tras `assertPermission("clientes","edit")`, `canActOnClient(clientId,"clientes","edit")`; si no, `throw new Error("No tienes acceso a este cliente.")`. Misma comprobación en cada acción de `shortlist-actions.ts` y `property-offer-actions.ts` que reciba un `clientId` y se proteja con `clientes`/`edit` (revisar el gate de cada una; las protegidas con `viewing_collections` se tratan en la Tarea 9). En las dos rutas `suggested-*`: `canActOnClient(clientId,"clientes","view")` → 404 JSON si falla.
- [ ] **Paso 4:** `npx tsc --noEmit`. Verificación: con la prueba de la Tarea 1 en verde, revisar a mano que ninguna acción de estos archivos con `clientId` quede sin gate (`grep -n "assertPermission\|checkPermission"` frente a la lista de `export async function`). Commit «Alcance por sección: clientes».

---

### Tarea 7: Solicitudes y visitas (bandeja de leads)

**Files:** Modify `lib/db/queries/sales-inbox.ts`, `app/[country]/(admin)/admin/solicitudes/inbox-actions.ts`, `solicitudes/actions.ts`, `app/api/admin/visitas/[id]/sync-calendar/route.ts`.

- [ ] **Paso 1:** en `sales-inbox.ts`, las tres llamadas `resolveViewScope("solicitudes")` pasan a `("solicitudes","view")` (explícito, sin cambio de comportamiento).
- [ ] **Paso 2:** en las acciones sobre un lead (`assignLead`, `logContact`, `setFollowUp`, `snoozeFollowUp`, `setLeadDiscarded`, `convertLeadToClient`, `matchLeadProperty`, y `updateIdealistaLeadStatus`, `setIdealistaLeadType`, `assignIdealistaLead`, `setIdealistaLeadMatchedProperty`, `updateIdealistaLeadContactStatus`): tras el gate de permiso, `canActOnLead(id,"edit")` → si no, error «No tienes acceso a esta solicitud.» (mismo formato de retorno de cada acción). Las masivas (`bulkAssign`, `bulkDiscard`, `bulkSetLeadType`, `bulkSetFollowUp`): filtrar `leadIds` a los permitidos y devolver error si no queda ninguno. `assignLeadToMe` no se restringe (tomar de la cola sin dueño es lo normal).
- [ ] **Paso 3:** `updateVisitStatus` (visitas con `client_id`): `canActOnClient(clientId,"solicitudes","edit")` con el `client_id` de la visita; igual en `sync-calendar/route.ts`.
- [ ] **Paso 4:** `npx tsc --noEmit`. Commit «Alcance por sección: solicitudes».

---

### Tarea 8: Documentación como permiso real

**Files:** Modify `app/[country]/(admin)/admin/solicitudes-documentacion/page.tsx` (y `app/(admin)/admin/solicitudes-documentacion/page.tsx` si sigue enrutado), `lib/db/queries/property-applications.ts`, `app/api/property-applications/route.ts`, `app/api/property-applications/[id]/route.ts`, `app/api/property-application-documents/[id]/verify/route.ts`, `.../analyze/route.ts`, `app/api/property-applications/[id]/export-summary/route.ts` (+ `/send`), `components/admin/permissions/permission-details.ts`.

- [ ] **Paso 1:** la página: `await guardPage("documentacion", country)` en lugar de `canAccess(role,"solicitudes","view")`.
- [ ] **Paso 2:** `getApplicationsForAdmin`: usar `resolveViewScope("documentacion","view",filters.country)` (hoy `"solicitudes"`).
- [ ] **Paso 3:** rutas con rama de **staff**: `GET` → `checkPermission("documentacion","view")` y `canActOnClient(application.client_id,"documentacion","view")`; `PATCH` acciones `approve|reject|reopen|update|recalculate` → `checkPermission("documentacion","edit")` y `canActOnClient(...,"documentacion","edit")`; `verify`, `analyze`, `export-summary`(+`send`) igual según sean lectura o edición. La rama del propio cliente (`isOwner`) no cambia. 403 con «No tienes acceso a esta solicitud».
- [ ] **Paso 4:** `permission-details.ts` para `documentacion`: Ver «Ver la pantalla de Documentación y los documentos de los clientes», Editar «Aprobar, rechazar, reabrir y verificar documentos», Eliminar «Borrar documentos», Exportar «Descargar el resumen de la solicitud»; Crear y Publicar «Sin efecto hoy». Quitar de `solicitudes.view` la mención a la pantalla de Documentación.
- [ ] **Paso 5:** `npx tsc --noEmit`, `npm run test:api-guards`. Commit «Alcance por sección: documentación como permiso propio».

---

### Tarea 9: Colecciones de visitas y enlaces de portales

**Files:** Modify `lib/db/queries/viewing-collections.ts`, `lib/db/queries/portal-links.ts`, `app/[country]/(admin)/admin/clientes/viewing-collections-actions.ts`, `portal-links-actions.ts`.

- [ ] **Paso 1:** `canAccessClient(clientId, kind: ScopeKind = "view")` y `canAccessClientLinks(clientId, kind = "view")` pasan a delegar en `canActOnClient(clientId,"viewing_collections",kind)`.
- [ ] **Paso 2:** `gate(action, clientId)` en `viewing-collections-actions.ts` y el equivalente de `portal-links-actions.ts` pasan `kind = scopeKindForAction(action) ?? "view"` (crear exige poder ver al cliente; decisión mía, mantiene el comportamiento de hoy).
- [ ] **Paso 3:** `npx tsc --noEmit`. Commit «Alcance por sección: colecciones de visitas».

---

### Tarea 10: Captaciones

**Files:** Modify `lib/captaciones/access.ts`, `lib/db/queries/captacion-access.ts`, `app/[country]/(admin)/admin/captaciones/page.tsx`, `captaciones/[id]/page.tsx`; añadir `getCaptacionesOwn(userId: string)` junto a `getCaptacionesForAgent` (captaciones con `assigned_to` o `created_by` = userId).

- [ ] **Paso 1:** test en `test-permission-scope.mts`: `canWorkCaptacion(actor, cap, effective, "own")` es true solo si asignada o creada por el actor aunque `effective.captaciones.edit` sea true; con `"all"` o sin cuarto argumento, igual que hoy.
- [ ] **Paso 2:** `canWorkCaptacion(actor, captacion, effective?, editScope?: ScopeValue)`: la regla 2 solo aplica si `editScope !== "own"`. `CaptacionActor` gana `editScope: ScopeValue` y `viewRestriction: CaptacionViewRestriction`, cargados en `getCaptacionActor` con `getScopeOverrides(profile.id)` + `applyScopeOverrides(defaultScopes(role), …, "cl").captaciones.edit` y `resolveCaptacionRestriction(role, overrides)` (con `role` = rol efectivo en Chile, el que ya usa el actor); `actorCanWorkCaptacion` y `requireCaptacionWork` los usan.
- [ ] **Paso 3:** `captaciones/page.tsx`: `viewRestriction = actor.viewRestriction`; añadir `case "own_only": captaciones = await getCaptacionesOwn(profile.id)`. `captaciones/[id]/page.tsx`: si Ver es `own_only`/`assigned_only`/`confirmed_and_own` y la captación no encaja con esa regla, `notFound()` (mismas reglas que el listado).
- [ ] **Paso 4:** ejecutar `npm run test:permission-scope` y `npx tsc --noEmit`; esperado PASS. Commit «Alcance por sección: captaciones».

---

### Tarea 11: Documento, comprobación previa y cierre

**Files:** Create `docs/PERMISOS_ALCANCE.md`.

- [ ] **Paso 1:** documentar: modelo, qué cubre la fase 1 y qué no, el mapa acción→alcance, y los «Cambios de comportamiento» de este plan.
- [ ] **Paso 2:** incluir la consulta que el **dueño** ejecuta antes de fusionar (no el agente):
  `SELECT user_id FROM user_permission_overrides s JOIN user_permission_overrides d USING (user_id, country) WHERE s.resource='solicitudes' AND s.action='view' AND s.allowed AND d.resource='documentacion' AND d.action='view' AND NOT d.allowed;` — y revisar también perfiles personalizados (`custom_roles.matrix->'documentacion'->>'view' = 'false'`).
- [ ] **Paso 3:** verificación final: `npx tsc --noEmit`, `npm run test:permission-scope && npm run test:permission-areas && npm run test:role-model && npm run test:user-rank && npm run test:api-guards && npm run test:typography`; esperado: todo PASS. Informar honestamente lo no verificado (migración contra BD real, interfaz con datos reales).
- [ ] **Paso 4:** commit «Alcance por sección: documentación y notas de activación». **No** empujar ni abrir PR hasta que el dueño lo pida.
