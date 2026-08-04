# Cron de Particulares (Scraper)

El scraper de particulares se ejecuta **cada hora** desde el VPS, no desde Vercel.

## Qué hace (3 pasos encadenados, en este orden)

`scripts/cron-particulares.sh` llama a 3 endpoints seguidos. Un fallo en uno
no aborta el script — así que un corte de Idealista no impide que pisos.com
y el cross-match sigan corriendo:

1. **`particulares/scrape`** (Idealista) — scrapea Idealista Madrid,
   detecta nuevos anuncios, bajas (404) y reactivaciones, trackea cambios
   (precio, retirada, etc.) y preserva todos los datos aunque el anuncio se
   retire. Intenta extraer el teléfono peleando contra DataDome (proxy
   residencial Evomi + CapSolver cuando hace falta) — puede fallar según el
   estado del proxy/pool.
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
Actions (mismo valor que usa el cron del VPS). Se corta solo si el saldo de
CapSolver cae debajo del mínimo configurado, para no fundirlo en un barrido
masivo.

## Coste

- Proxy residencial: Evomi (ver `/admin/configuracion` → Proxy configuration).
- CapSolver solo se gasta cuando Idealista devuelve un slider resoluble
  (`t=fe`) — un bloqueo duro (`t=bv`) corta sin gastar saldo.
- pisos.com no necesita proxy residencial ni CapSolver (sin DataDome).

## Alternativas

Si prefieres ejecutar cada X minutos en lugar de cada hora, cambiar el cron:

- `*/30 * * * *` = cada 30 minutos
- `*/15 * * * *` = cada 15 minutos
- `*/5 * * * *` = cada 5 minutos

Pero ten en cuenta que aumenta el consumo de proxy/CapSolver.
