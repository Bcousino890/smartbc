# Catálogo · descarga en PDF profesional: especificación

Descargar un catálogo existente como un PDF editorial (dirección Boutique) que refleja exactamente lo que el cliente ve en ese momento en el enlace vivo. **Primera entrega: exportar.** Importar PDF de colaboradores es otra entrega, posterior, que necesita muestras representativas.

- **Tamaño:** grande o sensible: generación en el servidor de producción con fotos reales, **dos rutas nuevas (una pública, por el enlace)** y fuentes incluidas en el repositorio. Sin migración prevista.
- **Responsable:** Fabricio.
- **Estado:** **aprobada** (16 de octubre de 2026): la especificación y la dirección visual Boutique con P1–P10, y la ejecución de T0–T12 con las correcciones K1–K5. **Aprobación visual (P9): dada el 17 de octubre de 2026** sobre el PDF real en producción, tras el merge de #323 (`38d2151`).
- **Base explorada:** `origin/main` = `94b513f` (merge de #322), 16 de octubre de 2026. Solo lectura.
- **Maqueta:** [`maquetas/pdf.html`](maquetas/pdf.html), con las capturas `maqueta-*.png`.

## Contexto

### Lo que ya está decidido (expediente de BCP-01, sin reabrir)

- **D10:** enlace vivo **y** descarga en PDF editorial, que es una **copia fija**.
- **D17:** dirección visual **C · Boutique**: Fraunces y Karla, papel cálido, tinta marrón, portada con arco, fotos enmarcadas y pies en cursiva.
- **D18:** el logo oficial (`public/logo.png`, con `loadLogoDataUri()`) va en la portada y el cierre, en la misma proporción que el lector.
- **Invariantes 7 y 9 de BCP-01:** nunca originales, contactos de colaboradores, notas internas, UUID, URL de almacenamiento ni datos de clientes; **el PDF corresponde a una sola versión**.
- **Criterios:**
  - AC10: el PDF es coherente, completo y con las fuentes incrustadas;
  - AC11: la privacidad del contrato público también vale para el PDF.
- **Verificación prevista (E6, plan de BCP-01):** casos corto y largo, texto por página, índice, descripción completa, fuentes incrustadas (`FontFile`) y caracteres comprobados.
- **E3:** toda exportación respeta las exclusiones, la apertura y los respaldos de portada (la regla única `effectivePhotos`).
- **El plan original de BCP-01 (fase 4)** preveía `@react-pdf/renderer` con `@fontsource/fraunces` y `@fontsource/karla`. Eso no autoriza instalarlos ahora.

### Lo que existe en el código (comprobado en `94b513f`)

| Pieza | Qué hace | ¿Se reutiliza? |
| --- | --- | --- |
| `@react-pdf/renderer` 4.x (dependencia ya instalada) | Genera PDF en Node con paginación automática (`wrap`, `break`, `minPresenceAhead`, cabeceras y pies `fixed`, números de página con `render`, enlaces internos). Ya lo usan `lib/pdf/property-pdf.tsx` (ficha de propiedad), `documento-pdf.tsx` y `candidate-summary-pdf.tsx`. | **Sí**, como motor. |
| `app/api/admin/properties/[slug]/pdf/route.ts` | Ruta del PDF de propiedad: guarda de staff, fotos convertidas a JPEG con `sharp` (las WebP no las lee bien react-pdf) y `renderToBuffer`. | **Sí**, el patrón (fotos → JPEG, `renderToBuffer`, `Content-Disposition`). |
| `lib/pdf/load-logo.ts` | El logo como data URI. | **Sí** (D18). |
| Fuentes del PDF de propiedad | Solo las de serie (Times, Helvetica). | **No**: el catálogo es Fraunces y Karla (D17). |
| `lib/catalogs/fonts.ts` | Fraunces y Karla, pero con `next/font/google` (CSS en el navegador). | **No** sirven para react-pdf, que necesita archivos TTF/WOFF **estáticos** (no variables) registrados con `Font.register`. |
| `lib/catalogs/to-public.ts` → `toPublicCatalog(snapshot, operation)` | La proyección **pública** de la instantánea: lo que ve el cliente (precios por operación, textos vigentes, fotos de E3 por clave, portada con sus respaldos), sin ids ni URL. | **Sí: es la única fuente del PDF.** |
| `lib/catalogs/coherent-read.ts` (`readCoherent`) | Lee versión → instantánea → versión y repite si cambió entre medias. | **Sí**, para capturar un estado coherente. |
| `catalog_internal_snapshot(id)` / `internalSnapshot` (`queries.ts`) | La instantánea del dueño, **sin necesitar enlace** (la HOME ya la usa para las portadas). | **Sí**: el PDF sale aunque el catálogo no tenga enlace activo. |
| `lib/catalogs/journey-layout.ts` | Composición del recorrido en dobles páginas, calibrada para la pantalla. | **Solo las reglas de contenido** (qué va en la apertura, entrada larga, nada se repite ni se pierde). La medida por páginas no sirve para el papel: en el PDF pagina react-pdf. |
| El proxy `/p` y `pickProxyPhoto` (E3) | Sirve la foto exacta de una clave; si no existe, 404 y nunca otra. | **Sí**: el servidor resuelve cada foto por su clave con la misma regla y comprueba su versión (`v`). |
| Páginas del lector (`components/catalogs/reader/pages.tsx`) | Portada con arco, introducción, índice, apertura, recorrido, detalle, ficha breve y cierre. | **Como guion de contenido y estética**, no como código (HTML con CSS y desplazamiento dentro de la página). |
| `playwright` (dependencia de producción) | Chromium sin cabeza para el scraping. El propio código ya trata el caso «Chromium no instalado». | **No se propone**: no hay prueba de que el VPS tenga Chromium y el lector no está pensado para imprimir (ver «Alternativas»). |

### No comprobado

- Si el VPS tiene Chromium instalado, cuánta memoria libre hay, y cuál es el tiempo máximo de respuesta del proxy (nginx) delante de la app. No hay acceso a producción.
- Cuántas fotos y qué tamaños tienen los catálogos reales de Fabricio.

## Decisiones (16 de octubre de 2026, Fabricio)

- **P1. Formato:** A4 vertical, una página por hoja.
- **P2. Fotos por vivienda:** la foto de apertura efectiva, las fotos del recorrido y **hasta seis más** de la galería, **sin repetir ninguna**. Las exclusiones de E3 se respetan en todas partes.
- **P3. Sin la dirección del enlace vivo ni un código QR** dentro del PDF.
- **P4. El dueño** puede descargar también catálogos **archivados** y catálogos **sin enlace activo**.
- **P5. Los clientes** también pueden descargarlo **desde un enlace público válido** de un catálogo disponible. Ya formaba parte del producto pedido: el alcance aprobado **no** es solo para el dueño.
- **P6. Se conserva lo del lector:**
  - la prioridad de textos;
  - la selección y el orden efectivos;
  - la operación del contexto y sus precios;
  - el logo y los respaldos de la portada;
  - el contacto editable del asesor.
- **P7. El índice** lleva números de página correctos y enlaces internos.
- **P8. Si algo resulta difícil, no se cambia el diseño en silencio.** El arco de la portada y los números del índice no se sustituyen ni se quitan sin presentar antes el cambio a Fabricio para que lo apruebe.
- **P9. La aceptación visual final** se hace sobre **PDF reales generados**. Aprobar la maqueta HTML no es la QA final del PDF.
- **P10. Dónde van los botones:**
  - lector público: en el **índice** y en la **página de cierre**;
  - gestor del dueño: en la sección **Compartir** y en el menú **«⋯»**.

## Correcciones a la ejecución (16 de octubre de 2026, Fabricio)

- **K1. La huella describe exactamente lo capturado.** H1 sale de la propia instantánea S1 y de su operación, no de una lectura posterior e independiente. Cubre también los cambios en las fichas y fotos compartidas que no suben `catalogs.version`, incluidos los que pasen entre que se captura la instantánea y se calcula la huella.
- **K2. Generación compartida solo dentro del mismo ámbito** de autorización y del mismo contenido. **Cada petición en espera pasa por su cuenta la comprobación final de acceso** antes de recibir los bytes. Una revocación, una caducidad, un cambio de dueño o una cancelación no filtran resultados ni estropean las demás peticiones autorizadas.
- **K3. El tiempo máximo no libera el turno mientras el trabajo siga consumiendo recursos.** Un `Promise.race` no cancela el renderizado. Hay que cancelar de verdad o retener el turno hasta que el trabajo termine, con la cola acotada y limpiando bien.
- **K4. Todo el contenido publicable,** también las historias más largas que el límite del recorrido en pantalla. No se pierden secciones por reutilizar la paginación de la pantalla. Se prueban una historia larga de varios capítulos y descripciones largas.
- **K5. Verificar las imágenes realmente incrustadas** (sintéticas), no solo los pies de foto ni cuántas hay, para demostrar las exclusiones de E3 y que cada foto es la que toca.

## Alcance (primera entrega: exportar)

1. **Dos formas de descargar,** con autorizaciones separadas:
   - **el dueño:** «Descargar PDF» en el gestor (sección Compartir y menú «⋯»). Funciona aunque el catálogo esté archivado o no tenga enlace activo (P4);
   - **el cliente:** «Descargar en PDF» en el lector del enlace público (`/seleccion/<token>`), solo mientras el enlace sea válido y el catálogo esté disponible (P5). Enlace caducado, revocado o inexistente, o catálogo archivado: 404 sin decir cuál (como el estado público).
   - El archivo se llama `Catálogo · <título> · <fecha>.pdf`.
2. **El contenido es exactamente el público del momento:** `toPublicCatalog` sobre una lectura coherente, **la misma proyección del lector**, sin una segunda regla de prioridad de textos (P6):
   - **Portada:** el logo oficial, el título, la edición, la foto de portada efectiva con sus respaldos (E3-3) **en el arco**, y «Preparada por <contacto>».
   - **Introducción:** la del catálogo, firmada por el contacto del catálogo.
   - **Índice:** las viviendas en su orden efectivo, con su número, título, zona, precio de la operación, «Reservada» y **número de página correcto**. Cada línea es un **enlace interno** a su vivienda (P7).
   - **Cada vivienda:**
     - **apertura:** la foto de apertura efectiva (E3), los datos clave y la operación y el precio que da la proyección pública para la operación del catálogo, exactamente como en el lector (en un catálogo de venta y alquiler, una vivienda dual muestra las dos: «Venta … · Alquiler …»; la proyección no tiene un «También en…» aparte), la entrada y los puntos verificados;
     - **recorrido:** **todas** las secciones publicables, en orden y con su foto, sin el límite de dobles páginas del lector en pantalla (K4). Del lector se conserva una sola regla de reparto: la entrada de más de 45 palabras pasa del principio de la apertura al principio del recorrido;
     - **detalle:** la descripción **completa** vigente y las características;
     - **más fotos:** hasta 6 fotos en uso que no sean ya la apertura ni del recorrido, en el orden de la galería (P2).
   - **Cierre:** el logo, «Hablemos», la tarjeta con el rol, el nombre y el teléfono del contacto del catálogo, y la nota de copia fija. **Sin la dirección del enlace ni un QR** (P3).
3. **Material que falta,** como en el lector y sin inventar:
   - vivienda sin fotos: un marco con «Sin fotos»;
   - sin descripción ni recorrido: la ficha breve;
   - precio desconocido: «Precio · sin dato»;
   - dato desconocido: no se pinta o sale «sin dato», nunca 0;
   - **foto que falla al leerla:** su marco con «Foto no disponible», **nunca otra foto**.
4. **No entra nunca:**
   - notas internas, criterios, modo, grupos de la HOME, anuncios de origen;
   - referencias BC, ids, slugs, claves o versiones de fotos, ni URL (de almacenamiento, del proxy o del enlace);
   - avisos internos ni datos del dueño que no estén en el contacto del catálogo.
   - Tampoco en los metadatos ni en los objetos del PDF.

## Copia fija frente a enlace vivo

- **Un PDF = una versión (P9 de BCP-01).** `catalogs.version` **no basta**: no sube cuando cambian las fichas o las fotos compartidas de las propiedades (precio, textos, fotos). Por eso se usan dos comprobaciones:
  1. **Lectura coherente** (`readCoherent`): versión → instantánea → versión, para que la operación del contexto corresponda a la instantánea capturada **S1**.
  2. **La huella H1 se calcula de la propia S1 y su operación** (un resumen canónico del contenido capturado), nunca con otra lectura posterior (K1). Así no hay ningún hueco entre capturar y calcular la huella.
  3. **Antes de responder** se vuelve a capturar (S2, con la misma lectura coherente) y su huella H2 se compara con H1. Como la instantánea lleva los datos de las propiedades y la versión de cada foto, esto detecta también los cambios en fichas y fotos compartidas que no suben `catalogs.version`. Si cambió, se repite todo una vez; si sigue cambiando, no se genera y sale «El catálogo está cambiando; vuelve a intentarlo».
  - **Cada foto** se resuelve por su clave y se comprueba que su versión (`v`, derivada de su URL) es la de la instantánea. Si no coincide, la instantánea ya no vale y se repite.
  - **Límite conocido** (corrección 5 de E3): un archivo sustituido **en la misma URL** no cambia la versión y no se detecta. Queda documentado y no se amplía aquí.
  - Así el PDF nunca mezcla dos versiones.
- **La portadilla y el cierre dicen** «Versión del 16 de octubre de 2026, 19:40». En el cierre, en lugar del «se actualiza sola» del lector: «Este documento es una copia fija. La selección en línea puede haber cambiado desde entonces.»
- **Generar el PDF no cambia nada:** ni el catálogo, ni su versión, ni su huella, ni el enlace, ni avisa a los lectores.
- **No se guarda ningún PDF en el servidor ni se reutiliza entre personas o enlaces:**
  - las respuestas van con `Cache-Control: private, no-store`, `Content-Disposition: attachment`, `X-Robots-Tag: noindex` y `Referrer-Policy: no-referrer`;
  - dos peticiones iguales a la vez (el mismo ámbito, es decir, el mismo enlace o el mismo dueño y catálogo, con la misma huella) comparten una sola generación en curso, y nada más;
  - **cada una pasa por su cuenta la comprobación final** de acceso y de huella antes de recibir los bytes (K2). Que una se cancele no aborta el trabajo de las demás.
- **La autorización se vuelve a comprobar antes de responder.** Si el enlace caducó o se revocó, o el catálogo dejó de estar disponible mientras se generaba (o el dueño dejó de serlo), no se entrega el PDF.

## Composición (dirección aprobada; la QA final es sobre PDF reales, P9)

- **Formato y estilo:**
  - A4 vertical, una página por hoja (P1), con márgenes de 18 mm;
  - papel cálido `#f4ede1`, tinta `#2b2118` y acento `#9b4a2e`;
  - Fraunces para los títulos y los pies en cursiva, y Karla para el texto (D17);
  - las fuentes van **incluidas en el repositorio**, con su licencia; el PDF **no depende de Google Fonts** al generarse.
- **Texto:**
  - cuerpo de 10,5 pt con interlineado de 1,5;
  - **nunca se corta**: un texto largo sigue en la página siguiente, con una cabecera de continuación («nº 03 · Piso señorial… — continuación»);
  - ningún título se queda solo al pie y ninguna foto se parte.
- **Folios** al pie («Salamanca y Chamberí · 7»), salvo en la portada.
- **Índice:**
  - con números de página **correctos** (P7). Se calculan en dos pasadas, y la segunda se comprueba con la primera;
  - si una lista no cabe en una página, sigue en la siguiente con «Índice (continuación)»;
  - cada línea es un enlace interno a su vivienda.
- **Vivienda (en orden):**
  1. **Apertura,** en una página: la foto de apertura enmarcada (de la mitad a dos tercios de la página), el número y el título, la zona, el precio y la operación, «Reservada», los datos clave (m², dormitorios, baños, planta), la entrada y hasta 3 puntos.
  2. **Recorrido:** cada sección con su título (si viene de una historia aprobada), su texto y su foto encima o al lado, según la orientación (vertical al lado, horizontal encima). Las secciones fluyen en orden y nunca se repiten.
  3. **«La vivienda en detalle»:** la descripción completa y las características en dos columnas, si caben.
  4. **Más fotos:** una rejilla de 2 × 2 o 2 × 3 fotos por página, hasta 6 fotos (P2), con su pie («Foto 4 de 12»).
  5. Cada vivienda empieza en página nueva.
- **Portada:** el logo arriba (44 % del ancho), las etiquetas (selección privada, edición), **el arco con la foto**, el título en Fraunces cursiva y «Preparada por …».
  - El arco del lector es un marco con la parte superior completamente redondeada (`border-radius: 999px 999px 4px 4px`), y se reproduce igual en react-pdf.
  - Si al comprobarlo no saliera fiel, se presenta el cambio a Fabricio antes de aplicarlo (P8).
- **Cierre:** el logo (52 %), «Hablemos», la tarjeta del contacto (con el teléfono en texto, también enlazado como `tel:`), la nota de copia fija y el ornamento ✦.

## Alternativas consideradas

- **Imprimir el lector con Chromium (Playwright `page.pdf`):**
  - **ventajas:** reutilizaría el CSS y las fuentes tal cual;
  - **inconvenientes:**
    - el lector está pensado para la pantalla: tiene páginas de alto fijo y textos que **se desplazan dentro de la página**, que impresos saldrían **cortados**, así que haría falta otra hoja de estilos de impresión completa;
    - **no está demostrado que el VPS tenga Chromium**: instalarlo y ejecutarlo en el mismo servidor de la web pesa cientos de MB de memoria por PDF.
  - **No se propone.**
- **Un servicio externo de PDF:** de pago y fuera de lo autorizado. **Descartado.**
- **react-pdf (elegido):**
  - **ventajas:** ya está en el proyecto y en producción; pagina solo, sin cortar texto; incrusta las fuentes; no necesita navegador.
  - **Coste:** rehacer la maquetación en sus componentes (no reutiliza el CSS del lector) y tener las fuentes como archivos.

## Dependencias, alojamiento y coste

- **No hace falta ningún servicio de pago nuevo** ni IA. Eso no quiere decir que no cueste recursos: cada PDF consume CPU, memoria y red en el mismo VPS que la web, y eso se mide y se acota (ver el plan).
- **Lo que se reutiliza:** `@react-pdf/renderer` y `sharp` (ya instalados y en producción), `toPublicCatalog`, `readCoherent`, `pickProxyPhoto`, `loadLogoDataUri` y el limitador por token.
- **Una descarga explícita, sin dependencia nueva en tiempo de ejecución:** los archivos de Fraunces (normal, cursiva y seminegrita) y Karla (normal y seminegrita) en formato estático, con su licencia SIL OFL 1.1, se copian **al repositorio**. Necesita la autorización del plan.
- **Herramientas de verificación gratuitas, sin instalar nada:** PDFKit de macOS (con `swift`) para pasar las páginas a imagen, extraer el texto por página y leer los enlaces, y un script sin dependencias para revisar los objetos del PDF (fuentes incrustadas, URI y metadatos).

## Criterios de aceptación

| # | Criterio |
| --- | --- |
| PDF1 | El PDF lleva el título, la introducción, la edición, el logo oficial (portada y cierre, en su proporción), la portada efectiva y el contacto del catálogo, idénticos a los del enlace en el mismo momento. |
| PDF2 | Las viviendas y su orden, los precios por operación («Reservada», «sin dato», y las dos operaciones de una dual en un catálogo de venta y alquiler) y los textos vigentes son exactamente los de `toPublicCatalog` sobre la misma lectura coherente. Lo comprueba una prueba que compara el texto extraído del PDF con la proyección. |
| PDF3 | Fotos (E3): ninguna foto excluida aparece; la apertura y la portada son las efectivas, con sus respaldos; una foto ilegible deja su marco «Foto no disponible» y nunca otra. |
| PDF4 | Privacidad: ni en el texto, ni en los enlaces, ni en los metadatos del PDF aparecen ids, claves, slugs, URL de almacenamiento o del proxy, referencias BC, criterios, grupos, anuncios de origen, notas ni avisos internos. Se comprueba con el texto extraído y los objetos del PDF. |
| PDF5 | Nada se corta: la descripción completa más larga sintética sale entera (se compara palabra por palabra), con las continuaciones marcadas; ningún título queda solo al pie. |
| PDF6 | El índice tiene las páginas correctas y enlaces que llevan a cada vivienda. |
| PDF7 | Las fuentes Fraunces y Karla están incrustadas (`FontFile`) y los caracteres españoles (á, é, í, ó, ú, ñ, ü, ¿, ¡, «, », €, ², º, ª, ·, —) se pintan con su glifo y se extraen bien. «nº» no pasa a «NO» en las mayúsculas de las etiquetas (la maqueta lo destapó). |
| PDF8 | Una sola versión: un cambio en el catálogo durante la generación da un PDF entero de una versión o un error claro, nunca una mezcla. Generar no cambia el catálogo, su versión ni su huella, y no avisa a los lectores. |
| PDF9 | Material que falta: sin fotos, sin descripción y sin precio, se ve como en el lector, sin inventar. |
| PDF10 | **Dueño:** solo el dueño de la HOME, también con el catálogo archivado o sin enlace; un catálogo ajeno o inexistente da 404. **Cliente:** solo con un enlace válido de un catálogo disponible; caducado, revocado, inexistente o archivado dan 404 sin decir cuál. Si la autorización cambia mientras se genera, no se entrega el PDF. |
| PDF13 | Ninguna respuesta se guarda en cachés compartidas ni se reutiliza entre personas o enlaces (`private, no-store`). Las peticiones repetidas, las concurrentes y las que fallan quedan acotadas (cola, límite por enlace, tiempo máximo) sin dejar nada en el servidor. |
| PDF14 | Fotos por vivienda: la apertura, las del recorrido y hasta 6 más, sin repetir, y sin ninguna excluida (P2). Se demuestra **identificando cada imagen incrustada** en el PDF (fotos sintéticas con un código visual propio), no por los pies ni por cuántas hay (K5). |
| PDF16 | Todo el contenido publicable: una historia de muchos capítulos (más que el recorrido en pantalla) y una descripción larga salen enteras en el PDF (K4). |
| PDF15 | El PDF no contiene la dirección del enlace vivo ni un QR (P3). |
| PDF11 | Casos corto (1 vivienda) y largo (24 viviendas, textos largos y muchas fotos): se generan dentro de los límites de tiempo, memoria y tamaño que se fijen **después de medirlos** (se presentan a Fabricio antes de publicar). |
| PDF12 | El aspecto (dirección C · Boutique) lo aprueba Fabricio sobre **PDF reales generados** con datos sintéticos y, después del despliegue, con un catálogo real suyo. La maqueta HTML no cuenta como QA final (P9). |

## Fuera de esta entrega

- **Importar PDF de colaboradores** (extraer datos y fotos a fichas revisables): es la entrega siguiente y necesita **muestras representativas** de Fabricio (digitales, escaneados y mixtos; una y varias viviendas).
- Enviar el PDF por correo o WhatsApp desde el CRM, guardar el historial de PDF generados, marcas de agua o firmas.
- Cambios en el lector, el gestor o la HOME, más allá del botón.

## Decisiones pendientes

- Dónde van los botones: **decidido** (P10).
- **Condicionales:** solo se plantearán si lo exige la medición o la comprobación técnica (P8):
  - un límite de tamaño o de fotos más estricto que P2 para catálogos muy grandes;
  - un cambio en el arco de la portada o en el índice.

## Riesgos

- **El arco de la portada en react-pdf:** se comprueba primero, en T1. Si no sale fiel, se presenta a Fabricio antes de cambiar nada (P8).
- **Carga del servidor, sobre todo con la descarga pública:** CPU y memoria en el VPS compartido con la web. Se acota con una cola, un límite por enlace, tiempos máximos y fotos reducidas, y **se mide** antes de fijar los límites.
- **Tiempo máximo del proxy del VPS:** no comprobado; un PDF grande podría cortarse. Se mide en local y se revisa en la QA.
- **El índice en dos pasadas:** se comprueba primero, en T1. Si no fuera fiable, se presenta otra solución a Fabricio, sin quitar los números de página por nuestra cuenta (P8).
- **Fidelidad frente al lector:** el PDF no reutiliza el CSS del lector, así que pueden verse diferencias menores de composición. El contenido sí es el mismo (PDF2), y la estética la aprueba Fabricio (PDF12).
- **Fotos de origen pesadas o en formatos raros:** se convierten con `sharp` como en el PDF de propiedad; si falla una, sale «Foto no disponible».

## Aprobación

- **16 de octubre de 2026:** Fabricio aprueba la especificación y la dirección visual Boutique para planificar, con P1–P9.
- **16 de octubre de 2026:** Fabricio aprueba la ejecución de T0–T12 con P10 (sitio de los botones) y las correcciones K1–K5.
  - **Autoriza:** comprobar `main` y rebasar; `npm ci` con el lockfile existente y sin paquetes nuevos; descargar los archivos de fuentes estáticas aprobados, con su licencia y su procedencia; entorno aislado sin `.env*` ni credenciales heredadas; Postgres temporal sintético si hace falta; el Chromium ya disponible; pruebas sintéticas, inspección de PDF reales, mediciones, commits, push, PR y CI.
  - **No autoriza:** producción, credenciales, escrituras reales, IA real, migraciones, dependencias nuevas ni revisión adicional de Codex.
- **17 de octubre de 2026 (informe de Fabricio, después del merge de #323, `38d2151`):**
  - la descarga funciona en producción;
  - **aprueba el aspecto del PDF real** (portada, fotos, índice, texto completo y contacto): P9 y PDF12 quedan cumplidos;
  - la mejora del rendimiento va en una tarea aparte, solo para planificar: [`2026-10-17-bcp-01-pdf-worker`](../2026-10-17-bcp-01-pdf-worker/spec.md).
