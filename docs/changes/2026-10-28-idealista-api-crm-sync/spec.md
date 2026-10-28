# Idealista API → CRM: especificación

Cuando Idealista confirma una publicación por API, el CRM reutiliza la propiedad enlazada o crea una **ficha de referencia** del anuncio. La ficha lleva sus fotos, el contenido, la etiqueta «RESERVADO» que ya existe y un SmartLink público estable. Cuando Idealista confirma una baja por API, la ficha de referencia se archiva y su SmartLink deja de servirse.

- **Tamaño:** grande o sensible. Hay migraciones, datos reales, permisos en servidor y una integración externa que escribe.
- **Responsable:** Fabricio
- **Estado:** aprobada para ejecución, revisión 4 (2026-10-28). Ver «Aprobación».
- **Base comprobada:** `origin/main` = `3f8ad3b2d88d42324652bedc29c44b9a7e8e9ffb`

## Contexto

Comprobado leyendo el código de `3f8ad3b2`, salvo lo marcado **(sin comprobar)**.

### Ficha del CRM y etiqueta

- **Ficha del CRM.** Es una fila de `properties`:
  - `status` puede ser `available`, `reserved`, `sold` o `archived`;
  - `archived_at` y `archived_reason`, con un CHECK que hoy solo admite `'portal_down'` (0215);
  - `bc_reference` es obligatoria, única y con valor por defecto (0011);
  - `published_web`, `new_listing_alerts_suppressed` (0214) y `country`;
  - la procedencia: `source`, `agency_id` + `external_id` (únicos juntos, 0016) e `internal_notes`;
  - `trg_property_history` registra los cambios de `status`, `price` y `published_web`.
- **Etiquetas.** `property_tags` es por país (0201). «RESERVADO» solo puede existir en los datos **(sin comprobar)**. Ninguna superficie pública lee etiquetas.

### Enlace heredado entre ficha de Idealista y propiedad

`idealista_listings.property_id` es único y está en `ON DELETE CASCADE`. Escribirlo arrastra cuatro efectos:
- el robot programado elige las fichas que lo tienen;
- el formulario en modo no inspo reescribe la ficha;
- cambia el emparejamiento de leads;
- borrar la propiedad borra la ficha que guarda el `api_property_id`.

### Partner API

Todo pasa por `lib/services/idealista/partner-api/publish.ts`.

- **Confirmación:** cualquier 2xx.
- **Red:** los errores de red llegan con estado 0.
- **Escrituras locales:**
  - tras un alta, un fallo al escribir la ficha devuelve `ok:false`;
  - en `deactivate` y `reactivate`, la escritura local va dentro del mismo `try` que la llamada;
  - `reactivate` no deja `logCall`;
  - `logCall` se traga sus propios fallos.
- **`api_last_sync_at`:** la escriben publicar, dar de baja, reactivar, `refresh-state` y «Reconciliar».
- **«Reconciliar»** (`reconcile.ts`) lee todos los anuncios de la cuenta (`findEveryProperty`) y empareja por `api_property_id` y después por `reference_code`. Solo lee de Idealista.
- **Archivar en el panel no es dar de baja.** `archive-listing`, `delete-listing`, `restore-listing` y `update-state` solo tocan la fila local.

### Multimedia

**En la ficha de Idealista.**
- `photo_ids`, `plan_ids` y `video_ids` son `text[]` de URLs, y el orden es el del array.
- Se mandan las fotos y después los planos, hasta 200, por el proxy `/api/public/idealista-photos/…`, que pone la marca de BC y convierte a JPEG al vuelo.
- Los vídeos van con su URL original.
- El vídeo automático de la ficha y `api_virtual_tour_url` no se mandan desde ningún sitio.
- Los archivos están en el bucket público `properties-photos`.

**En la propiedad.**
- `property_photos` tiene `position`, `is_cover` y `cover_photo_url`.
- `property_media` tiene `storage_path` único y ningún orden.
- No hay recuento de referencias: `deletePropertyPhoto` borra el archivo y todas las filas con esa URL, y `deleteProperty` borra los archivos de sus fotos.

**Piezas que se reutilizan:**
- `lib/net/safe-fetch.ts` hace descargas con protección de red, un límite de 25 MB y 20 s;
- `scripts/sql/run-local.sh` levanta el Postgres temporal;
- `scripts/shims/supabase-on-psql.mts` permite ejecutar el código real contra ese Postgres;
- `scripts/sim/postgrest-sim.mts` es un PostgREST simulado para el build de producción.

### SmartLink

- **`/compartir/{shareSlug}`.** `getPropertyBySlugPublic` lee con service role, sin sesión. Exige que la ficha no esté archivada; no mira `published_web`.
- **La página proyecta la fila** con `propertyRowToClientProperty`.
- **Geocodifica `address`.**
- **Agencia `portales-externos`:** si es la de la ficha, reescribe la descripción con IA.
- **Archivar deja sin servicio** `/compartir`, `/c/[token]`, `/og/property/[slug]` y `/p/[slug]/[idx]`.

### Distribución

El inventario detallado de superficies está en un **anexo privado**, fuera del repositorio, que es público. Las que esta tarea cierra a las fichas de referencia son:
- la web pública;
- el portal de clientes;
- las sugerencias;
- las alertas;
- los catálogos;
- las listas `/s` y su búsqueda;
- las selecciones y colecciones de visitas;
- las colaboraciones;
- los favoritos;
- el correo de oferta;
- el selector del panel de Idealista.

