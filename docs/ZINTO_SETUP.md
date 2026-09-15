# Integración Zinto WhatsApp — Configuración y verificación

> ⚠️ **2026-09-15 — Las secciones 1-8 describen el cliente v1
> (`lib/services/zinto/**`), RETIRADO del repo** (confirmado muerto desde
> 2026-09-13, `API_KEY_NOT_FOUND`). El envío/recepción real de WhatsApp hoy
> va por **v2**, ya en producción — ver la sección 9, reescrita el mismo día
> con el estado real. Las secciones 1-8 quedan como referencia histórica de
> cómo funcionaba v1, no como pasos a seguir: el panel "WhatsApp (Zinto)" ya
> no tiene Channel ID / Webhook Secret / Inbound Token / "Probar Conexión",
> y `/admin/leads` (leads/campañas de v1) se eliminó junto con el cliente.

Conecta el CRM (smartbc) con Zinto para **enviar y recibir** WhatsApp desde
`/admin/mensajes` y desde el botón "WhatsApp" en `/admin/solicitudes`.

## 1. Configuración de las claves — dos opciones

### Opción A (recomendada): panel admin — sin tocar el VPS

En `/es/admin/configuracion` → sección **WhatsApp (Zinto)**:
- Pega la **API Key**, el **Channel ID** (4), el **Webhook Secret** y el
  **Inbound Token** (`X-Zinto-Token`).
- Se guardan **cifradas** (AES-256-GCM) en la tabla `zinto_config`. Nunca van a git.
- Botón **Probar Conexión** → llama a `GET /channels` y lista tus canales.

> Requiere que `EMAIL_ENCRYPTION_KEY` ya esté configurada en el VPS (ya lo está,
> la usa el email). El código lee de la BD primero y cae a variables de entorno
> si la tabla está vacía.

### Opción B: variables de entorno (`.env.local` en el VPS)

```bash
ZINTO_API_KEY=pcp_...            # Clave API de Zinto (Configuraciones → API)
ZINTO_BASE_URL=https://crm.zinto.app/api/v1
ZINTO_CHANNEL_ID=4               # ID del canal WhatsApp (GET /channels)
ZINTO_WEBHOOK_SECRET=...         # Secreto HMAC para webhooks de ESTADO
ZINTO_INBOUND_TOKEN=...          # Token para autenticar mensajes ENTRANTES
```

> La API key nunca se commitea. En producción, sin `ZINTO_WEBHOOK_SECRET` /
> `ZINTO_INBOUND_TOKEN` (ni en BD ni en env) el webhook **rechaza** las
> peticiones (fail-closed).

## 2. Confirmar el canal

```bash
curl -s https://crm.zinto.app/api/v1/channels \
  -H "Authorization: Bearer $ZINTO_API_KEY" | jq
```

Toma el `id` del canal de WhatsApp y ponlo en `ZINTO_CHANNEL_ID`.

## 3. Recibir mensajes — crear un Flujo en Zinto

La API REST de Zinto solo notifica **estado** de mensajes salientes. Para que
los mensajes que el cliente te escribe **entren al CRM**, se usa un **Flujo**:

1. Zinto → **Flujos** → *Crear nuevo flujo*.
2. **Disparador de Mensaje** → canal *WhatsApp (No Oficial)*.
3. Añade un nodo **Webhook** conectado al disparador:
   - **Método HTTP:** `POST`
   - **URL de Webhook:** `https://portal.bcousinoprop.com/api/webhooks/zinto`
   - **Custom Headers:** añade
     - `X-Zinto-Token` = *(el mismo valor de `ZINTO_INBOUND_TOKEN`)*
   - **Request Body (JSON):**
     ```json
     {
       "event": "message.received",
       "from": "{{contact.phone}}",
       "message": "{{message.content}}"
     }
     ```
     > Ajusta `{{contact.phone}}` / `{{message.content}}` a las variables reales
     > que ofrezca tu instancia (panel **Variables** del flujo). El handler solo
     > necesita `from` (teléfono) y `message` (texto).
