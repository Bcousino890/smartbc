# BCP-01 · Ampliación — resultado · Traducción automática, como en itinerarios

**Especificación:** [`spec.md`](spec.md) (DA10, DA11, DA12, DA14, DA16, DA36, AC8, §3 y §7 marcadas «Sustituida por decisión de Fabricio del 22-10-2026») · **Plan:** [`plan.md`](plan.md) § «Traducción automática, como en itinerarios (22-10-2026)». Formato y reglas, como en [`result.md`](result.md) y [`result-pr6.md`](result-pr6.md).

> **La QA en producción y el merge son de Fabricio.** Todo lo de abajo se ha probado con datos sintéticos, Postgres temporal y fixtures. **Ninguna llamada real a una IA**: en las pruebas y los fixtures la IA es una función FALSA que cuenta llamadas. Sin producción, credenciales ni archivos `.env` del repositorio (el `next build` se hizo con `.env.production` apartado fuera del worktree).

## Rama y base

- **Rama:** `fabri/bcp-01-traduccion-automatica`, desde `origin/main` = `bbe21368` (todos los PR de la ampliación fusionados).
- **Migración:** `0228_catalog_translations_auto.sql`, con [`rollback-0228.sql`](rollback-0228.sql). Sin dependencias ni paquetes nuevos.

## Decisión de Fabricio (22-10-2026)

El flujo del PR6 (preparar al pulsar, revisar y aprobar bloque a bloque, activar un idioma solo cuando está completo) es demasiado complejo. Debe funcionar **«tal cual en itinerarios»**:

1. **Cuándo se traduce:** la primera vez que alguien abre el catálogo en ese idioma (vista previa del dueño o cliente), con IA, y se guarda por idioma; no se vuelve a pagar mientras el español no cambie. Sustituye DA12.
2. **Revisión automática, opcional:** se publica sola si pasa los filtros deterministas. «Idiomas» queda para corregir cualquier bloque. ar, tr y he siguen «sin revisión nativa».
3. **Elegir el idioma** (del catálogo y de cada enlace) lo aplica al momento. Mientras una vivienda se traduce: N5, y el lector abierto se actualiza solo al terminar.
4. **Si cambia el español**, la traducción queda desactualizada y se rehace sola en la siguiente visita (mientras, N5).

## Qué cambia respecto al PR6

**Se reutiliza todo el PR6:** fuentes con identidad de versión (biblioteca, texto propio del catálogo, plantilla «Vivir en…», título del catálogo), bloques por clave de sección (DA18), copias por catálogo y vivienda con la huella del español, reserva única por fuente e idioma con caducidad, descartes de lo que llega tarde o tras cancelar, la instantánea por idioma y N5. **La lectura pública no cambia** (`catalog_lang_snapshot`, `to-public.ts`).

**1 · Datos (0228).**
- `approval` ('auto' | 'manual') en `catalog_tr_texts` y `catalog_tr_features`: cómo se publicó. Lo aprobado antes queda 'manual'.
- `auto` en `catalog_tr_jobs`: el trabajo lo lanzó una visita.
- `catalog_tr_reserve_auto`: la reserva de 0226 con los límites (abajo), con un cerrojo por catálogo.
- `catalog_tr_publish`: la aprobación de 0226 (revisión vista, bloqueos de contacto y precio, copia con la huella) y además cómo. Lo escrito a mano (`origin = 'manual'`) nunca queda como automático.
- `catalog_tr_mark_reviewed`: «Dar por revisada».
- `catalog_tr_activate` (misma firma): el idioma cambia **al momento**, sin «solo completo».

