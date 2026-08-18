# BCP CRM — Current State Product Audit
### v1.0 · 2026-08-18 · Preparación para benchmark de luxury real estate digital

> **Qué es esto.** Una radiografía factual del CRM `smartbc` tal y como está
> hoy: qué módulos existen, qué hace cada uno, qué datos hay de verdad en
> producción y qué experiencia recibe hoy el agente y el cliente.
>
> **Qué NO es.** No es un plan, ni un rediseño, ni una comparación con
> terceros. No se ha modificado una sola línea de código.

---

## 0 · Método y fiabilidad de la evidencia

| Fuente | Cómo se ha usado |
|---|---|
| Código del repo `smartbc` (rama `main`, commit `bd5dbdf`) | Rutas, componentes, server actions, permisos, contratos públicos |
| `app-paths-manifest.json` del build | Qué rutas existen REALMENTE compiladas (no solo ficheros sueltos) |
| PostgreSQL de producción (`supabase-db` en el VPS Hetzner) | **Solo lecturas.** Esquema real, conteos exactos, cobertura de datos |
| `storage.buckets` / `storage.objects` de producción | Media real almacenada |
| `app_settings` de producción | Qué está activado de verdad |

**Regla aplicada:** una tabla que existe no es una funcionalidad. Cada
afirmación de estado va acompañada de evidencia — ruta de fichero, conteo de
filas o valor de configuración.

### Leyenda de estados

| Estado | Significado |
|---|---|
| 🟢 **ACTIVE** | Implementado, enlazado en UI y con datos/uso en producción |
| 🟡 **PARTIAL** | Implementado pero incompleto, o completo pero sin uso real todavía |
| 🔵 **UNUSED** | Código funcional, alcanzable, 0 uso en producción |
| ⚫ **LEGACY** | Sustituido por otra cosa; sigue en el árbol |
| 🔴 **DEAD** | No alcanzable, roto, o apunta a algo que no existe |
| ⚪ **PLANNED** | Solo tabla/tipo; sin superficie de producto |

---

## 0.1 · Retrato de producción en una pantalla

```
USUARIOS                    CARTERA                      ACTIVIDAD COMERCIAL
14 cuentas totales          1.318 propiedades            9 SmartLinks (todos
  4 admin (es)                680 disponibles              auto-generados por
  2 agent_senior (cl)         638 archivadas               Viewing Collections)
  1 advisor (es)                                         33 aperturas SmartLink
  7 client                  680 disponibles:             2 itinerarios (draft)
                              602 de agencias socias     2 colecciones (revocadas)
CONTENIDO                     78 propias                124 aperturas de colección
31.750 fotos (4,4 GB)                                   11 selecciones de cliente
   26 props con vídeo       Zonas: Salamanca 414,        1 visita registrada
    0 props con plano*      Chamberí 92, Retiro 83       2 solicitudes de docs
  101 filas property_media                              322 leads de Idealista
                                                          (291 sin triar)
```
\* 1 plano existe, pero en una propiedad archivada.

**Lectura de producto:** el CRM está *poblado de inventario* y *vacío de
recorrido comercial*. Todo el flujo cliente → selección → visita → operación
tiene volúmenes de uno o dos dígitos bajos. Lo único con volumen real es la
entrada de inventario (sindicación, scraping de particulares) y la entrada de
leads (Idealista).

---

# 1 · Arquitectura de información del CRM

## 1.1 · Mapa del producto

```
                          ┌──────────────────────────────────────┐
                          │  portal.bcousinoprop.com  (Next 15)  │
                          └──────────────────────────────────────┘
                                          │
       ┌──────────────────────┬───────────┴───────────┬────────────────────┐
       │                      │                       │                    │
  ── STAFF ──            ── CLIENTE ──           ── PÚBLICO ──        ── MÁQUINAS ──
  /{country}/admin/*     /inicio                 /compartir/{slug}     /api/v1/*
  (es | cl)              /propiedades            /c/{token}            /api/webhooks/*
                         /favoritos              /v/{token}            /api/extension/*
                         /documentacion          /p/{slug}/{idx}       /api/cron/*
                         /mensajes               /web/*  (marketing)
                         /perfil                 /og/property/{slug}
```

Dos árboles de admin conviven:

* **`app/[country]/(admin)/admin/**`** — el árbol vivo. Todo el menú apunta
  aquí (`components/admin-sidebar.tsx:115` reescribe `/admin` → `/{country}/admin`).
* **`app/(admin)/admin/**`** — **casi todo son redirecciones de 8 líneas** al
  árbol de país. Solo **dos** páginas reales sobreviven ahí, y ninguna está en
  el menú: `/admin/analytics` y `/admin/security/ip-management`.

## 1.2 · Inventario de módulos

| # | Módulo | Ruta real | Objetivo | Usuarios | Entidades | Estado |
|---|---|---|---|---|---|---|
| 1 | **Dashboard** | `/{c}/admin` | KPIs + últimas propiedades/visitas | staff | properties, profiles, visit_requests, property_shares | 🟢 ACTIVE |
| 2 | **Propiedades** | `/{c}/admin/propiedades`, `.../[slug]` | Cartera; ficha editable | staff c/ `properties.view` | properties, property_photos, property_media, property_shares | 🟢 ACTIVE |
| 3 | **Importar propiedad** | `/{c}/admin/propiedades/importar` | Alta desde link de portal | staff | properties | 🟢 ACTIVE |
| 4 | **Agencias** | `/{c}/admin/agencias` (solo `es`) | Agencias colaboradoras y comisiones | staff c/ `agencias` | agencies (5), agency_partnerships (3) | 🟡 PARTIAL |
| 5 | **Sindicación** | `/{c}/admin/sindicacion` (solo `es`) | Feeds de agencias → cartera | staff c/ `sindicacion` | agency_feeds (4), sync_logs (32) | 🟢 ACTIVE |
| 6 | **Particulares** | `/{c}/admin/particulares` + `/scraper` (solo `es`) | Anuncios de particular scrapeados (Idealista/Fotocasa/Pisos) | staff c/ `particulares` | particulares (10.750), particulares_changes (15.690) | 🟢 ACTIVE |
| 7 | **Captaciones** | `/{c}/admin/captaciones`, `/pipelines` (solo `cl`) | Pipeline de captación Chile | staff c/ `captaciones` | captaciones (0), captacion_* (0) | 🔵 UNUSED |
| 8 | **Publicación** | `/{c}/admin/publicacion` | Publicar en Idealista (es) / PortalInmobiliario (cl) | staff c/ `publicacion` | idealista_listings (31), property_media | 🟡 PARTIAL |
| 9 | **Idealista** | `/{c}/admin/idealista` + `/configuracion` (solo `es`) | Panel de anuncios, vídeos, música, Partner API | staff c/ `publicacion` | idealista_listings, idealista_config (0), video_music_tracks (0) | 🟡 PARTIAL |
| 10 | **PortalInmobiliario** | `/{c}/admin/portalinmobiliario` | Conexión MercadoLibre Chile | staff | app_settings `ml.chile.*` | 🟡 PARTIAL (tokens vacíos) |
| 11 | **Clientes** | `/{c}/admin/clientes`, `.../[id]` | Base de clientes + ficha | staff c/ `clientes` | profiles (7 client), client_preferences (2), client_tags (10) | 🟡 PARTIAL |
| 12 | **Solicitudes** | `/{c}/admin/solicitudes` | Inbox unificado: visitas + consultas web + leads Idealista | staff c/ `solicitudes` | visit_requests (1), contact_requests (0), idealista_leads (322) | 🟢 ACTIVE |
| 13 | **Solicitudes · Documentación** | `/{c}/admin/solicitudes-documentacion` | Expedientes de candidatura y documentos | staff c/ `solicitudes` | property_applications (2), *_documents (0) | 🔵 UNUSED |
| 14 | **Leads (Zinto)** | `/{c}/admin/leads` | Leads/campañas sincronizados de Zinto | staff c/ `solicitudes` | zinto_leads (0), zinto_campaigns (0) | 🔵 UNUSED |
| 15 | **Calendario** | `/{c}/admin/calendario` | Agenda interna de eventos | staff c/ `calendario` | calendar_events (0), visit_requests | 🔵 UNUSED |
| 16 | **Mensajes** | `/{c}/admin/mensajes` (4 pestañas) | Clientes · WhatsApp · Equipo · Zinto | staff c/ `mensajes` | conversations (0), messages (0), zinto_conversations (57), team_* (0) | 🟡 PARTIAL |
| 17 | **Viewing Collections** | Bloques en ficha de cliente + `/v/*` | Selección → itinerario → libro privado | staff c/ `viewing_collections` | client_property_selections (11), viewing_itineraries (2), viewing_stops (3), viewing_collection_shares (2) | 🟢 ACTIVE (nuevo) |
| 18 | **Reportes** | `/{c}/admin/reportes` | 4 KPIs + zonas + operación | staff c/ `reportes` | properties, profiles, visit_requests | 🟡 PARTIAL (1 KPI roto) |
| 19 | **Analytics** | `/admin/analytics` ⚠️ solo árbol legacy | Dashboard de tráfico (KPIs, timeline, dispositivo, geo, top props) | staff | page_views (122), page_events (432) | 🔴 huérfano — no está en el menú |
| 20 | **Usuarios** | `/{c}/admin/usuarios` | Alta, roles, permisos por usuario | staff c/ `usuarios` | profiles (14), permissions (105), user_permission_overrides (0) | 🟢 ACTIVE |
| 21 | **Integraciones** | `/{c}/admin/integraciones`, `.../[slug]` | Clientes de API, claves, log de peticiones | staff c/ `configuracion` | api_clients (1), api_keys (5), api_requests (9.068) | 🟢 ACTIVE |
| 22 | **Configuración** | `/{c}/admin/configuracion` | Empresa, IA, proxy, email SES, Zinto, migraciones | staff c/ `configuracion` | app_settings (22) | 🟢 ACTIVE |
| 23 | **Diagnóstico** | `/{c}/admin/diagnostico` (solo `es`) | Salud técnica | staff c/ `diagnostico` | — | 🟢 ACTIVE |
| 24 | **Seguridad IP** | `/admin/security/ip-management` ⚠️ solo legacy | Whitelist/blacklist de IPs | staff | ip_whitelist (0), ip_blacklist (0), ip_activity_log (0) | 🔵 UNUSED + huérfano |
| 25 | **Demo setup** | `/{c}/admin/demo-setup` | Sembrar datos de demo | staff c/ `configuracion` | — | 🟡 herramienta interna |
| 26 | **Web pública** | `/web/*` (dominio `bcousinoprop.com`) | Sitio de marketing + catálogo | anónimo | properties | 🟢 ACTIVE |
| 27 | **Portal de cliente** | `/inicio`, `/propiedades`, `/favoritos`, `/documentacion`, `/mensajes`, `/perfil` | Área privada del cliente | rol `client` | favorites (0), client_preferences (2) | 🟡 PARTIAL |

### Dependencias entre módulos (las que importan)

```
Sindicación ──feeds──▶ Propiedades ──▶ SmartLinks ──▶ Viewing Collections
                            │                              ▲
                            ├──▶ Publicación ──▶ Idealista │
                            │                               │
Particulares ──▶ (captación manual) ──▶ Propiedades         │
                                                            │
Solicitudes ──"Preparar visitas"──▶ Clientes ───────────────┘
     ▲                                   │
     ├── visit_requests (portal)         └──▶ Documentación (applications)
     ├── contact_requests (web)
     ├── idealista_leads (extensión Chrome)
     └── zinto (WhatsApp)
```

---

# 2 · Agent journey real

El flujo del brief **no** refleja el código. Este es el real:

```
┌─ ENTRADA DE LEAD ───────────────────────────────────────────────────┐
│                                                                      │
│  A) Idealista → extensión Chrome → POST /api/extension/idealista-    │
│     leads → tabla idealista_leads          [322 · la vía dominante]  │
│                                                                      │
│  B) Web pública → /api/portal/contact → contact_requests   [0 filas] │
│                                                                      │
│  C) Portal de cliente → visit_requests                    [1 fila]   │
│                                                                      │
│  D) WhatsApp (Zinto) → webhook → zinto_conversations      [57]       │
│                                                                      │
│  E) Zinto Leads API → zinto_leads                         [0 · off]  │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
              /{country}/admin/solicitudes  — inbox unificado
              6 pestañas: Pendientes · Confirmadas · Completadas ·
                          Rechazadas · Consultas · Idealista
                                  │
              ┌───────────────────┴───────────────────┐
              │                                       │
     [Triaje del lead]                     [Botón "Preparar visitas"]
     · estado: nuevo/fichado/descartado    · busca cliente por email →
     · tipo: particular/agencia/relocation    teléfono → últimos 9 dígitos
     · contacto: WhatsApp / llamada        · ofrece VINCULAR o CREAR
     · asignar a staff                     · nunca vincula solo
     · match manual a propiedad            · si el lead trae propiedad,
     · traducción IA del mensaje              la mete en la selección
                                                      │
                                                      ▼
                          /{country}/admin/clientes/[id]  — ficha
                          ┌─────────────────────────────────────┐
                          │ Favoritos │ SELECCIÓN │ ITINERARIOS │
                          │           │           │ Sugeridas   │
                          │           │           │ Visitas     │
                          └─────────────────────────────────────┘
                                       │
                     ┌─────────────────┴──────────────────┐
                     ▼                                    ▼
        client_property_selections            viewing_itineraries
        (favorito | búsqueda | manual)        + viewing_stops (paradas)
                                                          │
                                    ┌─────────────────────┤
                                    ▼                     ▼
                          SmartLink por parada      Publicar colección
                          (property_shares)         (token /v/{token})
                                    │                     │
                                    ▼                     ▼
                            /c/{token}              /v/{token}
                            ficha de 1 piso         PRIVATE BOOK
                            con tracking            (libro paginado)
```

