# BCP-01 · Buscador del catálogo, conversión de automáticos e importación (enlace y PDF): especificación

- **Tamaño:** grande o sensible. Hay tres migraciones, permisos en el servidor y creación de fichas.
- **Base:** `origin/main` = `341d9ab`, el 18-10-2026.
- **Exploración previa (no se repite aquí):** [2026-10-17-bcp-01-importar-y-buscar/exploracion.md](../2026-10-17-bcp-01-importar-y-buscar/exploracion.md).
- **Plan:** [plan.md](plan.md). **Estado de cada parte:** [checklist.md](checklist.md).

## Aprobaciones y decisiones de Fabricio

| # | Fecha | Contenido |
|---|---|---|
| D-B2, D-I2, D-O1 | 17-10-2026 | Recogidas en la exploración: buscador **sin** «Manual / Automático»; flujo de importación; orden de entregas. |
| **D1** | 18-10-2026 | **Autorización de la tanda completa.** Esta especificación y su plan **no necesitan otra aprobación**: Fabricio pidió consolidarlos, comprobar que no se contradicen y ejecutar. Solo se para ante una decisión de producto nueva, un efecto no aprobado, un permiso adicional o un fallo material de arquitectura. |
| D2 | 18-10-2026 | **Producto aprobado:** el buscador nuevo, la conversión de los automáticos, el flujo de importación compartido y la extracción de PDF, tal como se resumen en §1. |
| D3 | 18-10-2026 | **Límites (literal):** «No agent production/VPS access, credentials, real record writes, paid services, real AI calls or additional Codex review. Fabricio performs merges and production QA. Document migration/deployment effects before each merge.» |
| D4 | 18-10-2026 | **Lo que sigue abierto:** G-ALQ, el diagnóstico original de Recoletos y D13 en vivo quedan pendientes hasta que haya su prueba concreta. Las pruebas del buscador nuevo **no** demuestran el caso de producción original. Ni esos puntos ni la validación con PDF representativos se dan por cerrados porque la implementación esté terminada. |
| D5 | 18-10-2026 | **QA de #325:** Fabricio informa de que la hizo en producción con éxito. No se deduce de ahí que se revisaran los logs del hilo ni que se midiera D13 en vivo (anotado en el `result.md` del hilo). |

## 1. Qué se pide

### 1.1 Buscador nuevo del catálogo

- **Sustituye** a «Modificar criterios» y al interruptor Manual / Automático. El flujo es el de Propiedades: filtrar, mirar los resultados y **elegir viviendas una a una**.
- **Filtros:** texto y referencias, operación, zona, precio, m², dormitorios, baños, estancia, agencia, etiquetas, estado y planta.
- **Comportamiento:**
  - El precio de alquiler y las zonas se comparan bien.
  - Ningún filtro se omite en silencio y no se copian los defectos conocidos de Propiedades.
  - La paginación es del servidor y no hay corte a 2.000.
- **Se mantienen** España V1, los permisos (solo el dueño de la HOME), la elegibilidad del catálogo y el máximo de 24 viviendas.
- **Se explica** por qué una vivienda no se puede añadir.
- Se reutilizan los controles y la lógica que manda. El motor de Propiedades **no cambia**.

### 1.2 Catálogos automáticos que ya existen

- **Hasta la conversión:** siguen igual.
- **Antes de convertir:** se ve una vista previa con las viviendas efectivas y su orden.
- **Al confirmar:** se conserva todo lo del catálogo (selección, textos, preferencias de fotos, portada, contacto, enlaces y grupos de la HOME). Se vuelve a comprobar la lista; si cambió desde la vista previa, se recarga, no se convierte en silencio.
- **Recuperación:** lo recuperable se guarda y la vuelta atrás queda documentada.
- **No se hace** ninguna interfaz automática nueva ni un cambio de modo con otro nombre.

### 1.3 Importación compartida

