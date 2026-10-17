# Importar PDF y buscador de Propiedades en el catálogo: exploración

> **Actualizado el 17-10-2026:** D-B2 sustituye a D-B1. Ya no se conservan los modos manual y automático, así que las partes de §3 y §6 que hablan del modo automático (criterios ampliados, S2) **quedan obsoletas** para el buscador nuevo. Se mantienen solo como referencia para la transición de los catálogos automáticos que ya existen. El orden aprobado es D-O1.

Es una exploración **de solo lectura**, autorizada el 17 de octubre de 2026. No es una especificación ni autoriza implementar.

- **Base del código leído:** `origin/main` = `4ccbfa6`.
- **Cómo se ha leído:** cuatro exploraciones paralelas. Las afirmaciones críticas se comprobaron después a mano; se marcan con **[V]**. Las inferencias se marcan con **[I]**.

## 0. Decisiones y propuestas

| | Estado | Contenido |
|---|---|---|
| **D-B2** | **Aprobada por Fabricio el 17-10-2026. SUSTITUYE a D-B1** | El buscador nuevo del catálogo **no tiene modos «Manual / Automático»**: se filtran viviendas, se miran los resultados y se **eligen una a una**. No se diseña ningún modo de pertenencia automática ni se conserva el cambio de modo con otro nombre. Se reutiliza el buscador con **los precios de alquiler y las zonas correctos**; los defectos del buscador general de Propiedades son un alcance aparte. **Los catálogos automáticos que ya existen** necesitan una propuesta explícita de compatibilidad y transición en la especificación del buscador. No se borra su contenido, no se convierten en silencio y no se pierden sus inclusiones y exclusiones. Hasta que esa transición se especifique y apruebe, se quedan como están. |
| **D-I2** | **Aprobada por Fabricio el 17-10-2026** | Flujo de importación: anuncio externo o PDF → ficha revisada → nuestro enlace para compartir la propiedad → inclusión opcional en un catálogo. Disponible desde Propiedades, para el staff autorizado, y desde el flujo de catálogos de Fabricio. La HOME sigue siendo privada. La privacidad del borrador, la agencia colaboradora y las alertas a clientes **se deciden en la especificación de la importación**. |
| **D-O1** | **Aprobada por Fabricio el 17-10-2026** | Orden de entregas: **S0** (exposición en el descubrimiento público) → **mejora del PDF** (hilo) → **nuevo buscador del catálogo** → **importar desde enlace o PDF**. No se combinan en una sola implementación. |
| ~~D-B1~~ | **Sustituida por D-B2** (17-10-2026) | El catálogo usará un buscador **como el de Propiedades** en lugar de «Modificar criterios», **conservando la selección manual y la automática**. Los filtros reutilizados sirven para buscar y elegir a mano, y guardados, deciden la pertenencia automática. Las inclusiones y exclusiones manuales se mantienen. Se conservan los catálogos que ya existen, sus criterios guardados, orden, límites y ajustes. **No autoriza implementar.** |
| D-I1 | Aclaración de Fabricio (alcance), concretada en D-I2 | Importar un PDF significa **crear nuestra propia ficha y su enlace**: PDF → datos y fotos extraídos → revisión editable → ficha confirmada con la experiencia de enlace que ya existe → inclusión opcional en un catálogo. Acceso desde Propiedades, junto a las herramientas de enlace, para el staff autorizado, y desde el flujo de catálogos de Fabricio. La HOME sigue siendo privada. Sigue la preferencia por extraer en el navegador, de forma gratuita, con avisos de lo dudoso y revisión humana. Hacen falta muestras. |
| Todo lo demás de este documento | **Propuesta** | Pendiente de las decisiones de §7. |

## 1. Lo que existe hoy

### 1.1 «Crear link» en Propiedades: no existe con ese nombre [V]

