# Viewing Collection — Luxury Design Handoff

**v1.0 · Sprint 4 · 2026-08-15 · rama `feat/viewing-collections`**

**Estado: LUXURY VIEWING EXPERIENCE COMPLETE — READY FOR FINAL QA & DEPLOY**

---

## 1. Concepto: *The Private Book*

La colección se abre como un libro privado: **una portada en tinta a sangre completa que da paso a un cuerpo editorial en marfil**. Esa transición de oscuro a claro *es* el gesto de abrir la publicación, y es lo que separa la experiencia de una página de portal inmobiliario.

```
PORTADA (tinta, foto a sangre)   ← el gesto de abrir
        ↓
LA JORNADA (marfil)              ← el índice: se entiende en dos segundos
        ↓
CAPÍTULO 01 … 06                 ← composición alterna, ritmo de revista
        ↓
TU ASESOR (marfil)
        ↓
COLOFÓN (tinta)                  ← la contraportada
```

El oscuro se usa **solo** en portada y colofón. Aplicarlo a toda la publicación la haría pesada de leer; reservarlo a la apertura y el cierre le da el peso de una cubierta.

---

## 2. Referencias y qué se tomó de cada una

Revisión previa a implementar (búsqueda web, no copia literal de ninguna marca).

| Referencia | Principio extraído | Dónde se aplica |
|---|---|---|
| **Christie's** *(principal)* | «Refinement and restraint — generous spacing, careful typography, visual composure that lets the homes do the talking» | Filetes en lugar de cajas; espacio negativo como material; fotografía a sangre |
| **Christie's / Sotheby's** | Los datos se presentan como *«elegant typographic data points rather than infographic callouts»* | **El cambio más visible**: la ficha técnica pasó de chips con iconos a etiqueta en versalitas + cifra en serif |
| **Sotheby's** | «Strict cream/white palette with photography carrying all visual weight» | Marfil + tinta; el oro solo como filete y acento |
| **Investigación del sector** | El oscuro señala contención y exclusividad, «la misma razón por la que la moda de lujo tiende a oscuro» | Portada y colofón en tinta |
| **Investigación del sector** | *«Cinematic hero, video or single still. Carousels underperform and hurt LCP»* | Una sola fotografía fija por capítulo; nunca carrusel |
| **DAMAC** | Cada residencia como pieza propia, hero grande, jerarquía tipográfica fuerte | Numeración `01 / 06`, apertura de capítulo con filete, hero a sangre |
| **EMAAR / SERHANT** | Journey continuo, mobile-first, transiciones limpias, tecnología invisible | Raíl de navegación sin cromo, reveals suaves, barra de progreso de 1px |
| **Douglas Elliman** | El contenido editorial por encima del inventario | «Tu día de visitas» antes que las propiedades |

---

## 3. Sistema visual

### Tipografía — tres voces, ya existentes en el proyecto

| Fuente | Papel | Uso |
|---|---|---|
| **Cinzel** (`font-display`) | Voz institucional | Versalitas con tracking amplio: etiquetas, números de capítulo, marca, acciones |
| **Playfair Display** (`font-serif`) | Voz editorial | Titulares, precios, horas, nombre del cliente en cursiva |
| **Inter** (`font-sans`) | Voz de lectura | Metadatos, direcciones, texto corrido |

Cinzel es una serif inscripcional tipo Trajan — exactamente el registro de las casas de subastas. Ya estaba configurada en el proyecto y sin explotar.

**Tamaños:** nada importante baja de 11px. El titular de portada escala de 38px (móvil) a 78px (desktop). Las cifras de la ficha técnica van a 19–22px en serif, no en 11px gris.

### Color

```
ink      #0a0a0a   portada, colofón, texto
cream-50 #fbf8f3   cuerpo de la publicación
gold     #c9a96e   SOLO filetes, etiqueta de sección y marcador activo
```

Sin oro de relleno. El lujo lo dan la proporción, el espacio y la fotografía, no la saturación dorada.

