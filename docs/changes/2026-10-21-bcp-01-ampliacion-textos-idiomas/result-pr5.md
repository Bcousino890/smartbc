# BCP-01 · Ampliación — resultado del PR5 · PDF multilingüe y fuentes

**Especificación:** [`spec.md`](spec.md) (§3, DA12–DA21, DA35; §6 N2, N3) · **Plan:** [`plan.md`](plan.md) § PR5 · **Prueba técnica y decisiones D1–D4:** [`result-pr5-spike.md`](result-pr5-spike.md). Formato y reglas, como en [`result.md`](result.md) y [`result-pr4.md`](result-pr4.md).

> **La QA en producción y el merge son de Fabricio.** Todo lo de abajo se ha probado con fixtures sintéticas, el simulador local y un `next build` aislado. Sin producción, credenciales, archivos `.env` del repositorio ni IA (este PR no la usa en ningún paso).

> **Lo más importante para decidir el merge.**
> 1. **D1 no se podía aplicar como estaba previsto (DA21, se cuenta tal cual).** La prueba técnica suponía que el hilo del PDF lleva `@react-pdf` compilado dentro. No es así: Next tiene `@react-pdf/renderer` en su lista **por defecto** de paquetes externos del servidor, así que Node lo carga de `node_modules` al ejecutar, también dentro del hilo. Un loader de webpack nunca lo tocaría. Lo detectó la propia comprobación del PR en el servidor de fixtures (500 con `pdf_engine_unpatched`). **Solución:** la misma corrección, como hook de carga de módulos de Node (`module.register`), que se instala al arrancar el servidor (`instrumentation.ts`) y al arrancar el hilo (primera importación de `render-worker.ts`). El loader de webpack queda de reserva. Probado en el servidor de desarrollo (hilo y camino sin hilo) y **ejecutando el chunk del hilo compilado por `next build`** sin ningún hook externo.
> 2. **El español sale idéntico a `main`:** los 10 catálogos de fixtures, objeto a objeto, salvo fecha, `/ID` y prefijo aleatorio de las fuentes.
> 3. **D4 queda propuesta** (abajo): en árabe y hebreo, cifras, precios y latín con la parte latina de **la misma familia** (Noto Naskh Arabic, Frank Ruhl Libre, Noto Sans Hebrew), como el lector. Cambiarla es una línea.
> 4. **Dos cosas nuevas para Fabricio:** un residuo de forma más del árabe (los puntos de la «ة» final de «المساحة», familia E8, no cubierto por D3) y un defecto **anterior** del PDF en español (la ligadura «fi» de Playfair no lleva texto: algunos lectores copian «La finca» como «La nca»). Ninguno se ha tocado en silencio.

## PR5 · PDF multilingüe y fuentes

- **Rama:** `fabri/bcp-01-pdf-idiomas`. Base: la prueba técnica (desde `925e6439`), fusionada con `origin/main` = `d8910688` (PR1–PR4 y PR7a dentro) en `f940b4d7`.
- **Migración:** ninguna. **Paquetes nuevos:** ninguno (pdfjs, Playwright, fontkit y sharp ya estaban). **Red:** una descarga única de 9 archivos de fuentes OFL (abajo).

### Qué hace

- **El PDF va en el idioma del token** (`snapshot.lang`, 0223), el mismo de la captura fija (DA19). `generate.ts` ya no fuerza «es»: contenido, idioma y nombre de archivo salen de la misma captura.
- **Textos (`document.ts`):**
  - Todas las etiquetas fijas salen del diccionario del lector (`lib/catalogs/i18n.ts`, las mismas claves). Lo que solo tiene el PDF va en `lib/catalogs/pdf-i18n.ts`, en los 8 idiomas: «Catálogo», «Nº», «continuación», «Más fotos», versión de la copia fija, cierre, colofón y asunto. ar, tr y he siguen «sin revisión nativa» (DA20).
  - Está en un archivo aparte para no chocar con el PR6, que toca `i18n.ts`.
  - Mayúsculas con `toLocaleUpperCase` del idioma (turco: «RETİRO, MADRİD», «ÖZELLİKLER»).
  - Cifras y fechas con su `Intl`. `forPdf` quita U+200E, U+200F y U+061C y pasa U+202F a U+00A0.
