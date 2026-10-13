# BCP-01 · Ampliación — especificación aprobada: marca, contacto, zonas y precios, anuncios y recorrido de la vivienda

**Estado:** aprobada por Fabricio el 2026-10-13 junto con la dirección visual de las maquetas y las decisiones P1–P9 (ver `spec.md`, sección «Ampliación»). Las maquetas y sus capturas están en la carpeta de trabajo de Fabricio (`outputs/BCP-01-maquetas-ampliacion/`), fuera del repositorio. No incluye las fases de PDF. Sin revisión adicional de Codex.

Las decisiones pendientes de §6 quedaron resueltas así: P1 asesor/asesora por catálogo · P2 mínimo y máximo opcionales · P3 equivalencias solo de catálogos · P4 al menos una foto · P5 12 por defecto, máximo configurable de 1 a 24, precio ascendente · P6 sin cambios en Fichas guardadas · P7 sin generar historias desde el catálogo · P8 solo entrada y destacados · P9 dobles páginas en escritorio y hoja continua en móvil. El plan aprobado (`ampliacion-plan.md`) precisa dos detalles técnicos de esta especificación: la lista manual no lleva una marca «inactiva» (se conserva intacta mientras el catálogo está en automático) y las ediciones editoriales viven en su propia tabla por catálogo y vivienda, no en `catalog_items`.

## 0. Hechos comprobados (solo lectura, `origin/main` = `f770e54`, merge de #311)

**Repositorio y marca**
- No hay commits posteriores al merge de la fase 2. Las correcciones de título e introducción que hizo Fabricio son **datos guardados** en la base, no código, así que no tienen por qué aparecer como commits. La medición en vivo de 2 s y el resto de la QA en vivo siguen **sin acreditar**.
- Logo:
  - Archivo: `public/logo.png`, 3282 × 519 (proporción 6,32:1), PNG con transparencia.
  - Tinta: azul marino `#121626`.
  - Contraste medido: 15,4:1 sobre el papel `#f4ede1`, 16,8:1 sobre el marco y 11,5:1 sobre el fondo del escritorio.
  - Ya lo usan `components/brand-logo.tsx`, el cierre de `/v` y `lib/pdf/load-logo.ts` (data URI para react-pdf).

**Zonas y precios**
- Las zonas son texto libre: `properties.zone` (siempre informada) y `properties.subzone` (opcional).
- `lib/madrid-zones.ts` reúne 21 distritos con sus barrios y tiene `normalizeZone()`. Justicia es un barrio de Centro; Salamanca es un distrito con Castellana, Fuente del Berro, Goya, Guindalera, Lista y Recoletos.
- La taxonomía mezcla nombres oficiales y populares: Chueca, Malasaña, Huertas y La Latina aparecen como barrios propios, no dentro de su barrio oficial (Chueca está en Justicia).
- La búsqueda de sugerencias de clientes (`lib/db/queries/suggested-properties.ts`) ya busca cada zona en las dos columnas y separa los precios:
  - venta → `price`;
  - alquiler → `price` si la vivienda solo se alquila, `rent_price` si es dual.

**Anuncios de Idealista**
- Los anuncios propios están en `idealista_listings` («Fichas guardadas»).
- `property_id` puede ser nulo: las fichas «inspo» no tienen propiedad.
- Identificadores: `reference_code` (único), `idealista_property_id` (el código del anuncio en el portal) e `inspo_title`.

**Historia editorial de SmartLink 2.0 (ya en producción, reutilizable)**
- Versiones, afirmaciones con la frase de origen y bloques por capítulo:
  - `living` (salón y luz);
  - `kitchen` (cocina);
  - `private` (zona de noche);
  - `outdoor` (exteriores);
  - `finishes` (acabados);
  - `building` (la finca);
  - `barrio`.
- Cada bloque tiene estado: generado, aprobado, rechazado o en conflicto.
- Incluye además:
  - una entradilla aprobable (`prelude` y `prelude_headline`);
  - una cola de revisión humana en `/admin/propiedades/story-review`;
  - una regla de «micro-capítulo».