### Motion

En `app/globals.css`, bajo una cabecera propia. Reveals de 900ms al entrar en viewport, Ken Burns de 24s en la portada, subrayados que crecen, transiciones de 500ms.

**Todo se anula con `prefers-reduced-motion`**, incluido el scroll suave (que se hace por JS precisamente para poder respetarlo sin imponer `scroll-behavior: smooth` a todo el documento).

Si el JS falla, el contenido se ve igual: `.vc-reveal` sin observador se muestra directamente.

---

## 4. Componentes

### Nuevos — `app/v/[token]/_components/`

| Fichero | Contenido |
|---|---|
| `editorial.tsx` | Primitivas: `Label`, `Rule`, `Ornament`, **`DataPoint`**, `Reveal`, `StatusLine`, `ChapterMark`, `EditorialAction` |
| `collection-cover.tsx` | Portada a sangre en tinta |
| `day-overview.tsx` | «Tu día de visitas» |
| `residence-chapter.tsx` | Capítulo: apertura, hero, bloque alterno, galería diferida, CTA |
| `chapter-nav.tsx` | `ChapterRail` (desktop) + `ProgressBar` (móvil) |
| `closing.tsx` | `AdvisorBlock` + `Colophon` |

`DataPoint` es la pieza clave: etiqueta minúscula en versalitas sobre cifra grande en serif. Es lo que sustituye a los chips de icono y lo que más aleja el resultado de una estética de panel.

`StatusLine` dice el estado con palabras y un punto de 4px, en lugar de un badge de color. En una publicación editorial el estado se dice, no se pinta.

### Reescritos

- `viewing-collection-view.tsx` — orquestador: navegación, progreso, capítulo activo, analytics
- `collection-unavailable-view.tsx` — en tinta, mismo lenguaje; **sigue sin recibir props**

### Nuevos fuera de la vista

| Fichero | Para qué |
|---|---|
| `app/v/preview/[itineraryId]/page.tsx` | **Previsualización del agente.** Misma query, misma proyección, mismo componente; autorizada por sesión de staff en vez de por token, y funciona con el itinerario en borrador |
| `app/v/design-preview/page.tsx` | Banco de pruebas visual. 404 en producción, no toca la BD |
| `scripts/check-viewing-collection-html.mjs` | Comprobación de fugas sobre el HTML servido |

### Modificados

`app/globals.css` · `lib/db/queries/viewing-collections.ts` (`getPreviewCollection`) · `hooks/use-analytics.ts` (`disabled`) · `itinerary-builder.tsx` y `publish-collection-dialog.tsx` (botón *Previsualizar*) · `app/api/admin/property-shares/route.ts` (movida, ver §7)

---

## 5. Responsive

| Viewport | Comportamiento |
|---|---|
| **375 (iPhone SE)** | Portada a `100svh` con aire reducido; hero 4:5; ficha técnica apilada; barra de progreso arriba |
| **430 (iPhone Pro)** | Igual con más respiración |
| **768 (tablet vertical)** | Hero 3:2; ficha en fila; sin raíl todavía |
| **1024 (tablet horizontal)** | Entra `lg:`: hero 16:8, bloque editorial a dos columnas, aparece el raíl |
| **1440 (portátil)** | Composición completa: alternancia par/impar visible |
| **1920 (desktop)** | Contenido a `max-w-5xl`; la fotografía sigue a sangre |

Desktop no es «móvil más ancho»: a partir de `lg` el bloque editorial se parte en 7+5 columnas y **alterna de lado en cada capítulo**, que es de donde sale el ritmo de revista.

**Fotografía:** portada con `fetchPriority="high"`; capítulo 1 `eager`, el resto `lazy`; la galería completa solo se monta al pulsar. Nunca seis galerías de golpe.

---

## 6. QA realizado

