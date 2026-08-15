# Viewing Collections & Itineraries — Handoff de implementación

**v1.0 · Sprint 3 · 2026-08-15 · rama `feat/viewing-collections`**

> Desde la ficha de un cliente, un agente puede seleccionar propiedades, construir un itinerario, organizar las visitas, publicarlo como colección privada, compartir el enlace, dirigir cada residencia a su SmartLink y medir la interacción — con seguridad, permisos y trazabilidad.

**Estado: IMPLEMENTATION COMPLETE — READY FOR LUXURY DESIGN**

---

## 1. Qué se implementó

| Área | Estado |
|---|---|
| Prerequisitos (migraciones perdidas, `getSuggestedProperties`, feature flag) | ✅ |
| 5 tablas + 2 triggers de invariante + RPC de publicación atómica + RLS | ✅ |
| Permisos: recurso `viewing_collections` + acción `publish` | ✅ |
| Selección persistente cliente ↔ propiedad (3 vías de entrada) | ✅ |
| Itinerarios multi-día, paradas ordenables, estados de confirmación | ✅ |
| Control de dirección exacta por parada (garantía en BD) | ✅ |
| Ocultar paradas canceladas con renumeración pública sin huecos | ✅ |
| Enlace con `visit_requests` (explícito, compensado) | ✅ |
| SmartLinks: crear al publicar, reutilizar existentes, fallback | ✅ |
| Publicación, caducidad, renovación, revocación | ✅ |
| Ruta pública `/v/[token]` mobile-first + estados terminales | ✅ |
| Contrato client-safe + proyección pura | ✅ |
| Analytics (aperturas de servidor + eventos de navegador) | ✅ |
| Tests: 172 asserts + escenario Paul end-to-end contra BD real | ✅ |
| Feature flag / kill switch | ✅ |
| No regresión de `/c/[token]` y `/compartir/[slug]` | ✅ |

---

## 2. Migraciones

### 2.1 Recuperadas (estaban en producción, no en Git)

Sprint 2 detectó tres; en el VPS había **cinco**:

```
0117_idealista_listing_videos.sql        76 líneas
0118_idealista_partner_api.sql          170 líneas
0119_zinto_integration_api.sql           77 líneas
0120_zinto_crm_cache.sql                 45 líneas
0121_idealista_publish_unpublish_dates    30 líneas
```

Copiadas íntegras desde `/opt/smartbc-app/supabase/migrations/`. **No se reconstruyó nada por suposición.**

### 2.2 Nuevas

| Fichero | Contenido |
|---|---|
| `0122_viewing_collections_core.sql` | 5 tablas, 13 índices, 15 constraints, 3 triggers `updated_at` |
| `0123_viewing_collections_guards.sql` | Trigger cross-cliente + sincronización de país |
| `0124_viewing_collections_publish_fn.sql` | `generate_url_safe_token()` + `publish_viewing_itinerary()` |
| `0125_viewing_collections_analytics.sql` | 3 valores nuevos en `page_events`, `page_views.collection_share_id` |
| `0126_viewing_collections_rls.sql` | 9 policies |
| `0127_viewing_collections_permissions_backfill.sql` | Backfill de `custom_roles` + feature flag en `app_settings` |

**No modifican `property_shares`, `visit_requests` ni `properties`.** Verificado por grep.

### 2.3 Verificación

Clonado el esquema de producción a una BD desechable (`vc_test`), ejecutadas **tres veces seguidas**: `exit=0`, `errores=0` en las tres. Estado final: 5 tablas, 22 índices, 9 policies, 4 funciones, flag activo. BD y temporales eliminados del VPS al terminar.

### 2.4 Aplicación en producción

`post-deploy.sh` las aplica solo en cada deploy. **No se han aplicado a producción desde aquí.**

---

## 3. Ficheros

### Nuevos

```
lib/tokens.ts                                          randomToken compartido
lib/viewing-collections/types.ts                       tipos, enums, derivaciones puras
lib/viewing-collections/public-contract.ts             🔒 contrato público
lib/viewing-collections/to-public.ts                   🔒 proyección pura
lib/viewing-collections/__fixtures__/paul.ts           fixture del caso Paul
lib/db/queries/viewing-collections.ts                  queries panel + pública
app/[country]/(admin)/admin/clientes/viewing-collections-actions.ts   26 server actions
app/v/[token]/page.tsx                                 ruta pública
app/v/[token]/viewing-collection-view.tsx              vista de la colección
app/v/[token]/collection-unavailable-view.tsx          estado terminal (sin props)
app/api/admin/properties/[id]/shares/route.ts          SmartLinks de una propiedad
components/admin/viewing-collections/*.tsx             7 componentes del panel
scripts/test-viewing-collections-projection.mts        60 asserts
scripts/test-viewing-collections-permissions.mts       112 asserts
supabase/migrations/0117…0121                          recuperadas
supabase/migrations/0122…0127                          nuevas
```

