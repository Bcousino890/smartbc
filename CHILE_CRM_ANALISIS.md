# SmartBC — Análisis integral del CRM Chile (`/cl/admin`)

Fecha: 2026-07-02 · Alcance: solo la parte de **Chile** (no España).

## Resumen ejecutivo

La sección `/cl/admin` nació como **copia del árbol de España** y solo tres
módulos (Captaciones, Publicación CL, Portal Inmobiliario) fueron adaptados de
verdad. El resto seguía consultando **datos de España**, mostrando **precios en
euros** y navegando con **links que sacaban al usuario del contexto `/cl`**.
Además, el flujo estrella de Chile (captación → propiedad) estaba **incompleto:
no existía la conversión real**, y el rol `captadora` **no se podía guardar en
la base de datos** (falta en el enum), con lo que la asignación de captaciones
no podía funcionar de punta a punta.

---

## 1. Hallazgos (roto o sin sentido)

### 🔴 Críticos — datos cruzados entre países

| # | Problema | Detalle |
|---|----------|---------|
| 1 | `/cl/admin/propiedades` mostraba el catálogo de **España** | `getProperties()` no filtraba por `country` |
| 2 | Crear propiedad desde Chile la guardaba como **España** | `createProperty` (acción compartida) no fijaba `country`; la ficha nueva jamás aparecía en Publicación CL ni en Portal Inmobiliario |
| 3 | Importar por link desde Chile → propiedad de **España** | `insertImportedProperty` tampoco fijaba `country` |
| 4 | Dashboard `/cl/admin` con KPIs **globales** y precios en **€** | `getDashboardData()` sin filtro de país; formato `es-ES` + `€`; label "Alquilada" en vez de "Arrendada" |
| 5 | `/cl/admin/dashboard` (2º dashboard) mostraba **particulares de Idealista España** | copia del dashboard español, sin sentido en CL y sin enlace en el menú |

### 🔴 Críticos — flujo de captaciones roto

| # | Problema | Detalle |
|---|----------|---------|
| 6 | La conversión captación → propiedad **no existía** | `confirmed → converted_to_property` era solo un cambio de texto: nunca se creaba la propiedad, `converted_to_property_id` quedaba siempre NULL |
| 7 | El rol `captadora` **no se podía asignar** | Se usa en toda la app (permisos, asignación, usuarios) pero nunca se añadió al enum `user_role` de Postgres |
| 8 | Las políticas RLS de captaciones referencian la tabla **inexistente** `user_profiles` | y roles inexistentes (`agent`); la app funciona solo porque usa el service role |
| 9 | El historial de cambios de estado **nunca se guardaba** | el endpoint insertaba `attempt_type='status_change'`, prohibido por el CHECK de `captacion_logs` → insert fallaba en silencio |
| 10 | `createCaptacion()` en `actions.ts` era código muerto y roto | insertaba `status='pending'` (estado eliminado en la migración 0051) y sin `created_by` (NOT NULL) |
| 11 | UI y backend con transiciones desalineadas | la UI ofrecía `draft → rejected` y el backend lo rechazaba con error |

### 🟠 Importantes — navegación y módulos colgantes

| # | Problema | Detalle |
|---|----------|---------|
| 12 | ~20 links hardcodeados a `/admin/...` dentro de `/cl` | mensajes, clientes, propiedades, solicitudes… cada clic sacaba al usuario del contexto Chile hacia el árbol legado de España |
| 13 | Módulos de España accesibles por URL bajo `/cl` | `/cl/admin/idealista`, `/cl/admin/agencias`, `/cl/admin/sindicacion`, `/cl/admin/diagnostico`, `/cl/admin/particulares` operaban sobre datos españoles |
| 14 | `/cl/admin/portalinmobiliario` duplicado y huérfano | mismo contenido que la pestaña de `/cl/admin/publicacion`, sin entrada en el sidebar |
| 15 | Link "Ver anuncio" de Portal Inmobiliario **roto** | construía `…/MLC` + `MLC12345` → `MLCMLC12345` |
| 16 | Un admin multi-país **no podía publicar** en Portal Inmobiliario | el endpoint exigía `profile.country === 'cl'` aunque el layout permite a los admin cambiar de país |
| 17 | Middleware sin cobertura de `/cl/admin` (ni `/es/admin`) | `ADMIN_PATHS = ["/admin"]`; la protección quedaba solo en el layout. Además su lista local de roles staff **no incluía `captadora`** (divergía de `lib/permissions`) |
| 18 | Usuario de Chile aterrizando en el árbol raíz `/admin` veía España | el layout raíz no redirigía por país (el de `/es` sí) |