**El flujo:**
- Anuncio externo o PDF → **borrador privado y editable** → confirmación humana → ficha con sus enlaces de siempre → inclusión opcional en un catálogo.
- Se entra desde Propiedades (staff con permiso) y desde el flujo de catálogos de Fabricio. Nadie más gana acceso a la HOME.

**Mientras es borrador:**
- La ficha solo se crea al confirmar.
- El borrador no sale como ficha activa, en catálogos, en alertas ni en ninguna superficie pública. **No** se usa el estado archivado como borrador.

**Al confirmar:**
- Se puede elegir la agencia colaboradora.
- Por defecto, **sin** publicación en la web y **sin** alertas por correo a clientes, y eso lo impone el servidor, también en el cron de alertas.
- Las demás notificaciones no cambian.
- La revisión explica qué pasa al activar la ficha. Por ejemplo, ya confirmada y disponible, puede salir en el portal del cliente con sesión.

**Duplicados y fallos:**
- Se detectan duplicados y nunca se sobrescribe sin confirmación explícita.
- Ni los reintentos ni un doble envío crean duplicados.
- Si la ficha se crea pero fallan las fotos o el catálogo, la ficha se conserva y se ofrece reintentar.

### 1.4 Extracción de PDF

- Gratis y en el navegador, con OCR. Sirve para PDF digitales, escaneados, mixtos y con varias viviendas.
- Sale **un borrador por vivienda**, con herramientas para corregir la separación y el reparto de fotos.
- Los campos que faltan o son dudosos se marcan, con la página de donde salen.
- Nada inventado, sin servicios de pago y sin IA.
- Se respetan E3, las reglas de textos, fotos y privacidad del catálogo, y los permisos.
- **Muestras:** se piden PDF representativos a Fabricio. Mientras tanto se trabaja con fixtures sintéticos, y la aceptación con muestras reales queda **pendiente**. No se promete que cualquier PDF se extraiga bien.

## 2. Decisiones de implementación (Claude)

Concretan lo ya aprobado; ninguna es una decisión de producto nueva. Si Fabricio prefiere otra cosa, se cambian.

### Buscador y selección

| # | Decisión |
|---|---|
| I-1 | **Universo:** España, todos los estados. Las viviendas no elegibles (vendida, archivada, ya en el catálogo, catálogo lleno) **salen con su motivo y sin «Añadir»**. El filtro «Estado» arranca en «Disponibles y reservadas». Una vivienda sin fotos se puede añadir, con el aviso «Sin fotos», como hoy en manual. |
| I-2 | **Precio:** se aplica la regla K2. Para filtrar por precio hay que elegir operación; sin ella, el control queda desactivado y lo dice. La operación arranca en la del catálogo. |
| I-3 | **Zonas:** se usa la taxonomía del catálogo (`catalog_zone_match`: distritos, barrios, alias y «Otras zonas» con texto libre), mirando `zone` **o** `subzone`. Hasta 30. |
| I-4 | **Texto y planta** se calculan en el servidor, en TS, con la lógica que manda: `matchesPropertySearch`, sin cambiar su firma (un envoltorio del catálogo pliega las tildes), y `resolveFloor`. **El resto de filtros va en SQL.** Detalles: <ul><li>Se piden filas ligeras.</li><li>Los textos de la planta solo se piden cuando ese filtro está activo y para la página que se muestra.</li><li>El servidor pagina sobre el total real.</li><li>La RPC devuelve **un único jsonb**, para no chocar con el `db-max-rows` de 1.000 filas de PostgREST.</li></ul> |
| I-5 | **Cómo se aplica cada filtro:** <ul><li>Estancia: igualdad estricta, como en Propiedades; solo con alquiler o con «Todas».</li><li>Dormitorios: exacto o «N o más».</li><li>Baños: un mínimo.</li><li>m²: un rango.</li><li>Agencia: por id.</li><li>Etiquetas: basta con una.</li><li>Orden: las más recientes por defecto, o precio efectivo de menor a mayor o de mayor a menor.</li></ul> |
| I-6 | **Máximo de 24 en SQL** (`catalog_add_property` → `catalog_full`). Comprueba en este orden: automático → archivado → la propiedad → «ya está» → lleno. Cuentan las filas visibles (disponibles o reservadas). Un catálogo que hoy tenga más de 24 **no pierde nada**: solo deja de admitir altas. |
| I-7 | **Modo y operación del catálogo:** <ul><li>Los catálogos nuevos ya nacen en `manual` (`0195`, `DEFAULT 'manual'`).</li><li>El interruptor de modo desaparece de la interfaz.</li><li>«Operación del catálogo» se queda como ajuste, porque decide qué precio ven el lector y el PDF. Se guarda con una función propia, `catalog_set_operation`, que cambia solo `criteria.operation` y sube `version`. No se usa `catalog_set_criteria`, que puede fallar con restos de precios o ajustes antiguos.</li><li>La función SQL `catalog_set_mode` se conserva, porque la usan las pruebas.</li></ul> |

