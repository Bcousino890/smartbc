# S0 · La web pública solo descubre viviendas publicadas: especificación

Que la portada y el bloque «similares» de la web pública respeten el interruptor de publicación, como ya hacen el catálogo y la ficha. También se deja de enviar la dirección, que la web no usa.

- **Tamaño:** **corrección sensible de alcance acotado** (aprobado por Fabricio el 17-10-2026).
  - Sin migración ni datos.
  - Cambia qué ve cualquier visitante de la web pública.
- **Responsable:** Fabricio.
- **Estado:** **aprobada** el 17 de octubre de 2026, junto con el plan. Es la primera entrega del orden aprobado.
- **Base leída:** `origin/main` = `4ccbfa6`, comprobado con `git ls-remote`.

## Contexto

### El contrato de publicación (comprobado)

- La **migración 0143** lo dejó escrito: «A partir de este despliegue la web pública SÍ filtra por `published_web`». Hizo un backfill único de lo que ya se veía en la web (`supabase/migrations/0143_properties_workspace.sql:19-43`).
- El interruptor está en la ficha de la propiedad, en el panel (`property-edit-view.tsx:1719`), y se guarda en `updateProperty` (`app/(admin)/admin/propiedades/actions.ts:661`).
- **`published_web` vale `false` por defecto** (0051). Ningún camino de alta lo pone a `true`.

### Lo que hace cada superficie pública hoy (comprobado en el código)

| Superficie | Código | Filtro | ¿Respeta `published_web`? | Qué datos salen al navegador |
|---|---|---|---|---|
| Catálogo `/web/propiedades` | `app/web/propiedades/page.tsx` → `fetchPortalProperties` (`lib/portal-fetch.ts`) → `CatalogClient` (cliente) | `available|reserved`, no archivada | **Sí** | Toda la lista, **con `address`**, que no se pinta en ningún sitio |
| Ficha `/web/propiedades/[id]` | `getPortalProperty` (`[id]/page.tsx:18-93`) | Igual | **Sí**: 404 si no está publicada | `latitude`/`longitude` exactas al mapa (`PropertyLocationMap`, cliente) |
| **«Similares» en la ficha** | `getSimilarProperties` (`[id]/page.tsx:96-165`) | `available|reserved`, no archivada, las 3 más recientes | **No** | La tarjeta (`PropertyCard`, servidor). Enlaza a `/web/propiedades/<slug>`, que da 404 si no está publicada |
| **Destacados de la portada** `/web` | `app/web/page.tsx` (cliente) → `fetch("/api/portal/properties")` → muestra las 4 primeras | — | — | — |
| **API `/api/portal/properties`** | `app/api/portal/properties/route.ts` | `available|reserved`, no archivada, hasta **1.000**, por `id` descendente | **No** | **JSON público sin guarda** (no está en las rutas de administración ni de cliente del `middleware`): título, `slug`, referencia, precio, **`address`**, descripción, características, fotos y vídeos |

- **`address` no se pinta en la web pública:** búsqueda en `app/web/**`. Solo viaja en los datos.
- Es la **única** ruta de `app/api` que lista propiedades sin guarda: barrido de los `route.ts` que consultan `properties`.
- **No hay `sitemap` ni `robots`** en la app.

### Lo que NO es descubrimiento público y no cambia

Son **enlaces intencionados** o zonas con sesión, que nunca han dependido de `published_web`:

| Superficie | Cómo se llega |
|---|---|
| `/compartir/[slug]` | SmartLink por slug |
| `/c/[token]` | Enlace con seguimiento |
| `/s/[token]` | Shortlist |
| `/v/[token]` | Private Book |
| `/seleccion/[token]` | Catálogos |
| `/a/[token]` | Particulares |
| `/p/...` | Proxy de fotos |
| `/og/...` | Imagen OG |
| Portal del cliente | Con sesión |
| Panel del staff | Con sesión |

