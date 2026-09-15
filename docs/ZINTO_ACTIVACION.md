# Activación Zinto ↔ CRM — estado actual y cómo activar el resto

> **2026-09-15 — reescrito de arriba a abajo.** Esta guía se escribió cuando
> el envío/recepción real de WhatsApp iba por la API v1 de Zinto
> (`lib/services/zinto/**`). Ese cliente se **retiró del repo** el
> 2026-09-15: llevaba semanas confirmado muerto (`API_KEY_NOT_FOUND` en las
> tres credenciales que se probaron, ver CLAUDE.md 2026-09-13) y el
> envío/recepción real de WhatsApp **ya funciona de punta a punta por la API
> v2** (confirmado en producción, conversación bidireccional real). También
> se retiró con él la sección **"Leads Zinto"** (`/admin/leads`): dependía
> 100% del cliente v1 y sus tablas estaban a 0 filas en producción. Referencia
> técnica completa en `docs/ZINTO_SETUP.md`.

> Reparto de responsabilidades:
> - **SmartBC (nosotros):** desplegar, aplicar migraciones, configurar credenciales.
> - **Zinto (ellos):** confirmar el canal, aprobar plantillas, configurar el webhook de v2 en su panel.

---

## Lo que YA funciona (API v2, en producción)

No hace falta activar nada — esto ya está en marcha:

- **Enviar** (CRM → WhatsApp): `/admin/mensajes?tab=whatsapp`, dentro de la
  ventana de 24h (texto libre). `sendWhatsAppMessageV2()`
  (`lib/services/zinto-v2/client.ts`), `POST /messages`.
- **Recibir** (WhatsApp → CRM): el receptor
  `app/api/webhooks/zinto-v2/route.ts` ya procesa `message.received` con la
  firma/envelope reales de Zinto. El webhook se configura **en el panel de
  Zinto** (Configuración → Acceso API → Integraciones CRM), no desde aquí —
  v2 no tiene un endpoint para darlo de alta por API.
- **Estado de entrega** (✓/✓✓/leído): mismo receptor, eventos `message.sent`/
  `.delivered`/`.read`/`.failed`.

**Media (fotos/vídeos/documentos):** en producción desde el 2026-09-15. El
botón 📎 de `/admin/mensajes` sube el archivo (máx. 10 MB) y lo manda por
WhatsApp; los archivos que mande un cliente aparecen igual en la bandeja. Ver
`docs/ZINTO_SETUP.md`, sección de media, para el detalle técnico (las URLs
de Zinto son endpoints autenticados — el navegador nunca les pega
directo, siempre pasa por `app/api/admin/zinto/media/route.ts`).

**Primer contacto / fuera de la ventana de 24h:** WhatsApp exige una
**plantilla aprobada** — `sendWhatsAppMessageV2` hoy solo manda texto libre,
así que el envío falla fuera de esa ventana hasta que se construya el envío
de plantillas contra v2 (v1 sí lo tenía, `sendWhatsAppTemplate()`, pero ese
cliente ya no existe).

**Diagnóstico, no adivines:**
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/admin/zinto/health | jq .verdict
```
El mismo diagnóstico se ve en `/admin/configuracion` → "Estado de la
integración".

---

## Activar el piloto de Integration API (opcional, sigue apagado)

El contrato completo de CRM (contactos/deals/pipelines/tareas,
`lib/services/zinto-integration/**`) es un piloto **aparte de v2** — apagado
por flag (`ZINTO_INTEGRATION_API_ENABLED`/`enabled` en `zinto_config`), sin
key de producción confirmada todavía.

### Paso 1 · Desplegar el código (VPS)

El VPS hace auto-deploy por cron (~1 min, ver CLAUDE.md "Cómo despliega el
VPS"): compila en `.next.new` → migraciones → intercambio atómico → health
check.

### Paso 2 · Migraciones

`apply-migrations.sh` aplica solo las nuevas y recarga el schema-cache de
PostgREST automáticamente. Las relevantes para el piloto: `0119`
(tablas propias), `0120` (caché de contactos/notas), `0166` (columnas
`integration_*` en `zinto_config`).

### Paso 3 · Credenciales

En `/admin/configuracion` → **"Zinto — Integración CRM (piloto)"**: la
**API Key principal** (la de la cuenta Zinto, compartida con el fallback del
piloto) y, si Zinto dio una clave aparte, la **API Key de integración**. La
URL base normaliza sola cualquier sufijo (`/api/v1`, `/_integration-api`)
que se le pegue.

⚠️ No hay botón de "Probar Conexión" en este panel — el único diagnóstico
real es **"Estado de la integración"**, que prueba de verdad la URL, la
clave, los permisos y el webhook contra Zinto.

### Paso 4 · Webhook del piloto

`/admin/configuracion` → **"Registrar webhook"**. El botón lo da de alta por
API y guarda el `whsec_` cifrado en el mismo paso — **ese secreto se
devuelve una sola vez**, así que si se pierde hay que borrar el endpoint y
volver a crearlo. Requiere el scope `webhooks:manage`; el health check avisa
si falta. Receptor: `app/api/webhooks/zinto-integration/route.ts`.

### Paso 5 · Activar el flag

Solo tras confirmar con Zinto que la cuenta está en la allowlist de
escritura del piloto: `ZINTO_INTEGRATION_API_ENABLED=true` (o el toggle
correspondiente en `zinto_config`).

---

## Cron de reconciliación (a mano en el VPS)

⚠️ **El código no basta** — igual que el cron de alertas de propiedades y el
de vídeos, la entrada hay que añadirla a mano con `crontab -e` en el VPS:

```
30 3 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/zinto-sync
```

Este cron fue escrito contra v1 y **no tiene traducción directa a v2**: el
contrato v2 es de empuje puro (sin ningún `GET`), así que "reconciliar
bajando" no existe ahí — ver CLAUDE.md, sección "El contrato v2 es de
EMPUJE".

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| Envío da `NOT_CONFIGURED` | v2 no está habilitada (`enabled_v2` en falso) | Activar v2 en `/admin/configuracion` |
| Envío da `CHANNEL_INACTIVE`/`CHANNEL_NOT_FOUND` | Canal WhatsApp inactivo en Zinto | Confirmar con Zinto el estado del canal |
| No llegan mensajes entrantes | Webhook v2 no configurado en el panel de Zinto | Zinto → Configuración → Acceso API → Integraciones CRM |
| Firma inválida en webhook v2 | Secreto distinto entre panel de Zinto y `zinto_config` | Re-registrar/confirmar el secreto |
| "Network error calling Zinto Integration API" | URL base que ya no es la API | `/api/admin/zinto/health` lo dice; el prefijo `/_integration-api` está muerto |
| El piloto de integración da `API_KEY_NOT_FOUND` | Clave revocada o caducada | Pide una nueva a Zinto y guárdala en el panel |