### Modificados

| Fichero | Cambio |
|---|---|
| `lib/permissions.ts` | +recurso, +acción, 105 celdas `publish:false`, 7 filas nuevas, scope |
| `lib/db/queries/suggested-properties.ts` | Reescrito (§4.1) |
| `lib/db/queries/shares.ts` | Carga `property_media` en `/c/[token]` |
| `lib/db/queries/analytics.ts` | `PageViewRow.collection_share_id` |
| `app/c/[token]/page.tsx` | Pasa `videos`/`plans` |
| `app/(admin)/admin/propiedades/actions.ts` | Importa `randomToken` de `lib/tokens` |
| `app/api/admin/properties/search/route.ts` | `requirePermission` + país + excluye archivadas |
| `app/api/admin/clientes/[clientId]/suggested-properties/route.ts` | Nuevo contrato + país |
| `app/api/cliente/suggested-properties/route.ts` | Nuevo contrato |
| `app/api/tracking/page-view/route.ts` | Acepta `collectionShareId` |
| `app/[country]/(admin)/admin/clientes/[id]/page.tsx` | Carga selección e itinerarios |
| `app/[country]/(admin)/admin/clientes/[id]/client-ficha-view.tsx` | 2 bloques nuevos + favoritos |
| `components/admin/clientes/suggested-properties-block.tsx` | Reescrito + "añadir a selección" |
| `lib/tracking/analytics.ts` | `trackEvent()` genérico + `collectionShareId` |
| `hooks/use-analytics.ts` | `viewing_collection` |
| `middleware.ts` | `/v` en `PUBLIC_PATHS` |
| `next.config.ts` | `X-Robots-Tag` para `/v/*` |
| `scripts/node-ts-loader.mjs` | Resuelve el alias `@/` |
| `package.json` | `npm run test:viewing-collections` |

---

## 4. Prerequisitos resueltos

### 4.1 `getSuggestedProperties`

Ocho correcciones. La que lo rompía: pedía `photos(url)` y esa relación no existe — es `property_photos`. La query fallaba siempre y el bloque decía "no hay resultados" para todos los clientes.

| # | Corrección |
|---|---|
| 1 | `photos(url)` → `property_photos(url, position, is_cover)` |
| 2 | `stay` solo se filtra si no es null (en venta es null y vaciaba el resultado) |
| 3 | `operation` solo si no es null, y contempla `operations[]` (propiedades duales) |
| 4 | Filtra `archived_at is null` |
| 5 | Filtra por país del cliente |
| 6 | Fotos por el proxy `/p/`, no la URL de Storage |
| 7 | Devuelve discriminado: `no_preferences` ≠ `error` |
| 8 | La UI distingue ambos casos |

El punto 6 era de seguridad: al arreglar el 1, habría empezado a emitir URLs de Storage que delatan el portal de origen.

### 4.2 Vídeos y planos en `/c/[token]`

`getPropertyByShareToken` ahora carga `property_media`. Sin cambios de esquema ni visuales: `PublicPropertyView` ya aceptaba ambas props. Un enlace sin media renderiza igual que antes.

### 4.3 Feature flag

`app_settings.viewing_collections`:

```json
{ "enabled": true, "default_expiry_days": 60, "max_expiry_days": 180, "allow_renewal": true }
```

Con `enabled: false`: los bloques desaparecen del panel, las actions rechazan y `/v/[token]` devuelve la vista de no disponible. **Sin desplegar.**

---

## 5. Decisiones técnicas tomadas durante la implementación

Cinco desviaciones o hallazgos respecto a la especificación de Sprint 2.

### D-1 · `custom_roles.matrix`, no `.permissions`

Sprint 2 especificó el backfill sobre una columna `permissions`. La columna real es **`matrix`** (y `label`, no `name`). Lo detectó la BD de prueba. Corregido.

### D-2 · pgcrypto vive en el esquema `extensions`

`gen_random_bytes` no resolvía: pgcrypto está en `extensions`, no en `public`. Ambas funciones SQL llevan ahora `SET search_path = public, extensions`, de modo que funcionan sea cual sea el `search_path` del rol que llame. Sin esto, `publish_viewing_itinerary` habría fallado en producción con service role.

### D-3 · El filtro de paradas ocultas vive solo en la proyección

Sprint 2 planteaba filtrar `hidden_from_client` en la query **y** en la proyección. El filtro sobre recurso embebido de PostgREST no se pudo verificar sin la app corriendo contra el VPS, y un filtro no verificado es peor que ninguno.

