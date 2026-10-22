# BCP-01 · Ampliación: textos reutilizables, idiomas, «Vivir en…» y acabado visual — plan

**Especificación:** [`spec.md`](spec.md) (DA1–DA37, N1–N4 cerradas, N5 abierta para el PR6, AC1–AC14). **Estado:** **aprobado por Fabricio el 21-10-2026** con las correcciones DA31–DA37. Se ejecuta PR a PR en orden de dependencias. En curso: **PR1**.

**Antes de cada merge** Claude se detiene y entrega a Fabricio: el PR concreto, el resultado de la CI, los efectos de la migración, qué implica la reversión y las instrucciones de QA en producción. Fabricio hace el merge y la QA; después se sigue con el siguiente PR sin volver a pedir permisos ordinarios.

## Reglas comunes a todos los PR

- Cada PR en su rama, desde un SHA de `origin/main` del momento, en un worktree aislado. El merge lo hace Fabricio; el siguiente PR parte de `main` ya con el anterior.
- Número de migración: el siguiente libre **al empezar cada PR**, comprobado contra `main` y los PR abiertos. Hoy sería 0219; los números de abajo son orientativos.
- Toda migración lleva su `rollback-NNNN.sql`. Se prueba solo en el Postgres 16 temporal (`scripts/sql/run-local.sh`, `scripts/sql/test-catalogs-core.sh`): aplicada dos veces, reversión y reaplicación, con datos sintéticos. Permisos: RLS sin políticas, solo `service_role`; las funciones del dueño pasan por `catalog_require_owner`.
- IA siempre **inyectada** y **simulada** en las pruebas de agentes, con un contador de llamadas para comprobar «cero llamadas» en lo público. Ninguna llamada real a DeepSeek.
- Verificación en cada PR: tests puros nuevos en la CI, todas las suites existentes, `tsc`, `lint-migrations.py`, `next build` (`NEXT_BUILD_DIR=.next.qa`), PDF reales por el hilo (`check-catalog-pdfs.mts`), QA en Chromium con fixtures a 1440 y 390, y capturas en el expediente.
- Nada en producción, credenciales ni datos reales. Revisión de Codex solo si Fabricio la pide.

## Orden y dependencias

La biblioteca de textos y su versionado van **antes** que las traducciones, que cuelgan de una versión aprobada. Zonas y plantillas van antes de traducir, para que la sección «Vivir en…» también tenga su versión. El acabado visual es independiente y espera la aprobación de Fabricio.

```
PR1 Biblioteca de textos ──► PR2 Zonas ──► PR3 Plantillas «Vivir en…» ──┐
                                                                       ├──► PR6 Traducciones
PR4 Base multilingüe (sin IA) ──► PR5 PDF multilingüe y fuentes ───────┘
PR7a Resolución de portada y PDF (independiente, pequeño)
PR7b Acabado visual (juicio visual delegado por Fabricio el 22-10-2026)
```

## PR1 · Biblioteca de textos aprobados y reutilización

Rama `fabri/bcp-01-textos-aprobados` desde `origin/main` = `8b640e3b` (comprobado el 21-10-2026; última migración 0218 y ningún PR abierto con 0219 o posterior).

