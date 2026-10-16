# Catálogo · descarga en PDF profesional: especificación

Descargar un catálogo existente como un PDF editorial (dirección Boutique) que refleja exactamente lo que el cliente ve en ese momento en el enlace vivo. **Primera entrega: exportar.** Importar PDF de colaboradores es otra entrega, posterior, que necesita muestras representativas.

- **Tamaño:** grande o sensible (propuesta): generación en el servidor de producción con fotos reales, una ruta nueva con datos de clientes potenciales y quizá dependencias de fuentes. Sin migración prevista.
- **Responsable:** Fabricio.
- **Estado:** **borrador**. No está aprobado; no autoriza plan, implementación, instalaciones ni PR.
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
| `@react-pdf/renderer` 4.x (dependencia ya instalada) | Genera PDF en Node con paginación automática (`wrap`, `break`, `minPresenceAhead`, cabeceras y pies `fixed`, números de página con `render`, enlaces internos). Ya lo usan `lib/pdf/property-pdf.tsx` (ficha de propiedad), `documento-pdf.tsx` y `candidate-summary-pdf.tsx`. | **Sí**, como motor (propuesta). |
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

## Alcance propuesto (primera entrega: exportar)

1. **Un botón «Descargar PDF»** en el gestor del catálogo, en la sección Compartir y en el menú «⋯».
   - Solo el dueño de la HOME.
   - Genera y descarga `Catálogo · <título> · <fecha>.pdf`.
2. **El contenido es exactamente el público del momento**, con `toPublicCatalog` sobre una lectura coherente:
   - **Portada:** el logo oficial, el título, la edición, la foto de portada elegida o su respaldo (E3-3) en el arco, y «Preparada por <contacto>».
   - **Introducción:** la del catálogo, firmada por el contacto del catálogo.
   - **Índice:** las viviendas en su orden efectivo, con su número, título, zona, precio de la operación, «Reservada» y la página. Cada línea enlaza a su vivienda.
   - **Cada vivienda:**
     - **apertura:** la foto de apertura efectiva (E3), los datos clave y el precio de la operación (con «También en alquiler…» si aplica, como en el lector), la entrada y los puntos verificados;
     - **recorrido:** las secciones publicables en orden, cada una con su foto si la tiene;
     - **detalle:** la descripción **completa** vigente (la misma regla que el lector: el texto publicado del catálogo, si no la descripción limpia, si no nada) y las características verificadas;
     - **galería:** una selección de fotos según la decisión pendiente 2.
   - **Cierre:** el logo, «Hablemos», la tarjeta con el rol, el nombre y el teléfono del contacto editable del catálogo, y la nota de versión (ver «Copia fija»).
3. **Material que falta,** como en el lector y sin inventar:
   - vivienda sin fotos: un marco con «Sin fotos»;
   - sin descripción ni recorrido: la ficha breve con los datos y las características;
   - precio desconocido: «Precio · sin dato»;
   - dato desconocido: no se pinta o sale «sin dato», nunca 0;
   - **foto que no se puede leer en el momento:** su marco con «Foto no disponible»; **nunca otra foto en su lugar**.
4. **No entra nunca:**
   - notas internas, criterios, modo, grupos de la HOME, anuncios de origen o sus códigos;
   - referencias BC, ids, slugs, claves de fotos o URL (de almacenamiento, del proxy o del enlace vivo, ver la pendiente 3);
   - avisos internos del gestor (por ejemplo «falta precio principal») y datos del dueño que no estén en el contacto del catálogo.
   - Los metadatos del PDF tampoco: título = título del catálogo, autor = «Benjamín Cousiño Propiedades», sin ids.

## Copia fija frente a enlace vivo

- **Un PDF = una versión:**
  - el servidor lee `versión → instantánea → versión` (`readCoherent`) y, si cambió entre medias, repite (hasta 3 veces). Si no se estabiliza, no genera y dice «El catálogo está cambiando; vuelve a intentarlo»;
  - las fotos se descargan **antes** de componer, por su clave, y se comprueba que su versión (`v`) es la de la instantánea. Si una foto cambió de archivo entre medias, se vuelve a leer todo una vez; si sigue cambiando, falla con el mismo mensaje.
  - Así el PDF nunca mezcla dos versiones.
- **La portadilla y el cierre dicen** «Versión del 16 de octubre de 2026, 19:40». En el cierre, en lugar del «se actualiza sola» del lector: «Este documento es una copia fija. La selección en línea puede haber cambiado desde entonces.»
- **Generar el PDF no cambia nada:** ni el catálogo, ni su versión, ni su huella, ni el enlace, ni avisa a los lectores. No se guarda el PDF en el servidor (propuesta; ver «Riesgos»).

## Composición (propuesta visual; ver la maqueta)

