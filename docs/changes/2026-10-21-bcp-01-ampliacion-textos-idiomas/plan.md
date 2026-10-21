# BCP-01 · Ampliación: textos reutilizables, idiomas, «Vivir en…» y acabado visual — plan

**Especificación:** [`spec.md`](spec.md) (DA1–DA30, N1–N4, AC1–AC14). **Estado:** propuesto, sin aprobar ni implementar.

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

| Tarea | Contenido |
| --- | --- |
| 1.1 | Migración `0219_catalog_copy_library.sql` + reversión: `property_copy_versions` (dueño, vivienda, número, título, descripción, huella y hechos de la ficha, origen, retirada, huella del contenido); `catalog_texts.copy_version_id` (de qué versión salió la copia). |
| 1.2 | Funciones del dueño: `copy_approve` (desde lo **publicado** del catálogo, serializada por dueño y vivienda, idempotente por huella de contenido), `copy_retire`, `copy_candidates` (siembra de solo lectura, con la marca «posiblemente personalizado» si el catálogo tiene asignaciones de 0218) y `copy_states` (vigente, revisar por cambio de ficha). |
| 1.3 | Reutilizar al añadir: `catalog_add_property` y las altas por conversión (0213) copian la última versión vigente como texto **publicado** del catálogo, con la huella de la versión (regla C2 intacta). Sin versión: nada cambia. |
| 1.4 | Gestor: casilla «Guardar como texto aprobado de la vivienda» al publicar (valor por defecto según N1); bloque «Texto aprobado» con versión, origen y «revisar»; pantalla de siembra con confirmación uno a uno o en bloque. |
| 1.5 | Pruebas SQL y TS: AC1–AC5, títulos solos, contenido idéntico sin versión nueva, aprobación simultánea, otro dueño sin acceso, borrador y texto personal nunca copiados, ficha cambiada (C2), CRM intacto. |

## PR2 · Registro de zonas y clasificación de viviendas

| Tarea | Contenido |
| --- | --- |
| 2.1 | Migración `0220_catalog_areas.sql` + reversión: `catalog_areas` (id estable `madrid/<distrito>/<barrio>`, nivel, nombre, distrito, alias) generada desde la taxonomía de 0195 y cruzada con `neighborhoods`; `catalog_property_areas` (dueño, vivienda, zona, método, evidencia, estado: automática, confirmada, ambigua o sin clasificar). |
| 2.2 | Clasificador determinista con paridad TS↔SQL: exacto sobre `subzone` y luego `zone`; conflicto si el barrio no es del distrito; ambiguo si el término es también calle y la dirección lo nombra como calle; pistas sueltas sin clasificar. Una decisión humana nunca se pisa. |
| 2.3 | Gestor: aviso «Zona por confirmar» en la vivienda, con opciones. Nada escribe en `properties`. |
| 2.4 | `structure.ts`: el nombre de la zona deja de ser palabra clave cuando va precedido de calle, paseo, avenida o plaza; «Vivir en {zona}» usa el nombre del registro si hay clasificación confirmada o automática sin conflicto (si no, el comportamiento de hoy). |
| 2.5 | Pruebas: AC11 con Castellana, Goya, Lista, Almagro e Ibiza como calles; Chueca/Justicia; distrito en `subzone`; casi-duplicados; la estructura de #341 sigue en verde. |

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
| 5.1 | **Prueba técnica primero**: PDF de fixtures en árabe y hebreo con la fuente elegida; comprobar letras unidas, orden visual y extracción de texto con PDFKit. Si la extracción no devuelve orden lógico, se adapta la verificación (por ejemplo, comparar por bloque y no palabra a palabra) antes de seguir. |
| 5.2 | Recursos nuevos en `lib/pdf/fonts/` con su OFL y su sha256 en el README: «latin-ext» de Playfair, Cinzel e Inter (mismo diseño) y las familias de N3. Se descargan una vez de Google Fonts o Fontsource como archivos estáticos (no variables); no se instala ningún paquete. |
| 5.3 | `document.ts`: textos del diccionario, mayúsculas y números según el idioma, sin espaciado entre letras en árabe y hebreo, dirección RTL del texto, filas reflejadas a mano donde haga falta, metadatos de idioma. |
| 5.4 | Verificación (`pdf-verify.mts`, `check-catalog-pdfs.mts`): cadenas esperadas por idioma, lista de fuentes permitidas ampliada, glifos por idioma (ğ İ ş, Ÿ, árabe, hebreo). |
| 5.5 | Pruebas: AC10 en PDF; mismo número de páginas que en español para el mismo contenido corto; el hilo y sus protecciones intactos. |

## PR6 · Traducciones preparadas y revisadas

| Tarea | Contenido |
| --- | --- |
| 6.1 | Migración `0223_catalog_translations.sql` + reversión: traducciones de versiones aprobadas (por versión e idioma, bloques con clave de sección, estado: en preparación con caducidad, borrador, aprobada o rechazada); traducciones de plantillas de zona; traducciones de características (por cadena exacta e idioma, del dueño); copias congeladas por catálogo, vivienda e idioma con la huella del texto español publicado. |
| 6.2 | Preparar (solo al pulsar, solo el idioma pedido, solo lo que falta): reserva única por versión e idioma, IA configurada con instrucción de conservar nombres propios, cifras, precios y zonas, y comprobación determinista (cifras, contactos y precios como en `checkDraft`). Nunca escribe en `property_client_descriptions`. |
| 6.3 | Revisión en el gestor: texto original y traducción por bloque, editar, aprobar o rechazar; progreso por idioma; aviso «sin revisión nativa» en ar, tr y he. |
| 6.4 | Activación: el idioma de un enlace o del catálogo solo cambia cuando está completo; republicar el español deja la traducción desactualizada y el enlace en ese idioma sigue con la versión anterior completa (DA14, DA16). |
| 6.5 | Lectura pública por idioma (instantánea con idioma, huella por idioma; vigilante, lectura coherente y PDF por token); valoraciones sin cambios. |
| 6.6 | Pruebas: AC6–AC9 con IA simulada que cuenta llamadas (cero en lo público y una por versión e idioma con peticiones simultáneas), dos clientes en dos idiomas a la vez, en vivo y PDF, desactualización al republicar. |

## PR7a · Resolución de portada y PDF (sin cambio de diseño)

`srcset` en la portada del lector y anchos de foto del PDF acordes a su tamaño impreso (portada a página completa). Pruebas: cabecera de variante del proxy, peso por página y número de páginas del PDF iguales.

## PR7b · Acabado visual (tras aprobar las propuestas)

| Tarea | Contenido |
| --- | --- |
| 7.1 | Variante tratada en el servicio de fotos `/p` (parámetro propio, cacheada, original intacto), con la receta adaptativa aprobada y medidas por foto; interruptor por catálogo y por foto (N4). |
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

N1–N4 de la especificación, y la aprobación visual de las propuestas (DA30).

## Pasos de entorno que el plan necesitará (para aprobar con él)

- Worktree por PR desde `origin/main` y `node_modules` clonado de un worktree con el mismo `package-lock.json` (sin `npm install`).
- Postgres 16 temporal local (`BCP_PG_DIR` en el scratchpad).
- Servidor de fixtures (`scripts/dev-fixtures.sh`).
- Chromium de Playwright ya en caché.
- Descarga única de los archivos de fuentes OFL de N3 desde Google Fonts o Fontsource (PR5 y PR4). Es la única petición de red nueva y no ejecuta código.