## 2.1 · Dónde se corta el recorrido

| Eslabón del brief | Realidad |
|---|---|
| Lead → Cliente | ✅ Existe y está bien resuelto (`prepare-visits-actions.ts`) |
| Cliente → Preferences | ⚠️ `client_preferences` solo lo edita **el propio cliente** desde `/inicio`. El agente **no puede** editarlas desde la ficha. 2 filas en total |
| Property discovery | 🟡 Dos vías: búsqueda manual (`property-selection-search.tsx`) y sugeridas (score rule-based) |
| Selection | ✅ `client_property_selections` |
| Viewing Itinerary | ✅ `viewing_itineraries` + `viewing_stops` |
| Visita | 🟡 `visit_requests` existe y se puede vincular a una parada, pero solo hay **1 fila** en toda la BD |
| SmartLink | ✅ pero **los 9 SmartLinks de producción los creó el publicador de colecciones**, ninguno a mano |
| Application | 🔴 `property_applications`: 2 filas (1 draft, 1 rejected), 0 documentos |
| Documentación | 🔴 sin uso |
| Negotiation / transaction | ⚪ **No existe.** No hay entidad de oferta, reserva, contrato ni cierre |
| Follow-up | ⚪ **No existe.** No hay tareas, recordatorios ni próximos pasos |

---

# 3 · Solicitudes

Ruta: `app/[country]/(admin)/admin/solicitudes/page.tsx` → `solicitudes-admin-client.tsx` (1.663 líneas).

## 3.1 · Anatomía

Una sola página con **5 tarjetas de KPI** y **6 pestañas**. Las pestañas mezclan
tres entidades distintas que no comparten modelo:

| Pestaña | Entidad | Filas en prod |
|---|---|---|
| Pendientes / Confirmadas / Completadas / Rechazadas | `visit_requests` | 1 |
| Consultas | `contact_requests` | 0 |
| Idealista | `idealista_leads` | 322 |

## 3.2 · Comparativa por fuente

| Capacidad | `visit_requests` | `contact_requests` | `idealista_leads` |
|---|:---:|:---:|:---:|
| Origen | portal de cliente | formulario web | extensión Chrome |
| Cliente asociado | ✅ FK `client_id` | ❌ solo texto | ❌ solo texto |
| Propiedad asociada | ✅ FK `property_id` | ❌ | 🟡 `matched_property_id` (manual/auto) |
| Estados | pending/confirmed/completed/cancelled | pending/read | nuevo/fichado/descartado |
| Sub-estado de contacto | ❌ | ❌ | ✅ `contact_status` (WhatsApp/llamada) |
| Tipificación | ❌ | ❌ | ✅ particular / agencia / relocation |
| Asignación a agente | ✅ `assigned_to` | ❌ | ✅ `assigned_to` + `assigned_at` |
| Notas | ✅ `notes` | ❌ | ❌ |
| Mensaje del lead | ❌ | ✅ | ✅ + **traducción IA** + detección de idioma |
| Foto de la propiedad | ❌ | ❌ | ✅ `property_image_url` |
| Avatar del contacto | ❌ | ❌ | ✅ `avatar_url` |
| "Preparar visitas" | ✅ | ✅ | ✅ |
| País | ✅ | ❌ (global) | ✅ (pero el inbox es `es` global) |

## 3.3 · Acciones disponibles hoy

**Sobre una solicitud de visita:** confirmar · cancelar. Nada más — no se puede
reprogramar, ni asignar desde la UI, ni añadir nota.

**Sobre un lead de Idealista:** marcar nuevo/fichado/descartado · tipificar ·
marcar contactado por WhatsApp · abrir WhatsApp con el número · copiar teléfono ·
traducir el mensaje con IA · vincular/desvincular propiedad (con buscador) ·
asignar a staff · abrir modal de detalle.

**Sobre una consulta web:** marcar como leída. Nada más.

**Transversal:** buscador de texto sobre todas las pestañas, filtros por estado /
tipo / operación en la pestaña de Idealista, y el botón **"Preparar visitas"**.

## 3.4 · Estado real del triaje

```
idealista_leads (322)
  nuevo        291  ← 90% sin tocar
  descartado    23
  fichado        5
  ---
  con propiedad vinculada  132 (41%)
  con agente asignado        1 (0,3%)
  con lead_type asignado     5 (1,5%)
```

## 3.5 · UX actual

Tarjetas apiladas, sin tabla ni vista de lista densa. Sin paginación en
servidor (`getIdealistaLeads()` carga todo y filtra en cliente). Sin ordenación
configurable. Sin acciones en lote. Sin vista de "míos" vs "todos".

---

# 4 · Client profile

Ruta: `app/[country]/(admin)/admin/clientes/[id]/client-ficha-view.tsx` (626 líneas).

## 4.1 · Bloques que existen

```
┌── Barra superior ─────────────────────────────────────────────────┐
│  ← Volver          [🔔 campana]  [Selector de idioma]             │
└───────────────────────────────────────────────────────────────────┘
┌── Cabecera ───────────────────────────────────────────────────────┐
│  ⬤ Iniciales    Nombre Apellido                    [Enviar mensaje]│
│                 ● Estado · Perfil · ★Prioridad                     │
│  ─────────────────────────────────────────────────────────────────│
│  CONTACTO   ✉ email    ☎ teléfono    📍 ubicación                 │
└───────────────────────────────────────────────────────────────────┘
┌── 4 tarjetas de actividad ────────────────────────────────────────┐
│  👁 Vistas   ♡ Favoritos   📅 Visitas   💬 Mensajes                │
└───────────────────────────────────────────────────────────────────┘
┌── Columna izq (1fr) ──────────┐ ┌── Columna dcha (1.4fr) ─────────┐
│  PREFERENCIAS                 │ │  FAVORITOS  (+ añadir a selecc.)│
│   operación · estancia · zona │ │  SELECCIÓN DE PROPIEDADES       │
│   presupuesto · ocupantes ·   │ │  ITINERARIOS DE VISITA          │
│   mascotas                    │ │  PROPIEDADES SUGERIDAS          │
│  NOTAS INTERNAS               │ │  VISITAS                        │
└───────────────────────────────┘ └─────────────────────────────────┘
```

## 4.2 · Qué se puede hacer y qué no

| Bloque | Ver | Editar | Evidencia |
|---|:---:|:---:|---|
| Datos de contacto | ✅ | ❌ | solo `mailto:` / `tel:` |
| Preferencias | ✅ | ❌ | no hay formulario; las edita el cliente en `/inicio` |
| Notas internas | ✅ | ❌ | render de `client_preferences.notes`, sin caja de escritura |
| Favoritos | ✅ | ➕ añadir a selección | `favorites` tiene **0 filas** en prod |
| Selección | ✅ | ✅ estado, notas, quitar | `selected-properties-block.tsx` |
| Itinerarios | ✅ | ✅ crear, editar, publicar, revocar | `viewing-itineraries-block.tsx` |
| Sugeridas | ✅ | ➕ añadir a selección | score rule-based |
| Visitas | ✅ | ❌ | solo lista de solo lectura |
| Campana 🔔 | — | — | **botón sin `onClick`** (`client-ficha-view.tsx:132`) |
| Enviar mensaje | — | — | `<Link>` a `/mensajes`, **sin preseleccionar el cliente** |

## 4.3 · ⚠️ Datos que la ficha muestra pero NO lee de la base de datos

`lib/db/adapters.ts:172-203` — el adaptador **inventa** estos valores:

| Campo mostrado | Valor real en el código | Nota |
|---|---|---|
| Estado del cliente | `"active"` **hardcoded** | Todos los clientes salen "activo" |
| Asesor asignado | `"—"` **hardcoded** | No existe columna de agente asignado en `profiles` |
| Prioridad | `"normal"` **hardcoded** | La insignia ★ nunca se puede activar |
| Sector | `"Madrid"` **hardcoded** | |
| Actividad · propiedades vistas | `0` **hardcoded** | Existe `page_views`, no se consulta |
| Actividad · mensajes | `0` **hardcoded** | Existe `messages`, no se consulta |
| Ubicación | `undefined` | La fila `📍` nunca aparece |

## 4.4 · Datos que existen en BD y NO se muestran

| Dato | Dónde vive | Por qué importa |
|---|---|---|
| **34 campos de preferencia** | `client_preferences` | La ficha muestra 6. Los otros 28 incluyen `min_bedrooms`, `max_bedrooms`, `min_bathrooms`, `min/max_square_meters`, `available_from`, `preferred_regions/communes/sectors`, `preferred_geofence_zones`, `requires_service_bedroom`, `preferred_architectural_types`, `min/max_parking_spaces`, `prefers_condominium`, `preferred_orientations`, `min_floors`, `currency_preference`, `min/max_price_uf` |
| **Etiquetas de cliente** | `client_tags` (10 def.) + `client_tag_assignments` (**0 asignaciones**) | Solo se usan para derivar `profileType` |
| **Universidades** | `client_preferences.universities` | Existe `CampusDistance` en la web pública, no en la ficha |
| **Analítica del cliente** | `page_views.session_id` | No hay relación sesión ↔ cliente |
| **Aperturas de SmartLink** | `property_share_opens` (33) | No aparecen en la ficha |
| **Aperturas de colección** | `viewing_collection_opens` (124) | No aparecen en la ficha |
| **Conversación de WhatsApp** | `zinto_conversations.client_id` | La ficha no la enlaza |
| **Expedientes** | `property_applications` | La ficha no los enlaza |

**No existe timeline ni historial de actividad de ningún tipo.**

---

# 5 · Property model

`properties` tiene **58 columnas**. Agrupadas por lo que permiten *presentar*:

### 5.1 · Public / client-safe
`slug` · `title` · `title_rent` · `description` · `property_type` · `operation` ·
`operations[]` · `stay` · `price` · `rent_price` · `currency` · `currency_display` ·
`bedrooms` · `bathrooms` · `square_meters` · `covered_area_m2` · `parking_lots` ·
`features[]` · `features_manual[]` · `bc_reference` · `property_reference` ·
`floors` · `is_condominium` · `construction_year` · `available_from`

### 5.2 · Commercial / internal
`status` (available/reserved/sold/archived) · `archived_at` · `internal_notes` ·
`agency_id` · `published_web` · `last_synced_at`

### 5.3 · Owner
`owner_name` · `owner_phone` · `owner_email` — **3 columnas planas.** No hay tabla
de propietarios, ni varios contactos, ni relación con `profiles`.

### 5.4 · Source
`source` (`manual` | `scrape` | `api`) · `external_id` · `source_url` ·
`portalinmobiliario_id` · `portalinmobiliario_published_at` · `portalinmobiliario_sync_status`

### 5.5 · Location
`address` · `zone` · `subzone` · `sector` · `commune` · `region` · `country` ·
`latitude` · `longitude` · `geocoded_at` · `country_id` · `region_id` ·
`commune_id` · `sector_id`

### 5.6 · Characteristics
Solo lo del bloque público. **No hay campos estructurados** de orientación,
estado de conservación, certificado energético, planta, ascensor, exterior/interior.

### 5.7 · Building
`building_features` (jsonb) · `floors` · `is_condominium` · `construction_year`.
**`building_features` está a 0 en las 680 propiedades disponibles.**

### 5.8 · Amenities
`features[]` + `features_manual[]` — **arrays de texto libre**. Ver §13.

### 5.9 · Media
`cover_photo_url` + tablas `property_photos` (31.750) y `property_media` (101).
**No hay campo de 360/VR/tour virtual** en ninguna de las tres.

### 5.10 · Availability
`status` · `available_from` · `stay` (short/long) · `archived_at`

### 5.11 · Financial
`price` · `rent_price` · `currency` · `currency_display`.
**No hay** gastos de comunidad, IBI, ni comisión a nivel de propiedad
(la comisión vive en `agency_partnerships`, a nivel de agencia).

### 5.12 · SEO / publishing
`slug` · `published_web` · `legacy_slugs` (tabla de redirección) · endpoint
`/og/property/{slug}` (JPEG 1200×630, cache 24 h).

### 5.13 · Analytics
Ninguna columna. Se une por `page_views.property_id` y `property_shares`.

### 5.14 · Lo que el modelo NO puede representar hoy

* Unidad dentro de un edificio / desarrollo (no hay entidad "building" ni "project")
* Amenities de edificio separadas de las de la unidad
* Fases de entrega, plan de pagos, obra nueva (Idealista Partner API además la rechaza)
* Varias operaciones con precios independientes más allá del par venta/alquiler
* Documentos de propiedad (nota simple, ITE, certificado energético)
* Histórico de precios (existe `property_prices`, **0 filas**)
* Especificaciones arquitectónicas (existe `property_architectural_specs`, **0 filas**)

---

# 6 · Cobertura real de datos

Muestra: **680 propiedades con `status='available'`** (producción, 2026-08-18).