**Herramienta:** Playwright headless, 6 viewports × 7 puntos de la publicación + estado terminal = **43 capturas por pasada**, cinco pasadas. Detección automática de overflow horizontal y errores de consola.

### Cinco fallos reales encontrados y corregidos

| # | Problema | Causa | Corrección |
|---|---|---|---|
| 1 | **La ruta de pruebas servía la página de «no disponible»** | La carpeta se llamaba `_preview`; Next.js excluye del enrutado las que empiezan por guion bajo, así que la URL caía en `/v/[token]` | Renombrada a `design-preview` (un segmento estático gana al dinámico) |
| 2 | **El raíl de capítulos salía en diagonal** | El título invisible (`text-ink/0`) seguía ocupando ancho, y cada título empujaba su número a una posición distinta | El título sale del flujo con posicionamiento absoluto |
| 3 | **El raíl era ilegible sobre fotografías claras** | Tinta sobre foto clara | `mix-blend-difference`: se invierte solo según el fondo real, sin añadir velo ni caja |
| 4 | **La alternancia par/impar no ocurría** | `direction: rtl` en la rejilla entraba en conflicto con los `col-start` explícitos | Colocación directa por columna, y el filete separador cambia de mano con el volteo |
| 5 | **La marca de scroll quedaba cortada en iPhone SE** | 667px de alto no daban para el aire previsto | Trazo más corto y espaciado escalonado en pantallas cortas |

También: guion de «sin hora» que aparecía tachado, y contraste insuficiente en el rótulo de la galería.

### Verificaciones finales

```
overflow horizontal en 6 viewports  → ninguno
errores de consola                  → ninguno
npm run test:viewing-collections    → 172 asserts, TODO OK
npx tsc --noEmit                    → limpio
npm run build                       → compilado; /v/[token], /v/preview, /v/design-preview
```

**Comprobación de fugas sobre el HTML realmente servido** (13 asserts, `scripts/check-viewing-collection-html.mjs`): sin `owner_*`, sin notas internas ni de agente, sin `source_url`, sin `external_id`, sin UUIDs, sin rutas de Storage, sin labels de SmartLink; la residencia `area_only` no revela calle y la autorizada sí se muestra.

> Este último script es nuevo y cubre un hueco que los tests unitarios no alcanzaban: un objeto interno pasado como prop a un Client Component viaja en el payload RSC aunque no se pinte. La proyección se testea aislada; esto testea lo que sale por el cable.

### Capturas

En `/tmp/vc-shots/` (43 PNG a 2× DPR). Se pueden regenerar levantando `npm run dev` y ejecutando el script de Playwright descrito arriba; no se han versionado por peso.

---

## 7. Decisiones y hallazgos

**D-1 · Conflicto de rutas heredado de Sprint 3.** El servidor de desarrollo detectó que `app/api/admin/properties/[id]/shares` chocaba con `[slug]` del mismo nivel — Next.js no admite dos nombres de segmento dinámico ahí. El `npm run build` de Sprint 3 no lo reportó. Movida a `/api/admin/property-shares?propertyId=…`.

**D-2 · La previsualización no emite analítica.** `useAnalytics` acepta `disabled`; con `shareId` vacío la vista no instrumenta nada. Sin esto, cada vez que un agente previsualizara se contaría como una apertura del cliente.

**D-3 · `mix-blend-difference` en lugar de un velo.** Un fondo semiopaco bajo el raíl habría sido cromo de aplicación. La mezcla por diferencia resuelve la legibilidad sin añadir ni un píxel de interfaz.

**D-4 · El estado se dice, no se pinta.** `PRIVATE VIEWING · CONFIRMED` en versalitas con un punto de 4px, en vez de una píldora verde. Es la diferencia entre una publicación y un panel de control.

**D-5 · Los datos van en tipografía.** Dos filetes y tres `DataPoint` sustituyen a la tarjeta con iconos. Es lo que las referencias llaman *elegant typographic data points*, y es el cambio que más carga el resultado hacia lo editorial.

---

