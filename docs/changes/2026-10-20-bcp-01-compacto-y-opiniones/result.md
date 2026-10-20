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

- **Rama:** `fabri/bcp-01-opiniones` (worktree `wt/bcp-01-opiniones`), sobre `fabri/bcp-01-lector-compacto` (PR A). Se rebasa sobre `main` cuando A se fusione.
- **Migración:** `0218_catalog_client_feedback.sql` con `rollback-0218.sql`. Ningún PR abierto usa 0217 ni 0218; `main` acaba en 0216.

### Qué hace

- **Asignar a cliente (Compartir).** El dueño busca un cliente del CRM dentro de su alcance de `clientes` · ver, elige duración y crea su enlace personal. Lista de asignaciones con estado, caducidad, número de opiniones, copiar, renovar y revocar. No se envía nada: el enlace lo manda Fabricio.
- **Enlace personal.** Abre el mismo catálogo (misma instantánea y huella que el enlace general, mismo PDF). En la pantalla 2 de cada vivienda aparece «Tu opinión»: 1–5 estrellas y comentario opcional de hasta 1.000 caracteres. «Guardado» solo cuando la ruta confirma la escritura. El enlace general no lo muestra y la ruta lo rechaza.
- **Servidor.** El navegador solo manda la clave pública de la vivienda, las estrellas y el comentario. Token → asignación → cliente → vivienda se resuelve en SQL, con caducidad, revocación y archivado comprobados en cada escritura. Un envío igual al guardado no escribe ni avisa.
- **Ficha del cliente.** Tarjeta en Resumen y bloque «Opiniones de catálogos» en Propiedades: vivienda (título que veía), catálogo, estrellas, comentario, fecha, «ya no está en el catálogo» si salió, y sus enlaces personales.
- **Avisos.** Uno por opinión en `crm_notifications` para su asesor (o el dueño del catálogo si no tiene); si hay uno sin leer de la misma opinión, se actualiza. Se ven en la campana y se marcan leídos al abrirlos. El contador de Captaciones no los cuenta. Sin correo ni WhatsApp.

### Verificación

| Comprobación | Resultado |
| --- | --- |
| SQL en Postgres 16 temporal: `test-catalog-feedback.sql` (58 casos) dentro de `scripts/sql/test-catalogs-core.sh`: enlace previo con la misma huella, 0218 aplicada dos veces, solo el dueño asigna y solo a clientes, una vigente, dos clientes con la misma vivienda, validación, reintento sin aviso, edición que actualiza el aviso sin leer, aviso nuevo tras leerlo, asesor o dueño, reorden, vivienda retirada y borrada (histórico), caducado, revocado, archivado, permisos de anon y authenticated, reversión y reaplicación; título de 0217 con 0218 encima | ✅ batería completa en verde |
| `test:catalogs-feedback` (62 comprobaciones, nuevo en la CI): validación, la lógica real de la ruta contra el almacén sintético (dos clientes, enlace general rechazado, identidad del navegador ignorada, reintento, edición, reorden, retirada, caducado, revocado, asignación nueva) y comprobaciones de fuente (sin canal externo, contador de Captaciones, contrato público y PDF sin opiniones) | ✅ |
| Todas las suites de la CI, `tsc`, `lint-migrations.py`, `next build` (`NEXT_BUILD_DIR=.next.qa`, `tsconfig.json` restaurado) | ✅ |
| QA en Chromium con fixtures (23 comprobaciones): general sin formulario; personal solo en la pantalla 2; teclado en las estrellas y el comentario sin pasar página; guardar, recargar y verlo; reintento idéntico; otro cliente independiente; móvil 390 sin desbordes; gestor (lista, búsqueda, crear); revocar con el lector abierto lo deja «no disponible» al momento; ficha y aviso único; sin errores de consola | ✅ |
| QA del lector de PR A sobre esta rama (giro, teclado, galería, fotos fallidas, D12, ventana baja, enlace no válido) | ✅ |

### Capturas

[`capturas-b/`](capturas-b/): «Tu opinión» en el detalle a 1440 y 390, opinión guardada, «Asignar a cliente» en el gestor y la ficha sintética con el aviso interno.

### Pendiente o no demostrado (B)

- La ficha real del cliente y la campana se han comprobado con `tsc`, `next build` y la ficha sintética; no hay sesión del CRM en local. La guarda de acceso de la ficha es la de siempre (`clientes` · ver con alcance).
- Las rutas y acciones reales contra Supabase solo se ejercitan en producción; aquí, las funciones SQL en el Postgres temporal y la lógica de la ruta contra el almacén sintético.
- Safari real no se ha ejecutado.
- El límite de escrituras (30 por minuto y enlace) vive en memoria del proceso, como el resto de límites del lector.
- Pendientes que se conservan (DC20): G-ALQ, diagnóstico de Recoletos, D13 y validación del PDF representativo.

### Efectos al fusionar (para Fabricio)

El merge de B a `main` aplica 0218 en el despliegue: crea dos tablas vacías, redefine `get_public_catalog` y `get_catalog_states` (los enlaces generales siguen igual, misma huella) y añade funciones nuevas. Hasta que se asigne un catálogo a un cliente no cambia nada visible, salvo «Asignar a cliente» en Compartir. Reversión: `rollback-0218.sql` (borra asignaciones y opiniones; copiar antes si hay que conservarlas).
