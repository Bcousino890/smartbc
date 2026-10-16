# Catálogo · descarga en PDF profesional: plan

**Especificación:** [`spec.md`](spec.md), aprobada para planificar el 16 de octubre de 2026, con P1–P9.

- **Rama:** `fabri/bcp-01-pdf`, en el worktree `wt/bcp-01-pdf`, solo local.
- **Estado:** **borrador para revisión.** No autoriza implementar, instalar, descargar recursos, arrancar servicios, hacer push ni abrir un PR.

## Base

- **`origin/main` = `94b513f`** (merge de #322), comprobado con `git fetch` el 16 de octubre de 2026. La rama sale de ahí; por ahora solo lleva documentación: la aceptación de #322 y esta especificación y este plan.
- **Sin migración.** La última es `0207`. Si al ejecutar hiciera falta una, se comprueba el número libre, también en los PR abiertos.
- **Si `main` avanza:** rebase y vuelta a comprobar antes de implementar y antes de publicar.

## Pasos de entorno que autoriza el plan (cuando se apruebe)

1. `git fetch` y rebase si hace falta; `npm ci` con el lockfile existente, **sin paquetes nuevos**.
2. **Descarga única de las fuentes** (la única descarga nueva):
   - archivos estáticos de Fraunces (normal, cursiva y seminegrita) y Karla (normal y seminegrita), desde sus repositorios oficiales (Google Fonts / proyectos upstream), con su licencia SIL OFL 1.1;
   - se guardan en `lib/pdf/fonts/` con `OFL.txt` y un `README` con su origen, versión y sha256;
   - **no se añade ninguna dependencia en tiempo de ejecución** ni se llama a Google Fonts al generar.
   - Se prefieren TTF estáticos. Si upstream solo diera fuentes variables (react-pdf no las admite), se usan las instancias estáticas que publica Fontsource (WOFF, con la misma licencia), comprobando antes en T1 que react-pdf las lee.
3. **Postgres 16 temporal y sintético** (`run-local.sh`), solo si alguna tarea lo necesita (la lectura del dueño usa funciones que ya existen).
4. **Copia aislada** (`iso.sh`, sin `.env*`) y servidor de fixtures en `127.0.0.1:3137`.
5. **Chromium ya en caché** para las pruebas de interfaz, con la red bloqueada.
6. **Verificación de los PDF sin instalar nada:**
   - **PDFKit de macOS** con `swift`: páginas a PNG, texto por página, enlaces y sus destinos;
   - **un script en Python sin dependencias** (`zlib`): objetos del PDF (fuentes incrustadas, URI, metadatos, texto de los flujos).

**No se autoriza** acceso a producción, credenciales, escrituras reales, IA real ni revisión adicional de Codex.

## Diseño técnico

### Una sola fuente de contenido

- **El contenido sale de `toPublicCatalog`,** la misma proyección del lector: prioridad de textos, precios por operación, selección y orden, «Reservada», portada y sus respaldos, y contacto (P6).
- **Qué va en la apertura, el recorrido y el detalle** lo deciden las mismas reglas de contenido de `itemLayout` (`journey-layout.ts`). No se usa su medida por páginas: en el PDF pagina react-pdf.
- **El reparto de fotos (P2)** es una función pura:
  - **orden:** apertura efectiva → fotos de las secciones del recorrido, en orden → hasta 6 más, en el orden de la galería;
  - **sin repetir** (por clave);
  - solo fotos de `photos`, que ya excluye las de E3.

### Lectura coherente y fija (dos accesos separados)

- **Dueño** (`/api/admin/catalogos/[id]/pdf`):
  - guarda de la HOME (`isHomeOwner`) y catálogo suyo; si no, 404;
  - lee con `readCoherent`: la versión y la operación de `catalogs` → `catalog_internal_snapshot(id)` → la versión otra vez;
  - la huella, con `catalog_public_fingerprint(actor, id)`;
  - **funciona con catálogos archivados y sin enlace** (P4).
- **Cliente** (`/api/seleccion/[token]/pdf`):
  - `isShareToken` y el mismo camino que el estado público (`rawPublic` + `shareMetas` con `readCoherent`);
  - **solo con un enlace válido y un catálogo disponible**; si no, 404 sin decir por qué (P5).
- **Para los dos,** una función que devuelve la proyección pública, la instantánea interna (para resolver las fotos), la operación y la huella. Se exporta desde `public-data.ts` **sin cambiar el comportamiento** de `getPublicCatalogState`.
- **Por qué no basta `catalogs.version`:** no sube cuando cambian las fichas o las fotos compartidas. La **huella** (md5 de la instantánea completa, con la operación) sí lo cubre. El orden es:
  1. lectura coherente → instantánea **S1** y huella **H1**;
  2. **resolver y descargar** las fotos necesarias, por su clave, comprobando que la versión (`v`, derivada de la URL) es la de S1. Si una no coincide, la instantánea ya no vale: se vuelve al paso 1;
  3. componer el PDF (en memoria);
  4. **antes de responder,** volver a comprobar el acceso y la huella:
     - dueño: sigue siendo dueño y la huella sigue siendo H1;
     - cliente: el enlace sigue siendo válido y la huella sigue siendo H1;
     - si cambió el contenido, se repite **una vez**; si vuelve a cambiar, 409 «El catálogo está cambiando; vuelve a intentarlo»;
     - si cambió el acceso (enlace revocado o caducado, catálogo archivado para el cliente, o ya no es el dueño), **no se entrega**: 404.
  - **Límite documentado** (corrección 5 de E3): un archivo sustituido en la misma URL no cambia `v` y no se detecta.

### Fotos: la misma imagen que ve el lector

- **Una función compartida.** La elección del proxy `/p` (`pickProxyPhoto` por clave y la variante sin marca de Mobilia `-original.jpg`, con caída a la normal) **se extrae** a `lib/catalogs/photo-resolve.ts` y la usan el proxy y el PDF. El proxy no cambia de comportamiento; lo vigilan sus pruebas y `e3.mjs`.
- **Descarga:**
  - con tiempo máximo por foto y pocas descargas en paralelo, que se fijan midiendo;
  - `sharp` → JPEG (react-pdf no lee bien WebP), con tamaños por uso: apertura y portada más grandes, recorrido intermedio y «más fotos» menor. Las cifras se fijan midiendo;
  - si una foto falla: «Foto no disponible», **nunca otra**.

### Documento (react-pdf)

- **Fuentes:** `Font.register` con los archivos del repositorio, con normal, cursiva y seminegrita. Una comprobación de glifos para los caracteres de PDF7 (`á é í ó ú ñ ü ¿ ¡ « » € ² º ª · —`), y «nº» sin pasar a mayúsculas en las etiquetas.
- **Portada:** el arco es un marco con la parte superior redondeada al máximo, igual que el lector, mediante el redondeo de bordes de react-pdf. **Se comprueba en T1.** Si no sale fiel, se para y se presenta a Fabricio (P8).
- **Índice con números de página correctos (P7):**
  - cada vivienda lleva un ancla (`id`) y cada línea del índice, un enlace interno;
  - **dos pasadas:** la primera anota en qué página empieza cada vivienda (con `render` y `pageNumber`), y la segunda escribe esos números;
  - se exige que una tercera lectura (la del texto extraído del PDF) coincida;
  - **se comprueba en T1.** Si no es fiable, se para y se presenta a Fabricio (P8).
- **Paginación:** texto con `wrap`, cabeceras de continuación `fixed` por vivienda, `minPresenceAhead` para no dejar títulos solos al pie, fotos sin partir y folio al pie.
- **Metadatos:** título = título del catálogo, autor = «Benjamín Cousiño Propiedades». Sin ids ni URL. Sin la dirección del enlace ni un QR (P3).

### Respuesta, caché y recursos

- **Cabeceras:** `Content-Type: application/pdf`, `Content-Disposition: attachment` con el nombre saneado, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` y `Referrer-Policy: no-referrer`.
- **Nada se guarda en disco ni se reutiliza** entre personas o enlaces.
- **Generaciones iguales a la vez se comparten:** la clave es el ámbito (enlace, o dueño y catálogo) más la huella. Se libera al terminar.
- **Límites** (valores de partida, **a fijar después de medir en T10**):
  - **concurrencia global:** 1 generación a la vez en el proceso;
  - **cola:** unas pocas peticiones esperando, con un tiempo máximo de espera. Pasado ese tiempo, 503 «Ahora mismo se está preparando otro PDF; inténtalo en un momento», con `Retry-After`;
  - **límite por enlace** con el limitador existente (`createRateLimiter`), unas pocas por minuto, y otro por dueño;
  - **tiempo máximo total** de una generación; al cumplirse se aborta y se liberan los búferes;
  - **tiempo máximo por foto.**
  - Los errores dejan el semáforo y la cola limpios (`finally`). No hay archivos temporales.
- **Arquitectura:** en el mismo proceso Node, como el PDF de propiedad. Si la medición de T10 mostrara que bloquea la web, se presentarán alternativas (por ejemplo, otro proceso) **antes** de decidir.

### Interfaz

- **Gestor:** «Descargar PDF» en Compartir y en el menú «⋯».
- **Lector:** «Descargar en PDF» en la página de cierre y en el índice (decisión pendiente nueva: dónde va). Solo aparece con el enlace válido y con conexión.
- **Al descargar:** `fetch` con «Preparando el PDF…», el archivo se guarda en el navegador y los errores se explican: 404 «Este enlace ya no está disponible», 409 cambio en curso, 429 y 503 «inténtalo en un momento».
- **Pruebas de interfaz:** a 1440, 362 y 320 sin desbordes, con teclado y foco.

## Tareas

Cada tarea es pequeña, se verifica y se guarda en su commit. El orden respeta las dependencias.

### T0. Base, registro y entorno

- **Entradas:** la aprobación de este plan.
- **Acción:**
  - anotar la aprobación;
  - `git fetch` y rebase;
  - `npm ci`;
  - **descargar las fuentes** a `lib/pdf/fonts/` con su licencia, su origen y su sha256.
- **Verificación:** el lockfile no cambia, las licencias están y el sha256 cuadra.
- **Commit:** «PDF T0: aprobación, base y fuentes con licencia».

### T1. Comprobaciones técnicas con PDF reales mínimos (puerta P8)

- **Entradas:** T0.
- **Acción:** un script local (`scripts/pdf/spike.mts`) genera tres PDF pequeños: la portada con el arco y una foto sintética; un índice de 30 líneas en dos pasadas con enlaces internos; y un texto con todos los glifos de PDF7.
- **Herramientas:** `scripts/pdf/inspect.swift` (PDFKit: páginas a PNG, texto por página, enlaces y su página de destino) y `scripts/pdf/objects.py` (`/FontFile2|3`, `/URI`, `/Info`).
- **Verificación:**
  - el arco se ve igual que en el lector (PNG revisado);
  - los números del índice coinciden con la página real de cada destino;
  - las fuentes están incrustadas y los glifos se extraen.
- **Puerta:** si el arco o el índice no salen fieles, **se para y se presenta a Fabricio** con las capturas (P8).
- **Commit:** «PDF T1: comprobaciones de arco, índice y fuentes (con PDF generados)».

### T2. Reglas puras de la exportación

- **Entradas:** T1.
- **Acción:** `lib/catalogs/export/plan.ts`, con:
  - el reparto de fotos (P2);
  - el reparto de contenido según `itemLayout`;
  - el nombre del archivo y los metadatos;
  - la lista de lo que nunca puede aparecer.
  - Pruebas en `scripts/test-catalogs-public.mts`, que ya corre la CI.
- **Verificación:**
  - **P2:** apertura, recorrido y hasta 6, sin repetir; con exclusiones; sin fotos; y cuando la apertura es también foto del recorrido;
  - **contenido:** entrada larga, ficha breve, descripción completa, y precio «sin dato» o «También en…».
- **Commit:** «PDF T2: reglas puras de la exportación».

### T3. Resolución de fotos compartida con el proxy

- **Entradas:** T0.
- **Acción:**
  - extraer `photo-resolve.ts` del proxy `/p`, sin cambiar su comportamiento;
  - añadir `fetchExportPhoto`: tiempo máximo, comprobación de la versión `v` y JPEG por tamaño con `sharp`.
- **Verificación:**
  - las pruebas del proxy y de E3 (`test:catalogs-public` y `e3.mjs`) siguen en verde;
  - pruebas nuevas: por clave y nunca otra, versión distinta → «instantánea cambiada», tiempo máximo y foto rota → «no disponible».
- **Commit:** «PDF T3: resolución de fotos compartida con el proxy».

### T4. Lectura coherente para exportar (dueño y cliente)

- **Entradas:** T2 y T3.
- **Acción:**
  - `lib/catalogs/export/source.ts`: la lectura del dueño (también archivados y sin enlace) y la del cliente (enlace válido), con S1/H1 y la nueva comprobación de acceso y huella;
  - exportar desde `public-data.ts` la lectura pública con la instantánea interna, sin cambiar `getPublicCatalogState`;
  - en las fixtures, el almacén sintético con ganchos para cambiar datos o revocar el enlace a mitad.
- **Verificación** (pruebas con lectores inyectados, como `readCoherent`):
  - la versión cambia entre lecturas → se reintenta;
  - la huella cambia tras las fotos → se repite una vez y después 409;
  - enlace revocado, caducado o archivado a mitad → no se entrega;
  - el dueño deja de serlo → 404;
  - catálogo archivado o sin enlace para el dueño → se genera.
- **Commit:** «PDF T4: lectura coherente y fija para exportar».

### T5. Documento PDF

- **Entradas:** T1 y T2.
- **Acción:** en `lib/pdf/catalog/`: el registro de fuentes, la portada (arco), la introducción, el índice (dos pasadas), la apertura, el recorrido, el detalle, «más fotos», los estados de material que falta, el cierre y los metadatos.
- **Verificación:** un PDF sintético de 4 viviendas generado y revisado con `inspect.swift`, página a página.
- **Commit:** «PDF T5: documento Boutique con react-pdf».

### T6. Generación acotada

- **Entradas:** T3, T4 y T5.
- **Acción:** `lib/catalogs/export/generate.ts`, con:
  - los reintentos;
  - el semáforo, la cola y la espera máxima;
  - compartir las generaciones iguales;
  - el tiempo máximo total y por foto;
  - la limpieza en `finally`;
  - registros sin contenido del catálogo.
- **Verificación** (pruebas con relojes y lectores falsos):
  - N peticiones a la vez → 1 en curso, el resto compartidas o 503;
  - tiempo máximo agotado → todo liberado;
  - un fallo → el semáforo queda libre.
- **Commit:** «PDF T6: generación acotada».

### T7. Rutas

- **Entradas:** T6.
- **Acción:**
  - `app/api/admin/catalogos/[id]/pdf/route.ts` (dueño) y `app/api/seleccion/[token]/pdf/route.ts` (cliente), con las cabeceras, los límites por enlace y por dueño, 404 uniforme, 409, 429 y 503;
  - en las fixtures, las mismas rutas sobre el almacén sintético.
- **Verificación:** en la copia aislada con fixtures, con `curl`:
  - las cabeceras, los códigos de cada caso y la autorización separada;
  - un enlace revocado durante la generación no entrega nada.
- **Commit:** «PDF T7: rutas del dueño y del enlace».

### T8. Interfaz

- **Entradas:** T7.
- **Acción:** los botones del gestor y del lector, con «Preparando…» y los mensajes de error.
- **Verificación:** la prueba de navegador `pdf.mjs` a 1440, 362 y 320:
  - la descarga funciona, los mensajes salen y no hay desbordes;
  - el teclado funciona;
  - el lector no se ve afectado cuando el enlace no es válido.
- **Commit:** «PDF T8: botones de descarga en el gestor y el lector».

### T9. Verificación de los PDF generados

- **Entradas:** T8.
- **Acción:** `scripts/pdf/check-catalog-pdfs.mts` genera PDF **reales** de las fixtures:
  - corto (1 vivienda) y largo (24 viviendas);
  - descripción de 1.500 palabras;
  - sin fotos, foto que falla y exclusiones de E3;
  - precio sin dato, reservada y dual;
  - contacto de asesora;
  - archivado (dueño).
- **Comprobaciones con `inspect.swift` y `objects.py`:**
  - **PDF2/PDF5:** el texto extraído contiene, palabra por palabra, los textos de la proyección: nada cortado ni perdido;
  - **PDF3/PDF14:** fotos por vivienda (pies «Foto x de y» e imágenes por página): ninguna excluida ni repetida;
  - **PDF4/PDF15:** ni en el texto ni en los objetos aparecen ids, claves, slugs, `/p/`, `storage`, `seleccion/`, el token, BC-, criterios, grupos ni anuncios; ningún `/URI` salvo `tel:`; los metadatos, limpios;
  - **PDF6:** cada número del índice es la página real de su vivienda y cada enlace lleva allí;
  - **PDF7:** las fuentes incrustadas y los glifos;
  - **PDF8:** un cambio a mitad → un PDF de una versión o 409.
- **Commit:** «PDF T9: verificación de PDF generados».

### T10. Medición (antes de fijar los límites)

- **Entradas:** T9.
- **Acción:** con fotos sintéticas de tamaño real (JPEG de 2.000–4.000 px generados con `sharp`) y catálogos de 1, 12 y 24 viviendas, medir:
  - el tiempo;
  - la memoria (RSS en el pico);
  - el tamaño del PDF;
  - la respuesta de la web mientras se genera (latencia de `/api/seleccion/*/estado` durante la generación).
- **Fijar** la concurrencia, la cola, los tiempos máximos y los tamaños de foto.
- **Si el peor caso de P2 diera un archivo o un tiempo que no conviene,** se presentan opciones a Fabricio. **No se recorta en silencio.**
- **Commit:** «PDF T10: medición y límites».

### T11. Paquete para la QA visual de Fabricio (P9)

- **Entradas:** T10.
- **Acción:** los PDF sintéticos reales (corto, largo y material que falta) y sus páginas en PNG, en `docs/…/capturas/`, con un índice de qué mirar.
- **Verificación:** las páginas revisadas una a una (márgenes, cortes, viudas, arco, índice y fotos). Se presentan a Fabricio; **su aprobación visual se anota** antes de pedir el merge.
- **Commit:** «PDF T11: PDF de muestra y páginas para la QA».

### T12. Regresiones, compilación, resultado y PR

- **Entradas:** T11.
- **Acción:**
  - la matriz del lector y el gestor (`lector`, `e3`, `vista`, `prB`, `grupos`, `content` y `homes`), en secuencia;
  - `next build` aislado;
  - `result.md`;
  - volver a comprobar la base;
  - push, PR y CI. **Parar antes del merge.**
- **Commit:** «PDF T12: resultado».

## Verificación final

- `tsc`, `test:catalogs`, `test:catalogs-public` y `test:catalogs-manager`, con las pruebas nuevas.
- `pdf.mjs` y la matriz, `check-catalog-pdfs`, la medición de T10, `next build` aislado y la CI.
- **QA de Fabricio:**
  - antes del merge, sobre los PDF sintéticos reales (P9);
  - después del despliegue, con un catálogo real suyo, como dueño y como cliente desde el enlace.

## Recuperación

- **Sin migración ni datos guardados.**
- **Revertir el merge** quita las rutas y los botones; las fuentes del repositorio se van con él.
- **La extracción del proxy** (T3) es un cambio de código sin efecto en lo que sirve. Si algo fallara, se revierte con el resto.

## Riesgos y suposiciones

- **Comprobado en T1:** que react-pdf hace bien el arco, el índice en dos pasadas y las fuentes (WOFF o TTF estáticos). Si no, se para y se presenta a Fabricio (P8).
- **Carga real en el VPS:** el proceso y la memoria del VPS no son los de este equipo. T10 da una referencia, y la QA después del despliegue confirma el tiempo de un PDF real.
- **Tiempo máximo del proxy del VPS (nginx):** no comprobado. Si un PDF tarda más de lo que permite, se verá en la QA. Las opciones (menos fotos o fotos más pequeñas, o generar en segundo plano) se presentan antes de cambiar nada.
- **Fotos de origen grandes o raras:** `sharp`, con tiempo máximo y «Foto no disponible».
- **El límite de la misma URL** (corrección 5 de E3) sigue documentado.
- **Fidelidad frente al lector:** el contenido es el mismo (PDF2) y la composición la aprueba Fabricio sobre PDF reales (PDF12, P9).

## Decisiones pendientes que afectan al plan

- **Dónde va el botón del cliente en el lector.** Propuesta: la página de cierre y el índice.
- **Condicionales,** solo si las destapa T1 o T10:
  - un cambio en el arco o en el índice;
  - límites más estrictos que P2.

## Aprobación

Pendiente. Este plan no autoriza la ejecución.