| Tarea | Contenido |
| --- | --- |
| 1.1 | Migración `0219_catalog_copy_library.sql` + `rollback-0219.sql`. Tabla `property_copy_versions` (dueño, vivienda, número correlativo, **título** y **descripción** como partes independientes, huella y hechos de la ficha **de la descripción**, catálogo de origen y fecha de cada parte, tipo de cambio, huella del contenido). Columna `catalog_texts.copy_version_id` (de qué versión salió una copia). RLS sin políticas, solo `service_role`. |
| 1.2 | Funciones del dueño. `catalog_copy_approve(actor, catálogo, vivienda, partes)`: aprueba **lo publicado** en ese catálogo (título, descripción o ambos). Las partes no aprobadas se arrastran tal cual con su huella (DA32). Rechaza una descripción no vigente (`text_stale`). Es idempotente si el contenido no cambia y se serializa por dueño y vivienda. `catalog_copy_withdraw(actor, vivienda, parte)` retira el título, la descripción o todo. `catalog_copy_state(actor, viviendas)` devuelve la versión vigente, si su descripción sigue vigente y qué cambió. `catalog_copy_candidates(actor)` lista para la siembra lo publicado en sus catálogos, con la marca «posiblemente personalizado» si el catálogo tiene asignaciones. |
| 1.3 | `catalog_add_property` (redefinida): tras añadir, **solo si el catálogo no tiene ningún texto de esa vivienda**, copia la última versión con contenido como texto publicado del catálogo. El borrador es igual a lo publicado y lleva la huella de la versión: C2 decide si la descripción se ve. Sin versión: todo igual. Conversión (0213) y cambio de modo (0196) no pasan por aquí: no reutilizan (DA33). |
| 1.4 | Gestor: casilla «Guardar como texto aprobado de la vivienda», **desmarcada** (N1), junto a «Publicar». Bloque «Texto aprobado de la vivienda» en el editor: versión, origen, aviso «revisar» si la ficha cambió, «Aprobar lo publicado aquí» (título, descripción o ambos), «Usar en este catálogo» (solo rellena el editor) y «Retirar título / descripción». Página «Textos aprobados» de la HOME con la biblioteca y los candidatos de siembra (confirmación uno a uno o en bloque, sin IA). |
| 1.5 | Pruebas SQL (Postgres temporal): aprobar y reutilizar; publicar sin aprobar no reutiliza; título solo conserva la descripción y su validez; retirar partes; idempotencia; aprobaciones simultáneas; otro dueño sin acceso; borrador nunca aprobable; descripción no vigente rechazada; reutilización con ficha cambiada (C2); entrada con texto, borrador o reserva no se pisa; conversión y cambio de modo sin cambios; CRM y otros catálogos intactos; permisos de anon y authenticated; reversión y reaplicación. Pruebas TS de la capa pura y QA en Chromium con fixtures. |

## PR2 · Registro de zonas y clasificación de viviendas

| Tarea | Contenido |
| --- | --- |
| 2.1 | Migración `0220_catalog_areas.sql` + reversión: `catalog_areas` (id estable `madrid/<distrito>/<barrio>`, nivel, nombre, distrito, alias) generada desde la taxonomía de 0195 y cruzada con `neighborhoods`; `catalog_property_areas` (dueño, vivienda, zona, método, evidencia, estado: automática, confirmada, ambigua o sin clasificar). |
| 2.2 | Clasificador determinista con paridad TS↔SQL: exacto sobre `subzone` y luego `zone`; conflicto si el barrio no es del distrito; ambiguo si el término es también calle y la dirección lo nombra como calle; pistas sueltas sin clasificar. Una decisión humana nunca se pisa. |
| 2.3 | Gestor: aviso «Zona por confirmar» en la vivienda, con opciones. Nada escribe en `properties`. |
| 2.4 | `structure.ts`: el nombre de la zona deja de ser palabra clave cuando va precedido de calle, paseo, avenida o plaza. «Vivir en {zona}» usa el nombre del registro solo con clasificación confirmada o automática sin conflicto; si no, queda el comportamiento de hoy, sin presentarlo como verificado y sin plantilla (DA37). |
| 2.5 | Pruebas: AC11 con Castellana, Goya, Lista, Almagro e Ibiza como calles; Chueca/Justicia; distrito en `subzone`; casi-duplicados; la estructura de #341 sigue en verde. |

**Ajustes al implementar el PR2 (21-10-2026):**
- **«Vivir en…» solo con confirmación humana vigente**, más prudente que 2.4. La clasificación automática se enseña solo en el gestor como sugerencia y nunca cambia sola un catálogo compartido. Sin confirmación, el lector queda como hoy. Una confirmación deja de valer si cambian la zona, el barrio o la dirección de la ficha. Motivo: DA37 y nada de cambios silenciosos en catálogos ya enviados.
- **El clasificador solo existe en TS**, en el gestor y al leer. SQL guarda solo la confirmación y su huella. Así no hay dos clasificadores que mantener en paridad. Lo que se vigila es que el registro de `lib/catalogs/areas.ts` y las filas de 0220 no se separen.
- **El cruce con `neighborhoods` pasa al PR3**, que es quien usa sus textos. `neighborhoods` incluye zonas de fuera del municipio, como Somosaguas o Torrelodones, que no están en el registro de Madrid.
- **Confirmación por dueño:** vale en todos sus catálogos y nunca en los de otro dueño.