Los comentarios de `portal-fetch.ts` y de la ficha lo dicen así: «Los SmartLinks, el shortlist y el Private Book no pasan por aquí».

### No comprobado

- Si algún consumidor **externo** usa `/api/portal/properties`. En el repo solo lo llama la portada.
- Cuántas viviendas `available|reserved` sin publicar hay hoy en producción. No hay acceso.

## Decisiones

- **D-S0-1 (17-10-2026, Fabricio):** el orden de entregas es S0 → mejora del PDF → nuevo buscador del catálogo → importar desde enlace o PDF.
- **D-S0-2 (17-10-2026, Fabricio):** S0 trata la exposición en el descubrimiento público.
  - Hay que distinguir entre publicar en la web y los enlaces para compartir.
  - La corrección es mínima.
  - Se conservan los enlaces intencionados y el acceso del staff.

## Alcance

1. **Un solo filtro de publicación**, compartido: `applyPublicWebFilter(query)`, con `status in (available, reserved)`, `archived_at is null` y `published_web = true`, en un módulo puro y probado (`lib/web/public-contract.ts`). Lo usan:
   - el catálogo (`fetchPortalProperties`), sin cambio de comportamiento;
   - la ficha (`getPortalProperty`), sin cambio de comportamiento;
   - **«similares»**: corregido;
   - **`/api/portal/properties`**: corregido.
2. **Sin `address` en la web pública:**
   - se quita de los `select` y de lo que se envía en las cuatro superficies;
   - `Property.address` pasa a ser opcional en `lib/portal-properties.ts`; los datos de ejemplo de ese archivo no se usan en producción;
   - no cambia nada visible.
3. **La forma de `/api/portal/properties` se mantiene:** la misma lista de objetos, sin `address`, hasta 1.000 y en el mismo orden. Así no se rompe ningún consumidor desconocido. Solo cambia **qué viviendas** salen.

## Fuera de alcance

- **Las coordenadas exactas del mapa** en las fichas publicadas (ver O-S0-2).
- Que «similares» mezcle países, y el formato del precio de Chile en la API (`USD …`).
- Los defectos del buscador de Propiedades.
- El portal del cliente con sesión: no mira `published_web`, pero no es la web pública (ver O-S0-3).
- La caché de 5 minutos (`revalidate = 300`): se mantiene.

## Invariantes

- **Ninguna vivienda sin publicar aparece** en el catálogo, la ficha, «similares», los destacados ni la API pública, sea cual sea su estado.
- Una vivienda **publicada** sale como hoy si está disponible o reservada; nunca si está vendida, archivada (`status`) o tiene `archived_at`.
- **Los enlaces intencionados no cambian:** `/compartir`, `/c`, `/s`, `/v`, `/seleccion`, `/a`, `/p`, `/og` y el portal del cliente.
- **El staff** ve y gestiona igual: el panel usa sus propias consultas.
- **Ninguna superficie pública envía `address`.**

## Datos e impacto

- **Sin migración, sin cambios de datos y sin dependencias nuevas.**
- **Al desplegar:**
  - los destacados de la portada y los «similares» dejan de enseñar las viviendas `available|reserved` con `published_web = false`;
  - si hay menos de 4 publicadas, la portada enseña menos tarjetas;
  - por la caché, el cambio puede tardar hasta 5 minutos.
- El merge despliega también lo que haya en `main` sin desplegar.

## Recuperación de migraciones

No hay migraciones.

## Recuperación del cambio

Revertir el merge con un PR (`git revert`).

## Criterios de aceptación