**2 · Traducción en segundo plano** (`lib/catalogs/auto-translate.ts`, puro; `auto-translate-instance.ts`, la instancia única del proceso).
- **Disparo:** el lector (`/seleccion/[token]`), `estado`, `eventos` (al conectar) y el PDF por token llaman a `getPublicCatalogState(token, { visit: true })` / `linkExportReaders`. Si la instantánea está en un idioma ≠ es y falta algo (vivienda sin copia vigente, característica sin traducir o título del catálogo), se encarga **sin esperarlo** (`void import(...)`, ni siquiera se espera la carga del módulo). La respuesta sale ya con N5.
- **Sin `after()`**: el canal en vivo es una respuesta de hasta 30 min y `after()` esperaría a que terminara. Se usa una instancia en `globalThis` (como el vigilante; PM2 de un solo proceso). Si el proceso se reinicia a mitad, la reserva caduca y cuenta como fallo.
- **El vigilante no cuenta como visita.**
- **Idioma:** solo el que eligió el dueño: el de la instantánea del token y otra vez al resolver el token en la base de datos (enlace personal o catálogo). Un idioma «pedido» de otra forma no traduce nada (probado con una instantánea manipulada).
- **Por unidad:** si ya hay traducción publicable (biblioteca o plantilla aprobadas en otro catálogo, o un borrador sin bloqueos) se publica **sin IA**; si no, una llamada con reserva y se publica si pasa los filtros. Cada publicación sube la versión del catálogo → la huella cambia → el vigilante actualiza los lectores abiertos (también se le avisa al momento).
- **IA:** `aiComplete` con el proveedor configurado en la app; la IA falsa solo en fixtures y pruebas.

**3 · Publicación automática.**
- **Bloqueo** (teléfono, correo, web o precio, los mismos patrones que al publicar): **no se publica**; la vivienda sigue en N5 y el gestor la marca «No publicada: corrígela» con el motivo. No se vuelve a traducir sola (no se paga otra vez).
- **Aviso** (cifra que falta o sobra, nombre propio que no aparece): **se publica** y el gestor la marca «Traducida · revisar».
- **Edición a mano:** «Guardar y publicar» publica al momento como 'manual'; ninguna traducción automática la pisa mientras el español no cambie (cada fuente se traduce una vez por versión del español).
- **Español cambiado:** la copia queda desactualizada (N5 al momento); la siguiente visita la retraduce (solo lo que falta: título y bloques; no las características ya traducidas).

**4 · Gestor.**
- **Junto a «Compartir»:** «Idioma del enlace», al momento, con «sin revisión nativa» en ar, tr y he (como el diálogo de itinerarios).
- **«Idiomas» (opcional):** el idioma del catálogo y el de cada enlace personal (al momento); por idioma, «N de M traducidas»; por vivienda, su estado (Traducida, Traducida · revisar, En preparación, No publicada: corrígela, Falló: se reintentará sola a partir de las HH:MM, Sin reintentos automáticos, Desactualizada, Sin traducir); «Ver y corregir» (original y traducción por bloque); «Dar por revisada»; «Preparar ahora» (traduce ya, antes de compartir, sin espera creciente). Se actualiza sola mientras algo se traduce.
- **Fuera:** «Aprobar y usar», «Rechazar», «Cancelar la preparación», «Usar las ya aprobadas», «Quitar de este catálogo» y la negativa «todavía no está completo». Las funciones SQL de 0226 siguen ahí.
- «Contenido»: el aviso N5 dice ahora que se traducen solas en la próxima visita.

## Límites contra el abuso y el coste

| Límite | Valor | Dónde |
| --- | --- | --- |
| Idioma | solo el elegido por el dueño para ese catálogo o enlace | instantánea + `resolveToken` (base de datos) |
| Una vez por vivienda, idioma y versión del español | N visitas ≠ N veces el coste | fuentes por huella (0226) |
| Visitas simultáneas | un trabajo por fuente e idioma | reserva única (0226) + una ejecución por catálogo e idioma en el proceso |
| Trabajos a la vez por catálogo | **2** (también para «Preparar ahora») | `catalog_tr_reserve_auto`, cerrojo por catálogo; y en el proceso |
| Llamadas a la vez en el proceso | **4** | `AutoTranslator` |
| Llamadas nuevas por visita | **30** (un catálogo de 24 viviendas y su título cabe en una) | `AutoTranslator` |
| Trabajos automáticos por catálogo y día | **300** (24 viviendas × 7 idiomas = 175) | `catalog_tr_reserve_auto` |
| Fallo, incierto o reserva caducada | espera **5 min, 30 min, 2 h, 12 h** antes de que otra visita reintente; tras **5** seguidos, ya no se reintenta solo (solo «Preparar ahora») | `catalog_tr_reserve_auto` (misma regla en `autoRetryState` para el gestor) |
| Una misma visita (token e idioma) | no relanza la comprobación antes de **15 s** (el lector consulta `estado` cada 500 ms si el canal calla) | `AutoTranslator` |
| Tiempo máximo por llamada / caducidad de la reserva | 120 s / 300 s (los del PR6) | `translations.ts` |

