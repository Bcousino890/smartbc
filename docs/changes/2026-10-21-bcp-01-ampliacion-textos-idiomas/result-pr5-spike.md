# BCP-01 · Ampliación · PR5 · Prueba técnica (tareas 5.1 y 5.2) — resultado

**Especificación:** [`spec.md`](spec.md) (§3 «Viabilidad técnica», DA20, DA21, DA35; §6 N3) · **Plan:** [`plan.md`](plan.md) § «PR5». **Rama:** `fabri/bcp-01-pdf-idiomas`, desde `origin/main` = `925e6439`. Será la base del PR5 completo, que se hará después sobre el PR4 (diccionario en 8 idiomas y `lang` en la instantánea).

> **Resumen para decidir.** Las fuentes de N3 están verificadas: OFL 1.1, cobertura real medida con fontkit y prueba en la CI. **El motor de PDF actual no sirve para el árabe y solo sirve a medias para el hebreo.** En árabe se cae con 6 de cada 14 palabras corrientes, y lo que no se cae lo pinta mal. En hebreo, cualquier línea que mezcle letras con cifras, «€», «m²» o un punto sale como basura. No es un problema de fuentes. Son **cinco defectos de `@react-pdf/textkit` 6.3.0 y `@react-pdf/render` 4.5.1** (E2, E3, E4, E6, E7), más uno de nombres de fuente (E1), y los he localizado línea a línea. Con una corrección local de ~60 líneas (sin paquetes nuevos y sin tocar `node_modules`):
> - el **hebreo** pasa todas las comprobaciones sobre la imagen;
> - el **árabe** sale unido, en orden y legible: 5 de 7 líneas pasan, con dos residuos (E8, una forma de «ي» final, y E9, la extracción de texto devuelve otras letras).
>
> El turco y el francés funcionan ya con el motor actual, pero solo si se corrige E1. Hay que decidir **D1–D4** (al final). Árabe, turco y hebreo siguen «sin revisión nativa» (DA20): los textos de muestra los escribí yo para la prueba.

## 5.2 · Fuentes (N3)

- **16 archivos nuevos** en [`lib/pdf/fonts/`](../../../lib/pdf/fonts/README.md), con el mismo esquema de nombres:
  - `noto-naskh-arabic-arabic-{400,500,600}-normal.woff`;
  - `frank-ruhl-libre-hebrew-…` y `noto-sans-hebrew-hebrew-…` (400/500/600);
  - `playfair-display-latin-ext-{400,500,600}-normal` + `400-italic`;
  - `cinzel-latin-ext-…` e `inter-latin-ext-…` (400/500/600).
- Todos salen de `https://cdn.jsdelivr.net/npm/@fontsource/<paquete>@5.3.0/files/<archivo>`, la misma versión 5.3.0 de los diez actuales. Fue una descarga única el 22-10-2026, solo `.woff` y `LICENSE`. En total ocupan 600 KB.
- Los **diez archivos actuales no cambian**: comprobé que son byte a byte los del CDN, así que el README da ya el origen exacto de los 26. es, en, fr, it y de siguen con exactamente sus fuentes de hoy.
- **Licencias:** los `LICENSE` de los seis paquetes son la OFL 1.1, y los de Playfair, Cinzel e Inter son idénticos a los `OFL-*.txt` ya versionados. Añadí `OFL-NotoNaskhArabic.txt`, `OFL-FrankRuhlLibre.txt` y `OFL-NotoSansHebrew.txt`.
- **README:** para cada archivo da familia, peso y estilo, subconjunto, paquete con versión y sha256.
- **[`scripts/pdf-fonts-coverage.mts`](../../../scripts/pdf-fonts-coverage.mts)** (`npm run test:pdf-fonts`, añadido a la CI con el patrón «Catálogos (zonas, offline)»; sin red y solo con fontkit, que ya está en `node_modules`, sin fontTools). Comprueba:
  1. **Integridad:** README ↔ archivos ↔ sha256, 29 `.woff` y seis licencias OFL 1.1.
  2. **Cobertura por archivo:**

     | Subconjunto | Caracteres comprobados | Resultado |
     | --- | --- | --- |
     | «latin» | es 36/36 y la «ı» del turco | completo |
     | «latin-ext» | ğ Ğ İ ş Ş 5/5 e «Ÿ» 1/1 | completo |
     | árabe | 72/72: U+0621–064A, cifras U+0660–0669 y U+06F0–06F9, tashkil U+064B–0652, «،» y «؟» | completo |
     | hebreo | letras 27/27 | completo |
     | niqqud U+05B0–05C7 (opcional) | Noto Sans Hebrew 24/24 · Frank Ruhl Libre 21/24 | faltan U+05C4–05C6, que no se usan en texto corriente |

  3. **Formas unidas del árabe:** `font.layout()` sobre «بيت», «شقة» y «مكتب» da glifos distintos de los aislados, con GSUB `init`/`medi`/`fina` presentes, en los tres pesos.
  4. **Pilas por idioma:** nueve combinaciones de la fuente del alfabeto con su familia latina; entre las dos cubren cifras, espacios, «·», «—», «€», «²», «%», «+», «/» y paréntesis.
  5. **U+202F:** el espacio fino que usa el francés al formatear números **no está en ninguna de las 26 fuentes**. Se documenta y se normaliza a U+00A0, que sí está en todas.