- **El menú «Añadir»** de la lista de Propiedades tiene **«Añadir manualmente»** e **«Importar por link»** (`lib/i18n/dictionary.ts:683-687`; `properties-admin-client.tsx:597-649`).
- **El texto «Crear link» solo aparece fuera de Propiedades:**
  - «Crear link temporal para compartir», en Particulares (`particulares/particular-modal.tsx:184`);
  - «Crear enlace», en el catálogo (`components/admin/catalogs/share-panel.tsx:186`).

Herramientas de enlace que sí hay en Propiedades:

| Herramienta | Qué crea y guarda | Qué publica o expone | Permiso |
|---|---|---|---|
| **A. «Importar por link»** (`/propiedades/importar`, `import-by-link-client.tsx`, `importar/actions.ts`, `lib/sync/import-by-link/*`) | Lee el anuncio de un portal (idealista, fotocasa… con proxy, Playwright, Relay o Wayback, o el HTML pegado) y **crea o actualiza una fila de `properties`** con la clave (agencia `portales-externos`, `external_id`) y `status: 'available'` [V, `insert.ts:258`]. `bc_reference` lo pone la base de datos; `published_web` queda en `false`, que es el valor por defecto [V]. La portada se procesa en el acto y el resto de fotos en segundo plano (WebP, sin marca propia). Los vídeos van a `property_media`. Sin IA al importar. | Ver §4: la ficha queda **activa en el acto** en `/compartir`, sugerencias, alertas, catálogos automáticos y algunas partes de la web pública | Para ver la página basta `properties.view`; para previsualizar y confirmar hace falta `properties.create` [V] |
| **B. Ficha pública estable `/compartir/[slug]`** («Ver como cliente», «Copiar SmartLink», «Ver ficha pública», «Copiar URLs/WhatsApp») | **Nada**: es un enlace por slug | Ficha pública sin token. Filtra que no esté archivada ni en `status archived` [V]. No muestra la dirección y el contacto es siempre la agencia. **Sin `noindex`** [V: `generateMetadata` no pone `robots`] | Basta con ver la página de administración |
| **C. SmartLinks con seguimiento `/c/[token]`** («Generar enlace» en la ficha, `smart-links-panel.tsx`) | Una fila en `property_shares` (token, etiqueta, autor; `expires_at` no se rellena nunca). Las aperturas van a `property_share_opens` | Misma ficha, con `noindex` y aperturas registradas. Se revoca **borrando** el enlace | `properties.edit` en la acción, pero la RLS de inserción exige `is_admin()` [I: probable fallo para advisor y agent_senior] |
| **D. «Descargar PDF» de la ficha** (`/api/admin/properties/[slug]/pdf`) | Nada (descarga privada) | Imprime la URL de `/compartir` | Solo `requireStaff` |

**El precedente para llamar al importador desde otro flujo** es `?url=&linkId=&clienteId=`, desde los enlaces de portales de la ficha del cliente: crea la ficha y la añade a la selección del cliente. También existe `importPortalLink()` (`lib/portal-links/auto-import.ts`), un importador sin interfaz. El plan de BCP-01 ya previó **T16b «portal → catálogo»**, con el parámetro `catalogo` comprobado antes de escribir, y la puerta **G3**, que cubre toda creación de propiedades.

### 1.2 El buscador de Propiedades [V en lo esencial]

- **Cómo funciona:**
  - `page.tsx` carga **hasta 2.000 filas** una sola vez (`getProperties`, ordenadas por `created_at desc`);
  - **todo el filtrado, la búsqueda y la paginación (25 por página) ocurren en el navegador**, dentro de `properties-admin-client.tsx`, un archivo de 1.396 líneas.
- **Filtros:**
  - texto: título, zona, subzona, agencia, etiquetas y referencias BC, de portal y PROP, sin plegar tildes;
  - operación (venta o alquiler; las duales salen en las dos);
  - estado;
  - distrito: igualdad exacta con `zone`;
  - subzona: igualdad exacta con `subzone`;
  - agencia y etiquetas (basta una);
  - estancia, dormitorios, baños, planta mínima (deducida por `resolveFloor`), precio y m².
