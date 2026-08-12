# Zinto ↔ SmartBC · Qué necesitamos para cerrar la comunicación bilateral

Documento para enviar a Zinto. Cada punto está en formato **necesito X → para que
Y → se verifica así**. Los puntos van numerados (`Z-01`…`Z-24`) para que puedan
responderse uno a uno.

Fecha: 2026-08-12 · Instancia: `bcousinoprop` · Entorno: producción.

---

## 0 · Contexto: qué hay montado ya por nuestro lado

Esto ya está desplegado y vivo. No hace falta que lo cambien, pero necesitan
conocerlo para responder al resto del documento.

| Cosa | Valor exacto |
|---|---|
| Endpoint receptor (único, para todo) | `POST https://portal.bcousinoprop.com/api/webhooks/zinto` |
| Métodos que acepta ese endpoint | **solo `POST`** (un `GET` devuelve 405 — ver Z-07) |
| API base que llamamos | `https://crm.zinto.app/api/v1` |
| Endpoint de envío que usamos | `POST /messages/send` |
| Auth saliente | `Authorization: Bearer <API key>` |
| Canales que nos devuelve `GET /channels` | `#4` WhatsApp España · `#50` WhatsApp Chile · `#51` Web (webchat) · `#16` twilio_voice |
| Widget de WebChat | `https://crm.zinto.app/api/webchat/widget.js?token=wc_…` (canal #51) |
| Iframe de bandeja que tenemos puesto | `https://crm.zinto.app/bcousinoprop/inbox/embed` ← **el que falla** |

### Cómo enviamos (esto funciona, no lo toquen)

```http
POST https://crm.zinto.app/api/v1/messages/send
Authorization: Bearer <api-key>
Content-Type: application/json
Idempotency-Key: <uuid>            ← lo mandamos en todas las escrituras

{
  "channelId": 4,                   ← mandamos las dos grafías por compatibilidad
  "channel_id": 4,
  "to": "34612345678",              ← solo dígitos, sin "+", sin espacios ni guiones
  "message": "texto plano"          ← string en texto; objeto {type:…} en plantilla/media
}
```

### Cómo recibimos (esto es lo que hay que ajustar)

Cabeceras que leemos, con estos nombres exactos:

| Cabecera | Uso |
|---|---|
| `X-Zinto-Event` | Nombre del evento. Si no viene, lo deducimos del cuerpo. |
| `X-Zinto-Timestamp` | Base de la firma **y** ventana anti-replay de **5 minutos**. |
| `X-Zinto-Delivery-Id` | Deduplicación: un id repetido se descarta con `200 {"status":"duplicate_ignored"}`. |
| `X-Zinto-Signature` | `sha256=<hex>` — HMAC-SHA256 de `"<X-Zinto-Timestamp>" + "." + "<cuerpo crudo>"`. |
| `X-Zinto-Token` | Alternativa a la firma **solo** para mensajes entrantes (token compartido). |

Respuestas que devolvemos:

| Código | Cuándo |
|---|---|
| `200 {"status":"received"}` | Procesado correctamente. |
| `200 {"status":"duplicate_ignored"}` | `X-Zinto-Delivery-Id` ya visto. |
| `400` | JSON inválido, falta el teléfono del remitente, o falta contenido. |
| `401` | Firma inválida, token inválido, o evento fuera de la ventana de 5 min. |
| `500` | Error nuestro procesando → **reintenten**, borramos el id de deduplicación para que el reintento no se descarte. |

---

## 1 · BLOQUEANTE — Confusión de canales (su punto 3 + la parte de canales del punto 4)

### El diagnóstico exacto, con el código en la mano

Nuestro receptor decide el país de la conversación **a partir del `channel.id`
que ustedes mandan en el webhook de entrada**
(`app/api/webhooks/zinto/route.ts`, líneas 211-213):

```ts
const incomingChannelId = payload.channel?.id != null
  ? Number(payload.channel.id)
  : defaultChannelId;                                  // por defecto 4 (España)
const country = Number(channelId) === Number(clChannelId) ? 'cl' : 'es';
```

Y las conversaciones son únicas por `(teléfono, país)`. Es decir:

- Escribimos a un cliente por el canal **#4 (España)** → se guarda en la
  conversación ES.
- El cliente contesta → ustedes nos entregan el webhook con `channel.id = 50`.
- Nuestro código lo lee como Chile → **no encuentra** la conversación ES de ese
  teléfono (busca solo en `country='cl'`) → **crea una conversación nueva en
  Chile** y mete ahí la respuesta.

Resultado: dos hilos con el mismo número, la respuesta en el país equivocado, y
el hilo original de España se queda mudo. Es exactamente lo de sus capturas.
Y encaja al 100% con lo que ustedes mismos reportan: *"el canal 4 aparece como el
que envía los mensajes, pero realmente los envía el canal 50"*.

**No es un problema de dos síntomas: es el mismo problema visto desde los dos
lados.** El id de canal que anuncia su panel y el id de canal que viaja en el
webhook no son el mismo número.

### Lo que necesitamos

**Z-01 · Necesito que me confirmen si `#4` y `#50` comparten la misma sesión /
número de WhatsApp por debajo.**
→ Para saber si esto es un bug de etiquetado (dos canales lógicos sobre una sola
sesión, y el webhook reporta el id de la sesión física) o un bug de enrutado.
→ Verificación: mándennos la salida de `GET /channels` con `phone_e164` de cada
uno, y díganos si los dos apuntan al mismo WABA / a la misma sesión.

**Z-02 · Necesito que el `channel.id` del webhook de entrada sea EL MISMO id con
el que nosotros enviamos en `POST /messages/send`.**
→ Para que la respuesta del cliente caiga en el mismo hilo desde el que se
escribió, y no en el país contrario.
→ Verificación: enviamos con `channelId: 4`, el cliente responde, y en el webhook
tiene que llegar `channel.id = 4`. Ni 50, ni ausente.

**Z-03 · Necesito que el webhook de entrada incluya SIEMPRE el bloque
`channel` completo, con `id`, `type` y `phone_e164`.**
```json
"channel": { "id": 4, "type": "whatsapp", "phone_e164": "+34…" }
```
→ Para poder enrutar por **número receptor** (que es dato duro y no se confunde)
en lugar de fiarnos solo del id. Con `phone_e164` presente podemos blindar el
enrutado por nuestra cuenta aunque el id venga mal.
→ Verificación: cualquier mensaje entrante trae los tres campos, y `phone_e164`
coincide con el número real del canal.

**Z-04 · Necesito los números E.164 reales y definitivos de `#4` y `#50`.**
→ Para cerrar el mapeo canal↔país en nuestra configuración y poder detectar
automáticamente cuándo un webhook viene mal etiquetado.
→ Verificación: nos los dan por escrito y coinciden con `GET /channels`.

**Z-05 · Necesito un `conversation_id` (o `thread_id`) estable de Zinto,
devuelto en la respuesta de `POST /messages/send` Y en el webhook de entrada.**
→ Para dejar de reconstruir el hilo por `(teléfono + canal)`, que es
precisamente lo que se rompe cuando el canal viene mal. Con un id de hilo, la
correlación es exacta y este problema no puede repetirse aunque el canal falle.
→ Verificación: el id que devuelve el envío es el mismo que llega en la respuesta
del cliente.

**Z-06 · Necesito que la respuesta de `POST /messages/send` devuelva el
`channel_id` por el que el mensaje salió REALMENTE.**
→ Para detectar la discrepancia en el momento del envío y avisar, en vez de
descubrirla cuando el cliente ya contestó al hilo equivocado. (Nosotros ya
leemos ese campo; solo necesitamos que sea el canal real, no un eco del que
mandamos.)
→ Verificación: enviamos por `#4`; si sale por `#50`, la respuesta dice `50`.

---

## 2 · BLOQUEANTE — Webhook de entrada (su punto 4)

Confirman que el de **salida funciona** y que el de **entrada "no cumple la
redirección esperada"**. Necesitamos concretar qué significa eso, porque desde
nuestro lado el endpoint está vivo y responde.

**Z-07 · Necesito la URL EXACTA que tienen registrada, carácter por carácter.**
→ Tiene que ser, literalmente:
```
https://portal.bcousinoprop.com/api/webhooks/zinto
```
`https` (no `http`), **sin barra final**, sin `www`. Si está registrada con
`http://`, con barra final o con `www`, nuestro servidor responde un **redirect
307/308** — y ahí está, casi seguro, su "no cumple la redirección esperada":
muchos clientes HTTP, al seguir un redirect, convierten el `POST` en `GET` o
pierden el cuerpo y las cabeceras de firma.
→ Verificación: nos pegan la URL tal cual está guardada en su panel.

**Z-08 · Necesito saber si su cliente HTTP sigue redirecciones y si preserva
método + cuerpo + cabeceras al hacerlo.**
→ Para descartar definitivamente esa hipótesis. Lo ideal es que **no dependan de
redirecciones**: que apunten a la URL final y listo.
→ Verificación: nos lo confirman por escrito.

**Z-09 · Necesito saber si su plataforma hace una verificación previa con `GET`
(handshake tipo Meta/echo del challenge).**
→ Porque nuestro endpoint **solo implementa `POST`**: un `GET` devuelve **405
Method Not Allowed**, y si su panel usa eso para "validar" el webhook antes de
activarlo, nunca lo dará por bueno. Si es el caso, díganlo y añadimos el `GET`
en el mismo día.
→ Verificación: nos dicen sí/no y, si es sí, qué debe devolver exactamente.

**Z-10 · Necesito un volcado crudo de un intento fallido: método, URL final,
todas las cabeceras, el cuerpo tal cual, y el código + cuerpo de respuesta que
reciben de nosotros.**
→ Es lo único que necesitamos para cerrar esto en minutos en vez de en días. Con
el código de respuesta que reciben ya sabemos si el problema es firma (401),
formato (400), redirección (30x) o método (405).
→ Verificación: nos lo mandan por correo o por su panel de logs.

**Z-11 · Necesito que me confirmen cuál de los dos métodos de autenticación usan
para los mensajes entrantes.**
→ Aceptamos cualquiera de los dos, pero tienen que elegir uno y usarlo siempre:
- **(a) Token compartido:** cabecera `X-Zinto-Token: <valor>` — el valor que les
  pasamos aparte, nunca en este documento.
- **(b) Firma HMAC:** `X-Zinto-Signature: sha256=<hex>` donde el hex es
  `HMAC-SHA256(secret, "<X-Zinto-Timestamp>" + "." + "<cuerpo crudo>")`.
→ Ojo con dos detalles que rompen la firma en silencio: hay que firmar el
**cuerpo crudo tal cual se envía** (no un JSON re-serializado, porque cambia el
orden de las claves y los espacios), y el `X-Zinto-Timestamp` tiene que ser el
mismo valor que se firma.
→ Verificación: un mensaje entrante devuelve `200 {"status":"received"}` en vez
de `401`.

**Z-12 · Necesito que manden `X-Zinto-Timestamp` en ISO-8601 y dentro de una
ventana de 5 minutos, y un `X-Zinto-Delivery-Id` único por entrega.**
→ El timestamp es nuestra protección anti-replay: si viene desfasado más de 5
minutos, devolvemos `401 Stale event`. Un reloj mal sincronizado en su lado
tumba todos los webhooks. El delivery-id es lo que evita que un reintegro suyo
nos duplique el mensaje en la bandeja.
→ Verificación: no aparecen mensajes duplicados y no hay `401 Stale event` en
nuestros logs.

**Z-13 · Necesito su política de reintentos y el rango de IPs de origen.**
→ Para saber cuánto tiempo tenemos para recuperarnos de una caída (nosotros
devolvemos `500` cuando queremos que reintenten, y limpiamos la deduplicación
para que el reintento sí se procese), y para poder permitir sus IPs en el
firewall si hiciera falta.
→ Verificación: nos dan número de reintentos, backoff y las IPs.

**Z-14 · Necesito que registren en ese mismo endpoint los eventos de estado y
los de leads, si no lo están ya.**
→ El mismo endpoint distingue solo por el evento. Necesitamos:
- Estado de mensajes salientes: `message.sent`, `message.delivered`,
  `message.read`, `message.failed` → para los ✓ / ✓✓ / leído en la bandeja.
- Mensajes entrantes: `message.received` o `whatsapp.message.received`.
- Leads: `lead.created`, `lead.qualified`, `lead.approved_for_crm`,
  `lead.sent_to_crm`, `lead.accepted_by_crm`, `lead.duplicate`, `lead.rejected`,
  `lead.converted`, `lead.sync_failed`.
- Sincronizaciones: `sync.job.completed`, `sync.job.failed`.
→ Verificación: nos confirman la lista de eventos suscritos.

**Z-15 · Necesito que el id de mensaje del webhook de estado sea EL MISMO string
que devuelve `POST /messages/send`.**
→ Hoy el envío nos devuelve un `msg_xxxxx` (string) pero en algunos webhooks de
estado hemos visto un id numérico distinto. Cuando no cuadran, el mensaje se
queda para siempre en "enviado" y nunca pasa a ✓✓ ni a leído.
→ Verificación: enviamos un mensaje, y el `message.id` del webhook de estado es
idéntico al `message_id` que nos devolvió el envío.

---

## 3 · BLOQUEANTE — Iframe: "la compañía no existe" (su punto 4)

Tenemos embebido `https://crm.zinto.app/bcousinoprop/inbox/embed`
(`app/[country]/(admin)/admin/mensajes/zinto-inbox-embed.tsx`) y devuelve que la
compañía no existe. Hay tres cosas distintas que pueden estar fallando y
necesitamos las tres:

**Z-16 · Necesito la URL exacta del embed, con el identificador de compañía
correcto (slug o id numérico).**
→ Porque `bcousinoprop` no le suena a su plataforma. Puede ser otro slug, o
puede que la ruta lleve el id numérico de la cuenta.
→ Verificación: la URL abierta directamente en el navegador muestra la bandeja.

**Z-17 · Necesito saber cómo se autentica la sesión DENTRO del iframe.**
→ Esto es crítico y no es opcional: un iframe de `crm.zinto.app` dentro de
`portal.bcousinoprop.com` es **cross-site**. Las cookies de sesión de Zinto no
viajan ahí salvo que estén marcadas `SameSite=None; Secure`, y aun así Chrome y
Safari bloquean cookies de terceros por defecto. Es decir: **aunque nos den la
URL correcta, el iframe seguirá sin funcionar si depende de la cookie de sesión.**
Necesitamos una de estas dos:
- **(a)** un **token de embed firmado**, por usuario y con caducidad, que
  pongamos en la URL (`?token=…`) y que ustedes validen en servidor; o
- **(b)** un flujo SSO documentado (por ejemplo, un intercambio de código).
→ Verificación: abrimos el panel en un Chrome con cookies de terceros
bloqueadas y la bandeja carga igualmente.

**Z-18 · Necesito que añadan `https://portal.bcousinoprop.com` a la lista blanca
de dominios que pueden embeber su aplicación.**
→ En concreto: que la respuesta **no** lleve `X-Frame-Options: DENY` ni
`SAMEORIGIN`, y que su cabecera CSP incluya
`frame-ancestors https://portal.bcousinoprop.com`. Sin eso el navegador bloquea
el iframe sin importar la URL ni el token.
→ Verificación: `curl -sI <url-del-embed>` no muestra `X-Frame-Options`, y la
consola del navegador no da error de `frame-ancestors`.

**Z-19 · Necesito poder filtrar el embed por canal y por agente vía parámetros.**
→ Algo como `?channel=4` o `?channel=50`, para que la pestaña de España muestre
la bandeja de España y la de Chile la de Chile, en lugar de una bandeja
mezclada — que es justo el origen de la confusión que reportan.
→ Verificación: con `?channel=50` solo se ven conversaciones de Chile.

---

## 4 · Atribución de agente (la otra mitad de su punto 3)

Su captura dice también *"sin ninguna referencia al agente"*. Es correcto: **hoy
no hay ni un solo campo de agente en el contrato**, ni de entrada ni de salida.
No es que se pierda: es que nunca viaja.

**Z-20 · Necesito que los webhooks de entrada y de estado incluyan un bloque
`agent` (o `assigned_user`) con `id`, `name` y `email`.**
→ Para poder mostrar en el CRM quién atiende cada conversación y quién contestó,
y para poder repartir la bandeja por agente en vez de tener un buzón común.
→ Verificación: la respuesta de un cliente llega con el agente asignado en Zinto.

**Z-21 · Necesito poder identificar al agente EN EL ENVÍO, y que Zinto lo
registre como autor del mensaje.**
→ Para que en Zinto el mensaje no aparezca como enviado por "la API" o por un
usuario genérico, sino por la persona que lo escribió desde nuestro CRM. Díganos
qué prefieren:
- un campo en el cuerpo (`agent_id`, `sender_id`, `on_behalf_of`…), o
- una cabecera (`X-Zinto-Agent-Id`), o
- que lo metamos en `metadata` (ya mandamos ese objeto y podemos incluir
  `crm_agent_id`, `crm_agent_email`).
→ Verificación: enviamos con el identificador de un agente y en la bandeja de
Zinto el mensaje aparece firmado por esa persona.

**Z-22 · Necesito el mapeo de usuarios: la lista de agentes de Zinto con su `id`
y su email.**
→ Para casar cada usuario de nuestro CRM con su usuario de Zinto. Sin ese mapeo,
Z-20 y Z-21 no se pueden implementar aunque el campo exista.
→ Verificación: nos pasan la lista (o un endpoint tipo `GET /users`).

---

## 5 · Cosas que quedan abiertas y también nos frenan

**Z-23 · Necesito los nombres exactos de las plantillas de WhatsApp aprobadas,
por canal, con su idioma y el orden de las variables.**
→ Fuera de la ventana de 24 h y en cualquier primer contacto, WhatsApp exige
plantilla aprobada; sin ella su API nos devuelve `MESSAGE_TEMPLATE_REQUIRED` y el
mensaje no sale. Ya tenemos implementado el envío por plantilla
(`sendWhatsAppTemplate`), solo faltan los datos: `name` exacto, `language.code`
(`es` / `es_ES` / `es_CL`) y qué significa cada `{{1}}`, `{{2}}`…
→ Verificación: `GET /channels/4/templates` y `GET /channels/50/templates`
devuelven plantillas en estado `approved`, y un primer contacto sale sin error.

**Z-24 · Necesito saber cuánto duran las URLs de media entrante y si requieren
autenticación.**
→ Cuando entra una imagen, un audio o un documento, guardamos la `media.url` que
nos mandan. Si esa URL caduca o exige el Bearer, el adjunto se rompe en la
bandeja al cabo de un tiempo y necesitamos descargarlo y re-alojarlo nosotros al
recibirlo.
→ Verificación: nos dicen el TTL y si hace falta cabecera de autorización.

**Z-25 · Necesito confirmar los scopes de nuestra API key.**
→ Necesitamos `channels:*`, `messages:*`, `templates:read`, y para el módulo de
prospección `campaigns:*`, `leads:*`, `sync:*`. Si alguno falta, esas llamadas
fallan con un error de permisos que desde el panel se ve igual que "no
configurado".
→ Verificación: `GET /customer/publishinfo` (o equivalente) nos lista los scopes
activos.

---

## 6 · Lo que ya funciona y NO hay que tocar

Para que no se rompa nada al arreglar lo de arriba:

- Envío de texto por `POST /messages/send` con `channelId` numérico y `to` en
  dígitos sin `+`. Funciona.
- El sobre de error `{ "error": { code, message, details, request_id } }`. Lo
  parseamos tal cual; si cambia el formato, dejamos de mostrar el motivo real
  del fallo al usuario.
- Los códigos de error estables que ya traducimos en la interfaz:
  `INVALID_PHONE_NUMBER`, `RATE_LIMIT_EXCEEDED`, `CHANNEL_NOT_FOUND`,
  `CHANNEL_INACTIVE`, `MESSAGE_TEMPLATE_REQUIRED`, `MESSAGE_TOO_LONG`.
- La cabecera `Idempotency-Key`: la mandamos en todas las escrituras y contamos
  con que un reintento con la misma clave no duplique.
- Los límites que ya respetamos: 4096 caracteres por mensaje; 60 peticiones por
  minuto, 1000 por hora, 10000 por día.
- Los ids de canal **numéricos** (4, 50, 51, 16). Su documentación genérica
  muestra ids en formato string (`ch_whatsapp_…`); nuestra instancia usa
  enteros y todo nuestro código asume enteros. Si van a migrar a ids string,
  avísennos **antes**.

---

## 7 · Lo que hacemos nosotros en cuanto respondan

No todo es suyo. Estos puntos son nuestros y los tenemos identificados:

1. **Enrutado por número, no por id de canal.** En cuanto nos den
   `channel.phone_e164` (Z-03), enrutamos por el número receptor y dejamos el
   `channel.id` como pista secundaria. Así, aunque el id venga mal, el mensaje
   cae en el hilo correcto.
2. **Alarma de discrepancia de canal.** Si enviamos por `#4` y la respuesta dice
   `#50`, lo registramos y avisamos en el panel en vez de crear un hilo nuevo en
   silencio.
3. **Fusionar los hilos duplicados** que ya se han creado en Chile con
   conversaciones que en realidad son de España.
4. **Guardar y mostrar el agente** en la bandeja, en cuanto exista el campo
   (Z-20/Z-21/Z-22).
5. **Añadir `GET` al endpoint del webhook** si su plataforma lo necesita para
   validar (Z-09).
6. **Exponer los canales por país en el panel de configuración.** Hoy el
   formulario de `/admin/configuracion` solo guarda un `channel_id`; los ids de
   España y Chile viven en columnas que el formulario no escribe, así que el de
   Chile se queda en el valor por defecto del código. Lo arreglamos.
7. **Rotar el token del WebChat** del canal #51, que hoy va incrustado en el
   bundle de cliente (`components/zinto-webchat.tsx`) y por tanto es público.

---

## 8 · Prueba de aceptación conjunta

Cuando estén los puntos anteriores, esta es la prueba que damos por buena. Son
seis pasos y se hace en media hora en una llamada:

1. `GET /channels` devuelve `#4` y `#50` con su `phone_e164` correcto.
2. Enviamos texto por `#4` a un móvil de prueba → llega al móvil, y la respuesta
   del envío dice `channel_id: 4`.
3. Llegan los webhooks de estado `sent` → `delivered` → `read`, todos con el
   **mismo** `message.id` que nos devolvió el envío → la bandeja muestra ✓, ✓✓ y
   leído.
4. El móvil responde → llega el webhook de entrada con `channel.id = 4`,
   `channel.phone_e164` del canal español, el bloque `agent`, y el
   `conversation_id` → la respuesta aparece **en el hilo de España**, con el
   agente, y **no** se crea ningún hilo en Chile.
5. Lo mismo por `#50` → cae en Chile, y en Chile solamente.
6. El iframe carga la bandeja dentro de `portal.bcousinoprop.com` en un Chrome
   con cookies de terceros bloqueadas, filtrado por canal.

---

## Resumen ejecutivo — los 6 que desbloquean todo

Si solo pueden atacar unos pocos, que sean estos:

| # | Necesito | Para que |
|---|---|---|
| **Z-02** | El `channel.id` del webhook de entrada = el `channelId` con el que enviamos | Las respuestas dejen de aparecer en el país equivocado |
| **Z-03** | `channel.phone_e164` en todos los webhooks | Podamos enrutar por número y blindarnos ante ids mal etiquetados |
| **Z-10** | Un volcado crudo de un webhook de entrada fallido | Cerrar en minutos si es firma, formato, redirección o método |
| **Z-16/17/18** | URL correcta del embed + token de sesión + nuestro dominio en `frame-ancestors` | El iframe deje de decir "la compañía no existe" |
| **Z-20/21** | Bloque `agent` en los webhooks y poder firmar el envío como un agente | Se vea quién atiende y quién contestó |
| **Z-23** | Nombres de plantillas aprobadas por canal | Poder hacer primer contacto fuera de la ventana de 24 h |