| Campo | Cobertura | % | Lectura |
|---|---:|---:|---|
| Precio | 680 | **100%** | ✅ |
| Zona | 680 | **100%** | ✅ pero texto libre |
| Dormitorios | 680 | **100%** | ✅ |
| Baños | 680 | **100%** | ✅ |
| Descripción (>50 car.) | 680 | **100%** | ✅ |
| Moneda | 680 | **100%** | ✅ |
| m² | 679 | **99,9%** | ✅ |
| Foto de portada | 675 | **99,3%** | ✅ |
| **Fotos (≥1)** | **675** | **99,3%** | ✅ media **23,8** por propiedad |
| URL de origen | 676 | 99,4% | |
| Features (≥1) | 664 | **97,6%** | ⚠️ texto libre, no estructurado |
| Tipo de propiedad | 604 | **88,8%** | ⚠️ valores inconsistentes |
| Estancia (short/long) | 211 | 31,0% | solo aplica a alquiler (217) |
| **Dirección completa** | **156** | **22,9%** | 🔴 |
| **Coordenadas** | **98** | **14,4%** | 🔴 |
| `available_from` | 44 | 6,5% | 🔴 |
| **Vídeo** | **26** | **3,8%** | 🔴 |
| **Subzona** | **0** | **0%** | 🔴 columna vacía |
| **Building features** | **0** | **0%** | 🔴 columna vacía |
| **Plano** | **0** | **0%** | 🔴 (1 plano existe, en propiedad archivada) |
| **Datos de propietario** | **2** | **0,3%** | 🔴 |
| Notas internas | 2 | 0,3% | 🔴 |
| Año de construcción | 2 | 0,3% | 🔴 |
| Plantas | 2 | 0,3% | 🔴 |
| Plazas de garaje | 2 | 0,3% | 🔴 |
| **`published_web`** | **1** | **0,1%** | ⚠️ ver nota |
| **360 / VR** | — | — | 🔴 **el campo no existe** |

### Detalle de fotos (las 675 con fotos)

```
≥ 5 fotos    622  (92%)
≥ 10 fotos   586  (87%)
≥ 20 fotos   424  (63%)
máximo        99
total     16.034 fotos en propiedades disponibles
          31.750 fotos en total (4,4 GB en el bucket properties-photos)
```

### ⚠️ Tres matices que cambian la lectura

**1. La cartera es mayoritariamente ajena.**

| Origen | Agencia | Disponibles |
|---|---|---:|
| `scrape` | Housingo | 368 |
| `scrape` | Level Real Estate | 154 |
| `scrape` | UrbantecHome | 80 |
| `manual` | Portales externos | **78** |

Solo **78 propiedades (11%)** se han dado de alta a mano. Las otras 602 llegan
por sindicación de agencias socias.

**2. La calidad se concentra en las manuales.** De las 78 manuales:
69 con coordenadas (88%) · 76 con dirección (97%) · 78 con `bc_reference` (100%).
En las sindicadas: coordenadas ~5%, dirección ~10%.

**3. `published_web` casi no se usa** — pero la web pública **no lo respeta**:
`lib/portal-fetch.ts:30` filtra por `status in ('available','reserved')` y
`archived_at is null`, **sin mirar `published_web`**. El sitio de marketing
publica las 680, incluidas las 602 de agencias socias.

### Tipo de propiedad: valores sin normalizar

```
Piso 461 · (vacío) 76 · apartamento 37 · Ático 35 · piso 21 · estudio 19
Dúplex 6 · Chalets-independientes 4 · Oficina 3 · Chalet Independiente 3
Adosados 3 · atico 3 …
```
`Piso`/`piso` y `Ático`/`atico`/`atico` son el mismo tipo escrito de tres formas.

---

# 7 · Property admin experience

Ruta: `/{country}/admin/propiedades/[slug]` → `property-edit-view.tsx` (1.701 líneas).
Página única, scroll largo, sin pestañas.

## 7.1 · Anatomía

```
┌─ Cabecera ────────────────────────────────────────────────────────┐
│  Título · referencia · estado                                     │
│  ACCIONES RÁPIDAS:                                                │
│   [Ver como cliente ▾]  (venta / alquiler si es dual)             │
│   [Copiar SmartLink]                                              │
│   [Descargar PDF ▾]     (venta / alquiler)                        │
│   [Descargar fotos .zip]                                          │
│   [Eliminar propiedad]                                            │
└───────────────────────────────────────────────────────────────────┘
① Datos básicos ...... título, descripción (+ 🪄 generar con IA), precio,
                       operación(es), estancia, tipo, hab/baños/m², zona,
                       dirección, estado, mapa con pin arrastrable
② Propietario ........ nombre · teléfono · email  (3 campos planos)
③ Características .... auto-detectadas (solo lectura) + manuales (chips)
④ SmartLinks ......... crear con etiqueta · copiar · borrar · aperturas
⑤ Fotos .............. modal de gestión · reordenar · portada ·
                       "Quitar marca de agua" (IA, requiere ≥8 fotos)
⑥ Vídeos ............. subir .mp4 (≤500 MB) · pegar URL · GENERAR VÍDEO
                       automático (Ken Burns + logo + música)
⑦ Planos ............. subir · borrar
⑧ Web pública ........ interruptor `published_web`
```

## 7.2 · Qué NO hay en la ficha de propiedad

| Ausencia | Consecuencia |
|---|---|
| **Visitas** | No se ve quién ha visitado ni cuándo |
| **Clientes relacionados** | No se ve qué clientes la tienen en selección/favoritos |
| **Analítica** | Las aperturas de SmartLink salen por link, pero no hay vistas, tiempo, fotos vistas |
| **Estado de Idealista** | Se publica desde otro módulo (`/publicacion`, `/idealista`); la ficha no dice si está publicada |
| **Expedientes** | No se ve si hay `property_applications` sobre ella |
| **Notas internas** | La columna existe y se guarda, pero **no hay bloque en el formulario** |
| **Historial** | No hay registro de cambios ni de precios |
| **Disponibilidad** | Solo el enum `status`; no hay calendario ni bloqueos |

## 7.3 · Media — límites reales por vía

| Vía | Ruta | Foto | Vídeo | Plano | Bucket |
|---|---|---:|---:|---:|---|
| Ficha de propiedad | `/api/admin/properties/upload-video` | — | **500 MB** | — | `properties-photos` ✅ |
| Publicación | `/api/admin/publicacion/upload-media` | 10 MB | 100 MB | 20 MB | `property-media` 🔴 **el bucket NO existe** |

Los buckets reales en producción son: `properties-photos` (32.000 objetos,
4,4 GB) · `agencies-logos` · `avatars` · `property-application-documents`
(32 objetos) · `video-music` (0). **`property-media` no está entre ellos**, así
que `app/api/admin/publicacion/upload-media/route.ts:39` sube a un bucket
inexistente. Las 101 filas de `property_media` de producción apuntan todas a
`properties-photos` o a URLs externas (YouTube, `st3v.idealista.com`).

---

# 8 · SmartLinks — estado actual

Hay **cuatro** superficies públicas de propiedad, no dos.

## 8.1 · Cuadro comparativo

| | `/compartir/{slug}` | `/c/{token}` | `/p/{slug}/{idx}` | `/og/property/{slug}` |
|---|---|---|---|---|
| **Propósito** | Enlace estable por propiedad | Enlace único por envío | Proxy de foto | Imagen de previsualización social |
| **Fichero** | `app/compartir/[slug]/page.tsx` | `app/c/[token]/page.tsx` | `app/p/[slug]/[idx]/route.ts` | `app/og/property/[slug]/` |
| **Seguridad** | Ninguna — slug adivinable | Token aleatorio | Ninguna | Ninguna |
| **Caducidad** | Nunca | `expires_at` (**null en los 9 de prod**) | — | — |
| **Revocación** | ❌ | ✅ borrar el share | — | — |
| **Tracking** | ❌ | ✅ `property_share_opens` (IP + UA) + `page_views`/`page_events` | ❌ | ❌ |
| **Vista** | `PublicPropertyView` (809 líneas) | **la misma** | binario | JPEG 1200×630 |
| **Fotos** | ✅ galería | ✅ | ✅ sirve | portada |
| **Vídeo** | ✅ MP4 + YouTube + Vimeo | ✅ | — | — |
| **Planos** | ✅ | ✅ | — | — |
| **Mapa** | ✅ Leaflet, coords reales con geocoding cacheado; si no, centroide de barrio | ✅ | — | — |
| **Agente** | ❌ **contacto genérico BC**, no el agente | ❌ igual | — | — |
| **Acciones de contacto** | WhatsApp · email · teléfono (barra fija en móvil) | igual | — | — |
| **Solicitar visita** | ❌ requiere login | ❌ | — | — |
| **Favoritos** | ❌ | ❌ | — | — |
| **SEO** | ✅ indexable, canonical, OG, Twitter card | 🔒 `noindex, nofollow` | — | — |
| **Idioma** | 🔴 **castellano fijo** | 🔴 igual | — | es |
| **Móvil** | ✅ barra de contacto fija | ✅ | — | — |
| **Relación con cliente** | ninguna | ninguna (`property_shares` **no tiene** `client_id`) | — | — |
| **Permisos** | público | público | público | público |

## 8.2 · Qué puede hacer hoy el agente con un SmartLink

Desde la ficha de propiedad (bloque ④):

1. **Crear** un link con una etiqueta libre (p. ej. "Familia Pérez").
2. **Copiar** la URL al portapapeles (con fallback a `window.prompt`).
3. **Ver** el nº de aperturas y "hace X minutos" de la última.
4. **Borrar** el link.
5. Copiar el **enlace estable** desde la barra de acciones rápidas.

**No puede:** poner fecha de caducidad (`expires_at` existe en BD, no hay UI) ·
asignar el link a un cliente · elegir idioma · elegir qué se muestra · poner su
propio contacto en lugar del genérico · ver quién abrió (solo cuántas veces).

## 8.3 · Uso real

Los **9** `property_shares` de producción tienen etiquetas como
`"Viewing Collection · Paul · Paul's Monday visits · Stop 05"`. **Los generó el
publicador de colecciones**, no un agente. `expires_at` es `null` en los nueve.
Se han abierto 33 veces.

**Ningún agente ha creado un SmartLink a mano en producción.**

## 8.4 · Ficha pública: bloque a bloque

`app/compartir/[slug]/public-property-view.tsx`:

```
Cabecera BC + [WhatsApp] [Email]
Galería (PropertyGallery)
Título · precio · zona · ref
Specs: habitaciones · baños · m² · tipo
Descripción
Vídeos (hero + miniaturas)     ← solo si hay
Planos                          ← solo si hay
Características (agrupadas)
Mapa de zona (Leaflet)
Bloque de contacto BC
[Barra fija móvil: WhatsApp · Email · Teléfono]
```

---

# 9 · Viewing Collections / Private Book

El módulo más nuevo y el mejor integrado. Migraciones **0122–0133**.

## 9.1 · Estado final

| Aspecto | Estado |
|---|---|
| **Entry points** | Ficha de cliente (bloques Selección + Itinerarios) · Solicitudes → "Preparar visitas" · Favoritos → "Añadir a selección" · Sugeridas → "Añadir a selección" |
| **Selección** | `client_property_selections`. Origen trazado: `favorite` \| `search` \| `manual`. Estado + notas del agente por propiedad |
| **Itinerario** | `viewing_itineraries` (fecha, ventana horaria, zona horaria, idioma, estado) + `viewing_stops` (orden, hora, duración, confirmación, visibilidad de dirección, oculto para el cliente, notas, visita vinculada, SmartLink vinculado) |
| **Preview** | `/v/preview/{itineraryId}` — **mismo componente y misma proyección** que el cliente; autorizado por sesión de staff, funciona en borrador |
| **Private Book** | `/v/{token}` → `book-mode.tsx` (854 líneas): portada, índice, un spread por residencia, asesor, colofón |
| **Page-turn** | Giro real sobre el lomo (`rotateY` + perspectiva + sombra), ~700 ms (portada ~850 ms), **sin librería de flipbook**. Teclado ←/→ (invertido en RTL), swipe, clic. Degrada a fundido con `prefers-reduced-motion` |
| **Galería** | `private-gallery.tsx` (318 líneas), fotos siempre vía proxy `/p/{slug}/{idx}` |
| **Idiomas** | **8**: es · en · fr · it · de · ar · tr · he. `ar`/`he` en **RTL**. `ar`/`tr`/`he` marcados como *pendientes de revisión nativa* (`TRANSLATION_REVIEW_REQUIRED`) |
| **SmartLinks** | Un `property_shares` por parada, creado al publicar. Cae al enlace estable si falla, y el contrato lo marca (`smartLinkTracked: false`) |
| **Analytics** | `viewing_collection_opens` (124) + `page_views`/`page_events`: `collection_open`, `stop_view`, `stop_expand`, `share_click`, `time_on_page` |
| **Solicitudes** | "Preparar visitas" resuelve o crea el cliente y aterriza en su ficha. **No crea entidades nuevas**: es una segunda puerta al mismo sistema |
| **Publicación** | `publishItinerary()` / `unpublishItinerary()` |
| **Caducidad** | `app_settings.viewing_collections`: por defecto 60 días, máximo 180, renovación permitida |
| **Revocación** | `revokeCollectionShare()` + `renewCollectionShare()` |
| **Móvil** | El libro se hojea igual en móvil; residencia en 2 filas <768 px, 2 columnas ≥768 px |

## 9.2 · Modelo de seguridad — es el activo diferencial

`lib/viewing-collections/public-contract.ts` es una **lista de exclusión explícita**
revisada como código de seguridad:

> Prohibido, directa o anidadamente: UUIDs · `owner_*` · `internal_notes` ·
> `agent_notes` · `source_url` · `external_id` · `cover_photo_url` cruda ·
> comisiones · presupuesto o preferencias del cliente · etiquetas internas ·
> `property_shares.label` · email o teléfono del cliente · otros clientes.

Decisiones concretas:

* Solo el **nombre de pila** del cliente ("si reenvía el enlace, el apellido
  sería un dato personal extra sin ninguna ganancia").
* Los 6 estados internos de parada se **colapsan a 3** de cara al cliente.
* Caducado, revocado, inexistente y cancelado devuelven **exactamente la misma
  vista** con **200, no 404**: probar tokens no enseña nada.
* Ubicación: `exactAddress`+`exactLat/Lng` **o** `areaLocation`, nunca las dos.
* `areaLocation` es **siempre `null` en V1** por decisión explícita: no hay
  centroides fiables y "señalar un sitio incorrecto es peor que no señalar".
* `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` en cabecera HTTP
  (`next.config.ts`), además del `robots` del `<head>`.
* Metadatos deliberadamente genéricos, sin imagen OG.

## 9.3 · Uso real

2 itinerarios (ambos volvieron a `draft`), 3 paradas, 2 shares (**ambos revocados**),
**124 aperturas**. El módulo se ha usado de verdad con dos clientes y ha generado
más señal de engagement que todo el resto del CRM junto.

---

# 10 · Web pública de propiedades

Dominio `bcousinoprop.com` / `www.` → rewrite a `app/web` en `middleware.ts:44-56`.

| Sección | Ruta | Estado |
|---|---|---|
| Home | `/` → `/web` | 🟢 ACTIVE — "momentos" editoriales, universidades, destacadas |
| Catálogo | `/propiedades` | 🟢 ACTIVE — `CatalogClient`, revalidate 300 s |
| Ficha | `/propiedades/{id}` | 🟢 ACTIVE — 316 líneas |
| Nosotros | `/nosotros` | 🟢 ACTIVE |
| Contacto | `/contacto` | 🟢 ACTIVE → `contact_requests` (**0 filas**) |
| Off-market | `/off-market` | 🟢 ACTIVE |

| Capacidad | Estado | Nota |
|---|---|---|
| Búsqueda / filtros | 🟡 | Filtrado **en cliente** sobre hasta 1.000 propiedades |
| Mapa en ficha | ✅ | `PropertyLocationMap` — pero solo 14% tiene coordenadas |
| Mapa en catálogo | ❌ | No hay vista de mapa |
| Galería | ✅ | `PropertyGallery` |
| Vídeos | ✅ | `PropertyVideos` — 3,8% de cobertura |
| Planos | ❌ | No se renderizan en la web pública |
| Amenities | 🟡 | Chips de texto libre |
| Barrio / entorno | 🟡 | Solo `CampusDistance` (distancia a universidades, estimada, sin API) |
| Edificio | ❌ | |
| Agente | ❌ | Contacto genérico de oficina (Madrid / Santiago) |
| CTA / contacto | ✅ | Formulario → `contact_requests` |
| Solicitar visita | ❌ | |
| Favoritos | ❌ | Requiere login |
| Cuenta / login | ❌ | El sitio de marketing no enlaza al portal |
| Relacionadas | ❌ | |
| SEO | 🟡 | Sin `sitemap.xml`, sin `robots.txt`, sin datos estructurados |
| Idiomas | 🔴 | **Widget de Google Translate** (`GoogleTranslate.tsx`), no i18n real |
| Moneda | ✅ | `CurrencyProvider` + `/api/exchange-rate` — EUR/CLP/UF/USD |

**Hallazgo de producto:** la web publica las **680** propiedades disponibles
—incluidas las **602 sindicadas de otras agencias**— porque `fetchPortalProperties()`
ignora `published_web`.

---

# 11 · Client portal

Rol `client` (7 cuentas en producción). Protegido en `middleware.ts:97-125`.

| Ruta | Función | Estado |
|---|---|---|
| `/inicio` | Editor de preferencias + propiedades sugeridas | 🟢 ACTIVE — `client_preferences`: **2 filas** |
| `/propiedades` | Catálogo completo (hasta 2.000, filtrado en cliente) | 🟢 ACTIVE |
| `/propiedades/{id}` | Ficha + solicitar visita | 🟢 ACTIVE |
| `/favoritos` | Guardadas | 🔵 UNUSED — `favorites`: **0 filas** |
| `/documentacion` | Expedientes y subida de documentos | 🔵 UNUSED — 2 expedientes, 0 documentos |
| `/mensajes` | Hilo con el asesor | 🔵 UNUSED — `conversations`/`messages`: **0 filas** |
| `/perfil` | Datos y preferencias | 🟢 ACTIVE |

## 11.1 · Lo que el cliente NO tiene

* 🔴 **Viewing Collections** — el libro privado se entrega por token anónimo;
  no aparece en su área privada aunque tenga cuenta.
* 🔴 **Sus visitas** — puede solicitarlas, no puede consultarlas ni cancelarlas.
* 🔴 **Notificaciones** — `crm_notifications` es solo interno.
* 🔴 **Selección del agente** — no ve lo que el agente ha preparado para él.
* 🔴 **SmartLinks recibidos** — no hay histórico.
* 🔴 Analytics, propiedades, clientes, calendario, publicación, reportes,
  usuarios, configuración (correctamente cerrados por middleware).

## 11.2 · Nota de arquitectura

Los tres pilares de la experiencia de cliente —**Private Book**, **SmartLink**
y **portal de cliente**— son **tres sistemas independientes** sin puente entre
ellos. El portal es el único que requiere login y es el que menos se usa.

---

# 12 · Sistema de media

## 12.1 · Piezas

| Pieza | Qué es | Volumen prod |
|---|---|---|
| `property_photos` | Fotos. `url`, `alt`, `position`, `is_cover` | **31.750** |
| `property_media` | Vídeos y planos. `type`, `storage_path`, `url`, `has_watermark`, `format`, `width`, `height`, `duration_seconds`, `size_bytes`, `photos_fingerprint`, `music_track_id` | **101** (67 vídeo manual, 33 vídeo auto, 1 plano) |
| `property_video_jobs` | Cola de render | 12 |
| Bucket `properties-photos` | Público | 32.000 objetos · **4,4 GB** |
| Bucket `property-application-documents` | Privado | 32 objetos |
| Bucket `video-music` | Privado, música licenciada | **0 objetos** |
| Proxy `/p/{slug}/{idx}` | Sirve la foto `idx` en streaming | — |

## 12.2 · Proxy `/p/` — pieza reutilizable

`app/p/[slug]/[idx]/route.ts`. Neutraliza la URL: el cliente ve
`/p/titulo-3291/0.webp` en lugar de `…/properties-photos/synced/level/3415/0.webp`,
que delataría el portal de origen. Solo sirve propiedades no archivadas.
Deduplica por URL para que los índices casen con la galería. Cache 24 h.
**Es la única vía de imagen del Private Book.**

## 12.3 · Capacidades

| Capacidad | Estado |
|---|---|
| Orden de fotos | ✅ `position` + modal de reordenación |
| Portada | ✅ `is_cover` + `cover_photo_url` |
| Subida de fotos | ✅ modal en ficha |
| Borrado | ✅ |
| **Quitar marca de agua** | ✅ IA, reprocesa, requiere ≥8 fotos |
| **Vídeo automático** | ✅ Ken Burns; **sharp encuadra, ffmpeg anima**; logo + música; estimador **autocalibrado** con `app_settings.video_calibration` |
| URLs externas | ✅ YouTube, Vimeo, `.mp4` directo (`lib/video-embed.ts`) |
| Optimización | 🟡 `next/image` en admin y web; el proxy sirve el original tal cual |
| Formatos | 🟡 WebP en las sincronizadas; sin AVIF ni srcset por breakpoint |
| **360 / VR / tour** | 🔴 **no existe** |
| Watermark propia BC | 🔴 el flag `has_watermark` existe; no hay generador |

## 12.4 · Qué es reutilizable para una experiencia editorial

✅ 16.034 fotos con **media de 23,8 por propiedad** y 63% con ≥20 — material más
que suficiente para spreads editoriales.
✅ El proxy `/p/` ya da URLs neutras, indexables por posición.
✅ El pipeline `sharp` + `ffmpeg` ya encuadra sin recortar ni deformar.
🔴 Sin planos, sin 360, sin metadatos de foto (qué estancia, orientación).
🔴 Sin variantes por breakpoint: el libro sirve la misma imagen a móvil y a 4K.

---

# 13 · Amenities y datos de estilo de vida

## 13.1 · Cómo se modela hoy

**`properties.features` y `properties.features_manual` son `text[]` sin
vocabulario controlado.** No hay enum, ni catálogo, ni tabla, ni tags.

Las `features` se **auto-extraen de la descripción del anuncio** en cada
sincronización (subtítulo del bloque ③ de la ficha). Las `features_manual` las
escribe el agente a mano: **1 propiedad de 680 las tiene**.

## 13.2 · Qué hay realmente (histograma de producción, 680 disponibles)

```
Ascensor              507        Trastero              107
Aire acondicionado    417        Cocina equipada        90
Calefacción           360        Armario empotrado      82   ← duplicado de "Armarios…"
Reformado             294        Smart TV               79
Portero               275        Puerta de seguridad    75
Baño en suite         254        Segunda mano/buen…     57
Amueblado             246        Con ascensor           51   ← duplicado de "Ascensor"
Terraza               209        Amueblado y cocina…    48   ← concepto compuesto
Armarios empotrados   153        Consumo:               26   ← 🔴 basura de scraping
Balcón                151        Jardín                 24
Vestidor              126        Piscina                23
Garaje                117        Emisiones:             22   ← 🔴 basura de scraping
                                 2 baños                20   ← 🔴 no es una amenity
```

Tres patologías visibles:
1. **Duplicados semánticos** — `Ascensor` / `Con ascensor`; `Armarios empotrados` / `Armario empotrado`.
2. **Basura de scraping** — `Consumo:`, `Emisiones:` (etiquetas huérfanas del certificado energético).
3. **Contaminación** — `2 baños`, `4 habitaciones`, `1 baño` son specs, no amenities.

## 13.3 · Contra la lista del brief

| Amenity | Estructurado | Texto libre | Cobertura |
|---|:---:|:---:|---|
| Piscina | ❌ | ✅ | 23 / 680 (3,4%) |
| Terraza | ❌ | ✅ | 209 (31%) |
| Parking / garaje | 🟡 `parking_lots` (2 filas) | ✅ | 117 (17%) |
| Jardín | ❌ | ✅ | 24 (3,5%) |
| Portero / conserje | ❌ | ✅ | 275 (40%) |
| Amueblado | ❌ | ✅ | 246 (36%) |
| Seguridad | ❌ | ✅ | 75 (11%) |
| Smart home | ❌ | 🟡 solo "Smart TV" | 79 (12%) |
| Gimnasio | ❌ | ❌ | **0** |
| Spa / wellness | ❌ | ❌ | **0** |
| Coworking | ❌ | ❌ | **0** |
| Cine | ❌ | ❌ | **0** |
| Rooftop | ❌ | ❌ | **0** |
| Concierge (servicio) | ❌ | ❌ | **0** |

## 13.4 · Los tres niveles

| Nivel | Estado |
|---|---|
| **Unidad** | 🟡 texto libre, sin normalizar |
| **Edificio** | 🔴 `building_features` (jsonb) existe: **0 de 680 lo tienen** |
| **Barrio / lifestyle** | 🔴 **no existe** |

---

# 14 · Ubicación y barrio

| Nivel | Columna / tabla | Estado real |
|---|---|---|
| País | `country` (`es`/`cl`), `country_id` → `countries` | ✅ texto / 🔴 tabla **0 filas** |
| Región | `region`, `region_id` → `chile_regions` | 🔴 **0 filas** |
| Comuna | `commune`, `commune_id` → `chile_communes` | 🔴 **0 filas** |
| Ciudad | ⚠️ **no existe**; se deriva de `country` (`es`→"Madrid", `cl`→"Santiago") | 🔴 |
| Distrito / zona | `zone` (texto libre) | ✅ **100%** — Salamanca 414, Chamberí 92, Retiro 83 |
| Barrio / subzona | `subzone`, `sector`, `sector_id` → `chile_subzones` | 🔴 **0%** / tablas **0 filas** |
| Coordenadas | `latitude`, `longitude`, `geocoded_at` | 🟡 **14,4%** |
| Geofences | `geofence_zones` | 🔴 **0 filas** |
| Jerarquía | `location_hierarchies` | 🔴 **0 filas** |

## 14.1 · Lo que sí hay

* **`lib/madrid-zones.ts`** — taxonomía canónica de los **21 distritos de Madrid
  con sus barrios**. Escrita a mano, correcta, y **no conectada** a
  `properties.subzone`: se usa para agrupar zonas del scraper de particulares.
* **Geocoding** contra Nominatim (OpenStreetMap), gratuito, cacheado en BD.
  Se dispara **perezosamente** al abrir un SmartLink (`getOrComputePropertyCoords`).
* **Mapas** Leaflet + `react-leaflet` (autoalojado, sin Google Maps).
* **`lib/distance/estimate.ts`** — tiempos de viaje por **haversine con factores
  empíricos**, 100% determinista, sin API externa. La UI lo marca como aproximado.
* **`CampusDistance`** en la web pública — distancia a un catálogo de
  universidades (IE, IESE, ESCP, ESADE, Comillas, Navarra, CUNEF, UC3M, UAM…).

## 14.2 · ¿Hay algo comparable a un Lifestyle Index?

**No.** No hay lugares cercanos, transporte, colegios, restaurantes, comercio,
ni puntuación de barrio de ningún tipo.

Lo único cerca conceptualmente es `CampusDistance` — un índice de un solo eje
(distancia a universidades), estimado sin API, y **solo en la web de marketing**:
no está en el CRM, ni en el SmartLink, ni en el Private Book.

El propio código lo reconoce (`public-contract.ts:36-41`):

> *"En V1 siempre es null: no hay centroides fiables (`geofence_zones` y
> `location_hierarchies` están vacías, `chile_zones` no tiene coordenadas y el
> `ZONE_COORDS` del código cubre 7 de los 21 distritos de Madrid)."*

---

# 15 · Comunicaciones