- **Árabe y hebreo (N2):**
  - Texto de derecha a izquierda.
  - Filas reflejadas a mano: índice, datos clave, precio y «Reservada», viñetas, características, «Más fotos», pie, cabeceras y marca de capítulo.
  - Sin espaciado entre letras y sin cursiva (sus familias no la tienen).
  - Cifras, precios, teléfono, folios y «01 / 05» en su propio texto LTR.
  - El contenido (en español hasta el PR6) se escribe en su propia dirección, alineado a la derecha. Cuando el PR6 lo traduzca, irá en RTL solo.
  - La nota del cierre va en dos textos: textkit pintaba el salto de línea con Helvetica.
- **Metadatos y archivo:**
  - `/Lang`: «es-ES», «en-GB», «fr-FR», «it-IT», «de-DE», «ar», «tr-TR» y «he-IL».
  - Título y asunto en el idioma.
  - Nombre de archivo con la palabra del idioma: «كتالوج · Salamanca y Chamberí · 22-10-2026.pdf», «Katalog · …». Content-Disposition en UTF-8.
- **Fuentes por idioma (`fonts.ts`, N3):**
  - es, en, it y de: **exactamente** las tres de siempre.
  - fr y tr: las mismas y, detrás, su «latin-ext».
  - ar: Noto Naskh Arabic.
  - he: Frank Ruhl Libre para títulos y etiquetas y Noto Sans Hebrew para el texto, como el lector.
  - **E1:** los subconjuntos secundarios se renombran al cargarse («…-LatinExt», «…-Latin»), también en cada recarga.
- **D1 · Corrección local del motor (`lib/pdf/engine-patch/`):** ver «Cómo se aplica D1 en producción».
- **D2 · ActualText:** cada línea con texto RTL lleva `/Span << /ActualText (texto lógico) >> BDC … EMC`, así que copiar y buscar dan el texto correcto en árabe y hebreo. Las líneas sin RTL no llevan nada. Por eso el PDF en es, en, fr, it, de y tr no cambia.
- **Lector (corrección pequeña, del PR4):** los avisos de la descarga del PDF («PDF descargado.», errores) salían en español en los demás idiomas. `useReaderPdf` se llamaba fuera del proveedor de idioma. Ahora recibe el diccionario del enlace.

### Cómo se aplica D1 en producción y su comprobación de versión

- **`patch.cjs` (un solo módulo).**
  - Sustituye trozos exactos de `@react-pdf/textkit` 6.3.0: `reorderLine` (E2, E3 y E4, más el texto lógico para D2) y `slice$1` (E7).
  - Y de `@react-pdf/render` 4.5.1: `renderGlyphs` (E6) y `renderLine` (ActualText, D2).
  - Deja una marca (`bcp-pdf-engine-patch@1 textkit-6.3.0 render-4.5.1`) en `globalThis` y en el código.
  - Es idempotente.
- **Comprobación de versión** (al cargar). Si la versión instalada no es la revisada, o un trozo no aparece exactamente una vez, **lanza**: «[pdf-engine-patch] @react-pdf/textkit 6.4.0 no es la versión revisada (6.3.0) — revisa lib/pdf/engine-patch/patch.cjs…». La carga de `@react-pdf` falla con ese motivo. Lo prueba `npm run test:pdf-engine` en la CI con versiones y textos simulados.
- **Dónde se instala:**
  - **Servidor (`next start`/`next dev`):** `instrumentation.ts` llama a `installPdfEngineHook()` al arrancar, antes de que ninguna ruta cargue `@react-pdf`. Así va corregido también el camino sin hilo (respaldo y `CATALOG_PDF_WORKER=0`). Si el Node no tiene `module.register`, lo dice en el log.
  - **Hilo del PDF:** la primera importación de `render-worker.ts` es `install-worker.ts`, que instala el hook en el hilo antes de que cargue `@react-pdf`.
  - **Scripts:** `--import ./scripts/pdf/engine-patch-hook.mjs` (los hilos lo heredan).
  - **Reserva:** el loader de webpack de `next.config.ts`, por si algún día Next compila `@react-pdf` dentro del bundle.
- **Se usa `module.register` y no `module.registerHooks`.** Este último, probado en Node 23.7, rompe los módulos CommonJS importados desde ESM (`unicode-trie`: «inflate is not a function») y tumbó el servidor de desarrollo.
- **Exigencia en ejecución:** `renderCatalogPdf` exige la marca en **árabe y hebreo** (`pdf_engine_unpatched`, con mensaje claro en el log del hilo). En los demás idiomas el PDF es idéntico con y sin corrección y no se bloquea.
- **Comprobado en el build** (`next build` aislado en `.next.qa`):
  - El chunk del hilo (`.next.qa/server/chunks/9233.js`, 77 KB) contiene la marca, el hook (`data:text/javascript,`) y `import("@react-pdf/renderer")`, este fuera del bundle.
  - `instrumentation.js` carga el chunk de instalación (`69554.js`, también con la marca).
  - **Prueba de ejecución:** ese chunk compilado se lanzó como `Worker` desde un proceso **sin** el hook de los scripts (marca ausente en el proceso principal). Maquetó «pdf» en ar (16 hojas, 103 líneas con ActualText), he (15 hojas, 102) y es (16 hojas, 0).
