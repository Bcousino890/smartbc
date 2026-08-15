# Auditoría previa · receptor de la ingesta de Idealista

Lo que ya existía en el repositorio antes de tocar nada, y qué se reutilizó.
La conclusión corta: **la mitad del trabajo ya estaba hecho** — la
infraestructura de integraciones de `/api/v1` (claves rotables, scopes, rate
limit, idempotencia, auditoría) se construyó para el proveedor de captaciones
de Chile y sirve igual aquí. Lo que faltaba era el modelo de datos del mercado
y el control operativo del scraper.

## Matriz

| Área | Estado | Qué hay / qué se hizo |
|---|---|---|
| Framework | ✅ YA EXISTE | Next.js 15 (App Router), React 19, TypeScript |
| Base de datos | ✅ YA EXISTE | Supabase self-host (Postgres) en el propio VPS |
| ORM | ✅ YA EXISTE | `supabase-js` con service role; sin ORM |
| Migraciones | ✅ YA EXISTE | `supabase/migrations/*.sql`, relanzadas enteras en cada deploy → **todo debe ser idempotente** |
| Auth de integraciones | ✅ YA EXISTE | `api_clients` + `api_keys` (SHA-256, prefijo indexado, revocables) |
| Pipeline de API | ✅ YA EXISTE | `withApiRoute`: auth, scope, rate limit, validación zod, idempotencia, auditoría |
| Idempotencia | ✅ YA EXISTE | `api_idempotency` por `Idempotency-Key`, 24 h |
| Log de peticiones | ✅ YA EXISTE | `api_requests` + panel en `/admin/integraciones` |
| Dry-run | ✅ YA EXISTE | Cabecera `X-SmartBC-Dry-Run` en el pipeline |
| OpenAPI | ✅ YA EXISTE | Generado desde los esquemas zod; **extendido** con el bloque de Idealista |
| Scopes | ⚠️ PARCIAL | Existían 3 de captaciones; **añadidos** `idealista:read` / `idealista:write` |
| Normalización de fotos | ✅ YA EXISTE | `toIdealistaHighQuality()` — el perfil del CDN **sin marca de agua**. Reutilizado tal cual |
| Normalización de teléfonos | ✅ YA EXISTE | `normalizeSpanishPhone()`. Reutilizado tal cual |
| Modelo de anuncios | ⚠️ PARCIAL | `particulares` (tabla de 2024, ~25 campos, solo particulares, multi-portal). Insuficiente: el contrato pide ~110 campos, fotos, teléfonos, eventos e histórico. **Tabla nueva**, ver abajo |
| Fotos | ❌ FALTABA | `idealista_market_photos` (incluye planos, vídeos y tours vía `kind`) |
| Teléfonos | ❌ FALTABA | `idealista_market_phones`, con `is_active` en vez de borrado |
| Enlaces | ❌ FALTABA | `idealista_market_links` |
| Eventos | ⚠️ PARCIAL | `particulares_changes` tenía 5 tipos; el contrato pide 15. **Tabla nueva** con dedupe |
| Histórico | ❌ FALTABA | `idealista_market_snapshots` (solo hashes y precio, no el payload entero) |
| Observaciones de búsqueda | ❌ FALTABA | `idealista_market_observations` |
| Shards | ❌ FALTABA | `idealista_market_shards` |
| Runs | ⚠️ PARCIAL | `sync_logs` existe pero cuelga de `agency_feeds` (FK obligatoria) → no reutilizable. Se siguió su patrón en `idealista_scraper_runs` |
| Heartbeat / health | ❌ FALTABA | `idealista_scraper_workers` |
| Configuración | ⚠️ PARCIAL | `app_settings` (clave/valor genérico) e `idealista_config` (credenciales del Partner API, otra cosa). **Tabla propia** con `version` autoincremental |
| Panel admin | ⚠️ PARCIAL | Existe el módulo `particulares` y su permiso; **añadida** la pantalla `/admin/particulares/scraper` |
| Permisos | ✅ YA EXISTE | Recurso `particulares` reutilizado — quien ve los anuncios ve si el scraper que los trae va bien |
| Scraping | 🚫 NO APLICA | Lo mantiene el proveedor externo. No se ha tocado Playwright, DataDome, proxies ni selectores |

## Por qué una tabla nueva y no ampliar `particulares`

`particulares` (migración 0012) es de otro problema: guarda anuncios **de
particulares** de **varios portales** (idealista, fotocasa, pisos, habitaclia…)
con unos 25 campos y sin sub-recursos. Este contrato cubre **todo el mercado**
de **un solo portal** con ~110 campos, cinco tablas satélite y detección de
cambios.

Meterlo en `particulares` habría significado añadir ~85 columnas que solo
aplican a un portal y dejar la tabla a medio camino entre dos modelos. Se
dejan separadas y convivirán mientras el scraper interno siga en marcha; la
reconciliación se decidirá cuando el externo esté en producción y se vea qué
se jubila.

## Colisión de nombres evitada

Cuatro familias con "idealista" en el nombre y significados distintos:

| Tabla | Qué es | Dirección |
|---|---|---|
| `idealista_listings` | Lo que **nosotros publicamos** en Idealista | salida |
| `idealista_leads` | El **inbox de contactos** de Idealista | entrada |
| `idealista_config` | Credenciales del **Partner API** | — |
| `idealista_market_*` | El **mercado scrapeado** (esto) | entrada |

## Fallo encontrado durante la implementación

La primera versión de la migración usaba índices únicos **parciales**
(`WHERE … IS NOT NULL`) y **de expresión** (`COALESCE(...)`) como claves de
dedupe. PostgREST traduce `onConflict` a `ON CONFLICT (columnas)`, y Postgres
solo sabe inferir de ahí un índice normal: con uno parcial o de expresión
responde `there is no unique or exclusion constraint matching the ON CONFLICT
specification`.

El efecto era silencioso: teléfonos, eventos y snapshots **no se guardaban**
mientras la API respondía que todo había ido bien. Lo destapó el test de
idempotencia (6 fallos de 37). Corregido en la migración 0123, y los errores de
escritura ya no se descartan en silencio.

Es el motivo de que el test exista: sin él, esto se habría descubierto en
producción semanas después, con datos perdidos y sin forma de recuperarlos.