- **Hallazgos de cobertura que corrigen la especificación:**
  - La «ı» sin punto va en el subconjunto «latin» de Google Fonts, no en «latin-ext».
  - Los «latin-ext» **no** traen cifras ni el alfabeto básico: se usan detrás de su hermano «latin».
  - Las fuentes árabe y hebrea **no** traen cifras, «·», «€» ni «m²»: cada línea con cifras mezcla dos fuentes. De ahí vienen E1 y E2.

## 5.1 · Prueba de render (a–f)

[`scripts/pdf-rtl-spike.mts`](../../../scripts/pdf-rtl-spike.mts) es reproducible y sin red. Para la prueba:

- **Documento:** usa `@react-pdf/renderer` directamente, con las mismas piezas, estilos y familias del documento del catálogo. Hay un índice con enlaces internos en dos pasadas, viviendas (una de ellas de varias hojas), datos, precio, teléfono, cierre con `tel:` y una hoja de líneas de muestra.
- **Rasterizado:** se hace con pdfjs-dist 5.7 (build `legacy`) dentro del Chromium de Playwright, servido por un servidor HTTP propio en 127.0.0.1:3140.
- **Referencia:** cada línea de muestra se compara con la misma línea compuesta por Chromium con las mismas fuentes, y con dos controles negativos: la referencia en espejo y la referencia con el orden bidi invertido.
- **Dos pasadas:** `motor-actual/` y `con-parche-textkit/`. El modo con parche carga [`scripts/pdf/textkit-bidi-patch.mjs`](../../../scripts/pdf/textkit-bidi-patch.mjs) con `--import`.
- **No toca `lib/pdf/catalog/document.ts`.**