- **No hay** orden elegible, tipo de vivienda ni características.
- **El estado de los filtros** va en la URL (`q`, `operacion`, `estado`, `distrito`, `zona`, `agencia`, `etiquetas`, `estancia`, `dormitorios`, `banos`, `planta`, `precioMin/Max`, `m2Min/Max`, `pagina`, `archivadas`).
- **Permiso:** `properties.view` según la matriz fija de roles, sin las excepciones por usuario. **No limita por agente**: el inventario es compartido.
- **Defectos que ya existen** (no se reproducen sin decisión):
  1. Con «Alquiler», el precio de una dual se compara con el **de venta** (`AdminProperty` no tiene `rent_price`).
  2. Las zonas no se normalizan (igualdad exacta, sin tildes ni alias).
  3. Límite silencioso de 2.000 filas.
  4. El estado «Alquilado» nunca coincide, y «Borrador» es en realidad «archivada».
  5. La moneda se ignora (Chile).
  6. «Ver archivadas» borra los demás filtros.
- **Lo que se comparte hoy:** casi nada. Los controles de filtros son privados del archivo de la página. Particulares tiene un sistema más completo, del lado del servidor, pero también privado (`_lista/*`).

### 1.3 La selección del catálogo [V en lo esencial]

- **Criterios guardados** (`catalogs.criteria`, normalizados en TS, `lib/catalogs/criteria.ts`, y en SQL, `catalog_criteria_normalize`, 0195):
  - `operation` (`sale|rent|any`);
  - `zones`: hasta 30 entradas `{kind: district|barrio|free, name}`;
  - `price_min/max`, solo con una operación;
  - `sort` (`price_asc|price_desc|newest`);
  - `max` (1–24).
  - **No hay** dormitorios, baños, m², tipo, estado, agencia ni etiquetas.
- **Automático:** `catalog_select` (0196) se calcula **en cada lectura**, también en el lector público, sobre `catalog_candidates` (0195). Condiciones:
  - España, no archivada, `available|reserved` y **con foto**;
  - operación y precio según la regla K2 (en alquiler, una dual usa `rent_price`);
  - zonas según la taxonomía de distritos, barrios, alias y texto libre, buscando en `zone` **o** `subzone`.
- **Ajustes** (`catalog_adjustments`): las exclusiones actúan antes del máximo; las inclusiones tienen plaza asegurada y se mezclan en el orden. Si son de otra operación, van en un grupo posterior.
- **Orden:** grupo, precio o novedad, y desempate por `created_at` e id. Límites: `max_below_inclusions` y `too_many_inclusions`.
- **Manual:**
  - `catalog_items`, con `position` de 100 en 100;
  - se añade buscando (`catalog_property_search`: mismos filtros, sin exigir foto, 20 por página, texto en BC y título) o por referencia (BC, slug o URL propia).
- **Cambio de modo:** con vista previa; al pasar de automático a manual se elige «restaurar» o «convertir».
- **Permisos:** solo el dueño de la HOME, con doble guarda: `withHomeAccess` en el servidor y `catalog_require_owner(p_actor)` en SQL. Otros miembros del staff, aunque sean admin, no ven nada. Confirmado.
- **Pendientes que no cambian:** G-ALQ, el diagnóstico de Recoletos y D13 en vivo.

### 1.4 Efectos de crear una ficha [V]

| Quién la ve o reacciona | Con `status available` (lo que hacen hoy todos los caminos de alta) | Con «borrador» (`status archived`, `archived_at` vacío) |
|---|---|---|
| Web `/web` (catálogo y detalle) | No, mientras `published_web = false` | No |
| Web: bloque «similares» de una ficha | **Sí** (no mira `published_web`) [V] | No |
| Web: «destacados» de la portada (`/api/portal/properties`) | **Sí**, y esa API pública devuelve también la **dirección** [V] | No |
| `/compartir/[slug]` y la imagen OG | Sí, por slug | `/compartir` no; la OG sí |
| Portal del cliente con sesión | Sí | No |
| Sugerencias y alertas de propiedades nuevas (cron) | **Sí**: el importador además renueva `created_at` y vuelve a avisar al reimportar | No |
| Catálogos automáticos de BCP-01 (en vivo, también los compartidos) | **Sí**, si cumple los criterios y tiene foto | No |
| Enlazado de particulares y fotos limpias (`portales-externos`) | Sí: puede cambiar las fotos si se enlaza con una web Mobilia | **Sí también**: ese proceso no mira el estado |
| Idealista, Portal Inmobiliario, vídeos | No (son manuales o solo para `scrape|api`) | No |