- **Se buscó así:** `grep -rl "bcp-pdf-engine-patch@1" .next.qa/server` y `grep -rl parentPort .next.qa/server/chunks`, antes de borrar `.next.qa`.

### Propuesta D4 (para que Fabricio la cierre)

- **Propuesta:** dentro de los textos en árabe y hebreo, las cifras, los precios y el alfabeto latino van con el subconjunto «latin» **de la misma familia**:
  - árabe: Noto Naskh Arabic;
  - hebreo, títulos y etiquetas: Frank Ruhl Libre;
  - hebreo, texto: Noto Sans Hebrew.

  Son las mismas caras que ya carga el lector (`components/catalogs/reader/fonts.ts` pide `["arabic", "latin", "latin-ext"]`), así que lector y PDF coinciden.
- **Archivos:** 9 `.woff` nuevos de Fontsource 5.3.0 (400, 500 y 600), OFL 1.1. Las licencias de los paquetes son idénticas a los `OFL-*.txt` ya versionados. Están en el README con su sha256.
- **Pila:** `[familia RTL, su latina, latina del catálogo]`. La última solo es respaldo de glifos que la familia no trae.
- **Cobertura, comprobada por `test:pdf-fonts`:**
  - Todos los caracteres que el PDF escribe en ar y he: diccionarios, cifras, precios, fechas, teléfono y contenido en español con tildes, «¿», «¡», «« »», «€», «·» y «—».
  - **Única excepción:** «²» no está en Noto Naskh Arabic ni en Noto Sans Hebrew (sí en Frank Ruhl Libre). En árabe, ese único glifo de «m²» sale de Playfair, igual que hace el navegador en el lector.
  - La prueba falla si cualquier otro carácter sale de Inter, Playfair o Cinzel. `test:catalogs-pdf-i18n` lo comprueba también en el PDF real: la fuente latina incrustada en árabe solo pinta «²»; en hebreo, ninguna.
- **Cambiarla es una línea:** `RTL_LATIN` en `lib/pdf/catalog/fonts.ts`.
  - `"own-family"` es la propuesta.
  - `"catalog-latin"` es la de la prueba técnica: cifras y latín con Inter y Playfair.
- **Alternativas, si no gusta:**
  - Noto Serif y Noto Sans: la pareja «oficial» de Noto; serían archivos nuevos.
  - Mantener Inter y Playfair, que fue lo rechazado.

### Verificación

