# SMARTLINK 2.0 — PROPERTY EXPERIENCE FORENSIC BENCHMARK v1.0
## EMAAR vs DAMAC · Arquitectura narrativa · Media · Vídeo · Content Intelligence · BCP fit

**Fecha:** 2026-08-20 · **Sin cambios de código.**
**Metodología:** navegador real (Playwright/Chromium), 10 páginas live × 2 viewports (1440×900 y 390×844 con UA iPhone), scroll completo para lazy content, extracción DOM (orden de módulos, primer viewport, atributos de `<video>`, imágenes por contenedor, bloques de texto con conteo de palabras, CTAs y sticky, formularios), screenshots de página completa, y análisis suplementario de bloques de texto para EMAAR (su copy no usa `<p>`). Auditoría del repo smartbc con archivo:línea. Contenido BCP medido sobre **5 SmartLinks reales de producción** (lectura pública). No se copió ningún asset ni texto comercial largo; los copys se parafrasean.

---

# PART A — MUESTRA

| Company | Project | URL | Type | Live | Por qué |
|---|---|---|---|---|---|
| EMAAR | Valia | emaar.com/en/properties/valia-at-dubai-creek-harbour | Apartamentos waterfront | ✅ | apartamento urbano |
| EMAAR | Terra Woods | …/terra-woods-at-expo-living | Apartamentos + townhouses | ✅ | mixto/villa |
| EMAAR | Greencrest | …/greencrest-at-dubai-hills-estate | Apartamentos community-led | ✅ | comunidad como argumento |
| EMAAR | Vista Ridge | …/vista-ridge-at-emaar-south | Apartamentos + townhouses | ✅ | lanzamiento reciente |
| EMAAR | Creek Haven | …/creek-haven-at-dubai-creek-harbour | Apartamentos | ✅ | segundo caso de la misma comunidad (consistencia) |
| DAMAC | Golf Gate 2 | damacproperties.com/en/communities/damac-hills-community/projects/golf-gate-2/ | Apartamentos en comunidad | ✅ | apartamento |
| DAMAC | Lagoons District Valencia | …/damac-lagoons/projects/damac-lagoons-district-valencia/ | Villas/townhouses lifestyle | ✅ | villa + lifestyle |
| DAMAC | Couture by Cavalli | …/projects/couture-by-cavalli/ | Branded residence | ✅ | branded |
| DAMAC | Chelsea Residences | …/projects/chelsea-residences/ | Branded (deportivo) | ✅ | branded reciente |
| DAMAC | Safa Gate | …/projects/safa-gate/ | Torre, lanzamiento | ✅ | lanzamiento |

*Limitación declarada: las branded residences de EMAAR (Address, Vida) viven en microsites separados; la muestra EMAAR cubre su plantilla estándar de lanzamiento, que es la relevante como patrón.*

---

# PART B — ARQUITECTURA COMPLETA DE PÁGINA

## §2 Mapa modular (orden real, verificado en las 5 páginas de cada uno)

| # | EMAAR | DAMAC | Propósito |
|---|---|---|---|
| 01 | **Hero imagen** full-bleed (interior/lifestyle) | **Hero VÍDEO** autoplay·muted·loop (5/5, Contentful CDN) con nombre sobre el vídeo | primera impresión |
| 02 | Barra identidad: breadcrumb + nombre + 2 CTAs (Sales video call / Register interest) | Franja identidad: **precio desde (AED)** + ENQUIRE NOW + estado (AVAILABLE) + h-title + párrafo corto | quién/cuánto/qué hacer |
| 03 | Intro: eyebrow + nombre + párrafo (~40-60w) + **Download brochure** con "plaque" de marca | Render full-bleed | posicionamiento |
| 04 | **2 capítulos alternos imagen↔copy** (foto 50% + eyebrow + 40-67 palabras, lado alternado) | **2º vídeo cinematográfico** a media página (~1.550px, 5/5) "Select your dream home" | narrativa |
| 05 | Capítulo "espacio": intro + **3 tarjetas de key facts** (dormitorios · acabados · precio desde) | Banda brochure (plaque + download) | datos clave |
| 06 | **GALLERY**: 2 mini-carruseles lado a lado, cada uno con **caption editorial de ~50-60 palabras debajo** | **A WORLD OF AMENITIES**: fila de icon-tabs + carrusel de fotos con caption | media curada |
| 07 | **AMENITIES**: párrafo intro + grid de iconos con nombre (8-10 ítems) | Bloque inmersivo "Enter the world of…" (tour/3D embebido) | amenities/inmersión |
| 08 | **Mapa Google** con chips de POIs encima (Creek Marina, Central Park, Metro…) | **AVAILABLE UNITS**: selector por tipología con tarjetas (plano + precio + favorito), 5/5 | ubicación / unidades |
| 09 | **Capítulo comunidad**: heading + 3 párrafos + mosaico de fotos con caption + **3 KPI enormes** (711.399 sqm…) + View community | **CONNECTED TO DUBAI**: mapa + tiempos de viaje | contexto mayor |
| 10 | Tabla precios/superficie/unidades disponibles (3/5) + **FAQ** (5/5) + formulario (1, 5-8 inputs) | Other featured projects + Our expertise (stats) + **FAQ** (5/5) + formulario | conversión/SEO |
| 11 | Footer + newsletter | Footer masivo | — |

## §3 Matriz de frecuencia (n=5 por marca)