**Hoy no hay un estado «privado» limpio.** El «borrador» existe implícitamente (solo lo usa la conversión de captaciones de Chile), pero:
- guardarlo desde la ficha lo convierte en archivado del todo;
- reimportarlo lo vuelve a poner `available`;
- **ningún camino de alta lo crea**;
- `catalog_add_property` y la lectura de los catálogos excluyen las archivadas, así que **un borrador no puede estar en un catálogo**.

**Hallazgo de privacidad, previo a esta tarea:** la API pública `/api/portal/properties` y el bloque «similares» muestran viviendas no publicadas en la web. La API incluye la `address`. Hoy ya afecta a todo lo importado por enlace. Se propone tratarlo **aparte** (§6, S0).

## 2. Las dos búsquedas, comparadas

| Aspecto | Propiedades (lista) | Catálogo (selección) | Por qué difieren los resultados |
|---|---|---|---|
| Dónde se calcula | Navegador, sobre ≤ 2.000 filas | SQL (`catalog_candidates` / `catalog_select`), paginado | Con más de 2.000 fichas, la lista se queda corta sin avisar |
| Universo | Todas las de su país; cualquier estado; archivadas si se piden | España, `available|reserved`, no archivadas; **con foto** en automático | Una vendida o sin foto sale en Propiedades y no en el catálogo |
| Operación | Venta o alquiler (las duales, en las dos) | Venta, alquiler o las dos (las duales entran en venta y en alquiler) | Igual en lo básico |
| Precio | Siempre `price` | `rent_price` para las duales en alquiler; las que solo se alquilan usan `price` (K2, P-ALQ) | **Diferente para las duales**: Propiedades compara el precio de venta |
| Zonas | Igualdad exacta del texto de `zone` o `subzone`; opciones sacadas de los datos | Taxonomía de distritos y barrios con alias, trozos del texto y `zone` **o** `subzone`; texto libre | «Chamberí» y «Chamberi», o un barrio guardado en `zone`, dan resultados distintos |
| Otros filtros | Estado, agencia, etiquetas, estancia, dormitorios, baños, planta y m² | Ninguno | El catálogo no puede filtrar por eso hoy |
| Texto | Título, zona, agencia, etiquetas y referencias | BC y título, sin tildes | Distinto alcance |
| Orden | Fijo, por fecha de alta | Precio ascendente o descendente, o novedad | — |
| Permiso | `properties.view` (staff) | Solo el dueño de la HOME | — |

## 3. Qué se reutiliza y qué necesita un adaptador