| Punto | Motor actual (sin tocar) | Con la corrección local (E2–E7) |
| --- | --- | --- |
| **(a) letras árabes unidas** | fontkit sí une: forma GSUB comprobada en el script de fuentes. Pero el motor **se cae** con 6 de 14 palabras corrientes («أعددنا», «إلى», «آخر», «شيء», «شخصياً», «ياً»: hamza, madda, tanwín…) con `Cannot read properties of undefined (reading 'id')`. Lo que no se cae lo dibuja mal: «بيت شقة» sale como 42×64 px de puntos sueltos frente a 172×47 px en Chromium (perfil −0,52). **El PDF árabe completo no se puede generar.** | ✅ Sobre la imagen, «بيت» unida tiene 0 huecos en 65 px y «ب ي ت» tiene 2 en 121 px. «بيت شقة» da perfil 0,967 con el mismo ancho que Chromium (100 %). El PDF árabe completo se genera (4 hojas más el cierre). |
| **(b) orden visual por línea** (perfil de tinta por columnas frente a Chromium; pasa si es > 0,9, supera a los controles en 0,3 y el ancho está en ±3 %) | **tr y fr:** las 12 líneas a 0,999–1,000, con controles ≤ 0,30. **he:** el título (solo hebreo) da 0,978. **Todas las líneas con cifras o puntuación salen corruptas:** etiqueta 0,53, datos 0,06 (ancho 67 %), precio 0,20, teléfono 0,09, párrafo −0,13 (E2). **ar:** no se genera. | **he: las 6 líneas pasan** (título 0,979, etiqueta 0,929, datos 0,984, precio 0,958, teléfono 0,963, párrafo 0,951). **ar: pasan** etiqueta 0,938, datos 0,935, precio 0,968 y teléfono 0,971; el título se queda en 0,900 y el párrafo en 0,689 por la forma de «في» (E8). tr y fr, idénticos al motor actual. |
| **(c) índice y enlaces internos** | tr, fr y he: 3 enlaces del índice → páginas 2, 3 y 4, que son las páginas reales (onPage, dos pasadas estables), leídos con PDFKit y con pdfjs. Los únicos enlaces externos son los 2 `tel:`. | Igual, y ahora también en árabe. |
| **(d) extracción de texto** (detalle abajo) | **PDFKit** (el extractor de `pdf-verify.mts`) devuelve **orden lógico** en hebreo: título, frase, precio y teléfono enteros, y el párrafo 27/27 palabras. Pero parte palabras con espacios espurios («בשכו נות», E5), así que `missingWord` (palabra a palabra) falla en la introducción. `flat` por bloque pasa en todo. **pdfjs** devuelve orden **visual** por línea, con fragmentos invertidos. | Hebreo: PDFKit con `missingWord` y con `flat` **pasa en todo**. **Árabe: PDFKit devuelve otras letras** («شقة مسرفة فى خى شالامابكا» por «شقة مشرقة في حي سالامانكا», E9), así que no se puede verificar el contenido árabe por extracción. |
| **(e) letterSpacing de Cinzel en ar/he** | Confirmado sobre la imagen: «חדרי שינה» pasa de 103 a 134 px de ancho y la correlación con la referencia baja de 0,874 a 0,478. | Árabe «غرف النوم»: de 2 a **7 huecos** y de 87 a 126 px, con la correlación de 0,544 a 0,215. **Rompe la unión de las letras: hay que anularlo en ar/he** (también en el `labelGold` y en el pie). |
| **(f) mayúsculas, números y /Lang** | `toLocaleUpperCase('tr-TR')`: «istanbul ışık» → «İSTANBUL IŞIK» (el genérico da «ISTANBUL»). fr: «l'haÿ» → «L'HAŸ». `/Lang` del PDF: «ar», «he», «tr-TR», «fr-FR»; el título va en el idioma. Intl: fr usa U+202F («1 450 000 €»); ar (`-u-nu-latn`) y he anteponen U+200F (RLM), que ninguna fuente trae; tr escribe «€1.450.000». | Igual. |

**Detalle de (d), lo que devuelve la extracción con RTL:**
- **PDFKit, hebreo, página 2:** `01 / 03 · מס׳ 01 · מכירה · סלמנקה, מדריד · דירה מוארת בשכונת סלמנקה · 1,450,000 € · …`. Está en orden lógico y con las cadenas completas, salvo los espacios espurios dentro de algunas palabras de párrafos largos (E5). Además ordena los bloques de una fila reflejada de derecha a izquierda («קומה» antes que «שטח»).
- **pdfjs, misma página:** `03 / 01 · דרידמ ,ה· סלמנק · … · € 1,450,000`. Está en orden visual, con trozos invertidos dentro de la línea.
- **Árabe:** con cualquiera de los dos extractores las letras salen cambiadas (E9).

## Obstáculos del motor (DA21: documentados, nada cambiado en silencio)