| Módulo | EMAAR | DAMAC | Nota |
|---|---|---|---|
| Hero imagen | 5/5 | 0/5 | |
| Hero vídeo | 0/5 | **5/5** | autoplay muted loop sin controles |
| Vídeo secundario | 0/5 | **5/5** (2-3 vídeos/página) | |
| Gallery etiquetada | 5/5 | (integrada en amenities/carruseles) | |
| Capítulos imagen+copy | 5/5 (2 por página) | 2-3 por página | |
| Amenities | 5/5 (icon grid) | 5/5 (carrusel foto+icono) | |
| Floor plans | dentro de tabla unidades (3/5) | **5/5** (tarjetas por tipología) | |
| Location/mapa | 5/5 (Google + POI chips) | 5/5 ("Connected to" + tiempos) | |
| Community | 5/5 (capítulo + KPIs) | 5/5 (proyectos hermanos) | |
| Brochure descargable | 4/5 | 5/5 | |
| Formulario enquiry | 5/5 (1 por página) | 5/5 (1) | |
| FAQ | 5/5 | 5/5 | |
| Related projects | 2/5 | 5/5 | |
| Sticky CTA | 5/5 (×1) | 5/5 (×2 desktop, ×1 móvil) | |

---

# PART C — PRIMER VIEWPORT (§4–5)

Medido a 1440×900 y 390×844:

| Antes de scroll | EMAAR | DAMAC | BCP hoy |
|---|---|---|---|
| Título | en overlay/identidad (h1 semántico más abajo) | overlay sobre vídeo | ✅ h1 (tras galería en móvil) |
| Ubicación | breadcrumb comunidad | — | ✅ |
| Tipo | ✅ (rango dormitorios en bloque 05) | ✅ | ✅ |
| Precio desde | 4/5 ✅ | ✅ (franja identidad) | ✅ |
| CTA | ✅ (2) | ✅ (Enquire) | solo header mailto (desktop) |
| Vídeo | ❌ | ✅ reproduciéndose | ❌ |
| Indicador galería | ❌ | ❌ | ✅ (+N) |

**Layout hero:** EMAAR = imagen 100vw ~60-70vh + barra identidad blanca debajo. DAMAC = vídeo 100vw con overlay de título + franja beige identidad/precio. Ambos full-bleed; BCP hoy = galería contenida en `max-w-6xl` con tarjetas.

---

# PART D — FORENSE DE VÍDEO (§6–8)

## §6 Comportamiento medido (todas las páginas DAMAC; EMAAR launch-template no lleva vídeo en page — su vídeo vive en "sales video call" y microsites)

| Project | Placement | Comportamiento medido | Propósito | Móvil |
|---|---|---|---|---|
| Golf Gate 2 | hero (y=0) + sección (~1.571px) | `autoplay muted loop`, sin controles, sin poster, self-hosted Contentful (`videos.ctfassets.net`), mp4 | hero: skyline/arquitectura; 2º: lifestyle | igual (5/5 conservan vídeo y autoplay) |
| Lagoons Valencia | ídem (0 / 1.576px) | ídem | lagoon lifestyle | igual |
| Chelsea Residences | ídem (0 / 1.547px) | ídem | brand film | igual |
| Couture by Cavalli | hero + 2 secciones (1.561 / 5.138px) | ídem | branded glamour | igual |
| Safa Gate | hero + 2 (1.489 / 5.066px) | ídem | panorámicas | igual |

## §7 Patrones de jerarquía de vídeo
- DAMAC: el vídeo **ES el hero** — sustituye a la imagen en el 100% de la muestra; el segundo vídeo funciona como *signature film* de capítulo (~1.500px, tras la identidad); nunca se mezcla con la galería de fotos; vídeo = movimiento/emoción, fotos = detalle/tipologías.
- EMAAR (plantilla launch): fotografía editorial curada en vez de vídeo; el vídeo se ofrece como acción humana ("Sales video call").
- Regla común: **si hay vídeo, va arriba y en autoplay silencioso**, jamás enterrado al final.

## §8 Traducción a capacidades BCP (solo viabilidad, sin diseñar)

| Patrón | ¿Posible hoy con datos BCP? |
|---|---|
| Hero-vídeo autoplay muted | **SÍ técnicamente**: `property_media type='video'` + el player actual ya hace autoplay muted loop (`public-property-view.tsx:452-470`). Falta la decisión de colocación (hoy el vídeo es el módulo 6º) y falta poster (gap actual). |
| Signature film de capítulo | SÍ si hay vídeo manual + generado: requiere **distinguirlos**, y la vista pública hoy NO selecciona `source` (`lib/db/queries/properties.ts:106-108`) — cambio trivial de query en la fase 2. |
| Elegir horizontal vs vertical | SÍ para los generados (`format` h/v en `property_media`, migración 0115); NO para manuales/externos (sin metadata — gap). Hoy ambos formatos aparecen como vídeos gemelos y el vertical se recorta en `aspect-video`. |
| Fallback a imagen | SÍ (fotos siempre presentes); hoy no hay poster declarado. |

---

# PART E — FOTO / GALERÍA (§9–11)

## §9 Arquitectura de galería
- **EMAAR**: no hay "galería-vertedero". La sección GALLERY son **2 mini-carruseles editoriales lado a lado, cada uno con su caption de ~50-60 palabras** (medido). Resto de fotos repartidas por capítulos. Lightbox discreta; dots de navegación; lazy real (móvil carga 25 de 40 imágenes).
- **DAMAC**: carruseles temáticos (amenities, interiors) con caption, `imgTotal` 48-93 por página, todo en contenedores multi-imagen (0 imágenes "sueltas" en ambos — todo va en composiciones o carruseles).
- **BCP hoy**: grid 1+3 con "+N", lightbox con teclado y contador, **sin swipe táctil, sin lazy loading, el "+N" abre en el índice 0** (auditoría, `property-gallery.tsx`).