- **Formato:** A4 vertical, márgenes de 18 mm, papel cálido `#f4ede1`, tinta `#2b2118`, acento `#9b4a2e`, Fraunces para títulos y pies en cursiva, Karla para el texto (D17). Es una página por hoja, como el lector en el móvil: se lee en pantalla y se imprime bien. A4 horizontal a doble página es la alternativa de la pendiente 1.
- **Texto:** cuerpo de 10,5 pt con interlineado de 1,5. **Nunca se corta**: un texto largo sigue en la página siguiente, y la continuación lleva una cabecera discreta («nº 03 · Piso señorial… — continuación»). Un título nunca se queda solo al pie (`minPresenceAhead`) y una foto nunca se parte.
- **Folios** al pie («Salamanca y Chamberí · 7»), salvo en la portada.
- **Índice:**
  - con número de página. Se calcula en dos pasadas: una primera composición anota en qué página empieza cada vivienda y la segunda los escribe (técnica habitual con react-pdf, a confirmar en el plan);
  - si una lista no cabe en una página, sigue en la siguiente con «Índice (continuación)»;
  - cada línea es un enlace interno a su vivienda.
- **Vivienda (en orden):**
  1. **Apertura,** en una página: la foto de apertura enmarcada (de la mitad a dos tercios de la página), el número y el título, la zona, el precio y la operación, «Reservada», los datos clave (m², dormitorios, baños, planta), la entrada y hasta 3 puntos.
  2. **Recorrido:** cada sección con su título (si viene de una historia aprobada), su texto y su foto encima o al lado, según la orientación (vertical al lado, horizontal encima). Las secciones fluyen en orden y nunca se repiten.
  3. **«La vivienda en detalle»:** la descripción completa y las características en dos columnas, si caben.
  4. **Galería:** una rejilla de 2 × 2 o 2 × 3 fotos por página, con su pie («Foto 4 de 12»), según la decisión pendiente 2.
  5. Cada vivienda empieza en página nueva.
- **Portada:** el logo arriba (44 % del ancho), las etiquetas (selección privada, edición), el arco con la foto, el título en Fraunces cursiva y «Preparada por …». **Riesgo técnico:** recortar la foto en arco con react-pdf (SVG `ClipPath`) se comprueba al empezar el plan. Si no se puede, se usa un marco con la parte superior redondeada, que se ve casi igual.
- **Cierre:** el logo (52 %), «Hablemos», la tarjeta del contacto (con el teléfono en texto, también enlazado como `tel:`), la nota de copia fija y el ornamento ✦.

## Alternativas consideradas

- **Imprimir el lector con Chromium (Playwright `page.pdf`):**
  - **ventajas:** reutilizaría el CSS y las fuentes tal cual;
  - **inconvenientes:**
    - el lector está pensado para la pantalla: tiene páginas de alto fijo y textos que **se desplazan dentro de la página**, que impresos saldrían **cortados**, así que haría falta otra hoja de estilos de impresión completa;
    - **no está demostrado que el VPS tenga Chromium**: instalarlo y ejecutarlo en el mismo servidor de la web pesa cientos de MB de memoria por PDF.
  - **No se propone.**
- **Un servicio externo de PDF:** de pago y fuera de lo autorizado. **Descartado.**
- **react-pdf (propuesta):**
  - **ventajas:** ya está en el proyecto y en producción; pagina solo, sin cortar texto; incrusta las fuentes; no necesita navegador.
  - **Coste:** rehacer la maquetación en sus componentes (no reutiliza el CSS del lector) y tener las fuentes como archivos.

## Dependencias, alojamiento y coste

- **Fuentes:** hacen falta Fraunces (normal, cursiva y negrita) y Karla (normal y negrita) como archivos estáticos (TTF o WOFF). Las dos son gratuitas (SIL OFL 1.1). Opciones:
  - **a) `@fontsource/fraunces` y `@fontsource/karla`** (paquetes npm gratuitos, ya previstos en el plan original). Antes de instalarlos se comprueban la versión y la licencia;
  - **b) copiar al repositorio los TTF estáticos** de Google Fonts (unos 300–600 kB), con su licencia OFL.
  - Propuesta: **b)**, sin paquetes nuevos. Lo decide el plan, no hace falta que lo decida Fabricio.
- **Sin servicios externos, sin IA y sin coste.** Se genera en el mismo proceso Node del VPS.
- **Cargas en el servidor:**
  - una generación lee de 1 a 24 viviendas y sus fotos, las convierte con `sharp` y compone. Se estima entre segundos y algunas decenas de segundos y unos cientos de MB de memoria en el pico, **a medir** en el plan con datos sintéticos de tamaño real;
  - medidas propuestas: **un PDF a la vez** (cola de uno), fotos de 1.400 px en JPEG a calidad 75 y un límite de fotos por vivienda (pendiente 2);
  - si el proxy del VPS corta las peticiones largas (no comprobado), se ve en la QA y se ajusta (fotos más pequeñas o generación en dos pasos).
- **Tamaño del archivo:** el objetivo es menos de 15 MB para un catálogo de 12 viviendas con la galería propuesta. Se mide.

## Criterios de aceptación (propuesta)