### Catálogos automáticos antiguos

| # | Decisión |
|---|---|
| I-8 | **Siguen igual hasta convertirse:** lista en vivo, criterios, incluir y excluir. Se hace por fases: <ul><li>P3 no toca su panel.</li><li>P4 cambia sus botones de modo por «Ver conversión».</li></ul> «Restaurar» deja de ofrecerse porque es un cambio de modo. La lista manual guardada queda en `catalog_conversions`. |
| I-9 | **Conversión:** <ul><li>La vista previa da la lista efectiva ordenada, con claves, `version`, las inclusiones que se pierden y las filas manuales que se archivan.</li><li>Al confirmar se mandan `expected_version` y `expected_ids`. Si no cuadran, devuelve `selection_changed` y se recarga.</li><li>Se conservan las claves que ven los lectores, el orden, `criteria`, los ajustes (inertes), la portada, los textos, las fotos, el contacto, los enlaces y los grupos.</li><li>Un catálogo archivado no se convierte.</li></ul> |

### Importación

| # | Decisión |
|---|---|
| I-10 | **Borradores:** tabla `property_import_drafts`, solo `service_role`. Cada borrador es **privado de quien lo crea**. Caduca a los 30 días; la limpieza es perezosa, con sus archivos, por la API de Storage. |
| I-11 | **Fotos:** <ul><li>Las de PDF van a un bucket **privado**, `property-import-drafts`, con el tipo comprobado por su firma, límites de tamaño y de píxeles, recodificadas a WebP de 2560 px como máximo y nombradas por hash. La ruta de subida pasa por el middleware, con su barrera de sesión, y admite **8 MB** como máximo: el navegador ya manda la foto reducida.</li><li>Las de enlace: las URL las saca **el servidor**, y el navegador solo reordena o quita por índice.</li><li>Las descargas pasan por una guarda de salida: solo https; nada de IP privadas, loopback ni link-local; cada redirección se revalida; y hay límites de tamaño y de tiempo.</li></ul> |
| I-12 | **Confirmación en pasos idempotentes**, cada uno con su estado: <ul><li>(a) **Crear:** una función SQL que bloquea el borrador e inserta la ficha con una lista explícita de columnas. Fija `country='es'`, `published_web=false`, la supresión de alertas y `source='manual'`. El slug sale del id del borrador y un choque de clave da `duplicate_key`. Si el borrador ya tiene ficha, devuelve esa.</li><li>(b) **Fotos:** por tandas, con rutas fijas y `upsert`.</li><li>(c) **Catálogo:** `catalog_add_property`; «ya está» cuenta como hecho.</li><li>(d) **Enlace del cliente:** `linkId`/`clienteId`, como hoy.</li></ul> V1 no crea fichas duales: si hay dos precios, se marcan «dudoso». |
| I-13 | **Duplicados:** se buscan por misma agencia y `external_id`, misma `source_url`, una referencia BC citada o por parecido (`linking-core`/`similarity`). Hay tres salidas: <ul><li>«Usar la existente».</li><li>«Crear otra igualmente», que no se ofrece si choca la clave.</li><li>«Actualizar la existente», solo si coinciden la clave o la URL. Enseña lo que cambia, comprueba el `updated_at` y **nunca** toca fotos, estado, publicación, alertas ni `created_at`. *Ajuste del 18-10, P5: se quitó «Reemplazar fotos»; así es más conservador.*</li></ul> **Nunca se sobrescribe sin elegirlo.** |
| I-14 | **Agencia:** `portales-externos` por defecto, o una colaboradora (con `agency_feeds`), validada por id. Con una colaboradora: <ul><li>`external_id` lleva un espacio de nombres (`pdf:<hash>`, `link:<portal>:<id>`), para que no choque con los ids de su feed.</li><li>La revisión avisa de lo que cambia: la etiqueta «Web de X» y que no se aplican las fotos limpias automáticas.</li></ul> |
| I-15 | **Publicación y alertas apagadas, y lo impone el servidor:** <ul><li>La importación nunca escribe `published_web`.</li><li>Columna nueva `properties.new_listing_alerts_suppressed boolean NOT NULL DEFAULT false`. La importación la pone en `true` salvo que en la revisión se marque «Avisar por correo».</li><li>El cron la respeta con una opción explícita, `forAlerts`, **también en el primer envío** a un cliente, cuando todavía no hay fecha anterior. *Ajuste del 18-10, P5: atarlo a `createdAfter` dejaba ese hueco.* El panel, el portal y «Enviar por correo» no cambian, y las demás altas tampoco (por el valor por defecto).</li><li>Si alguien la reactivara más tarde no saltaría ninguna alerta, porque el reloj del cron ya ha pasado. Por eso solo se avisa si se marca al confirmar.</li></ul> |
| I-16 | **Entradas:** <ul><li>Propiedades → «Añadir ▾» → «Importar por link» / «Importar desde PDF». Con `properties.create` (`checkPermission`); la página comprueba `create`.</li><li>Catálogo → «Añadir desde enlace» / «Añadir desde PDF», con `?catalogo=<id>`. El servidor comprueba que es el dueño **al crear el borrador y al confirmar**; si no lo es, se ignora el parámetro.</li><li>Desde Propiedades, el dueño puede elegir un catálogo explícito.</li><li>A un catálogo automático antiguo no se añade: se pide convertirlo antes.</li></ul> |