4. **Guardar** y **activar** el flujo.

## 4. Webhook de estado (sent/delivered/read/failed)

Apunta el webhook de estado también a
`https://portal.bcousinoprop.com/api/webhooks/zinto` y usa `ZINTO_WEBHOOK_SECRET`.
El endpoint distingue automáticamente estado vs. mensaje entrante vs. evento de
lead (por el header `X-Zinto-Event` o por la forma del payload).

**Firma (HMAC-SHA256).** El handler acepta el esquema documentado por Zinto y el
antiguo, para no romperse ante un cambio de config:
- Header `X-Zinto-Signature: sha256=<hex>` con base `X-Zinto-Timestamp + "." + body`.
- (compat) Header `X-Webhook-Signature` con base = body crudo o `JSON.stringify`.

Estados soportados: `sent`, `delivered`, `read`, `failed`. El match del mensaje
es por el `message.id` string (`msg_…`) que devuelve `/messages/send`.

## 5. Aplicar migraciones

Las tablas `zinto_conversations` y `zinto_messages` se crean con
`scripts/post-deploy.sh` (o el botón en `/admin/configuracion`). Migraciones:
`0091_zinto_conversations.sql`, `0092_zinto_messages.sql`.

## 6. Verificación end-to-end

1. **Enviar desde solicitudes:** `/es/admin/solicitudes` → en un lead con
   teléfono, pulsa **WhatsApp** → te lleva al chat → escribe y envía.
2. **Comprobar entrega:** el tick pasa a ✓ (enviado) / ✓✓ (entregado) según los
   webhooks de estado.
3. **Recibir:** responde desde el WhatsApp del cliente → en ~5 s aparece en el
   chat (polling) y la conversación sube con contador de no leídos.
4. **BD:** `select * from zinto_messages order by created_at desc limit 5;`

## 7. Leads / campañas / sincronización (módulo de la plataforma Zinto)

Además de WhatsApp, la integración soporta el lado de **leads** de Zinto (la
plataforma de prospección que alimenta al CRM). Misma API key y `ZINTO_BASE_URL`;
la key debe tener habilitados los scopes `campaigns:*`, `leads:*`, `sync:*`.

**Enviar (CRM → Zinto)** — funciones en `lib/services/zinto/leads.ts`:
- `createCampaign()` → `POST /campaigns`
- `upsertLead()` → `POST /leads` (idempotente por `external_id`)
- `syncPreview()` → `POST /sync/preview` (dry-run: elegibles, duplicados, inválidos)
- `syncExecute()` → `POST /sync/execute` (ejecuta el preview aprobado)

Todas las escrituras envían `Idempotency-Key`, así que reintentar nunca duplica.

**Recibir (Zinto → CRM)** — eventos `lead.*` al mismo webhook
`/api/webhooks/zinto` (firmados con `ZINTO_WEBHOOK_SECRET`). Eventos soportados:
`lead.created`, `lead.qualified`, `lead.approved_for_crm`, `lead.sent_to_crm`,
`lead.accepted_by_crm`, `lead.duplicate`, `lead.rejected`, `lead.converted`,
`lead.sync_failed`. El handler hace upsert en `zinto_leads` (match por
`external_id` → `zinto_id` → teléfono), guarda auditoría en `zinto_lead_events`
y responde `{ status: "accepted", crm_record_id, crm_event_id }` (o
`{ status: "duplicate", ... }` si el lead ya existía).

Tablas: `zinto_campaigns`, `zinto_leads`, `zinto_lead_events`, `zinto_sync_jobs`
(migración `0097_zinto_leads.sql`). El estado `read` de WhatsApp se habilita con
`0096_zinto_messages_read_status.sql`.

## 8. Plantillas, media y protección de replay

**Plantillas de WhatsApp.** Fuera de la ventana de 24 h (o en primer contacto)
la API exige una plantilla aprobada (`MESSAGE_TEMPLATE_REQUIRED`). Helpers en
`lib/services/zinto/client.ts`:
- `sendWhatsAppTemplate(channelId, to, template)` → `message.type:"template"`
  con `name`, `language.code` y `components[].parameters`.