## Decisiones

Las decisiones de Fabricio no se reabren.

### Primera tanda (2026-10-28)

- **D1.** Cuando Idealista confirma una publicación por API, se crea o se reutiliza la ficha del CRM que corresponde y se asocia a la ficha de Idealista.
- **D2 (cerrada).** Solo se asigna la etiqueta «RESERVADO» que ya existe para el país que corresponde. No se crean etiquetas alternativas.
- **D3.** La etiqueta es una convención interna. No prueba ninguna reserva ni cambia la disponibilidad. Se conserva la procedencia.
- **D4.** Cuando Idealista confirma una baja por API, se archiva la ficha generada por la sincronización y se conserva su historial. Una propiedad real que ya existía no se archiva nunca de forma automática.
- **D5.** Ni la publicación repetida, ni las actualizaciones, ni los reintentos crean duplicados.
- **D6.** Si falla algo local después de la confirmación de Idealista, se informa del fallo y se reintenta solo la sincronización, nunca la publicación.
- **D7.** No cambian los payloads, la autenticación ni el comportamiento frente a la API de Idealista. La baja por API y el archivado del panel son cosas distintas.

### Segunda tanda (2026-10-28)

- **D8.** Solo se reutiliza de forma automática una propiedad enlazada explícitamente o una asociación ya registrada.
- **D9.** Una coincidencia por URL de origen necesita revisión antes de tocar la propiedad existente.
- **D10.** No se rellenan en bloque los anuncios antiguos.
- **D11.** No se puede borrar una propiedad mientras su anuncio esté activo o en estado desconocido.
- **D12.** Una propiedad existente conserva la etiqueta después de una baja.
- **D13.** Las fichas de referencia generadas son internas. D15 matiza en qué sentido.
- **D14.** Solo se usa «RESERVADO», sin etiquetas alternativas, y no se cambia la disponibilidad de una propiedad existente.

### Enmienda (2026-10-28)

- **D15.** Las fichas de referencia se comparten con el SmartLink público que ya existe, **sin pedir login**. El acceso por el enlace no autoriza a incluirlas automáticamente en:
  - la web pública;
  - las listas del portal de clientes;
  - las recomendaciones;
  - los catálogos;
  - las alertas.

  Se exponen solo los campos aptos para el público, sin notas internas ni datos del propietario o de contacto. El SmartLink lleva fotos y contenido, no cambia con las actualizaciones y deja de estar disponible al archivarse tras una baja confirmada.
- **D16.** La etiqueta se vuelve a aplicar en cada publicación, actualización o reactivación confirmada.

### Aprobación de la ejecución (2026-10-28)

- **D17.** La asociación vive **solo** en la tabla nueva de sincronización. No se escribe `idealista_listings.property_id`.
- **D18.** La operación se registra de forma duradera **antes** de llamar a Idealista. Si ese registro falla, no se envía la petición.
- **D19.** Las operaciones de sandbox se pueden registrar, pero no crean ni modifican fichas del CRM.
- **D20.** Cuando el estado es incierto, se permite la comprobación manual de solo lectura que ya existe.
- **D21.** Las fichas de referencia van en una **agencia técnica propia**, y se conserva la marca pública de BC.
- **D22.** Solo se permiten los SmartLinks públicos. El correo de oferta **no** se habilita para fichas de referencia.
- **D23.** Las fotos y los planos se copian. Los vídeos se referencian, y queda documentado que borrar el original quita el vídeo del SmartLink.
- **D24.** Se despliega con la sincronización apagada. Fabricio la enciende después de las comprobaciones.

### Decisiones mías (corregibles)

- **C1. Contenido reflejado.** La sincronización gestiona estos campos y los reescribe en cada publicación confirmada:
  - título, descripción, operación y precio;
  - dormitorios, baños, m² y características;
  - zona y dirección;
  - multimedia.

  Nunca cambian el slug, `bc_reference`, las otras etiquetas ni la procedencia. El estado solo cambia al archivar o desarchivar.
- **C2. Dirección y coordenadas.** Siguen el `address_visibility` de la ficha con la **misma regla que el mapper** (`mapper.ts:302`), para no enseñar nunca más de lo que enseña Idealista:
  - `street`: calle y ciudad, sin coordenadas;
  - `hidden`: solo la zona;
  - cualquier otro valor (`exact` o vacío): calle, número y ciudad, con coordenadas.

  Nunca se guardan la puerta, el bloque ni la planta. *(Ajustado en la ejecución: la revisión 4 decía «cualquier otro valor: solo la zona», que no coincidía con el mapper.)*
- **C3. Baja.** Solo se archiva una ficha generada que esté en `available`. Si otro estado se ha puesto a mano, queda en «revisar».
- **C4. Reactivación.** Volver a publicar desarchiva solo `archived_reason = 'idealista_api_withdrawn'`.
- **C5. Slug.** El prefijo habitual por título más al menos 10 caracteres aleatorios en base 36.
- **C6. Resolución del alta sin id con «Reconciliar».** Si un alta queda sin id, la comprobación de estado (`refresh-state`) no sirve, porque necesita el id. Por eso se usa «Reconciliar», que ya existe, es manual y solo lee (ver sección 3). No se habilita nada nuevo.

