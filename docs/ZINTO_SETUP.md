# Integración Zinto WhatsApp — Configuración y verificación

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