- `getChannelTemplates(channelId)` → `GET /channels/{id}/templates` (lista las
  aprobadas). El `name` debe estar `approved`; se gestionan en el panel de Zinto
  o en Meta Business Manager.

**Media.** `sendWhatsAppMedia(channelId, to, { type:'image'|'document', link,
caption, filename })` envía por URL HTTPS (no base64). Los mensajes entrantes de
tipo `image/audio/document` llegan con `message.media.url` (y `content:null`); el
webhook los guarda en las columnas `media_*` de `zinto_messages` y muestra un
placeholder `[tipo]` en el inbox.

**Sync jobs.** Tras `syncExecute()`, `getSyncJob(jobId)` y
`getSyncJobRecords(jobId)` consultan estado y resultado por registro
(`GET /sync/jobs/{id}` y `/records`). Los eventos `sync.job.completed` /
`sync.job.failed` llegan al webhook y actualizan `zinto_sync_jobs`.

**Firma y replay.** El webhook valida HMAC-SHA256 con base
`X-Zinto-Timestamp + "." + body`, rechaza eventos firmados fuera de la ventana
de **5 minutos** y deduplica por `X-Zinto-Delivery-Id` (tabla
`zinto_webhook_deliveries`, migración `0099`). La idempotencia de escrituras usa
el header `Idempotency-Key`.

## Notas / limitaciones conocidas

- El identificador de mensaje difiere entre el envío (`msg_xxx`, string) y el
  webhook de estado (numérico). El match de estado es best-effort contra ambas
  columnas; si tu instancia no correlaciona, los mensajes quedan en "enviado".
- El envío respeta el límite de 4096 caracteres y normaliza el teléfono
  (solo dígitos, prefijo internacional, sin `+`/espacios/guiones).
- Rate limits de Zinto: 60/min, 1000/h, 10000/día (HTTP 429).

## 9. API v2 (bidireccional) — EN PRODUCCIÓN HOY (reescrito 2026-09-15)

`https://crm.zinto.app/api/v2` es la integración que de verdad manda/recibe
WhatsApp hoy. Soporta mensajes entrantes de forma nativa
(`message.received`) — el "Flujo" manual del punto 3 (v1) ya no existe ni
hace falta. Contrato oficial, público y sin login:
`GET /api/v2/openapi.json` y `/guide.md`.

⚠️ **No es lo mismo que `lib/services/zinto-integration/`** (contrato
`_integration-api`, un piloto de CRM completo con contactos/deals/pipelines/
tareas, apagado con `ZINTO_INTEGRATION_API_ENABLED` y sin key de producción
asignada — ver `docs/api/SMARTBC-INTEGRATION-GUIDE-2026-08-13.md`). Quedan
DOS integraciones de Zinto en el repo (el cliente v1 se retiró el
2026-09-15):

| | Base URL | Módulo | Estado |
|---|---|---|---|
| **v2 (bidireccional oficial)** | `/api/v2` | `lib/services/zinto-v2/**` | **En producción hoy** — envío y recepción reales |
| Integration API (piloto CRM completo) | `/_integration-api` | `lib/services/zinto-integration/**` | Apagado, sin key de prod |

### Diferencias de contrato que importan

- **Header nuevo obligatorio:** `X-Zinto-Integration-Id` (UUID tratado como texto) en TODA
  ruta protegida, además del `Authorization: Bearer`. Se crea/pide en Zinto
  aparte de la API Key — sin él, cualquier llamada a v2 da 401/403. Hay que
  copiarlo completo, con sus letras y guiones, sin ninguna conversión numérica.
- **Formato de teléfono con `+`:** v2 espera `recipient` en E.164 **con** el
  `+` (`"+56912345678"`). Ver `normalizeRecipientV2()` en
  `lib/services/zinto-v2/client.ts` — no confundir con `normalizePhoneNumber()`
  (`lib/phone.ts`, genérico, sin `+`), que usan otras partes del panel para
  validar/guardar el número tal cual lo escribe el admin.
