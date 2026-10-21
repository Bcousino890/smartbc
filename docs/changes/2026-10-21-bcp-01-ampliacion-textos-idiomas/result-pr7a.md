# BCP-01 · Ampliación — resultado del PR7a · Resolución de portada y PDF (sin cambio de diseño)

**Especificación:** [`spec.md`](spec.md) §5 («Hallazgos de resolución») · **Plan:** [`plan.md`](plan.md) § PR7a. Los PR1–PR3 están en [`result.md`](result.md); este PR se documenta aparte para no tocar ese archivo.

> **La QA en producción y el merge son de Fabricio.** Todo lo de abajo se ha probado con datos sintéticos y fixtures; sin producción, credenciales, fotos reales de catálogos, IA ni archivos `.env` del repositorio (el `next build` se hizo con `.env.production` apartado fuera del worktree). Las dos únicas fotografías reales usadas para estimar pesos son las del propio repositorio (`public/login-bg.jpg`, `public/portal-hero.jpg`), las mismas de `propuestas-visuales/`.

## PR7a · Resolución de portada y PDF

- **Rama:** `fabri/bcp-01-resolucion`, desde `origin/main` = `925e6439`.
- **Sin migración** y sin dependencias nuevas. Nada del acabado visual (PR7b): ni tono, ni veladuras, ni filetes.

### Qué hace

- **Portada del lector con `srcset`** (`components/catalogs/reader/pages.tsx`, `lib/catalogs/cover-srcset.ts`). La portada va a sangre y pedía una sola variante de 1.600 px: en una pantalla de 1440 a 2× (2.880 px reales) se ampliaba 1,8 veces. Ahora declara `srcset` con la escala del proxy (640 … 1920, 2560) y `sizes="100vw"`, **acotado al ancho real de la foto** según el contrato público y nunca por encima de 2.560 px (el máximo que se guarda). Con la misma regla que el hero de `/compartir` (`hero-srcset.ts`): un descriptor `w` que promete más píxeles de los que hay deja la foto peor, así que sin dato de ancho no se declara nada y se sigue con la variante única de siempre, que además queda como `src` de respaldo. **Misma caja, misma posición, mismo recorte** (CSS intacto; comprobado con las cajas antes/después).
  - `CatalogCover` recibe `photoSrcSet`/`photoSizes` opcionales: **solo los pasa el lector**. La miniatura de la HOME, la vista previa de Diseño y la tarjeta de la HOME siguen exactamente igual (640 px).
- **PDF: anchos de foto según su tamaño impreso** (`lib/catalogs/export/generate.ts`, `lib/pdf/catalog/document.ts`). Las cajas impresas se exportan desde el documento (`PRINT_BOXES`: A4 a sangre; apertura 493 × 300 pt; «Más fotos» 240,6 × 175 pt) y cada foto se pide con los píxeles justos que ocupa impresa a **300 ppi** (`exportPhotoWidth`), con tope en el ancho de su caja y, en la portada, en el máximo guardado:
  - **Portada** (a sangre, `objectFit: cover`): 2.560 px (antes 1.400 ≈ 80 ppi). Una apaisada 3:2 llena los 297 mm de alto y queda a **≈ 146 ppi** (a 300 ppi harían falta 5.262 px, que no existen); una vertical 2:3 queda a **310 ppi** (2.481 px).
  - **Apertura**: hasta 2.056 px (= 300 ppi en los 493 pt de ancho; antes 1.400 ≈ 224 ppi). Una apaisada 3:2 la limita el alto: 450 pt → **1.875 px**; una 4:3 → 1.667; una vertical 2:3 → 834 (menos que antes).
  - **«Más fotos»**: hasta 1.003 px (300 ppi en la celda; antes 800 ≈ 240 ppi). Vertical → 487.
  - Nunca se amplía (`withoutEnlargement`), JPEG de calidad 76 como estaba, maquetación y número de páginas intactos. No hay fotos «de sección» en el documento actual (desde el lector compacto, DC9, el PDF lleva apertura + «Más fotos»); la clave `section` de `PHOTO_WIDTHS`, que no se usaba, desaparece.