| # | Criterio |
|---|---|
| S0-1 | `/api/portal/properties` devuelve **solo** las viviendas publicadas y `available|reserved` sin archivar. Un juego sintético con todas las combinaciones lo demuestra (ver el plan). |
| S0-2 | La portada (`/web`) enseña como destacadas **solo** viviendas publicadas. |
| S0-3 | En la ficha `/web/propiedades/<publicada>`, «similares» **solo** enlaza a viviendas publicadas; ninguno de sus enlaces da 404. |
| S0-4 | El catálogo y la ficha no cambian: salen las mismas viviendas que antes, y una sin publicar da 404. |
| S0-5 | **Sin dirección:** una dirección centinela no aparece en ninguna respuesta de la web pública (HTML, datos RSC y JSON de la API), ni de las viviendas publicadas ni de las demás. |
| S0-6 | **Enlaces intencionados intactos:** `/compartir/<sin publicar y disponible>` sigue dando 200 y `/compartir/<archivada>` sigue dando 404. Los archivos de `/compartir`, `/c`, `/s`, `/v`, `/seleccion`, `/a`, `/p` y `/og` no se tocan (se comprueba con el diff). |
| S0-7 | El filtro compartido tiene pruebas puras: aplica exactamente las tres condiciones y lo usan las cuatro superficies (prueba y búsqueda en el código). |
| S0-8 | `tsc`, `next build`, las pruebas del repo y la CI en verde. |

## Preguntas abiertas

- **O-S0-1 · Tamaño de la API.** Hoy la portada usa 4 de hasta 1.000.
  - **Propuesta:** mantener la forma y el límite, para no romper a nadie.
  - **Alternativa:** limitarla a lo que usa la portada; menos datos públicos, pero rompe a cualquier consumidor externo.
- **O-S0-2 · Coordenadas exactas** en el mapa de las fichas publicadas.
  - Hoy van tal cual; `/compartir` usa `location_precision`.
  - **Propuesta:** decidirlo aparte; no entra en S0.
- **O-S0-3 · Portal del cliente con sesión.** Enseña las viviendas disponibles aunque no estén publicadas en la web.
  - **Propuesta:** se queda así (es intencional para clientes), salvo que Fabricio diga lo contrario.

## Aprobación

**17 de octubre de 2026 · Fabricio aprueba la especificación y el plan** como corrección sensible de alcance acotado.

**Alcance aprobado:**
- El descubrimiento de la web pública solo devuelve viviendas **publicadas expresamente, disponibles o reservadas y sin archivar**.
- El filtro compartido se aplica a la API de la portada y a «similares». El catálogo y la ficha conservan su comportamiento, que ya es correcto.
- Se conservan los filtros de país de cada superficie y el resto de sus restricciones.
- **Se quita la dirección** de las respuestas públicas afectadas, incluidos los datos que se envían con la página.
- La API conserva el resto de campos, el orden, el límite de 1.000 y la estructura. Lo único que cambia es la dirección (O-S0-1).
- No se ocultan títulos ni descripciones, que son públicos a propósito.
- **Las coordenadas exactas del mapa quedan fuera de S0** (O-S0-2).
- **Se conservan:**
  - el portal del cliente con sesión (O-S0-3);
  - las rutas para compartir `/compartir`, `/c`, `/s`, `/v`, `/seleccion`, `/a`, `/p` y `/og`;
  - las consultas del staff, las fichas y el comportamiento de los catálogos.

**Entorno y entrega autorizados:**
- un worktree aislado desde el `origin/main` actual;
- `npm ci` con el lockfile existente, sin dependencias nuevas;
- build y arranque aislados, sin `.env*` del repo ni credenciales reales heredadas;
- un simulador sintético de la base, solo en loopback;
- el Chromium ya disponible;
- pruebas del build de producción compilado, regresiones, commits, push, PR y CI.

**Verificación exigida:**
- con la matriz sintética del plan (publicación, estado y archivo), comprobar las consultas y respuestas reales, no solo un resultado simulado;
- demostrar que la prueba de regresión **falla en `main` sin corregir y pasa con la corrección**.

**No autoriza:** producción, credenciales, registros reales, migraciones, IA real ni revisión adicional de Codex. Si una suposición importante resulta falsa, o hace falta otro alcance, se explica antes de ampliar el cambio. Las correcciones ordinarias dentro del alcance están autorizadas.

**Se para antes del merge.**
