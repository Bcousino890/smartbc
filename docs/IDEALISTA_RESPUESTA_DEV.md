# Respuesta lista para enviar al desarrollador del scraper

> Copiar desde aquí. Sustituir `<CLAVE>` por la clave que se genere en
> `/es/admin/integraciones` (ver al final cómo).

---

Te paso todo lo que necesitas. No hace falta que definas tú el JSON: ya tenemos
el endpoint montado con su contrato, y está documentado.

**Modo: PUSH.** Tú envías, nosotros no vamos a buscar nada.

**Endpoint principal**
```
POST https://portal.bcousinoprop.com/api/v1/idealista/listings
```

**Lotes** (recomendado para volumen, hasta 200 anuncios por llamada)
```
POST https://portal.bcousinoprop.com/api/v1/idealista/listings/batch
```

**Autenticación**
```
Authorization: Bearer <CLAVE>
Content-Type: application/json
```
Es una API key nuestra, con permisos solo para esta integración. La podemos
rotar o revocar sin que toques código. Guárdala solo en tu backend.

**Identificador único**: `idealista_id` (el id del anuncio en idealista.com).
Reenviar el mismo anuncio lo actualiza; nunca se duplica. No necesitas llevar
control de qué nos has mandado ya ni guardar ids nuestros.

**Formato**: está en el documento adjunto (`IDEALISTA_INGEST_API.md`), y la
especificación OpenAPI 3.1 completa la tienes en:
```
GET https://portal.bcousinoprop.com/api/v1/openapi
```
La puedes importar en Postman/Insomnia o generar tu cliente directamente desde
ahí, sin adivinar nombres de campos.

**Configuración de frecuencias** (no hardcodees ningún tiempo)
```
GET https://portal.bcousinoprop.com/api/v1/idealista/config
```
Ahí están los intervalos de descubrimiento, los refrescos por antigüedad y
operación, los plazos de verificación y el presupuesto mensual de peticiones.
Los ajustamos desde nuestro panel y tú los aplicas en tu siguiente consulta —
así cambiar una frecuencia no te obliga a desplegar. El campo `version` sube en
cada cambio: compara ese entero y relee solo si ha subido. Y si ves
`scraping_enabled: false`, para: es nuestro interruptor de emergencia.

**Heartbeat** (mándalo cada pocos minutos, siempre)
```
POST https://portal.bcousinoprop.com/api/v1/idealista/heartbeat
{ "worker_id": "idealista-main", "status": "running", "current_run_type": "discovery" }
```
Si dejamos de recibirlo, nuestro panel marca el scraper como caído. Es lo que
nos permite distinguir "está roto" de "funciona pero hoy no hay nada nuevo". La
respuesta te devuelve la configuración, así que te vale también como sondeo.

**Ejecuciones**
```
POST https://portal.bcousinoprop.com/api/v1/idealista/runs
```
Un solo endpoint para abrir y cerrar: el upsert va por `external_run_id`, así
que mandas el mismo id con `status: "running"` al empezar y con
`status: "completed"` + contadores al terminar. Si reportas shards, vemos la
cobertura real y qué trozos fallaron.

**Consultar lo que ya tenemos** (te ahorra llevar tu propio espejo)
```
GET /api/v1/idealista/listings?status=active&stale_hours=48&limit=200
```
`stale_hours` te da directamente la cola de lo que toca volver a mirar.

---

### Cuatro cosas del contrato que conviene leer antes de escribir código

1. **Ausente ≠ `null`.** Un campo que no mandas no se toca; un campo a `null` se
   borra. Así puedes mandar envíos parciales sin miedo: si en un barrido de
   listado solo capturas precio y posición, manda solo eso y la descripción, las
   fotos y el teléfono que ya teníamos siguen ahí.

2. **Las fotos las arreglamos nosotros.** Idealista sirve la misma foto con y
   sin marca de agua según el perfil de tamaño de la URL. Mándanos la URL tal
   cual la leas —del listado, del detalle, de un thumbnail— y nosotros la
   reescribimos al perfil que viene limpio. Lo único importante: mándanos la URL
   **original del CDN de Idealista**, sin proxies ni reescrituras tuyas, porque
   si la tocas dejamos de reconocerla.

