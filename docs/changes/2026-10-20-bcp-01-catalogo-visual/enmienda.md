# BCP-01 · Enmienda visual del catálogo: la publicación del itinerario como referencia

**Fecha:** 20 de octubre de 2026. **Estado:** enmienda y plan registrados; implementación en curso dentro del alcance pedido por Fabricio. **La aprobación visual del resultado y el merge los hace Fabricio**: la aprobación anterior del lector (E1, 14-10-2026) y del PDF (P9/PDF12, 17-10-2026) **no aprueban automáticamente** el resultado rediseñado.

- **Rama:** `fabri/bcp-01-visual-itinerario`, en el worktree `wt/bcp-01-visual`.
- **Base:** `origin/main` = `38db71da` (comprobado con `git fetch` el 20-10-2026). Contiene #326–#337 (buscador, conversión, importación por enlace y por PDF, motor de PDF) y los arreglos posteriores.
- **Sin migración, sin dependencias nuevas, sin producción, sin credenciales, sin escrituras reales, sin IA real, sin revisión adicional de Codex.**

## 1. Qué cambia respecto a la aprobación anterior

| | Aprobado antes | Esta enmienda |
| --- | --- | --- |
| Dirección visual del catálogo (lector, portada, miniaturas y PDF) | **D17 · C Boutique**: Fraunces y Karla, papel cálido, tinta marrón, portada con arco, fotos enmarcadas, pies en cursiva (expedientes [2026-10-13-bcp-01-home-catalogo](../2026-10-13-bcp-01-home-catalogo/spec.md) y [2026-10-16-bcp-01-pdf](../2026-10-16-bcp-01-pdf/spec.md)). | **La publicación del itinerario** `https://portal.bcousinoprop.com/v/mdautf3qnwv8xyxx`, implementada en `app/v/[token]`: portada con fotografía a sangre oscurecida y marca blanca; marfil, tinta y oro; Playfair Display (titulares y cifras), Cinzel (etiquetas en versalitas) e Inter (texto corrido, la tipografía del sitio público); filetes finos y controles sobrios; composición texto | fotografía alternando de lado; paso de página con giro; galería sobre tinta; asesor y colofón. |
| Qué es el documento | Lo mismo: **un catálogo de selección de viviendas**. | Lo mismo. No es un itinerario: sin jornada, fechas, horas, duraciones ni estados de visita; sin valoraciones ni seguimiento. |

**Es la implementación existente de la casa, no una dirección creativa nueva.** Se reutiliza su código (primitivas editoriales, galería, mecánica del libro, tokens y utilidades `vc-*`) sin alterar la experiencia del itinerario.

### 1.1 Referencia inspeccionada (20-10-2026)

- **En vivo:** `GET /v/mdautf3qnwv8xyxx` → 200, HTML en español, 9 residencias. El HTML servido lleva las mismas clases y textos que el código del repositorio (`bg-ink`, `bg-cream-50`, `text-gold-dark`, `vc-kenburns`, «Private Viewing Collection», «Private Client Services», `font-display`/`font-serif`), de modo que la referencia **es** `app/v/[token]` tal como está en `origin/main`.
- **En el código:** `viewing-collection-view.tsx` (libro cuando cabe una página: `min-height: 620px`; si no, recorrido vertical), `_components/book-mode.tsx` (portada · índice · un spread por residencia · asesor · colofón; capas con key estable, giro de 700 ms y 850 ms en la portada, teclado, swipe, galería izada), `collection-cover.tsx` (foto a sangre con doble velo, logo invertido, Playfair grande, ornamento), `editorial.tsx` (`Label`, `Rule`, `Ornament`, `DataPoint`, `ChapterMark`, `EditorialAction`, `Reveal`, `StatusLine`), `private-gallery.tsx` (mosaico + lámina en portal, teclado en captura, bloqueo del scroll), `closing.tsx` (asesor y colofón), `app/globals.css` (utilidades `vc-*`: giro, sombras, revelado, foco) y `tailwind.config.ts` (tokens `ink`, `cream`, `gold`; familias `display`, `serif`, `sans`).
- **De la referencia NO se copia:** ERIKA ni ningún cliente, fechas y horas de ejemplo, propiedades, referencias BC, direcciones exactas, enlaces «Explorar residencia» (SmartLink con seguimiento), valoración por estrellas ni el asesor de la colección. El contacto del catálogo es el guardado en el catálogo (0194), como hasta ahora.

### 1.2 Trabajo en curso comprobado antes de empezar

