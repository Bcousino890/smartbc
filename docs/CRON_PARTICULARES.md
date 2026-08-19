# Cron de Particulares (Scraper)

El scraper de particulares se ejecuta **cada hora** desde el VPS, no desde Vercel.

> ⚠️ **Lo que corre de verdad en el VPS es `/opt/smartbc-particulares.sh`**, no
> este script del repo (el crontab apunta ahí, y el fichero vive fuera del repo
> para que el autodeploy no lo pise con `git reset --hard`). Hasta el
> 2026-08-16 esa copia sólo lanzaba el paso 1, así que **el cross-match nunca
> se llegó a ejecutar en producción** pese a estar documentado aquí desde hacía
> meses. Si editas uno de los dos ficheros, copia el otro.

## Qué hace (4 pasos encadenados, en este orden)

`scripts/cron-particulares.sh` llama a los endpoints seguidos. Un fallo en uno
no aborta el script — así que un corte de Idealista no impide que Fotocasa
y el cross-match sigan corriendo:

1. **`particulares/scrape`** (Idealista) — scrapea Idealista Madrid,
   detecta nuevos anuncios, bajas (404) y reactivaciones, trackea cambios
   (precio, retirada, etc.) y preserva todos los datos aunque el anuncio se
   retire. Intenta extraer el teléfono peleando contra DataDome (proxy
   residencial Evomi) — puede fallar según el estado del proxy/pool.
2. **`particulares/scrape-pisos`** (pisos.com) — misma lógica de scrape,
   pero pisos.com expone el teléfono directo en el HTML sin DataDome, así
   que es mucho más fiable para conseguir teléfonos.
3. **`particulares/cross-match-phones`** — copia los teléfonos recién
   scrapeados de pisos.com a los anuncios de Idealista sin teléfono que son
   (con alta confianza: mismo precio/habitaciones/m²/zona, o misma
   dirección con número) la misma propiedad física. **Debe ir después**
   de `scrape-pisos` — primero se pueblan los teléfonos de pisos.com, luego
   se cruzan. No toca DataDome — es la vía que rellena teléfonos de forma
   fiable mientras el pool residencial esté baneado (`t=bv`).

## Zonas de Fotocasa

Fotocasa no se scrapea "todo Madrid" de una vez: la búsqueda global no deja
paginar hasta el final, así que la ciudad entera nunca llega a recorrerse. Se va
**zona por zona**, y así cada búsqueda cabe dentro de la paginación y sí se cubre
al 100%.

Las zonas activas se eligen en el panel (**Particulares → "Zonas a scrapear en
Fotocasa"**) y se guardan en `app_settings.scraping.fotocasaZones`. Por defecto
son las cinco del área prime: Barrio de Salamanca, Justicia-Chueca, Ibiza,
Almagro y El Viso. Se puede marcar un distrito entero o barrios sueltos (Goya,
Recoletos…); al marcar el distrito, sus barrios se descartan solos para no
recorrer dos veces lo mismo.

⚠️ **Los slugs de Fotocasa no son deducibles del nombre del barrio** —
`salamanca`, `justicia` e `ibiza` dan 404; los buenos son `barrio-de-salamanca`,
`justicia-chueca` e `ibiza-de-madrid`. Por eso el catálogo
(`lib/sync/particulares/fotocasa-zones.ts`) está volcado del propio buscador y no
escrito a mano.

**Dos modos, por lo que cuesta el proxy:**

| | cuándo | páginas por zona | coste aprox. |
|---|---|---|---|
| Incremental | cada pasada del cron | 3 (`FOTOCASA_MAX_PAGES`) | ~30 MB/día |
| Barrido completo | 06:30, una vez al día | 40 (`?toPage=40`) | ~135 MB/pasada |

El incremental basta para las novedades porque el listado va ordenado por fecha
de publicación. Hacer el barrido completo en cada pasada serían ~18 GB de proxy
al mes.

Para un barrido puntual de zonas concretas:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/particulares/scrape-fotocasa?zones=goya,recoletos&toPage=40"
```

## Configuración

### 1. En el VPS, agregar a crontab:

```bash
sudo crontab -e
```

Agregar esta línea (ejecuta cada hora a los :00 minutos):

```cron
0 * * * * API_URL=http://localhost:3000 CRON_SECRET=<tu_cron_secret> /home/smartbc/scripts/cron-particulares.sh >> /var/log/smartbc-particulares.log 2>&1
```

### 2. Reemplazar `<tu_cron_secret>`

Obtén el valor de `CRON_SECRET` desde tu archivo `.env` del VPS:

```bash
grep CRON_SECRET /home/smartbc/.env
```

### 3. Crear directorio de logs (opcional pero recomendado)

```bash
sudo touch /var/log/smartbc-particulares.log
sudo chown www-data:www-data /var/log/smartbc-particulares.log
```

### 4. Hacer el script ejecutable

```bash
chmod +x /home/smartbc/scripts/cron-particulares.sh
```

## Verificación

Ver los logs de ejecución:

```bash
tail -f /var/log/smartbc-particulares.log
```

## Barrido manual de teléfonos por distrito

Además del cron horario, existe el workflow de GitHub Actions "Sweep
missing phones (particulares)" (`.github/workflows/sweep-missing-phones.yml`)
para priorizar un distrito concreto en vez de esperar el barrido general.
Requiere el secret `CRON_SECRET` en Settings → Secrets and variables →
Actions (mismo valor que usa el cron del VPS). Se corta solo cuando el propio
endpoint indica que se ha detenido (campo `stopped`) o al llegar al tope de
tandas.

## Coste

- Proxy residencial: Evomi (ver `/admin/configuracion` → Proxy configuration).
- Ya NO se usa ningún resolvedor de CAPTCHA (CapSolver eliminado): ante un
  reto de DataDome el flujo de Idealista se rinde y se tira de las fuentes
  alternativas.
- pisos.com no necesita proxy residencial (sin DataDome).

## Alternativas

Si prefieres ejecutar cada X minutos en lugar de cada hora, cambiar el cron:

- `*/30 * * * *` = cada 30 minutos
- `*/15 * * * *` = cada 15 minutos
- `*/5 * * * *` = cada 5 minutos

Pero ten en cuenta que aumenta el consumo de proxy.