| Canal | Implementación | Estado |
|---|---|---|
| **Email · transaccional** | AWS SES (`@aws-sdk/client-ses`) + nodemailer, config en `email_config` y `/configuracion` | 🟡 tabla `email_config` **0 filas** |
| **Email · plantillas** | `lib/email/templates.ts` — solo layout + escape; `password-reset.ts` | 🟡 **1 plantilla real** |
| **Email · desde SmartLink** | `mailto:` a la dirección genérica de BC | 🔴 enlace, no integración |
| **WhatsApp · Zinto** | Webhooks (`/api/webhooks/zinto`, `/zinto-integration`), inbox propio en `/mensajes?tab=whatsapp`, envío por `/api/admin/zinto/send` | 🟡 **57 conversaciones, 0 mensajes** en `zinto_messages` |
| **WhatsApp · leads** | `whatsapp-lead-button.tsx` en Solicitudes | 🟡 abre `wa.me`, marca `contact_status` |
| **WhatsApp · público** | `wa.me/{numero}?text=…` con ref y título prerrellenados | 🔴 **enlace, no integración** |
| **Teléfono** | `tel:` | 🔴 enlace |
| **Mensajes cliente↔asesor** | `conversations` + `messages`, UI en ambos lados | 🔵 **0 filas** |
| **Chat de equipo** | `team_channels`, `team_messages`, `team_direct_*` + `team-chat.tsx` (1.124 líneas) | 🔵 **0 filas en las 5 tablas** |
| **Notificaciones internas** | `crm_notifications` + `notifications-bell.tsx` | 🟡 145 filas, **todas `captacion_*` de Chile, todas sin leer** |
| **Recordatorios** | — | 🔴 **no existen** |
| **Compartir** | Copiar SmartLink · WhatsApp · email · OG cards | ✅ |
| **Plantillas de mensaje** | — | 🔴 no existen para WhatsApp ni email comercial |

## 15.1 · Integración real vs enlace

| Real (la app envía/recibe) | Enlace (abre otra app) |
|---|---|
| SES para email transaccional | `mailto:` en SmartLinks y ficha de cliente |
| Webhooks entrantes de Zinto | `wa.me` en SmartLinks |
| `POST /api/admin/zinto/send` | `wa.me` en Solicitudes |
| Mensajes cliente↔asesor (BD propia) | `tel:` |
| Chat de equipo (BD propia) | |

---

# 16 · Documentos y transacción

| Pieza | Tabla | Filas prod | Estado |
|---|---|---:|---|
| Expedientes | `property_applications` | **2** (1 draft, 1 rejected) | 🔵 UNUSED |
| Co-solicitantes | `property_application_co_applicants` | 0 | 🔵 |
| Documentos | `property_application_documents` | 0 | 🔵 |
| Tipos de documento | `property_application_document_types` | 25 | ✅ catálogo |
| Puntuación | `property_application_scores` | 0 | 🔵 |
| Anotaciones IA | `property_application_document_annotations` | 0 | 🔵 |
| Objetos en storage | bucket privado | 32 | |

## 16.1 · Lo que SÍ está construido

* **Ciclo de estados**: `draft → pending_review → approved | rejected | completed`.
* **Estados de documento**: `pending → verified | rejected | needs_correction`.
* **Motor de scoring** (`lib/property-applications/scoring-engine.ts`).
* **Análisis IA de documentos** (`ai-analysis.ts` → `aiComplete`), con
  anotaciones `info | warning | error`.
* **Resumen de candidato en PDF** (`lib/pdf/candidate-summary-pdf.tsx`) +
  `/export-summary` y `/export-summary/send`.
* **Auto-asignación** de documentos pendientes (`documents/assign-pending`).
* **Plantillas de contrato** (`lib/documentos/templates.ts`) — **5**:
  Orden de Venta (CL) · Orden de Arriendo (CL) · Mandato de Alquiler (ES) ·
  Mandato de Venta (ES) · Personal Shopper (ES). Generan PDF vía
  `/api/admin/documentos/pdf`.

## 16.2 · Lo que NO existe

| | |
|---|---|
| Contratos ejecutados | 🔴 solo se genera el PDF, no se guarda ni se sigue |
| Depósitos / reservas | 🔴 no hay entidad |
| Firma electrónica | 🔴 ninguna integración |
| Checklists | 🔴 |
| **Etapas de transacción** | 🔴 **no existe pipeline de operación** |
| Aprobaciones internas | 🟡 solo el estado del expediente |
| Cierre / post-venta | 🔴 |

**Conclusión de §16:** el CRM puede seguir hoy una **candidatura de alquiler**
(y ni eso se usa). **No puede seguir una operación inmobiliaria.**

---

# 17 · Calendario y visitas

| Pieza | Estado | Evidencia |
|---|---|---|
| `visit_requests` | 🟡 modelo completo, **1 fila** | `client_id`, `property_id`, `requested_at`, `status`, `notes`, `confirmed_at`, `completed_at`, `assigned_to`, `country` |
| Calendario interno | 🔵 UI de 848 líneas, **`calendar_events` 0 filas** | `/{c}/admin/calendario` |
| **Google Calendar** | 🔴 **eliminado** | `/api/admin/visitas/[id]/sync-calendar` devuelve **HTTP 410** con *"Google Calendar integration has been removed"*. `google_calendar_tokens` (0 filas) y las columnas `visit_requests.google_event_id` / `calendar_synced_at` son residuo |
| Asignación de agente | 🟡 columna `assigned_to` | Sin UI de asignación en Solicitudes |
| Estados | ✅ `pending → confirmed → completed \| cancelled` | Solo confirmar/cancelar en UI |
| Relación con itinerario | ✅ `viewing_stops.visit_request_id` + `linkVisitRequest()` / `unlinkVisitRequest()` | La pieza mejor resuelta |
| Recordatorios | 🔴 no existen | |
| Disponibilidad de agente | 🔴 no existe | |

---

# 18 · Analytics

## 18.1 · Lo que se instrumenta (`lib/tracking/analytics.ts`)

Singleton en navegador, cola con flush cada 5 s + `beforeunload`.

| Método | Evento |
|---|---|
| `init()` | `page_views` (con `pageType`, `propertyId`, `shareId`, `collectionToken`, `sessionId`, `referrer`, `pagePath`) |
| `trackPhotoView(i)` | `photo_view` |
| `trackVideoPlay(i)` | `video_play` |
| `trackPlanView(i)` | `plan_view` |
| `trackScroll(%)` | `scroll_depth` |
| `trackContactClick(m)` | `contact_click` (whatsapp \| email \| phone) |
| `trackShareClick(m)` | `share_click` |
| `trackVisitRequest()` | `visit_request` |
| `trackTimeOnPage()` | `time_on_page` |
| genéricos VC | `collection_open`, `stop_view`, `stop_expand` |

## 18.2 · Lo que hay REALMENTE en producción

```
page_views: 122 filas  ·  65 sesiones  ·  ventana 15–17 ago 2026
  page_type = 'viewing_collection'   122   ← 100%
  page_type = 'property' / 'share'     0   ← 🔴 NINGUNO

page_events: 432 filas
  stop_view        226
  collection_open  101
  stop_expand       57
  share_click       28
  time_on_page      20
  photo_view         0   ← 🔴
  video_play         0   ← 🔴
  plan_view          0   ← 🔴
  contact_click      0   ← 🔴
  scroll_depth       0   ← 🔴
  visit_request      0   ← 🔴

Enriquecimiento:  device_type NULL en 122/122
                  country_code NULL en 122/122
                  city NULL en 122/122
```

Más: `property_share_opens` 33 · `viewing_collection_opens` 124.

## 18.3 · Métricas que existen y NO se ven en ninguna UI

| Métrica | Dónde vive | Dónde se ve |
|---|---|---|
| Aperturas de colección | `viewing_collection_opens` (124) | ❌ ni en la ficha de cliente ni en el bloque de itinerarios |
| `stop_view` / `stop_expand` | `page_events` (283) | ❌ **en ningún sitio** |
| Aperturas de SmartLink por link | `property_share_opens` | 🟡 solo el contador en el bloque ④ |
| Tiempo en página | `page_events` (20) | ❌ |
| Sesión y referrer | `page_views` | 🟡 solo en `/admin/analytics`, huérfano |

## 18.4 · Las dos UIs de analítica

**`/admin/analytics`** — dashboard completo (KPIs, timeline, dispositivo, geo,
top propiedades, sesiones recientes). **Existe solo en el árbol legacy, no está
en el menú, y ningún fichero lo enlaza** salvo su propia barra de filtros
(`components/admin/analytics/filter-bar.tsx:36`). Además, con `device_type`,
`country_code` y `city` a NULL en el 100% de las filas, los gráficos de
dispositivo y geografía están vacíos por construcción.

**`/{country}/admin/reportes`** — 4 KPIs + zonas + operación. El KPI
**"Aperturas de SmartLink" siempre marca 0**: `lib/db/queries/reports.ts:44-49`
hace `.select("opens_count")` sobre `property_shares`, y **esa columna no
existe** (columnas reales: `id, property_id, token, label, created_by,
expires_at, created_at`). PostgREST devuelve error, `links.data` queda `null` y
el `reduce` sobre `[]` da 0. Las 33 aperturas reales viven en
`property_share_opens`, que nadie consulta ahí.

## 18.5 · Lo que no se mide en absoluto

Rendimiento por agente · conversión de embudo · origen de lead agregado ·
engagement por cliente · tiempo de respuesta · engagement por propiedad
(existe la tabla, no hay vista).

---

# 19 · Generación de marketing

| Capacidad | Estado | Dónde |
|---|---|---|
| **SmartLinks** | 🟢 | Ficha de propiedad ④ |
| **Private Books** | 🟢 | Ficha de cliente → publicar itinerario |
| **PDF de propiedad** | 🟢 | `/api/admin/properties/{slug}/pdf` (`@react-pdf/renderer`), variante venta/alquiler |
| **PDF de documentos** | 🟢 | `/api/admin/documentos/pdf` — 5 plantillas |
| **PDF de candidato** | 🟢 | `/export-summary` + envío por email |
| **ZIP de fotos** | 🟢 | `/download-photos` (`lib/services/photo-zip.ts`) |
| **Descripciones con IA** | 🟢 | Botón 🪄 en ficha y en formulario Idealista |
| **Análisis de fotos con IA** | 🟢 | `/api/admin/idealista/analyze-photos` |
| **Quitar marca de agua** | 🟢 | Requiere ≥8 fotos |
| **Vídeos automáticos** | 🟢 | Ken Burns + logo + música; 33 renders sobre **2 propiedades** |
| **Traducción** | 🟡 | Solo mensajes de lead entrantes (`solicitudes/actions.ts:258`) |
| **Publicación en Idealista** | 🟡 | Partner API (77 schemas vendorizados) + extensión Chrome de respaldo. `idealista_config` **0 filas** → sin credenciales en prod |
| **Publicación en PortalInmobiliario** | 🟡 | Tokens ML vacíos en `app_settings` |
| **Feed de sindicación** | 🟢 | 4 feeds entrantes de agencias |
| **Imágenes OG** | 🟢 | `/og/property/{slug}` |
| **Posts para redes** | 🔴 | No existe |
| **Brochures / dossiers** | 🟡 | El PDF de propiedad es la única pieza; una sola plantilla |
| **Email de campaña** | 🔴 | Solo transaccional |
| **Traducción de contenido de propiedad** | 🔴 | Títulos y descripciones solo en castellano |

---

# 20 · IA y automatización

## 20.1 · Configuración real

`app_settings["ai.config"]` en producción → proveedor **OpenRouter**, modelo
**`google/gemini-2.5-flash-lite`**. Cliente multiproveedor propio
(`lib/services/ai/chat.ts`): Anthropic, OpenRouter, NVIDIA NIM, Ollama, OpenAI.
Todo por `fetch`, sin SDK.

## 20.2 · Inventario

### IA de verdad (llama a un modelo)

| Uso | Ruta | Estado |
|---|---|---|
| Generar descripción de propiedad | `/api/admin/propiedades/generate-description` | 🟢 |
| Generar descripción para Idealista | `/api/admin/idealista/generate-description` | 🟢 |
| Analizar fotos (visión) | `/api/admin/idealista/analyze-photos` | 🟢 |
| Traducir mensaje de lead | `solicitudes/actions.ts:258` | 🟢 |
| Analizar documento de expediente | `lib/property-applications/ai-analysis.ts` | 🔵 sin uso (0 documentos) |

### Rule-based (sin modelo)

| Uso | Lógica | Estado |
|---|---|---|
| **Sugerencia de propiedades** | Score 0–100: zona +30/+5 · m² +25 · precio en rango +20 · dormitorios +15/+10 · fotos +10/+5 | 🟢 |
| **Match de cliente** | Cascada email → teléfono completo → últimos 9 dígitos, con marca de fiabilidad | 🟢 |
| **Match lead ↔ propiedad** | Por referencia/código de Idealista | 🟡 132/322 |
| **Cruce de teléfonos** | `cross-match-phones` entre portales | 🟢 |
| **Extracción de features** | Parseo de la descripción del anuncio | 🟢 |
| **Sugerencia de tipo de lead** | `suggested_type` + `suggestion_keywords` | 🟡 |
| **Auto-distribución de captaciones** | `app_settings.captaciones.auto_distribution` (2 usuarios) | 🔵 CL sin uso |
| **Geocoding perezoso** | Nominatim al abrir SmartLink, cacheado | 🟢 |
| **Autocalibración del vídeo** | Peso real de renders → `app_settings.video_calibration` (20 muestras) | 🟢 |

## 20.3 · Automatizaciones programadas (cron)

`/api/cron/sync` · `/api/cron/particulares/*` (Idealista, Fotocasa, Pisos,
cruce de teléfonos) · `/api/cron/property-videos` · `/api/cron/api-cleanup` ·
`/api/cron/import-by-link/check-bajas`.

⚠️ Según `CLAUDE.md`, el cron del worker de vídeo **no está instalado en el VPS**.

## 20.4 · Lo que no existe

