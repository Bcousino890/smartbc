# smartbc — Notas de infraestructura

## Stack real (IMPORTANTE — leer siempre antes de tocar infra)
- **Todo en VPS propio (Hetzner). NADA en la nube de terceros.**
- **NO usamos Supabase Cloud** ni su panel/MCP. La base de datos (PostgreSQL)
  corre en el VPS dentro del contenedor Docker `supabase-db`.
- **NO usamos Vercel.** El servidor Next.js corre en el VPS con PM2.
- ⚠️ Aclaración: el código sí importa las librerías `@supabase/supabase-js` y
  `@supabase/ssr`, pero apuntan al **stack self-hosted del VPS** (GoTrue +
  PostgreSQL propios), NO a supabase.com. Por eso:
  - NO sugerir herramientas/MCP de Supabase Cloud ni de Vercel.
  - `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` apuntan al VPS.
  - Las migraciones se aplican con psql dentro del contenedor `supabase-db`
    (ver `scripts/post-deploy.sh` y el botón en `/admin/configuracion`).
- Deploy: push a `main` → el VPS despliega solo (cron cada minuto,
  `/opt/vps-autodeploy.sh`). Ver "Cómo despliega el VPS" abajo.

### Cómo despliega el VPS (corregido 2026-08-16)
Hasta esta fecha el build se hacía **en sitio**: `next build` reescribía `.next`
mientras el proceso de PM2 seguía sirviendo desde esa misma carpeta, así que
**cada despliegue devolvía 500 durante uno o dos minutos**. Ya no.

Ahora: compila en `.next.new` → migraciones → intercambio atómico → reinicio →
health check → **si no responde, vuelve sola a la versión anterior**. La versión
previa queda en `.next.prev` hasta el siguiente despliegue (rollback = un `mv`).

⚠️ **La trampa que hay que conocer:** Next graba el `distDir` DENTRO del build
(`.next/required-server-files.json`). Compilar en `.next.new` y renombrarlo a
`.next` **no basta**: arranca con *"Could not find a production build in the
'.next' directory"*. Hay que reescribir ese campo antes del swap; el script ya
lo hace. Si algún día alguien "simplifica" ese paso, tumba producción.

⚠️ El script vive **fuera del repo** (`/opt/vps-autodeploy.sh`) para que
`git reset --hard` no lo pise en caliente. La copia de referencia está en
`scripts/vps-autodeploy.sh`: **si editas una, copia la otra**. Durante meses la
del VPS fue una versión vieja de junio y la del repo describía un mecanismo que
nunca se había ejecutado (y que además estaba roto).

`npm install` solo se lanza si cambió `package-lock.json`: reescribir
`node_modules` bajo un proceso vivo también rompe peticiones.
### Datos del servidor verificados en producción (2026-08-11)
Comprobados por SSH contra la máquina viva. El repo tenía **cuatro** de estos
datos mal, y por eso se pierde tanto tiempo: la gente instala o reinicia cosas
en sitios que no existen.

| Dato | Valor real | Lo que decía el repo (mal) |
|---|---|---|
| IP del VPS | `178.105.185.125` | `178.105.176.3` — muerta, ni ping |
| Ruta de la app | `/opt/smartbc-app` | `/app/smartbc`, `/home/smartbc` |
| App de PM2 | `smartbc-portal` | `smartbc-main` — no existe |
| Puerto local | `3000` | `3137` |
| Usuario | `root` (uid 0) | — |
| SO | Ubuntu 26.04 LTS | — |

`ecosystem.config.js` y `DEPLOY.md` siguen con los valores viejos: **no te fíes
de ellos**, confirma siempre con `pm2 list`. Como el proceso corre como root,
un "permiso denegado" nunca explica que no encuentre un binario.

Acceso SSH: `root@178.105.185.125` (clave `~/.ssh/id_ed25519`). Claude Code
bloquea `ssh` por defecto; hay que autorizarlo con
`Bash(ssh root@178.105.185.125:*)` en `.claude/settings.json` o a mano. Ojo:
las reglas casan por **prefijo literal**, así que `ssh -o ConnectTimeout=15
root@…` y `ssh root@…` son dos prefijos distintos.

## Ramas
- Desarrollo: `claude/adoring-pasteur-3OgFB`
- Producción: `main`

## Email (AWS SES) — todo el correo saliente pasa por eu-west-3 (2026-08-24)
- Panel: `/admin/configuracion` → "Configuración de Email (AWS SES)"
  (`app/[country]/(admin)/admin/configuracion/email-config-client.tsx` +
  `app/api/admin/email-config/route.ts`, tabla `email_config`,
  `lib/email/send-email.ts`). **Todo** el correo saliente de la app (reset de
  contraseña, invitaciones de owner/admin/advisor/agent/cliente, correo de
  prueba del panel) pasa por aquí — ver "Un único camino de correo" abajo.
- ⚠️ **La verificación de identidades y el estado sandbox/producción de SES
  son POR REGIÓN, no de la cuenta.** Verificar `noreply@bcousinoprop.com` (o
  cualquier otra) en la consola de una región no sirve en otra. La región
  donde la cuenta tiene identidades verificadas y "Acceso a producción
  concedido" es **eu-west-3** (Europa – París) — confirmado en la consola de
  AWS el 2026-08-24. Si el campo "AWS Region" del panel queda en otra región
  (p.ej. `eu-west-1`, el default viejo del formulario antes de esta fecha),
  CUALQUIER envío falla con "Email address is not verified" aunque el
  remitente esté verificado y todo parezca correcto — no es un problema de
  credenciales ni de que falte volver a verificar nada. El default del
  formulario y del fallback por env ya apuntan a eu-west-3, pero **la fila ya
  guardada en la tabla `email_config` hay que corregirla a mano una vez**
  desde el panel (guardar no toca el valor si no lo cambiás vos).
- Con "Acceso a producción concedido" en eu-west-3, apuntando el panel ahí
  NO hace falta verificar cada destinatario (cliente, admin, etc.) uno por
  uno: en producción solo el remitente debe seguir verificado, cualquier
  destinatario funciona. Verificar el **dominio** completo
  (`bcousinoprop.com`, por DKIM) en vez de una sola dirección suelta es más
  duradero que verificar `noreply@` o una casilla personal — no caduca ni
  hay que repetirlo por cada remitente nuevo.
