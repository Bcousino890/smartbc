# BCP-01 · Ampliación — plan de implementación aprobado

**Estado:** aprobado por Fabricio el 2026-10-13 («Sí, aprobar el plan y empezar PR-A»), incluido el máximo automático de **1 a 24 viviendas (12 por defecto)**. Autoriza X0–X13 por PR; B y C empiezan tras el merge y la QA de la entrega anterior. Que el índice con 24 viviendas quepa y que el tamaño sea manejable es una justificación de diseño pendiente de verificación (pruebas visuales y de rendimiento con 24), no una evidencia. Sin fases de PDF ni revisión adicional de Codex.

## 0. Base y estado

- **SHA de la base:** `origin/main` = `f770e544…` (merge de #311). Lo he comprobado **en remoto** con `git ls-remote` al preparar este plan, no solo con la referencia local. Se vuelve a comprobar al preparar el entorno y antes de cada push.
- **Migraciones:** la última del repositorio es `0193`. Los números `0194`–`0196` son provisionales y se vuelven a comprobar antes de cada push.
- **Títulos e introducciones que corregiste:** son datos guardados en la base y no necesitan código. Que no haya commits después del merge solo dice que el código no cambió.
- **Indicador de desplazamiento:** si se mejora la señal de que una página se desplaza por dentro, eso sí es código. Va en X3 como corrección concreta.
- **Pendiente en vivo:** la medición de 2 s y la QA en vivo de la fase 2 **siguen sin acreditar**. Este plan no las da por buenas.
- **Expediente:** el workflow solo permite commits en la rama de la tarea después de aprobar el plan. Por eso la actualización del expediente está redactada en este expediente y será el primer commit (X0).

## 1. Cómo se reparte

Tres PR, en este orden. Cada uno tiene su CI, tu QA en vivo y tu merge. Cada rama sale del `origin/main` de ese momento:

| PR | Rama | Contenido | Migración |
| --- | --- | --- | --- |
| **A** | `fabri/bcp-01-amp-a` | Marca, contacto editable, cierre nuevo, barra de navegación móvil y señal de desplazamiento | `0194` |
| **B** | `fabri/bcp-01-amp-b` | Zonas y precio, modo manual con filtros, modo automático, cambio de modo, anuncios de origen y filtros de la HOME | `0195` |
| **C** | `fabri/bcp-01-amp-c` | Recorrido editorial (apertura, recorrido, detalle), edición de la entrada y los destacados, varias dobles páginas | `0196` |

**Por qué este orden:**
- A es pequeño, tiene poco riesgo y es lo más visible.
- B cambia cómo se forma la lista de un catálogo; necesita su propia medición de rendimiento y de D13.
- C cambia la paginación del lector y depende de que las claves de las viviendas automáticas (B) ya existan.

**Lo que no cambia en ningún PR** (cada PR lo comprueba con tests):
- el lector y sus rutas, salvo lo descrito;
- los permisos de los enlaces;
- la lista blanca pública (solo se añaden claves);
- la pertenencia y el orden de los catálogos manuales;
- `/v`, `/s`, `/c`, `/compartir` y `/p`, la regla #297 fuera de los catálogos y la taxonomía global de zonas.

## 2. Entorno (al aprobar el plan; solo local, sintético y aislado, como en E7)

1. `git fetch` y `git ls-remote`, con el SHA anotado. Worktree nuevo por PR en `/Users/fabriirguez/SMARTBC/wt/bcp-01-amp-{a,b,c}`. No se tocan el `main` local, el stash ni las demás ramas.
2. `npm ci` con el `node@22` que ya está instalado.
3. Postgres 16 temporal con `scripts/sql/run-local.sh`: carpeta en el scratchpad, `127.0.0.1:54329`, base `bcp_test`. Para B se cargan datos sintéticos de rendimiento generados con `generate_series` (§5).
4. `scripts/dev-fixtures.sh`: sin `.env`, con Supabase en un puerto cerrado. Playwright y el Chrome del proyecto con el proxy a un puerto cerrado. Las fuentes llegan por `next/font`, como ahora.
5. **Dependencias nuevas: ninguna.** Al terminar: parar el servidor, borrar la carpeta del Postgres y conservar el worktree.
6. Nada en producción: sin SSH, sin credenciales, sin lecturas de la base real y sin merges hechos por mí.

## 3. Tareas

### X0 · Expediente (primer commit de A)

- **Qué:** `spec.md` y `plan.md` reciben la sección «Ampliación» con D18–D23, P1–P9, las cuatro condiciones y este plan.
- **Verificación:** enlaces correctos.
- **Commit:** solo documentación.

### PR-A · Marca, contacto y cierre

**X1 · Migración `0194`: contacto del catálogo**

- **Columnas nuevas en `catalogs`:**
  - `contact_name text`: de 2 a 80 caracteres;
  - `contact_phone text`: en formato E.164;
  - `contact_role text`: `'asesor'` o `'asesora'`.
- **Rellenado de los catálogos existentes:** nombre del perfil del dueño, `+34 641 457 123` y `'asesor'`. No cambia nada visible.
- **Función nueva `catalog_set_contact(p_actor, p_catalog, …)`:**
  - comprueba que el actor es el dueño;
  - valida en SQL los límites (longitud, formato E.164 y rol);
  - sube la versión.
- **`catalog_create`:** se mantiene la firma actual y se añade una función nueva `catalog_create_v2` con el contacto. El build anterior sigue llamando a la de siempre.
- **`catalog_internal_snapshot`:** se redefine en una sola sentencia. Conserva **todas** las claves de 0193 (`owner_name` incluido) y añade `contact`.
- **Permisos (E1):** `SECURITY INVOKER`, `search_path` fijo, `REVOKE` a `public`/`anon`/`authenticated` y `GRANT` a `service_role`.
- **Tests SQL:**
  - el rellenado;
  - validaciones: vacío, 81 caracteres, correo en el nombre, teléfono inválido y rol desconocido;
  - otro staff → `forbidden`; `anon`/`authenticated` → permiso denegado;
  - la huella cambia al editar el contacto y no cambia si se guarda el mismo valor;
  - la migración aplicada dos veces;
  - `rollback-0194.sql`, que borra las columnas y la función y vuelve a crear la instantánea de 0193;
  - reaplicación.
- **Criterios:** AC16 (SQL).
- **Commit:** la migración, sus tests y la reversión.

**X2 · Contrato y gestión del contacto**

- **Validación en el servidor:** `lib/catalogs/contact.ts` (puro) usa `normalizeContactPhone()`, filtra correos y URL del nombre y agrupa el número para mostrarlo.
- **Contrato público:** `to-public.ts` toma `preparedBy`, `phone`, `phoneHref` y `role` **solo** del catálogo. Si falta un valor, se omite esa línea; nunca se recurre al perfil ni a la constante.
- **Gestión:** panel «Contacto en el catálogo» con nombre, teléfono y «asesor/asesora».
- **Catálogo nuevo:** el formulario se precarga con tu nombre y el teléfono de la agencia.
- **Acciones:** `setCatalogContactAction`, con la guarda del dueño, aviso al vigilante y la huella nueva.
- **Verificación:**
  - tests del contrato: no se cuela nada del perfil ni del correo, y la regla #297 sigue intacta en el resto del CRM (`grep` de `AGENCY_PHONE` fuera de `lib/catalogs`);
  - prueba local: un lector abierto ve el contacto nuevo en ≤ 2 s (sintético).
- **Criterios:** AC16.
- **Commit:** el contrato, las acciones y la interfaz.

**X3 · Logo, cierre «Hablemos», barra móvil y desplazamiento**

- **Logo:** `public/logo.png` sin filtros y con su proporción.
  - En la portada, a un 44 % del ancho (un 62 % en móvil).
  - En las miniaturas de la HOME se oculta por debajo de 220 px de ancho con una consulta de contenedor.
- **Cierre como en la maqueta aprobada:** logo, «Contacto», «Hablemos», entradilla, tarjeta con «Tu asesor/a», el nombre, un solo botón «Llamar» con `tel:` y el número escrito debajo, y la vigencia.
- **Condición 1 · barra móvil:** pasa a ser una **barra opaca de ancho completo** pegada abajo (con margen de área segura), en lugar de la cápsula translúcida flotante.
  - La página reserva su altura (`padding-bottom` y `scroll-padding-bottom`), así que ningún botón, destacado ni resumen enfocado queda debajo.
  - En escritorio la cápsula se queda donde está.
- **Señal de desplazamiento:** cuando una página de escritorio se desplaza por dentro, aparecen un degradado inferior y la indicación «Sigue leyendo ↓». La zona es enfocable con el teclado.
- **Verificación:**
  - capturas a 1440 px y a 362 y 320 px: portada, cierre y vivienda;
  - prueba con `elementFromPoint`: en cada posición de desplazamiento, ningún control ni destacado queda tapado por la barra;
  - contraste medido;
  - el aviso sin conexión y el de D12 conviven con la barra;
  - 0 desbordes.
- **Criterios:** AC15 y AC17, y la condición 1.
- **Commit:** la interfaz del lector y su CSS.

**Cierre de A:**
- CI; los tests de regresión (los 8 de siempre, `test:catalogs` y `test:catalogs-public`); `tsc`; lint de migraciones.
- `result.md`; PR con el aviso de migración.
- QA en vivo (§7).

### PR-B · Zonas, precio, modos y anuncios

**X4 · Migración `0195` (parte de zonas): taxonomía en SQL para catálogos**

- **Tabla `catalog_zone_terms`** (término normalizado → distrito y barrio):
  - un script la genera a partir de `lib/madrid-zones.ts`;
  - un test falla si la tabla y el archivo TS se separan.
- **Equivalencias solo para catálogos:** `chueca → Justicia`, `malasaña → Universidad`, `huertas → Cortes`.
- **Funciones:**
  - `catalog_fold(text)` (`IMMUTABLE`): minúsculas y sin tildes con `translate`, sin extensiones;
  - `catalog_zone_match(zone, subzone)`: reproduce `normalizeZone()` (primero el texto completo, después los fragmentos en orden, prefijos «barrio/distrito/zona»).
- **Verificación:** test de **paridad** TS ↔ SQL sobre un corpus de unos 300 textos de zona sintéticos y de formas reales («Goya, Madrid», «barrio de Salamanca», sin tildes, «Chueca», texto vacío, municipios). Las diferencias tienen que ser cero o estar en una lista justificada.
- **Commit:** la tabla, las funciones y el test de paridad.

**X5 · Migración `0195` (parte de selección): criterios, modo y pertenencia automática**

*Datos*
- Columnas nuevas en `catalogs`:
  - `mode`: `manual` o `auto`, por defecto `manual`;
  - `criteria jsonb`, validado en SQL:
    - `operation`: `sale`, `rent` o `any`;
    - `zones[]`: cada entrada es un distrito, un barrio o un nombre libre;
    - `price_min` y `price_max`: solo si `operation` no es `any`; mínimo ≤ máximo;
    - `sort`: `price_asc` (por defecto), `price_desc` o `newest`;
    - `max`: **12 por defecto, de 1 a 24**;
  - `key_salt bytea`: aleatorio, interno.

*Máximo permitido: de 1 a 24*
- Hasta 24 viviendas el índice cabe en una doble página de dos columnas.
- Con el recorrido de C, cada vivienda ocupa como mucho 5 dobles páginas, así que 24 viviendas son unas 120 dobles páginas, el límite razonable para navegar.
- El tamaño y el tiempo de la instantánea **se miden con 24** (§5).
- Pasar de 24 requiere medirlo de nuevo y tu aprobación. Los catálogos manuales siguen sin límite, como hoy.

*Semántica en SQL, dentro de `catalog_internal_snapshot`, en la misma sentencia*
- **Qué entra:**
  - propiedades de España, sin `archived_at`, con estado `available` o `reserved`;
  - con **al menos una foto** (`EXISTS`);
  - zona: si hay zonas, `catalog_zone_match` tiene que caer en alguna; sin zona reconocible, no entra; sin criterio de zona, no se filtra;
  - precio: venta → `price`; alquiler → `rent_price` si la vivienda es dual o `price` si solo se alquila; con rango, un precio de 0 o vacío no entra; sin rango, sí.
- **Orden completo y estable:**
  - `price_asc`: precio efectivo ascendente, sin precio al final, después `created_at` descendente y después el id;
  - `price_desc`: lo mismo en descendente;
  - `newest`: `created_at` descendente y después el id;
  - con `any`: primero el grupo de venta (las duales cuentan como venta) y después el de alquiler, con el criterio elegido dentro de cada grupo.
- **El máximo se aplica después:** filtro completo → orden completo → `LIMIT max`. **Nunca se limitan las candidatas antes** (condición 2). La función de gestión devuelve también el total («12 de 31 coinciden»).
- **Claves públicas de las viviendas automáticas:** si existe una fila manual guardada para esa propiedad, se reutiliza su `public_key`; si no, se deriva de `left(md5(key_salt || property_id), 16)`, que es estable, opaca y no se puede adivinar sin la sal (que nunca sale). Así, al cambiar de modo, la misma vivienda no parece «quitada y añadida».

*Modo manual*
- `catalog_add_property`, `catalog_remove_item` y `catalog_reorder` rechazan con `catalog_auto` si el catálogo está en automático.
- En manual funcionan igual que hoy.

*Cambio de modo* (función `catalog_set_mode`, transaccional):
- **Manual → automático:** `catalog_items` **no se toca**; mientras el catálogo está en automático no se usa.
- **Automático → manual, «volver a mi lista»:** solo cambia `mode`.
- **Automático → manual, «convertir»:** `catalog_items` se sustituye por el resultado actual, con sus claves y su orden.
- **Vista previa:** `catalog_mode_preview` devuelve qué entra y qué sale, sin escribir nada.

*Tests SQL*
- Cada regla de arriba.
- Salamanca + Justicia; Chueca → Justicia.
- Duales en venta y en alquiler; solo alquiler.
- Sin precio, sin zona y sin foto.
- Vendida, archivada y reservada (con marca).
- Fuera de España.
- Empates de precio; máximo 1, 12 y 24; 0 y 25 rechazados.
- **Una vivienda que cumple pero queda por debajo del máximo aparece en el total.**
- Una vivienda nueva que encaja entra; si deja de encajar por precio, zona o estado, sale; la huella cambia en cada caso.
- Cambio de modo de ida y vuelta: la lista manual queda intacta; con «convertir» se conservan las claves.
- `anon`/`authenticated` sin permiso; otro staff → `forbidden`.
- La migración aplicada dos veces; reversión; las claves de 0193 presentes.

**Criterios:** AC18, AC19 y la condición 2.
**Commit:** la migración y sus tests.

**X6 · Medición de rendimiento (antes de cerrar X5; condición 3)**

- **Qué:** scripts `scripts/sql/perf-catalogs.sql` y `perf-catalogs.sh` (§5).
- **Base:** la instantánea de 0193 de un catálogo manual de 12, y `get_catalog_states` con 1, 5 y 20 enlaces.
- **Propuesta:** la misma medición con catálogos automáticos.
- **Resultado:** una tabla en `result.md`.
- **Si los resultados son malos:** se aplica §5.4 antes de seguir, **sin tocar la semántica**.
- **Commit:** los scripts y el resultado.

**X7 · Gestión: filtros, criterios, modo y vista previa**

- **Panel «Añadir»:** pasa a ser una búsqueda (solo lectura de `properties`, propietario):
  - filtros: zonas (distritos y barrios en dos niveles, más un nombre libre), operación, precio mínimo y máximo con su unidad, y texto o referencia BC;
  - cada resultado con «Añadir» y la marca «ya está».
- **Panel «Criterios y modo»:**
  - criterios, orden y máximo;
  - interruptor manual/automático con la vista previa de entradas y salidas;
  - las dos opciones al volver a manual.
- **En automático:**
  - la lista se muestra sin flechas ni «Quitar», con «12 de 31»;
  - no hay fijar ni excluir.
- **Las mismas reglas en TS para validar:** `lib/catalogs/criteria.ts`, puro y con tests.
- **Verificación:**
  - prueba de interacción con datos sintéticos;
  - capturas a 1440 y 362 px;
  - un catálogo manual existente conserva su orden;
  - las acciones de lista devuelven `catalog_auto` en automático.
- **Commit:** la interfaz y las acciones.

**X8 · Anuncios de origen y filtros de la HOME**

- **Tabla `catalog_ads`:**
  - RLS sin políticas y `GRANT` solo a `service_role`;
  - `idealista_listing_id` con `ON DELETE SET NULL`; si queda vacío, se conserva el `ad_code`.
- **Funciones:** `catalog_ad_add` y `catalog_ad_remove`, con `p_actor`.
- **Búsqueda de anuncios:** en `idealista_listings` en solo lectura, por `reference_code`, `inspo_title` o `idealista_property_id`. También se acepta un número o una URL de Idealista: se extrae el número **sin abrirla**.
- **HOME:** filtros por anuncio, zona, operación, modo y estado, y búsqueda por título o código.
- **Fuera de alcance:** cambios en Fichas guardadas (P6).
- **Tests:**
  - muchos a muchos sin duplicados;
  - **ningún código ni id de anuncio en la instantánea ni en el HTML del lector**;
  - asociar un anuncio **no cambia la huella** (no es contenido público);
  - permisos.
- **Criterios:** AC20.
- **Commit:** la tabla, las acciones y la HOME.

**X9 · Medición D13 para cambios que no cambian el contenido y para el camino del vigilante**

- **Huella antes y después:** las acciones devuelven la huella de antes y la de después.
  - Si no cambian (un anuncio, o unos criterios que dan la misma lista), el ensayo se anota «sin cambio público» y **no cuenta** (no es un fallo ni un acierto).
  - El protocolo exige 20 ensayos que **sí** cambian el contenido.
- **Interruptor «sin aviso inmediato»** (solo con `?medir=1`): el guardado no avisa al vigilante, así que el cambio llega por el mismo camino (≤ 300 ms) que una edición en la ficha o una propiedad nueva.
- **Tests:** se mantienen los casos que ya existen (pintado antes de la confirmación, A→B→A, versión posterior, lector ausente → fallo) y se añaden «sin cambio público no cuenta» y «sin aviso inmediato».
- **Criterios:** AC23.

**Cierre de B:** el mismo que A, más el informe de rendimiento y la QA en vivo de la selección automática.

### PR-C · Recorrido editorial

**X10 · Migración `0196`: ediciones por catálogo y vivienda, e historia en la instantánea**

*Ediciones editoriales (condición 4)*
- **Tabla `catalog_editorial`:**
  - clave `(catalog_id, property_id)`;
  - `lead_override`: hasta 280 caracteres, sin teléfonos, correos ni URL;
  - `highlights text[]`: hasta 3;
  - `source_hash`;
  - `updated_at`.
- **No es pertenencia:**
  - la instantánea solo la une a las viviendas que **ya** están en la lista (manual o automática);
  - no fija ninguna vivienda, no crea filas en `catalog_items` y no puede duplicar.
- **Ciclo de vida:**
  - quitar a mano una vivienda borra su edición en la misma transacción;
  - si una vivienda sale del automático, su edición queda **en reserva** y vuelve si la vivienda vuelve a encajar, siempre que la fuente siga igual;
  - la gestión lista «Ediciones en reserva (n)», con la opción de borrarlas;
  - el cambio de modo no las toca, porque van por propiedad.
- **Funciones:** `catalog_editorial_set` y `catalog_editorial_clear`, con `p_actor`. Al guardar se valida que cada destacado sea un candidato verificado en ese momento.

*Historia aprobada en la instantánea*
- Se añaden, en la misma sentencia:
  - la versión aprobada, con su `source_hash`, la `prelude` y la `prelude_headline` aprobadas y los bloques aprobados (capítulo, texto y posición);
  - la clase efectiva de cada foto (la corregida a mano manda; la de la IA solo con la confianza mínima que ya usa el adaptador);
  - lo necesario para reproducir la huella de la fuente.
- **No incluye:** afirmaciones, evidencias, modelo ni revisores.

*Tests SQL:* permisos; ediciones de una vivienda automática que no la fijan; la reserva; el borrado al quitar a mano; la huella cambia con una edición y con la aprobación de una historia; reversión (se pierden las ediciones; la lista no se toca).

**X11 · Derivación editorial pura (`lib/catalogs/editorial.ts`)**

*Validez*
- **Historia aprobada:**
  - se usa si su `source_hash` coincide con la huella del motor recalculada;
  - el cálculo se extrae del motor a un módulo puro, `lib/services/story/source-hash.ts`, que `engine.ts` también importa. Un test comprueba que el resultado no cambia;
  - se aceptan las versiones del motor conocidas por el historial de git;
  - si no coincide, **no se usa** (es la dirección segura) y la gestión lo señala.
- **Tus ediciones:** se usan si su `source_hash` (descripción limpia, características limpias y `features_manual`) coincide; si no, se suspenden y aparece «revisar».

*Tres niveles*
- **Con historia aprobada:**
  - la entrada es la `prelude`;
  - las secciones son los capítulos aprobados, con su título, con la regla de micro-capítulo que ya existe y con la foto de su clase (`CHAPTER_PHOTO_CLASSES`); sin foto de esa clase, el capítulo va solo con texto.
- **Sin historia aprobada, con descripción limpia:**
  - la entrada son las 1–2 primeras frases literales, de 45 palabras como máximo;
  - el resto se reparte con `splitDescriptionForFallback`, **sin títulos**, alternando con las fotos en orden.
- **Sin texto:** apertura, destacados y detalle.

*Destacados*
- Candidatos: frases **literales** de las características limpias o de `features_manual` que coinciden con una lista cerrada de términos.
- Hasta 3. Si los eliges tú, valen solo si siguen siendo candidatos.

*Detalle*
- **Todos** los datos estructurados (lo que falte, como «sin dato»), **todas** las características verificadas y la descripción completa íntegra.

*Privacidad*
- Se descarta cualquier bloque o entrada con teléfono, correo, URL o mención de agencia (el mismo filtro de la descripción limpia).
- Nunca entra texto del portal sin limpiar.

*Tests*
- Cada nivel; una historia caducada; una edición suspendida; un destacado que ya no es candidato.
- **Conservación:** la descripción completa del detalle es exactamente la limpia, carácter a carácter, y ningún dato estructurado se pierde.
- Una descripción de 3.000 caracteres.
- Contacto ajeno dentro de un bloque.
- Ninguna sección vacía ni título inventado.

**X12 · Lector con varias dobles páginas y hoja continua en móvil**

- **Modelo de páginas:**
  - `PageRef` de una vivienda pasa a ser `{item, part: open|journey:n|detail}`;
  - recorrido: de 1 a 3 dobles páginas de hasta 2 secciones cada una;
  - el índice ocupa una o dos columnas según el número de viviendas (hasta 24) y muestra la página de apertura;
  - el contador y el folio cuentan dobles páginas.
- **D12:** si se retira una vivienda mientras se lee **cualquiera** de sus páginas, se pasa a la apertura de la siguiente; si no hay siguiente, al índice; si no queda ninguna, al vacío.
- **Una actualización que cambia el número de páginas de la vivienda que se lee:** se queda en la misma parte si sigue existiendo; si no, se pasa a la última que exista.
- **Móvil:** una hoja continua; la ficha y la descripción completa son plegables, y la descripción se puede desplegar entera.
- **Se mantiene:** teclado, deslizar, modo desplazamiento, menos movimiento, la espera de gesto ≤ 0,38 s y la galería.
- **Tests:** `reader-state` con varias partes (D12 desde una página de recorrido, cambio de número de páginas, índice de 13 a 24); Playwright con datos sintéticos de los tres niveles, ejemplo largo, 1 y 24 viviendas, 1440 y 362/320 px; capturas comparadas con las maquetas aprobadas.
- **Criterios:** AC21 y AC22.

**X13 · Gestión: vista previa y edición**

- **Por vivienda del catálogo** (manual o automática), una vista previa del recorrido.
- **Edición:**
  - «Entrada»: texto propio o «usar la automática»;
  - «Destacados»: elegir hasta 3 de los candidatos.
- **Avisos:** «revisar» cuando la fuente ha cambiado, y «historia aprobada no vigente».
- **Historias:** solo un **enlace** a `/es/admin/propiedades/story-review`. No se genera nada ni se llama a ningún servicio (P7).
- **Verificación:** prueba de interacción; los permisos los cubren las acciones y SQL.
- **Commit:** la interfaz y las acciones.

**Cierre de C:** el mismo que A y B, más la QA visual y editorial de §7.

## 4. Instantánea, huella y lo que cuenta como cambio

**La instantánea:**
- Sigue siendo **una sola sentencia** `STABLE`. La pertenencia automática, el contacto, las ediciones y la historia salen del mismo instante.
- La huella sigue siendo el md5 de todo (E3).

**Cambian la huella** (versión nueva, medible con D13):
- el contacto;
- los criterios o el modo cuando cambian la lista o su orden;
- una propiedad que entra o sale de un automático;
- precio, fotos o estado de una vivienda incluida;
- una edición editorial;
- la aprobación o retirada de una historia, o un cambio de su fuente.

**No cambian la huella** (no hay versión nueva; el ensayo se anota «sin cambio público»):
- los anuncios asociados;
- guardar un valor igual;
- unos criterios que dan la misma lista;
- cambios en propiedades que no están en el catálogo.

**Lector abierto:** la actualización llega entera por SSE o por el respaldo, y se aplica D12.

**El objetivo de ≤ 2 s se mantiene en todos los casos.**

## 5. Rendimiento (condición 3)

**5.1 · Datos sintéticos (Postgres temporal)**
- 2.000, 10.000 y 40.000 propiedades, con unas 8 fotos cada una (hasta unos 320.000 registros de fotos).
- Zonas repartidas por la taxonomía, más nombres libres, textos vacíos y ruido.
- 60 % venta, 30 % alquiler y 10 % duales; un 5 % con precio 0, un 3 % sin fotos.
- 80 % disponibles, 5 % reservadas, 10 % vendidas y 5 % archivadas.
- No sé el tamaño real de la tabla. Si quieres, me das la cifra de un `count(*)` que ejecutes tú; yo no consulto producción.

**5.2 · Qué se mide** (200 repeticiones, con p50, p95 y máximo, y `EXPLAIN (ANALYZE, BUFFERS)`)
- **Base (0193):** la instantánea de un catálogo manual de 12, y `get_catalog_states` con 1, 5 y 20 enlaces abiertos.
- **Propuesta:**
  - un catálogo automático amplio (todo Madrid en venta) y uno estrecho (Salamanca + Justicia);
  - con máximo 12 y 24, y con 1, 5 y 20 enlaces automáticos abiertos a la vez;
  - el tamaño de la instantánea en bytes;
  - en C, lo mismo con historias y capítulos.
- **De punta a punta (local):** 2, 10 y 50 lectores sintéticos conectados (por SSE leído con `fetch`, sin dependencias) y el tiempo hasta pintar en 2 lectores con Playwright.

**5.3 · Presupuesto provisional**
- 50 ms por pasada de `get_catalog_states` con hasta 5 enlaces abiertos.
- Es una **referencia de trabajo, no un criterio de aceptación**. Lo que se acepta es D13 (≤ 2 s) medido.

**5.4 · Si los resultados son malos** (en este orden, **sin cambiar el resultado de la selección**)
1. Cambiar la forma de la consulta: precalcular los términos de zona de los criterios, `EXISTS` para las fotos, construir el JSON solo para las viviendas seleccionadas y una sola pasada por catálogo. Todo con los tests de paridad y de selección en verde.
2. Un índice en `properties` solo con tu aprobación expresa, porque es un cambio fuera de los catálogos, y con la mejora medida.
3. Si aun así no cabe en los 2 s, te presento las mediciones y las alternativas (por ejemplo, que el vigilante no recalcule la huella de un catálogo automático si no ha cambiado nada en `properties` desde la pasada anterior, detectado con una señal ligera que no sea `max(updated_at)`) **como enmienda para aprobar**.
- Nunca se limitan las candidatas, nunca se aproxima el resultado y nunca se cambian los 300 ms ni los 2 s en silencio.

## 6. Migraciones: permisos, compatibilidad y recuperación

| | `0194` (A) | `0195` (B) | `0196` (C) |
| --- | --- | --- | --- |
| Cambio | Columnas de contacto, función de contacto, `catalog_create_v2` e instantánea | Taxonomía de catálogo, criterios, modo, sal, funciones de modo y anuncios, guardas en las funciones de lista e instantánea | `catalog_editorial`, funciones e instantánea con la historia |
| Permisos | E1 en todo lo nuevo | E1 | E1 |
| Build anterior durante el despliegue | La instantánea conserva las claves de 0193 y la firma de `catalog_create` no cambia | Los catálogos existentes quedan en `manual` y no cambian; el build anterior no puede crear catálogos automáticos | Solo añade claves |
| Reversión | `rollback-0194.sql`: se pierden los contactos editados (el código revertido vuelve a la fuente anterior) | `rollback-0195.sql`: se pierden criterios, modo y anuncios; los catálogos automáticos vuelven a su lista manual intacta | `rollback-0196.sql`: se pierden las ediciones; la lista no cambia |

Cada migración:
- va entera en `BEGIN`/`COMMIT`, con `IF NOT EXISTS` y `CREATE OR REPLACE`;
- pasa el lint, se aplica dos veces en el Postgres temporal, se revierte y se vuelve a aplicar;
- solo la aplica el despliegue tras tu merge.

**Orden de reversión** si hiciera falta: C → B → A, porque cada instantánea depende de la anterior.

## 7. Verificación y QA en vivo

**Visual (local):** capturas de los tableros aprobados (portada, apertura, recorrido con y sin historia, detalle con texto largo, cierre) a 1440, 362 y 320 px, comparadas con las maquetas. Además:
- índice de 13 a 24 viviendas;
- navegación entre partes;
- D12 desde una página de recorrido;
- texto largo íntegro;
- barra móvil sin tapar nada.

**QA en vivo de Fabricio**

*PR-A*
1. Cambia el nombre, el teléfono y «asesora» de un catálogo de QA con un lector abierto: la portada y el cierre cambian solos.
2. «Llamar» abre el marcador.
3. Comprueba que nadie más entra a la HOME.
4. Un catálogo antiguo se ve igual que antes.
5. Logo en la portada y el cierre.
6. Móvil: la barra no tapa nada.

*PR-B*
1. Catálogo automático «Salamanca + Justicia, venta, ≤ X €» con el máximo en 12: comprueba la lista y «N de M».
2. Cambia el precio de una de sus viviendas en la ficha para que deje de encajar: sale del lector abierto. Devuélvelo: vuelve.
3. Una propiedad que encaja y aún no tiene fotos no aparece hasta tener una.
4. Pasa a manual con «volver a mi lista» y con «convertir».
5. Asocia dos anuncios a un catálogo y un anuncio a dos catálogos; filtra en la HOME. Comprueba que el lector no muestra ningún código.

*PR-C*
1. Una vivienda con historia aprobada, una sin historia y una sin texto.
2. Edita la entrada y los destacados de una vivienda automática; cambia su descripción en la ficha → «revisar».
3. Escritorio y móvil con una descripción larga.

*D13 (en cada PR que cambia contenido)*
- 20 ensayos × 2 lectores con `?medir=1`, igual que en la fase 2: misma sesión del navegador, ventanas visibles y 0 fallos.
- En B se suman 10 ensayos con «sin aviso inmediato» y otros con criterios que cambian la lista de un automático.
- Los «sin cambio público» se anotan aparte y no cuentan.
- **Nada se da por aprobado sin estas mediciones.**

## 8. Criterios → tareas

| Criterio | Dónde se cubre |
| --- | --- |
| AC15 | X3 |
| AC16 | X1, X2 |
| AC17 | X3 |
| AC18 | X4, X5, X7 |
| AC19 | X5, X7, QA de B |
| AC20 | X8 |
| AC21 | X11–X13 |
| AC22 | X10, X11 |
| AC23 | X6, X9 y la QA de D13 |
| Condiciones 1–4 | X3, X5, X6 y X10 |

## 9. Lo que autoriza aprobar este plan

**Autoriza:**
- los pasos de §2;
- código, migraciones y tests de X0–X13;
- commits y push en las ramas `fabri/bcp-01-amp-*`;
- abrir los PR y leer la CI.

**No autoriza:**
- merges;
- producción, SSH o credenciales;
- dependencias nuevas;
- índices en `properties` sin aprobación expresa;
- cambios en Fichas guardadas;
- generar historias;
- las fases de PDF.

Me paro en cada PR antes del merge y tras tu QA continúo con el siguiente.
