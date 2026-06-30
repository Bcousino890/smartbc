# Integración Idealista — estado y qué falta

Publicar en Idealista **desde el CRM** automatizando la web real de Idealista con
un navegador robot (Playwright + stealth). No usa la API oficial (esa requiere
contrato de volcado), sino que **rellena el formulario de Idealista como lo
haría una persona**, pero automático.

## Cómo funciona
- **Login** (`lib/services/idealista/authenticator.ts`): abre Chromium headless,
  mete email + contraseña, gestiona el **2FA por SMS**, y guarda la sesión en
  cookies a disco para reutilizarla.
- **Sesión** (`lib/services/idealista/browser-manager.ts`): cookies en
  `IDEALISTA_SESSION_DIR` (o `<repo>/.idealista-session`). Necesita **proxy**
  (`IDEALISTA_PROXY_URL`) porque las IPs del VPS están bloqueadas por Cloudflare.
- **Publicar** (`lib/services/idealista/publisher.ts` ← `POST /api/admin/idealista/publish-property`):
  abre `idealista.com/tools/propiedad/nuevo`, rellena el form, hace submit y
  guarda `idealista_state` / `idealista_property_id` en `idealista_listings`.
- **Programar**: columna `scheduled_publish_at` + worker `process-scheduled`
  (cron). Dos modos: **Sistema** (propiedad del CRM) e **Inspo** (ficha desde cero).
- **UI**: `/admin/idealista` (lista + form) y `/admin/idealista/configuracion`
  (conectar la cuenta).

## Qué FALTA para que publique de verdad (tareas del responsable / VPS)

### 1. 🔴 Proxy residencial — bloqueante nº1
Sin esto el login y la publicación fallan SIEMPRE (Cloudflare bloquea las IPs de
Hetzner). En el `.env` del VPS:
```
IDEALISTA_PROXY_URL=http://usuario:pass@gate.smartproxy.com:7000
```
(residencial, no datacenter).

### 2. 🔴 Ruta de sesión persistente
Para no repetir el login 2FA en cada deploy. En el `.env` del VPS:
```
IDEALISTA_SESSION_DIR=/opt/smartbc-idealista-session
```
(carpeta fuera del repo, que no se borre al desplegar).

### 3. 🔴 Completar el rellenado del formulario
Hoy el robot solo rellena **tipo, calle, descripción y visibilidad**. Falta
**precio, habitaciones, baños, m², características y FOTOS**. Requiere
**inspeccionar el DOM de Idealista logueado** y añadir esos selectores en
`lib/services/idealista/selectors.ts` + las funciones de relleno en
`publisher.ts`. (Solo puede hacerlo quien tenga la sesión/cuenta de Idealista.)

### 4. 🟠 Cablear el cron de programadas
```
*/5 * * * * curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3137/api/admin/idealista/process-scheduled
```
+ `CRON_SECRET` en el `.env`.

## Arreglos ya hechos (rama `feat/idealista-robustez`)
- `process-scheduled` ahora **incluye fichas inspo** (antes las ignoraba).
- **Guarda anti-duplicado** al publicar (no crea anuncios repetidos; `force:true` para forzar).
- La subida de fotos del form va a **Supabase Storage** (persistente), no a
  `/public` (que se borraba en cada deploy → URLs muertas).

## Archivos clave
- `lib/services/idealista/{authenticator,browser-manager,session-store,publisher,selectors}.ts`
- `app/api/admin/idealista/{login-start,login-verify,session-status,publish-property,process-scheduled,upload-media}/route.ts`
- `app/(admin)/admin/publicacion/idealista-form.tsx`, `app/(admin)/admin/idealista/idealista-client.tsx`
- Migraciones: `supabase/migrations/{0017,0018,0019,0055,0056}*.sql`