**Decisión:** la query carga todas las paradas y la proyección filtra. Hay test que lo prueba (incluido el caso "la query no filtra"). Los datos de una parada oculta llegan a memoria del servidor pero **nunca** cruzan al cliente.

*Mejora futura:* si se confirma que el filtro embebido funciona en la versión de PostgREST del VPS, añadirlo como primera barrera y dejar la proyección como segunda.

### D-4 · `es-ES` no agrupa millares hasta 5 dígitos

Un test esperaba `1.750 €/mes` y el código producía `1750 €/mes`. **El código estaba bien**: CLDR fija `minimumGroupingDigits=2` para es-ES, así que 1750 va sin punto y 17500 con él. Corregida la expectativa y añadido el caso de 5 dígitos.

### D-5 · El loader de tests no resolvía `@/`

`scripts/node-ts-loader.mjs` solo resolvía rutas relativas. Extendido para mapear `@/` a la raíz, igual que `tsconfig.paths`. Beneficia a cualquier test futuro de `lib/`.

---

## 6. Garantías de seguridad, y dónde viven

| Garantía | Mecanismo | Nivel |
|---|---|---|
| Una parada no puede usar la selección de otro cliente | Trigger `vs_assert_same_client` | **BD** — falla incluso con service role |
| Dirección exacta solo en visitas confirmadas | CHECK `vs_exact_address_requires_confirmation` | **BD** |
| Cancelar revierte la dirección | El CHECK obliga a escribir ambas columnas juntas | **BD** |
| Ocultar solo paradas caídas | CHECK `vs_hidden_requires_cancelled` | **BD** |
| No se borra un itinerario publicado | FK `RESTRICT` sobre `viewing_collection_shares` | **BD** |
| No se borra una propiedad con historial | FK `RESTRICT` sobre `client_property_selections` | **BD** |
| Sin datos internos en la superficie pública | Columnas explícitas + tipo + proyección pura | Query + tipo + test |
| Coordenadas anuladas con la dirección | Se deciden en la misma rama de la proyección | Proyección + test |
| Fotos siempre por el proxy | `proxyPhotoUrls()` | Proyección + test |
| Estados terminales indistinguibles | `CollectionUnavailableView` **sin props** | Estructural |
| Sin Supabase en el navegador | La página pública es Server Component | Estructural |
| No indexable | `robots` + `X-Robots-Tag` | Metadata + cabecera |

Las seis primeras no dependen de que nadie recuerde nada.

---

## 7. Tests ejecutados

```
npm run test:viewing-collections     → 172 asserts, TODO OK
npx tsc --noEmit                     → sin errores
npm run build                        → compilado, /v/[token] registrada, 139 páginas
```

**Proyección (60 asserts):** 11 datos prohibidos ausentes, sin UUIDs, sin rutas de Storage, dirección/coordenadas por rama, dirección contaminada degradada, fotos por proxy, renumeración sin huecos, segunda barrera, colapso de estados, disponibilidad, cascada de SmartLink, formato es-ES, agente, estado derivado del enlace, posiciones, tokens.

**Permisos (112 asserts):** estructura 16×6, `publish` no se filtra a ningún recurso antiguo (9 roles), matriz completa por rol, `agent_junior` prepara pero no publica, `captadora` sin acceso, scope, `normalizeMatrix`.

**End-to-end del caso Paul contra el esquema real de producción** (BD clonada, ya eliminada):

```
01 · Piso en Trafalgar        · 10:00 · confirmed · exact     · visible · link
02 · Atico en Chamberi        · 10:45 · confirmed · exact     · visible · link
03 · Piso en Rios Rosas       · 11:30 · proposed  · area_only · visible · link
04 · Estudio en Malasana      · 12:15 · confirmed · exact     · visible · link
05 · Piso en Bilbao           · 13:00 · confirmed · exact     · visible · link
06 · Loft en Alonso Martinez  · 13:45 · cancelled · area_only · OCULTA  · link
```

Verificado en la misma pasada: 8 selecciones, idempotencia del alta, país derivado por trigger, 2026-08-17 = lunes y 2026-08-19 = miércoles, cancelación que exige revertir la dirección, fuga cross-cliente bloqueada con el mensaje correcto, publicación atómica (token de 28 chars, 6 SmartLinks, label `Viewing Collection · Paul Cabrera · Visitas del lunes · Stop 01`), ocultar y renumerar, los tres `RESTRICT`, aperturas, revocación que conserva la analítica.