- **No hay `GET /channels` en v2.** El `channelId` sigue siendo el mismo
  entero de siempre (4 = ES, 50 = CL), pero no hay forma de listarlos desde
  v2 — se confirman contra el panel de Zinto.
- **Dedupe de webhooks por `X-Zinto-Event-Id`.** Misma tabla
  `zinto_webhook_deliveries` que ya existía (columna genérica `delivery_id`).
- **El OpenAPI de v2 no publica el schema del body de los webhooks** — solo
  la guía en prosa dice qué eventos llegan (`message.sent/delivered/read/
  failed/received`). El parser en `app/api/webhooks/zinto-v2/route.ts` ya
  confirmó contra producción el envelope real
  (`{id, type, occurred_at, company_id, integration_id, origin, data}`) y el
  contenido de `data` para texto; el de media sigue sin confirmar del todo
  (ver más abajo).
- **Mensajería sin plantillas/media todavía.** El cliente v2
  (`sendWhatsAppMessageV2`) solo cubre texto — `POST /messages` no acepta
  adjuntos. Zinto confirmó por escrito (2026-09-15) que es una función
  pendiente de construir de su lado (envío y recepción de media como una
  sola pieza), sin fecha comprometida todavía. Tampoco hay envío de
  plantillas contra v2 (v1 sí lo tenía, `sendWhatsAppTemplate()`, pero ese
  cliente ya no existe): fuera de la ventana de 24h, el envío falla hasta
  que se construya.

### Cómo está guardado

Fila singleton en `zinto_config` (columnas `*_v2`, migración `0164`),
cifradas con `EMAIL_ENCRYPTION_KEY`, editable desde `/admin/configuracion` →
**"WhatsApp (Zinto) — API v2 (beta)"**. El flag real es `enabled_v2`
(checkbox "Activar v2" en ese panel) — **en producción está en `true`**: es
la única vía de envío/recepción de WhatsApp que queda. Si algún día se
apaga, el webhook `/api/webhooks/zinto-v2` responde 404 a propósito en vez
de aceptar en silencio, y no hay ningún fallback al que caer.

### Estado de la recepción de media (2026-09-15)

El receptor (`app/api/webhooks/zinto-v2/route.ts`) ya sabe detectar que un
mensaje entrante es de media por el campo `type` (confirmado por Zinto:
plano dentro de `data`, mismo campo que ya usan los mensajes de texto) y lo
muestra en la bandeja como "📷 Imagen" etc. **Pero Zinto confirmó que hoy no
manda ningún campo con la URL del archivo** — ni en `message.received` ni en
ningún otro evento — así que no hay forma de mostrar el archivo en sí
todavía. En cuanto Zinto lo agregue, solo hace falta rellenar `url` en
`extractMedia()` de ese mismo archivo.

### Antes hacía falta (ya resuelto)

Lo siguiente ya se hizo y quedó confirmado en producción — se deja como
registro de qué se verificó, no como pasos pendientes:

1. Integration ID + API Key de v2 cargados en el panel.
2. Webhook de v2 apuntado en el panel de Zinto a
   `https://portal.bcousinoprop.com/api/webhooks/zinto-v2` y verificado con
   un mensaje entrante real.
3. Envío migrado de v1 a v2 (`sendZintoMessage()` en
   `app/[country]/(admin)/admin/mensajes/zinto-actions.ts`), y el cliente v1
   retirado del repo por completo (2026-09-15).

**Fuera de alcance por ahora:** v2 también expone `/contacts`,
`/campaigns/batch`, `/appointments` y `/deals` (agenda y pipeline) — no se
conectaron a nada de SmartBC todavía porque no hay un mapeo decidido
(¿`/appointments` = visitas del CRM? ¿`/deals` = pipeline de captaciones?).
Si se necesita, es trabajo aparte.