| Pieza | Propuesta |
|---|---|
| **Vocabulario y aspecto de los filtros** (nombres, controles, chips, «Más filtros», parámetros de URL) | Se reutilizan, sacándolos a **componentes compartidos** (`components/admin/property-search/*`). Hoy son privados de la página de Propiedades. |
| **Lógica de búsqueda de Propiedades** (predicado en el navegador) | **No sirve** para el catálogo automático: ese tiene que evaluarse en SQL, en vivo, en el lector público. Además arrastra los defectos de precio y zonas. |
| **Motor del catálogo** (`catalog_candidates`, `catalog_select`, `catalog_property_search`, K2 y zonas) | Se **extiende** con los filtros nuevos y es el **dueño único** de la búsqueda del catálogo, tanto manual como automática. El motor de Propiedades no se toca sin un alcance aparte. |
| **Adaptador «filtros ↔ criterios»** | Un tipo `PropertyFilters` compartido, más su conversión a los criterios del catálogo y de vuelta, con normalización en TS y en SQL (pruebas de paridad como las de hoy). |
| **Filtros que pasarían a criterios** (a decidir, §7) | Dormitorios, baños, m², estancia, agencia, etiquetas y estado dentro de `available|reserved`: directos en SQL. **Planta:** hoy se deduce en TS (`resolveFloor`, de textos), así que haría falta llevar la regla a SQL o guardarla; se propone dejarla para más tarde. |
| **Importar por enlace dentro del catálogo** | El importador actual con `?catalogo=<id>` (como `?clienteId=`). Al confirmar, comprueba en el servidor que quien importa es el dueño y lo añade: en manual con `catalog_add_property`; en automático, como inclusión (`catalog_adjust`). Es T16b, bajo la puerta G3. |

### Cómo moverían los filtros reutilizados los dos modos (D-B1)

- **Manual:**
  1. el buscador nuevo, con todos los filtros, llama a `catalog_property_search` ampliado: sin exigir foto, paginado y con texto;
  2. «Añadir» lleva a `catalog_add_property`;
  3. el orden manual (`position`) no cambia.
- **Automático:**
  1. los mismos filtros se guardan como **criterios ampliados**;
  2. `catalog_select` los aplica en vivo;
  3. las exclusiones y las inclusiones manuales, el máximo, el orden y los grupos funcionan como hoy;
  4. la vista previa y el cambio de modo, sin cambios.
- **Compatibilidad:**
  - las claves nuevas son **opcionales**: si faltan, no filtran. Un catálogo guardado da **exactamente** el mismo resultado; se demuestra con la paridad TS↔SQL y con una prueba de «criterios antiguos → misma lista» sobre las fixtures;
  - la regla de precio K2 y la taxonomía de zonas **no cambian**;
  - G-ALQ sigue pendiente.
- **Migración necesaria:**
  - nuevas versiones de `catalog_criteria_normalize`, `catalog_candidates`, `catalog_select`, `catalog_auto_preview` y `catalog_property_search`;
  - el espejo en TS (`criteria.ts`, `selection.ts`, `explain.ts`).
  - **Sin cambios en los datos.**
  - **Vuelta atrás:** volver a las definiciones de 0196. Ojo: la normalización antigua **descarta las claves nuevas** al volver a guardar, aunque las filas de catálogo no se tocan.
  - La migración convierte la entrega en «grande o sensible»: requiere recuperación, una transacción e idempotencia.

## 4. Crear fichas: efectos y permisos

- **Hoy toda alta queda «disponible» y se ve en muchos sitios** (§1.4). Para importar PDF de colaboradores hay que decidir el estado inicial (§7, O-I3):
  - **A. Como el importador actual** (`available`, `published_web = false`): se puede meter en un catálogo enseguida. A cambio, aparece en `/compartir`, en el portal del cliente, en sugerencias y alertas, en los catálogos automáticos que encajen y en las dos fugas de la web.
  - **B. Borrador privado:** no aparece en ninguno de esos sitios. Hace falta un estado de verdad (o arreglar el implícito) y un paso «activar». Mientras sea borrador **no puede estar en un catálogo**.
  - **Recomendación:** B para el PDF, con «Revisar y activar» al final, que la deja `available` (todavía sin publicar en la web) y permite añadirla al catálogo en el mismo paso. Antes, o a la vez, S0 cierra las fugas.
- **Agencia:** el importador la fija en `portales-externos`. Para PDF de colaboradores hay que decidir si va en `portales-externos` o en la agencia colaboradora. Afecta a las etiquetas de fuentes y al cambio automático de fotos limpias.
- **Duplicados:** el importador deduplica por agencia y `external_id`. Un PDF no tiene id, así que hace falta un aviso de posibles duplicados (referencia, dirección, m² y precio). Se puede reutilizar la lógica de parecido que ya existe [I].
- **Fotos del PDF:** el endpoint actual (`/api/admin/properties/upload/photo`):
  - exige que la ficha ya exista y el permiso `properties.edit`;
  - no limita tamaño ni tipo y no convierte el formato.
  - Propuesta: redimensionar y convertir en el navegador antes de subir, o añadir una validación en el servidor (a decidir en el plan).