## §10 Fotografía fuera de la galería — el hallazgo central

| Patrón | EMAAR | DAMAC |
|---|---|---|
| `gallery once → resto texto` | ❌ nunca | ❌ nunca |
| `heading + imagen + copy corto` repetido | ✅ **2-4 veces por página** | ✅ 2-3 veces + carruseles con caption |
| Fotos que reaparecen como storytelling | ~60-70% de las imágenes de página viven FUERA del bloque "Gallery" | ~80% |

**La fotografía es el esqueleto de la narración, no un anexo.** BCP hoy: 100% de las fotos en un solo módulo galería; 0 fotos en el resto de la página.

## §11 Relación imagen↔copy (capítulos narrativos)
- EMAAR: alternancia estricta **izquierda/derecha** en los 2 capítulos intro (imagen ~50% + eyebrow + 40-67 palabras); gallery = imagen arriba/caption abajo; comunidad = mosaico de 4-5 fotos con caption + 3 párrafos.
- DAMAC: full-bleed (vídeo/render 100vw) intercalado con franjas de copy corto centrado; carruseles con caption bajo la foto.
- Cantidad de copy por imagen: **nunca más de ~70 palabras seguidas junto a una foto** en ninguna de las 10 páginas.

---

# PART F — DESCRIPCIÓN / STORYTELLING (§12–15)

## §12–13 Capítulos y taxonomía emergente (derivada de los headings reales)

Headings reales encontrados (parafraseados/agrupados), con frecuencia en la muestra:

| Categoría emergente | Evidencia EMAAR | Evidencia DAMAC | Frec. total |
|---|---|---|---|
| IDENTIDAD/CLAIM | "Space for Every Story", "Live Well…" | "…Where Legacy Lives", "…Panoramic Living" | 10/10 |
| VISTAS/ACCESO | "Iconic Views, Incredible Access" | "Panoramic…", "Connected to Dubai" | 9/10 |
| BIENESTAR/RITMO DE VIDA | "A Rhythm of Well-Being" | "Where Life Finds You" | 7/10 |
| DISEÑO/INTERIORES | "Contemporary Sensitivity", "Crafted for Living", "Elegant Designs…" | "Glamour in Every Detail" | 9/10 |
| AMENITIES | "Amenities" | "A World of Amenities" | 10/10 |
| UNIDADES/PRECIOS | tabla Prices/Area/Units | "Available Units", "Select Your Dream Home" | 8/10 |
| COMUNIDAD/BARRIO | capítulo comunidad + KPIs | "Connected to Dubai", proyectos hermanos | 10/10 |

## §14 Longitud de copy (medido)

| Medida | EMAAR | DAMAC | BCP hoy |
|---|---:|---:|---:|
| Intro típica | 40-60 palabras | 30-60 | — |
| Capítulo típico | **44-58 (mediana de bloque)** | **14-22 (mediana de párrafo)** | — |
| Bloque continuo más largo | 154 (una respuesta FAQ) — narrativo real ≤67 | 63 | **317-388 en un único párrafo** |
| Capítulos por página | 6-8 | 7-10 | 1 ("Descripción") |
| Ratio copy/foto | ~1 bloque corto por cada 3-5 fotos | ~1 por cada 5-8 | todo el copy sin foto |

## §15 Estructura de escritura
- EMAAR: frases medias-largas, emotivo-contenido, 1 idea por bloque, eyebrow + titular + un solo párrafo; adjetivación controlada; cifras concretas reservadas a tarjetas/KPIs (no dentro de la prosa).
- DAMAC: frases cortas, claim-density alta, superlativos de marca, párrafos de 2-3 frases; los datos duros viven en la franja de identidad y las unit cards, no en la prosa.
- **Regla compartida medible: los hechos numéricos NO van dentro del párrafo narrativo — van en tarjetas/stats/tablas.** (BCP hoy hace exactamente lo contrario.)

---

# PART G — AMENITIES (§16–17)
- EMAAR: párrafo intro (~30-40w) + **icon grid con nombre corto** (Yoga Deck, BBQ Area, Padel Court… 8-10 ítems), sin fotos por amenity en la plantilla launch.
- DAMAC: **icon-tabs + carrusel fotográfico** con caption por amenity (la amenity ES una foto), 100-153 palabras de intro.
- §17 Unidad vs edificio vs comunidad: ambos separan **proyecto** (amenities propias) de **comunidad** (capítulo/moduло aparte con sus propios KPIs y mapa). Ninguno mezcla "aire acondicionado" (unidad) con "piscina" (edificio) en la misma lista — la escala de cada hecho tiene su módulo. *BCP ya intuye esto (3 grupos por regex de 12 keywords) pero con cobertura mínima — la mayoría cae en "Otros".*