- **Una sola regla de variantes** para el proxy real y las fixtures: `lib/catalogs/photo-widths.ts` (escala, máximo guardado, calidad; puro, apto para el cliente) y `lib/catalogs/photo-variant.ts` (reencode con `sharp`, solo servidor). `/p/[slug]/[idx]` se comporta igual que antes (misma escala, misma calidad, misma caché de 24 h, mismas cabeceras `X-Bcp-Variant`, `original` y `fallback`). La ruta de fotos sintéticas `/dev-fixtures/foto/…` ahora honra `?w=` con esa misma regla, para que la QA en Chromium compruebe qué variante carga el lector de verdad.
- **Fixtures:** la vivienda que da la portada del catálogo principal (`fx-atico`) declara fotos de 2.560 × 1.707 (antes 1.600 × 1.067) para poder comprobar la portada a 1440 × 2. El resto de fixtures sigue en 1.600.
- Protecciones del hilo del PDF (worker, timeouts, límites, cola) intactas. Fotos originales intactas.

### Cifras

**Variante que pide la portada del lector** (fixtures, Chromium):

| Pantalla | Píxeles necesarios | Antes | Después | Entregada |
| --- | --- | --- | --- | --- |
| 1440 a 2× | 2.880 (→ 2.560, el máximo guardado) | `w=1600` | `w=2560` | 2.560 px reales (`original`) |
| 1440 a 1× | 1.440 | `w=1600` | `w=1600` | 1.600 px (`w1600`) |
| 390 a 3× | 1.170 | `w=1600` | `w=1200` | 1.200 px (`w1200`) |
| Foto de 1.600 px a 1440 × 2 | — | `w=1600` | `w=1600` (el `srcset` acaba en `1600w`) | 1.600 px (`original`) |

**Peso de la portada del lector** (estimado con las dos fotos reales del repositorio, recodificadas como se guardan: WebP 86 a ≤ 2.560 px; las fixtures son SVG y no sirven para pesar):

| Foto guardada | 1440 × 2 antes → después | 1440 × 1 | 390 × 3 antes → después |
| --- | --- | --- | --- |
| `login-bg` (2.400 px, 467 KB) | 213 KB → **467 KB** (el original) | 213 KB (igual) | 213 KB → **155 KB** |
| `portal-hero` (1.920 px, 201 KB) | 120 KB → **201 KB** (el original) | 120 KB (igual) | 120 KB → **79 KB** |

En escritorio retina la portada cuesta lo que pesa el original guardado (nunca más: no se amplía ni se sirve 3.200); en móvil pesa **menos** que antes. El resto de fotos de cada pantalla (apertura y miniaturas) pide exactamente lo mismo que antes (mismo `srcset`, comprobado). Las variantes siguen cacheadas 24 h en CDN (`public, max-age=86400, s-maxage=86400`, comprobado en el test de fuente).

**PDF** (`scripts/pdf/check-catalog-pdfs.mts`, fotos sintéticas ligeras; mismo proceso, antes y después):

| Caso | Páginas | Peso antes → después | Por página antes → después |
| --- | --- | --- | --- |
| `pdf` (5 viviendas, 29 fotos) | 16 → **16** | 322 KB → 402 KB | 20,1 → 25,1 KB |
| `main` | 12 → **12** | 263 KB → 365 KB | 21,9 → 30,4 KB |
| `one` | 6 → **6** | 125 KB → 199 KB | 20,8 → 33,2 KB |
| `journey` | 10 → **10** | 245 KB → 296 KB | 24,5 → 29,6 KB |
| `journey24` (24 viviendas, 102 fotos) | 68 → **68** | 1,32 MB → 1,67 MB | 19,4 → 24,6 KB |
| `main-alquiler`, `dueno-archivado`, `one-final` | 12/16/6 → **iguales** | +39 % / +25 % / +59 % | — |

**PDF con fotos del tamaño real** (`scripts/pdf/measure.mts`, JPEG sintéticos con grano de 3.600 px, el mismo método que `2026-10-16-bcp-01-pdf/medicion.md`; mediana de 3 pasadas, M2):

| | Tiempo | Peso | Por página | RSS pico | Bloqueos del proceso |
| --- | --- | --- | --- | --- | --- |
| `journey24` antes | 5,75 s | 1,81 MB | 26,6 KB | 571 MB | ninguno (maqueta el hilo) |
| `journey24` después | **6,71 s** | **3,90 MB** | **57,4 KB** | 523 MB | ninguno |
| `pdf` después | 2,26 s | 1,23 MB | 77 KB | 469 MB | ninguno |