Un trabajo terminado reinicia la cuenta de fallos; una cancelación no cuenta. La reserva reduce las llamadas duplicadas, **no garantiza una sola llamada de pago** (DA36, sigue vigente).

**Coste orientativo** (el del PR6): cada vivienda es una llamada de unos 1.000–5.000 tokens; con DeepSeek v4 Flash, un catálogo de 24 viviendas en un idioma cuesta alrededor de un céntimo. El peor caso diario por catálogo (300 trabajos) es del orden de 0,10–0,15 $.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| **SQL** en Postgres 16 temporal, secciones nuevas **2zi** y **2zj** de `scripts/sql/test-catalogs-core.sh` (`M20`).<br>**2zi:** traducciones previas con 0226 (una aprobada a mano con su copia, un borrador, un incierto, un enlace en inglés) y 0228 aplicada dos veces; `test-catalog-translations-auto.sql`:<br>• desplegar no cambia ninguna huella; lo aprobado queda «manual»<br>• una reserva por fuente e idioma; 2 a la vez por catálogo («limit», también para el dueño); caducadas que dejan hueco<br>• espera 5 min / 30 min / 2 h / 12 h y «stopped» a los 5 fallos (un caducado cuenta); el dueño sí; un terminado reinicia; una cancelación no cuenta<br>• tope diario («cap») solo para visitas<br>• publicar sola («auto», copia, versión y huella nuevas solo en el enlace de ese idioma), lo aprobado a mano sigue «manual», lo editado a mano nunca queda «auto», con la editada una visita no vuelve a pedirla, bloqueo de contacto no se publica, características «auto»<br>• «Dar por revisada»; idioma del catálogo y de un enlace al momento (antes `lang_incomplete`), DA17<br>• ficha del CRM y `property_client_descriptions` intactas; anon y authenticated sin permisos<br>**Concurrencia real:** dos sesiones de psql reservan dos viviendas del mismo catálogo a la vez con «como mucho 1»: una reserva y la otra ve «limit».<br>**Reversión** (sin funciones ni columnas nuevas, la activación vuelve a exigir «completo», traducciones y copias conservadas) y reaplicación dos veces sin cambiar ninguna huella.<br>**2zj:** acabado (0227), idiomas (0223), plantillas (0222), zonas (0220), biblioteca (0219), título (0217), opiniones (0218), fotos (0202) y operación en verde con 0228. Los tests de 0226 se siguen ejecutando sin 0228 (2ze/2zh): 0228 cambia a propósito su regla de «solo completo».<br>**Suite SQL completa:** **3.871** comprobaciones en verde. | ✅ |
| `test:catalogs-translations`: **154** comprobaciones (antes 121), con IA falsa que cuenta llamadas:<br>• primera visita en un idioma elegido → responde al momento con N5 y encarga en segundo plano; segunda → traducido, 0 llamadas nuevas<br>• visitas simultáneas, también desde dos «procesos» → un trabajo por vivienda<br>• idioma no elegido (instantánea manipulada) o token inexistente → 0 llamadas<br>• bloqueo → no se publica y queda marcado, no se repaga; aviso → se publica y queda «revisar»; «Dar por revisada»<br>• edición a mano publicada y no pisada; precio a mano rechazado<br>• español cambiado → desactualizada, N5, retraducción en la siguiente visita (solo lo que falta)<br>• incierto/fallido → espera 5 min, 30 min, 2 h, 12 h, parada a los 5; «Preparar ahora» sí<br>• 2 a la vez por catálogo (pico medido 2), tope por visita, tope diario, 20 lecturas seguidas = 1 comprobación, cambio de idioma = nueva comprobación al momento, sin IA = N5 y ningún trabajo<br>• DA34 (precio, foto, vivienda retirada) y C2 en cada idioma; dos enlaces en dos idiomas (DA19); PDF por token con el contenido del idioma<br>• biblioteca reutilizada sin IA en otro catálogo, texto propio no promocionado, plantilla traducida una vez<br>• comprobaciones de fuente: lo público no importa la IA ni la espera; solo las visitas (y el PDF) encargan; el vigilante no; aiComplete en la app y la IA falsa solo en fixtures | ✅ |
| `test:catalogs-i18n` (**2.175**, antes 2.167): N5 en los siete idiomas mientras se traduce; qué instantáneas encargan traducción. | ✅ |
| `test:catalogs-pdf-i18n` (con `translateFixtureCatalog` ya por el camino automático) | ✅ |
| Las **32** suites de la CI (sin el build en el bucle), `npx tsc --noEmit` y `lint-migrations.py` | ✅ |
| **QA en Chromium** con fixtures en 127.0.0.1:3143 (`node_modules/.cache/visual-qa/trauto-qa.mjs`, **55/55**):<br>• «Compartir»: selector con los 8 idiomas y «sin revisión nativa» en ar/tr/he; al momento, sin IA<br>• abrir el enlace: N5 un instante y se actualiza solo a traducido (sin recargar); la página no espera a la IA; 5 llamadas (4 viviendas + título), luego 0<br>• Ana en árabe (RTL) desde «Idiomas», al momento; Luis sigue al catálogo (DA17)<br>• «Idiomas»: estados, sin «Aprobar»; corregir un bloque → publicado y el lector abierto lo enseña solo; una visita después no lo pisa<br>• bloqueo (teléfono): no se publica, «No publicada: corrígela», corregida → publicada y el lector se actualiza; aviso → publicada y «Revisar» → «Dar por revisada»<br>• español cambiado: N5 al momento en el lector abierto, «Desactualizada», la siguiente visita la retraduce (1 llamada)<br>• incierto: espera (otra visita a los 16 s no reintenta), «Falló: se reintentará sola a partir de las HH:MM», «Preparar ahora» lo resuelve<br>• DA34 en vivo, PDF por token en inglés (200, PDF) sin llamadas<br>• 390 px: lector en hebreo con N5, «Idiomas» y «Compartir» sin desbordes<br>• sin errores de consola | ✅ |
| QA anteriores repetidas contra 3143 (BASE por variable):<br>`lang-qa` 218, `pdf-qa` 56 (descarga del PDF en ar, he, tr y es con la regla nueva), `res-qa` 24, `qa` 24, `fb-qa` 23, `copy-qa` 17, `title-qa` 7, `st-qa` 15, `tpl-qa` 29, `area-qa` 19 y `fin-qa` 30 (línea base de esta misma rama). `tpl-qa`, `area-qa` y `copy-qa` fallaron por tiempo en una primera tanda con el servidor cargado y pasaron al repetirlas solas | ✅ |
| `next build` aislado (`NEXT_BUILD_DIR=.next.qa`, sin `.env.production`) | ✅ «Compiled successfully»; sin «Environments: .env» en el log; `.env.production` y `tsconfig.json` intactos |