- **Permisos:**
  - **Importar PDF desde Propiedades:** el mismo permiso que el importador, `properties.create`: agent_senior, agent_admin, advisor, admin y owner. agent_junior solo ve; captadora y client no entran.
  - **Desde el catálogo:** además, ser dueño de la HOME.
  - **Herramienta compartida:** el parámetro `catalogo` se ignora, con el mismo 404, para quien no sea el dueño. **Ningún otro miembro del staff gana acceso a la HOME.**
  - **Defectos de permisos ya existentes, a corregir aparte o al tocar estas piezas:**
    - la página de importar exige ver y no crear, y sin crear da un error sin tratar;
    - `properties.publish` no se comprueba en el servidor (`updateProperty` escribe `published_web` con solo `edit`), así que la importación **no** debería ofrecer «publicar en la web»;
    - la RLS de `property_shares` puede impedir a advisor y agent_senior generar un enlace `/c` [I].

## 5. Flujo propuesto (sencillo)

```
Propiedades → «Añadir ▾» → Importar por link | Importar desde PDF | Añadir manualmente
Catálogo (HOME) → Viviendas → [Buscador como en Propiedades]
        → resultados → «Añadir» (manual) / «Incluir» o «Excluir» (automático)
        → «Añadir desde un enlace» | «Añadir desde PDF» (mismo importador, ?catalogo=…)

Importar desde PDF (en el navegador):
 1. Subir el PDF → PDF.js saca texto e imágenes; Tesseract solo en las páginas escaneadas.
 2. Separar: propuesta de N viviendas (por página, encabezados, referencias o precios),
    con miniaturas de las páginas para unir, dividir o mover páginas y fotos.
 3. Revisar cada borrador: formulario como el del importador por enlace.
    Campo vacío = «Falta»; campo dudoso = «Dudoso», con su fragmento y su página. Nada inventado.
 4. Confirmar uno a uno → ficha (según O-I3) → su enlace de siempre
    (/compartir, «Generar enlace») → y, si se vino desde el catálogo, «Añadir al catálogo».
```

- **Varias viviendas en un PDF:** un borrador por vivienda, que se revisa, confirma o descarta **por separado**.
  - El lote recuerda en qué va (en el navegador) para no repetir altas.
  - Nunca se confirma todo de golpe sin revisar.
- **Muestras:** los límites reales (digital, escaneado, mixto, varias viviendas) se fijan con las muestras de Fabricio. No se promete extraer bien cualquier PDF.

## 6. Entregas propuestas

| Entrega | Qué es | Tamaño | Depende de |
|---|---|---|---|
| **S0** · Cerrar las fugas de la web | `published_web` en «similares» y en `/api/portal/properties` (y quitar `address` de esa API) | Pequeña-media, de privacidad | Decisión de Fabricio |
| (en curso) PDF en un hilo | Expediente `2026-10-17-bcp-01-pdf-worker`, en borrador con O1 pendiente | Grande | Su aprobación |
| **S1** · Buscador compartido | Sacar los filtros de Propiedades a componentes compartidos **sin cambiar su comportamiento** (con regresión de Propiedades) | Media | D-B1 |
| **S2** · Criterios ampliados | Migración y espejo TS: filtros nuevos opcionales en `catalog_*`, compatibilidad demostrada | Grande (migración) | S1, y decidir qué filtros (O-B2) |
| **S3** · Nueva selección del catálogo | Sustituye «Modificar criterios» por el buscador, en los dos modos, con vista previa, ajustes y cambio de modo. El panel antiguo se retira solo con paridad | Grande (interfaz del dueño) | S2 |
| **S4** · Enlace → catálogo | Importador con `?catalogo=` (T16b y G3) | Media | S3 y O-I3 |
| **S5** · Importar PDF | Exploración con muestras → especificación → plan; después Propiedades y catálogo | Grande | Muestras, O-I1 a O-I5 y S0 |