# PART H — LOCATION (§18–20)
- §18: EMAAR = **Google Maps embebido con chips de POIs clicables sobre el mapa** (Creek Marina, Central Park, Metro Station, mall, playa…); DAMAC = mapa estilizado "CONNECTED TO DUBAI" con **tiempos de viaje** a landmarks.
- §19 Categorías observadas: EMAAR = marina/parque/retail/metro/playa/aeropuerto (chips); DAMAC = downtown/aeropuerto/landmarks (minutos en coche). Ninguno lista colegios u hospitales en la plantilla de proyecto.
- §20 Comunidad: siempre módulo separado del proyecto, con 2-3 párrafos, mosaico fotográfico y KPIs de escala (sqm de parques, unidades, campos de golf). BCP: la vivienda no tiene "comunidad", pero el equivalente exacto es **el barrio** — y hoy el barrio vive mezclado dentro del párrafo único de descripción (medido: 135 de 640 palabras en el ejemplo del estudio; en la muestra real, ~30-40% del texto es barrio).

# PART I — FLOOR PLANS (§21)
- DAMAC: **tarjetas por tipología** (1BR/2BR/3BR) con miniatura del plano + precio + m² + favorito — el plano es el selector de unidad (5/5).
- EMAAR: tabla de unidades (precio desde/área/disponibles) en 3/5; plano detallado tras registro.
- BCP: `property_media type='plan'` renderizado como imágenes apiladas sin lightbox/zoom/tracking (PARTIAL). Transferible: cuando exista plano → módulo propio con zoom; nunca selector multi-unidad (no aplica a vivienda única).

# PART J — CTA / CONVERSIÓN (§22–23)

| Métrica medida | EMAAR | DAMAC | BCP hoy |
|---|---|---|---|
| CTAs de conversión por página (desktop) | 9-11 | 8-10 | 8 (3 sección + 3 sticky + header + WhatsApp) |
| Sticky | 1 (barra Register interest) | **2** (barra + botón flotante) | 1 (solo móvil) |
| Formulario | 1 (5-8 campos) | 1 | 0 (CTAs directos wa/mail/tel) |
| Momentos: top / mid / bottom / sticky | ✅/✅/✅/✅ | ✅/✅/✅/✅ | ❌ top (solo mailto desktop)/❌ mid/✅ bottom/✅ sticky móvil |
| Wording contextual | "Register your interest" vs "Download brochure" vs "Sales video call" | "Enquire now" vs "Download brochure" | mismo trío siempre |
| Móvil | 6 CTAs (reduce) | 4 (reduce) | 3 sticky + sección |

# PART K — MOBILE (§24)
Medido m390 vs d1440:
- **El orden modular NO cambia** en ninguna de las 10 páginas (ni en BCP) — el móvil no es reordenación, es **dieta**: EMAAR baja de 11→6 CTAs y de 40→25 imágenes cargadas (lazy real); DAMAC de 8→4 CTAs y 84→61 imágenes, y pasa de 2 sticky→1.
- Vídeo DAMAC: se conserva con autoplay en móvil (5/5).
- Capítulos imagen↔copy: colapsan a columna (imagen arriba, copy debajo); los KPIs de comunidad pasan a fila scrolleable.
- BCP hoy: mismo orden, galería 1 col + 3 thumbs, sticky bar propia — estructura correcta, contenido pobre.

# PART L — FILOSOFÍA (§25–26)

| Dimensión | EMAAR | DAMAC |
|---|---|---|
| Narrativa | editorial contenida, 1 idea/bloque, eyebrows | claims cortos de marca, densidad alta |
| Media | fotografía curada con caption | **vídeo primero**, renders full-bleed |
| Vídeo | fuera de página (venta asistida) | hero + signature films |
| Galería | 2 carruseles con caption | carruseles temáticos |
| Amenities | icon grid sobrio | foto-carrusel + tabs |
| Location | POI chips sobre Google Maps | tiempos de viaje |
| Community | capítulo con KPIs y mosaico | cross-selling de proyectos |
| Conversión | form + brochure + video call | Enquire agresivo + 2 sticky |
| Móvil | dieta fuerte (lazy, menos CTAs) | conserva vídeo, recorta CTAs |
| Densidad | baja, mucho aire | alta, páginas 10-14k px |
| Sensación luxury | serena, "quiet luxury" | maximalista, branded |

**§26 Fortalezas EMAAR** (observadas): 1) captions editoriales bajo cada carrusel — foto y copy nunca separados; 2) tarjetas de key-facts que sacan los números de la prosa; 3) capítulo comunidad con KPIs enormes; 4) POI chips sobre mapa real; 5) bloques narrativos de 40-67 palabras, jamás muros de texto; 6) alternancia izquierda/derecha disciplinada; 7) FAQ nativa (SEO + objeciones).
**Fortalezas DAMAC**: 1) vídeo hero autoplay como norma, no excepción; 2) signature film a media página; 3) precio y estado visibles antes de scroll; 4) unit cards con plano como selector; 5) tiempos de viaje concretos; 6) brochure omnipresente; 7) doble sticky sin perder usabilidad.

---

# PART M — AUDITORÍA SMARTLINK ACTUAL (§27–30)

## §27 Orden real (de `public-property-view.tsx`, 809 líneas)
`CollectionReturnBar (condicional) → Header marca → GALERÍA → Identidad+precio+specs → Descripción (si hay) → Vídeo (si hay) → Planos (si hay) → Características (si hay) → Mapa (SIEMPRE) → Requisitos+Personal Shopper → CTA contacto → Footer → Sticky móvil`.
El vídeo es el **6º módulo**, debajo de la descripción — el patrón exactamente inverso al de DAMAC. Componentes de visita/favoritos/condiciones existen en el repo pero son del portal cliente (ABSENT aquí, por diseño: requieren login).

