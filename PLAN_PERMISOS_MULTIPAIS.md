# Plan de permisos multi‑país (España / Chile / ambos)

> Planteamiento completo para reordenar el sistema de permisos de usuarios del
> CRM, ligándolo al **sidebar**, a las **funciones reales del CRM** y al
> **modelo multi‑país** (España, Chile, o ambos). Cubre el estado actual, los
> huecos detectados, el modelo objetivo y un roadmap por fases —lo urgente de
> ahora y las mejoras futuras— para que no se escape nada.
>
> Página afectada: `/{country}/admin/usuarios` (ej. `https://portal.bcousinoprop.com/cl/admin/usuarios`).

---

## 0. TL;DR (lo esencial)

1. **El permiso hoy es casi cosmético.** El sidebar oculta módulos según el
   rol, pero **solo ~5 de 137 rutas `/api/admin/*` verifican permisos** en el
   servidor. Un `agent_junior` puede llamar directamente a la API y crear/
   borrar aunque no vea el botón. → **Prioridad 0: gate de autorización en API.**
2. **El país es un valor único + un booleano.** `profiles.country` +
   `profiles.multi_country`. Un usuario "multi‑país" hereda **los mismos
   permisos en ambos países**; no se puede ser "senior en Chile, junior en
   España". → **Prioridad 1: permisos con dimensión de país.**
3. **El aislamiento de datos por país es parcial.** Solo 3 tablas de
   aislamiento tienen columna `country` y solo 24 rutas filtran por país; no
   hay RLS que lo fuerce. → **Prioridad 1: aislamiento consistente + RLS.**
4. **La UI de `/usuarios` no cubre todos los roles ni el scope por país.**
   `captadora`, `viewer` no se pueden asignar; el drawer de permisos no
   distingue país; `multi_country` es un checkbox sin matices. → **Prioridad 2.**

---

## 1. Estado actual (cómo funciona hoy)

### 1.1. Modelo de permisos — `lib/permissions.ts`
Fuente de verdad única y bien estructurada:

- **Recursos (12):** `properties`, `particulares`, `publicacion`, `captaciones`,
  `clientes`, `solicitudes`, `documentacion`, `mensajes`, `reportes`,
  `usuarios`, `configuracion`, `calendario`.
- **Acciones (5):** `view`, `create`, `edit`, `delete`, `export`.
- **Roles (9):** `owner`, `admin` (full access), `advisor`, `agent_admin`,
  `agent_senior`, `agent_junior`, `captadora`, `client`, `viewer` (sin acceso).
- **Matrices por rol** (`PERMISSIONS_BY_ROLE`) → `canAccess(role, resource, action)`.
- **Excepciones por usuario:** tabla `user_permission_overrides`
  (migración `0029`) `(user_id, resource, action, allowed)`. `applyOverrides()`
  combina rol + excepciones → `EffectivePermissions`. Una excepción **siempre
  gana** sobre el default del rol.
- **Granularidad extra en captaciones:** `getCaptacionEditableFields(role)` y
  `getCaptacionViewRestriction(role)` (`all` / `own_only` / `assigned_only` /
  `confirmed_and_own`). **Es el único recurso con "scope" de datos.**

### 1.2. Multi‑país
- `profiles.country` `'es'|'cl'` (migración `0038`, default `'es'`).
- `profiles.multi_country` boolean (migración `0084`).
- **Layout admin** `app/[country]/(admin)/layout.tsx`:
  - `canSwitchCountry = role ∈ {admin, owner} || multi_country`.
  - Si no puede cambiar y `userCountry !== country` → redirige a su país.
  - Calcula `getEffectivePermissions()` **una sola vez, sin país**, y lo pasa
    al sidebar.
- **Sidebar** `components/admin-sidebar.tsx`:
  - `NAV_ITEMS` con `permissionResource` y `onlyCountry` (string único).
  - Filtra: `onlyCountry !== country` oculta; luego `permissions[resource].view`.
  - Módulos hoy atados a país: `agencias`, `particulares`, `idealista`,
    `sindicacion`, `diagnostico` → **solo ES**; `captaciones` → **solo CL**.
  - Selector de banderas 🇪🇸/🇨🇱 solo si `canSwitchCountry`.