- `CHAPTER_PHOTO_CLASSES` empareja cada capítulo con fotos clasificadas (`property_photos.ai_class`). Si alguien corrigió la clase a mano (`class_override`), manda esa.
- Hay además un divisor **sin IA** (`lib/services/story/fallback.ts`) que corta el texto en bloques de 70 palabras como máximo y que, por regla, **prohíbe inventar títulos temáticos**.
- La historia se genera **bajo demanda** desde el admin, con el proveedor de IA ya configurado.
- Al mostrar la versión aprobada en público **no se comprueba** si la ficha cambió después.

**Otros datos y reglas**
- `features_manual` lo escribe el equipo, el sync no lo pisa y ya se publica en la web, unido a `features`.
- No existe un campo de año de construcción, de modo que nada de eso puede aparecer como dato.
- El lector actual saca el nombre del cierre del perfil del dueño y el teléfono de la constante `AGENCY_PHONE` (regla #297).
- La descripción solo se muestra si existe la versión limpiada en español.

## 1. Decisiones registradas (de tus requisitos)

| Decisión | Contenido |
| --- | --- |
| D18 | Logo oficial en la portada y el cierre del lector; se arrastra al PDF |
| D19 | Contacto público editable por catálogo (nombre y teléfono). No da acceso a la HOME; solo tú sigues autorizado |
| D20 | El cierre «Hablemos» tiene marca, una jerarquía clara y una sola acción (llamar). Sin canales nuevos ni envíos automáticos |
| D21 | Los catálogos se organizan por varias zonas (distrito o barrio) y por precio, separando venta (€) y alquiler (€/mes). Dos modos: manual con filtros o automático por criterios. Sin tramos fijos. Sin buscador público |
| D22 | Anuncios de Idealista de origen asociados a catálogos (muchos a muchos), solo de uso interno |
| D23 | La vivienda se presenta como un recorrido editorial: entrada breve, pocos puntos verificados, secciones cortas con fotos y todos los datos y la descripción completa al alcance |

## 2. Propuesta

### R1 · Marca (D18)

- **Logo:** se reutiliza `public/logo.png` tal cual, sin filtros (el filtro blanco es solo para la barra lateral), con su proporción, `height: auto` y un ancho máximo.
- **Portada:** logo centrado encima de las etiquetas, a un 44 % del ancho de la página (un 62 % en móvil).
  - En las miniaturas de la HOME se oculta por debajo de 220 px de ancho, porque ahí no se lee.
- **Cierre:** logo arriba, a un 52 % del ancho (un 70 % en móvil).
- **Nunca sobre una foto.**
- **Requisito para el PDF** (fase 4): el mismo logo con `loadLogoDataUri()` en la portada y el cierre, a la misma proporción, con el contacto del catálogo y el recorrido de la vivienda de R6, con páginas de continuación (E6).

### R2 · Contacto editable (D19)

**Datos:** columnas nuevas en `catalogs`:
- `contact_name text`: de 2 a 80 caracteres, sin correos, URL ni números de teléfono;
- `contact_phone text`: se guarda en formato E.164.

**Teléfono:**
- Se valida con `normalizeContactPhone()` (`lib/sync/particulares/phone-international.ts`), que acepta números españoles e internacionales.
- Se muestra agrupado y enlaza con `tel:`.

**Valores por defecto y compatibilidad:**
- **Catálogo nuevo:** el formulario se precarga con tu nombre de perfil y el teléfono de la agencia. Puedes cambiarlos antes de guardar, y lo que se guarda es lo que queda.
- **Catálogos existentes:** la migración **rellena** esos dos valores con tu nombre de perfil y `+34 641 457 123`. Así no cambia nada visible, y desde ese momento el lector lee **lo guardado en el catálogo**, no el perfil ni la constante.
- Si el valor estuviera vacío, el cierre omite esa línea; nunca recurre a otra fuente.

**Alcance de la excepción a la regla #297:**
- Solo afecta a los catálogos.
- Firmas, correos, `/v`, `/s`, `/compartir` y PDF de propiedad siguen con el teléfono fijo de la agencia.

**Permisos:** sin cambios. Lo edita una función SQL con `p_actor` y la comprobación de dueño. El nombre que pongas no crea ni modifica ningún usuario.

**Lector abierto:**
- El contacto entra en la instantánea, así que su huella cambia.
- El lector abierto actualiza el cierre (y el «Preparada por» de la portada) en ≤ 2 s, igual que cualquier guardado.

**Lista blanca pública:** `preparedBy` y `phone` (las claves que ya existen; ahora salen del catálogo) y `phoneHref`.

### R3 · Cierre «Hablemos» (D20) — tableros `cierre` y `m-cierre`

Orden de arriba abajo:

1. Logo
2. Filete
3. «Contacto»
4. **Hablemos**
5. Entradilla
6. Tarjeta con:
   - «Tu asesor/a»;
   - el **nombre**, grande, en Fraunces;
   - un **solo botón**, «Llamar» (`tel:`);
   - el número escrito debajo, por si se quiere copiar.
7. Pie con la vigencia del enlace

Se conserva C · Boutique. Sin WhatsApp, correo ni envío automático.

**Pendiente de tu aprobación visual.**

### R4 · Zonas, precio y modos de selección (D21)

**Criterios del catálogo** (columnas nuevas en `catalogs`; también etiquetan el catálogo en la HOME):
- **Operación:** venta, alquiler o «ambas».
  - Para poner un rango de precio hay que elegir venta o alquiler: no se mezclan € y €/mes.
  - Se muestra como «Venta · 900.000–1.500.000 €» o «Alquiler · hasta 4.000 €/mes».
- **Zonas:** una lista de entradas. Cada entrada es un distrito, un barrio o un nombre libre (para municipios fuera de Madrid capital).
  - Varias zonas se combinan con «o»: Salamanca + Justicia es válido.
  - Coincidencia: un distrito casa si `normalizeZone()` de `zone` o de `subzone` da ese distrito; un barrio casa si da ese barrio; un nombre libre casa por igualdad sin tildes ni mayúsculas.
  - **No se toca la taxonomía global.** Si quieres que Chueca cuente como Justicia (o Malasaña como Universidad), sería una tabla de equivalencias **solo de los catálogos**. Ver la decisión pendiente P3.
- **Precio:** mínimo y máximo opcionales.
  - Venta → `price`.
  - Alquiler → `rent_price` si la vivienda es dual; si no, `price`.
  - Sin tramos predefinidos: escribes los importes.

**Modo `manual`** (por defecto; los catálogos existentes quedan así, con su lista y su orden):
- En la gestión, el panel «Añadir» pasa a ser una búsqueda con filtros (zonas, operación, precio y texto o referencia BC).
- Cada resultado tiene un botón «Añadir» y una marca «ya está».
- El orden sigue siendo manual. Los criterios solo filtran la búsqueda.

**Modo `automático`:**
- La lista **es el resultado de los criterios**, calculado en la propia consulta de la instantánea.
- No se puede fijar ni excluir a mano una propiedad: **no hay modelo híbrido**. Si necesitas ajustar a mano, usa el modo manual.
- Qué entra:
  - propiedades de España no archivadas, disponibles o reservadas (con su marca);
  - las vendidas y archivadas salen;
  - con al menos una foto, si lo apruebas (P4).
- Datos desconocidos:
  - sin zona reconocible → no entra si hay criterio de zona;
  - precio 0 o vacío → no entra si hay un rango de precio;
  - si no hay criterio de ese tipo, ese dato no excluye.
- **Orden fijo** que eliges (precio ascendente o descendente, o más recientes) y **un máximo de viviendas** (P5). La gestión muestra «12 de 31 coinciden».
- **Sin duplicados** por construcción: es un conjunto.
- Las **propiedades nuevas** que encajen entran solas en la siguiente instantánea.
- Si una propiedad cambia de precio, zona o disponibilidad y deja de encajar, sale. El lector abierto lo trata como una retirada (D12: siguiente, índice o vacío).

**Cambio de modo, explícito y con vista previa:**
- **Manual → automático:**
  - un aviso muestra qué entra y qué sale;
  - la lista manual **no se borra**, se guarda inactiva.
- **Automático → manual:** dos opciones.
  - «Volver a mi lista anterior» recupera la lista manual guardada.
  - «Convertir la selección actual en lista manual» copia el resultado con su orden.

### R5 · Anuncios de origen (D22)

**Tabla nueva `catalog_ads`:**
- `catalog_id`;
- `idealista_listing_id`: opcional, referencia a `idealista_listings`; queda vacía si esa ficha se borra;
- `ad_code`: opcional, el código del anuncio en Idealista;
- `note`: opcional, interna, de hasta 200 caracteres;
- creación.

Exige al menos el vínculo o el código. No se repite el mismo anuncio en el mismo catálogo.

**Relación muchos a muchos:**
- un anuncio puede tener varios catálogos (necesidades distintas);
- un catálogo puede servir a varios anuncios parecidos;
- **nada se copia**.

**Cómo se elige el anuncio:**
- buscando en tus Fichas guardadas (referencia, título o código), en solo lectura;
- o pegando una URL o un código de Idealista: se **extrae el número sin abrir la URL**.

**Fuera de alcance:** importar, scraping, publicar o crear propiedades.

**Privacidad:** ninguna función pública lee esta tabla. Un test comprueba que ni la instantánea ni el HTML del lector contienen el código.

**HOME:** filtros por anuncio, zona, operación, modo y estado, y búsqueda por título o código. No hay versiones de catálogo por cliente.

### R6 · Recorrido editorial de la vivienda (D23) — tableros `apertura`, `secciones`, `sin-historia`, `ficha` y `m-vivienda`

**Estructura, en tres niveles según la información disponible (nunca se fuerza una sección vacía):**

1. **Apertura** (la doble página actual, aligerada):
   - foto principal, título, precio y línea de datos;
   - una **entrada breve**;
   - hasta **3 puntos verificados**;
   - «Recorrer la vivienda →».
2. **Recorrido:** secciones cortas que **alternan con su foto**.
3. **La vivienda en detalle:** la **ficha completa** con todos los datos estructurados (los que falten, como «sin dato») y todas las características verificadas, más la **descripción completa** íntegra y desplegable.

**De dónde sale cada cosa, sin IA nueva:**
- **Con historia aprobada y vigente:**
  - la entrada es la `prelude` aprobada;
  - las secciones son los capítulos aprobados, con sus títulos (`CHAPTER_HEADINGS`) y la regla de micro-capítulo;
  - las fotos son las de la clase correspondiente (`CHAPTER_PHOTO_CLASSES`). Si no hay foto de esa clase, el capítulo va solo con texto.
- **Sin historia aprobada pero con la descripción limpia vigente:**
  - la entrada son las 1–2 primeras frases **literales**, de 45 palabras como máximo;
  - el resto se reparte con el divisor existente en párrafos cortos, **sin títulos temáticos**, alternando con las fotos en su orden.
- **Sin nada:** la apertura, los puntos verificados, la ficha completa y las fotos.

**Puntos verificados:**
- Solo frases que existen tal cual en las características limpias o en `features_manual` y que coinciden con una lista cerrada (terraza, ascensor, garaje, piscina, jardín, exterior, trastero, portero, aire acondicionado…).
- Se muestran literales. Nunca salen de la prosa ni se reescriben.

**Garantías:**
- No se añade ningún servicio, dependencia ni coste de IA.
- No se modifica `properties.description` ni la historia global.
- No se descarta información: todo sigue en «en detalle».
- Se descarta cualquier bloque o entrada que contenga teléfonos, correos, URL o menciones de agencia (el mismo filtro que la descripción limpia).

**Revisión de Fabricio:**
- En la gestión de cada vivienda del catálogo, una vista previa del recorrido.
- Campos **propios del catálogo** en `catalog_items`:
  - `lead_override`: entrada propia de hasta 280 caracteres, con el mismo filtro de contacto;
  - `highlights`: hasta 3, elegidos **solo** de los candidatos verificados;
  - `editorial_src`: la huella de la fuente cuando revisaste.
- Si quieres capítulos temáticos de una vivienda sin historia, se aprueba en la cola **existente** de story-review (es el flujo actual, con su coste actual). El catálogo nunca la genera solo (P7).

**Si cambia la fuente** (descripción limpia, características o historia aprobada) después de tu revisión:
- tu entrada y tus puntos se **dejan de aplicar** (vuelve lo automático) y la gestión marca «revisar»;
- una historia aprobada cuya fuente haya cambiado tampoco se usa en el catálogo (vuelve el nivel sin historia);
- así no se publica un texto que ya no corresponde.

**Navegación:**
- En escritorio, la vivienda pasa de una doble página a «apertura + 1 a 3 dobles páginas de recorrido + detalle». El contador y el índice cuentan esas páginas.
- D12 se mantiene por vivienda: si se retira la vivienda que se lee, desde cualquiera de sus páginas, se va a la apertura de la siguiente.
- En móvil es una sola hoja continua, con la ficha y la descripción completa plegables.

## 3. Datos, contrato público y migración

Una migración `0194` (se volverá a comprobar el número antes del push):

**Cambios en tablas:**
- `catalogs`, columnas nuevas:
  - `contact_name`, `contact_phone`;
  - `mode` (`manual`|`auto`, por defecto `manual`);
  - `criteria jsonb` (operación, zonas, precio mínimo y máximo, orden y máximo);
  - la lista manual inactiva se conserva en `catalog_items` con una marca `inactive`.
- `catalog_items`, columnas nuevas: `lead_override`, `highlights text[]`, `editorial_src`.
- Tabla `catalog_ads`: RLS sin políticas, permisos retirados a todos y `GRANT` solo a `service_role`.

**Funciones:**
- `catalog_set_contact`, `catalog_set_criteria`, `catalog_set_mode` (con su vista previa), `catalog_item_set_editorial`, `catalog_ad_add` y `catalog_ad_remove`, todas con `p_actor` y la comprobación de dueño.
- `catalog_internal_snapshot` se redefine en **una sola sentencia**. Incluye:
  - la pertenencia automática;
  - el contacto;
  - los campos editoriales;
  - la historia aprobada (capítulos, entrada y huella de la fuente);
  - las clases de foto.
- La huella sigue siendo el md5 de la instantánea completa. Cubre los cambios de criterios que alteran la pertenencia, los cambios de las propiedades que entran o salen, el contacto, la edición editorial y la aprobación de historias.

**Contrato público, solo claves nuevas:**
- `phoneHref`;
- por vivienda: `lead`, `highlights[]`, `sections[] {heading|null, text, photo|null}`, `facts[]` y `fullDescription`.
- Nunca: criterios, anuncios, notas, UUID, nombres de modelo ni evidencias.

**Compatibilidad con el build anterior:**
- El despliegue aplica la migración antes de cambiar de versión, así que unos segundos convive el código viejo con la base nueva.
- Por eso la instantánea **mantiene** las claves de 0193 (`owner_name` incluido) y solo **añade**.
- Las funciones de 0192 y 0193 se mantienen.

**Recuperación:**
- `rollback-0194.sql` borra lo nuevo (se pierden contactos, criterios, anuncios y ediciones de catálogo) y vuelve a crear la instantánea de 0193.
- Lo ejecuta una persona, se prueba en el Postgres temporal y el código se revierte con `git revert`.

## 4. Tiempo real (D13, sin relajar)

- **Guardados del catálogo** (criterios, modo, contacto, edición, anuncios):
  - avisan al vigilante al momento, como hoy;
  - **se miden con el modo medición actual** (ensayo, catálogo, huella y lector).
- **Cambios hechos en otras pantallas** (precio, zona o estado en la ficha, o una propiedad nueva que entra en un catálogo automático):
  - no avisan al momento;
  - los recoge el vigilante cada 300 ms y siguen dentro de D13.
  - **Propuesta de medición:** en `?medir=1`, un interruptor «sin aviso inmediato» hace que el guardado del catálogo se propague solo por el vigilante, que es el mismo camino que un cambio desde la ficha. Así se mide con el reloj común.
  - Una edición real en la ficha queda como comprobación en vivo aparte.
- **Riesgo de rendimiento (no medido):**
  - un catálogo automático recorre `properties` en cada pasada del vigilante (cada 300 ms por enlace abierto);
  - el coste depende del tamaño real de la tabla, que no he consultado.
  - **Antes de implementar la consulta:** `EXPLAIN ANALYZE` en el Postgres temporal con 5.000 y 20.000 propiedades sintéticas, y un objetivo de instantánea ≤ 50 ms.
  - Si no se cumple, primero se limita el número de candidatas. Un índice nuevo en `properties` sería un cambio global y pediría tu aprobación.
- **Otro riesgo:** la instantánea crece (capítulos y fotos). Se medirá su tamaño y su tiempo.

## 5. Criterios de aceptación nuevos

| | Criterio |
| --- | --- |
| AC15 | Logo en la portada y el cierre, con su proporción, sin filtros y nunca sobre una foto; contraste ≥ 4,5:1 (medido 15,4:1) |
| AC16 | Contacto editable: validaciones (nombre, E.164); los catálogos existentes conservan lo que se veía; editar el nombre no da acceso; el lector abierto lo actualiza en ≤ 2 s; el resto del CRM conserva la regla #297 |
| AC17 | Cierre aprobado visualmente por Fabricio (escritorio y móvil) |
| AC18 | Zonas múltiples (Salamanca + Justicia), distrito y barrio, venta y alquiler separados; datos desconocidos según §R4; sin duplicados; los catálogos existentes siguen en manual con su orden |
| AC19 | Automático: entra una propiedad nueva que encaja; sale una que deja de encajar (precio, zona o disponibilidad); D12 en el lector abierto; el cambio de modo, con vista previa, es reversible |
| AC20 | Anuncios de origen: muchos a muchos, filtro en la HOME, ningún código en la instantánea ni en el HTML (test) |
| AC21 | Recorrido: apertura con entrada y ≤ 3 puntos verificados literales; secciones sin vacíos ni títulos inventados; ficha y descripción completa íntegras; aprobación visual (incluido un ejemplo largo en móvil) |
| AC22 | Cambia la fuente → se dejan de aplicar la edición y la historia, y la gestión pide revisar; nada de contacto ajeno en el texto público (test) |
| AC23 | D13 medido también con «sin aviso inmediato» y con un catálogo automático; rendimiento de la instantánea medido en local antes de dar por buena la consulta |

## 6. Decisiones pendientes (tuyas)

| | Pregunta | Recomendación |
| --- | --- | --- |
| P1 | ¿El texto de la tarjeta del cierre es «Tu asesor», «Tu asesora» o un campo editable? | Elegir «asesor» o «asesora» en el propio catálogo |
| P2 | ¿Precio mínimo y máximo, o solo máximo? | Los dos, opcionales |
| P3 | ¿Equivalencias solo para catálogos (Chueca → Justicia, Malasaña → Universidad, Huertas → Cortes)? | Sí, como una lista corta y explícita, solo para catálogos |
| P4 | ¿En automático, exigir al menos una foto? | Sí |
| P5 | ¿Máximo de viviendas y orden por defecto en automático? | 12 viviendas y precio ascendente |
| P6 | ¿Mostrar «en Fichas guardadas» qué catálogos tiene cada anuncio? | No en esta ampliación (es otra pantalla) |
| P7 | ¿Lanzar desde el catálogo la generación de la historia de una vivienda? | No. Solo un enlace a la cola existente de story-review |
| P8 | ¿Tus ediciones editoriales (entrada y puntos) en esta ampliación? | Sí, solo esas dos |
| P9 | En escritorio, ¿el recorrido como dobles páginas extra o como desplazamiento dentro de la página de la vivienda? | Dobles páginas, como en las maquetas |

## 7. Maquetas para tu aprobación visual (sintéticas, con fotos de marcador)

- **Escritorio:** `escritorio-portada`, `escritorio-apertura`, `escritorio-secciones` (con historia aprobada), `escritorio-sin-historia`, `escritorio-ficha` (descripción larga desplegada) y `escritorio-cierre`.
- **Móvil (362 px):** `movil-portada`, `movil-vivienda` (recorrido completo), `movil-descripcion` (descripción larga desplegada) y `movil-cierre`.

Los nombres, el teléfono y los textos son de ejemplo; no son datos reales.

## 8. Siguiente paso

Con tu aprobación (y tus respuestas a P1–P9) preparo el plan de implementación de esta ampliación. No se empieza la fase 3 ni la 4 en paralelo.