## §28 Responsive actual
Orden idéntico móvil/desktop; galería 2-col→1-col+3 thumbs; specs 3 col fijas; sticky solo móvil; mapa 4:3→16:10. Sin reordenación ni dieta de contenido.

## §29 Anatomía de descripción (propiedad real, 317 palabras, UN párrafo)

```text
Original: 317 palabras, 1 párrafo continuo
Barrio/ubicación (intro)          48   ← duplica zone
Edificio y finca (1945, ascensor) 33   ← ascensor duplica feature; época SOLO aquí
Reforma y estado                  18   ← duplica feature "Reformado"
Salón y cocina                    47
Dormitorios y baños               31   ← duplica specs 4 hab / baños en suite
Confort técnico (aerotermia/AC)   32   ← duplica features AC+calefacción
Materiales (techos 3m, parquet)   27   ← SOLO aquí
Barrio otra vez (Almagro, museos) 64   ← segunda dosis de barrio, separada de la primera
Boilerplate agencia (off-market, call center 24h) 47  ← no es de la propiedad
```
Es decir: **~15% del texto es boilerplate de agencia, ~35% es barrio partido en dos, y ~30% duplica datos ya estructurados.** El contenido único de valor (materiales, época, distribución) queda enterrado en el medio.

## §30 Duplicación cuantificada (5 propiedades reales de producción)

| Propiedad | Palabras | Hechos duplicados specs/features | Solo-en-texto (dato estructurable perdido) |
|---|---:|---:|---|
| Martínez Campos | 317 | **8** (m², dorm., baños, ascensor, reformado, AC, calefacción, suite) | planta, época edificio, aerotermia, techos 3m |
| Recoletos | 110 | **7** | planta, época, **⚠ specs dicen 2 dormitorios y el texto "tres dormitorios"** |
| Lagasca (ático dúplex) | 388 | **9** | planta, época |
| Narváez | 323 | **11** | planta, época |
| Luchana | 293 | **8** | planta, época |

Media: **8,6 hechos duplicados por descripción**; el 100% menciona la planta y la época del edificio SOLO en prosa (BCP ni siquiera tiene columna `floor` — se deriva por parser de texto, `lib/floor.ts`). Y existe al menos una contradicción factual real (Recoletos) que ningún renderer debería propagar sin validación.

---

# PART N — INVENTARIO DE INPUTS BCP (§31–32)

| Información | Fuente | Estado | ¿Fiable? | ¿SmartLink hoy? |
|---|---|---|---|---|
| title/operation/price/beds/baths/sqm/zone | `properties.*` | ACTIVE | alta | ✅ |
| description | columna única; **el sync la pisa** (`diff-engine.ts:203`) | ACTIVE/frágil | alta presencia | ✅ (bloque único) |
| floor | derivado de texto (`lib/floor.ts`) | PARTIAL | media | ✅ si se detecta |
| address → coords | Nominatim, cacheo lazy; "Madrid" hardcodeado | PARTIAL | media-baja | ✅ (mapa siempre, con fallback 7 barrios) |
| features | `features[]+features_manual[]`, texto libre sin taxonomía; agrupación = 2 regex/12 keywords | ACTIVE crudo | alta en volumen, nula en estructura | ✅ |
| building_features (jsonb) | 0007 | **UNUSED (columna vacía)** | — | ❌ |
| photos + orden | `property_photos(position, is_cover, alt)` | ACTIVE | alta | ✅ vía proxy /p/ |
| metadata por foto (tipo estancia/tags/score/dimensiones) | — | **ABSENT** | — | — |
| cover | `is_cover`/`cover_photo_url` ignorados; se usa `photos[0]` | PARTIAL | — | parcial |
| vídeo auto (Ken Burns) | `property_media source='auto'` + format/duración/huella | ACTIVE | metadata completa | ✅ pero indistinguible del manual |
| vídeo manual/externo | `source='manual'`, **sin metadata** | PARTIAL | — | ✅ |
| planos | `property_media type='plan'` | PARTIAL | según portal | ✅ sin lightbox |
| requisitos alquiler | hardcodeados en la vista | ABSENT como dato | — | ✅ texto fijo |
| asesor asignado | — (contacto genérico hardcodeado) | ABSENT | — | genérico |
| contenido estructurado (story/highlights) | — | **ABSENT** | — | — |
| POIs/cercanías | solo universidades (haversine, catálogo estático) | PARTIAL | — | ❌ |
| IA (texto+visión+JSON schema) | `lib/services/ai/chat.ts`, multi-proveedor, config en BD | **ACTIVE** | lista para reutilizar | n/a |
| analytics | 9 eventos; `video_play`/`plan_view`/`scroll` implementados y **nunca invocados** | PARTIAL | — | page_view/photo/contact/time |

## §32 Media
- **FOTOS**: schema ✅, cobertura alta, public-safe vía `/p/{slug}/{i}` con caché 24h e invalidación por hash. Componente: grid 1+3 + lightbox (sin swipe/lazy).
- **VÍDEO**: schema ✅ (`property_media` + jobs con cola/calibración), cobertura variable, public-safe (bucket público), player propio triple (YT/Vimeo/directo, siempre muted). Gap: la vista no distingue `source` ni `format`.
- **PLANO**: schema ✅, cobertura según portal de origen, `<img>` apiladas.
- **MAPA**: iframe OSM, sin API key, marker con delta fijo; fallback de 7 barrios; "ver en pantalla completa".

---

# PART O — VIABILIDAD CONTENT INTELLIGENCE (§33–36) — *sin implementar*