## Diseño

### 1. Registro de operaciones de solo añadir (correcciones 4 y 5)

Hay tres tablas en las que nunca se actualiza ni se borra nada; lo impide un trigger. Todas toman su orden de **una sola secuencia** `idealista_ops_seq`.

**`idealista_api_operations`.** Se inserta antes de la llamada. Columnas:
- `seq`, `op_id` (uuid único, generado antes de llamar);
- `listing_id`, `environment` (`sandbox` o `production`);
- `kind`: `create`, `update`, `deactivate`, `reactivate`, `observe` (refresh-state) u `observe_reconcile`;
- `api_property_id_before`, `reference_code`;
- `content_snapshot` y `media_manifest`, con lo que se va a mandar: las URLs de origen por orden de fotos, planos y vídeos;
- `begun_at`.

**`idealista_api_operation_results`.** Como mucho una fila por operación (`op_id` único). Guarda **solo la confirmación principal de Idealista**:
- `result_seq`;
- `outcome`: `confirmed` (2xx), `rejected` (4xx, o un rechazo local antes de enviar, como el freno de cuota) o `unknown` (estado 0, tiempo agotado o 5xx);
- `http_status`, `response_state`, `api_property_id_returned` y `recorded_at`.

**`idealista_api_operation_steps`.** Varias filas por operación, con los pasos posteriores:
- de Idealista: `idealista_images`, `idealista_videos` e `idealista_tour`;
- locales: `listing_write`, `api_log`, `crm_sync` y `media_copy`.

Cada fila guarda `ok` y `detail`. Un fallo de fotos o local **no cambia** la confirmación principal.

**Solapes, sin actualizar filas.** El intervalo de una operación va de su `seq` a su `result_seq`, o queda abierto si no hay resultado. Dos operaciones de la misma ficha y entorno se solapan si sus intervalos se cruzan. Se calcula al leer.

**Sin resultado.** Una operación sin resultado y con más de 10 minutos se lee como `unknown`; el tope de la ruta es de 120 s.

**Las lecturas no crean incertidumbre.** Un `observe` que falla (red, 5xx) no cambia nada en Idealista: ni cuenta como operación abierta ni como solape.

**Registro previo obligatorio (D18).** Si falla `idealista_op_begin`, no se llama a Idealista y se devuelve un error local.

### 2. Estado objetivo y eventos obsoletos

`idealista_crm_target(listing_id, environment)` lee el registro y calcula qué debe reflejar el CRM.

**Qué prueba cada operación con resultado `confirmed`:**
- **Publicado:**
  - un `create` con id devuelto y estado `active` o `pending`;
  - un `update` o `reactivate` con estado `active` o `pending`;
  - un `observe` u `observe_reconcile` que ve `active` o `pending`.
- **Retirado:** un `deactivate`, o un `observe` que ve `inactive` cuando la última operación que cuenta (ignorando `rejected` y las observaciones) es un `deactivate`.
- **No cambia nada:** un `update` con estado `inactive`.
- **Cambio que no hicimos nosotros:** un `observe` con `inactive`, `dropped_by_quality` o `deleted` en cualquier otro caso. El estado pasa a `review`. No se archiva nada.

**Incierto (`uncertain`).** El objetivo pasa a incierto si se cumple cualquiera de estas condiciones:
- una operación posterior a la decisiva no tiene resultado o es `unknown`;
- la operación decisiva se solapa con otra;
- `idealista_listings.api_last_sync_at` es posterior al `recorded_at` de la decisiva, con 5 s de margen. Es la señal de que alguien llamó fuera del registro: el build anterior o «Reconciliar» sin registrar.

**Alta incierta (`uncertain_create`).** Hay un `create` sin resultado, `unknown`, o `confirmed` sin `api_property_id_returned`, y no se conoce el id del anuncio.

**Obsolescencia.** `idealista_crm_sync.applied_seq` guarda la última operación aplicada.
- Una pasada solo aplica si el `seq` de la decisiva es mayor. Si no, termina con `stale` y no cambia nada.
- Los reintentos vuelven a calcular el objetivo. **Nunca se repite ni se vuelve a aplicar un éxito antiguo.**

### 3. Cómo se resuelve la incertidumbre (corrección 5)

| Situación | Cómo se resuelve | Lo que nunca se hace |
|---|---|---|
| `update`, `deactivate` o `reactivate` sin resultado o `unknown` (el id se conoce) | El personal pulsa «Comprobar en Idealista», que es `refresh-state` (`GET /v1/properties/{id}`, solo lectura, D20). Queda registrado como `observe` y se aplica la regla de la sección 2. | Repetir la operación de forma automática. |
| Solape, o `api_last_sync_at` posterior | El mismo `observe`. | Fiarse de la última operación. |
| `create` confirmado con id que no se pudo guardar en la ficha | «Recuperar id» copia `api_property_id_returned` a la ficha. Es local y no llama a Idealista. | Volver a dar el alta. |
| `create` confirmado **sin id** devuelto, o `create` sin resultado o `unknown` | «Reconciliar», que ya existe y solo lee. Si encuentra **exactamente un** anuncio remoto cuyo `code` es el `reference_code` de la ficha, que no tenga ya otra ficha local y cuya referencia no esté repetida en otra ficha local, se registra un `observe_reconcile` con ese id y su estado. Si no lo encuentra, o hay ambigüedad, la ficha se queda bloqueada. | Repetir el alta, emparejar por similitud o suponer a partir de un éxito antiguo. |

