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
PR7b Acabado visual (tras aprobar las propuestas)
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

## PR4 · Base multilingüe del lector (sin IA)

| Tarea | Contenido |
| --- | --- |
| 4.1 | Diccionario del catálogo en los 8 idiomas sobre la maquinaria del itinerario (`COLLECTION_LANGUAGES`, `isRtl`, `intlLocale`, `TRANSLATION_REVIEW_REQUIRED`): etiquetas del lector, secciones, valoraciones, errores, estados, operación, precio «sin dato», planta y formato numérico. Textos fijos escritos en el PR y revisados por Fabricio; ar, tr y he con la marca «sin revisión nativa». |
| 4.2 | Migración `0222_catalog_languages.sql` + reversión: `catalogs.default_lang` y `catalog_client_links.lang` (con la misma lista y comprobación que 0130/0134), en la lectura coherente (el idioma entra en la huella). Hasta PR6 solo se puede elegir `es`; los demás idiomas se prueban con fixtures. |
| 4.3 | Lector: `lang` y `dir` en su raíz, RTL con la navegación reflejada según N2 y la composición intacta; cifras, teléfonos y precios en LTR; familias árabe y hebrea por `next/font` según N3 (sin paquetes nuevos). |
| 4.4 | Pruebas: claves completas en los 8 idiomas, mismas dos pantallas en LTR y RTL, teclado y deslizar en RTL, sin desbordes a 390 px, capturas por idioma con contenido de fixtures. |

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

## PR7a · Resolución de portada y PDF (sin cambio de diseño)

`srcset` en la portada del lector y anchos de foto del PDF acordes a su tamaño impreso (portada a página completa). Pruebas: cabecera de variante del proxy, peso por página y número de páginas del PDF iguales.

## PR7b · Acabado visual (tras su aceptación visual)

**Requisito previo:** comparación con **fotos reales de catálogos**: una luminosa, una realmente oscura y una normal, incluida la del ejemplo de Fabricio. Las tiene que aportar o señalar Fabricio, porque los agentes no acceden a fotos de producción. Tras esa comparación, aceptación visual de Fabricio del tratamiento concreto (N4).

| Tarea | Contenido |
| --- | --- |
| 7.1 | Variante tratada en el servicio de fotos `/p` (parámetro propio, cacheada, original intacto), con la receta aceptada y medidas por foto. **Activación por catálogo** (desactivada por defecto en todos, también en los existentes) y opción por foto para quitarla (N4). |
| 7.2 | Acabados CSS aprobados en apertura y portada; equivalentes vectoriales en el PDF. |
| 7.3 | Pruebas: AC14, comparación de capturas de las dos pantallas (posiciones y tamaños iguales), contraste del título de portada ≥ 4,5:1 con fotos claras, altas luces quemadas no aumentan, rendimiento (peso por foto). |

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

- **N5** (antes del PR6).
- La aceptación visual del acabado con fotos reales (antes del PR7b).

N1–N4 ya están cerradas.

## Pasos de entorno (aprobados con el plan el 21-10-2026)

- Worktree por PR desde `origin/main` y `node_modules` clonado de un worktree con el mismo `package-lock.json` (sin `npm install`).
- Postgres 16 temporal local (`BCP_PG_DIR` en el scratchpad).
- Servidor de fixtures (`scripts/dev-fixtures.sh`).
- Chromium de Playwright ya en caché.
- Descarga única de los archivos de fuentes OFL de N3 desde Google Fonts o Fontsource (PR4 y PR5). Es la única petición de red nueva y no ejecuta código.
- Sin archivos `.env` del repositorio en el entorno de pruebas (el servidor de fixtures se niega a arrancar si los hay). Sin credenciales heredadas, paquetes nuevos ni servicios de pago. Ninguna llamada real a la IA.