### 🟡 Menores

| # | Problema | Detalle |
|---|----------|---------|
| 19 | `/api/exchange-rate` con tasas **invertidas** | CLP→UF devolvía 34500 (convertir $50M daba 1,7 billones de UF); además UF desactualizada |
| 20 | Copias muertas en `/cl` | `propiedades/actions.ts`, `publicacion-client.tsx`, `idealista-form.tsx`, `map-picker.tsx`, `media-manager.tsx` no se importaban desde ninguna parte |

---

## 2. Flujos rediseñados

### Captación → Propiedad (antes se cortaba en "confirmada")

```
Agente pega link (Portal Inmobiliario u otro)
   → scrape automático (título, precio, fotos, ubicación)          [ya existía]
   → admin asigna a captadora                                      [ya existía, pero
                                                                    el rol no se podía crear → FIX migración 0063]
   → captadora completa datos del dueño y registra intentos        [ya existía; el
                                                                    historial de estados no se guardaba → FIX]
   → confirmada (dueño quiere vender)
   → 🆕 «Convertir a propiedad»: crea la ficha real en borrador
        con datos + fotos, país CL, enlaza converted_to_property_id,
        loguea y notifica al agente creador
   → el agente completa la ficha y la publica (web + Portal Inmobiliario)
```

### Alta / import de propiedad en Chile

```
Nueva propiedad (modal) → country='cl', moneda UF/CLP/USD → aparece en
/cl/admin/propiedades (solo catálogo CL) → Publicación CL → Portal Inmobiliario
Importar por link → insert con country='cl'
```

### Navegación

- Sidebar Chile: Dashboard · Propiedades · Publicación · Captaciones ·
  Clientes · Solicitudes · Documentación · Calendario · Mensajes · Reportes ·
  Usuarios · Configuración. (Particulares queda solo en España.)
- Todos los links internos del árbol `/cl` apuntan a `/cl/admin/...`.
- Rutas heredadas bajo `/cl` redirigen a su equivalente con sentido.

---

## 3. Qué se arregló en esta rama (Fase 1 — hecha ✅)

**Aislamiento de país**
- `getProperties()` acepta `country` y `/cl/admin/propiedades` filtra por `cl`.
- `createProperty` fija `country` (el modal lo pasa) y revalida las rutas de país.
- `insertImportedProperty` acepta `country`; el import de Chile pasa `'cl'`.
- `getDashboardData(country?)` filtra propiedades, clientes, visitas y
  SmartLinks (vía join) por país; `/cl/admin` lo usa con `'cl'`.

**Moneda y formato Chile**
- Dashboard y listado de propiedades CL: `$ CLP` / `UF` / `US$` con locale
  `es-CL` (antes € y `es-ES`); "Arrendada" en lugar de "Alquilada".
- `AdminProperty.currency` viaja desde la BD hasta la UI.

**Captaciones**
- 🆕 Endpoint `POST /api/admin/cl/captaciones/[id]/convert` + botón
  "Convertir a propiedad" en la ficha (estado `confirmed`).
- Migración `0063`: añade `captadora` al enum `user_role`, recrea las RLS
  contra `profiles` (antes `user_profiles`, inexistente) y arregla los CHECK
  de `captacion_logs` para que el historial de estados se guarde.
- Eliminada `createCaptacion()` muerta; transiciones UI/backend alineadas
  (`draft → rejected` permitido; `converted_to_property` solo vía convert).

**Navegación y limpieza**
- Reescritos todos los links `/admin/...` → `/cl/admin/...` del árbol CL.
- Redirects: `cl/dashboard → /cl/admin`, `cl/particulares → captaciones`,
  `cl/portalinmobiliario → publicacion`, `cl/idealista → publicacion`,
  `cl/agencias | cl/sindicacion | cl/diagnostico → /cl/admin`.
- Sidebar: Particulares marcado `onlyCountry: 'es'`.
- Borradas 5 copias muertas.