**Bloqueos del alta.**
- Mientras haya un `create` en `uncertain_create`, o confirmado sin el id guardado en la ficha, «Publicar por API» **no deja dar el alta**. Así no hay duplicado en Idealista.
- Si «Reconciliar» no lo resuelve, hace falta Fabricio. Él lo resuelve con Idealista fuera de la aplicación y la sincronización no hace nada. **Es un obstáculo que se informa, no se rodea.**

**«Reconciliar» desde la aplicación nueva.** Registra un `observe_reconcile` por cada emparejamiento sin ambigüedad. Los demás emparejamientos que hace hoy (actualizar `api_state` y `api_last_sync_at`) siguen igual.

### 4. Separar el resultado de Idealista de los fallos locales (corrección 6)

`PublishOutcome.ok` significa solo «Idealista confirmó la operación principal». Cada paso posterior va en `steps_result: [{ step, ok, message }]`, que también queda en `idealista_api_operation_steps`. Vale para publicar, dar de baja y reactivar.

- **Si falla la escritura de la ficha tras un alta:** se devuelve `ok:true` con el aviso «No vuelvas a publicar; usa Recuperar id» y se aplica el bloqueo de la sección 3.
- **Si no se pueden guardar ni el resultado ni el log:** la operación se queda sin resultado y se lee como `unknown`. El objetivo pasa a incierto y no se aplica nada hasta el `observe` o «Reconciliar».

### 5. Asociación y clasificación

`idealista_crm_sync` tiene una fila por `(listing_id, environment)`, única. Columnas:
- `property_id`, `property_origin` (`generated` o `existing`);
- `origin_decided_by` y `origin_decided_at`;
- `tag_id`, `tag_already_present`;
- `smartlink_path`;
- `applied_seq`;
- `status`: `pending`, `synced`, `failed`, `needs_review`, `uncertain`, `uncertain_create`, `stale`, `disabled` o `sandbox`;
- `review_reason`, `last_error_code`, `last_error`, `attempts` y las marcas de tiempo.

Un trigger hace inmutables el origen y la propiedad una vez puestos. La única excepción es `property_id → NULL` por la FK.

**Qué propiedad se usa, por orden:**
1. **La asociación registrada.** Su origen manda.
   - Si la propiedad asociada ya no existe, queda en «revisar».
   - Si la ficha tiene ahora otro `property_id` explícito, también queda en «revisar».
2. **`idealista_listings.property_id` no nulo:** es *existente*, se usa y se registra.
3. **Una ficha inspo cuya `external_link` normalizada coincide con el `source_url` de una o más propiedades:** queda en «revisar» sin tocar nada.

   El personal decide «Usar esta propiedad» o «Crear ficha de referencia», y queda registrado quién y cuándo.
4. **En cualquier otro caso:** se genera una ficha de referencia.

### 6. Ficha de referencia y frontera de distribución

**Columna nueva `properties.reference_only boolean NOT NULL DEFAULT false`.** Lo que hace cumplir la base de datos, y que aguanta una vuelta atrás del código:
- un CHECK obliga a que `reference_only` vaya con `published_web = false` y `new_listing_alerts_suppressed = true`;
- un trigger hace inmutables `reference_only`, `slug` y `bc_reference` en las fichas de referencia;
- las políticas de lectura de `properties` y `property_photos` para quien no es personal excluyen `reference_only`;
- hay triggers que rechazan asociar una ficha de referencia a:
  - `catalog_items` y los ajustes `include` de catálogo;
  - `client_property_selections`;
  - `client_shortlist_items`;
  - `client_portal_links.property_id`;
  - `property_collab_links`;
  - `favorites`;
  - `idealista_listings.property_id`;
- las funciones SQL de catálogo excluyen `reference_only`. Se parte de su última definición y solo se añade el predicado.

**Filtros en la aplicación**, como defensa en profundidad:
- la web pública **no** lleva filtro propio: el CHECK obliga a `published_web = false` y `applyPublicWebFilter` exige `true` (su prueba de contrato fija exactamente tres condiciones; no se tocó);
- `getSuggestedProperties`;
- la búsqueda y el alta de `/s`;
- `getPropertyForOffer` (D22);
- el selector del panel de Idealista;
- los selectores del personal.

**Lo que sí se permite (D22):** `/compartir/{shareSlug}` y `/c/[token]` (`property_shares`).

**Campos.**
- **La ficha de referencia solo guarda** contenido del anuncio. No lleva `owner_*`, ni contacto, ni el contacto de Idealista.
- **`internal_notes`** guarda solo la procedencia.
- **El adaptador público** no proyecta ni las notas ni los campos de propietario.
- **Agencia técnica `bc-idealista-referencias`** (D21), creada por la migración. No es `portales-externos`, así que no se reescribe la descripción con IA. La plantilla pública del SmartLink es la de BC, y la prueba de rutas comprueba que el nombre de la agencia técnica **no aparece** en la página.
- **`source = 'api'`** y `external_id = 'idealista-api-<listing_id>-<environment>'`.