| Comprobación | Resultado |
| --- | --- |
| **Español idéntico a `main`** (`render-cases.mts` + `same-pdf.mts`).<br>Los 10 catálogos de fixtures (pdf, main, main en alquiler, one, journey, journey24, empty, qa, rent y sale), con `origin/main` extraído con `git archive` y la misma entrada y fecha.<br>Comparación objeto a objeto, con los flujos descomprimidos, sin fecha, `/ID` ni prefijo aleatorio de las fuentes. | ✅ **10/10 idénticos**, mismo número de páginas (16, 12, 12, 6, 10, 68, 4, 28, 9 y 7) y mismos bytes |
| `test:catalogs-pdf-i18n` (nuevo en la CI, «Catálogos (PDF en 8 idiomas, offline)»).<br>• Diccionarios del PDF en los 8 idiomas; el español como antes.<br>• El PDF real «pdf» en cada idioma: `/Lang`, metadatos, **28 etiquetas del diccionario**, contenido completo por vivienda (título, precio, operación, zona, características, capítulos y cada bloque palabra a palabra), pies de foto, índice a la página real con sus folios, cierre y colofón al final.<br>• Fuentes por idioma, glifos, sin marcas bidi ni U+202F, ActualText solo en RTL.<br>• Títulos con ğ İ ş ı (tr), Ÿ (fr), árabe y hebreo, leídos tal cual (E1 resuelto). | ✅ **370** |
| `test:pdf-engine` (nuevo en la CI, «PDF del catálogo: corrección local del motor (offline)»).<br>• Versiones revisadas; cada trozo se corrige una vez; versión o texto distintos fallan con un error claro.<br>• Next deja `@react-pdf/renderer` fuera del bundle; `instrumentation.ts` y la primera importación del hilo instalan el hook.<br>• **En un proceso de Node limpio**, instalar y cargar `@react-pdf` lo deja corregido; idempotente; loader de reserva.<br>• Árabe (las 6 palabras que tiraban el motor) y hebreo con ActualText = texto lógico exacto, y nada en latino. | ✅ **39** |
| `test:pdf-fonts` (ampliado): 38 archivos con sha256 y licencias; subconjunto «latin» de las familias RTL; **pilas reales por idioma** cubriendo todos los textos del PDF; D4 en ar/he. | ✅ |
| `check-catalog-pdfs.mts` (local, PDFKit de macOS y lector propio para ar/he).<br>• Todo lo de siempre en español.<br>• Además «pdf» y «main» en en, fr, it, de, ar, tr y he, **por el hilo**, con lo esperado sacado de los diccionarios.<br>• Fotos por su código, nada interno, solo `tel:`, `/Lang` y fuentes por idioma.<br>• Todos maquetados por el hilo; ningún respaldo. | ✅ **1.445**, 0 ❌ |
| `compare-worker-inline.mts`: hilo frente a camino sin hilo, también ar, he y tr (y byte a byte con `same-pdf.mts`) | ✅ 10/10 |
| `test-pdf-worker.mts` (hilo, cancelación, memoria, respaldo, entorno mínimo) | ✅ todo en verde |
| `check-rtl-visual.mts` (local, nuevo; pdfjs en Chromium, como la prueba técnica).<br>• ar y he: todas las páginas del PDF real con contenido.<br>• Filas reflejadas medidas en el documento real: índice, datos clave y pie.<br>• **24 líneas reales del PDF** frente a Chromium con las mismas fuentes y controles en espejo y bidi invertido.<br>• Letras unidas («مسكن»: 0 huecos; separada: 3).<br>• Título árabe y hebreo con ActualText lógico. | ✅ **35**, ⚠️ 3, 0 ❌ |
| Residuos de forma del árabe (E8), con orden y ancho correctos: | ⚠️ |
| • «في» en el título y en el texto del cierre (perfil 0,845 y 0,891): **aceptado en D3**. | |
| • «المساحة» (perfil 0,877): los dos puntos de la «ة» final salen algo más altos que en Chromium. Es legible y el orden es correcto (controles −0,08 y −0,37). **No está cubierto por D3: lo decide Fabricio** (captura `capturas-pr5/lineas-ar-pdf-vs-chromium.jpg`). | |
| Descarga desde el botón del lector (servidor de fixtures en 3140, `pdf-qa.mjs`), en ar, he, tr y es y en el enlace personal de Ana en hebreo:<br>• nombre del archivo en el idioma, `/Lang`, textos del idioma, ActualText solo en ar/he y aviso «PDF descargado» en el idioma;<br>• maquetado por el hilo («pdf hilo» en el log);<br>• con `CATALOG_PDF_WORKER=0`, el árabe sale bien por el camino sin hilo (hook de `instrumentation.ts`). | ✅ 41 |
| QA anteriores contra 3140:<br>• lector `qa` (24), `res-qa` (24), zonas `area-qa` (19), estructura `st-qa` (15), textos aprobados `copy-qa` (17), título `title-qa` (7), opiniones `fb-qa` (23) y **idiomas del lector `lang-qa` (218)**;<br>• plantillas `tpl-qa`: 28/29 con su espera de 1,5 s y **29/29** con 4 s. Es un paso del gestor que el PR no toca: «quitar la plantilla» tarda más en el servidor de desarrollo;<br>• `fb-qa` y `lang-qa` necesitaron una segunda pasada tras un `reset` (estado dejado por la QA anterior); luego en verde. | ✅ |
| `pdf-rtl-spike.mts` con parche: los mismos 4 ❌ documentados en la prueba técnica (E8 y la extracción de PDFKit, que no lee ActualText). | = prueba técnica |
| Las 30 suites de la CI (bucle sin `npm run build`), `npx tsc --noEmit`, `python3 scripts/lint-migrations.py` | ✅ |
| `next build` aislado (sin servidores, `.next` borrado, `.env.production` apartado, `tsconfig.json` respaldado, `NEXT_BUILD_DIR=.next.qa`).<br>Dos veces; la última sobre el código final (`a6b25e80`).<br>Restaurados los dos (el build reescribe `tsconfig.json`; se repuso la copia); `git status` limpio; el log sin «Environments: .env»; `.next.qa` y `.next` borrados. | ✅ |