### 1.3. UI de gestión — `/{country}/admin/usuarios`
- `page.tsx`: carga todos los perfiles, exige `canAccess(role,"usuarios","view")`.
- `usuarios-client.tsx`: secciones Admins / Asesores / Agentes / Clientes /
  Otros. Modales **Crear** y **Editar** (incluyen selector País + checkbox
  "Acceso a los 2 países"). Botón **Permisos** → `PermissionsDrawer`.
- `PermissionsDrawer`: matriz recurso×acción con toggles; marca "modificado"
  vs. default del rol; guarda solo el diff como overrides.

### 1.4. API
- `GET/POST /api/admin/usuarios/[id]/permissions` — lee/escribe overrides.
- `POST /api/admin/usuarios/create`, `PATCH .../update` — crean/editan perfil,
  rol, `country`, `multi_country`.

---

## 2. Problemas y huecos detectados

| # | Severidad | Problema | Evidencia |
|---|-----------|----------|-----------|
| **A** | 🔴 Crítico | **Los permisos no se aplican en la API.** El sidebar/UI ocultan, pero las rutas no verifican `canAccess`. ~5/137 rutas comprueban permisos. | `grep canAccess app/api` → 5 archivos; `find app/api -name route.ts` → 137 |
| **B** | 🔴 Crítico | **Sin permisos por país.** `multi_country` da acceso a ambos países con los **mismos** permisos. No hay "rol/permiso por país". | `layout.tsx:32-39`; overrides sin columna `country` |
| **C** | 🟠 Alto | **Aislamiento de datos por país parcial.** Solo `visit_requests`, `internal_notes`, `client_preferences` tienen `country` (mig. `0046`); solo 24 rutas filtran; sin RLS que lo fuerce. | `grep -rl country app/api` → 24 |
| **D** | 🟠 Alto | **Inconsistencia de autorización en permisos.** El POST de permisos permite `agent_admin`, pero el drawer solo deja editar a `admin/owner`. | `permissions/route.ts:106` vs `usuarios-client.tsx:812` |
| **E** | 🟡 Medio | **UI incompleta de roles.** No se puede crear/asignar `captadora` ni `viewer` desde `/usuarios`; el `<select>` de rol al editar no los incluye. | `usuarios-client.tsx:469-475` (Editar) y modales de creación |
| **F** | 🟡 Medio | **`onlyCountry` es string único.** Un módulo no puede pertenecer a "varios pero no todos"; mezcla "el módulo solo existe en X" con "permiso". Hardcodeado. | `admin-sidebar.tsx:50-70` |
| **G** | 🟡 Medio | **Overrides sin dimensión de país.** No se puede conceder "export reportes solo en Chile". | tabla `user_permission_overrides` (mig. `0029`) |
| **H** | 🟡 Medio | **Scope de datos solo en captaciones.** `properties`, `clientes`, `solicitudes` no tienen `own/team/all`; un agente ve **todo**. | solo `getCaptacionViewRestriction` existe |
| **I** | 🟢 Bajo | **Sin auditoría.** `created_by` existe pero no hay log de cambios de permisos/rol. | — |
| **J** | 🟢 Bajo | **Defaults divergentes.** middleware asume rol `client`; layout asume país `es`; enum de rol en BD (`0079`) puede divergir del set de TS. | `middleware.ts:86`, `layout.tsx:36` |
| **K** | 🟢 Bajo | **Sin invalidación al cambiar permisos.** El usuario afectado no re‑evalúa hasta recargar/re‑login; overrides se leen por request pero no hay señal. | — |

---

## 3. Modelo objetivo propuesto

### 3.1. Principio rector
> **Permiso efectivo = f(rol, país activo, excepciones por usuario) — verificado
> SIEMPRE en el servidor (API + RLS), y reflejado en el sidebar/UI como
> consecuencia, nunca como única defensa.**

### 3.2. Dimensión de país en el modelo
Elevar el país a "primera clase" del sistema de acceso:

1. **`profiles.countries`** (reemplazo conceptual de `country`+`multi_country`):
   set de países a los que el usuario tiene acceso: `['es']`, `['cl']`,
   `['es','cl']`. Se mantiene `country` como **país por defecto** (landing).
   - Migración aditiva: derivar `countries` de `country`/`multi_country`
     existentes; no romper datos.
2. **Permiso por país (opcional, fase 2):** permitir rol distinto por país,
   p. ej. `profiles_country_roles(user_id, country, role)`. Si no existe fila
   para un país, se usa el rol global. Esto habilita "senior en CL, junior en ES".