**SmartLink.** `smartlink_path` no cambia nunca, porque el slug y `bc_reference` son inmutables. Al archivarse la ficha, las cuatro rutas dejan de servirla. Al reactivarse, vuelve la misma URL.

### 7. Contenido y multimedia (corrección 3)

**De dónde sale.** Del `content_snapshot` y el `media_manifest` de **la operación decisiva**. Si el paso `idealista_images` de esa operación falló, las fotos y los planos reflejados se conservan como estaban.

**Copia con archivos inmutables.**
- **Rutas por contenido:** `properties-photos/{propertyId}/idealista-ref/{photo|plan}/{sha256 del contenido}.{ext}`. Se suben con `upsert: false`, así que **ningún proceso puede sobrescribir un archivo**. Si ya existe, es el mismo contenido.
- **Registro de objetos y orígenes:**
  - `idealista_crm_media_objects` (`storage_path` PK, `property_id`, `sha256`, `bytes`, `mime`, `staged_by_seq`, `staged_at`, `deleted_at`);
  - `idealista_crm_media_sources` (`property_id`, `sha256` de la URL de origen → `storage_path`, `fetched_at`). Si una URL de origen ya se descargó para esa propiedad, no se vuelve a descargar.
- **Lectura del origen.**
  - Si la URL es del bucket propio, se lee con `storage.download`, sin pasar por la red.
  - Si es externa, con `safeFetch`: solo https, IP comprobada en la conexión, como mucho 3 redirecciones, **25 MB** y **20 s** por archivo.
  - Solo se aceptan `image/jpeg`, `image/png`, `image/webp` y `image/gif`, como mucho 200 elementos y **4 descargas a la vez**.
- **Tiempo por pasada.** Dentro de la petición de publicación, la pasada tiene **45 s** de presupuesto para la multimedia. Si no le basta, termina como `failed/media_timeout`, que es un fallo local que se informa. El reintento por la ruta de sincronización (300 s) sigue donde iba, porque los orígenes ya descargados no se repiten.
- **Aplicación atómica.** Una función SQL, en una transacción y comprobando `applied_seq`, hace todo esto a la vez:
  - reemplaza las filas gestionadas (`property_photos` con `position` = índice, `is_cover` para el índice 0 y `sync_path`; `property_media` de planos con `position`);
  - pone `cover_photo_url`;
  - aplica el contenido, la etiqueta y el archivado.

  Las filas que añade el personal (sin `sync_path`) se quedan, ordenadas detrás.
- **Vídeos (D23).** Van como `property_media` de tipo `video` que apuntan a la URL original, con `source = 'idealista_ref'` y un `storage_path` marcador `idealista-ref:{propertyId}:{sha256 de la URL}`. Borrar la fila no borra ningún archivo. **Si se borra el original, el vídeo desaparece del SmartLink.**
- **Limpieza.** Se borra un objeto solo si cumple las tres condiciones:
  - ninguna fila de `property_photos` o `property_media` lo usa;
  - lleva al menos 24 h subido;
  - no lo subió una operación con un `seq` mayor que el último aplicado.

  Así, un proceso atrasado no puede borrar lo que usa uno más nuevo, ni lo que acaba de subir. La limpieza se hace después de una aplicación correcta y solo bajo `{propertyId}/idealista-ref/`.
- **Si una pasada falla,** los objetos que llegó a subir quedan registrados y sin usar. El reintento los reutiliza, y si nadie los usa, la limpieza los borra pasado el plazo.

**Propiedades existentes.** Nunca se tocan su contenido ni su multimedia.

### 8. Etiqueta (D2, D14, D16)

- **Cuándo se aplica:** en cada publicación aplicada (alta, actualización o reactivación), con `ON CONFLICT DO NOTHING`, tanto en fichas generadas como existentes.
- **Qué etiqueta:** solo `country` igual al de la propiedad y `lower(btrim(name)) = 'reservado'`.
- **Si no existe:** `failed/tag_missing`, y no cambia nada: ni la ficha, ni los archivos referenciados, ni la etiqueta.

### 9. Protecciones de borrado (D11)

Hay triggers `BEFORE DELETE` en `properties` e `idealista_listings`. Rechazan el borrado si existe una ficha de Idealista asociada, por `property_id` o por `idealista_crm_sync`, que cumple las dos condiciones:
- tiene `api_property_id` **o** un `create` en `uncertain_create`;
- no está retirada con confirmación.

`deleteProperty` lo comprueba **antes** de cualquier efecto secundario (desvincular captaciones, fotos) con `idealista_property_ad_live` y traduce el rechazo en un mensaje que propone archivar. `delete-listing`, si la ficha controla un anuncio vivo o desconocido, la archiva en el panel en vez de borrarla.

### 10. Interruptor (D24)

`app_settings.idealista_crm_sync`. La migración lo crea apagado: `{"enabled": false}`.

- **Apagado:** se siguen registrando las operaciones y no se aplica nada (`status = 'disabled'`).
- **Cuando se enciende:** las asociaciones pendientes se aplican con el siguiente evento o con el reintento manual. No hay pasadas en bloque (D10).

**El interruptor no impide que las migraciones cambien la base.** Por eso la validación de producción va **antes** de fusionar (ver «Validación en producción»).

## Alcance

- **Migraciones 0232 y 0233.**
  - La 0232 crea la frontera, las protecciones, las columnas de multimedia, la agencia técnica y el motivo de archivado.
  - La 0233 crea el registro de operaciones, la sincronización, los objetos de multimedia y el interruptor.