**Regresión:** `/c/[token]` y `/compartir/[slug]` compilan y conservan su contrato; ninguna migración toca `property_shares` ni `visit_requests`; `createShareLink` sigue funcionando tras extraer `randomToken`.

---

## 8. Limitaciones reales

1. **Sin datos de producción con los que validar.** 6 clientes, 0 favoritos, 0 visitas, 0 SmartLinks. La fixture de Paul es la única red hasta que el equipo lo use de verdad. **Recomiendo recorrer el flujo a mano con un cliente real antes de anunciarlo.**

2. **`area_only` no muestra mapa.** No hay centroides fiables: `geofence_zones` y `location_hierarchies` vacías, sin PostGIS, `chile_zones` sin coordenadas, y el `ZONE_COORDS` del código cubre 7 de los 21 distritos de Madrid y cae a Puerta del Sol. Reutilizarlo señalaría un sitio incorrecto. `areaLocation` ya está en el contrato como tipo aparte: activarlo será rellenar una función.

3. **Reordenar es con flechas, no drag & drop.** El modelo de posiciones espaciadas ya soporta drag & drop (una escritura por movimiento); falta solo la interacción. Evité meter una librería nueva.

4. **La analítica no distingue sesiones únicas por parada.** `stopsViewed` cuenta órdenes distintas vistas en cualquier sesión.

5. **`profiles_select USING (true)` sigue viva en producción.** Cualquiera con la anon key lee emails y teléfonos de todos los clientes y del staff. **Este módulo no lo empeora** — la página pública no carga el cliente Supabase (es Server Component) — pero es deuda preexistente que ahora convive con una superficie pública nueva. Merece su propio ticket.

6. **`schema_migrations` no es fiable**: 38 filas frente a 135+ ficheros. No sirve para saber qué está aplicado.

7. **Sin sincronización parada ↔ `visit_requests`** (decisión Q-1). Si alguien cambia el estado desde `/admin/solicitudes`, la parada no se entera. El panel muestra ambos.

---

## 9. Despliegue

```bash
git checkout feat/viewing-collections
npm run build && npm run test:viewing-collections
# merge a main → el cron del VPS hace pull + build + post-deploy.sh + pm2 restart
```

`post-deploy.sh` aplica `0117`–`0127`. Las cinco recuperadas ya están aplicadas en producción y son idempotentes: no harán nada.

**Comprobar tras el deploy:**

```sql
SELECT count(*) FROM information_schema.tables
 WHERE table_schema='public'
   AND (table_name LIKE 'viewing_%' OR table_name='client_property_selections');  -- 5

SELECT value FROM app_settings WHERE key='viewing_collections';                    -- enabled: true
```

**Apagar sin desplegar:** `app_settings.viewing_collections.enabled = false` desde `/admin/configuracion`.

**Rollback:** revertir el commit. Si hay que deshacer la BD, el orden está en Sprint 2 §32.4. La única con rollback delicado es `0125`: si ya hay eventos `collection_open`/`stop_view`/`stop_expand`, hay que borrarlos antes de restaurar el CHECK antiguo — por eso conviene usar el kill switch en lugar de revertir la migración.

---

## 10. Siguiente fase — Luxury Design

La superficie pública está estructurada por bloques para que el rediseño no toque lógica:

| Bloque | Dónde | Consume |
|---|---|---|
| `CollectionCover` | `viewing-collection-view.tsx` | `title`, `dateLabel`, `clientFirstName`, `stopCount` |
| `DayOverview` | ídem | subconjunto de `stops` |
| `ResidencePreview` | ídem | `PublicViewingStop` |
| `ScheduleBlock` | ídem | hora, duración, estado |
| `LocationBlock` | ídem | dirección o zona |
| `SmartLinkCTA` | ídem (`<a>` de "Ver la residencia") | `smartLinkUrl` |
| `AgentContactBlock` | ídem | `PublicAgentContact` |
| `CollectionUnavailableView` | fichero propio | nada, a propósito |

**Reglas para esa fase:**
- Consumir solo `PublicViewingCollection`. Añadir un campo al contrato es una decisión de seguridad y hay tests que lo vigilan.
- Todas las imágenes por `/p/`.
- Mobile-first: el cliente abrirá el enlace de camino a la primera visita.
- No cargar las 6 galerías completas de entrada (hoy: portada + galería diferida al pulsar).

---

## Apéndice · Comandos

```bash
npm run test:viewing-collections    # 172 asserts
npx tsc --noEmit
npm run build

# Inspección read-only del esquema vivo
SQL64=$(echo "SELECT count(*) FROM viewing_stops;" | base64)
ssh root@178.105.185.125 \
  "echo $SQL64 | base64 -d | docker exec -i supabase-db psql -U postgres -d postgres -A -t"
```