3. **`missing` no se convierte solo en `off_market`.** Esa decisión es tuya: tú
   sabes cuántas veces lo has comprobado. Los plazos que debes respetar están en
   la configuración (`missing_verification_delay_hours` y
   `off_market_confirmation_delay_hours`).

4. **El batch nunca falla entero.** Responde siempre 200 con el resultado o el
   error de cada elemento y su índice. Un anuncio mal formado no tumba los otros
   199 — así un dato sucio en tu origen no te deja bloqueado sincronización tras
   sincronización.

### Empieza en dry-run

Añade la cabecera `X-SmartBC-Dry-Run: 1` y validamos el payload devolviéndote
qué habría pasado, **sin escribir nada**. Itera así hasta que las respuestas no
traigan `warnings`, y solo entonces quítala.

Prueba de humo antes de nada, para confirmar que la clave funciona:
```bash
curl -s https://portal.bcousinoprop.com/api/v1/ping \
  -H "Authorization: Bearer <CLAVE>"
```

### Respuesta que vas a recibir

```json
{
  "data": {
    "success": true,
    "idealista_id": "108234567",
    "action": "created",
    "internal_id": "6f0b…",
    "events_created": ["NEW_LISTING"],
    "sections": {
      "photos": { "added": 3, "removed": 0, "kept": 0 },
      "phones": { "added": 1, "updated": 0 }
    },
    "warnings": []
  },
  "request_id": "req_9f2c1a…"
}
```

`action` puede ser `created`, `updated` o `unchanged`. **Guarda siempre el
`request_id`**: con él localizamos tu petición exacta si algo va mal.

No tienes que decirnos qué ha cambiado en un anuncio: lo detectamos nosotros
comparando con lo último que nos mandaste (bajadas de precio, cambio de
anunciante de particular a agencia, fotos nuevas, etc.).

### Errores

| Código | Qué hacer |
|---|---|
| 400 `validation_error` | Corregir; `details` dice el campo exacto |
| 401 / 403 | Revisar la clave y sus permisos |
| 409 `conflict` | Idempotency-Key reutilizada con otro cuerpo |
| 429 `rate_limited` | Reintentar respetando `Retry-After` |
| 413 | Cuerpo > 2 MB, parte el lote |
| 503 | Despliegue en curso, reintenta en unos minutos |
| 500 | Error nuestro, reintenta con backoff y pásanos el `request_id` |

Ojo: un campo desconocido da `validation_error`, no se ignora en silencio. Es
a propósito, para que una errata en un nombre de campo se vea el primer día.

**Límites**: 120 peticiones/min, 2 MB por cuerpo, 200 anuncios por lote, 100
fotos por anuncio.

Cuando tengas el primer anuncio entrando en dry-run, avísame y lo revisamos
juntos antes de abrir el grifo.

---
---

## Notas internas (NO enviar al desarrollador)

### Cómo generar la clave

1. Entrar en `https://portal.bcousinoprop.com/es/admin/integraciones`.
2. Crear un cliente API nuevo:
   - **Nombre**: `Scraper Idealista` (o el nombre del proveedor)
   - **País**: `es`
   - **Usuario que firma**: el que deba constar como autor de lo que entre
3. Generar una clave con los permisos **`idealista:read`** e
   **`idealista:write`** — y **solo** esos. No le des `captaciones:*`: son los
   datos de Chile y no tiene nada que hacer ahí.
4. La clave en claro **se enseña una sola vez**. Copiarla y mandársela por un
   canal seguro (no por email en claro, no por WhatsApp).

Si se pierde: generar otra y revocar la anterior. No hay forma de recuperarla,
en la base de datos solo queda su hash.

### Dónde se vigila

`https://portal.bcousinoprop.com/es/admin/particulares/scraper`

- **Arriba**: estado (funcionando / sin señal / con errores / detenido), último
  heartbeat, último anuncio recibido, última ejecución, cuota del mes.
- **Abajo**: las frecuencias editables que el scraper lee por API.

Si el proveedor dice que está enviando y ahí no se mueve nada, el `request_id`
de sus llamadas aparece en `/es/admin/integraciones` con el cuerpo exacto que
mandó.
