# Catálogo · descarga en PDF profesional: resultado

**Documentos:**
- especificación: [`spec.md`](spec.md), aprobada el 16 de octubre de 2026 con P1–P10 y las correcciones K1–K5;
- plan: [`plan.md`](plan.md), T0–T12;
- medición: [`medicion.md`](medicion.md);
- muestras para la QA visual: [`capturas/`](capturas/README.md).

> **Cerrado el 17 de octubre de 2026.**
> - **Merge:** #323 fusionado por Fabricio (`38d2151`).
> - **Producción:** funciona según su informe.
> - **Aprobación visual (P9 / PDF12):** aprobada por Fabricio sobre el PDF real.
> - **Parón del proceso al maquetar:** va en una tarea aparte, [`2026-10-17-bcp-01-pdf-worker`](../2026-10-17-bcp-01-pdf-worker/spec.md).
> - **Enmienda visual (20 de octubre de 2026):** la identidad Boutique del PDF (D17, Fraunces y Karla) se sustituye por la de la publicación del itinerario, con el mismo renderizador, hilo y verificación. Ver [`2026-10-20-bcp-01-catalogo-visual/enmienda.md`](../2026-10-20-bcp-01-catalogo-visual/enmienda.md). La aprobación P9/PDF12 no cubre el PDF rediseñado.

## Base y commits