- ⚠️ **Un único camino de correo (2026-08-24): ya no se usa el mailer propio
  de Supabase Auth/GoTrue.** Antes, invitar un usuario (owner/admin/advisor/
  agent_* vía `/api/admin/usuarios/invite`, o un cliente vía
  `/api/admin/usuarios/create` o `createNewClient` en
  `app/(admin)/admin/clientes/actions.ts`) llamaba a
  `supabase.auth.admin.inviteUserByEmail()`, que manda el correo con el
  mailer propio de GoTrue — configurado aparte a nivel de VPS
  (`GOTRUE_SMTP_*`), sin relación con `email_config` ni con esta región. Los
  tres sitios ahora usan `createInvitedUser()`
  (`lib/email/password-reset.ts`): crean el usuario con
  `admin.createUser({ email_confirm: true, password: <temporal> })` — igual
  que el patrón de staff/cliente-sin-email de abajo, así que el acceso nunca
  depende de que el correo llegue — y mandan el enlace de "fijar contraseña"
  reutilizando `password_reset_tokens` + `/auth/reset-password` (el mismo
  camino que ya usaba el reset de contraseña) en vez del enlace nativo de
  Supabase. No hace falta página `/auth/setup` ni manejar el hash de
  Supabase: es el mismo flujo de "pon tu contraseña con este token" para
  invitación y para reset. Si el envío falla, la respuesta trae
  `tempPassword` como red de seguridad (nadie la muestra en el panel todavía
  — hoy solo queda en la respuesta JSON/logs, pendiente de UI si hace falta).
- Los usuarios de staff (owner/admin/advisor/agent_*) y los clientes creados
  desde `/admin/usuarios` o "Clientes" **ya quedan verificados sin depender
  de ningún correo**: se crean con `email_confirm: true` y contraseña
  asignada directamente (temporal para los que reciben invitación). Para
  clientes sin ni siquiera intentar el envío existe además
  `app/api/admin/clientes/create-no-email/route.ts` (ya usado desde
  Solicitudes → preparar visita y Demo Setup).
- El logo del correo es `/public/logo.png` real (misma imagen que la barra
  lateral) por URL absoluta, con su navy nativo — sin el filtro
  brightness/invert que lo pone blanco sobre el fondo oscuro de la barra
  lateral, aquí no hace falta porque el fondo del correo es claro.

### Correos de propiedades (2026-08-24) — dos flujos, uno manual y uno cron
- **"Enviar por correo" (manual):** botón junto a cada propiedad sugerida en
  la ficha del cliente (`components/admin/clientes/suggested-properties-block.tsx`
  → `offerPropertyToClient()` en
  `app/[country]/(admin)/admin/clientes/property-offer-actions.ts`). A
  propósito NO es automático al añadir a la selección: eso también pasa en
  flujos internos (p.ej. "preparar visita"), y ahí no se quiere avisar al
  cliente todavía.
- **Digest de "nuevas propiedades" (cron, opt-in por cliente):** el botón de
  campana en el mismo bloque activa/desactiva
  `client_preferences.new_listing_alerts_enabled` (migración 0155) — nunca se
  enciende solo, lo activa un asesor por cliente. `app/api/cron/property-alerts`
  reutiliza el matching de `getSuggestedProperties()` (mismo scoring que
  "Propiedades sugeridas") filtrando por `created_at` posterior a
  `new_listing_alerts_last_sent_at`, agrupa todo en un solo correo (nunca uno
  por propiedad) y trae enlace de baja de un clic sin login
  (`app/api/public/property-alerts/unsubscribe`, HMAC con
  `EMAIL_ENCRYPTION_KEY`, no expira — a diferencia de `password_reset_tokens`
  no hace falta tabla ni limpieza). Ese enlace no da de baja directamente:
  lleva a una página con dos opciones — "recibir menos seguido" (pasa
  `client_preferences.new_listing_alerts_frequency` a `weekly`, migración
  0156) o baja total. En `weekly` el cron sigue corriendo todos los días
  pero se salta al cliente hasta que pasen 7 días desde
  `new_listing_alerts_last_sent_at` — no hay un cron semanal aparte.
  ⚠️ **Igual que el cron de vídeos, el código no alcanza — hay que añadir la
  entrada al crontab del VPS a mano** (`0 9 * * * curl -s -X POST -H
  "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/property-alerts`);
  sin eso el botón de campana no hace nada visible hasta que alguien dispare
  el cron.
- Las alertas de reset/invitación NO llevan enlace de baja (no lo necesitan:
  son correos transaccionales que el propio usuario pidió al hacer clic en
  "olvidé mi contraseña" o al ser invitado, no listas de correo de las que
  darse de baja). El enlace de baja es solo para el digest de propiedades,
  que sí es contenido más cercano a marketing.
- `app/(auth)/actions.ts` tenía una SEGUNDA implementación de "olvidé mi
  contraseña" (`requestPasswordResetAction`, con
  `supabase.auth.resetPasswordForEmail()` — mailer de GoTrue) que nunca se
  usaba desde ningún componente: el link real del login va a
  `/auth/forgot-password` → `/api/auth/forgot-password` → SES. Se borró en
  2026-08-24 para que no queden dos caminos de "reset" — uno vivo por SES y
  uno muerto por GoTrue.

## Upload de archivos (Vídeos, Planos)
- **Límites en la app:** vídeos ≤500MB, planos ≤100MB
- **Almacenamiento:** bucket Supabase `properties-photos` (self-hosted en VPS)
- ⚠️ **Si uploads fallan por tamaño:** el contenedor `storage` del VPS tiene un
  límite `FILE_SIZE_LIMIT` (default ~50MB). Para aumentar:
  1. SSH al VPS → `docker-compose.yml` de Supabase
  2. Localiza el servicio `storage` y agrega/edita:
     ```yaml
     environment:
       FILE_SIZE_LIMIT: 524288000   # 500MB en bytes
     ```
  3. `docker compose up -d storage` (reinicia el contenedor)
  4. O usa YouTube/Vimeo + enlace (que ya funciona en SmartLinks)

### Distribución aproximada por IA (2026-08-25, `lib/services/properties/floorplan-sketch.ts`)
Botón "Generar distribución (IA)" junto a "Subir plano" en la ficha de cada
propiedad. **No es un plano medido** — es un dibujo esquemático (cajas por
habitación, agrupadas en "zona de día"/"zona de noche") a partir de las fotos
ya subidas + los dormitorios/baños/m² ya conocidos de la ficha.