Por foto, con las dos fotografías reales del repositorio (JPEG 76, lo que incrusta el PDF): apertura apaisada 147 → **229 KB** (`login-bg`) y 82 → **133 KB** (`portal-hero`); «Más fotos» 61 → **86 KB** y 33 → **47 KB**; portada 147 → **366 KB** y 82 → **156 KB**. Extrapolado al peor caso real (24 viviendas, 102 fotos como `login-bg`): unos 8,6 MB antes → **unos 12,7 MB** después; con fotos como `portal-hero`, 4,7 → 7,1 MB. Sigue por debajo de los 25 MB de un adjunto de correo, pero es el coste de los 300 ppi (ver «Dudas»). El tiempo (+17 %) queda muy lejos del presupuesto de 50 s del trabajo.

### Verificación

| Comprobación | Resultado |
| --- | --- |
| `test:catalogs-photos` (55 comprobaciones, nuevo en la CI, sin BD): escala de anchos (`?w=` → escalón, tope 3.200, calidad 86/78); con `sharp` sobre fotos sintéticas, la variante servida mide lo pedido y lleva su cabecera (`w1280`), el original vuelve intacto cuando no es más ancho (`original`), nunca se amplía, bytes ilegibles → `fallback`; `srcset` de la portada acotado al ancho real (nunca 1920/2560 para una foto de 1.600; nunca 3200w; sin dato, sin `srcset`); anchos del PDF desde una instantánea sintética (portada 2.560, apertura 3:2 → 1.875, «Más fotos» 3:2 → 1.003 y vertical → 487, apertura vertical → 834, sin medidas → el tope) y cajas impresas sin cambios; fuente: `/p` usa los módulos compartidos y sigue cacheando 24 h, la ruta de fixtures sirve `?w=`, la portada declara `srcset`/`sizes`, `CatalogCover` no pone `sizes` sin `srcset`, el CSS de la portada no cambia, el PDF no amplía y conserva la calidad 76, y el módulo del `srcset` (cliente) no arrastra `sharp` | ✅ |
| `scripts/pdf/check-catalog-pdfs.mts` (PDF reales por el hilo, inspección con PDFKit y objetos): todo en verde antes y después; **mismo número de páginas en los 8 casos**; cada foto identificada por su código visual; 16 PDF maquetados por el hilo, 0 respaldos | ✅ |
| `scripts/pdf/measure.mts` (`journey24`, fotos de 3.600 px): sin bloqueos del proceso, 6,7 s, 3,9 MB | ✅ |
| QA en Chromium contra fixtures (`res-qa`, 21 comprobaciones): a 1440 × 2 la portada pide `w=2560` y recibe 2.560 px reales (cabecera `X-Bcp-Variant`); a 1440 × 1, `w=1600`; a 390 × 3, `w=1200` ≥ 1.170; `sizes=100vw`, nunca `3200w`; con una portada de 1.600 px el `srcset` acaba en `1600w` y recibe 1.600; **36 cajas iguales antes/después** (`getBoundingClientRect` de foto, título, botón, logo, panel, columna de foto, miniatura, descripción y datos, en portada, apertura y detalle, a 1440 × 1, 1440 × 2 y 390 × 3; 0 distintas); la apertura pide lo mismo que antes; sin errores de consola | ✅ |
| QA anteriores repetidas en esta rama (`BASE` en 3139, con las variantes `?w=` ya rasterizadas): zonas (`area-qa`, 19), plantillas (`tpl-qa`, 29), estructura (`st-qa`, 15), textos aprobados (`copy-qa`, 17), título (`title-qa`, 7) y lector (`qa`, 24); 0 fallos | ✅ |
| Las 26 suites de la CI, una a una (`grep "npm run" ci.yml`, sin `build`), y `npx tsc --noEmit` | ✅ |
| `next build` aislado (`NEXT_BUILD_DIR=.next.qa`, servidor parado, `.next` borrado, `.env.production` y `tsconfig.json` apartados y restaurados; `git status` limpio después) | ✅ «Compiled successfully» |

Capturas en [`capturas-pr7a/`](capturas-pr7a/): `portada-1440-dpr2.png`, `apertura-1440-dpr2.png`, `portada-390-dpr3.png`, `apertura-390-dpr3.png` (a 2× y 3×, con la variante nueva ya cargada).

### Efectos al fusionar

- **Sin migración.** Ningún dato cambia; ninguna huella pública cambia (el `srcset` lo calcula el lector a partir del contrato público, que ya traía el ancho de cada foto).
- **Lector:** quien abra un catálogo en una pantalla retina descarga la portada en la variante grande (hasta el original guardado); en móvil descarga una variante menor que antes. Las variantes nuevas (`w=2560`, `w=1200` en portadas) se generan en el proxy la primera vez y quedan en la caché de 24 h del CDN como las demás.
- **PDF:** los PDF que se generen a partir del despliegue pesan más (ver cifras) y tardan algo más (+17 % en el peor caso medido). Mismo número de páginas y misma maquetación. Las descargas en curso no se ven afectadas (el hilo y los límites no cambian).
- **HOME, gestor y vista previa de Diseño:** sin cambios (siguen pidiendo 640 px).