## 8. Garantías de Sprint 3: intactas

Nada del backend, contratos ni seguridad se ha modificado.

| Garantía | Estado |
|---|---|
| `PublicViewingCollection` | ✅ **Sin un solo cambio** |
| `toPublicViewingCollection` | ✅ Sin cambios |
| `PUBLIC_COLLECTION_SELECT` | ✅ Sin cambios |
| Migraciones | ✅ `git status supabase/` limpio |
| Caducidad, revocación, estados terminales indistinguibles | ✅ |
| `hidden_from_client` y renumeración sin huecos | ✅ Verificado en el caso 06 |
| `address_visibility` | ✅ Verificado sobre el HTML servido |
| SmartLinks, permisos, feature flag, `noindex` | ✅ |
| Sin cliente Supabase en la vista pública | ✅ Ningún componente importa `lib/db` |
| Eventos de analítica | ✅ `collection_open`, `stop_view`, `stop_expand`, `share_click` |

---

## 9. Accesibilidad

- Contraste: doble velo en portada; texto principal `text-ink` sobre marfil
- Foco visible: `.vc-focus` con `outline-offset: 4px` en todo elemento interactivo
- Teclado: navegación completa; enlace «Saltar a la jornada» al inicio
- Semántica: `header` / `main` / `footer`, `section` con `aria-labelledby`, `ol` en el itinerario, `aria-expanded` en la galería, `role="progressbar"` con valores
- `prefers-reduced-motion`: anula reveals, Ken Burns, transiciones y scroll suave
- Tamaños: nada crítico por debajo de 11px; cifras a 19–22px

---

## 10. Limitaciones reales

1. **No hay mapa en `area_only`** — decisión técnica de Sprint 3 (sin centroides fiables). El texto explica al cliente que la dirección llega al confirmar.

2. **Las capturas usan fotografías locales del repo.** El `.env.local` de esta máquina tiene la URL de Supabase sin configurar (`your-project.supabase.co`), así que el proxy `/p/` no resuelve nada en local. El banco de pruebas usa `/portal-hero.jpg` y `/login-bg.jpg` a propósito: así el QA visual funciona en cualquier entorno. **Lo que no se ha podido validar en local es el encuadre con fotografía real de cartera** — conviene abrir una colección real tras el deploy.

3. **`exactLat`/`exactLng` viajan en el payload aunque no haya mapa.** Están en el contrato y solo para paradas autorizadas, así que no es una fuga; es peso muerto hasta que exista mapa.

4. **Sin vídeo en la colección.** El vídeo vive en el SmartLink, detrás de *Explorar residencia*. Coherente con «el catálogo seduce, el SmartLink profundiza».

5. **Benchmark de rendimiento no medido.** El QA fue visual y funcional. Falta medir LCP real en 4G con fotografía de producción — sigue pendiente de Sprint 3F.

6. **Copy en español con marca en inglés.** «Private Viewing Collection» y «Private Client Services» conviven con el cuerpo en español. Es deliberado (el registro internacional del sector), pero si la mayoría de clientes son internacionales, la colección entera debería poder servirse en inglés. No hay i18n en esta superficie.

---

## 11. Cómo verlo

```bash
npm run dev
open http://localhost:3137/v/design-preview      # banco de pruebas (solo desarrollo)

# Comprobación de fugas con el servidor levantado
node scripts/check-viewing-collection-html.mjs

npm run test:viewing-collections                 # 172 asserts
```

Con datos reales: desde la ficha de un cliente → itinerario → **Previsualizar**, o el enlace `/v/{token}` tras publicar.

---

## 12. Siguiente paso

El diseño está completo y verificado en seis viewports. Lo que queda antes de producción no es visual:

1. **Abrir una colección real tras el deploy** y revisar el encuadre con fotografía de cartera (limitación 2).
2. **Medir LCP en móvil** con fotografía real (limitación 5).
3. **Decidir el idioma** de la superficie pública (limitación 6).