Clasificación automática de leads (solo palabras clave) · seguimientos
automáticos · recordatorios · recomendaciones aprendidas del comportamiento ·
enriquecimiento de propiedad · redacción asistida de mensajes.

---

# 21 · Permisos y trabajo en equipo

## 21.1 · Modelo

**8 roles** (`user_role`): `owner` · `admin` · `advisor` · `agent_admin` ·
`agent_senior` · `agent_junior` · `captadora` · `client`.
7 son staff (`STAFF_ROLES`); `client` y `viewer` no acceden a admin.

**16 recursos × 6 acciones** (`view`, `create`, `edit`, `delete`, `export`,
`publish`) = matriz de 96 celdas por rol.

**Tres capas:** matriz base del rol → rol efectivo por país
(`profiles_country_roles`) → excepciones por usuario (`user_permission_overrides`,
con país opcional).

**Aislamiento por país** de primera clase: `/es/admin/*` y `/cl/admin/*` son
árboles distintos, el menú filtra por `onlyCountry`, y casi todas las queries
llevan parámetro `country`.

**Auditoría:** `permission_audit_log` + `/api/admin/usuarios/[id]/permissions/audit`.

**Granularidad extra en captaciones:** `CaptacionEditableFields`
(campos de propiedad / de propietario / estado / asignar) y
`CaptacionViewRestriction` (`all` · `own_only` · `assigned_only` ·
`confirmed_and_own`).

## 21.2 · Uso real

| Mecanismo | Filas prod |
|---|---:|
| `profiles` | 14 (4 admin es · 2 agent_senior cl · 1 advisor es · 7 client) |
| `permissions` (catálogo) | 105 |
| `custom_roles` | **0** |
| `profiles_country_roles` | **0** |
| `user_permission_overrides` | **0** |
| `permission_audit_log` | **0** |

## 21.3 · Qué colaboración soporta hoy

**Sí:** separar España de Chile · restringir módulos por rol · dar excepciones
puntuales (mecanismo listo, sin uso) · scope `own`/`team`/`all` en Viewing
Collections (`canAccessClient`) · asignar leads de Idealista y captaciones ·
chat de equipo con canales y DMs.

**No:** cartera de clientes por agente (`profiles` no tiene columna de agente
asignado; la ficha muestra `"—"` hardcoded) · propiedad compartida de una
operación · reasignación · traspaso · visibilidad de la actividad de un
compañero · rendimiento por agente.

**Conclusión:** el CRM soporta **aislamiento** (por país y por rol) mucho mejor
que **colaboración**. El único vector de trabajo en equipo con datos reales es la
asignación de leads, y solo 1 de 322 está asignado.

---

# 22 · Sistema de diseño

## 22.1 · Hay TRES identidades visuales

| | CRM + SmartLink + Portal | Web de marketing | Private Book |
|---|---|---|---|
| **Dónde** | `app/globals.css` + `tailwind.config.ts` | `app/web/portal.css` | `globals.css` capa `vc-*` |
| **Display** | Cinzel (`--font-cinzel`) | — | Playfair |
| **Serif** | Playfair Display | **Cormorant Garamond** | Playfair |
| **Sans** | Inter | **Montserrat** | Inter |
| **Fuentes** | `next/font` local | 🔴 `@import` a **Google Fonts** | `next/font` |
| **Fondo** | `cream-50 #fbf8f3` | blanco / editorial | oscuro editorial |
| **Acento** | `gold #c9a96e` | `#c9a96e` ✅ mismo | `gold` |
| **Tinta** | `ink #0a0a0a` | `#0a0a0a` ✅ | |
| **Utilidades** | Tailwind | `.container-luxe`, `.eyebrow`, `.italic-display` con `!important` | `.vc-reveal`, page-turn |

El oro y la tinta coinciden. **La tipografía no.** Un cliente que va del email
al SmartLink, de ahí a la web y de ahí al libro privado, ve **tres sistemas
tipográficos distintos**.

## 22.2 · CRM interno

| Elemento | Estado |
|---|---|
| **Tipografía** | Playfair (títulos serif) + Inter (texto) |
| **Color** | `ink` · `navy` · `cream` (5 tonos) · `gold` (4 tonos) |
| **Tarjetas** | Patrón repetido a mano: `rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm` — **copiado literalmente decenas de veces**, sin componente |
| **Tablas** | 🔴 **no hay componente de tabla**. Cada módulo la construye |
| **Formularios** | 🔴 **no hay componentes de campo**. `Field()` es local a `property-edit-view.tsx` |
| **Diálogos** | 🟡 `components/ui/modal.tsx` existe; varios módulos hacen su propio overlay |
| **Navegación** | ✅ `admin-sidebar.tsx` + `client-sidebar.tsx` |
| **Responsive** | 🟡 Sidebar colapsable; las páginas densas (Solicitudes, Particulares) son tarjetas apiladas sin vista de tabla |

**`components/ui/` tiene 9 primitivas**: `button`, `card`, `empty-state`,
`modal`, `page-footer`, `pagination`, `skeleton`, `stat-card`, `toast`.
Para 36.722 líneas de UI de admin, eso es muy poco: **la mayor parte del CRM
está compuesto con clases de Tailwind repetidas a mano.**

## 22.3 · Componentes legacy

* `lib/mock-*.ts` — **8 ficheros** de datos simulados (`mock-properties`,
  `mock-dashboard`, `mock-agencies`, `mock-conversations`, `mock-favorites`,
  `mock-profile`, `mock-admin-extras`, `mock-agency-details`) todavía importados.
* `lib/portal-properties.ts` — catálogo estático que sirve de **fallback** si la
  consulta de la web pública falla o vuelve vacía.
* `components/coming-soon.tsx` + `components/admin/admin-coming-soon.tsx`.
* `portal-web/` — directorio de una versión anterior del portal.

---

# 23 · Internacionalización

| Superficie | Idiomas | Mecanismo | Estado |
|---|---|---|---|
| **CRM interno** | **4** — es · en · fr · de | `lib/i18n/dictionary.ts` (~3.055 claves) + `provider.tsx`, persistido en `localStorage` | 🟢 pero muchos textos nuevos están **en castellano fijo** en el JSX |
| **Private Book** | **8** — es · en · fr · it · de · ar · tr · he | `lib/viewing-collections/i18n.ts`, elegido por itinerario (`viewing_itineraries.language`) | 🟢 el mejor implementado |
| **SmartLink** (`/compartir`, `/c`) | **1** — castellano | — | 🔴 |
| **Web de marketing** | — | **Widget de Google Translate** | 🔴 no es i18n |
| **Portal de cliente** | 4 (hereda el diccionario del CRM) | `LanguageSwitcher` | 🟡 |

### Detalle

| Aspecto | Estado |
|---|---|
| **RTL** | ✅ Solo en el Private Book (`ar`, `he`): dirección derivada del idioma, teclado ←/→ invertido |
| **Locale routing** | 🔴 **No existe.** `/{country}/` es país (aislamiento de datos), **no** idioma. El idioma vive en `localStorage` |
| **Moneda** | ✅ EUR · CLP · UF · USD. `getCountryConfig().formatPrice()` + `CurrencyProvider` + `/api/exchange-rate` en la web |
| **Unidades** | 🟡 m² en todas partes; no hay ft² |
| **Fechas** | ✅ `Intl.DateTimeFormat`. En árabe se fuerza numeración latina (`-u-nu-latn`) para que las horas coincidan con las del panel |
| **Traducción de contenido** | 🔴 Títulos, descripciones y features de propiedad **solo en castellano**, en todos los idiomas |
| **Calidad revisada** | ⚠️ `ar`, `tr`, `he` marcados como traducción de IA sin revisión nativa (`TRANSLATION_REVIEW_REQUIRED`) |

**El hueco central:** un Private Book en árabe muestra la interfaz en árabe RTL
perfecta, y el título y la descripción de cada piso en castellano.

---

# 24 · Infraestructura relevante para producto

| Capa | Qué es | Límite de producto |
|---|---|---|
| **Hosting** | VPS Hetzner propio (`178.105.185.125`), Ubuntu 26.04, PM2 `smartbc-portal`, puerto 3000 | **Proceso único**: los limitadores de cuota de Idealista viven en memoria; no se puede escalar horizontalmente sin rediseñarlos |
| **Base de datos** | PostgreSQL en Docker `supabase-db` (self-hosted, **no** Supabase Cloud) | 155 migraciones aplicadas a mano vía psql o botón en `/configuracion` |
| **Storage** | Supabase Storage self-hosted. 5 buckets, **4,4 GB** | `FILE_SIZE_LIMIT` del contenedor (~50 MB por defecto) hay que subirlo a mano para vídeos |
| **Servicio de imagen** | `next/image` + proxy propio `/p/`, cache CDN 24 h | Sin CDN de imagen dedicado, sin AVIF, sin variantes por breakpoint |
| **Email** | AWS SES + nodemailer | `email_config` **0 filas** en prod |
| **Deploy** | Push a `main` → cron cada minuto → `/opt/vps-autodeploy.sh`: build en `.next.new` → migraciones → swap atómico → health check → **rollback automático** | El script vive fuera del repo; hay que sincronizar las dos copias |
| **Analytics** | Propia (`page_views`/`page_events`). Sin GA, sin Segment | Sin enriquecimiento: device/geo a NULL |
| **Mapas** | Leaflet + OpenStreetMap. Geocoding con Nominatim | Nominatim limita a ~1 req/s |
| **Vídeo** | ffmpeg 8.0.1 + ffprobe en `/usr/bin` | Comparte CPU con la web; se renderiza 1 por pasada |
| **IA** | OpenRouter → `google/gemini-2.5-flash-lite` | Clave en BD, editable desde el panel |
| **APIs externas** | Idealista Partner API (77 schemas vendorizados) · MercadoLibre/PortalInmobiliario · Zinto (WhatsApp) · proxies (Evomi/Geonode) · CapSolver | Sandbox de Idealista solo L-V 6-21 h y se reescribe cada noche |
| **API propia** | `/api/v1/*` con clave, idempotencia, OpenAPI, rate limiting | **9.068 peticiones** registradas — la integración más usada del sistema |

---

# 25 · Capacidades activas / sin uso / muertas

| Capability | Active | Partial | Unused | Dead | Evidencia |
|---|:---:|:---:|:---:|:---:|---|
| Cartera de propiedades | ✅ | | | | 1.318 filas, 680 disponibles |
| Fotos de propiedad | ✅ | | | | 31.750 filas · 4,4 GB |
| Sindicación de agencias | ✅ | | | | 4 feeds · 32 sync_logs · 602 props |
| Scraper de particulares | ✅ | | | | 10.750 particulares · 15.690 cambios |
| Leads de Idealista (extensión) | ✅ | | | | 322 leads |
| Viewing Collections | ✅ | | | | 2 itinerarios · 124 aperturas |
| Private Book `/v/{token}` | ✅ | | | | 101 `collection_open` |
| API pública `/api/v1` | ✅ | | | | 9.068 `api_requests` · 5 claves |
| Cruce Zinto CRM | ✅ | | | | 713 `zinto_crm_contacts` |
| Generación de vídeo | | 🟡 | | | 33 renders sobre **2** propiedades |
| SmartLinks | | 🟡 | | | 9 links, **0 creados a mano** |
| PDF de propiedad | | 🟡 | | | Existe; sin métrica de uso |
| Publicación en Idealista | | 🟡 | | | 31 listings · `idealista_config` **0 filas** |
| PortalInmobiliario | | 🟡 | | | `ml.chile.access_token` **vacío** |
| Mensajería WhatsApp (Zinto) | | 🟡 | | | 57 conversaciones · **0 mensajes** |
| Preferencias de cliente | | 🟡 | | | **2 filas** · 34 columnas · el agente no las edita |
| Reportes | | 🟡 | | | 1 de 4 KPIs devuelve siempre 0 |
| Módulo de Captaciones (CL) | | | 🔵 | | `captaciones` **0 filas** |
| Expedientes / documentación | | | 🔵 | | 2 expedientes · **0 documentos** |
| Favoritos de cliente | | | 🔵 | | `favorites` **0 filas** |
| Mensajes cliente↔asesor | | | 🔵 | | `conversations`/`messages` **0 filas** |
| Chat de equipo | | | 🔵 | | 5 tablas a **0** · 1.124 líneas de UI |
| Calendario interno | | | 🔵 | | `calendar_events` **0 filas** · 848 líneas de UI |
| Leads de Zinto | | | 🔵 | | `zinto_leads`/`zinto_campaigns` **0 filas** |
| Etiquetas de cliente | | | 🔵 | | 10 definidas · **0 asignaciones** |
| Roles personalizados | | | 🔵 | | `custom_roles` **0 filas** |
| Excepciones de permiso | | | 🔵 | | `user_permission_overrides` **0 filas** |
| Rol por país | | | 🔵 | | `profiles_country_roles` **0 filas** |
| Auditoría de permisos | | | 🔵 | | `permission_audit_log` **0 filas** |
| Seguridad por IP | | | 🔵 | | 3 tablas a **0** · ruta huérfana |
| Historial de precios | | | 🔵 | | `property_prices` **0 filas** |
| Especificaciones arquitectónicas | | | 🔵 | | `property_architectural_specs` **0 filas** |
| **Dashboard de Analytics** | | | | 🔴 | Solo `/admin/analytics` (legacy), **sin enlace en el menú** |
| **Gráficos de dispositivo y geo** | | | | 🔴 | `device_type`/`country_code`/`city` NULL en **122/122** |
| **KPI de aperturas de SmartLink** | | | | 🔴 | `reports.ts:44` lee `opens_count`, **columna inexistente** → siempre 0 |
| **Upload en `/publicacion`** | | | | 🔴 | Sube al bucket `property-media`, **que no existe** |
| **Google Calendar** | | | | 🔴 | Ruta devuelve **HTTP 410**; `google_calendar_tokens` **0 filas**; 2 columnas residuales en `visit_requests` |
| **`client_portal_links`** | | | | 🔴 | Tabla + `client_portal_link_notes`, **cero referencias en el código** |
| **`properties.subzone`** | | | | 🔴 | **0 de 680** |
| **`properties.building_features`** | | | | 🔴 | **0 de 680** |
| **Tablas maestras de ubicación** | | | | 🔴 | `countries`, `location_hierarchies`, `geofence_zones`, `chile_regions/communes/zones/subzones` — **todas a 0** |
| **Tracking de fotos/vídeo/plano/contacto** | | | | 🔴 | Métodos implementados; **0 eventos** en producción |
| **Botón campana de la ficha de cliente** | | | | 🔴 | `<button>` sin `onClick` |
| **`lib/mock-*.ts`** | | | | 🔴 | 8 ficheros de datos simulados aún importados |
| **`portal-web/`** | | | | 🔴 | Portal de una versión anterior |