- **Base:** `origin/main` = `94b513f` (merge de #322). Se volvió a comprobar antes de publicar: `main` no se ha movido y la rama lo contiene.
- **Rama:** `fabri/bcp-01-pdf`, en el worktree `wt/bcp-01-pdf`.
- **Sin migración ni dependencias nuevas:** `@react-pdf/renderer` y `sharp` ya estaban instaladas. Las fuentes son archivos estáticos con licencia OFL (`lib/pdf/fonts/`, con su procedencia y sha256).

| Commit | Tarea |
| --- | --- |
| `a94104f` | HOME grupos: merge de #322 y aceptación en producción (registro) |
| `54c9e4d` | Exploración y especificación en borrador, con la maqueta Boutique |
| `967fa63` | Especificación aprobada para planificar (P1–P9) y plan en borrador |
| `3104860` | T0: aprobación (P10, K1–K5) y fuentes estáticas con licencia y procedencia |
| `89b6063` | T1: arco, índice en dos pasadas y fuentes comprobados con PDF reales |
| `a417275` | T2: reglas puras de la exportación |
| `aa03801` | T3–T4: fotos compartidas con el proxy, fixtures del PDF y captura fija (K1) |
| `7271aef` | T5–T6: documento, renderizado en pasadas y núcleo acotado |
| `9c1679d` | T7: rutas del dueño y del enlace |
| `b6c5016` | T8: botones de descarga en el gestor y el lector |
| `4b52b8d` | T9: verificación de PDF generados |
| `92658bd` | T10: medición y límites fijados |
| `571981e` | T11: muestras para la revisión visual |
| (este commit) | T12: regresiones, glifos y resultado |

## Qué hace

**Rutas:**
- `GET /api/admin/catalogos/[id]/pdf` (dueño):
  - pide sesión de la HOME y que el catálogo sea suyo;
  - funciona también con el catálogo archivado o sin enlace.
- `GET /api/seleccion/[token]/pdf` (cliente):
  - pide un enlace válido de un catálogo disponible;
  - sigue el mismo camino que el estado público.
- **Respuestas de las dos:**
  - 404 siempre igual, sin decir el motivo; 409 si el catálogo cambia dos veces seguidas; 429 por enlace o por dueño; 503 con `Retry-After`;
  - cabeceras `private, no-store`, `noindex`, `no-referrer` y `nosniff`;
  - adjunto con el nombre «Catálogo · título · dd-mm-aaaa.pdf» en UTF-8, con respaldo ASCII.

**Contenido** (`lib/catalogs/export/*`, `lib/pdf/catalog/*`):
- **Fuente única:** solo la proyección pública `toPublicCatalog` (P6).
- **Captura fija (K1):**
  - se lee S1 de forma coherente y se copia;
  - la huella H1 es el sha-256 de S1 y su operación; describe exactamente lo capturado, incluidos los datos de fichas y la versión de cada foto, que no suben `catalogs.version`.
- **Fotos:** cada una se resuelve por su clave con el mismo código que el proxy `/p` (`photo-resolve.ts`), se comprueba su versión contra S1 y se convierte a JPEG sin ampliar.
- **Documento:**
  - A4 Boutique con el logo oficial y la portada con arco;
  - presentación e índice con páginas reales y enlaces;
  - por vivienda: apertura, todas las secciones del recorrido (K4), detalle, «Más fotos» (hasta 6, sin repetir) y cierre con el contacto editable;
  - sin URL ni QR;
  - el índice se calcula en dos pasadas, con las fuentes recargadas en cada una.
- **Generación acotada (K2, K3):**
  - un PDF a la vez, con cola de 3;
  - el turno es del trabajo y se libera cuando este termina de verdad;
  - cancelación real de la fase de fotos cuando ya no queda nadie esperando o se agota su presupuesto;
  - dos peticiones solo comparten trabajo si tienen el mismo ámbito y la misma huella;
  - cada petición hace su propia comprobación final antes de recibir los bytes.

**Interfaz:**
- **Gestor:** «Descargar PDF» en Compartir y en el menú «⋯». Avisa si hay cambios sin guardar y si el catálogo está archivado o no tiene enlace.
- **Lector:** «Descargar en PDF» en el índice y en el cierre, debajo de «Llamar». Solo aparece con conexión y si hay viviendas.
- **De paso:** la cabecera del gestor tapaba con la pestaña activa el menú «⋯» en el móvil; corregido.

## Verificaciones

Todo se ejecutó en local con datos sintéticos, en un entorno sin `.env*` ni credenciales (`env -i`; servidor aislado `pdf-iso` verificado: 0 archivos `.env*`, variables permitidas, `@next/env` sin cargar archivos).

| Comprobación | Dónde | Resultado |
| --- | --- | --- |
| `npx tsc --noEmit` | worktree | sin errores |
| `npm run test:catalogs` | worktree | 83 ✅ |
| `npm run test:catalogs-public` (reglas del PDF; K1, captura: 13 comprobaciones; K2/K3, núcleo: 16) | worktree | 453 ✅ |
| `npm run test:catalogs-manager` | worktree | 148 ✅ |
| `npm run test:typography` | worktree | 16 avisos, todos ya presentes en `main` y en archivos no tocados |
| `scripts/pdf/check-routes.sh` (curl contra el servidor aislado) | `pdf-iso`, :3141 | 22 ✅ |
| Prueba de navegador `pdf.mjs` (lector y gestor a 1440, 362 y 320) | `pdf-iso` | 103 ✅ |
| `scripts/pdf/check-catalog-pdfs.mts` (PDF reales, ver abajo) | worktree, fixtures | 529 ✅ |
| `scripts/pdf/measure.mts` (T10) | worktree | [`medicion.md`](medicion.md) |
| Matriz de regresión (ver abajo) | `pdf-iso` | 0 fallos |
| `next build` (NODE_ENV=production) | copia aislada `pdf-build`, sin `.env*` | compila; rutas `/api/admin/catalogos/[id]/pdf` y `/api/seleccion/[token]/pdf` en la lista. Los `fetch failed` del registro son de la generación estática contra la base ficticia, como en los builds anteriores |

**Rutas (22 comprobaciones):**
- cabeceras;
- 404 uniforme para formato no válido, token inexistente, revocado y caducado;
- el dueño descarga con el catálogo archivado y el cliente recibe 404;
- dueño sin sesión fuera de localhost: 404;
- **revocado a mitad:** 404 y ningún byte de PDF;
- revocar el enlace a mitad no afecta al dueño;
- **un cambio a mitad:** se repite y sale el PDF de la versión nueva;
- **cambios continuos:** 409;
- dos peticiones del mismo enlace: el mismo PDF, con trabajo compartido;
- **siete a la vez:** 4 PDF y 3 respuestas 503 con `Retry-After`;
- el navegador se va: el trabajo se cancela;
- **límite por enlace:** 429 a partir de la 7.ª.

**PDF reales (529 comprobaciones; `check-catalog-pdfs.mts`, todo en un mismo proceso):**
- **Casos:**
  - `pdf`: 5 viviendas, con una historia de 12 capítulos, 1.530 palabras de descripción, una vivienda sin fotos ni precio y reservada, una dual con 14 fotos, una foto que falla y 2 fotos excluidas por E3;
  - `main` en venta y en alquiler, `one`, `journey` (los tres niveles de texto), `journey24` (24 viviendas, 86 páginas) y el catálogo vacío;
  - el dueño con el catálogo archivado y el enlace revocado;
  - los caracteres especiales (¿ ¡ ü « » — € ² ª º);
  - cambios y revocación a mitad;
  - un PDF de propiedad con Helvetica después de los del catálogo, y otro del catálogo al final.
- **Qué se comprueba:**
  - el texto de la proyección, palabra a palabra, en las páginas de cada vivienda;
  - cada imagen incrustada se extrae del PDF y se identifica por su código visual de 24 bits;
  - el índice, sus números y sus enlaces;
  - cadenas internas, URI y metadatos;
  - fuentes y glifos;
  - que la versión del catálogo no cambie.

**Matriz de regresión** (servidor aislado con fixtures; las pruebas de E2, E3 y grupos, apuntadas a esta rama):

| Prueba | Tamaños | Resultado |
| --- | --- | --- |
| `homes` | 1280, 1440, 1024, 362, 320 | 56–57 ✅ cada una, 0 ❌ |
| `content` | 1280, 1440, 1024, 362, 320 | 33–34 ✅ cada una, 0 ❌ |
| `design-share` | 1280, 1440, 362, 320 | 34 ✅ cada una, 0 ❌ |
| lector `lector` / `indice` / `prA` / `prB` / `enlace` / `c1` / `c2` | — | 52 / 187 / 54 / 40 / 10 / 31 / 186 ✅, 0 ❌ |
| `vista` | 1440, 362 | 23 ✅ cada una, 0 ❌ |
| `e3` | 1440, 362, 320 | 41 ✅ cada una, 0 ❌ |
| `grupos` | 1440, 362, 320 | 79 / 75 / 75 ✅, 0 ❌ |

**Navegador (103 comprobaciones):**
- descarga y nombre del archivo;
- mensajes de 404, 409, 429, 503 y «sin red»;
- «Preparando el PDF…» con el botón desactivado;
- teclado: Enter en el cierre y Tab y Enter en el menú «⋯»;
- sin desbordes y sin nada que tape el menú;
- sin conexión no se ofrece el botón y vuelve con la conexión;
- con el enlace revocado (al cargar o con el lector abierto) desaparece;
- con el catálogo vacío no se ofrece;
- el gestor descarga con el catálogo archivado y sin enlace.

## Criterios de aceptación

| # | Estado | Evidencia |
| --- | --- | --- |
| PDF1 | demostrado | `check-catalog-pdfs`: título, introducción, contacto y portada efectiva identificada por su código; logo en portada y cierre (capturas) |
| PDF2 | demostrado | texto extraído frente a `toPublicCatalog`, palabra a palabra, por vivienda y en sus páginas; venta, alquiler y dual |
| PDF3 | demostrado | ninguna foto excluida por E3 (identificadas por código); portada efectiva; «Foto no disponible» en el sitio de la que falla, nunca otra |
| PDF4 | demostrado | 99 cadenas internas buscadas en el texto, los flujos, el `/Info` y los bytes del PDF; solo `tel:`; metadatos limpios |
| PDF5 | demostrado | descripción de 1.530 palabras entera; continuaciones marcadas; títulos unidos a su foto o a su texto (revisado en las hojas de contacto) |
| PDF6 | demostrado | cada enlace del índice lleva a la primera página de su vivienda y los números impresos coinciden (5, 4, 1, 3 y 24 viviendas) |
| PDF7 | demostrado | todas las fuentes incrustadas, solo Fraunces y Karla; ¿ ¡ ü « » — € ² ª º se extraen tal cual; «Nº» nunca pasa a «NO» |
| PDF8 | demostrado | cambio a mitad: un PDF de la versión nueva; cambios continuos: «changed»; generar no cambia la versión ni avisa a los lectores |
| PDF9 | demostrado | sin fotos («Sin fotos»), sin precio («Precio · sin dato»), sin datos («—»), reservada |
| PDF10 | demostrado | rutas y `check-catalog-pdfs`: dueño con el catálogo archivado; cliente con 404 en todos los casos; revocado a mitad, sin bytes |
| PDF11 | demostrado en local | 1 vivienda: 0,75 s y 0,17 MB; 24 viviendas: 5,3 s y 2,5 MB, con un pico de +60 MB. El **parón del proceso** (~0,9 s, dos veces) **no se acepta como definitivo**: se trata en la tarea aparte `2026-10-17-bcp-01-pdf-worker` |
| PDF12 | **aprobado** (17-10-2026, informe de Fabricio) | Aprobó el aspecto del PDF real en producción: portada, fotos, índice, texto completo y contacto |
| PDF13 | demostrado | `private, no-store`; cola, límites por enlace y dueño y tiempos máximos; ningún archivo en el servidor |
| PDF14 | demostrado | cada imagen incrustada identificada por su código de 24 bits (K5): por vivienda, exactamente las previstas, en orden y sin repetir |
| PDF15 | demostrado | ni `http`, ni `www`, ni el token, ni la URL; no hay QR |
| PDF16 | demostrado | historia de 12 capítulos y descripción partida en 25 secciones, todas en el PDF |

## QA de Fabricio

**Superada (17 de octubre de 2026, informe de Fabricio, después del despliegue de #323):**
- la descarga en PDF funciona bien en producción;
- **aprueba expresamente el aspecto del PDF real:** portada, fotos, índice, texto completo y contacto. Con esto quedan aprobados **P9 y PDF12**;
- el agente no ha comprobado nada en producción (P-1): todo esto es el informe de Fabricio.

**Rendimiento:** Fabricio pide **preparar un plan aparte** para reducir el bloqueo de la web mientras se genera el PDF.
- Es **solo autorización para planificar**: no aprueba implementar nada, ni acepta los parones actuales como un compromiso definitivo.
- Expediente: [`2026-10-17-bcp-01-pdf-worker`](../2026-10-17-bcp-01-pdf-worker/spec.md).

Se conserva la QA ya registrada de #320 y de E3. Siguen pendientes, sin cambios: G-ALQ, el caso original de Recoletos y D13 en vivo.

## Revisión

No se pidió revisión adicional de Codex; la aprobación lo excluía expresamente.

## Pendiente o no demostrado

- **Parón del proceso web:** con 24 viviendas son ~0,9 s, dos veces, en un M2; en el VPS puede ser más largo y, por encima de 2 s, un lector abierto vería «Sin conexión» un instante.
  - Se trata en la tarea aparte [`2026-10-17-bcp-01-pdf-worker`](../2026-10-17-bcp-01-pdf-worker/spec.md); no se acepta como definitivo.
- **Sin comprobar en el VPS** (no hay acceso):
  - el tiempo de las descargas desde el almacén;
  - la CPU real;
  - el `proxy_read_timeout` de nginx. Por eso la espera de una petición se dejó en 55 s.
- **Límite heredado de E3:** un archivo sustituido en la misma URL no cambia `u` y no se detecta.
- **Al extraer el texto:** los rótulos con espaciado entre letras se leen como «V E N T A», y «RESERVADA» queda pegado al título. Solo afecta a copiar el texto del PDF, no a cómo se ve.

## PR, CI y merge

- PR: https://github.com/Bcousino890/smartbc/pull/323 (rama `fabri/bcp-01-pdf`). La CI se comprueba en el último commit.
- **Merge:** Fabricio fusionó #323 el 16 de octubre de 2026 a las 23:21 UTC. El commit de merge es `38d2151` y su contenido es idéntico al último de la rama, `222bf8a`.
- **CI de `main`:** en verde en `38d2151`.
- **Después del merge** entraron en `main` dos commits ajenos a esta tarea (`98e1e00` y `4ceb314`, de particulares y la migración `0208`), que no tocan el PDF ni los catálogos.