## §33 ¿Puede BCP estructurar descripciones sin inventar?
**SÍ, con arquitectura de 3 capas:**
1. **Determinista primero**: los hechos estructurados YA existen (specs/features) — no hay que extraerlos, hay que **restarlos** del texto (dedupe). Extractores regex ya probados en el repo (floor, ref, precios) cubren planta/época/orientación.
2. **LLM solo para segmentar y comprimir**: `aiComplete` con visión + JSON Schema ya existe (`lib/services/ai/chat.ts`) y se usa en producción para 5 casos; segmentar un párrafo en categorías con cita literal de la frase origen es la tarea más segura posible para un LLM (clasificación extractiva, no generativa).
3. **Validación contra los hechos**: todo claim numérico del output se contrasta con specs (el caso Recoletos 2-vs-3 dormitorios se detecta automáticamente → flag a revisión humana, nunca publicación silenciosa). Caching por hash de descripción (patrón `photos_fingerprint` del generador de vídeo, ya probado). Revisión humana = cola admin (patrón permissions/queue ya existente).

**Bloqueo real a resolver antes**: no hay dónde persistir el resultado — una sola columna `description` que el sync sobrescribe. El engine necesita su propia tabla versionada (source_hash → blocks) para sobrevivir a los syncs. Es un requisito de la fase 2, no de este estudio.

## §34 Arquitectura de datos preliminar (solo esquema conceptual)
```text
source_sentence (cita literal) → category → is_duplicate(vs specs/features) → confidence → editorial_copy(≤60w)
```

## §35 Categorías candidatas — derivadas de la doble evidencia

| Categoría | Evidencia EMAAR/DAMAC | Frecuencia en la muestra BCP (5/5 salvo indicación) |
|---|---|---|
| OVERVIEW/IDENTIDAD | 10/10 | 5/5 (primera frase) |
| LIVING (salón/cocina) | capítulos interiores | 5/5 |
| PRIVATE_QUARTERS (dormitorios/baños) | tipologías | 5/5 |
| FINISHES/CONFORT (materiales, clima) | "Crafted…", specs premium | 4/5 |
| BUILDING (finca, época, ascensor, portero) | — (no aplica a promociones) **pero 5/5 en BCP** | 5/5 |
| LOCATION/BARRIO | capítulo comunidad | 5/5 (30-40% del texto) |
| OUTDOOR (terraza/balcones) | amenities | 3/5 |
| LIFESTYLE | 7/10 | 2/5 (débil — no forzarla) |
| ~~AGENCY BOILERPLATE~~ | — | 2/5 — categoría de DESCARTE, no de render |

## §36 Renderizado adaptativo — viabilidad por capítulo

| Chapter | Datos requeridos | Opcionales | Tipo de foto ideal | ¿Detectable hoy? |
|---|---|---|---|---|
| Hero/identidad | title+price+operation | vídeo | portada | ✅ |
| Living | frase(s) categoría LIVING | m² salón | salón/cocina | texto ✅ / **foto ❌ (sin clasificación)** |
| Private quarters | beds+baths | suites | dormitorio | ✅ / foto ❌ |
| Building | frases BUILDING + features grupo edificio | año | portal/fachada | ✅ / foto ❌ |
| Barrio | frases LOCATION + zone | POIs | calle/entorno | ✅ / foto ❌ (y sin POIs) |
| Amenities | features (necesita taxonomía) | — | — | PARTIAL (regex 12 keywords) |
| Plano | media plan | — | — | ✅ |
| Vídeo | media video | source/format | — | PARTIAL (falta exponer source) |

---

# PART P — IMAGE INTELLIGENCE (§37–38)
- §37 **Hoy: nada persistido por foto.** Ni tipo de estancia, ni tags, ni score, ni dimensiones (`property_photos` sin columnas de metadata desde 0001). El único análisis de visión existente (`admin/idealista/analyze-photos`, hasta 12 fotos → JSON con habitáculos y extras) es **efímero**: alimenta un formulario y se tira. El generador de vídeo ordena fotos por `position` a ciegas.
- §38 Foto→capítulo: **viable con lo que hay** — el mismo `aiComplete` visión que ya clasifica 12 fotos puede etiquetar tipo de estancia con confianza razonable (salón/cocina/dormitorio/baño/terraza/fachada/plano son clases visualmente triviales). Necesita: columna(s) de metadata en `property_photos` (o tabla) + pasada batch cacheada por URL-hash. Fiabilidad esperable alta para las 7 clases básicas; revisión humana solo bajo umbral. **NO construido — solo factible.**

# PART Q — VIDEO INTELLIGENCE (§39–40)
- §39 Tipos reales: auto (metadata completa: format h/v, duración, tamaño, huella de fotos, música) / manual subido (sin metadata) / externo YT-Vimeo (sin metadata) / importado de portal (marcado como manual — el valor `imported` del CHECK nunca se escribe).
- §40 Reglas futuras — viabilidad: distinguir **premium/manual vs generado** = trivial (`source`), pero hay que exponerlo en la query pública (hoy no se selecciona). Regla candidata evidenciada por DAMAC: manual→hero o signature film; auto horizontal→media secundaria; auto vertical→NUNCA en contenedor 16:9 (hoy se recorta). Externo→secundaria (no autoplay confiable). Falta metadata de manuales (duración/aspect) — obtenible con ffprobe al subir (ffmpeg ya está en el VPS). **Solo factibilidad; reglas finales en fase 2.**