Capturas en [`capturas-traduccion-automatica/`](capturas-traduccion-automatica/): «Compartir» con el idioma (y en árabe), lector en inglés con N5 un instante y ya traducido, lector en árabe, gestor «Idiomas» (en inglés, corregida, bloqueada, revisar, desactualizada, reintento) y móvil (lector en hebreo con N5, «Idiomas», «Compartir»).

## Efectos de la migración al fusionar

- Añade dos columnas `approval` y una `auto` (con valores por defecto) y un índice; lo aprobado antes queda 'manual'.
- Crea `catalog_tr_reserve_auto`, `catalog_tr_publish` y `catalog_tr_mark_reviewed`; redefine `catalog_tr_activate` (misma firma) sin «solo completo».
- **No cambia ninguna instantánea ni huella** (probado): ningún lector abierto recibe nada al desplegar.
- No escribe en la ficha del CRM ni en `property_client_descriptions`. No llama a ninguna IA (SQL nunca lo hace).
- **Al desplegar el código:** los catálogos y enlaces que ya estaban en un idioma ≠ es (solo los activados completos con el PR6) siguen igual. Desde ese momento, abrir un enlace en un idioma con algo sin traducir (por ejemplo, una vivienda añadida después o un español republicado) lo traduce solo en segundo plano con la IA configurada. Los borradores del PR6 sin aprobar se publican solos en la siguiente visita si no tienen bloqueos.