## PR3 · Plantillas «Vivir en…»

| Tarea | Contenido |
| --- | --- |
| 3.1 | Migración `0221_area_texts.sql` + reversión: `area_text_versions` (dueño, zona, número, texto, estado, origen); `catalog_texts.area_text` y `area_version_id` (copia congelada en el catálogo). |
| 3.2 | Siembra como **borradores** desde las 29 introducciones de `neighborhoods`, sin IA; revisión obligatoria (DA26). «Borrador con IA» genérico por zona solo al pulsar, con IA simulada en pruebas. |
| 3.3 | Organizador: entrada `areaText` que solo se usa si la descripción propia no tiene material de zona (DA25); misma clave de sección `barrio`. |
| 3.4 | Al copiar un texto aprobado (PR1) o con «Aplicar plantilla», el catálogo guarda su copia; actualizar la plantilla no cambia catálogos compartidos. |
| 3.5 | Pruebas: AC12, sin duplicar con texto propio de zona, cero llamadas a la IA al elegir, PDF y lector con la misma sección. |

**Ajustes al implementar el PR3 (21–22-10-2026):**
- **Migración 0222, no 0221.** La 0221 la ocupó otro cambio (particulares) que entró en `main` antes.
- **La copia del catálogo va en una tabla propia** (`catalog_area_copies`), no en columnas de `catalog_texts`. Así «Borrar texto», la regla de reutilización del PR1 («solo entradas sin ningún texto») y el diagnóstico de textos no cambian de significado.
- **Solo se aplica con la zona confirmada y vigente** (PR2, DA37). Se usa la plantilla del barrio o, si el barrio no tiene, la de su distrito (DA23).
  - Si después cambia o caduca la confirmación, la copia deja de verse, se conserva y el editor avisa.
- **Siembra con un botón y sin IA.** Está en «Mi espacio → Plantillas de zona» y lee `neighborhoods` en ese momento, así que también recoge filas añadidas en producción.
  - Asigna a una zona del registro solo por nombre exacto y con el distrito compatible.
  - Las 5 de fuera del municipio de Madrid se enseñan y no se traen.
  - Nunca toca una zona que ya tenga versiones.
- **La ficha breve («solo datos») no cambia:** sin descripción no se inventa un apartado solo con la zona.
- **«Borrador con IA» devuelve una propuesta que rellena el cuadro.** Hay que guardarla como borrador y aprobarla a mano.
- **Aprobar exige que el borrador sea exactamente el que se vio** (`draft_changed`). Los avisos de DA26 (distancias, vistas, servicios del edificio, estancias, agencia) piden confirmación; contacto y precio bloquean.

## PR4 · Base multilingüe del lector (sin IA)

| Tarea | Contenido |
| --- | --- |
| 4.1 | Diccionario del catálogo en los 8 idiomas sobre la maquinaria del itinerario (`COLLECTION_LANGUAGES`, `isRtl`, `intlLocale`, `TRANSLATION_REVIEW_REQUIRED`): etiquetas del lector, secciones, valoraciones, errores, estados, operación, precio «sin dato», planta y formato numérico. Textos fijos escritos en el PR y revisados por Fabricio; ar, tr y he con la marca «sin revisión nativa». |
| 4.2 | Migración `0222_catalog_languages.sql` + reversión: `catalogs.default_lang` y `catalog_client_links.lang` (con la misma lista y comprobación que 0130/0134), en la lectura coherente (el idioma entra en la huella). Hasta PR6 solo se puede elegir `es`; los demás idiomas se prueban con fixtures. |
| 4.3 | Lector: `lang` y `dir` en su raíz, RTL con la navegación reflejada según N2 y la composición intacta; cifras, teléfonos y precios en LTR; familias árabe y hebrea por `next/font` según N3 (sin paquetes nuevos). |
| 4.4 | Pruebas: claves completas en los 8 idiomas, mismas dos pantallas en LTR y RTL, teclado y deslizar en RTL, sin desbordes a 390 px, capturas por idioma con contenido de fixtures. |