⚠️ **Por qué no es un plano real, y por qué no se intentó que lo fuera:** de
fotos sueltas (sin 360°, LiDAR o muchas fotos superpuestas por habitación —
que es lo que este negocio tiene) no se puede recuperar ni la escala (cuántos
metros mide algo) ni la conexión entre habitaciones (qué pared comparten). No
es una limitación de la herramienta, es que esa información nunca quedó
capturada en la foto. Por eso el número de dormitorios/baños **siempre** sale
de `properties`, nunca lo cuenta la IA — la IA solo aporta juicio cualitativo
(tamaño relativo, una nota de lo que ve) para las habitaciones que YA sabemos
que existen, y nunca puede agregar ni quitar espacios de esa lista fija
(`buildRoomSlots()`). Si cita un id que no está en la lista, se ignora.
- El aviso "DISTRIBUCIÓN APROXIMADA — NO A ESCALA" va **incrustado en el
  propio PNG** (franja inferior), no en un texto aparte que se pueda perder
  al subir la imagen a Idealista u otro portal.
- Se guarda como un plano más (`property_media` `type='plan'`, mismo bucket
  `properties-photos` que `uploadPropertyPlan`) — aparece en la misma
  cuadrícula de "Planos", se puede borrar igual que cualquier otro.
- Requiere al menos una foto ya subida; si la ficha no tiene fotos, el botón
  no llama a la IA y avisa que hace falta subir alguna primero.
- Si la IA falla por algo puntual (red, proveedor caído) el dibujo se genera
  igual con tamaños por defecto ("mediano") y sin notas — solo si la IA no
  está configurada en absoluto se corta con un error, para no generar algo
  que aparente venir de las fotos sin haberlas mirado.
- La cabecera del dibujo nunca muestra el número exacto del portal —
  `sanitizeAddressForDisplay()` corta cualquier "Calle X, 23" o "Calle X 23,
  4ºB" al nombre de la calle solo. Este dibujo puede llegar a un cliente
  antes de cerrar nada; no debe delatar la dirección exacta.
- **También disponible por ficha en "Fichas guardadas" (`/admin/idealista`)**
  vía el botón "Plano IA" (`generateApproximateFloorPlanForListing()`,
  `POST /api/admin/idealista/listings/[id]/floorplan`) — para inspo y para
  fichas vinculadas a una propiedad real por igual, siempre usa las fotos y
  los dormitorios/baños/m² de la propia fila de `idealista_listings`
  (`photo_ids`, su propia galería, independiente de `property_photos`).
  ⚠️ Se guarda en `idealista_listings.plan_ids` — la galería de "Planos" del
  formulario de Idealista — **no** en `property_media`: son dos galerías de
  planos completamente separadas y no se mezclan (una es de la ficha de
  Idealista, la otra de la propiedad). Se abre en pestaña nueva al terminar.

## Vídeos automáticos de propiedad (`lib/services/video/**`)
Genera un vídeo tipo Ken Burns (zoom + paneo + transiciones) con las fotos de
la propiedad, el logo de la agencia y música de fondo.

**Requisitos en el VPS (los dos, o no funciona):**
1. ffmpeg — es el motor de render (hacen falta **ffmpeg Y ffprobe**). Sin él el
   panel avisa y la generación queda desactivada; el resto de la app funciona
   igual. ✅ **Instalado el 2026-08-11**: ffmpeg 8.0.1 en `/usr/bin/ffmpeg` y
   `/usr/bin/ffprobe`, verificado renderizando con libx264 + aac.
2. `FILE_SIZE_LIMIT` del contenedor `storage` a **500MB** (ver arriba). En
   Full HD un vídeo de 2:30 ronda los 80MB, pero en 4K se va a 250–400MB.