- PR #326–#337 (BCP-01 P0–P9, buscador e importación) **fusionados** en `origin/main`; el último abierto es #308 (extensión, ajeno). No hay ningún PR abierto del catálogo.
- `fabri/bcp-01-importar-buscar` (worktree `wt/bcp-01-importar-buscar`) va 3 commits por delante de `origin/main`, **solo documentación** (exploración y borradores de S0); no se toca.
- Esta rama **no cambia** el gestor (Viviendas, Contenido, Diseño, Compartir), la HOME ni sus grupos, el buscador, la conversión ni la importación: solo la pieza visual del catálogo (lector, portada y miniaturas, PDF) y lo mínimo compartido con `/v` para no duplicar código.

## 2. Decisiones de la enmienda (DV1–DV13)

| | Decisión |
| --- | --- |
| **DV1** | La dirección visual del catálogo pasa a ser la de la referencia: Playfair Display, Cinzel e Inter; marfil `cream-50`, tinta `ink`, oro `gold`; filetes, ornamento de 40 px, etiquetas en versalitas con tracking, controles de filete fino. Sustituye a D17 **para el catálogo**; la HOME y el gestor siguen en Lato (D-QA7). |
| **DV2** | Etiquetas de catálogo, no de itinerario: «Selección privada» (portada), «Índice · En esta selección», «01 / 04» como número de vivienda (`ChapterMark`), «Contacto · Hablemos», «Tu asesor / Tu asesora» (contacto editable). No hay «La jornada», «Tu día de visitas», «Visita privada», horas, duraciones, «Confirmada / Por confirmar / Cancelada», «La dirección exacta se facilita al confirmar la visita» ni «Preparada en exclusiva para …». |
| **DV3** | **Contrato público, permisos, caducidad, revocación, actualizaciones en vivo (D12/E4), precios por operación, selección y orden, prioridad de textos (C2), exclusiones/aperturas/portada de E3, identidad de la galería y contacto editable: sin cambios.** No se expone referencia BC, dirección exacta ni ningún enlace a la ficha; no se crean enlaces de seguimiento. `FORBIDDEN_PUBLIC_KEYS` y los tests del contrato siguen vigilando. |
| **DV4** | Las **páginas lógicas** del lector se conservan (portada · índice · apertura / recorrido j1–j3 / detalle por vivienda en doble composición; una hoja por vivienda en una columna · cierre) y se añade una página de **colofón** (oscura: marca, ornamento, «Selección preparada para ti», vigencia), que es el cierre de la referencia. `pagesOf` tiene una página más al final; los folios del índice no cambian. |
| **DV5** | **Libro cuando cabe una página**, con el mismo criterio que la referencia (`min-height: 620px`); por debajo (móvil apaisado, ventanas achatadas), el modo desplazamiento. El conmutador «Páginas / Desplazar» se mantiene como control sobrio de la barra (preferencia recordada), igual que «Índice», «Anterior / Siguiente» y el contador «03 / 09». |
| **DV6** | **Composición doble** (texto | fotografía a página, alternando de lado por vivienda, como la referencia) desde `900 × 620` (la misma condición que hoy, para no recalibrar la composición pura del recorrido con un umbral distinto). Por debajo, **una hoja por vivienda**: fotografía arriba (35 % del alto) y texto desplazable debajo, como la página móvil de la referencia. |
| **DV7** | **Todo el contenido sigue accesible**: la composición pura del recorrido (`journey-layout.ts`, D-QA1–D-QA3, L1) y el detalle íntegro (descripción completa, historia completa, características) no cambian de reglas. Los textos largos se desplazan **dentro** del panel editorial de la página (como el panel de la referencia, `overflow-y-auto`) con la señal «Sigue leyendo ↓» en su banda (L3); nunca se recortan. Si la medición en el renderizado nuevo lo exige, se recalibran solo las **constantes de capacidad** (como en E1 · T6), no las reglas. |
| **DV8** | La galería es la **`PrivateGallery` de la referencia** (mosaico + lámina sobre tinta, portal, teclado en captura). Se le añaden props **opcionales** (índice controlado, miniaturas propias, aviso y componente de imagen) para conservar E3 y D12 (la galería se queda en la misma foto por su clave, avisa si la foto desaparece, se cierra si la vivienda sale) y los estados de carga/error de las fotos (L4). Sin esas props se comporta exactamente como hoy en `/v` y `/s`. |
| **DV9** | **Portada y miniaturas**: `CatalogCover` pasa a la portada de la referencia (fotografía a sangre con doble velo, logo blanco, «Selección privada · edición», título en Playfair, ornamento, «Preparada por …»). La misma pieza sirve de miniatura en la estantería de la HOME, de vista previa en Diseño y de primera página del lector; sin foto, tinta con la marca. |
| **DV10** | **PDF**: mismo renderizador (`@react-pdf/renderer`), mismo hilo de maquetación, misma captura fija, mismas rutas y verificación (K1–K5, P1–P10). Cambia la identidad: portada oscura a sangre con marca blanca, páginas marfil con filetes, Playfair/Cinzel/Inter y una página final de colofón. A4 vertical, contenido completo (K4), índice en dos pasadas (P7), selección de fotos aprobada (P2), fuentes incrustadas (PDF7), privacidad (PDF4) y límites de tiempo/memoria (T10) se conservan. **No** se imprime el lector interactivo. |
| **DV11** | **Fuentes del PDF**: archivos estáticos WOFF de **Playfair Display, Cinzel e Inter** de los paquetes `@fontsource/*@5.3.0` (SIL OFL 1.1), bajados una vez con `npm pack` y copiados a `lib/pdf/fonts/` con sus licencias y un `README` con origen, versión y sha256 de cada archivo y de cada `.tgz`. No son dependencias del proyecto. Fraunces y Karla se retiran (del PDF, del lector y de `lib/catalogs/fonts.ts`). En el navegador las tres familias ya las carga el layout raíz con `next/font`. |
| **DV12** | **Reutilización sin mover archivos**: el lector importa las primitivas de `app/v/[token]/_components/` (precedente: `app/s/[token]/shortlist-view.tsx` ya importa `PrivateGallery` de ahí). La mecánica del libro (capas con key estable, giro, barra) se **extrae** de `book-mode.tsx` a `book-stage.tsx`, y `book-mode.tsx` pasa a usarla **con el mismo DOM**: se comprueba con un diff del HTML servido de `/v/design-preview` antes y después. |
| **DV13** | **CSS acotado**: Tailwind con los tokens existentes y las utilidades `vc-*` que ya existen (no se añade nada global); `reader.module.css` se reduce a lo específico del catálogo (barra, avisos, estados de foto, desplazamiento interno). El admin no cambia de estilo: `scripts/check-crm-typography.mjs` sigue en verde. |