### PDF

| # | Decisión |
|---|---|
| I-17 | **Herramientas:** `pdfjs-dist`, y `tesseract.js` con su core en wasm y los datos `spa`/`eng`, todo Apache-2.0. Se sirven desde nuestro servidor, con una lista cerrada de archivos y sin CDN. El PDF no sale del navegador. El OCR se usa **solo en las páginas sin texto**. Solo España (V1). |
| I-18 | **Extracción con reglas:** <ul><li>Campos: precio (€ o €/mes), m², dormitorios, baños, planta (`resolveFloor`), referencia, zona (taxonomía), estancia y descripción.</li><li>Cada campo lleva `valor`, su estado (`seguro`, `dudoso` o `falta`) y la prueba de dónde sale `{página, fragmento}`.</li><li>Los teléfonos, correos y URL del colaborador se marcan y se quitan de la descripción, a la vista.</li><li>La dirección va a `address`, que es privada (S0).</li></ul> |
| I-19 | **Separación de viviendas:** se propone empezar una nueva en cada página con precio y m² o dormitorios. Herramientas: miniaturas, dividir, unir, mover páginas, asignar, quitar, ordenar y elegir portada de las fotos, y recorte rectangular. Cada borrador se confirma **por separado**. |

### Fuera de alcance

| # | Decisión |
|---|---|
| I-20 | **Se anota y no se toca:** <ul><li>Los defectos de Propiedades (O-B3).</li><li>`updateProperty`, que no comprueba `properties.publish`, de modo que agent_senior puede publicar en la web.</li><li>La RLS de `property_shares`, que impide a advisor y agent_senior crear enlaces `/c`.</li><li>`importPortalLink`, que, junto con `insertImportedProperty` (el código que comparte), sigue creando fichas disponibles y con alertas, sin revisión, desde los enlaces de cliente. **A decidir por Fabricio aparte.**</li></ul> |