3. **Overrides con país:** añadir `country` (nullable) a
   `user_permission_overrides`. `NULL` = aplica a todos los países; valor =
   excepción solo en ese país. `UNIQUE(user_id, resource, action, country)`.

### 3.3. Scope de datos (visibilidad) por recurso
Generalizar el patrón de captaciones a un enum reutilizable por recurso:

- `all` (toda la agencia) · `team` (su asesor/equipo) · `own_only` (creadas por
  él) · `assigned_only` (asignadas a él) · `none`.
- Definir `getViewRestriction(role, resource)` en `lib/permissions.ts` y usarlo
  en las queries de `properties`, `clientes`, `solicitudes`, `captaciones`.
- Combinar SIEMPRE con el filtro de país activo.

### 3.4. Matriz de país × módulo (disponibilidad ≠ permiso)
Separar dos conceptos hoy mezclados en `onlyCountry`:

- **Disponibilidad del módulo** (`availableIn: Country[]`): el módulo existe en
  ese mercado (p. ej. `idealista`/`particulares`/`sindicacion` → solo ES;
  `captaciones` → hoy CL, candidato a ES en futuro).
- **Permiso** (`canAccess(role, resource, 'view')`): si el usuario puede verlo.
- Item visible ⇔ `availableIn.includes(paísActivo) && permiso`.

---

## 4. Roadmap por fases

### Fase 0 — Blindaje de la API (URGENTE, seguridad) 🔴
Sin esto, todo lo demás es decorativo.
1. Helper server‑side `requirePermission(resource, action)` (y
   `requireCountryAccess(country)`) que:
   - resuelve perfil actual (`getCurrentProfile`),
   - calcula `getEffectivePermissions(userId, role)` (ya existe),
   - devuelve `403` si no cumple.
2. Aplicarlo en **todas** las rutas `/api/admin/*` mutantes (`POST/PATCH/DELETE`)
   y en las de lectura sensible. Mapear cada carpeta de ruta → recurso:
   - `.../propiedades*` → `properties` · `.../clientes*` → `clientes`
   - `.../captaciones*` → `captaciones` · `.../solicitudes*` → `solicitudes`
   - `.../usuarios*` → `usuarios` · `.../email-config|configuracion*` → `configuracion`
   - `.../idealista|sindicacion|publicacion*` → `publicacion`/`properties`
   - `.../reportes|export*` → `reportes` (+ acción `export`)
3. Cerrar la incoherencia **D**: unificar quién puede editar permisos
   (recomendado: `owner/admin`; si `agent_admin` debe poder, alinear el drawer).
4. Tests de humo: por cada rol, una petición que **debe** dar `403`.

### Fase 1 — País como primera clase 🟠
1. Migración `profiles.countries text[]` + backfill desde `country`/`multi_country`.
2. `layout.tsx`: `canSwitchCountry = countries.length > 1 || role ∈ {owner,admin}`;
   validar `countries.includes(paramCountry)` antes de renderizar (hoy solo
   compara `userCountry`).
3. Filtrar por país activo en las queries de datos y añadir `country` a las
   tablas de aislamiento que falten (properties, clients, solicitudes, mensajes,
   documentos, reportes) — o vista/param consistente.
4. **RLS** por país en tablas de aislamiento (defensa en profundidad, aunque el
   acceso sea vía service‑role, dejar la política lista para cuando se use
   cliente con sesión).
5. `getEffectivePermissions(userId, role, country)` — leer overrides del país
   activo + globales.

### Fase 2 — UX de gestión de usuarios 🟡
1. **Selector de países** (multi‑select 🇪🇸🇨🇱) en Crear/Editar, sustituyendo el
   checkbox "Acceso a los 2 países" y el `<select>` de país único.
2. **País por defecto** (landing) separado del set de acceso.
3. Incluir **todos los roles** asignables en la UI (`captadora`, `viewer`),
   respetando quién puede asignar qué.
4. **Drawer de permisos por país:** pestañas/switch 🇪🇸/🇨🇱 cuando el usuario
   tiene varios países; overrides se guardan con `country`.
5. **Plantillas de permisos** ("presets"): aplicar una matriz típica de un clic
   antes de afinar overrides.
6. **Indicadores en la tabla:** columnas País(es) y nº de excepciones activas.

### Fase 3 — Gobernanza y futuro 🟢
1. **Auditoría:** tabla `permission_audit_log` (quién, a quién, qué cambió,
   cuándo, país). Vista en el drawer ("historial").
