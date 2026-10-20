# BCP-01 · Lector compacto, título y descripción, y opiniones de clientes: resultado

**Especificación:** [`spec.md`](spec.md) (DC1–DC20) · **Plan:** [`plan.md`](plan.md).

> **La QA visual y en producción y los merges son de Fabricio.** Las capturas de Fabricio que fijan las dos composiciones no estaban adjuntas en la conversación de trabajo: las pantallas siguen la descripción escrita del encargo (DC1) y la identidad de #338.

## PR A · Lector compacto y título/descripción fiables

- **Rama:** `fabri/bcp-01-lector-compacto` (worktree `wt/bcp-01-compacto`), desde `origin/main` = `dc009960`.
- **Migración:** `0217_catalog_text_title.sql` con `rollback-0217.sql`. Sin dependencias nuevas.

### Diagnóstico del título

Comprobado en `main` antes de cambiar nada:

- El título público salía siempre de `properties.title` (`catalog_item_json`). `catalog_texts` no tenía título.
- El único campo «Título» del gestor es el del **catálogo** (Diseño → `catalog_update_meta`), y ese guardado funciona.
- Publicar exigía texto o entrada (`text_empty`): un título solo no se podía publicar aunque hubiera existido.
- Conclusión: no había ningún camino para el título de una vivienda en un catálogo; no era un fallo de guardado de un camino existente.

### Qué cambia

- **0217:** `draft_title` / `pub_title` en `catalog_texts`; guardado con título (sobrecarga de 9 argumentos; la de 8 se conserva para el despliegue); publicar con solo un título; el título publicado va en la instantánea **sin depender de la huella de la ficha** (DC6); retirar quita también el título; los estados cuentan el título. Ninguna huella cambia en catálogos sin título propio.
- **Lector (DC1–DC4):** cada vivienda tiene exactamente **apertura** (foto de apertura, título, operación, precio, datos clave, miniaturas y «Ver N fotografías») y **detalle** (título, ficha técnica, características y la descripción completa), en doble composición y en una columna. La descripción se desplaza dentro de la pantalla 2 con «Sigue leyendo ↓». Se retira `journey-layout.ts`.
- **Contrato público:** `copy` (la descripción completa en bloques, por la prioridad de C2, una vez) sustituye a `lead`, `highlights`, `sections`, `mosaic` y `description`. Con historia: su entrada y sus capítulos con título; la descripción limpia no se repite. Las historias siguen guardadas y en la instantánea.
- **PDF (DC9):** apertura, «La vivienda en detalle» (características y la descripción completa, una vez) y «Más fotos» (apertura + hasta 6, P2). Mismo renderizador, hilo y protecciones.
- **Gestor (DC5–DC8):** «Título en este catálogo» (vacío = el de la ficha) y «Descripción para este catálogo»; entrada y puntos plegados en «Más opciones», conservados. «Borrador con IA» propone título y descripción; «Preparar desde la ficha», la descripción. La comprobación incluye el título. La lista de Contenido enseña el título propio y el de la ficha.
- **Material:** desaparece «capítulos sin foto adecuada» (ya no hay fotos en el texto).

### Verificación

| Comprobación | Resultado |
| --- | --- |
| SQL en Postgres 16 temporal: `scripts/sql/test-catalogs-core.sh` (cadena 0192–0213 + 0217: aplicada dos veces, título solo, publicar, ficha y otro catálogo intactos, cambio de la ficha no retira el título y sí el texto, bloqueos, longitud, conflicto de revisión, sobrecarga antigua, permisos, reversión y reaplicación; fotos y selección con 0217) | ✅ todos los escenarios en verde |
| `test:catalogs-public` (dos pantallas en las dos composiciones, D12 desde el detalle, reorden, giro, parte antigua; descripción completa para texto, historia de 6/9/12 capítulos, limpia y sin texto; 1.500 palabras íntegras; IA simulada con título; precio en el título bloquea) | ✅ |
| `test:catalogs-manager` (título solo como cambio pendiente, guardado con edición en curso conservada, recarga, conflicto con otra pestaña, estados «Título publicado») | ✅ |
| PDF reales (`check-catalog-pdfs.mts`, 15 PDF por el hilo, 626 comprobaciones): texto entero bloque a bloque, sin repetir la descripción, fotos por su código, índice con páginas reales, privacidad, fuentes, título propio en el índice y en la vivienda sin el de la ficha | ✅ |
| QA en Chromium con fixtures: guardar **solo un título**, publicarlo y verlo cambiar en vivo en el lector abierto y en el índice; otro catálogo sin cambios | ✅ |
| QA del lector: reducir movimiento, teclado (← → Inicio Fin Av Pág, Tab y Enter), galería con teclado, fotos fallidas, D12 en vivo, ventana baja, Desplazar/Páginas, enlace no válido; sin errores de consola | ✅ |
| `tsc`, todas las suites de la CI, `lint-migrations.py`, `next build` | ver el PR |

Dos ajustes de la verificación de PDF, explicados en el código: la búsqueda de cadenas prohibidas ya no mira dentro de los flujos binarios (un «BC-» salía por azar en bytes comprimidos; el texto descomprimido se sigue revisando entero), y una última línea corta que PDFKit extrae antes de su párrafo ya no se cuenta como palabra perdida.

### Capturas y PDF

[`capturas-a/`](capturas-a/): apertura y detalle a 1440 y 390, detalle con texto largo, con historia y sin descripción, galería, foto fallida, D12 en vivo, editor del gestor, título publicado en vivo, y tres PDF reales con su índice y una página de vivienda.

### Pendiente o no demostrado (A)

- La persistencia tras recargar se demuestra en SQL (guardar, publicar y estados); el gestor de fixtures guarda en memoria del navegador.
- Safari real no se ha ejecutado.
- Las constantes `C_TEXT`/`C_PHOTO` desaparecen con `journey-layout.ts`: ya no hay paginación del recorrido.
- Pendientes que se conservan (DC20): G-ALQ, diagnóstico de Recoletos, D13 y validación del PDF representativo.

## PR B · Asignaciones, opiniones y avisos

En curso; se registra aquí al terminar.
