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

> ⚠️ **"Probar Conexión" sólo comprueba la capa legacy** (listar canales). No
> dice nada de la Integration API — durante cuatro semanas dio verde mientras
> la capa nueva estaba muerta, porque cada una usaba una credencial distinta.
> Para el estado real mira **"Estado de la integración"** en la misma pantalla,
> o por curl desde el VPS:
> ```bash
> curl -s -H "Authorization: Bearer $CRON_SECRET" \
>   http://localhost:3000/api/admin/zinto/health | jq .verdict
> ```
> Desde 2026-09-13 la credencial de las **dos** capas sale de `zinto_config`,
> y la base de datos gana sobre las variables de entorno.

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

### Webhook del contrato nuevo (Integration API) — ya no es manual

Los eventos del contrato nuevo (`contact.*`, `note.*`, `tag.*`, `message.*`,
`deal.*`, `task.*`) van a **otra ruta y con otra firma**:
`POST https://portal.bcousinoprop.com/api/webhooks/zinto-integration`.

No hay que pedírselo a Zinto ni pegar nada a mano: en `/admin/configuracion` →
WhatsApp (Zinto) → **"Registrar webhook"**. El botón lo da de alta por API y
guarda el `whsec_` cifrado en el mismo paso — que es el motivo de que sea un
botón: **ese secreto se devuelve una sola vez**, y si se pierde por el camino
hay que borrar el endpoint y volver a crearlo. Requiere el scope
`webhooks:manage`; el health check avisa si falta.

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

## Paso 8 · Cron de reconciliación (a mano en el VPS)

El webhook es el camino rápido; el cron es la verdad. Sin él, cualquier evento
perdido se queda perdido y la caché va divergiendo en silencio.

```
30 3 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/zinto-sync
```

⚠️ **El código no basta** — igual que el cron de alertas de propiedades y el de
vídeos, la entrada hay que añadirla a mano con `crontab -e` en el VPS.

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
| "Network error calling Zinto Integration API" | URL base que ya no es la API | `/api/admin/zinto/health` lo dice; el prefijo `/_integration-api` está muerto |
| El panel dice OK pero nada funciona | "Probar Conexión" sólo mira la capa legacy | Usa "Estado de la integración" |
| `API_KEY_NOT_FOUND` | Clave revocada o caducada | Pide una nueva a Zinto y guárdala en el panel |
| Firma inválida en webhook | Webhook Secret distinto | Igualar secret en panel y `/admin/configuracion` |