---

# 26 · Matriz de capacidades

Madurez: `0` inexistente · `1` básico · `2` funcional · `3` sólido · `4` avanzado

## Leads

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Captura de leads de Idealista | ✅ | **3** | ✅ | — | Extensión Chrome · 322 leads · foto y avatar |
| Inbox unificado de solicitudes | ✅ | **2** | ✅ | — | 3 entidades bajo 6 pestañas, modelos distintos |
| Triaje de leads | ✅ | **2** | ✅ | — | 90% sigue en "nuevo" |
| Match lead ↔ propiedad | ✅ | **2** | ✅ | — | 132/322 · manual + por referencia |
| Match lead ↔ cliente | ✅ | **3** | ✅ | — | Cascada email → tel → cola de 9, nunca automática |
| Asignación de leads | ✅ | **1** | ✅ | — | Columna sí; 1 de 322 asignado |
| Formulario web | ✅ | **1** | ✅ | ✅ | `contact_requests` **0 filas** |
| Puntuación de leads | ❌ | **0** | — | — | |
| Origen de lead agregado | ❌ | **0** | — | — | |

## CRM (clientes)

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Ficha de cliente | ✅ | **2** | ✅ | — | Solo lectura salvo Viewing Collections |
| Preferencias | ✅ | **1** | ❌ | ✅ | 34 columnas · se muestran 6 · el agente no las edita |
| Notas | ✅ | **1** | ❌ | — | Se ven, no se escriben |
| Etiquetas | ✅ | **1** | ❌ | — | 10 definidas · 0 asignadas |
| Agente asignado | ❌ | **0** | — | — | Muestra `"—"` hardcoded |
| Timeline / historial | ❌ | **0** | — | — | |
| Tareas / seguimiento | ❌ | **0** | — | — | |
| Segmentación | ❌ | **0** | — | — | |

## Properties

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Alta / edición | ✅ | **3** | ✅ | — | 1.701 líneas, un solo scroll |
| Importar desde link | ✅ | **3** | ✅ | — | |
| Sindicación por feed | ✅ | **3** | ✅ | — | 602 propiedades |
| Fotos | ✅ | **3** | ✅ | ✅ | 99,3% · media 23,8 |
| Vídeo | ✅ | **2** | ✅ | ✅ | 3,8% de cobertura |
| Planos | ✅ | **1** | ✅ | ✅ | **0%** en disponibles |
| Amenities | ✅ | **1** | 🟡 | ✅ | Texto libre con duplicados y basura |
| Ubicación exacta | ✅ | **1** | ✅ | 🟡 | Coordenadas 14% · dirección 23% |
| Datos de edificio | ✅ | **0** | — | — | `building_features` 0/680 |
| Propietario | ✅ | **1** | ✅ | ❌ | 3 campos planos · 2/680 |
| Disponibilidad | ✅ | **1** | ✅ | ✅ | Solo enum de estado |
| Histórico de precios | ✅ | **0** | — | — | Tabla vacía |
| Documentos de propiedad | ❌ | **0** | — | — | |
| 360 / VR | ❌ | **0** | — | — | El campo no existe |

## SmartLinks

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Enlace estable `/compartir` | ✅ | **3** | ✅ | ✅ | Indexable, OG, canonical |
| Enlace con token `/c` | ✅ | **3** | ✅ | ✅ | noindex + tracking |
| Etiquetado | ✅ | **2** | ✅ | — | Texto libre |
| Contador de aperturas | ✅ | **2** | ✅ | — | Cuántas, no quién |
| Caducidad | 🟡 | **1** | ❌ | — | Columna sí, UI no · null en los 9 |
| Vinculación a cliente | ❌ | **0** | — | — | No hay `client_id` |
| Personalización | ❌ | **0** | — | — | Sin idioma, sin contacto del agente |
| Contacto del agente | ❌ | **0** | — | — | Contacto genérico de BC |
| Solicitar visita desde el link | ❌ | **0** | — | — | Requiere login |

## Collections

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Selección de propiedades | ✅ | **3** | ✅ | ❌ | Con origen y notas |
| Constructor de itinerario | ✅ | **4** | ✅ | — | Orden, horas, duración, confirmación, visibilidad |
| Visibilidad de dirección | ✅ | **4** | ✅ | ✅ | Por parada, con revelado en lote |
| Previsualización | ✅ | **4** | ✅ | — | Mismo componente y proyección |
| **Private Book** | ✅ | **4** | — | ✅ | Giro real, 8 idiomas, RTL |
| Publicar / despublicar | ✅ | **3** | ✅ | — | |
| Caducidad y renovación | ✅ | **3** | ✅ | — | 60 días por defecto, máx 180 |
| Revocación | ✅ | **3** | ✅ | — | |
| Contrato público auditado | ✅ | **4** | — | ✅ | Lista de exclusión revisada |
| Analítica de colección | ✅ | **1** | ❌ | — | 124 aperturas, **no se muestran** |
| Comentarios del cliente | ❌ | **0** | — | ❌ | Solo lectura |
| Colección en el portal | ❌ | **0** | — | ❌ | Solo por token anónimo |

## Search

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Buscador de propiedades (admin) | ✅ | **2** | ✅ | — | |
| Catálogo de cliente | ✅ | **2** | — | ✅ | 2.000 cargadas, filtro en cliente |
| Catálogo web | ✅ | **2** | — | ✅ | 1.000 cargadas, filtro en cliente |
| Sugerencias por preferencias | ✅ | **2** | ✅ | ✅ | Score rule-based |
| Búsqueda geográfica / mapa | ❌ | **0** | — | — | |
| Búsqueda por amenity | ❌ | **0** | — | — | Texto libre lo impide |
| Guardar búsqueda / alertas | ❌ | **0** | — | — | |

## Client portal

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Login y cuenta | ✅ | **2** | — | ✅ | 7 cuentas |
| Preferencias | ✅ | **2** | — | ✅ | 2 filas |
| Sugeridas | ✅ | **2** | — | ✅ | |
| Catálogo | ✅ | **2** | — | ✅ | |
| Favoritos | ✅ | **1** | — | ✅ | **0 filas** |
| Solicitar visita | ✅ | **1** | — | ✅ | 1 fila |
| Mis visitas | ❌ | **0** | — | ❌ | |
| Mensajes | ✅ | **1** | ✅ | ✅ | **0 filas** |
| Documentación | ✅ | **1** | ✅ | ✅ | 0 documentos |
| Mis colecciones | ❌ | **0** | — | ❌ | |
| Notificaciones | ❌ | **0** | — | ❌ | |

## Visits

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Solicitud de visita | ✅ | **1** | ✅ | ✅ | 1 fila |
| Confirmar / cancelar | ✅ | **2** | ✅ | — | |
| Vincular a itinerario | ✅ | **3** | ✅ | — | |
| Calendario interno | ✅ | **1** | ✅ | — | 0 eventos |
| Google Calendar | ❌ | **0** | — | — | **Eliminado (410)** |
| Recordatorios | ❌ | **0** | — | — | |
| Disponibilidad de agente | ❌ | **0** | — | — | |

## Transaction

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Expedientes | ✅ | **1** | ✅ | ✅ | 2 filas |
| Documentos | ✅ | **1** | ✅ | ✅ | 0 filas · catálogo de 25 tipos |
| Scoring de candidato | ✅ | **1** | ✅ | — | Sin uso |
| Análisis IA de documentos | ✅ | **1** | ✅ | — | Sin uso |
| Plantillas de contrato | ✅ | **2** | ✅ | — | 5 plantillas → PDF |
| Firma electrónica | ❌ | **0** | — | — | |
| Depósitos / reservas | ❌ | **0** | — | — | |
| Etapas de operación | ❌ | **0** | — | — | |
| Comisiones por operación | ❌ | **0** | — | — | Solo por agencia |

## Media

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Subida de fotos | ✅ | **3** | ✅ | — | |
| Orden y portada | ✅ | **3** | ✅ | — | |
| Proxy de imagen neutro | ✅ | **4** | — | ✅ | `/p/{slug}/{idx}` |
| Quitar marca de agua (IA) | ✅ | **3** | ✅ | — | ≥8 fotos |
| Vídeo automático | ✅ | **3** | ✅ | ✅ | Autocalibrado |
| Vídeo externo | ✅ | **3** | ✅ | ✅ | YouTube · Vimeo · MP4 |
| Planos | ✅ | **1** | ✅ | ✅ | 0% |
| Optimización responsive | 🟡 | **1** | — | ✅ | Sin variantes por breakpoint |
| 360 / VR | ❌ | **0** | — | — | |

## Analytics

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Page views | ✅ | **2** | 🟡 | — | Solo `viewing_collection` |
| Eventos de colección | ✅ | **2** | ❌ | — | 283 eventos, **no se muestran** |
| Aperturas de SmartLink | ✅ | **2** | ✅ | — | Contador en el bloque |
| Aperturas de colección | ✅ | **1** | ❌ | — | 124, **no se muestran** |
| Dashboard de analítica | ✅ | **1** | ❌ | — | **Huérfano**, sin enlace |
| Reportes | ✅ | **1** | ✅ | — | 1 de 4 KPIs roto |
| Fotos / vídeos / planos vistos | ✅ | **0** | — | — | Instrumentado · **0 eventos** |
| Engagement por cliente | ❌ | **0** | — | — | |
| Rendimiento por agente | ❌ | **0** | — | — | |
| Conversión de embudo | ❌ | **0** | — | — | |

## Marketing

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| PDF de propiedad | ✅ | **2** | ✅ | — | Una plantilla |
| ZIP de fotos | ✅ | **3** | ✅ | — | |
| Imagen OG | ✅ | **3** | — | ✅ | JPEG 1200×630 |
| Descripción con IA | ✅ | **3** | ✅ | — | |
| Sitio de marketing | ✅ | **2** | — | ✅ | Publica inventario ajeno |
| Publicación en portales | ✅ | **2** | ✅ | — | Sin credenciales en prod |
| Posts para redes | ❌ | **0** | — | — | |
| Email de campaña | ❌ | **0** | — | — | |
| Brochure / dossier | ❌ | **0** | — | — | |

## AI

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| Cliente multiproveedor | ✅ | **3** | ✅ | — | Config en BD, sin SSH |
| Descripciones | ✅ | **3** | ✅ | — | |
| Análisis de fotos | ✅ | **2** | ✅ | — | |
| Traducción de leads | ✅ | **2** | ✅ | — | |
| Análisis de documentos | ✅ | **1** | ✅ | — | Sin uso |
| Sugerencia de propiedades | ✅ | **2** | ✅ | ✅ | **Rule-based**, no IA |
| Match de cliente | ✅ | **3** | ✅ | — | **Rule-based** |
| Recomendación aprendida | ❌ | **0** | — | — | |
| Clasificación de leads | ❌ | **0** | — | — | Solo palabras clave |
| Redacción asistida | ❌ | **0** | — | — | |

## Post-close

| Capability | Exists | Maturity | Agent | Client | Notas |
|---|:---:|:---:|:---:|:---:|---|
| **Todo** | ❌ | **0** | — | — | No hay entidad de operación cerrada, ni renovación, ni aniversario, ni referidos, ni post-venta |

---

# 27 · Principales fricciones de producto

Ordenadas por impacto en la experiencia. **Solo evidencia del producto actual.**

### F1 · La ficha de cliente muestra datos inventados
`lib/db/adapters.ts:172-203` devuelve `status: "active"`, `assignedAdvisor: "—"`,
`priority: "normal"`, `sector: "Madrid"`, `propertiesViewed: 0` y `messages: 0`
**hardcoded**. Un agente que mira la ficha no puede distinguir "0 mensajes" de
"no lo medimos".

### F2 · El agente no puede editar nada del cliente
No hay formulario de preferencias, ni caja de notas, ni asignación de etiquetas,
ni asignación de asesor en `client-ficha-view.tsx`. Las preferencias solo las
edita el propio cliente en `/inicio` — y solo 2 de 7 clientes lo han hecho.

### F3 · 28 de 34 campos de preferencia no se muestran nunca
`client_preferences` tiene 34 columnas (dormitorios min/max, baños, m², fecha de
disponibilidad, orientaciones, plazas de garaje, condominio, UF…). La ficha
pinta 6. El motor de sugerencias usa 5.

### F4 · El KPI de "Aperturas de SmartLink" siempre marca 0
`lib/db/queries/reports.ts:44` hace `.select("opens_count")` sobre
`property_shares`; esa columna **no existe**. Las 33 aperturas reales están en
`property_share_opens`. El único reporte de engagement del CRM está roto.

### F5 · El dashboard de analítica es inalcanzable
`/admin/analytics` solo existe en el árbol legacy y **ningún fichero lo enlaza**.
Además, `device_type`, `country_code` y `city` son NULL en **122 de 122** filas,
así que dos de sus cinco gráficos están vacíos por construcción.