## 3. Comprobación de contradicciones

| Posible choque | Cómo queda |
|---|---|
| «Sin interfaz automática nueva» frente a «conservar los automáticos» | Se conserva la interfaz antigua tal cual, solo para esos catálogos. |
| El máximo de 24 frente a manuales que ya tengan más | No se borra nada; solo se bloquean las altas. |
| `criteria.operation` sigue haciendo falta | Se queda como ajuste de cómo se muestra el catálogo. No decide qué viviendas entran. |
| Borrador privado frente a añadirlo al catálogo | Solo se añade al catálogo la ficha ya creada, nunca el borrador. |
| Alertas apagadas frente al reloj del cron | Se usa una columna de supresión y solo se avisa si se marca al confirmar. Queda documentado. |
| Agencia colaboradora frente a su feed | `external_id` con espacio de nombres. |
| «No cambiar Propiedades» frente a sacar sus controles | Solo se sacan los componentes y las opciones. Antes se escribe una prueba de caracterización. |
| Quitar «restaurar» frente a conservar lo recuperable | Se quita porque sería un cambio de modo con otro nombre. La lista se conserva en `catalog_conversions`, con un SQL de deshacer probado. |
| El flujo con borrador frente a `importPortalLink` | Son caminos distintos; aquel no se toca y se avisa. |
| «Sin IA» frente a OCR | Tesseract corre en el navegador. No hay modelo ni servicio externo. |

## 4. Criterios de aceptación

| # | Criterio |
|---|---|
| A1 | Cada filtro funciona hasta sus límites, incluidas las viviendas duales (K2), los alias de zona y las zonas en `subzone`. La paginación y los totales salen bien con más de 2.000 fichas. |
| A2 | Solo el dueño de la HOME puede buscar y modificar el catálogo. Se respetan España, la elegibilidad y el máximo de 24, y la lista explica por qué una vivienda no se puede añadir. |
| A3 | La selección explícita mantiene el orden, quitar y la portada. Propiedades se comporta exactamente igual que antes, según su prueba de caracterización. |
| A4 | Convertir un catálogo da **la misma huella y las mismas claves**. Si algo cambió desde la vista previa, sale `selection_changed` y se recarga. Lo anterior queda guardado y deshacer funciona. |
| A5 | El borrador no aparece en Propiedades, catálogos, alertas ni en la web. La ficha nace con `published_web=false` y sin alerta si no se marca. El cron se salta las suprimidas. |
| A6 | Un doble clic, un reintento o dos pestañas crean **una sola** ficha. Si fallan las fotos o el catálogo, la ficha se conserva y se puede reintentar. Ningún duplicado se sobrescribe sin elegirlo. |
| A7 | Se puede importar desde Propiedades y desde el catálogo. `?catalogo=` se ignora si no eres el dueño. La importación termina en los enlaces de siempre (`/compartir`, `/c`). |
| A8 | Los cuatro fixtures sintéticos de PDF (digital, escaneado, mixto y varias viviendas) dan borradores con «Falta» y «Dudoso» y su prueba. **Con PDF reales: pendiente** hasta tener muestras. |
| A9 | El lector, la exportación a PDF, los controles de fotos (E3) y los grupos de la HOME siguen funcionando. |