**Ajustes al implementar el PR4 (22-10-2026):**
- **Migración 0223, no 0222.** La 0221 (particulares) y la 0222 (plantillas «Vivir en…», PR3) ya estaban ocupadas al empezar.
- **Tanda 1 en paralelo.** El PR4, el PR7a y la prueba técnica del PR5 se hacen a la vez en worktrees separados, con PR y merges independientes. **PR7b queda aplazado** hasta que Fabricio aporte las fotos reales.
- **N5 decidida** por Fabricio el 22-10-2026 (ver `spec.md` §6): aviso «Descripción en preparación». El PR6 ya no tiene decisiones pendientes.
- **El idioma entra en la instantánea siempre** (`lang`, también en español), así que al desplegar todas las huellas cambian una vez y los lectores abiertos reciben una actualización sin cambios visibles. Es más simple y explícito que añadirlo solo fuera del español, y es lo que harán las traducciones del PR6.
- **El PDF sigue en español** pase lo que pase con el idioma del enlace (`toPublicCatalog(…, "es")` en `generate.ts`): el PR5 es quien le pasa el idioma, con sus fuentes.
- **La composición no se refleja en RTL** ni en la apertura (foto | panel) ni en el detalle (dos paneles): mismas cajas que en español (DA1, DA2, N2). Sí se reflejan el texto, el índice, la barra, las flechas, el teclado, el deslizar, el giro de página y la galería.
- **Las cifras, los precios y el teléfono van siempre en LTR** (`dir="ltr"`, que aísla la dirección) y con dígitos latinos (el árabe usa `ar-u-nu-latn`, como el itinerario).
- **Los títulos de las secciones de la descripción siguen con el contenido** (en español, del organizador) hasta el PR6: el diccionario ya tiene los ocho títulos y «Vivir en {zona}», pero traducir solo los títulos mezclaría idiomas en el mismo bloque (DA34). El PR6 pasará la clave de sección con cada bloque traducido.
- **Sin selector de idioma en el gestor** hasta el PR6 (la interfaz solo puede dar «es»): las funciones SQL del dueño existen y se prueban; los demás idiomas se prueban con la operación `lang` del almacén sintético.
- **Enlace no válido al abrir** (inexistente, revocado o caducado desde el principio): la página no conoce ningún idioma, así que el aviso va en español. Si el enlace deja de valer con el lector abierto, el aviso va en el idioma del enlace.
- **La galería a pantalla completa** (portal fuera de la raíz del lector) recibe la dirección y los rótulos del idioma, pero no las familias árabe y hebrea (usa las del sistema para esos rótulos). Es un detalle de dos rótulos; se anota para el PR5/PR6 si se quiere afinar.
- **Tipografía en ar y he:** se anula el espaciado entre letras de las etiquetas (rompería el árabe ligado y en hebreo no aporta); las familias latinas quedan detrás como respaldo de glifos.

## PR5 · PDF multilingüe y fuentes