### F6 · Se instrumentan 6 eventos que nunca se registran
`trackPhotoView`, `trackVideoPlay`, `trackPlanView`, `trackScroll`,
`trackContactClick` y `trackVisitRequest` están implementados. En producción:
**0 eventos de cada uno**. Todos los `page_views` son `viewing_collection`. La
ficha pública de propiedad no se está midiendo.

### F7 · 124 aperturas de colección que nadie ve
`viewing_collection_opens` (124) y los 283 `stop_view`/`stop_expand` no aparecen
en ninguna pantalla. La señal más valiosa que ha generado el CRM —qué piso miró
el cliente y cuál expandió— es invisible para el agente que lo atiende.

### F8 · Ningún agente ha creado un SmartLink a mano
Los 9 `property_shares` de producción se llaman
`"Viewing Collection · Paul · … · Stop 05"`: los generó el publicador. La
funcionalidad estrella para compartir una propiedad no ha entrado en la rutina.

### F9 · El SmartLink no lleva al agente que lo envía
`public-property-view.tsx` usa una constante `BC_CONTACT` con el WhatsApp, email
y teléfono genéricos de la agencia. El cliente que recibe el piso de su asesor
contacta con la centralita, no con él.

### F10 · El SmartLink es solo en castellano
`/compartir` y `/c` no tienen selector ni parámetro de idioma. El Private Book
soporta 8 idiomas con RTL; el enlace de una sola propiedad, uno.

### F11 · Las amenities no son consultables
`features` es `text[]` sin vocabulario: `Ascensor` (507) y `Con ascensor` (51)
son la misma cosa, `Consumo:` (26) y `Emisiones:` (22) son basura del scraper, y
`2 baños` (20) no es una amenity. Gimnasio, spa, coworking, cine, rooftop y
concierge están a **0**. No se puede filtrar ni presentar por amenity.

### F12 · El 86% de la cartera no tiene coordenadas
98 de 680. Y solo 156 tienen dirección. El mapa del SmartLink cae al centroide
de barrio en 5 de cada 6 propiedades — y el Private Book, por decisión
explícita, **no pinta mapa** porque los centroides no son fiables
(`public-contract.ts:36-41`).

### F13 · `subzone` y `building_features` están vacías al 100%
0 de 680 en ambas. La taxonomía de 21 distritos y sus barrios existe en
`lib/madrid-zones.ts` y **no está conectada** a `properties.subzone`.

### F14 · No existe ningún dato de barrio o estilo de vida
Ni transporte, ni colegios, ni restaurantes, ni comercio, ni puntuación. Lo
único cercano es `CampusDistance` (distancia a universidades, por haversine con
factores empíricos) y solo está en la web de marketing.

### F15 · La ficha de propiedad no conoce su propio recorrido comercial
`property-edit-view.tsx` (1.701 líneas) no muestra visitas, ni clientes que la
tienen seleccionada, ni expedientes, ni si está publicada en Idealista, ni
analítica más allá del contador de aperturas por link. Tampoco tiene bloque de
notas internas, aunque la columna existe y se guarda.

### F16 · Tres identidades visuales para el mismo cliente
CRM/SmartLink (Playfair + Inter + Cinzel, `next/font`) · web de marketing
(Cormorant Garamond + Montserrat, `@import` a Google Fonts) · Private Book
(su propia capa editorial). El oro `#c9a96e` y la tinta coinciden; la tipografía
no. El recorrido email → SmartLink → web → libro atraviesa tres sistemas.

### F17 · No hay componentes de tabla ni de formulario
`components/ui/` tiene 9 primitivas para 36.722 líneas de UI de admin. El patrón
de tarjeta (`rounded-2xl border-gold/15 bg-cream-50/85 shadow-[0_15px_40px…]`)
está copiado literalmente decenas de veces. Cada módulo dibuja su propia lista.

### F18 · Solicitudes mezcla tres modelos bajo seis pestañas
`visit_requests`, `contact_requests` e `idealista_leads` no comparten campos,
estados ni acciones. Una consulta web solo se puede "marcar como leída"; un lead
de Idealista tiene diez acciones. Sin paginación en servidor, sin acciones en
lote, sin vista "míos".

### F19 · El 90% de los leads sigue sin triar
291 de 322 en estado `nuevo`. 1 asignado. 5 tipificados. La bandeja crece más
rápido de lo que se procesa.

### F20 · La web pública publica el inventario de las agencias socias
`lib/portal-fetch.ts:30` filtra por `status` y `archived_at` pero **ignora
`published_web`** (que solo 1 propiedad tiene activo). El sitio de marketing
muestra las 680, de las que **602 son de Housingo, Level y UrbantecHome**.

### F21 · El portal de cliente no contiene la mejor experiencia
El Private Book se entrega por token anónimo y **no aparece en el área privada**
del cliente aunque tenga cuenta. Tampoco sus visitas, ni los SmartLinks que ha
recibido, ni la selección que su agente ha preparado. Resultado: 7 cuentas,
0 favoritos, 0 mensajes, 1 visita.

### F22 · La subida de media desde Publicación apunta a un bucket inexistente
`app/api/admin/publicacion/upload-media/route.ts:39` usa el bucket
`property-media`. Los buckets reales son `properties-photos`, `agencies-logos`,
`avatars`, `property-application-documents` y `video-music`.

### F23 · El recorrido se corta después de la visita
No existe entidad de oferta, reserva, depósito, contrato firmado ni cierre. No
hay etapas de operación, ni tareas, ni recordatorios, ni seguimiento. El CRM
sabe enseñar un piso; no sabe cerrarlo ni acompañar después.

### F24 · Doce mecanismos construidos y nunca activados
Roles personalizados (0) · excepciones de permiso (0) · rol por país (0) ·
auditoría de permisos (0) · seguridad por IP (3 tablas a 0, ruta huérfana) ·
chat de equipo (5 tablas a 0, 1.124 líneas de UI) · calendario interno (0
eventos, 848 líneas) · etiquetas de cliente (10 definidas, 0 asignadas) ·
expedientes (0 documentos) · leads de Zinto (0) · captaciones Chile (0) ·
historial de precios (0).

### F25 · El contenido de propiedad no se traduce
El Private Book en árabe renderiza la interfaz en árabe RTL, con numeración
latina forzada para que las horas coincidan con el panel — y el título y la
descripción de cada residencia en castellano. `properties.title` y
`.description` son columnas únicas, sin variante por idioma.

---

# Inventario de pantallas

**Sin capturas**: la sesión es no interactiva y no hay credenciales de staff
disponibles. Se listan las pantallas verificadas contra
`app-paths-manifest.json` del build.

## Staff — `/{country}/admin/*` (country ∈ {es, cl})

| # | Pantalla | Ruta |
|---|---|---|
| 1 | Dashboard | `/{c}/admin` |
| 2 | Propiedades · listado | `/{c}/admin/propiedades` |
| 3 | Propiedades · ficha | `/{c}/admin/propiedades/{slug}` |
| 4 | Propiedades · importar | `/{c}/admin/propiedades/importar` |
| 5 | Agencias · listado | `/{c}/admin/agencias` *(es)* |
| 6 | Agencias · detalle | `/{c}/admin/agencias/{id}` *(es)* |
| 7 | Sindicación | `/{c}/admin/sindicacion` *(es)* |
| 8 | Particulares | `/{c}/admin/particulares` *(es)* |
| 9 | Particulares · scraper | `/{c}/admin/particulares/scraper` *(es)* |
| 10 | Captaciones · listado | `/{c}/admin/captaciones` *(cl)* |
| 11 | Captaciones · detalle | `/{c}/admin/captaciones/{id}` *(cl)* |
| 12 | Captaciones · pipelines | `/{c}/admin/captaciones/pipelines` *(cl)* |
| 13 | Publicación | `/{c}/admin/publicacion` |
| 14 | PortalInmobiliario | `/{c}/admin/portalinmobiliario` *(cl)* |
| 15 | Idealista · panel | `/{c}/admin/idealista` *(es)* |
| 16 | Idealista · configuración | `/{c}/admin/idealista/configuracion` *(es)* |
| 17 | Clientes · listado | `/{c}/admin/clientes` |
| 18 | **Clientes · ficha** | `/{c}/admin/clientes/{id}` |
| 19 | **Solicitudes** (6 pestañas) | `/{c}/admin/solicitudes` |
| 20 | Solicitudes · documentación | `/{c}/admin/solicitudes-documentacion` |
| 21 | Leads (Zinto) | `/{c}/admin/leads` |
| 22 | Calendario | `/{c}/admin/calendario` |
| 23 | Mensajes (4 pestañas) | `/{c}/admin/mensajes` |
| 24 | Reportes | `/{c}/admin/reportes` |
| 25 | Usuarios | `/{c}/admin/usuarios` |
| 26 | Integraciones · listado | `/{c}/admin/integraciones` |
| 27 | Integraciones · detalle | `/{c}/admin/integraciones/{slug}` |
| 28 | Configuración | `/{c}/admin/configuracion` |
| 29 | Diagnóstico | `/{c}/admin/diagnostico` *(es)* |
| 30 | Demo setup | `/{c}/admin/demo-setup` |

## Staff — huérfanas (no están en el menú)

| # | Pantalla | Ruta |
|---|---|---|
| 31 | **Analytics** | `/admin/analytics` |
| 32 | Seguridad · gestión de IP | `/admin/security/ip-management` |

## Viewing Collections

| # | Pantalla | Ruta | Acceso |
|---|---|---|---|
| 33 | **Private Book** | `/v/{token}` | público con token |
| 34 | Colección no disponible | `/v/{token}` (fallo) | público, HTTP 200 |
| 35 | Previsualización del agente | `/v/preview/{itineraryId}` | sesión de staff |
| 36 | Preview de diseño | `/v/design-preview` | — |

## Público

| # | Pantalla | Ruta |
|---|---|---|
| 37 | **SmartLink estable** | `/compartir/{slug}` |
| 38 | **SmartLink con token** | `/c/{token}` |
| 39 | Web · home | `/web` (= `bcousinoprop.com/`) |
| 40 | Web · catálogo | `/web/propiedades` |
| 41 | Web · ficha | `/web/propiedades/{id}` |
| 42 | Web · nosotros | `/web/nosotros` |
| 43 | Web · contacto | `/web/contacto` |
| 44 | Web · off-market | `/web/off-market` |
| 45 | Login | `/login` |
| 46 | Recuperar contraseña | `/auth/forgot-password` |
| 47 | Restablecer contraseña | `/auth/reset-password` |

## Portal de cliente

| # | Pantalla | Ruta |
|---|---|---|
| 48 | Inicio (preferencias + sugeridas) | `/inicio` |
| 49 | Catálogo | `/propiedades` |
| 50 | Ficha | `/propiedades/{id}` |
| 51 | Favoritos | `/favoritos` |
| 52 | Documentación | `/documentacion` |
| 53 | Mensajes | `/mensajes` |
| 54 | Perfil | `/perfil` |

**Total: 54 pantallas** (30 de staff + 2 huérfanas + 4 de colecciones +
11 públicas + 7 de portal de cliente).

---

## Anexo · Dónde está cada cosa

| Concepto | Fichero |
|---|---|
| Módulos y menú | `components/admin-sidebar.tsx:53-81` |
| Enrutado y protección | `middleware.ts` |
| Permisos | `lib/permissions.ts` (662 líneas) |
| Ficha de cliente | `app/[country]/(admin)/admin/clientes/[id]/client-ficha-view.tsx` |
| **Datos hardcoded de cliente** | `lib/db/adapters.ts:172-203` |
| Solicitudes | `app/[country]/(admin)/admin/solicitudes/solicitudes-admin-client.tsx` |
| Lead → cliente | `app/[country]/(admin)/admin/solicitudes/prepare-visits-actions.ts` |
| Ficha de propiedad | `app/[country]/(admin)/admin/propiedades/[slug]/property-edit-view.tsx` |
| SmartLinks (panel) | `components/admin/smart-links-panel.tsx` |
| SmartLink (vista pública) | `app/compartir/[slug]/public-property-view.tsx` |
| Tokens de share | `lib/db/queries/shares.ts` |
| **Contrato público de colección** | `lib/viewing-collections/public-contract.ts` |
| Proyección interna → pública | `lib/viewing-collections/to-public.ts` |
| Private Book | `app/v/[token]/_components/book-mode.tsx` |
| i18n de colección (8 idiomas) | `lib/viewing-collections/i18n.ts` |
| Acciones de colección (29) | `app/[country]/(admin)/admin/clientes/viewing-collections-actions.ts` |
| Tracking | `lib/tracking/analytics.ts` |
| **KPI roto** | `lib/db/queries/reports.ts:44-49` |
| Sugerencias (rule-based) | `lib/db/queries/suggested-properties.ts` |
| Cliente de IA | `lib/services/ai/chat.ts` |
| Proxy de imagen | `app/p/[slug]/[idx]/route.ts` |
| **Bucket inexistente** | `app/api/admin/publicacion/upload-media/route.ts:39` |
| Web pública (ignora `published_web`) | `lib/portal-fetch.ts:19-32` |
| i18n del CRM (4 idiomas) | `lib/i18n/dictionary.ts` |
| Tokens de diseño | `tailwind.config.ts` + `app/globals.css` |
| Diseño de la web | `app/web/portal.css` |
| Taxonomía de Madrid (desconectada) | `lib/madrid-zones.ts` |

---

*Auditoría del estado actual · v1.0 · 2026-08-18*
*Repo `smartbc` @ `bd5dbdf` · datos de producción leídos en solo lectura.*
*No se ha modificado ningún fichero de la aplicación.*