El orden entre estas entregas y el PDF en un hilo lo decide Fabricio. La secuencia registrada sigue siendo: el hilo primero, después la importación de PDF. El buscador (S1–S3) es nuevo y **no se ha colocado** sin su decisión.

## 7. Decisiones pendientes de Fabricio

- **O-I1. Qué es «Crear link»:**
  - (a) «Importar por link» de Propiedades;
  - (b) el SmartLink `/compartir` y «Generar enlace» (`/c/…`);
  - (c) el «Crear link temporal» de Particulares (`/a/…`, 7 días, otra tabla).
  - La exploración supone **a + b** (crear la ficha y usar sus enlaces de siempre).
- **O-B1. Si un filtro se comporta distinto en Propiedades y en el catálogo, cuál manda.**
  - Recomendación: las reglas del catálogo (precio K2, zonas con taxonomía, solo `available|reserved`), con el aspecto de Propiedades y sin copiar sus defectos.
- **O-B2. Qué filtros de Propiedades pasan a ser criterios del catálogo.**
  - Propuesta: dormitorios, baños, m², estancia, agencia, etiquetas y estado (disponible o reservada).
  - La planta, más tarde. El texto, solo para buscar a mano. ¿Más órdenes?
- **O-B3. ¿Se corrigen ya los defectos de Propiedades** (precio de las duales, zonas, límite de 2.000), o en un alcance aparte?
  - Recomendación: aparte.
- **O-I3. Estado inicial de una ficha importada de un PDF.**
  - Recomendación: borrador privado, después «Revisar y activar», y entonces catálogo.
- **O-I4. Agencia de lo importado de colaboradores:** `portales-externos` o la colaboradora. ¿Y deben saltar las alertas a clientes?
- **O-I5. Revisión de PDF con varias viviendas:** confirmar una a una (recomendado) o permitir confirmar el lote ya revisado.
- **O-S0. ¿Se cierran ya las fugas de la web** como entrega pequeña aparte?
- **Orden de las entregas** frente al PDF en un hilo.
- **Muestras de PDF** representativas: digitales, escaneados, mixtos y con varias viviendas.

## 8. Archivos importantes

- **Propiedades:**
  - `app/[country]/(admin)/admin/propiedades/page.tsx`;
  - `properties-admin-client.tsx`;
  - `importar/*`;
  - `[slug]/property-edit-view.tsx`;
  - `app/(admin)/admin/propiedades/actions.ts` e `importar/actions.ts`.
- **Importador:**
  - `lib/sync/import-by-link/*`;
  - `lib/portal-links/auto-import.ts`;
  - `lib/sync/watermark.ts`.
- **Enlaces:**
  - `app/compartir/[slug]/*`;
  - `app/c/[token]/page.tsx`;
  - `components/admin/smart-links-panel.tsx`;
  - `lib/db/queries/shares.ts`;
  - migración `0007`.
- **Visibilidad:**
  - `lib/portal-fetch.ts`;
  - `app/web/propiedades/[id]/page.tsx`;
  - `app/api/portal/properties/route.ts`;
  - `lib/db/queries/suggested-properties.ts`;
  - `app/api/cron/property-alerts`;
  - `lib/particulares/linking-runner.ts`.
- **Catálogo:**
  - `lib/catalogs/{criteria,selection,operation-price,zones,explain,queries,ref,manager-state}.ts`;
  - `components/admin/catalogs/{selection-panel,property-search,catalog-manager}.tsx`;
  - `manager/homes-section.tsx`;
  - migraciones `0195`, `0196` y `0202`.
- **Permisos:**
  - `lib/permissions.ts`;
  - `lib/auth/guard.ts`;
  - `lib/catalogs/{owner,access}.ts`.