## 3. Fuera de alcance

Gestor, HOME y grupos, buscador, conversión e importación (se preservan tal cual); semántica de datos y migraciones; valoraciones, seguimiento o agenda; enlaces a la ficha de la vivienda; idiomas y RTL del catálogo (sigue en español); personalización por cliente; cambios en `/v`, `/s` o `/web` más allá de la extracción DV12 sin efecto visible; producción.

## 4. Plan

| Tarea | Contenido | Verificación |
| --- | --- | --- |
| **T0** | Este expediente y punteros desde los dos expedientes anteriores. | — |
| **T1** | Fuentes estáticas OFL en `lib/pdf/fonts/` (Playfair 400/400i/500/600, Cinzel 400/500/600, Inter 400/500/600), `README` con procedencia y sha256, licencias; `lib/pdf/catalog/fonts.ts` registra las tres familias; `splitOrdinals` se mantiene solo si Inter no trae «º ª» (se comprueba). | `scripts/pdf/check-catalog-pdfs.mts` (PDF7: fuentes incrustadas y glifos españoles). |
| **T2** | `app/v/[token]/_components/book-stage.tsx`: `useBookTurn`, `BookStage` y `BookNav` extraídos de `book-mode.tsx`; `book-mode.tsx` los usa. | Diff del HTML de `/v/design-preview` (antes/después) sin cambios; `scripts/check-viewing-collection-html.mjs`; `npm run test:viewing-collections`. |
| **T3** | `PrivateGallery` con props opcionales (`index`/`onIndexChange`, `thumbs`, `notice`, `imageComponent`). | Tipos; `/v` y `/s` sin cambios de comportamiento (props ausentes). |
| **T4** | `CatalogCover` nueva (DV9) con escala por contenedor; miniaturas de la HOME y vista previa de Diseño. | Capturas de la HOME de fixtures y del gestor; `fixture-report` (fuentes Playfair/Cinzel/Inter y desbordes). |
| **T5** | Lector: `pages.tsx` (portada, índice con introducción, apertura, recorrido, detalle, hoja única, cierre, colofón, estados), `catalog-reader.tsx` (libro con `BookStage`, barra `BookNav`, galería `PrivateGallery`, modo desplazamiento), `reader.module.css` reducido, `app/seleccion/[token]/page.tsx` (vista «no disponible»). | Capturas comparadas con la referencia a 1440×900, 1024×768, 768×1024 y 390×844; teclado; `prefers-reduced-motion`; índices de 20 y 24; fotos ausentes y fallidas; actualizaciones en vivo con las fixtures (`/dev-fixtures/api/catalogo`). |
| **T6** | Estado: `colophon` en `reader-state.ts` (`pagesOf`), `PAGE_TURN_MS` = 720 (el giro de la referencia); tests actualizados. | `npm run test:catalogs-public`, `test:catalogs`, `test:catalogs-manager`. |
| **T7** | PDF: `document.ts` con la identidad nueva (DV10). | `check-catalog-pdfs.mts` completo (PDF2–PDF8, PDF14–PDF15), PDF reales de las fixtures en `capturas/`. |
| **T8** | Capturas: referencia vs catálogo (portada, índice, vivienda, contenido largo, galería, cierre) con contenido sintético y las mismas imágenes de muestra; PDF generados. | Carpeta `capturas/` con su `README`. |
| **T9** | Regresiones: `npx tsc --noEmit`, `npm run lint`, `npm run test:typography`, los tests de catálogos de la CI, `test:viewing-collections`, `next build`. | Salidas en `result.md`. |
| **T10** | `result.md`, PR en borrador con CI en verde. Fabricio da la QA visual final y fusiona. | — |