**Páginas por idioma** (DA35: no se exige el mismo número):
- «pdf»: es, en, fr, it, de, ar y tr, 16 hojas; he, 15.
- «main»: 12 en los 8 idiomas.
- El índice apunta a la página real en todos.

Capturas en [`capturas-pr5/`](capturas-pr5/), 500 KB:
- Una hoja de vivienda por idioma.
- Índice y cierre en ar y he.
- Las líneas reales del PDF frente a Chromium en ar y he.

### Hallazgos que se cuentan (DA21)

| | Hallazgo | Qué se hizo |
| --- | --- | --- |
| H1 | `@react-pdf/renderer` es externo en el servidor de Next (lista por defecto). El loader de webpack de la prueba técnica no se habría aplicado nunca en producción. | Hook de carga de Node (`module.register`) en el arranque del servidor y del hilo. Probado en desarrollo y en el chunk compilado. El loader queda de reserva. |
| H2 | En una línea RTL, textkit no quita el salto de línea y lo pinta con la fuente de serie (Helvetica). | La nota del cierre va en dos textos en ar/he. El español no cambia. |
| H3 | `module.registerHooks` (Node 23.7) rompe CommonJS importado desde ESM. | Se usa `module.register`. |
| H4 | El aviso de la descarga en el lector salía en español en los demás idiomas (PR4). | Corregido (`useReaderPdf` recibe el diccionario del enlace). |
| H5 | **Anterior, también en `main`:** en el PDF en español, la ligadura «fi» de Playfair (título «La finca») se incrusta sin entrada en el ToUnicode. PDFKit de macOS la reconoce. Un lector que solo mire el ToUnicode copia «La nca». | **No se ha tocado**: el español debía quedar idéntico. El lector de las pruebas la identifica por anchura y forma. Se propone corregirlo en un PR aparte. |
| H6 | Residuo de forma árabe en la «ة» final («المساحة»), además de «في» (D3). | Se informa; decide Fabricio. |
| H7 | PDFKit de macOS y pdf.js **no** leen ActualText; con ellos el árabe copiado sigue dando otras letras. | La verificación usa un lector propio que sí lo lee, como hacen, según su documentación, Acrobat y poppler. En Chrome (pdfium) no se ha podido comprobar desde aquí: paso de la QA de Fabricio. |

### Efectos al fusionar

- **Sin migración ni cambio de datos.**
- **Todos los PDF del catálogo en español:** idénticos a los de antes (comprobado byte a byte en 10 catálogos).
- Hasta el PR6 la interfaz solo deja elegir «es». Otro idioma solo se activa por SQL (paso opcional de la QA del PR4).
- **Al arrancar el servidor se instala un hook de carga de módulos ESM** que solo cambia `@react-pdf/textkit` y `@react-pdf/render`. Los demás PDF del CRM (propiedad, documentos, resumen de candidatos) usan ese motor:
  - en latino no cambian (sin líneas RTL no hay ActualText, y E6/E7 no afectan a glifos sin marcas);
  - el PDF de propiedad con Helvetica se comprobó tras los del catálogo, en el mismo proceso.
- Requisito: Node con `module.register` (≥ 20.6 o 18.19). Si falta, solo fallan los PDF en ar y he, con el error claro, y el log lo avisa al arrancar.
- Si alguien sube `@react-pdf` sin revisar la corrección, `test:pdf-engine` falla en la CI y la carga del motor también.
- El lector solo cambia en el idioma de los avisos de la descarga del PDF.

### Reversión

- **Revertir el merge.** No hay datos que deshacer.
- El PDF vuelve a salir siempre en español, sin el hook ni las fuentes nuevas.
- Los 9 archivos de fuentes y el lector propio de PDF se van con el revert.

### QA en producción (Fabricio)

