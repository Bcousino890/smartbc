# BCP-01 · Enmienda visual del catálogo: resultado

**Enmienda y plan:** [`enmienda.md`](enmienda.md) (DV1–DV13, T0–T10). **Capturas y PDF:** [`capturas/`](capturas/README.md).

> **Estado:** implementado y verificado en local; PR en borrador con la CI del repositorio. **La aprobación visual y el merge son de Fabricio** (la aprobación de E1 y la de P9/PDF12 no cubren este resultado).

## Base y commits

- **Base:** `origin/main` = `38db71da` (contiene #326–#337). Rama `fabri/bcp-01-visual-itinerario`, worktree `wt/bcp-01-visual`. Sin migración ni dependencias nuevas.
- **Trabajo en curso respetado:** no hay PR abierto del catálogo; `fabri/bcp-01-importar-buscar` (3 commits de documentación sin fusionar) no se toca; el gestor, la HOME, el buscador, la conversión y la importación no cambian.

| Commit | Contenido |
| --- | --- |
| `1e20370a` | T0 · enmienda y plan; punteros desde los expedientes de D17 y del PDF |
| `d833ae43` | T1 · fuentes estáticas Playfair Display, Cinzel e Inter (OFL, Fontsource 5.3.0) con procedencia y sha256; verificación de PDF adaptada |
| `6294c416` | T2–T3 · `book-stage.tsx` extraído de `book-mode.tsx`; `PrivateGallery` con props opcionales |
| `05d9d15c` | T4 · portada y miniaturas (`CatalogCover`) |
| `b0bdf10b` | T5–T6 · lector (páginas, libro, barra, galería, modo desplazamiento), estado con colofón y giro de 720 ms, tests |
| `037eb61c` | T7 · PDF con la identidad nueva (logo en blanco para las páginas sobre tinta, colofón) |
| (este commit) | T8 · capturas y PDF reales · T10 · resultado |

## Qué se reutiliza de la referencia (sin mover archivos)

- `app/v/[token]/_components/editorial.tsx`: `Label`, `Rule`, `Ornament`, `DataPoint`, `ChapterMark`, `StatusLine`.
- `app/v/[token]/_components/private-gallery.tsx`: la galería (mosaico y lámina en portal, teclado en captura, bloqueo del scroll), ahora con índice controlado, miniaturas, aviso y componente de imagen opcionales.
- `app/v/[token]/_components/book-stage.tsx` (nuevo, extraído de `book-mode.tsx`): `useBookTurn`, `BookStage` (capas con key estable y giro) y `BookNav` (anterior · índice · «03 / 13» · siguiente).
- Tokens `ink · cream · gold`, familias `display/serif/sans` y utilidades `vc-*` de `app/globals.css` (giro, sombras, revelado de portada, foco, tracking, cifras tabulares). No se añade CSS global; `reader.module.css` queda con el esqueleto de composición y los estados de las fotos.

## Qué cambia

- **Lector** (`components/catalogs/reader/*`, `app/seleccion/[token]/page.tsx`): libro a pantalla completa con la mecánica de `/v` cuando cabe una página (`min-height: 620px`); si no, recorrido vertical. Portada a sangre; índice con la introducción; vivienda como panel editorial | fotografía a página alternando de lado (apertura, recorrido y detalle sobre la MISMA composición pura de `journey-layout.ts`, sin cambiar reglas ni constantes: los textos se desplazan dentro del panel con «Sigue leyendo ↓»); una hoja por vivienda en una columna; cierre «Hablemos» y colofón oscuro. Etiquetas de catálogo (DV2); sin referencias BC, direcciones, enlaces a la ficha ni valoración (DV3).
- **Estado** (`lib/catalogs/reader-state.ts`): página `colophon` al final de `pagesOf`; `PAGE_TURN_MS` 720 (el giro de la referencia). Los folios del índice no cambian.
- **Portada y miniaturas** (`components/catalogs/catalog-cover.*`): la portada de la referencia, escalada por contenedor (HOME, Diseño, lector) con el número de viviendas; sin foto, tinta con la marca.
- **PDF** (`lib/pdf/catalog/document.ts`, `fonts.ts`, `load-logo.ts`, protocolo del hilo con `logoWhite` opcional): portada oscura a sangre con doble velo y marca blanca (silueta por el canal alfa del logo, con sharp), páginas marfil con filetes, Playfair/Cinzel/Inter, dato tipográfico, colofón final. Mismo renderizador, hilo, captura fija, rutas y verificación. Lo que cambió en la verificación (`scripts/pdf/pdf-verify.mts`): el cierre es la penúltima página y el colofón la última; el rótulo de la vivienda se comprueba como «Nº 01» + operación.
- **Retirado:** `lib/catalogs/fonts.ts` (Fraunces/Karla por `next/font`), `components/catalogs/reader/gallery.tsx`, los archivos de Fraunces y Karla de `lib/pdf/fonts/` y `splitOrdinals` (Inter trae «º» y «ª»).

### Dos cosas que conviene saber

- **El giro del libro y las capas** son los de la referencia; en el catálogo la página actual la decide el estado del lector (D12 puede cambiarla sin giro) y el giro se arranca con `useBookTurn.begin`. Pulsar en ráfaga durante un giro se ignora, como en `/v`.
- **El índice en Cinzel no recorta títulos** (la referencia sí los trunca): un título largo ocupa varias líneas; el precio tiene un ancho máximo para no comerse la columna del título.

## Verificaciones

| Comprobación | Dónde | Resultado |
| --- | --- | --- |
| Itinerario intacto (V11) | DOM del libro de `/v/design-preview` en 30 estados (portada, índice, residencias, galería en lámina y mosaico, vuelta atrás; 1280×900 y 390×844) y HTML servido, antes (worktree con `origin/main`) y después, con scripts y marcas de tiempo normalizados | **Idénticos** (0 diferencias en 30 estados; HTML igual, 54.392 caracteres) |
| `npm run test:viewing-collections` | local | ✅ TODO OK |
| `npm run test:catalogs-public` | local | ✅ Todo en verde (tests actualizados: colofón, 720 ms, índice dentro de `ScrollRegion`) |
| `npm run test:catalogs` · `test:catalogs-manager` | local | ✅ Todo en verde |
| `npx tsc --noEmit` | local | sin errores |
| `npm run test:typography` | local | **21 violaciones previas** en archivos que esta rama no toca (zinto-config-client, particulares, permisos…); no está en la CI y no cambia con esta rama |
| PDF reales (`scripts/pdf/check-catalog-pdfs.mts`, 15 PDF por el hilo) | local, `NODE_ENV=development CATALOG_FIXTURES=1` | ✅ **Todo en verde** (540 comprobaciones): texto entero palabra a palabra, fotos por su código visual (sin excluidas ni repetidas), índice con páginas reales y enlaces, fuentes incrustadas solo Playfair/Cinzel/Inter, glifos españoles, sin ids ni URL, cambio y revocación a mitad, metadatos |
| PDF · tamaño y tiempo (sin otra carga) | resumen del script | Salamanca y Chamberí 14 págs · 354 KB · 1,7 s; casos difíciles (12 capítulos, 1.500 palabras, 13 fotos) 22 págs · 494 KB · 2,3 s; 24 viviendas con textos largos 88 págs · 1,98 MB · 6,8 s; 15 PDF por el hilo, 0 respaldos (en una pasada anterior, con `next build` en paralelo, el hilo del primer PDF no arrancó a tiempo y cayó al respaldo: `startup_timeout`, carga de la máquina, no un cambio de código) |
| `next build` (producción, `NEXT_BUILD_DIR=.next.qa`) | local | ✅ «Compiled successfully» (8,8 min con la verificación de PDF en paralelo); `tsconfig.json` restaurado después |
| Capturas comparadas con la referencia | Chromium, 1440×900 · 1024×768 · 768×1024 · 390×844 | [`capturas/`](capturas/README.md) |
| Movimiento reducido | Chromium `reducedMotion: reduce` | 0 animaciones en curso al pasar página; se pasa de página |
| Teclado | Chromium | ← → Inicio Fin Av Pág; ráfaga durante el giro no salta; Tab llega a «Siguiente» y Enter pasa página; galería con Enter, → y Esc, sin mover el libro |
| Índices largos | fixtures de 20 y 24 viviendas | se desplazan dentro de la página con «Más viviendas ↓»; folios correctos |
| Fotos ausentes y fallidas | fixture sin fotos; peticiones de foto abortadas | «Sin fotos»; «Foto no disponible» en la apertura y «Esta foto no se puede mostrar» en la galería |
| Actualizaciones en vivo durante la lectura | `/dev-fixtures/api/catalogo` (título, retirada de la vivienda que se lee) | la huella cambia sin mover la página; D12: aviso y paso a la apertura de la siguiente |
| Ventana baja (1280×560) · conmutador | Chromium | recorrido vertical forzado; «Desplazar / Páginas» alterna y recuerda |
| Enlace no válido | Chromium | «Este enlace ya no está disponible» con la identidad nueva |
| HOME y gestor | fixtures | miniaturas y vista previa de Diseño con la portada nueva; fuentes cargadas; 0 desbordes (`fixture-report`) |

## Criterios de aceptación

| | Estado | Evidencia |
| --- | --- | --- |
| V1 portada | demostrado | `capturas/catalogo-*-portada.png`, cover de los PDF |
| V2 índice | demostrado | `catalogo-1440-indice.png`, `catalogo-1440-indice-24.png`, `catalogo-390-indice-24.png` |
| V3 vivienda | demostrado | `catalogo-1440-vivienda.png`, `catalogo-1440-recorrido-*.png`, `catalogo-390-vivienda.png` |
| V4 sin recortes | demostrado | `catalogo-1440-detalle.png`; `test:catalogs-public` (composición pura sin cambios); PDF con el texto entero |
| V5 giro, teclado, reducido | demostrado | script de QA (arriba) |
| V6 galería y fotos | demostrado | `catalogo-1440-galeria*.png`, `qa-foto-fallida*.png`; E3 por los tests puros |
| V7 cierre | demostrado | `catalogo-1440-cierre.png`, `catalogo-1440-colofon.png` |
| V8 en vivo | demostrado | `qa-en-vivo-d12.png`, `qa-enlace-no-valido.png` |
| V9 HOME | demostrado | `home-estanteria-1440.png`, `gestor-diseno-1440.png` |
| V10 PDF | demostrado | `check-catalog-pdfs.mts` en verde; PDF en `capturas/` |
| V11 `/v` y `/s` | demostrado | diff del DOM y del HTML servido |
| V12 CI | pendiente de la CI del PR | ver abajo |

## Pendiente o no demostrado

- **Aprobación visual de Fabricio** sobre las capturas y los PDF reales (es la que cuenta).
- **Safari/WebKit** real: no se ha ejecutado; se razona por paridad con `/v` (misma mecánica y mismas utilidades).
- **Recalibrar las capacidades del recorrido** (`C_TEXT`, `C_PHOTO`): con el panel a media ventana cabe más texto que en la página antigua, así que las páginas de recorrido quedan más holgadas de lo necesario; no se recorta nada. Si se quiere apretar, es un cambio de constantes con su medición (como E1 · T6).
- **Tablet vertical (768×1024):** la referencia compone a dos columnas desde 768 px; el catálogo lo hace desde 900 (DV6, para conservar la composición pura calibrada) y por debajo muestra la hoja única. Decisión documentada, no un defecto.
- **D13 en producción:** fuera de este trabajo.

## Revisión

Fabricio no pidió revisión de Codex para esta tarea (y el encargo la excluye): no se ha hecho.

## PR, CI y merge

PR en borrador desde `fabri/bcp-01-visual-itinerario`; la CI del repositorio (tsc, tests de catálogos, build) se anota en el PR. **El merge lo hace Fabricio** y puede disparar el despliegue del VPS.