**Pasos de entorno que usa el plan:** worktree `wt/bcp-01-visual` desde `origin/main`; `node_modules` clonado del worktree `wt/bcp-01-p9` (mismo `package-lock.json`); descarga única de los tres paquetes de fuentes con `npm pack` (red solo para eso); `scripts/dev-fixtures.sh` (Supabase a un puerto cerrado, sin `.env`) y Chromium de Playwright ya en caché para las capturas; `NODE_ENV=development CATALOG_FIXTURES=1` para los PDF de las fixtures.

## 5. Criterios de aceptación

| | Criterio |
| --- | --- |
| **V1** | Portada: fotografía a sangre oscurecida con doble velo, logo blanco, «Selección privada · edición», título del catálogo en Playfair, «Preparada por …» y «N viviendas»; sin fecha ni cliente. Sin foto: tinta con la marca. |
| **V2** | Índice: cabecera centrada («Índice · En esta selección»), introducción del catálogo cuando existe, filas con número, título, zona, precio en serif y «Reservada» cuando aplica; 24 viviendas sin recortes (se desplaza dentro de la página con su señal). |
| **V3** | Vivienda: panel editorial (número, operación · zona en oro, título Playfair, filete, precio serif, datos como `DataPoint`, entrada, puntos) junto a la fotografía a página con «Ver N fotografías», alternando de lado; recorrido y detalle con la misma composición; una hoja por vivienda en una columna. |
| **V4** | Ningún texto se recorta: recorrido completo, descripción íntegra e historia completa accesibles; «Sigue leyendo ↓» en su banda; ficha breve con datos, características y mosaico. |
| **V5** | Paso de página con giro (700 ms, portada 850 ms), bloqueado durante el giro; `prefers-reduced-motion` lo degrada a fundido; teclado ← → Inicio Fin Av/Re Pág; swipe; «Índice», contador y «Páginas / Desplazar». |
| **V6** | Galería de la referencia (mosaico y lámina) con teclado y swipe; E3: se queda en la misma foto por su clave, avisa si la foto desaparece; fotos fallidas con «Foto no disponible» / «Esta foto no se puede mostrar». |
| **V7** | Cierre: «Contacto · Hablemos», inicial o nombre del contacto, «Tu asesor / Tu asesora», «Llamar» (solo si hay teléfono), «Descargar en PDF», vigencia; colofón oscuro con la marca. Sin dirección, referencia BC ni enlaces de seguimiento en todo el lector. |
| **V8** | Actualizaciones en vivo durante la lectura (D12/E4): se aplican al terminar el giro, al momento con la galería abierta o sin animaciones; avisos iguales que hoy; enlace revocado/caducado → «Este enlace ya no está disponible» con la identidad nueva. |
| **V9** | HOME: miniaturas de la estantería y vista previa de Diseño con la portada nueva; el resto de la HOME y del gestor sin cambios; `test:typography` en verde. |
| **V10** | PDF: A4 vertical, portada oscura, índice con páginas reales, todas las secciones y fotos aprobadas, fuentes Playfair/Cinzel/Inter incrustadas, sin ids ni URL, colofón; `check-catalog-pdfs.mts` en verde; tamaños y tiempos dentro de los límites de T10. |
| **V11** | `/v` y `/s` sin cambios de comportamiento ni de HTML servido (T2). |
| **V12** | CI en verde (`tsc`, tests de catálogos, `build`). |

## 6. Lo que no se demuestra aquí

- La aprobación visual es de Fabricio sobre capturas y PDF reales; aquí solo se presentan.
- No se mide D13 en producción ni se toca producción.
- Safari/WebKit real con `100dvh`: se razona por paridad con `/v` (misma mecánica) y se comprueba en Chromium.