# PART R — GAP MATRIX (§41)

| Capability | EMAAR | DAMAC | BCP | Severidad |
|---|---|---|---|---|
| Capítulos narrativos con foto | ✅ | ✅ | ❌ (1 párrafo) | **ALTA** |
| Números fuera de la prosa (cards/KPIs) | ✅ | ✅ | ❌ (dentro del párrafo, duplicados) | **ALTA** |
| Vídeo arriba / jerarquizado | (venta asistida) | ✅ | ❌ (6º módulo) | **ALTA** |
| Captions foto+copy | ✅ | ✅ | ❌ | ALTA |
| Barrio como capítulo separado | ✅ | ✅ | ❌ (mezclado) | ALTA |
| POIs/tiempos | ✅ chips | ✅ minutos | ❌ (solo mapa) | MEDIA |
| Galería móvil con swipe/lazy | ✅ | ✅ | ❌ | MEDIA |
| Plano con zoom | (tras registro) | ✅ cards | ❌ (img plana) | MEDIA |
| CTA top+mid | ✅ | ✅ | ❌ | MEDIA |
| FAQ | ✅ | ✅ | ❌ | BAJA (dudoso para vivienda única) |
| Brochure PDF | ✅ | ✅ | ❌ (existe PDF interno en lib/pdf) | BAJA |
| Unit selector | ✅ | ✅ | n/a (vivienda única) | — |

# PART S — TRANSFERIBILIDAD (§42)

**TRANSFERABLE NOW** (los datos ya existen): specs como key-fact cards fuera de la prosa · vídeo reposicionado y jerarquizado por `source`/`format` · plano como módulo con zoom · sticky/CTA top y mid · galería con swipe+lazy+poster · barrio como sección separada usando `zone` + la parte LOCATION del texto · requisitos ya modulares.
**TRANSFERABLE WITH CONTENT ENGINE**: capítulos narrativos (LIVING/PRIVATE/BUILDING/BARRIO) desde la descripción existente con dedupe y validación · captions editoriales por carrusel · descarte de boilerplate de agencia.
**TRANSFERABLE WITH NEW DATA**: foto→capítulo (metadata de estancia por foto, IA batch) · POIs/tiempos (fuente de cercanías) · metadata de vídeos manuales (ffprobe) · asesor asignado por propiedad · requisitos como datos.
**NOT RELEVANT** (escala promotor): unit selector multi-tipología · community KPIs (sqm de parques) · related projects · sales video call center · registro para ver planos.

# PART T — REESTRUCTURA DE MUESTRA (§43) — solo contenido, sin UI

**Caso 1 — rica** (Martínez Campos, 317w, 5+ fotos, sin vídeo):

| Bloque | Frase(s) origen (resumen fiel) | Categoría | ¿Dup? | Conf. | Copy conciso sugerido (≤35w, solo hechos presentes) |
|---|---|---|---|---|---|
| 1 | "5 balcones exteriores… salón en esquina… luminoso" | LIVING | balcón=dup feature | alta | Salón en esquina con cinco balcones a la calle; cocina abierta integrada. |
| 2 | "4 dormitorios, todos con baño en suite… aseo de cortesía" | PRIVATE | beds/baños=dup specs | alta | Cuatro dormitorios en suite y aseo de cortesía. |
| 3 | "techos de casi 3 m… parquet natural… aerotermia" | FINISHES | AC/calefacción=dup | alta | Techos de casi 3 m, parquet natural y climatización por aerotermia. |
| 4 | "tercera planta exterior de finca clásica de 1945… ascensor" | BUILDING | ascensor=dup | alta | Finca clásica de 1945; tercera planta exterior con ascensor. |
| 5 | "Almagro… Santa Engracia… metro Iglesia… palacios, Sorolla, Retiro…" (2 fragmentos separados fusionados) | BARRIO | zone=dup | alta | Almagro: urbanismo del XIX, embajadas y galerías, junto al metro Iglesia. |
| — | "totalmente reformada… lista para estrenar" | ESTADO | reformado=dup feature | alta | (badge, no párrafo) |
| — | "off-market… call center 24h" | BOILERPLATE | — | — | **DESCARTAR del render de propiedad** |

**Caso 2 — pobre** (Recoletos, 110w): OVERVIEW+LIVING (hall, salón-cocina americana equipada, balcón) · PRIVATE ("tres dormitorios" ⚠ **CONTRADICE specs=2 → bloque retenido para revisión humana, no publicable**) · BUILDING (3ª planta, edificio ppios. s. XX, portero=dup) · BARRIO (Retiro, Colón=dup zone). Con 4 bloques válidos y fotos genéricas, el renderer adaptativo degradaría a: hero + facts + 2 capítulos + barrio + mapa — **la escasez no rompe el modelo, lo acorta**. Viabilidad del Content Engine: **demostrada con contenido real, incluida la detección del caso que exige human review.**

# PART U — REGLAS MEDIDAS (§44)