- **`publish.ts`:**
  - el registro previo y los resultados;
  - los pasos;
  - la separación entre el resultado de Idealista y los fallos locales;
  - los bloqueos del alta;
  - lanzar la sincronización.

  Los payloads, la autenticación y la secuencia de llamadas no cambian.
- **`reconcile.ts`:** registra `observe_reconcile` en los emparejamientos sin ambigüedad.
- **El módulo `lib/services/idealista/crm-sync/`.**
- **La ruta `POST /api/admin/idealista/crm-sync`**, para reintentar, revisar y recuperar el id. Nunca llama a Idealista.
- **El panel:**
  - el estado del CRM;
  - «Copiar SmartLink»;
  - revisar, reintentar, comprobar y recuperar el id;
  - los pasos separados del resultado de Idealista;
  - el aviso en la papelera.
- **Los filtros de la aplicación de la sección 6,** el orden de los planos y los mensajes de las protecciones.
- **Las pruebas:**
  - SQL en el Postgres temporal;
  - el código real con el adaptador psql;
  - la suite TS en la CI;
  - el build de producción aislado y las rutas reales con el PostgREST simulado;
  - las capturas de fixtures.
- **Dos comprobaciones que ejecuta Fabricio:** la de antes de fusionar y la de antes de encender.

## Fuera de alcance

- Los payloads, el mapper, los schemas, `client.ts`, `endpoints.ts`, OAuth, las cuotas, el robot y la extensión.
- Rellenar los anuncios antiguos (D10).
- Las bajas que no hicimos nosotros, que solo dejan la ficha en «revisar».
- Crear o modificar etiquetas, o la disponibilidad de propiedades existentes.
- Los vídeos automáticos y la visita virtual.
- Las observaciones de control de acceso que no dependen de esta tarea (anexo privado). No se tratan ni se vuelven a investigar.

## Invariantes

- **I1.** La sincronización nunca llama a Idealista para escribir. Las únicas lecturas son `refresh-state` y «Reconciliar», y siempre las lanza el personal.
- **I2.** El payload, las cabeceras y la secuencia de llamadas no cambian. Hay un diff vacío en `mapper`, `client`, `endpoints`, `config`, `validate` y `schemas`.
- **I3.** Hay como mucho una asociación por ficha y entorno, y como mucho una propiedad por asociación. Nunca hay dos altas para la misma ficha mientras la primera sea incierta.
- **I4.** Sobre una propiedad existente, la sincronización solo añade la etiqueta.
- **I5.** El origen de una asociación es inmutable.
- **I6.** Solo se aplica un objetivo cierto con un `seq` mayor que el aplicado.
- **I7.** Una ficha de referencia nunca entra en la web, el portal, las sugerencias, las alertas, los catálogos, las colecciones de clientes, los favoritos ni el correo de oferta. Lo impide la base de datos, y no solo la aplicación.
- **I8.** El SmartLink solo expone los campos públicos. Su URL no cambia, y no se sirve mientras la ficha esté archivada.
- **I9.** Ningún proceso sobrescribe ni borra un archivo que esté en uso o que se haya subido hace poco.
- **I10.** El registro de operaciones es de solo añadir.
- **I11.** Archivar conserva la fila, la multimedia, la etiqueta y el historial.
- **I12.** Las tablas y funciones nuevas solo son accesibles para el `service_role`.

## Datos e impacto

| Pieza | Cambio |
|---|---|
| `properties` | `reference_only`, el CHECK, el trigger de inmutabilidad, el motivo `idealista_api_withdrawn`, las políticas de lectura y el trigger de borrado. |
| `property_photos` | `sync_path` y la política de lectura. |
| `property_media` | `position`, `sync_path` y el valor `idealista_ref` en `source`. |
| `idealista_listings` | El trigger de borrado y el trigger contra `property_id` apuntando a una ficha de referencia. |
| Asociaciones de clientes y catálogos | Los triggers de rechazo y las funciones de catálogo redefinidas, con un predicado más. |
| Tablas nuevas | Las tres del registro de operaciones, `idealista_crm_sync`, `idealista_crm_media_objects` e `idealista_crm_media_sources`. |
| `agencies` | La fila `bc-idealista-referencias`. |
| `app_settings` | `idealista_crm_sync = {"enabled": false}`. |
| Almacenamiento | Los objetos bajo `{propertyId}/idealista-ref/`. |

⚠️ **Fusionar puede aplicar la 0232 y la 0233 en producción, y desplegar commits de otras personas.**
- **Las migraciones cambian el comportamiento de la base aunque el interruptor esté apagado:**
  - los triggers de borrado ya protegen los anuncios activos;
  - las políticas nuevas ya se aplican;
  - las funciones de catálogo quedan redefinidas.

  Por eso hace falta la validación previa.

## Validación en producción

La ejecuta el operador autorizado, que es Fabricio (corrección 1). Hay dos puertas separadas.