| Tarea | Contenido |
| --- | --- |
| 5.1 | **Prueba técnica primero** con PDF reales renderizados de fixtures en árabe y hebreo con las fuentes de N3: letras unidas, orden visual por línea (comprobado sobre la imagen de la página, no solo con la extracción), índice y enlaces internos. Si la extracción de PDFKit no devuelve orden lógico, la verificación se adapta **sin rebajarla**: contenido completo por bloque, orden visual comprobado en la imagen rasterizada y glifos presentes (DA35). |
| 5.2 | Recursos nuevos en `lib/pdf/fonts/` con su OFL y sha256 en el README: Noto Naskh Arabic, Frank Ruhl Libre, Noto Sans Hebrew y la cobertura ampliada de Playfair, Cinzel e Inter. Archivos estáticos descargados una vez de Google Fonts o Fontsource. Se verifica con fontTools la cobertura real de glifos. Los idiomas que ya funcionan siguen usando exactamente sus fuentes actuales. |
| 5.3 | `document.ts`: textos del diccionario, mayúsculas y números según el idioma, sin espaciado entre letras en árabe y hebreo, dirección RTL del texto, filas reflejadas a mano donde haga falta, metadatos de idioma. |
| 5.4 | Verificación (`pdf-verify.mts`, `check-catalog-pdfs.mts`): cadenas esperadas por idioma, fuentes permitidas por idioma, glifos por idioma (ğ İ ş, Ÿ, árabe, hebreo). |
| 5.5 | Pruebas (DA35): en cada idioma, contenido completo, destinos del índice correctos, sin cortes ni bloques perdidos y tipografía legible. **No** se exige el mismo número de hojas que en español. El hilo del PDF y sus protecciones quedan intactos. |

## PR6 · Traducciones preparadas y revisadas

**Requisito previo:** decisión **N5** de Fabricio (vivienda sin traducción vigente).

| Tarea | Contenido |
| --- | --- |
| 6.1 | Migración + reversión. Fuentes de traducción con identidad de versión (DA31): una versión de la biblioteca o la publicación propia del catálogo, del dueño. Traducciones por fuente e idioma con bloques por clave de sección. Traducciones de plantillas de zona y de características (por cadena exacta e idioma, del dueño). Copias por catálogo, vivienda e idioma con la huella del texto español publicado. Trabajos de preparación con estado: reservado (caducidad e identificador), cancelado, incierto, fallido o terminado. |
| 6.2 | Preparar solo al pulsar, solo el idioma pedido y solo lo que falta. Reserva única por fuente e idioma: quien llega después ve «en preparación». Al terminar, solo guarda el trabajo cuya reserva siga vigente y sea suya; el resultado de uno caducado o cancelado se descarta y se registra. Un tiempo agotado tras enviar queda como **incierto**, sin reintento automático, y el gestor avisa de que pudo cobrarse. Instrucción que conserva nombres propios, cifras, precios y zonas, más la comprobación determinista de cifras, contactos y precios. Nunca escribe en `property_client_descriptions`. |
| 6.3 | Revisión en el gestor: original y traducción por bloque; editar, aprobar o rechazar; progreso por idioma; aviso «sin revisión nativa» en ar, tr y he. |
| 6.4 | Activación y vigencia: el idioma de un enlace o del catálogo cambia cuando está completo. Republicar el español deja la traducción desactualizada (nunca vigente). Los datos operativos salen siempre de la instantánea actual y C2 se aplica en cada idioma (DA34). Vivienda sin traducción vigente: según N5. |
| 6.5 | Lectura pública por idioma: instantánea con idioma y huella por idioma; vigilante, lectura coherente y PDF por token. Visitas, valoraciones y PDF públicos nunca preparan ni llaman a la IA. Valoraciones sin cambios. |
| 6.6 | Pruebas con IA simulada que cuenta llamadas: cero en lo público; peticiones simultáneas que lanzan un solo trabajo; trabajo caducado que no pisa; cancelación; resultado incierto sin reintento; dos clientes en dos idiomas en vivo y PDF; texto propio traducido sin entrar en la biblioteca; vivienda retirada, foto excluida y precio cambiado en idioma activo; C2 en cada idioma. |

