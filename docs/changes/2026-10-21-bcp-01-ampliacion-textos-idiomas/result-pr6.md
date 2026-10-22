# BCP-01 · Ampliación — resultado del PR6 · Traducciones preparadas y revisadas

**Especificación:** [`spec.md`](spec.md) (§3 «Cómo se cumple», DA9–DA21, DA31–DA36, N5 decidida el 22-10-2026) · **Plan:** [`plan.md`](plan.md) § PR6, con sus «Ajustes al implementar el PR6». Formato y reglas, como en [`result.md`](result.md).

> **La QA en producción y el merge son de Fabricio.** Todo lo de abajo se ha probado con datos sintéticos, Postgres temporal y fixtures. **Ninguna llamada real a una IA**: en las pruebas y los fixtures la IA es una función FALSA que cuenta llamadas. Sin producción, credenciales ni archivos `.env` del repositorio (el `next build` se hizo con `.env.production` apartado fuera del worktree).

## PR6 · Traducciones

- **Rama:** `fabri/bcp-01-traducciones`, desde `origin/main` = `d8910688` (PR1–PR4 y PR7a fusionados) y rebasada sobre `origin/main` = `4fa73a3b` antes de subir.
- **Migración:** `0226_catalog_translations.sql`, con [`rollback-0226.sql`](rollback-0226.sql). **No es la 0224** que estaba reservada: mientras se hacía este PR entró en `main` la `0224_crm_host_to_portal.sql` (#350), y la 0225 es del PR5. Sin dependencias ni paquetes nuevos.
- Un solo PR, en cinco commits que se revisan por separado: migración y pruebas SQL; lectura por idioma y orquestación; gestor; fixtures; documentación. No se ha partido en 6a/6b.

### Qué hace

**1 · Datos (0226).** Todo es del dueño y solo `service_role` (RLS sin políticas).
- **Fuentes con identidad de versión (DA31)** (`catalog_tr_sources`):
  - una **versión aprobada de la biblioteca** (0219), cuando el texto publicado del catálogo es *exactamente* esa versión (la copia que trajo, o el catálogo donde se aprobó). Su traducción sirve en todos los catálogos del dueño con esa misma versión, **sin IA**;
  - si no, **lo que publica ese catálogo** (su texto propio, o la historia o la descripción limpia que enseña). Traducirlo **no** lo lleva a la biblioteca (probado: `property_copy_versions` no cambia);
  - una **versión de plantilla «Vivir en…»** (0222), que se traduce y aprueba una vez y vale para todas las viviendas con esa plantilla (DA27);
  - el **título y la introducción del catálogo**.
- **Unidad de traducción = la descripción ya organizada (DA18).** Se guarda el español que se tradujo: título y bloques del organizador con su **clave** (`intro`, `living`, `kitchen`, `finishes`, `building`, `barrio`). Los títulos de sección salen del diccionario de cada idioma; «Vivir en {zona}» conserva el nombre propio («Living in Recoletos», «العيش في Recoletos»). El clasificador español nunca se pasa sobre texto traducido.
- **Traducciones** (`catalog_tr_texts`): borrador preparado, aprobada o rechazada, con revisión (`rev`) para que nada pise una edición.
- **Características** por cadena exacta e idioma (`catalog_tr_features`), del dueño.
- **Copias del catálogo** por vivienda e idioma (`catalog_tr_copies`) y la de su título (`catalog_tr_meta_copies`), con la **huella del español que enseña ese catálogo**. Aprobar después otra traducción no cambia las copias de otros catálogos (como DA5).
- **Trabajos de preparación** (`catalog_tr_jobs`) con estado: reservado (con caducidad e identificador), terminado, cancelado, caducado, incierto o fallido; lo que llega tarde se marca como descartado.

**2 · Preparar (solo al pulsar).**
- Solo el idioma pedido y solo lo que falta (texto, plantilla, características). Una vivienda = una llamada.
- **Reserva única por fuente e idioma (DA15):** quien llega después ve «Ya hay una preparación en curso… No se ha lanzado otra». Al terminar solo se guarda el trabajo cuya reserva siga vigente y sea suya. Un resultado que llega tras **cancelar** o con la reserva **caducada** se descarta y queda registrado.
- **Incierto (DA36):** tiempo agotado (120 s) o conexión cortada después de enviar. No se reintenta solo; el gestor dice que **pudo cobrarse** y ofrece «Volver a preparar (la anterior pudo cobrarse)». Un error del proveedor queda como «fallido» y se puede repetir; si la IA no está configurada, no se llama.
- El gestor lo dice así: *«Una reserva evita que dos personas lancen a la vez lo mismo, pero no garantiza una sola llamada de pago»*.
- **Instrucción:** conserva nombres propios en alfabeto latino, cifras con los mismos dígitos, ni precios ni contactos, los mismos bloques con la misma clave.
- **Comprobación determinista posterior** (como `checkDraft`): contacto, URL o precio **bloquean** (también en SQL); cifras que faltan o sobran y nombres propios que no aparecen son **avisos** que se confirman uno a uno. Si la respuesta no respeta los bloques, se descarta (esa llamada sí se hizo).
- Nunca escribe en `property_client_descriptions` ni en `properties`.

**3 · Revisión en el gestor: pestaña nueva «Idiomas».**
- Original y traducción **por bloque**, con el título de sección en los dos idiomas; título; plantilla; características. Editar y guardar, **aprobar** (tal como se vio) o **rechazar**.
- Progreso de los siete idiomas; aviso **«sin revisión nativa»** en ar, tr y he.
- «Preparar lo que falta» (una a una, con «Parar después de esta») y «Usar las ya aprobadas, sin IA».
- **Selector de idioma del catálogo y de cada enlace personal.** Un idioma solo se activa **completo** (todas las viviendas de la lista con su traducción aprobada y vigente, sus características y el título del catálogo). Si no, se niega, lo explica y el enlace sigue en el idioma anterior.
- En «Contenido», si un idioma activo tiene viviendas sin traducción vigente, un aviso con «Ir a Idiomas» y la advertencia de que publicar cambios en español deja esa vivienda en «Descripción en preparación» en ese idioma.
- No se ha añadido nada a la página «Textos aprobados»: las traducciones se revisan en el catálogo, que es donde se sabe qué español se enseña (se indica si la fuente es de la biblioteca).

**4 · Vigencia (DA14, DA34) y N5.**
- Una copia solo vale si su huella es **la del español que el catálogo enseña hoy**. Republicar el español, cambiar la zona confirmada o la plantilla, o que la ficha incumpla C2, la deja **desactualizada**: nunca se presenta como vigente.
- **N5, tal como la decidió Fabricio:** la vivienda se ve con sus datos, fotos y etiquetas en el idioma y, en lugar de la descripción, un aviso del diccionario («Description in preparation», «الوصف قيد الإعداد»…). Ni el español ni la traducción vieja; la vivienda no se oculta. Título provisional en el idioma con la zona («Home in Recoletos»).
- Datos operativos (viviendas, fotos, precio, operación, disponibilidad, ficha) siempre de la instantánea actual, en todos los idiomas.

**5 · Lectura pública por idioma (DA12, DA19).**
- La instantánea por token (`catalog_lang_snapshot`, ya con `lang` desde 0223) lleva, **solo fuera del español**, la copia aprobada de ese idioma de cada vivienda (`tr`) y la del catálogo (`trm`). **En español es exactamente la de 0223**: ninguna huella cambia al desplegar.
- La huella cambia con el idioma y con cada copia. El vigilante, la lectura coherente y el PDF por token (que leen la misma instantánea) no pueden servir el idioma o el contenido de otro enlace.
- Visitas, valoraciones y PDF públicos **no preparan ni llaman a la IA**: la lectura no importa nada de la preparación (comprobado en el código y con el contador de la IA falsa).
- Valoraciones sin cambios (DA17).
- **PDF:** `toPublicCatalog(instantánea, operación, idioma)` ya devuelve el contenido traducido. El generador del PDF sigue pidiendo «es» hasta que el PR5 le pase el idioma; no se ha tocado `lib/pdf/**` ni `lib/catalogs/export/**`.

### Verificación

| Comprobación | Resultado |
| --- | --- |
| SQL en Postgres 16 temporal, secciones **2ze** y **2zf** de `scripts/sql/test-catalogs-core.sh` (variable `M18`).<br>**2ze:** 0226 aplicada dos veces sobre un catálogo con enlace general y dos asignaciones personales ya creados (104 comprobaciones de `test-catalog-translations.sql`):<br>• desplegar no cambia ninguna huella; en español no hay `tr` ni `trm`<br>• fuentes: propia, del catálogo, de plantilla, de la biblioteca (la misma en dos catálogos); un texto personalizado vuelve a ser propio<br>• reserva: la segunda petición ve «en preparación»; índice único; otro idioma, su reserva<br>• terminar: solo con reserva vigente; claves distintas rechazadas; segundo resultado descartado<br>• caducada no pisa a la nueva; cancelada y tardía, descartadas y registradas<br>• incierto sin reintento salvo `retry`; fallo del proveedor registrado<br>• revisión con revisión vista, bloqueos de contacto y precio, características a mano, rechazar<br>• aprobar: copia con la plantilla como bloque «barrio» al final, solo características aprobadas, todo o nada<br>• lectura por idioma, DA17 y huella del vigilante<br>• DA34: precio, foto excluida y vivienda retirada al momento en inglés; C2 en los dos idiomas<br>• activar solo completo (`lang_incomplete`, `catalog_changed`); volver al español sin comprobación<br>• biblioteca sin IA en otro catálogo; traducir no crea versiones<br>• ficha del CRM y `property_client_descriptions` intactas; permisos de anon y authenticated; RLS<br>**Concurrencia real:** dos sesiones de psql reservan a la vez (una con la transacción abierta 2 s): una reserva y la otra ve «en preparación»; un solo trabajo.<br>**Reversión** (3 comprobaciones) y reaplicación dos veces.<br>**2zf:** idiomas (0223), plantillas (0222), zonas (0220), biblioteca (0219), título (0217), opiniones (0218) y fotos (0202) en verde con 0226.<br>**Suite SQL completa** en verde: 2.978 comprobaciones. | ✅ |
| `test:catalogs-translations`: 121 comprobaciones, nuevo en la CI como «Catálogos (traducciones, offline)».<br>• claves del organizador, unidad y huella<br>• lectura por idioma: títulos del diccionario, «Living in Recoletos», características, título del catálogo<br>• N5, C2 en cada idioma y defensas<br>• respuesta de la IA y comprobación (cifras, nombres, bloqueos)<br>• clasificación de fallos (incierto, fallido, sin configurar)<br>• orquestación con la IA falsa: dos peticiones = una llamada, cancelación, caducidad, incierto, tiempo máximo real, revisión, aprobación, activación, dos clientes en dos idiomas, cero llamadas en lo público, DA34, español republicado<br>• biblioteca sin IA, texto propio no reutilizado, plantilla una vez<br>• comprobaciones de fuente: lo público sin IA, nunca la IA falsa en las acciones reales | ✅ |
| `test:catalogs-i18n` (2.167): actualizado a la regla del PR6 (sin traducción, N5 en vez del español). | ✅ |
| Las 28 suites de prueba de la CI (sin el build en el bucle), `tsc` y `lint-migrations.py` | ✅ |
| QA en Chromium con fixtures en 127.0.0.1:3141 (58 comprobaciones, `node_modules/.cache/visual-qa/tr-qa.mjs`):<br>• pestaña, progreso, «sin revisión nativa», aviso de coste<br>• preparar (1 llamada), revisar por bloque, aviso de cifra, aprobar solo confirmado<br>• activar incompleto: se niega y el enlace sigue en español<br>• dos pestañas a la vez: una sola llamada<br>• cancelar desde otra pestaña: respuesta descartada y registrada<br>• incierto: sin «Preparar», «Volver a preparar»<br>• activar inglés completo y Ana en árabe (incompleto → no; completo → sí)<br>• lector en inglés y en árabe RTL, Luis sigue al catálogo<br>• visitas, estado y PDF: cero llamadas<br>• en vivo: precio, vivienda retirada y español republicado → N5 al momento<br>• el gestor marca la desactualizada y «Contenido» avisa<br>• opinión de Ana en árabe atribuida a Ana<br>• móvil 390 sin desbordes<br>• sin errores de consola | ✅ |
| QA anteriores repetidas contra 3141: idiomas (218), resolución (24), zonas (19), plantillas (29), estructura (15), textos aprobados (17), título (7), lector (24) y opiniones (23).<br>`lang-qa`: las dos comprobaciones «la descripción sigue en español hasta el PR6» se cambiaron por la regla nueva (aviso N5 en el idioma, en RTL en ar y he).<br>`fb-qa` falló una vez justo después de otras QA que guardan opiniones (esperaba el mensaje de guardado) y pasó 23/23 al repetirla sola. | ✅ |
| `next build` aislado (`NEXT_BUILD_DIR=.next.qa`, sin `.env.production`) | ✅ «Compiled successfully» |

Capturas en [`capturas-pr6/`](capturas-pr6/): gestor (Idiomas, revisión con aviso, incompleto, en preparación, incierto, activado, árabe, desactualizada, aviso en Contenido), lector en inglés, en árabe y con N5, y móvil.

### Efectos de la migración al fusionar

- Crea seis tablas **vacías** y las funciones `catalog_tr_*`.
- Redefine `catalog_lang_snapshot` (la de 0223). **En español devuelve exactamente lo mismo:** ninguna huella cambia y ningún lector abierto recibe nada (probado).
- No toca `get_public_catalog`, `get_catalog_states` ni `catalog_public_fingerprint` (usan `catalog_lang_snapshot`). No toca las funciones de 0223: siguen ahí para la base de datos; la interfaz activa idiomas con `catalog_tr_activate`, que comprueba que están completos.
- No escribe en la ficha del CRM ni en `property_client_descriptions`. No llama a ninguna IA (SQL nunca lo hace).
- **Al desplegar no cambia nada visible:** todo sigue en español hasta que alguien prepare, apruebe y active un idioma.

### Reversión

[`rollback-0226.sql`](rollback-0226.sql):
- Devuelve `catalog_lang_snapshot` a la de 0223 y borra las funciones y las seis tablas.
- **Se pierden** las traducciones, las copias de los catálogos y el registro de trabajos. Si hay que conservarlos, antes: `SELECT * FROM catalog_tr_sources; … catalog_tr_texts; … catalog_tr_features; … catalog_tr_copies; … catalog_tr_meta_copies; … catalog_tr_jobs;`.
- **Los idiomas elegidos (0223) se conservan.** Un enlace que estuviera en inglés seguiría en inglés y, sin copias, el lector enseñaría «Descripción en preparación» en cada vivienda. Para volver antes al español: `UPDATE catalogs SET default_lang = 'es', version = version + 1 WHERE default_lang <> 'es'; UPDATE catalog_client_links SET lang = NULL WHERE lang IS NOT NULL;`.
- En español ninguna huella cambia.
- Si se revierte la base de datos antes que el código: la pestaña «Idiomas» dice que no puede cargar; el gestor sigue funcionando sin el aviso de «Contenido» y el lector en español no cambia.

### QA en producción (Fabricio)

1. Abre un catálogo compartido: el lector se ve **exactamente igual** que antes (español). La pestaña nueva **«Idiomas»** del gestor enseña el progreso de los siete idiomas a cero y **no ha llamado a la IA** (no hay ningún trabajo hasta que pulses).
2. **Primera traducción real.** Usa un catálogo de prueba, no uno enviado a un cliente.
   1. Comprueba en «Configuración → IA» el proveedor y el modelo (por defecto, OpenRouter con `deepseek/deepseek-v4-flash-latest`).
   2. En «Idiomas», elige «English (inglés)» en «Preparar y revisar traducciones».
   3. Pulsa «Preparar en inglés» en **una** vivienda. Tarda de 5 a 40 s según la longitud del texto; termina en «Pendiente de revisar».
   4. Pulsa «Revisar». Compara cada bloque, el título, la plantilla de zona (si la hay) y las características. Corrige lo que haga falta, «Guardar cambios», confirma cada aviso (cifras o nombres) y «Aprobar y usar en este catálogo».
   5. Si se agota el tiempo, sale «Resultado incierto… pudo cobrarse… No se reintenta sola»: mira el consumo en el panel del proveedor antes de «Volver a preparar».
   - **Coste orientativo:** cada vivienda es una llamada de unos 1.000–5.000 tokens entre entrada y salida (la instrucción fija más el texto). Con los precios de DeepSeek v4 Flash anotados en el repo (del orden de 0,035 $ y 0,10 $ por millón de tokens de entrada y salida, agosto de 2026), una vivienda cuesta **milésimas de dólar** y un catálogo de 24 viviendas en un idioma, **alrededor de un céntimo**. Confírmalo en el panel del proveedor tras la primera; si el modelo configurado es otro, el coste cambia.
   - **Tiempo orientativo:** «Preparar lo que falta» va una a una: un catálogo de 24 viviendas tarda unos **3–10 minutos** por idioma, más la revisión.
3. Prepara y aprueba el resto (y el «Título e introducción del catálogo»). Con el idioma incompleto, intenta activarlo: debe **negarse** («todavía no está completo») y el enlace sigue en español.
4. Con todo en «Traducción vigente» y el progreso en «Completo», activa el inglés **en un enlace personal de prueba** («Enlaces personales»). Ábrelo: títulos, descripciones, títulos de sección y características en inglés, precios con formato inglés. Abre el enlace general: sigue en español (DA17). Guarda una opinión desde el enlace en inglés: llega a la ficha del cliente como siempre.
5. Con ese enlace abierto, cambia y publica el texto en español de una vivienda. El lector abierto debe pasar solo a «Description in preparation» en esa vivienda (con sus datos y fotos) y el gestor la marca «Desactualizada». Pulsa «Preparar en inglés», revisa y aprueba: vuelve la traducción.
6. Si hay plantilla «Vivir en…» aplicada, comprueba «Living in {zona}» con el nombre de la zona sin traducir.
7. Árabe, turco y hebreo salen con «sin revisión nativa»: no los actives con clientes hasta que un hablante nativo revise el diccionario y las traducciones.
8. El PDF sigue en español hasta que se fusione el PR5.

### Ajustes al plan

Están en [`plan.md`](plan.md), «Ajustes al implementar el PR6 (22-10-2026)»:
- Migración 0226.
- Fuente «propia» = lo que enseña el catálogo.
- Una vivienda, una unidad.
- Vigencia por huella del español mostrado.
- Desactualizada → N5 (no la traducción anterior).
- Título provisional en N5.
- Título del catálogo traducido.
- Características sin traducir no se ven.
- Completo incluye títulos y características.
- Pestaña «Idiomas».
- Activación con la versión del catálogo.
- Tiempos de la reserva.