```text
EMAAR (n=5)
- bloque narrativo: 40-67 palabras (mediana 44-58); nunca >70 junto a una foto
- 2 capítulos imagen↔copy alternos antes de la Gallery
- Gallery = 2 carruseles con caption de ~50-60 palabras cada uno
- 3 key-fact cards (tipologías · acabados · precio desde)
- CTAs: 9-11 desktop / 6 móvil · 1 sticky · 1 form · FAQ 5/5 · brochure 4/5
- móvil: mismo orden, -45% CTAs, -40% imágenes cargadas

DAMAC (n=5)
- hero vídeo autoplay muted loop 5/5 (self-hosted CDN, sin controles, sin poster)
- 2º vídeo a ~1.500px 5/5; 3º en branded
- párrafos: mediana 14-22 palabras, máximo 63
- unit cards con plano 5/5 · precio visible pre-scroll 5/5
- CTAs: 8-10 desktop / 4 móvil · 2 sticky desktop/1 móvil · FAQ y brochure 5/5
- páginas de 10.300-14.600px de alto (BCP hoy: ~4.500)

BCP (n=5, producción)
- descripción: 110-388 palabras en 1 párrafo · 8,6 hechos duplicados de media
- 30-40% del texto es barrio; hasta 15% boilerplate de agencia
- planta y época del edificio: 5/5 SOLO en prosa (dato estructurable perdido)
- 1 contradicción factual specs↔texto detectada en 5 propiedades (20%)
```

---

# PART V — RESPUESTAS EXACTAS

1. **Orden EMAAR**: hero imagen → identidad+CTAs → intro+brochure → 2 capítulos imagen↔copy → key-fact cards → Gallery con captions → Amenities (icon grid) → mapa con POI chips → capítulo comunidad+KPIs → precios/unidades → FAQ → form.
2. **Orden DAMAC**: hero vídeo → precio+enquire+título → render full-bleed → signature film → brochure → amenities (tabs+carrusel) → bloque inmersivo → unit cards con plano → mapa con tiempos → related → stats → FAQ.
3. **Foto fuera de galería**: es la norma — 60-80% de las imágenes viven en capítulos con caption, mosaicos y carruseles temáticos; nadie hace "galería única y luego texto".
4. **Vídeo**: DAMAC = hero autoplay muted loop + signature films (5/5, self-hosted); EMAAR (plantilla launch) lo saca de la página hacia venta asistida. Regla común: si hay vídeo, arriba y silencioso.
5. **Texto continuo máximo**: EMAAR ~67 palabras narrativas; DAMAC 63; medianas 44-58 y 14-22. BCP hoy: 317-388 en un bloque.
6. **Separación**: por módulos con heading propio y escala propia (proyecto vs comunidad); jamás mezclan escalas en una lista.
7. **Amenities**: EMAAR icon grid + intro; DAMAC carrusel fotográfico con tabs; ambos separan unidad/edificio/comunidad.
8. **Location útil**: POIs clicables sobre el mapa (EMAAR) o minutos a landmarks (DAMAC) — nunca solo un mapa mudo.
9. **Móvil**: mismo orden, dieta de CTAs (−45/−50%) e imágenes; vídeo se mantiene; sticky se simplifica.
10. **¿Cuál convierte mejor?** No medible desde fuera (sin datos de conversión). Por arquitectura: DAMAC maximiza captura (precio pre-scroll, 2 sticky, enquire agresivo) y EMAAR maximiza calidad de lead (brochure+form+video call). Para BCP —venta consultiva de vivienda única— el **modelo de conversión EMAAR** encaja mejor, con la **jerarquía de vídeo DAMAC**.
11. **De EMAAR, transferible**: capítulos cortos con foto y caption, key-fact cards, barrio como capítulo, POI chips, alternancia, FAQ ligera.
12. **De DAMAC**: vídeo hero/signature según tipo, precio visible pre-scroll, plano protagonista, tiempos de viaje.
13. **NO copiar**: unit selectors, community KPIs de promotor, related projects, registro-para-ver-planos, doble sticky, autoplay de vídeo de 20MB sin dieta móvil.
14. **Datos BCP que ya permiten modularidad**: specs completas, features (crudas), fotos ordenadas con proxy, vídeo con `source`/`format` (auto), planos, coords+mapa, zone, requisitos, analytics con eventos ya definidos.
15. **Gaps de datos**: metadata por foto (estancia), taxonomía de features, POIs, metadata de vídeo manual, asesor por propiedad, persistencia de contenido estructurado (y el sync pisa `description`).
16. **¿Content Engine sin inventar? SÍ** — clasificación extractiva con cita origen + dedupe determinista contra specs + validación numérica (el caso 2-vs-3 dormitorios lo demuestra) + revisión humana bajo umbral + caché por hash. La infraestructura IA ya existe en el repo.
17. **¿Foto→capítulo automática? Factible** con el `aiComplete` de visión existente sobre 7 clases triviales; requiere persistir metadata por foto (hoy inexistente).
18. **Vídeo por tipos**: manual→hero/signature; auto horizontal→secundario; auto vertical→solo contenedor vertical (hoy se recorta); externo→secundario. Requiere exponer `source`/`format` en la query pública (hoy no se selecciona).
19. **Duplicación hoy**: media de **8,6 hechos por descripción** repetidos contra specs/features (rango 7-11 en 5/5 propiedades), más boilerplate de agencia en 2/5.
20. **¿Bloqueo técnico antes de diseñar SmartLink 2.0? Ninguno duro.** Cuatro prerequisitos de datos para la fase de diseño: (a) tabla de contenido estructurado versionada e inmune al sync; (b) metadata de estancia por foto; (c) exponer `source`/`format` de vídeo en la proyección pública; (d) decidir fuente de POIs. Todo lo demás es diseño y render.

---
*Fin del benchmark. Siguiente fase: SMARTLINK 2.0 — PRODUCT EXPERIENCE DESIGN (IA final, story schema, renderer adaptativo, jerarquía de vídeo, reglas foto→capítulo, content engine, sprint).*