**Seguridad / consistencia**
- Middleware protege también `/cl/admin` y `/es/admin` y usa `isStaffRole`
  de `lib/permissions` (incluye `captadora`).
- Layout raíz `/admin` redirige usuarios CL a `/cl/admin` (igual que `/es`).
- Publish/unpublish de Portal Inmobiliario permite admin/owner multi-país.
- Link "Ver anuncio" ML corregido (`MLC-123…` en vez de `MLCMLC123…`).
- `/api/exchange-rate` con semántica y valores corregidos (UF ≈ $39.000).

**Verificación**: `next build` compila y typecheckea sin errores con todas las
rutas (`/cl/admin/*` incluidas).

> ⚠️ **Despliegue**: aplicar la migración `0063_captaciones_role_and_rls_fixes.sql`
> en el VPS (botón de migraciones en `/admin/configuracion` o psql en el
> contenedor `supabase-db`). Sin ella, el rol captadora sigue sin poder
> asignarse y el historial de estados sigue sin guardarse.

---

## 4. Plan por fases (siguientes)

### Fase 2 — Aislamiento total de datos por país (1-2 días)
1. **Clientes**: filtrar `getClients()`/`getClientStats()` por
   `profiles.country` y **backfill** de clientes chilenos existentes
   (`UPDATE profiles SET country='cl' WHERE …`). Hoy la lista de clientes en
   `/cl` es global.
2. **Solicitudes / Calendario / Reportes / Mensajes**: mismas queries con
   filtro país (visit_requests ya tiene `country`; el resto se filtra vía la
   propiedad o el perfil).
3. **Usuarios**: en `/cl/admin/usuarios` default de alta con `country='cl'`.
4. Índices: `CREATE INDEX ON properties(country) WHERE archived_at IS NULL`.

### Fase 3 — Profundizar el flujo Chile (2-4 días)
1. **Captaciones**: vista Kanban por estado (draft → assigned → contacting →
   confirmed), métricas de conversión por captadora, recordatorios de
   seguimiento (`last_contact_attempt_at` + cron).
2. **Portal Inmobiliario**: guardar el `permalink` real que devuelve ML,
   sincronización de bajas/cambios vía `ml-webhook` (hoy el webhook no
   actualiza `portalinmobiliario_sync_status`), y re-publicación automática
   al editar precio/fotos (`updatePropertyInML` ya existe y nadie lo llama).
3. **UF en vivo**: reemplazar `/api/exchange-rate` por mindicador.cl con
   caché diaria; mostrar equivalencia CLP⇄UF en la ficha.
4. **Ficha propiedad CL**: editor con campos chilenos (comuna/región/tipo/
   moneda) en `property-edit-view` (hoy solo el modal de alta los tiene).

### Fase 4 — Desduplicar la arquitectura (refactor mayor, 1 semana)
Hoy existen **tres árboles admin casi idénticos** (`app/(admin)`, `app/es`,
`app/cl`) que ya divergieron (este análisis es la prueba). Propuesta:
- Ruta dinámica única `app/[country]/(admin)/admin/...` con `country` como
  parámetro + helpers `useCountry()`/`getCountryFromParams()`.
- El árbol raíz `/admin` queda como redirect por país.
- Un solo lugar para queries/formatos/moneda por país
  (`lib/country-config.ts`: locale, moneda, labels "Arriendo/Alquiler").
- Tests e2e (Playwright ya está configurado) para los dos países.

---

## 5. Archivos clave tocados en Fase 1

- `middleware.ts` · `app/(admin)/layout.tsx`
- `lib/db/queries/{properties,dashboard}.ts` · `lib/db/{row-types,adapters}.ts` · `lib/types.ts`
- `lib/sync/import-by-link/insert.ts`
- `components/{admin-sidebar,admin/new-property-modal}.tsx`
- `app/(admin)/admin/propiedades/actions.ts`
- `app/cl/(admin)/admin/**` (dashboard, propiedades, captaciones, publicación, redirects)
- `app/api/admin/cl/captaciones/[id]/{convert,status}/route.ts`
- `app/api/admin/cl/{publish,unpublish}-*-portalinmobiliario/route.ts`
- `app/api/exchange-rate/route.ts`
- `supabase/migrations/0063_captaciones_role_and_rls_fixes.sql`