1. En el VPS, `node -v` debe ser ≥ 20.6. Tras desplegar, `pm2 logs smartbc-portal` no debe mostrar «este Node no tiene module.register» ni `pdf_engine_unpatched`.
2. Abre un catálogo compartido y **descarga el PDF desde el lector**. Debe ser **exactamente el de antes**, en español: mismas páginas, tipografía y nombre «Catálogo · … .pdf». En el log, «pdf hilo» y ningún respaldo.
3. Descarga también, desde el CRM, un PDF de propiedad y uno de documentos: iguales que antes.
4. (Opcional, para ver ar/he antes del PR6) Con psql: `SELECT catalog_client_link_set_lang('<tu id de dueño>', '<id de una asignación de prueba>', 'ar');`.
   - Abre ese enlace personal y pulsa «تنزيل بصيغة PDF».
   - El archivo se llama «كتالوج · … .pdf» y se lee de derecha a izquierda: índice con el número a la derecha y el precio a la izquierda, letras unidas y precios y teléfono en LTR.
   - El contenido sigue en español hasta el PR6.
   - En Acrobat y en Chrome, **selecciona y copia** un rótulo árabe («الفهرس») y busca «اختيار»: debe salir el texto correcto. Si en Chrome no, dímelo: sería H7.
5. Repite el paso 4 con `'he'`. Para deshacerlo, la misma llamada con `NULL`.
6. Revisa los textos nuevos del PDF en `lib/catalogs/pdf-i18n.ts`. **ar, tr y he necesitan un hablante nativo** (DA20).
7. Decide **D4** (propuesta arriba) y el residuo «ة» de H6.

### Ajustes al plan

- **D1 por hook de carga de Node**, no por loader de webpack (H1). El loader queda de reserva.
- **D4 propuesta** con la parte latina de las mismas familias (9 archivos nuevos). Fue la única descarga de red, aprobada en «Pasos de entorno».
- **Textos propios del PDF en `pdf-i18n.ts`**, con las claves compartidas en `i18n.ts`, para no chocar con el PR6.
- **Verificación de ar/he con un lector propio** (`scripts/pdf/pdf-text.mts`), que respeta ActualText. Corre en la CI sin PDFKit.
- **Orden visual sobre la imagen con las cadenas reales del PDF** (`check-rtl-visual.mts`), no con muestras inventadas. Los residuos E8 con orden correcto se informan como ⚠️.
- **La exigencia del motor corregido solo bloquea ar y he.**
- **Lector:** idioma de los avisos de la descarga (H4).
- **Contenido:** sigue en español y se escribe en su propia dirección. Las mayúsculas del contenido usan las reglas del idioma del documento: en turco, «MADRİD», como se escribe en turco; correcto también cuando el PR6 lo traduzca.

### Decisiones rutinarias

- Pilas: es, en, it y de con una sola familia (salida idéntica); fr y tr con `[latin, latin-ext]`.
- Etiquetas hebreas con Frank Ruhl Libre, como el lector.
- «Nº» por idioma: No., N°, N., Nr., رقم, No. y מס׳.
- Fecha de la versión: fecha larga de `Intl` + «, HH:MM» (en árabe «،»). En español, exactamente la de antes.
- Una pieza «solo cifras» (precio con dígitos, superficie, teléfono, folios) va LTR. Sin dígitos («السعر · غير متوفر») va en la dirección del documento.
- Viñetas de características alineadas al lado de la viñeta en RTL (`alignItems: flex-end`).
- Los avisos ⚠️ de E8 no cuentan como fallo, pero se listan en `informe.json` y aquí.
- `same-pdf.mts` ignora fecha, `/ID`, prefijo de subconjunto y `/Length`.

### Cómo reproducir

```bash
npm run test:pdf-engine && npm run test:pdf-fonts && npm run test:catalogs-pdf-i18n      # en la CI
# local (macOS, fixtures; el hook del motor en todos):
H="--experimental-strip-types --import ./scripts/node-ts-loader.mjs --import ./scripts/pdf/engine-patch-hook.mjs"
NODE_ENV=development CATALOG_FIXTURES=1 node $H scripts/pdf/check-catalog-pdfs.mts node_modules/.cache/pdf-check
NODE_ENV=development CATALOG_FIXTURES=1 node $H scripts/pdf/compare-worker-inline.mts node_modules/.cache/pdf-compare
NODE_ENV=development CATALOG_FIXTURES=1 node $H scripts/pdf/check-rtl-visual.mts node_modules/.cache/pdf-rtl-visual
# español frente a main:
git archive origin/main lib scripts components package.json tsconfig.json public | tar -x -C <dir>; ln -s $PWD/node_modules <dir>/
(cd <dir> && NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/pdf/render-cases.mts <a>)  # render-cases.mts copiado allí
NODE_ENV=development CATALOG_FIXTURES=1 node $H scripts/pdf/render-cases.mts <b>
node --experimental-strip-types scripts/pdf/same-pdf.mts <a> <b>
```