## Reversión

[`rollback-0228.sql`](rollback-0228.sql):
- Devuelve `catalog_tr_activate` a la de 0226 (solo completo) y borra las tres funciones nuevas, el índice y las columnas `approval` y `auto`.
- **No se pierde ninguna traducción ni copia** y ninguna huella cambia. Se pierde solo la marca de cómo se aprobó cada una y qué trabajos fueron automáticos (consultas para copiarlas, en el propio archivo).
- Los idiomas elegidos se conservan (aunque estén incompletos: lo que falte se ve con N5). Para volver antes al español: `UPDATE catalogs SET default_lang = 'es', version = version + 1 WHERE default_lang <> 'es'; UPDATE catalog_client_links SET lang = NULL WHERE lang IS NOT NULL;`.
- **Revertir la base de datos y no el código** rompe la traducción automática y la pestaña «Idiomas» (las funciones nuevas no existen): hay que revertir los dos. El lector sigue funcionando (la lectura pública no depende de 0228) y la traducción falla en segundo plano sin afectar a la respuesta.

## QA en producción (Fabricio)

1. Tras desplegar, abre un catálogo ya compartido en español: el lector se ve **exactamente igual** que antes.
2. Comprueba en «Configuración → IA» el proveedor y el modelo (por defecto, OpenRouter con `deepseek/deepseek-v4-flash-latest`).
3. **Usa un catálogo de prueba**, no uno enviado a un cliente. En «Compartir», junto al enlace, elige «English (inglés)» en «Idioma del enlace»: dice «El enlace está ahora en inglés» al momento.
4. Pulsa «Vista previa». El lector abre en inglés con los datos, fotos y precios en inglés y, en cada vivienda, «Description in preparation» (no se ve el español). **Sin recargar**, en unos segundos (5–40 s por vivienda, dos a la vez) cada vivienda pasa sola a su título y descripción en inglés, y el título del catálogo también.
5. Recarga y abre el enlace en otra pestaña: todo traducido al momento. En «Idiomas» (inglés): «Todo traducido» y cada vivienda «Traducida» o «Traducida · revisar». Mira el consumo en el panel del proveedor: una llamada por vivienda y otra por el título, y ninguna más al volver a abrir.
6. Si alguna sale «Traducida · revisar», pulsa «Ver y corregir», mira los avisos (cifras o nombres), corrige si hace falta con «Guardar y publicar» (el lector abierto lo enseña solo) o pulsa «Dar por revisada».
7. Si alguna sale «No publicada: corrígela» (la IA puso un teléfono, un correo, una web o un precio), el cliente sigue viendo «Description in preparation» en esa vivienda: corrígela y «Guardar y publicar».
8. En «Idiomas» → «Enlaces personales», pon un enlace personal de prueba en otro idioma (por ejemplo, francés). Ábrelo: N5 un instante y se traduce solo; el enlace general sigue en inglés. Guarda una opinión desde ese enlace: llega a la ficha del cliente como siempre.
9. Con el enlace en inglés abierto, cambia y publica el texto en español de una vivienda: el lector pasa solo a «Description in preparation» en esa vivienda y el gestor la marca «Desactualizada». Abre otra vez el enlace (una visita): se retraduce sola y el lector abierto se actualiza.
10. Para traducir antes de compartir: en «Idiomas», elige el idioma y pulsa «Preparar ahora»; la lista pasa a «En preparación» y luego «Traducida» sin recargar.
11. Descarga el PDF desde el lector en inglés: sale en inglés.
12. Árabe, turco y hebreo salen con «sin revisión nativa»: no los uses con clientes hasta que un hablante nativo revise el diccionario y las traducciones.
13. Si una traducción falla (proveedor caído o tiempo agotado), el gestor dice «Falló: se reintentará sola a partir de las HH:MM»; tras 5 fallos seguidos ya no se reintenta sola y hace falta «Preparar ahora».