| # | Criterio |
| --- | --- |
| PDF1 | El PDF lleva el título, la introducción, la edición, el logo oficial (portada y cierre, en su proporción), la portada efectiva y el contacto del catálogo, idénticos a los del enlace en el mismo momento. |
| PDF2 | Las viviendas y su orden, los precios por operación («Reservada», «sin dato», «También en…») y los textos vigentes son exactamente los de `toPublicCatalog` sobre la misma lectura coherente. Lo comprueba una prueba que compara el texto extraído del PDF con la proyección. |
| PDF3 | Fotos (E3): ninguna foto excluida aparece; la apertura y la portada son las efectivas, con sus respaldos; una foto ilegible deja su marco «Foto no disponible» y nunca otra. |
| PDF4 | Privacidad: ni en el texto, ni en los enlaces, ni en los metadatos del PDF aparecen ids, claves, slugs, URL de almacenamiento o del proxy, referencias BC, criterios, grupos, anuncios de origen, notas ni avisos internos. Se comprueba con el texto extraído y los objetos del PDF. |
| PDF5 | Nada se corta: la descripción completa más larga sintética sale entera (se compara palabra por palabra), con las continuaciones marcadas; ningún título queda solo al pie. |
| PDF6 | El índice tiene las páginas correctas y enlaces que llevan a cada vivienda. |
| PDF7 | Las fuentes Fraunces y Karla están incrustadas (`FontFile`) y los caracteres españoles (á, é, í, ó, ú, ñ, ü, ¿, ¡, «, », €, ², º, ª, ·, —) se pintan con su glifo y se extraen bien. «nº» no pasa a «NO» en las mayúsculas de las etiquetas (la maqueta lo destapó). |
| PDF8 | Una sola versión: un cambio en el catálogo durante la generación da un PDF entero de una versión o un error claro, nunca una mezcla. Generar no cambia el catálogo, su versión ni su huella, y no avisa a los lectores. |
| PDF9 | Material que falta: sin fotos, sin descripción y sin precio, se ve como en el lector, sin inventar. |
| PDF10 | Solo el dueño de la HOME puede generarlo; un catálogo ajeno o inexistente da 404. |
| PDF11 | Casos corto (1 vivienda) y largo (24 viviendas, textos largos y muchas fotos): se generan dentro del tiempo y del tamaño medidos y acordados en el plan. |
| PDF12 | El aspecto (dirección C · Boutique) lo aprueba Fabricio sobre PDF reales generados con datos sintéticos y, después del despliegue, con un catálogo real suyo. |

## Fuera de esta entrega

- **Importar PDF de colaboradores** (extraer datos y fotos a fichas revisables): es la entrega siguiente y necesita **muestras representativas** de Fabricio (digitales, escaneados y mixtos; una y varias viviendas).
- Enviar el PDF por correo o WhatsApp desde el CRM, guardar el historial de PDF generados, marcas de agua o firmas.
- Un PDF para clientes desde el enlace vivo, salvo que lo decida la pendiente 4.
- Cambios en el lector, el gestor o la HOME, más allá del botón.

## Decisiones pendientes (de Fabricio)

1. **Formato:** **A4 vertical**, página a página (propuesta), o A4 horizontal a doble página, más parecido al libro del lector en el ordenador.
2. **Fotos por vivienda:** no se da por hecho que entre toda la galería.
   - **a)** la apertura, las fotos del recorrido y **hasta 6 más** de la galería en orden (propuesta);
   - **b)** todas las fotos en uso (E3), que puede dar archivos de 30–60 MB con catálogos grandes;
   - **c)** solo la apertura y las del recorrido.
3. **El enlace vivo en el PDF:** ¿se incluye la dirección (y/o un código QR) del enlace en el cierre? Propuesta: **no**. El PDF circula sin control, el enlace puede revocarse o caducar, y el token es un acceso.
4. **Quién lo descarga:** **solo el dueño desde el gestor** (propuesta), o también los clientes desde el enlace vivo.
5. **Catálogos archivados o sin enlace activo:** ¿se pueden descargar? Propuesta: **sí**, porque el PDF es una herramienta del dueño y no depende del enlace.

## Riesgos

- **El arco de la portada en react-pdf** (`ClipPath` con una imagen): si no sale bien, se usa el marco de arriba redondeado.
- **Carga del servidor:** CPU y memoria en el VPS compartido con la web. Se mitiga con un PDF a la vez, fotos reducidas y un límite de fotos, y **se mide** antes de publicar.
- **Tiempo máximo del proxy del VPS:** no comprobado; un PDF grande podría cortarse. Se mide en local y se revisa en la QA.
- **Calibrar el índice en dos pasadas:** si no fuera fiable, el índice va sin número de página pero con enlaces y la numeración «nº 01…».
- **Fidelidad frente al lector:** el PDF no reutiliza el CSS del lector, así que pueden verse diferencias menores de composición. El contenido sí es el mismo (PDF2), y la estética la aprueba Fabricio (PDF12).
- **Fotos de origen pesadas o en formatos raros:** se convierten con `sharp` como en el PDF de propiedad; si falla una, sale «Foto no disponible».

## Aprobación

Pendiente. Con las decisiones 1–5 y la aprobación de esta especificación y de la maqueta, se preparará `plan.md`. Esta especificación no permite implementar.
