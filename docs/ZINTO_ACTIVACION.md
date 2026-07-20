# Activación Zinto ↔ CRM — paso a paso

Guía operativa para dejar la integración **funcionando de punta a punta** tras el
merge del código. Referencia técnica completa en `docs/ZINTO_SETUP.md`.

> Reparto de responsabilidades:
> - **SmartBC (nosotros):** desplegar, aplicar migraciones, configurar credenciales.
> - **Zinto (ellos):** registrar el Flujo/webhook, aprobar plantillas, confirmar números.

---

## Paso 1 · Desplegar el código (VPS)

El VPS hace auto-deploy por cron (~5 min): `git pull` → `apply-migrations.sh`
→ `npm run build` → `pm2 restart`. Si el build falla, **no** reinicia (el sitio
sigue en la versión anterior).

**Verificar que desplegó:** entra a `/es/admin`; en el sidebar debe aparecer
**"Leads Zinto"** (icono imán). Si aparece, el build nuevo está activo.

## Paso 2 · Aplicar migraciones

`apply-migrations.sh` aplica solo las nuevas y recarga el schema-cache de
PostgREST automáticamente. Para forzarlo/confirmarlo desde el panel:

1. `/admin/configuracion` → botón **"Aplicar Migraciones Ahora"**.
2. Debe aplicar `0096`–`0100`:
   - `0096` estado `read` en mensajes
   - `0097` tablas de leads/campañas/sync
   - `0098` columnas de media
   - `0099` dedupe de webhooks (`zinto_webhook_deliveries`)
   - `0100` **arregla la creación de conversaciones** (índice único por `country`)
3. Comprobación SQL (opcional, en `supabase-db`):
   ```sql
   select to_regclass('public.zinto_leads'),
          to_regclass('public.zinto_webhook_deliveries');
   -- ambas NOT NULL = tablas creadas
   ```

## Paso 3 · Credenciales (ya guardadas)

En `/admin/configuracion` → **WhatsApp (Zinto)** ya están guardadas (cifradas)
la API Key, el Webhook Secret y el Inbound Token. **"Probar Conexión"** debe
decir *"Conexión correcta · N canales"*. Canales reales: **#4 ES**, **#50 CL**,
**#51 Web**.

## Paso 4 · Enviar (CRM → WhatsApp)

1. `/admin/mensajes?tab=whatsapp` → **Nueva** → número con prefijo (ej.
   `34612345678`), país, **Abrir chat**. (Con el fix `0100` esto ya no falla.)
2. Escribe y **envía**.
   - Dentro de la ventana de 24 h (el cliente ya te escribió): texto libre ✔.
   - **Primer contacto / fuera de 24 h:** WhatsApp exige **plantilla aprobada**
     → ver Paso 6. Sin plantilla, Zinto devuelve `MESSAGE_TEMPLATE_REQUIRED`.

## Paso 5 · Recibir (WhatsApp → CRM) — requiere config en Zinto

Nuestro webhook receptor (ya vivo):
`POST https://portal.bcousinoprop.com/api/webhooks/zinto`

En el **panel de Zinto** hay que crear/confirmar:

1. **Mensajes entrantes** — Flujo → disparador *"mensaje recibido"* (canal
   WhatsApp) → nodo **Webhook** a la URL de arriba, con header
   `X-Zinto-Token: <Inbound Token>` (el mismo valor guardado en el panel).
2. **Estado de entrega** (✓/✓✓/leído) — webhook de estado a la misma URL,
   firmado `X-Zinto-Signature` con el Webhook Secret.
3. **Eventos de leads** (`lead.*`) y **sync** (`sync.job.*`) — suscribir esos
   eventos a la misma URL (mismo secret).

**Prueba de recepción:** responde desde tu móvil al chat → debe aparecer en la
pestaña en ~5 s. Si no aparece, el Flujo de Zinto no está apuntando bien.

## Paso 6 · Plantillas de WhatsApp (para primer contacto)

Pedir a Zinto (o crear en Meta Business Manager y sincronizar): una plantilla
**aprobada** con su `name` exacto, idioma (`es`/`es_ES`/`es_CL`) y el **orden de
las variables** (`{{1}}`, `{{2}}`…). Listado disponible vía
`GET /channels/{id}/templates`. El envío usa `sendWhatsAppTemplate()`.

## Paso 7 · Leads / campañas

- Los leads que Zinto empuje por `lead.*` aparecen en **`/admin/leads`**.
- Desde ahí: **Previsualizar sync** → **Ejecutar** → **Actualizar** estado del job.

---

## Checklist de datos pendientes de Zinto

- [ ] Números E.164 reales de canal **#4 (ES)** y **#50 (CL)**.
- [ ] Nombre(s) de **plantilla(s) aprobada(s)** + idioma + orden de variables.
- [ ] Registrar webhook `lead.*` + `sync.*` (y confirmar el de mensajes/estado).
- [ ] Confirmar scopes de la API key (`campaigns/leads/sync/jobs/webhooks`).
- [ ] Token de **WebChat** rotado para el canal **#51**.
- [ ] (Nosotros) pasarles el valor de `X-Zinto-Token`.

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| "No se pudo crear la conversación" | Migración `0100` sin aplicar | Paso 2 |
| `/admin/leads` vacío o 500 | Tablas sin crear o schema-cache viejo | Paso 2 (reaplica; recarga PostgREST) |
| Envío da `MESSAGE_TEMPLATE_REQUIRED` | Primer contacto fuera de 24 h | Usar plantilla (Paso 6) |
| No llegan mensajes entrantes | Flujo de Zinto no configurado | Paso 5 (panel Zinto) |
| Firma inválida en webhook | Webhook Secret distinto | Igualar secret en panel y `/admin/configuracion` |
