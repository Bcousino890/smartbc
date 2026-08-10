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
- Deploy: push a `main` → VPS hace `git pull && npm run build && pm2 restart`
  (cron cada ~5 min).
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