2. **Scope de datos** (sección 3.3) en properties/clientes/solicitudes.
3. **Rol por país** (`profiles_country_roles`) para casos mixtos.
4. **Roles personalizados** (definir matrices sin tocar código) — tabla
   `custom_roles`.
5. **Invalidación/refresh** de permisos en caliente (revalidar sesión al guardar).
6. **Expiración/temporalidad** de accesos (fecha de baja, accesos temporales).
7. **2FA / IP allowlist** para roles sensibles (ya existe `ip-security`,
   integrarlo con roles).

---

## 5. Matriz de roles propuesta (revisión)

Mantener las 9 matrices actuales como base. Ajustes sugeridos a validar con negocio:

- **`captadora`**: hoy solo `captaciones {view, edit}`. Añadir `calendario.view`
  y `mensajes.view` si gestiona agenda/contacto de dueños.
- **`agent_junior`**: revisar si debe `create` en `solicitudes`/`calendario`
  (agendar visitas propias) — hoy todo en `false` salvo `view`.
- **`advisor`**: alinear con `agent_admin` salvo gestión de usuarios/config.
- **`agent_admin`**: decidir si realmente gestiona usuarios (impacta D).

> Todas quedan **overrideables por usuario y por país**; la matriz es el default.

---

## 6. Cambios por capa (resumen técnico)

| Capa | Archivo(s) | Cambio |
|------|-----------|--------|
| DB | nueva migración | `profiles.countries text[]`; `user_permission_overrides.country`; `country` en tablas de aislamiento restantes; RLS por país; (fase 3) `permission_audit_log`, `profiles_country_roles` |
| Lógica | `lib/permissions.ts` | `getViewRestriction(role,resource)`; firma con país en overrides; helper de disponibilidad por país |
| Lógica | `lib/db/queries/permissions.ts` | `getEffectivePermissions(userId, role, country)` |
| **Server guard** | nuevo `lib/auth/guard.ts` | `requirePermission()`, `requireCountryAccess()` |
| API | **todas** `app/api/admin/**/route.ts` | aplicar guard + filtro país |
| Layout | `app/[country]/(admin)/layout.tsx` | `countries[]`, validar acceso al país, permisos por país |
| Sidebar | `components/admin-sidebar.tsx` | `availableIn: Country[]` en vez de `onlyCountry` |
| UI | `usuarios-client.tsx`, `permissions-drawer.tsx` | multi‑select país, todos los roles, permisos por país, presets |

---

## 7. Checklist "que no se escape nada"

- [ ] **F0** Guard de permisos en el 100% de rutas API mutantes.
- [ ] **F0** Mapa carpeta‑ruta → recurso documentado y aplicado.
- [ ] **F0** Coherencia "quién edita permisos" (D) resuelta.
- [ ] **F0** Tests: cada rol recibe `403` donde corresponde.
- [ ] **F1** `countries[]` + backfill sin pérdida de datos.
- [ ] **F1** Layout valida `countries.includes(país)`.
- [ ] **F1** Filtro de país en todas las queries de datos + RLS.
- [ ] **F2** Multi‑select de países en Crear/Editar.
- [ ] **F2** `captadora`/`viewer` asignables desde UI.
- [ ] **F2** Drawer de permisos por país.
- [ ] **F3** Auditoría de cambios de permisos/rol.
- [ ] **F3** Scope de datos (own/team/all) fuera de captaciones.
- [ ] **F3** Rol por país / roles personalizados / expiración.
- [ ] Documentar la matriz final por rol y país (tabla de referencia para el equipo).

---

## 8. Riesgos y notas

- **No romper el deploy VPS:** las migraciones deben ser **aditivas e
  idempotentes** (`ADD COLUMN IF NOT EXISTS`, backfill con default), aplicables
  con `psql` dentro del contenedor `supabase-db` (ver `scripts/post-deploy.sh`).
- **Compatibilidad:** mantener `country`/`multi_country` durante la transición y
  derivar `countries[]` de ellos; migrar lectura primero, escritura después.
- **Orden de despliegue:** DB → guard API (F0) → UI. El guard puede ir a
  producción antes que la UI multi‑país sin efectos visibles para el usuario.
- **Fase 0 es de seguridad**: conviene priorizarla aunque el resto se planifique
  a medio plazo.