1. **Antes de fusionar:** `scripts/sql/idealista-crm-sync-premerge.sql`, solo `SELECT`. Compara con lo que la 0232 y la 0233 esperan encontrar y sustituir:
   - que existan y tengan la forma esperada `properties` y sus columnas, `property_photos`, `property_media` con sus CHECK, `idealista_listings`, `agencies` y `app_settings`;
   - el texto de las políticas que se cambian (`pg_policies`);
   - el `md5(pg_get_functiondef)` de cada función de catálogo que se redefine, frente al de la definición de las migraciones del repositorio;
   - los nombres de los CHECK que se amplían;
   - que no existan ya los objetos nuevos;
   - el número de migración siguiente libre.

   **Si algo no coincide, no se fusiona** y se ajusta el expediente.

   Desde el cierre del 2026-10-29, las dos comprobaciones validan **definiciones y atributos**, no solo nombres: comando, permisiva, roles, `USING` y `WITH CHECK` de cada política; RLS; `is_staff()`; CHECK con su validación; roles; y, antes de encender, triggers activados, `SECURITY DEFINER` y privilegios. Lo que falta o sale NULL **falla**. El resultado es inequívoco: «APTO» con código 0, o un error «NO FUSIONAR» / «NO ENCENDER» con código distinto de 0.
2. **Antes de encender:** `scripts/sql/idealista-crm-sync-activation.sql`, solo `SELECT`, después del despliegue:
   - que la 0232 y la 0233 estén aplicadas;
   - que haya **una** «RESERVADO» en `es`;
   - el entorno configurado (sandbox o producción);
   - la agencia técnica;
   - el interruptor apagado;
   - que el build en marcha sea el de esta tarea. Se comprueba **antes**, con los pasos de `result.md`: `origin/main` no lo demuestra.

## Recuperación de migraciones

**Formato.** Las dos van entre `BEGIN;` y `COMMIT;`, como la 0214, son idempotentes y pasan `lint-migrations.py`.

**Despliegue con el interruptor apagado.** Mientras no se encienda, **no existe ninguna ficha de referencia**. Si el health check del despliegue falla y vuelve el build anterior, este se encuentra el esquema nuevo **sin fichas de referencia**, así que no puede distribuirlas. Lo que sí sigue activo con ese build:
- las protecciones de borrado, que rechazan algunos borrados que antes pasaban;
- el catálogo con su predicado, que no cambia nada mientras no haya fichas de referencia.

Una vez encendido, las vueltas atrás automáticas de despliegues posteriores vuelven a un build que ya incluye esta tarea. Esto supone que el script del VPS se comporta como dice `scripts/vps-autodeploy.sh` **(sin comprobar en el VPS)**.

**Vuelta atrás manual del código de esta tarea con fichas de referencia ya creadas.** Es el único caso en el que el código anterior convive con ellas. Ese código no filtra `reference_only` en tres sitios:
- la búsqueda de `/s`;
- el correo de oferta;
- el selector del panel. Aquí el alta queda bloqueada por el trigger.

Ninguna política ni restricción puede ocultar una fila a esas consultas con service role. **Antes de revertir el código hay que ejecutar la contención** `scripts/sql/idealista-crm-sync-containment.sql`, que tiene un ensayo:
- archiva las fichas de referencia con `archived_reason = 'idealista_crm_containment'` (un valor más del CHECK);
- las saca de esas consultas;
- deja sus SmartLinks sin servicio mientras dure.

**No hay «deshacer» en bloque** (cierre del 2026-10-29). Una ficha contenida se libera **ficha a ficha**:
- solo con el **código compatible ya en marcha** (la liberación va por la ruta `/api/admin/idealista/crm-sync`, que el build anterior no tiene) y con la sincronización **encendida** (que se enciende tras comprobar el build en marcha);
- `idealista_crm_release_containment` decide con el último estado del anuncio. Si está publicado, el estado es cierto y ya está aplicado en el CRM, se desarchiva. Si está publicado pero falta aplicarlo, se aplica antes.
- Si la baja está confirmada, sigue archivada como baja. Si está incierta, con alta incierta o esperando revisión, sigue archivada hasta resolverlo.
- Mientras tanto, `apply_idealista_crm_sync` nunca desarchiva una ficha contenida: la deja en «revisar/contained».

**No hay ningún riesgo de distribución aceptado:** si la contención no se ha ejecutado, no se revierte el código.

**Tabla de comportamiento del código anterior con datos.** Se prueba en T5, con datos y con la contención aplicada y sin aplicar:

| Lo que hace el build anterior | Con la contención aplicada |
|---|---|
| Alta de una ficha de Idealista para una ficha de referencia | La rechaza el trigger. |
| `process-scheduled` | Nada apunta a una ficha de referencia. |
| `deleteProperty` y `delete-listing` con el anuncio vivo | Los rechaza el trigger. |
| Web pública, portal y alertas | El CHECK y las políticas lo impiden. |
| Catálogos | Las funciones de la base lo impiden. |
| Búsqueda de `/s` y correo de oferta | La ficha está archivada, así que no sale. |
| Publicar o dar de baja por API sin registrar | `api_last_sync_at` lo delata, y el código nuevo lo ve como incierto. |

**Vuelta atrás del esquema.** `rollback-0233.sql` y `rollback-0232.sql` **se niegan a ejecutarse** si hay fichas `reference_only`, operaciones o asociaciones. Con datos, la recuperación es hacia delante: interruptor apagado, contención y, si hace falta, una migración correctiva. Sin datos, el esquema vuelve exactamente al de antes.

**Irreversible.** Ninguna de las dos migraciones lo es.