**Ajustes al implementar el PR6 (22-10-2026):**
- **Migración 0226, no 0224.** Mientras se hacía el PR entró en `main` la `0224_crm_host_to_portal.sql` (#350) y la 0225 está reservada para el PR5.
- **La fuente «propia» del catálogo es lo que el catálogo enseña en español**: su texto publicado o, si no lo tiene, la historia o la descripción limpia que se ve. Así toda vivienda que el cliente ve en español se puede traducir. Es de la **biblioteca** solo si el texto publicado es exactamente una versión aprobada (la que trajo o la que se aprobó ahí); entonces su traducción se reutiliza sin IA en los otros catálogos con esa versión. Traducir lo propio nunca lo lleva a la biblioteca.
- **Una vivienda, una unidad.** Título y bloques se traducen juntos en una llamada, con la plantilla de zona y las características que falten; la plantilla y las características se guardan aparte y se reutilizan.
- **Vigencia por huella del español mostrado** (título + bloques con su clave + plantilla), comprobada al leer, igual que la vigencia de la historia. Cubre republicar el español, cambiar la zona confirmada o la plantilla y C2.
- **Desactualizada → N5, no la traducción anterior.** La spec permitía seguir enseñando la anterior mientras cumpliera C2; N5 (decidida después) y DA34 piden no presentar nunca una desactualizada, y la zona o la plantilla no entran en C2. Se eligió lo más prudente: «Descripción en preparación» hasta aprobar la nueva. El gestor lo avisa antes y después. Si Fabricio prefiere lo otro, es una condición en `applyItemTranslation`.
- **Título provisional en N5:** «Home in {zona}» del diccionario (o «Sin título» en el idioma si no hay zona), para no enseñar el título español.
- **Título e introducción del catálogo también se traducen** (si no, la portada y el índice saldrían en español). Si el español cambia después, el cliente sigue viendo el título traducido anterior, que el gestor marca «desactualizado» (no tiene datos de la ficha); sin ninguno, el nombre del catálogo y sin introducción.
- **Características sin traducción aprobada no se ven** fuera del español (no se mezcla el español); el gestor las cuenta («faltan N características») y bloquean la activación.
- **«Completo» = todas las viviendas de la lista** (también las de solo datos: su título), sus características y el título del catálogo.
- **Pestaña «Idiomas»** en el gestor (quinta sección) en vez de repartirlo entre «Contenido» y «Compartir»; «Contenido» lleva el aviso N5. No se añade nada a «Textos aprobados».
- **Activación con la versión del catálogo:** la gestión calcula la huella de cada vivienda y la base de datos comprueba que no cambió nada desde entonces (`catalog_changed`), que están todas las de la lista y que cada copia tiene esa huella y sus características. Un cambio de la ficha entre medias (que no sube la versión) solo puede dejar esa vivienda en N5.
- **Tiempos:** la llamada se corta a los 120 s (incierto) y la reserva caduca a los 300 s.

## PR7a · Resolución de portada y PDF (sin cambio de diseño)

`srcset` en la portada del lector y anchos de foto del PDF acordes a su tamaño impreso (portada a página completa). Pruebas: cabecera de variante del proxy, peso por página y número de páginas del PDF iguales.

## PR7b · Acabado visual

**Requisito previo (sustituido por decisión de Fabricio del 22-10-2026):** ~~comparación con fotos reales de catálogos aportadas por Fabricio y su aceptación visual del tratamiento concreto (N4)~~. Fabricio delega la selección de fotos y el juicio visual: fotos representativas dentro de los permisos existentes, criterio propio y un acabado **contenido**, con cualquier foto oscura de ejemplo rotulada «simulada». Sin más aprobación para decisiones estéticas rutinarias (spec.md DA30/N4).

| Tarea | Contenido |
| --- | --- |
| 7.1 | Variante tratada en el servicio de fotos `/p` (parámetro propio, cacheada, original intacto), con la receta aceptada y medidas por foto. **Activación por catálogo** (desactivada por defecto en todos, también en los existentes) y opción por foto para quitarla (N4). |
| 7.2 | Acabados CSS aprobados en apertura y portada; equivalentes vectoriales en el PDF. |
| 7.3 | Pruebas: AC14, comparación de capturas de las dos pantallas (posiciones y tamaños iguales), contraste del título de portada ≥ 4,5:1 con fotos claras, altas luces quemadas no aumentan, rendimiento (peso por foto). |

**Ajustes al implementar el PR7b (22-10-2026):**
- **Decisión de Fabricio del 22-10-2026** (delega fotos y juicio visual): fotos usadas = `public/portal-hero.jpg` y `public/login-bg.jpg` (las únicas fotografías reales del repositorio), un recorte real de `login-bg` para el tono medio y una oscura **simulada** (`login-bg` a −1,7 EV), rotulada así en capturas y documentación.
- **Migración 0227** (la 0225 queda sin usar). `catalogs.photo_finish` (apagado en todos) y, para «Sin acabado en esta foto», el tipo nuevo `no_finish` en `catalog_photo_prefs` (misma tabla, claves y limpieza que E3). Hubo que **redefinir `catalog_internal_snapshot`** (la de 0222): el ajuste por foto reutiliza la tabla de E3 y su lectura agrupaba todas las filas; ahora filtra por tipo, y `fin`/`pp.n` solo aparecen con el acabado activo. Apagado, instantánea y huella idénticas (probado en SQL).
- **El acabado viaja en la ruta de la foto** (`&t=1`, la versión de la receta): el contrato público no gana campos; lector, miniaturas, portada, HOME, vista previa de Diseño y PDF saben si una foto va tratada por su ruta. El filete acompaña a la foto tratada (si la apertura o la portada están marcadas «sin acabado», tampoco llevan filete).
- **Acabado contenido**: del acabado propuesto quedan el tono adaptativo y un filete interior de 1 px blanco translúcido en apertura y portada. **Fuera**: las esquinas doradas, el degradado inferior y la rebaja del velo plano (25 % → 8 %), para que el contraste del título no dependa del acabado.
- **Contraluz**: una foto oscura con ventanas quemadas no se aclara (va con la receta luminosa: solo recupera altas luces). La receta oscura es solo para subexpuestas de verdad (media < 0,36 y P98 < 0,93).
- **Dominante**: solo se corrige sobre superficies casi neutras (un cielo o un mar azules no son dominante), un 30 % de la desviación y como mucho un 3 % por canal.
- **Autocomprobación**: cada receta se ensaya sobre la muestra con la que se mide y se suaviza (hasta tres veces) si incumple sus límites; si no hay forma, la foto queda sin cambio.
- **Gestor**: en «Diseño», el interruptor «Acabado fotográfico»; en el panel de fotos de cada vivienda, la casilla «Sin acabado en esta foto» (solo con el acabado activo; las marcas se conservan al apagarlo). Las miniaturas de ese panel se ven tratadas cuando aplica.
- Test nuevo en la CI `test:catalogs-finish` y QA en Chromium `fin-qa`.

## Decisiones rutinarias (las toma Claude y se anotan)

- Nombres de tablas y funciones, números de migración y reparto en PR.
- Reserva con caducidad para evitar llamadas duplicadas a la IA.
- Huellas de contenido para la idempotencia.
- Texto de los avisos del gestor.
- Paridad TS↔SQL del clasificador.
- Formato de los diccionarios.
- Fuentes estáticas en vez de variables.
- La forma exacta de adaptar la verificación de PDF a RTL, tras la prueba técnica.

## Decisiones de producto pendientes

- ~~La aceptación visual del acabado con fotos reales (antes del PR7b).~~ Delegada por Fabricio el 22-10-2026 (spec.md DA30/N4).

N1–N5 ya están cerradas (N5 el 22-10-2026).

## Pasos de entorno (aprobados con el plan el 21-10-2026)

- Worktree por PR desde `origin/main` y `node_modules` clonado de un worktree con el mismo `package-lock.json` (sin `npm install`).
- Postgres 16 temporal local (`BCP_PG_DIR` en el scratchpad).
- Servidor de fixtures (`scripts/dev-fixtures.sh`).
- Chromium de Playwright ya en caché.
- Descarga única de los archivos de fuentes OFL de N3 desde Google Fonts o Fontsource (PR4 y PR5). Es la única petición de red nueva y no ejecuta código.
- Sin archivos `.env` del repositorio en el entorno de pruebas (el servidor de fixtures se niega a arrancar si los hay). Sin credenciales heredadas, paquetes nuevos ni servicios de pago. Ninguna llamada real a la IA.