⚠️ **Si el panel vuelve a decir "falta ffmpeg", no adivines: pregúntale a la
app.** `GET /api/admin/video/ffmpeg-health` (owner/admin, o `Bearer
$CRON_SECRET`) devuelve el PATH real del proceso, el usuario, si corre en un
contenedor, cada ruta probada con sus permisos y un veredicto accionable. Los
tres fallos que desde el panel se ven idénticos:
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/admin/video/ffmpeg-health | jq .verdict
# a) "no está instalado"  → apt update && apt install -y ffmpeg (LEE la salida)
# b) "no puede ejecutarlo" → chmod +x
# c) "ruta no estándar"    → FFMPEG_PATH / FFPROBE_PATH en .env.local
```
La app busca los binarios en el PATH **y** en las rutas habituales
(`/usr/bin`, `/usr/local/bin`, `/snap/bin`, `/opt/ffmpeg/bin`…), así que un
PATH pobre heredado de cron/systemd ya no la rompe, y solo cachea el acierto:
instalar ffmpeg surte efecto sin reiniciar PM2.

**Cron del worker** — ⚠️ **NO está puesto en el VPS** (comprobado 2026-08-11:
0 de 5 crons). Sin él solo funciona el botón "Generar vídeo" de la ficha; no se
genera nada automáticamente. Si se quiere activar, ojo: la primera pasada
encola **todas** las propiedades sin vídeo y el render satura la CPU que
comparte con la web. Renderiza uno por pasada justo por eso:
```
*/5 * * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/property-videos
```

**Cosas que conviene saber antes de tocarlo:**
- El reparto es: **sharp encuadra, ffmpeg anima**. La foto entra entera en el
  lienzo (nunca recortada ni deformada) y el hueco se rellena con la propia
  foto ampliada y desenfocada.
- El peso se anuncia **antes** de renderizar y el techo de bitrate que recibe
  ffmpeg es el mismo con el que se calculó ese máximo, así que el fichero
  nunca lo supera. Además se ajusta solo para no pasarse del `FILE_SIZE_LIMIT`.
- El estimador **se autocalibra** con el peso real de los renders ya hechos
  (`app_settings.video_calibration`), porque el peso depende muchísimo del
  detalle de las fotos.
- La música vive en el bucket **privado** `video-music` (contenido licenciado)
  y se gestiona en `/es/admin/idealista/configuracion`.
- Ajustes en `app_settings.video_generation`; los defaults reales y su
  validación están en `lib/services/video/config.ts`.


## Partner API de Idealista — "API en tiempo real" (`lib/services/idealista/partner-api/**`)
Publicar llamando directamente a Idealista, con respuesta inmediata, en vez de
rellenar su formulario con la extensión de Chrome (que sigue ahí como respaldo).

**El contrato está vendorizado, y manda él.** Los 77 JSON Schema oficiales están
en `lib/services/idealista/partner-api/schemas/` (bajados de
`partners.idealista.com/api-reference/`, que pide login). No están de adorno:
`scripts/test-idealista-payload.mts` valida contra ellos lo que genera el mapper.
Si Idealista cambia algo, se vuelven a bajar ahí y `npm run test:idealista` dice
qué ha dejado de cuadrar.

⚠️ **No adivines nombres de campo.** Los schemas llevan
`additionalProperties: false`: un campo de más, o mal escrito, es un 400. Y no te
fíes de la prosa del spec, que en un punto contradice al schema: el **PUT de
modificación sigue exigiendo `type`** (aunque diga que la tipología no se puede
cambiar) y en cambio **no admite `code`**. Otro clásico: `windowsLocation` existe
en `flat.json` y `office.json`, pero **no** en `house.json` — mandarlo en un
chalet es un 400.

**Credenciales** (Configuración → Idealista → "API en tiempo real"): client ID,
client secret (cifrado con `EMAIL_ENCRYPTION_KEY`, como el resto) y feedKey. El
botón "Probar conexión" llama de verdad a `GET /v1/customer/publishinfo`.
Sandbox por defecto; **el sandbox de Idealista solo va de L-V, 6h-21h (Madrid)** y
cada noche lo reescriben con una copia de producción, así que las pruebas del día
anterior desaparecen.

**Reglas que impone Idealista, no nosotros:**
- Solo **segunda mano**. Una ficha marcada "Obra nueva" no se publica por API.
- Todo lo que la API permite hacer **debe** hacerse por API, no desde su área
  privada: hacerlo a mano puede acabar en bloqueo de la pasarela.
- Nada de procesos masivos por aquí (para eso está el volcado V6).
- Hay que tener guardada la relación con sus ids (anuncios, contactos e
  imágenes). Eso vive en `idealista_listings.api_property_id` y en las tablas
  `idealista_api_contacts` / `idealista_api_images` / `idealista_api_videos`
  (migración 0118). Las fotos se emparejan por el **checksum MD5** del original,
  que es lo que ellos devuelven.
- `idealista_api_log` guarda cada llamada con su cuerpo: Idealista revisa las
  peticiones antes de dar el visto bueno para producción.

**Cuotas:** 1000/min en contactos, anuncios, vídeos y tours; 5000/min en
imágenes; 100/min en publishinfo; y **una subida de fotos por minuto y anuncio**.
El cliente las frena antes de que Idealista conteste 429 (cuando salta, hay que
esperar el minuto entero). Ojo: los contadores viven en memoria del proceso, así
que asumen el PM2 de un solo proceso que tenemos.

**Probar contra el sandbox de verdad:**
```bash
IDEALISTA_CLIENT_ID=... IDEALISTA_CLIENT_SECRET=... IDEALISTA_FEED_KEY=ilc... \
IDEALISTA_CONTACT_ID=123456 npm run idealista:smoke
```
Recorre alta, consulta, modificación, alta repetida (espera un 409), find all,
fotos, clonado, baja y reactivación, y deja el anuncio de prueba dado de baja.

**Credenciales de sandbox confirmadas (2026-08-14):** el `clientId`/`clientSecret`
de `datafeed@idealista.com` tardó ~24-48h en activarse (dieron 401 los primeros
dos días). Si vuelven a dar `invalid_client`, no es necesariamente un problema
nuestro — puede ser el mismo retraso de activación.

### Reglas de negocio que NO están en ningún JSON Schema

Estas solo salen al chocar contra el sandbox de verdad — ni el texto del spec ni
`additionalProperties: false` las delatan. Confirmadas ejecutando el listado
oficial de casos de prueba de Idealista (`scripts/idealista-run-official-testcases.mts`,
53/53 en verde el 2026-08-14):

- **`windowsLocation` es obligatorio en pisos y oficinas** aunque no esté en el
  `required` de `flat.json`/`office.json`. Sin él: 400 "windows location must be
  provided". El mapper (`mapper.ts`) ya lo manda siempre.
- **`bathroomNumber: 0` con `conservation: "good"` da 400** ("bathroom number
  not valid"), aunque el schema admite 0 por rango. El mapper ahora bloquea la
  publicación pidiendo el dato real en vez de mandar un 0 que sabe que va a
  fallar.
- **`areaUsable` debe ser ESTRICTAMENTE menor que `areaConstructed`** (igual
  también lo rechaza: "usable area cannot be greater or equal..."). El mapper
  omite `areaUsable` si no se cumple, en vez de forzar un 400.
- **Solar (`type: "land"`, features `type: "urban"` o `"countrybuildable"`)
  exige DOS cosas que no están en `required`:** `accessType` en cuanto
  `roadAccess: true` ("access type must be provided when road access is
  present"), y al menos un campo `classification*` (sólo está en la
  `description` en prosa de `land.json`, no en un `anyOf` real). El mapper
  manda `accessType: "unknown"` y `classificationOther: true` por defecto.
- **Local comercial con `isATransfer: true` exige `priceTransfer` en alquiler**
  ("Price transfer mandatory for rent commercial properties") y además
  `commercialMainActivity` ("Commercial activity mandatory for transfer") — dos
  reglas independientes, no una. El CRM no tiene esta distinción en el
  formulario, así que el mapper no manda `isATransfer` (no aplica hoy).
- **`garageCapacity` acepta el enum, pero `parkingType` lo rechaza para España**
  ("parking type cannot be defined for this country") pese a estar en
  `garage.json` sin restricción por país. El mapper no lo manda.
- **Edificio (`type: "building"`) con `operation: "sale"` exige
  `propertyTenants`** (booleano) — "tenants mandatory for sale operation". Sí
  está en la `description` de ese campo, pero no en `required`/`anyOf`.
- **Habitación (`type: "room"`) con `occupiedNow: true` encadena CUATRO campos
  obligatorios uno detrás de otro**, ninguno en `required`: `tenantGender` →
  `minTenantAge`+`maxTenantAge` → `ownerLiving` → `windowView`. Solo aparecen
  al corregir el error anterior y volver a probar — no vienen todos en el mismo
  400.

El CRM hoy no publica ni `building` ni `room` ni `countryhouse` (no están en el
selector de tipo de `idealista-form.tsx`), así que esas tres tipologías sólo
importan para el listado oficial de pruebas, no para `mapper.ts`.

### El error de "falta el contacto" mentía sobre dónde arreglarlo (2026-08-24)
`mapper.ts` exige `contact_id` (ver arriba) y hasta esta fecha el mensaje decía
"Créalo o selecciónalo en Configuración → Idealista" — pero ahí **no existe
ningún UI de contactos**, solo el botón "Sincronizar contactos" (`PUT`, tira
todos los de Idealista). Y el campo real, en "Contacto e info interna" del
propio formulario, era un `<input type="text">` de solo el id numérico: había
que saberlo de memoria, no se podía crear ni elegir de una lista.

Los endpoints para eso YA EXISTÍAN sin que nada los llamara —
`GET/POST /api/admin/idealista/api/contacts` → `listLocalContacts()` /
`upsertContact()` en `reconcile.ts` — el comentario de `listLocalContacts()`
literalmente dice "para el desplegable del formulario", pero ningún
desplegable lo usaba. `idealista-form.tsx` ahora sí: un `<select>` con los
contactos ya conocidos (espejo local `idealista_api_contacts`) + "+ Crear
nuevo contacto" que llama al `POST` ya existente. El mensaje de error de
`mapper.ts` se corrigió para apuntar a la sección correcta.
⚠️ Ese `GET`/`POST` exige `role` `owner`/`admin` (`guard()` en
`app/api/admin/idealista/api/contacts/route.ts`) — un asesor/agente que use
este formulario ve el desplegable vacío (salvo el contacto ya guardado en esa
ficha, que se sigue mostrando aunque no esté en la lista) y no puede crear uno
nuevo. No se tocó ese guard: ampliarlo es una decisión de permisos aparte.

## Sugerencias de IA en "Fichas guardadas" (2026-08-25, `lib/services/idealista/ai-suggestions.ts`)
Botón "Sugerencias IA" en `/admin/idealista`, junto a la cabecera de "Fichas
guardadas". Cruza tres cosas para sugerir qué bajar de precio, qué
despublicar y qué publicar en su lugar:
- Fichas **publicadas** y cuántos días llevan sin ningún lead (o desde que se
  publicaron, si nunca tuvieron uno).
- Fichas **en cartera sin publicar** (borrador / despublicada / con error al
  publicar) — candidatas a publicar si encajan con la demanda reciente.
- **Demanda reciente**: leads del inbox de Idealista de los últimos 14 días
  matcheados a fichas propias (`idealista_leads.matched_listing_id` o
  `matched_property_id`), con la operación y el precio de la ficha a la que
  llegaron.

Es puro análisis — la IA nunca cambia el estado de ninguna ficha, solo
devuelve texto para que el equipo decida a mano con los controles que ya
existen (`IdealistaStateSelector`, etc.).

⚠️ **El proveedor de IA es el mismo de Configuración → IA** (Idealista →
Configuración), no uno nuevo. Se recomendó `openrouter` con
`deepseek/deepseek-v4-flash-latest` (barato — del orden de $0.035/$0.10 por
millón de tokens prompt/completion en agosto 2026 — y con contexto de sobra
para esto). Como el campo "Modelo de texto" del panel arranca vacío y antes
no había fallback para proveedores compatibles con OpenAI (solo Anthropic
tenía uno), `resolveConfig()` en `lib/services/ai/chat.ts` ahora cae a ese
modelo cuando el proveedor es `openrouter` y no hay modelo guardado — si se
quiere otro, basta con escribirlo en el panel, sigue teniendo prioridad.

No hay tabla nueva: cada clic en "Sugerencias IA" dispara un análisis fresco
(`POST /api/admin/idealista/ai-suggestions`, permiso `properties`/`edit`,
igual que "Generar descripción" o "Analizar fotos"). El modal cachea el
resultado en memoria del componente — reabrir el modal no vuelve a gastar IA,
solo el botón "Regenerar" lo hace.

⚠️ **Las cifras de cada sugerencia (leads, días desde el último) nunca salen
del texto de la IA.** El modelo solo elige QUÉ ficha señalar — devuelve una
"key" (la misma referencia que se le mostró) — y por qué, en una frase
corta; `generateListingSuggestions()` resuelve esa key contra los datos ya
calculados en `gatherSignals()` y adjunta los números reales. Si la IA cita
una key que no existe (inventada o mal copiada), esa sugerencia se descarta
en vez de mostrarse con datos inventados. Cada tarjeta tiene un botón "Abrir
ficha" que llama a `onNavigate(listingId)` — en `idealista-client.tsx` eso
es `openListingEditor()`, el mismo camino que el botón Editar de cada fila
(`setEditingInspoId` o `setSelectedPropertyId` según si es inspo), así que
lleva directo al editor de esa ficha en vez de dejar que el equipo la
busque en la lista. No se usan etiquetas de "prioridad" (alta/media/baja):
el primer intento las tenía y no aportaban nada accionable frente a ver
directamente cuántos leads tiene la ficha y hace cuántos días fue el
último.

### El mismo análisis, como saludo en el Dashboard (`dashboard-greeting.ts`)
El Dashboard (`/{country}/admin`, solo España) muestra una tarjeta "Hola
{nombre}, ..." con un párrafo corto generado por IA — mismos datos que
"Sugerencias IA" (`gatherSignals()` en `ai-suggestions.ts`, compartido por
las dos funciones) pero condensados por `generateDashboardGreeting()` en
prosa: leads de hoy + como mucho una recomendación sobre una ficha.

- El texto generado por la IA **nunca incluye el saludo ni el nombre** — el
  `<Hola {firstName}, >` lo antepone `dashboard-greeting-card.tsx` en código,
  no la IA. Motivo: el resultado se cachea en `app_settings`
  (`idealista.dashboard_greeting`) **compartido por todo el equipo** durante
  3h, para no disparar una llamada a la IA en cada carga del Dashboard —
  si el nombre fuera parte del texto cacheado, todo el mundo vería el
  saludo de quien lo generó primero.
- Va dentro de un `<Suspense>` (`DashboardGreetingSkeleton` de fallback):
  en caché fría la generación tarda unos segundos, y no debe bloquear el
  resto del Dashboard (KPIs, últimas propiedades/solicitudes) mientras
  responde.
- Si la IA falla y no hay nada cacheado todavía, la tarjeta simplemente no
  se muestra — es un extra, nunca un bloqueante. Si falla pero había una
  versión vieja cacheada, se sigue mostrando esa en vez de nada.
- Solo `country === "es"`: el análisis depende de `idealista_listings` /
  `idealista_leads`, que no existen para Chile.
## WhatsApp / Zinto — tres capas, y sólo una se usa (auditado 2026-09-13)

Conviven **tres** integraciones con Zinto y es fácil tocar la que no es:

1. **Legacy WhatsApp** (`lib/services/zinto/**`, migraciones 0091–0100). Espeja
   conversaciones y mensajes en tablas propias. Credencial en `zinto_config`.
   En producción: 61 conversaciones, 49 mensajes — **48 enviados, 1 recibido**,
   el último el 2026-08-12. `zinto_webhook_deliveries` y `zinto_leads` están
   **vacías**: el Flujo de mensajes entrantes del panel de Zinto (paso 5 de
   `docs/ZINTO_ACTIVACION.md`) nunca llegó a configurarse.
2. **Integration API** (`lib/services/zinto-integration/**`, migraciones
   0119–0120 y 0163). El contrato completo y bien construido. Se ejecutó
   **exactamente una vez**: 728 llamadas el 2026-08-15 entre las 02:51 y las
   02:53, el backfill inicial.
3. **El iframe** (`zinto-inbox-embed.tsx`, pestaña «Zinto» de `/admin/mensajes`).
   **Esto es lo que el equipo usa a diario.** No es integración, es una ventana:
   nada de lo que pasa dentro toca la base de datos del CRM.

### Las trampas (todas costaron tiempo de verdad)

⚠️ **El prefijo `/_integration-api` está MUERTO.** Devuelve **200 con el HTML de
la SPA** para cualquier ruta — incluidas `/health`, `/ready` y un `/me` sin
autenticar, que en una API viva serían 401 JSON. La superficie entera responde
hoy en `https://crm.zinto.app/api/v1`. Y falla de la peor manera: 200+HTML →
revienta `response.json()` → se clasifica como fallo de red → 3 reintentos →
*"Network error"*. `client.ts` ahora lo detecta por `content-type` y lanza
`not_json_response` con el nombre real del problema, sin reintentar.

⚠️ **Una credencial, un sitio: `zinto_config`.** Hasta 2026-09-13 el cliente
legacy leía la clave de la BD y el nuevo **sólo** de `process.env.ZINTO_API_KEY`.
Por eso "Probar Conexión" decía que todo iba bien mientras la capa nueva llevaba
cuatro semanas muerta: **cada botón probaba una credencial distinta**. Ahora
`resolveZintoIntegrationConfig()` (`server-config.ts`) lee la BD y **la BD gana
sobre el entorno**. Las variables de entorno son sólo respaldo y para los
scripts CLI. Si añades un camino nuevo, úsalo — no vuelvas a leer `process.env`.

⚠️ **El doble `/api/v1`.** `zinto_config.base_url` vale
`https://crm.zinto.app/api/v1` porque el cliente legacy concatena `/messages/send`
encima. El cliente de integración compone rutas completas (`/api/v1/contacts`),
así que necesita la base **sin** ese sufijo. Sin normalizar sale
`/api/v1/api/v1/contacts`, un 404 que parece que Zinto haya retirado el endpoint.
Lo resuelve `normalizeIntegrationBaseUrl()`, con test propio en
`npm run test:zinto-integration`.

⚠️ **El sobre de error no es el documentado.** `/api/v1` devuelve
`{"error":"API_KEY_NOT_FOUND","message":"..."}` (plano), no
`{"error":{code,message,request_id}}`. Leer sólo `parsed.error.code` degradaba
**todos** los errores a `internal_error`, y con ello se rompían
`isTransientError()` y el trato especial del 504 `delivery_timeout`.
`parseZintoErrorBody()` acepta las dos formas. **Sigue sin confirmarse con Zinto
si `/api/v1` es el mismo contrato o el antiguo con las mismas rutas.**

⚠️ **Son DOS secretos de webhook distintos.** `zinto_config.webhook_secret_*`
firma los webhooks legacy de estado de entrega;
`integration_webhook_secret_*` es el `whsec_` que devuelve **una sola vez**
`POST /api/v1/webhooks`. No fusionarlos. El botón "Registrar webhook" del panel
lo crea y lo cifra en el mismo paso justo para que no se pierda por el camino.

⚠️ **El cron de reconciliación NO se activa solo** — misma historia que las
alertas de propiedades y los vídeos. Hay que añadirlo a mano al crontab del VPS:
```
30 3 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/zinto-sync
```

⚠️ **Hay columnas en `zinto_config` de producción que NO crea ninguna migración.**
Descubiertas el 2026-09-13 y **ya rellenas a mano**: `api_key_v2_*`,
`webhook_secret_v2_*`, `base_url_v2` = `https://crm.zinto.app/api/v2`,
`enabled_v2 = true` e `integration_id` = `2276cdd0-9c00-47c0-9613-470c6cabdee8`.
Ningún código del repo las lee. Y **`/api/v2` está vivo**: su `/health`
devuelve `{"status":"ok","version":"v2"}` y expone la misma superficie que
`/api/v1` (contacts, deals, tasks, flows, erp… todos 401 sin auth).

Es decir: hay **dos generaciones de la API vivas** y **tres sitios** donde
puede haber una clave. `resolveZintoIntegrationConfig()` deliberadamente **NO**
usa las columnas `_v2` — cambiar a dónde apunta producción por inferencia sobre
columnas que puso otra persona es justo el tipo de cambio silencioso que causó
esta avería. Lo que sí hace el diagnóstico es **probar cada credencial contra
cada versión** y decir cuál autentica (`credentialMatrix` en la respuesta del
health check, y un desplegable en el panel). Decide con ese dato, no de memoria.

La migración `0163` añade columnas `integration_*` propias, distintas de las
`_v2`. No se borran las `_v2`: hasta saber quién las puso y para qué, tocarlas
es arriesgado.

### No adivines: pregúntale a la app

`GET /api/admin/zinto/health` (owner/admin, o `Bearer $CRON_SECRET`) separa las
seis causas que desde el panel se ven idénticas — sin credencial, credencial del
entorno en vez del panel, URL que no es la API, clave revocada, scopes que
faltan, webhook sin registrar — y dice qué tocar en cada caso:
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/admin/zinto/health | jq .verdict
```
El mismo diagnóstico se ve en `/admin/configuracion` → "Estado de la
integración". **"Probar Conexión" sólo mira la capa legacy**; no lo uses para
concluir que la integración funciona.

## Solicitudes / Sales Inbox — venta·alquiler y cobertura

**⚠️ La vista `lead_inbox_facts` está definida ENTERA en CUATRO migraciones:
0142, 0159, 0160 y 0161. Solo vale la ÚLTIMA.** Cada una la reescribe con
`CREATE OR REPLACE VIEW` añadiendo columnas al final, que es lo único que
Postgres permite sin un `DROP … CASCADE` (que se llevaría los permisos).

El despliegue automático no sufre por eso: `scripts/apply-migrations.sh` lleva
una tabla `schema_migrations` y **solo aplica ficheros nuevos**. Pero
`scripts/post-deploy.sh` —lo que corre el botón de `/admin/configuracion`—
**relanza TODAS las migraciones en orden**, y ahí las tres viejas fallan con
*"cannot drop columns from view"*. No rompe nada (la última en aplicarse es la
buena), pero el botón sale con errores que **son normales** y hay que saberlo.
Si añades columnas, hazlo en una migración NUEVA y al final de la lista.

**La operación de un lead se DERIVA, no se guarda.** `idealista_leads` no tiene
columna de operación porque el inbox de Idealista no la da. Orden de
precedencia, en `lead_price_operation()` (SQL, migración 0161) y
`deriveOperationFromPrice()` (`lib/sales-inbox/derive.ts`), vigilado por
`npm run test:sales-inbox`:

1. El **precio de la tarjeta** (`"2.400 €/mes"` vs `"450.000 €"`) — es lo que el
   contacto miró, y lo único que traen los leads sin ficha, que son mayoría.
   Medido contra producción: resuelve 432 de 460 leads él solo.
2. `idealista_listings.operation` **solo si vale `'sale'`**: `'rent'` ahí es el
   `DEFAULT` de la 0059 sin backfill, o sea "nadie lo dijo".
3. `properties.operation`, salvo que sea dual (`operations @> {sale,rent}`).

Valores: `sale | rent | mixed | NULL`. `mixed` es un hilo que pregunta por las
dos cosas y entra en los dos filtros; `NULL` ("sin determinar") es un estado de
primera clase y tiene su propio botón.

**Dos columnas de emparejamiento, y hay que mirar LAS DOS.** `matched_property_id`
(ficha propia) y `matched_listing_id` (anuncio de Idealista sin fila en
`properties` — las "inspo", que aquí son la mayoría). Mirar solo la primera es
lo que hacía que la bandeja diera por huérfanos a **202** leads cuando de verdad
lo eran **102**.

**¿Está llegando todo?** `npm run idealista:cobertura` (solo lee) y la sección
"Cobertura de contactos" de `/es/admin/idealista`. La extensión ahora cuenta las
conversaciones que el CRM **confirmó**, no las que visitó —antes sumaba igual
aunque el envío fallara— y guarda el parte de cada recorrido en
`idealista_capture_runs` (migración 0162).

### Lo que sabemos del hueco de venta (medido 2026-09-06)
Los leads de venta quedan huérfanos al 28% frente al 16% de alquiler. **No** es
por fichas con la operación mal marcada ni por propiedades duales: de las dos
cosas hay CERO. Son dos casos concretos:
- 9 leads de *«Calle de Jorge Juan, Goya» a 530.000 €* y la ficha **BC-1493** es
  esa calle pero a **2.000.000 €** — o es otro piso, o el precio está mal.
- 1 lead de *«El Monte… Torrelodones» a 1.000.000 €* y **BC-1344** cuesta
  exactamente eso, pero su dirección cargada es *«Calle Encina 14»*: el anuncio
  se identifica por la urbanización y la ficha por la calle, así que no hay un
  token en común y el emparejamiento no puede verlo.

De fondo: 26 fichas de alquiler preparadas frente a 10 de venta.

## Enlaces de portales en la ficha del cliente (`lib/portal-links/**`)
El paso que faltaba **antes** de la selección: el piso que se ve con el cliente
en Idealista todavía no es ficha nuestra, así que no cabe en
`client_property_selections` (que exige un `property_id` real). El flujo entero:

```
se marca en el portal → llega a la ficha → se llama → o se descarta
  → o se crea la ficha → entra en la selección → itinerario → colección privada
```

Migración **0135**: `client_portal_links` (el anuncio) y
`client_portal_link_notes` (el registro de llamadas, que es un HILO — quien
llama después necesita leer lo que dijo el anterior, no pisarlo).

**Cosas que conviene saber antes de tocarlo:**
- **La deduplicación es la promesa del módulo.** `url_key` es la URL
  normalizada (sin `www.`, sin barra final, sin parámetros de tracking) y, si
  el portal lleva la referencia del anuncio en la ruta, es directamente
  `host#referencia`. Gracias a eso se puede recorrer un listado entero
  reenviando páginas sin sembrar duplicados. Está cubierto por
  `npm run test:portal-links` — si tocas `parsePortalUrl`, ejecútalo.
- **`rating` y `status` son cosas distintas y no deben fusionarse.** `rating`
  (0-5) es cuánto le gusta AL CLIENTE; `status` es cómo va la llamada. Un piso
  puede gustarle 5 y estar descartado porque no aceptan 11 meses.
- **El orden lo fija `position`** (enteros de 100 en 100, como `viewing_stops`).
  Al arrastrar, el panel manda la lista COMPLETA de ids ya ordenada y la función
  `reorder_client_portal_links` reescribe todas las posiciones en una ida y
  vuelta: no existe el caso borde de "no queda hueco entre dos vecinos". Esa
  función filtra por `client_id`, así que una lista de ids manipulada no puede
  mover enlaces de otra ficha. Los anuncios nuevos entran al final de la cola.
- **Las flechas ▲▼ de cada fila no son un adorno:** el arrastre nativo de HTML5
  no existe en táctil, y la ficha se usa desde tablet.
- **`status = 'converted'` NO se elige en un desplegable.** El CHECK
  `cpl_converted_requires_property` impide que exista sin ficha vinculada; solo
  lo escribe `linkPropertyToPortalLink()`, que además mete la propiedad en la
  selección del cliente. Si alguien "simplifica" ese CHECK, el estado empieza a
  mentir.
- **No hay recurso de permisos nuevo:** usa `viewing_collections`, porque es la
  fase previa del mismo trabajo. Efecto colateral querido: si se apaga el flag
  del módulo de colecciones, el panel de enlaces desaparece con él.
- **Sin superficie pública.** El cliente nunca ve estos enlaces ni las notas
  internas: no hay proyección a `/v/[token]` ni RLS para anon.
- **Crear la ficha reutiliza el importador por enlace**
  (`/admin/propiedades/importar?url=…&linkId=…&clienteId=…`): previsualiza
  solo, y al confirmar vincula la propiedad al enlace y vuelve a la ficha del
  cliente. Si el vínculo falla, la propiedad YA está creada — se avisa en vez
  de deshacer una importación buena.

### La valoración del cliente (migraciones 0137-0138)
`client_property_selections` guarda DOS opiniones sobre la misma propiedad y no
deben fusionarse nunca:

| columnas | quién |
|---|---|
| `rating` / `position` | el AGENTE: su nota y su orden de trabajo |
| `client_rating` / `client_rank` / `client_feedback_at` | EL CLIENTE, desde `/v/[token]` |

Cuando el cliente puntúa un piso con 2, lo que hay que ver en la ficha es "yo le
puse 5 y a él no le gusta", no un número del que ya no se sabe de quién es. En
el panel la fila del cliente solo aparece si ha contestado: cinco estrellas
vacías se leerían como "no le gusta".

⚠️ **Es la única escritura de todo el esquema que llega sin sesión.** Está
encerrada en `record_collection_feedback()`, y las barreras son deliberadas:
- Se entra por el **token**, nunca por un id de selección. La proyección pública
  **no expone un solo UUID** (`scripts/test-viewing-collections-projection.mts`
  lo vigila), así que el navegador nombra la residencia por su **puesto**
  (1..N) y el servidor lo traduce con `compareStopsByDay` — el MISMO comparador
  que las numeró. Si alguien ordena distinto en los dos sitios, el cliente
  valora el piso de al lado.
- La función revalida token ↔ parada dentro de la BD y solo toca las tres
  columnas `client_*`. Token revocado, caducado, inventado, parada de otra
  colección o nota fuera de rango → devuelve 0 sin escribir (verificado contra
  Postgres 16).
- La ruta responde **204 tanto si vale como si no**: distinguir "no existe" de
  "no es tuyo" ya es información. Freno de 20 valoraciones por minuto y token.
- ⚠️ La función se redefinió en **0138** con `p_rating integer` en vez de
  `smallint`: PostgREST castea desde JSON y `smallint` es el tipo que más
  fricción da. El `DROP` explícito de la firma vieja NO es opcional — con las
  dos, PostgREST no sabe cuál llamar.

**Extensión de Chrome** (`chrome-extension/portal-links.js`): pone un **＋** en
cada anuncio de Idealista / Fotocasa / Habitaclia / pisos.com y una barra para
mandar los marcados a la ficha de un cliente con el compañero que los va a
llamar ya asignado. Usa el **mismo token** que los leads del inbox. Rutas:
`POST /api/extension/portal-links` y `GET /api/extension/clients` (Bearer +
CORS por lista explícita de orígenes — nunca `*`: estas rutas escriben en la
ficha de un cliente).

⚠️ La extracción del listado (título, precio, m²…) va anclada a **URLs y regex
de texto, nunca a clases CSS**. Si un portal cambia su maquetación el campo
llega vacío pero **el enlace se envía igual**, que es lo único imprescindible
para llamar. No "arregles" eso metiendo selectores CSS: duran semanas.

## Idioma del scraping y de los enlaces temporales de `particulares` (2026-09-07)
El CRM entero es en español, así que la ficha scrapeada de un particular
(`/admin/particulares`) y su enlace temporal (`/a/[token]`) también deben
serlo por defecto — el selector de idioma de `/a/[token]`
(`app/a/[token]/language-select.tsx`, Google Translate) sigue ahí para que el
destinatario cambie de idioma si quiere, pero el estado inicial debe ser
español.

Dos causas distintas para el mismo síntoma (una ficha apareciendo en inglés),
y dos arreglos distintos:
- **Las etiquetas que genera el propio portal** (planta, orientación, "with
  lift", "Listing updated on…") las decide Idealista según la geo de la IP
  saliente cuando no se manda `Accept-Language` — con el proxy residencial
  rotativo eso es una lotería, así que la MISMA ficha podía salir en español
  o en inglés según qué IP tocara ese scrape. Arreglado en la fuente: el
  fetch con UA de WhatsApp en `lib/sync/import-by-link/fetch-html.ts` (el que
  usa casi siempre — ver comentario "Intento 0") y el de los listados de
  búsqueda en `app/api/cron/particulares/scrape/route.ts` ahora mandan
  `Accept-Language: es-ES,es;q=0.9`. Esto es válido para fichas nuevas; una ya
  guardada en inglés se corrige sola en el siguiente re-scrape (el cron
  actualiza `features`/`description` de los activos en cada pasada).
- **La descripción libre**, la escribe el propio anunciante en el idioma que
  eligió (frecuente en zonas como Salamanca/Recoletos, donde muchos
  particulares redactan en inglés para inquilinos internacionales) — eso no
  lo arregla ninguna cabecera. Por eso `sanitizeParticularDescriptionForSharing`
  (`lib/services/particulares/sanitize-description.ts`) ahora TRADUCE a
  español además de limpiar contacto/"sin agencias" (hasta esta fecha
  preservaba el idioma original a propósito). Las características
  (`features`) del enlace temporal se traducen igual, con
  `translateParticularFeaturesForSharing` — nueva porque antes no se tocaban
  en absoluto camino al enlace. Ambas se calculan UNA VEZ al crear el enlace
  (`createParticularShareLink`) y se persisten en
  `particulares_share_links.sanitized_description` / `sanitized_features`
  (migraciones 0157/0163); los enlaces creados antes de existir la columna se
  traducen al vuelo en la primera visita (`sanitizeIfMissing`) igual que ya
  hacía la descripción. Sin IA configurada o si la traducción de
  características falla o desalinea el número de elementos, se sirven tal
  cual — nunca se bloquea la creación del enlace ni se arriesga un dato
  inventado o descolocado.

⚠️ **No confundir con la "Ficha técnica" del modal de `/admin/particulares`**
(precio/m², planta, año, estado, orientación, energía — migración 0158): esas
columnas las rellena "el scraper de la ficha por fuera" (fuera de este repo,
según el propio comentario de la migración), así que el fix de
`Accept-Language` de arriba no las toca. Traducirlas requeriría tocar ese
proceso externo, no este código.

## Zinto — TRES integraciones distintas en el repo, no confundir (2026-09-12)

Antes de tocar nada de Zinto, mirar cuál de las tres es:

| | Base URL | Módulo | Estado |
|---|---|---|---|
| v1 (WhatsApp + leads/campañas) | `crm.zinto.app/api/v1` | `lib/services/zinto/**` | **En producción hoy** — `/admin/mensajes` manda/recibe de verdad por acá |
| Integration API (piloto CRM completo: contactos/deals/pipelines/tareas) | `crm.zinto.app/_integration-api` | `lib/services/zinto-integration/**` | Apagado (`ZINTO_INTEGRATION_API_ENABLED`), sin key de producción — no confundir con v2 |
| v2 (bidireccional oficial, reemplaza el "Flujo" manual de v1) | `crm.zinto.app/api/v2` | `lib/services/zinto-v2/**` | Apagado (`enabled_v2` en `zinto_config`) — en construcción, guía completa en `docs/ZINTO_SETUP.md` sección 9 |

v2 exige un header extra que v1 no tiene (`X-Zinto-Integration-Id`, el id de
la integración creada en Zinto — no la API Key) y espera el teléfono en E.164
**con** `+` (v1 lo espera sin `+`). Mientras `enabled_v2` esté en `false`,
todo el WhatsApp real sigue por v1 sin cambios.