### Reversión

Revertir el PR (`git revert` del merge). No hay migración ni datos que deshacer; las variantes ya cacheadas en el CDN caducan solas a las 24 h y no molestan.

### QA en producción (Fabricio)

1. Abre un catálogo con portada en un Mac retina (o cualquier pantalla a 2×). En las herramientas del navegador (Red, filtrar por `/p/`), la portada debe pedir `…&w=2560` (o el ancho real de la foto si es menor) y la cabecera `X-Bcp-Variant` debe decir `w2560` u `original`. A simple vista la portada debe verse igual de encuadrada que antes y más nítida.
2. Abre el mismo catálogo en un móvil: la portada debe pedir `w=1200` o `w=1280` (según el teléfono) y verse igual.
3. Descarga el PDF de ese catálogo: mismo número de páginas que antes del despliegue, portada y fotos de apertura visiblemente más nítidas al ampliar; anota el peso del archivo. Imprime una página de vivienda si quieres comprobar los 300 ppi.
4. Mira la HOME (estantería de catálogos) y la vista previa de Diseño: deben estar exactamente igual (siguen a 640 px).
5. Si algún PDF grande pesa más de lo que quieres enviar por correo, dímelo: el ajuste es un número (ver «Dudas»).

### Decisiones rutinarias

- La escala de anchos, la calidad (86/78) y el tope de 3.200 del proxy **no cambian**: la misma caché, las mismas claves. La portada solo usa la escala hasta 2.560.
- Portada del PDF al máximo guardado (2.560 px) porque los 300 ppi a sangre no existen en el almacén; nunca se amplía.
- Ancho **justo por foto** en el PDF (lo que ocupa impresa a 300 ppi) en vez del ancho de la caja para todas: evita pedir 2.056 px a una foto que se imprime a 450 pt y deja las verticales más ligeras que antes.
- Calidad JPEG 76 del PDF sin tocar: bajarla a 70 solo ahorra un 13 % y se nota; el peso extra es por los píxeles, que es lo que se pedía.
- El módulo de `srcset` se separó del reencode con `sharp` (`photo-widths.ts` ↔ `photo-variant.ts`) porque el lector es código de cliente y el bundle rompía al arrastrar `sharp` (detectado en la QA).
- Fixtures: solo `fx-atico` pasa a 2.560 px; el resto sigue en 1.600 para conservar los casos de los QA anteriores.
- Nombre del test: `test:catalogs-photos`.

### Dudas y obstáculos (DA21: nada se reduce en silencio)

- **Peso de los PDF con fotos reales.** Con fotos detalladas, el peor caso (24 viviendas, 102 fotos) puede pasar de unos 8,6 MB a unos 12,7 MB (extrapolación con `login-bg.jpg`; con fotos más suaves, 4,7 → 7,1 MB). Es el coste de los 300 ppi que pedía el PR y queda por debajo del límite de un adjunto de correo, pero no se ha medido con fotos reales de catálogos (los agentes no acceden a ellas). Si Fabricio prefiere un tope, las palancas son `PRINT_PPI` (p. ej. 240 ppi deja la apertura 3:2 en 1.500 px y «Más fotos» en 802, con un peso cercano al de antes) o la calidad JPEG en `photos.ts`. No se ha reducido nada por mi cuenta.
- **La portada del PDF no llega a 300 ppi** con fotos apaisadas (≈ 146 ppi a sangre en A4): no hay más píxeles guardados. Solo subiría si el almacén guardara más de 2.560 px, que es otra decisión (afecta al peso de todas las fotos).
- La «nitidez» final solo se puede juzgar con fotos reales: en fixtures todo es sintético. La QA en producción del punto 1 es la comprobación real.

### Ajustes al plan (anotados aquí; `plan.md` no se toca)

- PR7a añade un test propio a la CI (`test:catalogs-photos`) y un script de QA de resolución (`res-qa`), no previstos en el plan.
- La ruta de fotos sintéticas de las fixtures honra `?w=`; antes devolvía siempre el SVG. Es lo que permite comprobar en Chromium qué variante carga el lector.
- La clave `section` de `PHOTO_WIDTHS` (recorrido) desaparece: el documento actual no tiene esas fotos desde DC9.