## Criterios de aceptación

| # | Criterio | Cómo se comprueba |
|---|---|---|
| AC1 | Una inspo nueva confirmada en producción genera **una** ficha `reference_only` de la agencia técnica, `source='api'`, sin `source_url` ni datos de propietario, con la etiqueta y el SmartLink. | SQL, más el código real con el adaptador psql |
| AC2 | Publicar dos veces, actualizar, reactivar, reintentar, dos sesiones a la vez y confirmaciones fuera de orden dejan una sola ficha, una sola etiqueta y el objetivo correcto. | SQL |
| AC3 | Una publicación repetida no impide que la baja archive la ficha generada. | SQL |
| AC4 | Un `property_id` explícito se trata como existente. Solo se añade la etiqueta. Tras la baja, no se archiva y conserva la etiqueta. | SQL |
| AC5 | Una coincidencia por URL queda en «revisar» sin tocar nada. La resolución queda registrada con su usuario. | SQL y TS |
| AC6 | Sin «RESERVADO» en el país, el resultado es `tag_missing` y no cambia nada. Nunca se crea una etiqueta. | SQL |
| AC7 | Los casos de incertidumbre de la sección 3 quedan bloqueados hasta resolverse por la vía indicada. Nunca se repite un alta ni se aplica un éxito antiguo. | SQL y TS |
| AC8 | Un evento obsoleto no cambia nada. | SQL |
| AC9 | El registro es de solo añadir: `UPDATE` y `DELETE` fallan, los solapes se calculan y los pasos no cambian el resultado principal. | SQL |
| AC10 | La multimedia se refleja en orden, con portada y planos. Al actualizar se añade, se quita y se reordena. Las filas del personal se quedan. No se sobrescribe ni se borra un objeto en uso o reciente. Un proceso atrasado no rompe uno más nuevo. Se respetan los límites de tamaño, tiempo, tipo y concurrencia. | Código real con el adaptador psql y almacenamiento en memoria, más SQL |
| AC11 | Una ficha de referencia queda fuera de todas las superficies de I7, con roles sintéticos en la base y con los filtros en la aplicación. | SQL y TS |
| AC12 | **Rutas reales.** Con el build de producción aislado y el PostgREST simulado, `/compartir/{shareSlug}` responde 200 **sin cookies**, con fotos y contenido, y sin los textos centinela de notas, propietario y agencia técnica. `/c/[token]`, `/og` y `/p` funcionan. Con la ficha archivada, las cuatro dan 404. Tras reactivar, vuelve la misma URL. | E2E sobre `next start` |
| AC13 | Un fallo local tras una confirmación da `ok:true`, con el paso registrado. Sin registro previo no hay petición. El reintento hace cero llamadas a Idealista. | TS con un cliente falso |
| AC14 | No se puede borrar con el anuncio activo, `pending`, nulo o con un alta incierta. Tras una baja confirmada, sí. | SQL |
| AC15 | El código anterior, con datos, se comporta como dice la tabla de recuperación. Las reversiones se niegan si hay datos. La contención se puede deshacer. | SQL |
| AC16 | Los payloads no cambian (I2). | Diff, más `test:idealista` |
| AC17 | El sandbox no toca el CRM. Con el interruptor apagado, no se aplica nada. | SQL y TS |
| AC18 | Pasan `tsc`, el lint, el build aislado y la CI. Las capturas se revisan. | Local y CI |

## Lo que no se puede demostrar sin producción

- Que el esquema real coincida con las migraciones. Lo comprueba Fabricio con la validación previa.
- El comportamiento real de Idealista: el `state` de cada respuesta, si reordena las fotos y la tasa de 5xx.
- El tiempo real de copia de la multimedia.
- El script real del VPS.
- La resolución DNS y el TLS reales de `safeFetch`.
- **El simulador de PostgREST no hace cumplir las políticas, los triggers ni los CHECK.** Esas garantías se prueban aparte, en el Postgres temporal.
- **`clone` escribe `api_last_sync_at`** y no se registra: tras un clonado el estado se verá incierto hasta pulsar «Comprobar en Idealista». Es conservador; `clone` no tiene botón en el panel.

## Aprobación

- **2026-10-28 (aprobación de la ejecución).** Fabricio aprueba ejecutar T1–T12 con las decisiones D17–D24 y siete correcciones obligatorias, que esta revisión 4 incorpora:
  1. validar la producción antes de fusionar;
  2. una copia exportada aislada para el build y las pruebas;
  3. multimedia inmutable con límites;
  4. el ciclo de vida del registro de solo añadir;
  5. la resolución de la incertidumbre;
  6. probar la recuperación con datos, sin dar por aceptado el riesgo de `/s`;
  7. separar la QA visual de la prueba de rutas reales.

  **Queda autorizado:** el worktree indicado, `npm ci` sin paquetes nuevos, descargar Chromium si hace falta, el Postgres temporal sintético, el build aislado, las pruebas offline, las mediciones, los commits, el push, el PR y la CI.

  **No queda autorizado:** el acceso a producción, las credenciales, las llamadas reales a Idealista por parte de agentes, una revisión adicional de Codex, ni repetir la investigación de seguridad que se paró. La ejecución se para antes del merge y en cualquier obstáculo sin resolver. La validación en producción, el merge y el encendido los hace Fabricio.