| | Defecto | Prueba | Corrección comprobada |
| --- | --- | --- | --- |
| **E1** | pdfkit guarda las fuentes por **nombre PostScript**, y cada «latin-ext» de Fontsource se llama igual que su «latin» (`Inter-Regular`…). El segundo archivo se descarta y ğ, İ, ş e Ÿ salen como basura (flechas, barras). | `actual-motor-e1-e2-e4.png`, fila 1 | Renombrar `postscriptName` del objeto fontkit tras cargarlo («…-LatinExt»). Está en el script; con eso tr y fr dan 1,000. Es código nuestro (`fonts.ts`), sin tocar el motor. |
| **E2** | `reorderLine` (textkit) deja las runs en su orden lógico y rellena los glifos de cada una con los glifos reordenados de **cualquier** run: los glifos de Inter se pintan con la fuente hebrea. | líneas hebreas con cifras, filas 3 y 4 | Reordenar runs completas (regla L2 de UAX #9) e invertir por grupos (base más marcas) dentro de las de nivel impar. |
| **E3** | El mismo `reorderLine` toma **un glifo por carácter** (`stringIndices`). Noto Naskh pinta cada letra como esqueleto + puntos, más la hamza aparte: se pierden glifos o se cae (`reading 'id'`). Pasa también con `direction: ltr`. | 6/14 palabras; `actual-ar-minimo-e3.png` | La misma sustitución. |
| **E4** | Por E2, el color, el enlace y la fuente de cada run se quedan en su sitio lógico: en «דירה **מרווחת** ונוף», el dorado cae en otra palabra. | fila 6 | La misma sustitución. |
| **E5** | PDFKit (macOS) mete espacios dentro de palabras RTL en párrafos largos al extraer. | `missingWord` falla y `flat` pasa | Ver «Verificación» abajo. |
| **E6** | `render` (`renderGlyphs`) pasa `xAdvance` a unidades de texto pero no `xOffset`/`yOffset`: los desplazamientos de marcas se quedan en un ~2 % y el punto cae sobre la letra vecina. | árabe con el parche de E2/E3 | Escalar los dos campos igual. |
| **E7** | `slice$1` (textkit) empieza cada trozo de línea en el **último** glifo del grupo de su primer carácter: se pierde la base («شقة» → «قة», «غرف» → «رف»). | árabe | Empezar en el primer glifo del grupo (las ligaduras se conservan). |
| **E8** | Residuo de modelado entre fontkit 2.0.4 y HarfBuzz: en «في» la «ي» final sale con otra forma y con los puntos sobre la «ف». Es legible pero distinta de Chromium. | título 0,900, párrafo 0,689 | Sin corregir. D3. |
| **E9** | pdfkit asigna **un Unicode por glifo** (`font.unicode[gid]`, el primero que lo usó). Noto Naskh comparte esqueleto entre ب/ت/ن/ي, س/ش y ف/ق, así que la extracción y el **copiar y pegar** del cliente dan otras letras. | PDFKit y pdfjs | Sin corregir. pdfkit 5.1.1 sí admite `markContent('Span', { actual })` (ActualText), que `render` no usa. D2. |

- **Alcance de la corrección:**
  - Solo toca líneas con texto RTL (`reorderLine` devuelve la línea intacta si todo es nivel 0), grupos de glifos sin código y glifos con desplazamiento.
  - **Los flujos de contenido de las 6 páginas de tr y fr son idénticos con y sin parche.** El español (y en, it, de) no cambia en estas pruebas, pero en el PR5 hay que demostrarlo con `check-catalog-pdfs.mts` y `compare-worker-inline.mts`.
- **Mecanismo del parche:**
  - En la prueba es un hook de carga de Node, que no modifica `node_modules`.
  - **En producción no sirve tal cual:** el hilo del PDF es un chunk de webpack con `@react-pdf` dentro (no está en `serverExternalPackages`).

## Riesgos

1. **Mantener una corrección del motor** (D1): queda atada a textkit 6.3.0 y render 4.5.1. Una subida de `@react-pdf` la deja sin efecto. Hay que hacer que el build falle si el texto no coincide, como ya hace el hook, que avisa.
2. **Árabe copiable** (E9): el PDF se ve bien, pero el texto seleccionable es incorrecto. Afecta a la accesibilidad, a la búsqueda y a la verificación.
3. **E8:** diferencias tipográficas de modelado frente al navegador en algunas formas contextuales. Solo afecta al árabe.
4. **Filas reflejadas a mano** (`row-reverse`): el PDF no refleja solo la maquetación en filas. Afecta a datos, índice, cabeceras, pie y la viñeta de las características.
5. **Teléfonos, precios y medidas dentro de texto RTL:** la regla bidi los parte en grupos RTL («456 123 600 34+», «m² 142»), igual que Chromium. Tienen que ir en su propio `Text` con `direction: "ltr"`.
6. **Marcas bidi de Intl:** U+200F (ar/he) y U+202F (fr) no están en las fuentes: hay que quitarlas o normalizarlas antes de maquetar.
7. **Extracción con PDFKit solo en macOS:** la CI (ubuntu) no ejecuta `check-catalog-pdfs.mts`. Ya era así y no cambia.
8. Los textos ar/tr/he siguen sin revisión nativa (DA20).

## Adaptación propuesta de la verificación (DA35, sin rebajarla)

Por idioma, en `pdf-verify.mts` y `check-catalog-pdfs.mts`:

- **es, en, fr, it, de, tr:** igual que hoy (palabra a palabra con `missingWord`, más `flat`), con las cadenas del diccionario de cada idioma.
- **he:**
  - **Contenido completo por bloque:** cada bloque de la proyección (título, rótulos, precio, características, cada bloque de descripción) aparece entero en las páginas de su vivienda comparando `flat` (sin espacios ni signos), que **exige el orden lógico de todos los caracteres**. Con el parche pasa en todo; `missingWord` palabra a palabra también pasa, y se mantiene.
  - **Orden visual sobre la imagen:** los rótulos fijos, el precio, el teléfono y una línea de cada bloque se rasterizan y se comparan con la referencia de Chromium por perfil de columnas (> 0,9, más de 0,3 por encima del espejo y del bidi invertido, ancho ±3 %), como hace `pdf-rtl-spike.mts`.
  - **Glifos presentes:** que todo carácter del texto esté en la pila de fuentes permitida del idioma, sin «.notdef» (comprobación con fontkit y con las fuentes incrustadas de `objects.py`).
- **ar:** mientras siga E9, la extracción **no** puede probar el contenido. Se propone:
  1. Comprobar el **texto lógico del layout**: las cadenas que el documento entrega a react-pdf, recogidas en la segunda pasada como ya se hace con `onPage`, contra la proyección, bloque a bloque.
  2. Usar la **imagen** como prueba de que se pintó: perfil de columnas de cada bloque frente a Chromium, sin huecos dentro de las palabras y ancho igual.
  3. Exigir **glifos presentes** y ninguna caída del motor.
  4. Si se adopta ActualText (D2), volver a exigir `flat` por extracción.

  Índice, enlaces, fotos, metadatos (`/Lang` del idioma, ya no `es-ES`), «nada interno» y fuentes permitidas por idioma: igual que hoy. **No se exige el mismo número de hojas que en español.**

## Plan del PR5 completo (sobre el PR4)

| Tarea | Contenido |
| --- | --- |
| **5.3a** Motor | Según D1: llevar la corrección de E2, E3, E4, E6 y E7 a un único módulo del repo (sustituciones de texto con comprobación de versión). Se aplicaría con una regla `module.rules` de webpack en `next.config` (loader propio, sin dependencias) para el hilo, y con el mismo hook de Node para los scripts. El build falla si el texto de textkit o render no coincide. |
| **5.3b** Fuentes | En `fonts.ts`: registrar las familias nuevas, pilas por idioma (`[latin, latin-ext]`; `[árabe, latina]`; `[hebrea, latina]`), renombrar el PostScript de los «latin-ext» (E1) también en `freshCatalogFonts` (se recargan en cada PDF) y añadirlas a `catalogFontFiles`. |
| **5.3c** `document.ts` | Textos del diccionario del PR4 (`lang` de la instantánea). `up()` con `toLocaleUpperCase(intlLocale)`. Números con `intlLocale`, pasados por `forPdf` (fuera U+200E, U+200F y U+061C; U+202F → U+00A0). `letterSpacing: 0` en ar/he. `direction` y `textAlign` por idioma. Filas `row-reverse` y márgenes reflejados en ar/he. Precio, teléfono, «m²», «Nº 01» y folios en su propio `Text` LTR. `pdfMetadata` con el idioma. Cursiva de Playfair solo en LTR (las fuentes árabe y hebrea no tienen cursiva). |
| **5.3d** Árabe copiable | Según D2: ActualText por run en `render` (parche del mismo módulo) o la alternativa que decida Fabricio. |
| **5.4** Verificación | La adaptación de arriba en `pdf-verify.mts` y `check-catalog-pdfs.mts`: cadenas por idioma, fuentes permitidas por idioma, glifos por idioma (ğ İ ş Ÿ, árabe, hebreo), extracción por bloque en he y texto del layout más imagen en ar. Mantener `test:pdf-fonts` y pasar a la verificación local la comparación sobre imagen de `pdf-rtl-spike.mts`. |
| **5.5** Pruebas (DA35) | Las fixtures en los 8 idiomas por el hilo real. Contenido completo, destinos del índice, sin cortes ni bloques perdidos y tipografía legible. Regresión: los PDF en español idénticos a `main` salvo fechas (comparación de flujos de página). El hilo y sus protecciones intactos (`worker-build-gate.sh`). Capturas por idioma en el expediente. |

## Decisiones que necesito de Fabricio

| | Pregunta | Recomendación |
| --- | --- | --- |
| **D1** | ¿Cómo se corrige el motor (E2, E3, E4, E6, E7)? | **Corrección local en el repo** (módulo único, aplicada por webpack en el hilo y por hook en los scripts, con comprobación de versión). Alternativas: subir `@react-pdf` (necesita `npm install` y no sé si lo arregla), copiar textkit al repo o mandar el arreglo al proyecto original. Sin corrección, el PDF árabe no es posible y el hebreo solo vale sin cifras ni signos en la misma línea. |
| **D2** | El texto árabe copiable sale con otras letras (E9). | ActualText por run (pdfkit lo admite). Si no se aprueba, aceptar que el PDF árabe **se ve** bien pero no se copia bien, y verificar por el texto del layout más la imagen. |
| **D3** | Forma de «في» y otros detalles de modelado frente al navegador (E8). | Aceptarlo para el PR5 y revisarlo con un hablante nativo junto con la revisión de textos (DA20). |
| **D4** | En ar/he, cifras y texto latino de la misma línea van con la familia latina actual (Inter, Playfair) junto a la árabe o hebrea. | Mantenerlo: es el diseño actual y pasa sobre la imagen con el parche. |

## Decisiones rutinarias tomadas

- Woff de Fontsource 5.3.0 (la misma versión y el mismo formato que los actuales). No hizo falta TTF.
- Pesos 400, 500 y 600 en todas las familias nuevas, más la cursiva 400 de Playfair «latin-ext». Las familias árabe y hebrea no tienen cursiva.
- U+202F → U+00A0; quitar U+200E, U+200F y U+061C antes de maquetar.
- Medir el orden visual con el perfil de tinta por columnas, suavizado a 9 columnas, frente a Chromium y con dos controles negativos. La correlación 2D va en el informe, pero es demasiado sensible a 1–2 px de altura en los trazos finos del Naskh.
- El niqqud cuenta como opcional (los textos del catálogo no llevan vocales).

## Cómo reproducir

```bash
npm run test:pdf-fonts                                   # en la CI
node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/pdf-rtl-spike.mts
node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
  --import ./scripts/pdf/textkit-bidi-patch.mjs scripts/pdf-rtl-spike.mts
# salida en node_modules/.cache/pdf-rtl/{motor-actual,con-parche-textkit}/ (PDF, PNG por página,
# recortes de línea, referencias de Chromium, montajes, textos extraídos e informe.json)
```

- **Motor actual:** «✅ comprobaciones en orden · ⛔ 8 bloqueos documentados».
- **Con parche:** 68 ✅ y 4 ❌. Los cuatro son árabe: título 0,900 y párrafo 0,689 por E8; `missingWord` y `flat` por E9.
- `npx tsc --noEmit` y las 26 suites de la CI (incluida `test:pdf-fonts`) en verde.

## Muestras ([`capturas-pr5-spike/`](capturas-pr5-spike/), 876 KB)

| Grupo | Archivos |
| --- | --- |
| Motor actual | `actual-he-vivienda.jpg` (E2: cifras y párrafo corruptos), `actual-he-lineas-pdf-vs-chromium.png`, `actual-ar-minimo-e3.png` («بيت شقة»: PDF arriba y Chromium abajo), `actual-motor-e1-e2-e4.png`, `actual-tr-vivienda.jpg`, `actual-fr-vivienda.jpg` |
| Con parche | `parche-ar-vivienda.jpg`, `parche-ar-indice.jpg`, `parche-ar-lineas-pdf-vs-chromium.png` (cada línea: PDF arriba y Chromium abajo), `parche-he-vivienda.jpg`, `parche-he-lineas-pdf-vs-chromium.png`, `parche-motor-e1-e2-e4.png` |
| PDF | `actual-he.pdf`, `actual-tr.pdf`, `actual-fr.pdf`, `parche-ar.pdf`, `parche-he.pdf` |

## Decisiones de Fabricio (22-10-2026)

| | Decisión |
| --- | --- |
| **D1** | **Corrección local en el repo.** Se mantiene `@react-pdf` 4.5.1. La corrección de E2, E3, E4, E6 y E7 se aplica al cargar el motor: sin tocar `node_modules` ni instalar nada, con una comprobación de versión que falla si la librería cambia sin revisar la corrección. En producción se aplica también al hilo del PDF (loader propio en `next.config`). E1 se corrige en nuestro `fonts.ts`. |
| **D2** | **ActualText.** El PDF guarda el texto original por bloque, para que copiar y buscar den el texto correcto en árabe (y en hebreo). |
| **D3** | **Aceptada** la diferencia de forma de «في» (E8). Queda dentro de la marca «sin revisión nativa» (DA20) y se revisará con un hablante nativo. |
| **D4** | **No aceptada.** Dentro de los textos en árabe y hebreo, las cifras, los precios y el alfabeto latino **no** se fijan a Inter/Playfair. El PR5 propondrá la tipografía concreta, con su cobertura comprobada, antes de cerrarla. |
