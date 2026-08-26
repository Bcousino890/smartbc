# Ingesta del scraper de Idealista · API v1

Documento para el **desarrollador del scraper**. Describe cómo enviar a SmartBC
los anuncios de Idealista que captures, cómo leer la configuración de
frecuencias y cómo reportar que sigues vivo.

- **URL base**: `https://portal.bcousinoprop.com`
- **Especificación OpenAPI 3.1**: `GET /api/v1/openapi` (importable en Postman,
  Insomnia o cualquier generador de clientes)
- **Formato**: JSON en UTF-8
- **Modo**: **PUSH** — tú envías, nosotros no vamos a buscar nada

> **Reparto de responsabilidades.** Tú te encargas de recorrer Idealista:
> zonas, subzonas, paginación, troceado de búsquedas, DataDome, proxies,
> selectores y extracción. Nosotros solo recibimos, validamos, deduplicamos y
> almacenamos. Ninguna decisión de scraping se toma en este lado.

---

## 1. Autenticación

Cabecera `Authorization` con la clave que te entregue el equipo de SmartBC:

```
Authorization: Bearer sbc_live_a1b2c3d4_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

La clave lleva los permisos `idealista:write` (enviar) e `idealista:read`
(consultar). Es secreta y personal de esta integración: solo en tu backend,
nunca en un repositorio, un log, una URL ni un ticket. Se puede revocar y rotar
desde nuestro panel en cualquier momento; si eso ocurre recibirás `401`.

Prueba de humo antes de cualquier otra cosa:

```bash
curl -s https://portal.bcousinoprop.com/api/v1/ping \
  -H "Authorization: Bearer $SMARTBC_API_KEY"
```

---

## 2. Concepto clave: `idealista_id`

Cada anuncio se identifica por **`idealista_id`**, el id del anuncio en
idealista.com. Es el único campo obligatorio.

- Primera vez que lo mandas → **se crea** (`201`, `action: "created"`).
- Vuelves a mandarlo con datos nuevos → **se actualiza** (`200`, `action: "updated"`).
- Lo mandas sin cambios → no se escribe nada (`200`, `action: "unchanged"`).

**Nunca se duplica.** No necesitas llevar el control de qué anuncios ya nos has
enviado ni guardar identificadores nuestros.

`unchanged` es el caso mayoritario de un refresco de mercado y es muy barato
para los dos lados: se calcula un hash de la ficha y, si coincide, no se toca
nada, no se genera historial y no se emiten eventos.

---

## 3. La regla más importante: ausente ≠ `null`

| Lo que envías | Qué hacemos |
|---|---|
| El campo **no aparece** en el JSON | **No se toca.** Se conserva lo que hubiera |
| El campo aparece con valor | Se actualiza |
| El campo aparece como `null` | Se **borra** |

Esto es lo que permite mandar envíos parciales sin miedo. Si en un barrido
rápido de listado solo capturas precio y posición, manda solo eso: la
descripción, las fotos y el teléfono que ya teníamos siguen ahí.

Vale igual para las colecciones (`photos`, `phones`, `additional_links`):

- `photos` ausente → la galería no se toca.
- `photos: []` → se vacía la galería.
- `photos: [ … ]` → se reconcilia (entran las nuevas, salen las que ya no están).

**Los teléfonos nunca se borran**: un número que deja de aparecer se marca
`is_active: false`, pero se conserva. Es el dato más caro de conseguir de toda
la ficha.

---

## 4. Fotos: manda la URL que sea, nosotros la arreglamos

Idealista sirve la **misma foto con y sin marca de agua** según el perfil de
tamaño que lleve la URL. Nosotros reescribimos toda URL del CDN al perfil que
viene limpio antes de guardarla.

```
Mandas:    …/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/1234.jpg
Guardamos: …/blur/WEB_DETAIL_TOP-L-L/0/id.pro.es.image.master/aa/bb/1234.jpg
```

**No hace falta que hagas nada**: manda la URL tal cual la leas —del listado,
del detalle, de un thumbnail— y nosotros la normalizamos. Lo importante es que
mandes la URL **original del CDN de Idealista**, sin proxies intermedios ni
reescrituras propias, porque si la tocas dejamos de reconocerla y se guarda tal
cual (probablemente con marca de agua).

Planos, vídeos y tours van en la misma colección `photos` con su `kind`:

```json
{ "url": "…", "kind": "floorplan" }
```

Valores: `photo` (por defecto), `floorplan`, `video`, `tour`, `other`.

---

## 5. Enviar un anuncio

`POST /api/v1/idealista/listings`

```bash
curl -s -X POST https://portal.bcousinoprop.com/api/v1/idealista/listings \
  -H "Authorization: Bearer $SMARTBC_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: run-2026-08-15-000123" \
  -d '{
    "idealista_id": "108234567",
    "listing_url": "https://www.idealista.com/inmueble/108234567/",
    "title": "Piso en venta en calle de Fuencarral",
    "operation": "sale",
    "property_type": "flat",
    "status": "active",

    "current_price": 485000,
    "currency": "eur",
    "price_per_m2": 5764,
    "community_fees": 95,

    "description": "Piso exterior reformado en pleno Malasaña…",

    "constructed_m2": 84,
    "usable_m2": 78,
    "bedrooms": 2,
    "bathrooms": 2,
    "floor": "3",
    "total_floors": 5,
    "is_exterior": true,
    "has_elevator": true,
    "property_condition": "buen estado",
    "construction_year": 1955,
    "has_air_conditioning": true,
    "has_terrace": false,
    "orientation": "sur",

    "energy_certificate": "E",
    "energy_consumption": 198.5,
    "energy_consumption_rating": "E",

    "street": "Calle de Fuencarral",
    "neighborhood": "Universidad",
    "district": "Centro",
    "municipality": "Madrid",
    "province": "Madrid",
    "postal_code": "28004",
    "latitude": 40.4265,
    "longitude": -3.7016,
    "location_precision": "street",

    "advertiser_type": "particular",
    "advertiser_name": "Carmen",
    "advertiser_profile_url": "https://www.idealista.com/pro/…",

    "is_promoted": false,
    "source_update_text": "Actualizado el 12 de agosto",
    "source_updated_at": "2026-08-12T00:00:00Z",

    "features_raw": ["Ascensor", "Aire acondicionado", "Trastero"],
    "badges_raw": ["Bajada de precio"],

    "photos": [
      { "url": "https://img3.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/1.jpg", "order_index": 0, "is_main": true },
      { "url": "https://img3.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/2.jpg", "order_index": 1 },
      { "url": "https://img3.idealista.com/blur/WEB_LISTING/0/id.pro.es.image.master/aa/bb/p.jpg", "kind": "floorplan" }
    ],

    "phones": [
      { "phone": "612 34 56 78", "source": "detail_modal", "phone_status": "available" }
    ],

    "additional_links": [
      { "url": "https://ejemplo.es/piso", "label": "Web del anunciante" }
    ],

    "observations": [
      {
        "external_shard_id": "madrid-centro-sale-300k-500k",
        "page_number": 2,
        "position_in_page": 7,
        "absolute_position": 37,
        "price_observed": 485000,
        "advertiser_type_observed": "particular"
      }
    ],

    "run_id": "run-2026-08-15-000123"
  }'
```

Respuesta:

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
      "phones": { "added": 1, "updated": 0 },
      "links": { "added": 1 },
      "observations": { "added": 1 }
    },
    "warnings": [],
    "dry_run": false
  },
  "request_id": "req_9f2c1a…"
}
```

### Anuncio mínimo

Todo salvo `idealista_id` es opcional. Esto es un envío válido:

```json
{ "idealista_id": "108234567", "current_price": 470000 }
```

---

## 6. Lotes

`POST /api/v1/idealista/listings/batch` — hasta **200** anuncios por llamada.

```json
{
  "listings": [
    { "idealista_id": "108234567", "current_price": 470000 },
    { "idealista_id": "108234568", "status": "missing" }
  ]
}
```

Responde **siempre `200`**. Cada elemento trae su propio resultado o su propio
error con el índice, de modo que un anuncio mal formado **no** tumba el resto:

```json
{
  "data": [
    { "index": 0, "ok": true, "idealista_id": "108234567", "action": "updated", "events_created": ["PRICE_DOWN"] },
    { "index": 1, "ok": false, "idealista_id": "108234568",
      "error": { "code": "validation_error", "message": "El elemento no cumple el contrato",
                 "details": [{ "field": "operation", "message": "Invalid input" }] } }
  ],
  "meta": { "summary": { "received": 2, "created": 0, "updated": 1, "unchanged": 0, "failed": 1 } }
}
```

Es deliberado y tiene una razón operativa: si el lote entero fallara, el dato
sucio seguiría en tu origen y el mismo lote volvería a fallar en cada
sincronización, dejándote bloqueado indefinidamente.

---

## 7. Estados: activo, desaparecido, retirado

```json
{ "idealista_id": "108234567", "status": "missing" }
```

| Valor | Significado |
|---|---|
| `active` | El anuncio sigue publicado |
| `missing` | No aparece en la búsqueda donde estaba, sin confirmar |
| `off_market` | Confirmado que ya no está publicado |
| `reactivated` | Ha vuelto tras estar `missing`/`off_market` |

Notas:

- `reactivated` es una **transición**, no un estado. Lo guardamos como
  `active` y anotamos `reactivated_at`, además de limpiar `missing_since`.
- **No convertimos `missing` en `off_market` por nuestra cuenta.** Esa decisión
  es tuya: tú sabes cuántas veces lo has comprobado. Los plazos que debes
  respetar están en `missing_verification_delay_hours` y
  `off_market_confirmation_delay_hours` de la configuración.
- `missing_since` y `off_market_at` se rellenan solos con la fecha en que nos
  enteramos, si no los mandas.

---

## 8. Configuración de frecuencias

`GET /api/v1/idealista/config`

**No hardcodees ningún tiempo.** Todos salen de aquí y se editan desde nuestro
panel, así que ajustarlos no requiere que despliegues nada.

```json
{
  "data": {
    "version": 4,
    "scraping_enabled": true,
    "discovery_interval_minutes": 5,
    "full_market_sweep_interval_hours": 24,

    "sale_0_14_days_refresh_hours": 48,
    "sale_15_30_days_refresh_hours": 72,
    "sale_31_90_days_refresh_hours": 168,
    "sale_over_90_days_refresh_hours": 336,

    "rent_0_7_days_refresh_hours": 24,
    "rent_8_30_days_refresh_hours": 48,
    "rent_over_30_days_refresh_hours": 168,

    "private_first_72h_refresh_hours": 6,
    "private_day_3_7_refresh_hours": 24,

    "missing_verification_delay_hours": 24,
    "off_market_confirmation_delay_hours": 72,

    "monthly_request_budget": 250000,
    "monthly_request_reserve": 50000,
    "max_batch_size": 200,
    "max_concurrency": 4,
    "requests_per_minute": 60,

    "heartbeat_stale_minutes": 30,
    "notes": null,
    "updated_at": "2026-08-15T10:00:00Z"
  }
}
```

Dos reglas:

1. **`version` sube en cada cambio.** Compara ese entero y relee solo si ha
   subido; no hace falta diffear campo a campo.
2. **`scraping_enabled: false` es una parada.** En cuanto lo veas, deja de
   scrapear. Es nuestro interruptor de emergencia.

---

## 9. Heartbeat

`POST /api/v1/idealista/heartbeat`

```json
{
  "worker_id": "idealista-main",
  "status": "running",
  "timestamp": "2026-08-15T10:32:00Z",
  "current_run_type": "discovery",
  "current_run_id": "run-2026-08-15-000123",
  "current_shard": "madrid-centro-sale-300k-500k",
  "requests_used_month": 84120,
  "message": "opcional"
}
```

`status`: `running` · `idle` · `error` · `stopped`.

Mándalo cada pocos minutos. Si dejamos de recibirlo durante más de
`heartbeat_stale_minutes`, el panel marca el scraper como **sin señal** —
independientemente de lo que dijera el último heartbeat.

Es lo que convierte "no llegan anuncios" en un diagnóstico: sin heartbeat no
podemos distinguir "el scraper está caído" de "el scraper funciona pero hoy no
hay anuncios nuevos".

**La respuesta trae la configuración**, así que el heartbeat te vale también
como sondeo:

```json
{
  "data": {
    "success": true,
    "worker_id": "idealista-main",
    "received_at": "2026-08-15T10:32:01Z",
    "config_version": 4,
    "scraping_enabled": true
  }
}
```

---

## 10. Ejecuciones (runs)

`POST /api/v1/idealista/runs`

Un solo endpoint para abrir, actualizar y cerrar. El upsert va por
`external_run_id`, así que mandar el mismo id dos veces actualiza el mismo run.
No hay endpoints separados de start/finish a propósito: con uno solo, un
reintento tras un timeout no puede duplicar el run ni dejar uno huérfano.

**Al abrir:**

```json
{
  "external_run_id": "run-2026-08-15-000123",
  "run_type": "discovery",
  "status": "running",
  "worker_id": "idealista-main",
  "started_at": "2026-08-15T10:00:00Z"
}
```

**Al cerrar:**

```json
{
  "external_run_id": "run-2026-08-15-000123",
  "run_type": "discovery",
  "status": "completed",
  "finished_at": "2026-08-15T10:28:00Z",

  "listings_seen": 4210,
  "listings_sent": 3980,
  "new_listings": 112,
  "updated_listings": 640,
  "unchanged_listings": 3228,
  "missing_listings": 18,
  "errors_count": 3,
  "requests_used": 5120,
  "pages_scraped": 142,

  "shards_total": 48,
  "shards_success": 46,
  "shards_failed": 2,
  "reported_results": 4400,
  "unique_listing_ids_found": 4210,
  "coverage_percentage": 95.7,
  "error_summary": "2 shards con 403 tras 3 reintentos",

  "shards": [
    {
      "external_shard_id": "madrid-centro-sale-300k-500k",
      "operation": "sale",
      "city": "Madrid",
      "area": "Centro",
      "price_min": 300000,
      "price_max": 500000,
      "search_url": "https://www.idealista.com/venta-viviendas/madrid/centro/…",
      "reported_results": 940,
      "pages_expected": 32,
      "pages_found": 32,
      "status": "ok",
      "last_success_at": "2026-08-15T10:12:00Z"
    }
  ]
}
```

`run_type`: `discovery` · `full_market` · `detail_refresh` · `verification`
`status`: `running` · `completed` · `partial` · `failed` · `stopped`

Todos los contadores son opcionales; manda los que tengas. Los shards también:
si los reportas, el panel enseña la cobertura real y qué trozos fallaron.

Puedes correlacionar los anuncios con su run mandando `run_id` en cada listing
con el mismo `external_run_id`.

---

## 11. Consultar lo que ya tenemos

`GET /api/v1/idealista/listings`

Te ahorra llevar tu propio espejo de nuestro estado.

| Parámetro | Para qué |
|---|---|
| `status` | `active` · `missing` · `off_market` |
| `advertiser_type` | `particular` · `professional` · `unknown` |
| `updated_since` | Reconciliación incremental |
| `stale_hours` | **Cola de refresco**: los que no se miran en detalle desde hace N horas |
| `limit`, `cursor` | Paginación (cursor opaco, máx. 200) |

```bash
curl -s "https://portal.bcousinoprop.com/api/v1/idealista/listings?status=active&stale_hours=48&limit=200" \
  -H "Authorization: Bearer $SMARTBC_API_KEY"
```

Pasa `meta.next_cursor` en `?cursor=` hasta que `has_more` sea `false`. No
interpretes ni construyas el cursor: es opaco a propósito.

---

## 12. Idempotencia

Añade `Idempotency-Key` en cualquier escritura:

```
Idempotency-Key: run-2026-08-15-000123-batch-07
```

- Misma clave + mismo cuerpo → se devuelve la **respuesta original** sin volver
  a escribir (cabecera `X-Idempotent-Replay: true`).
- Misma clave + cuerpo distinto → `409 conflict`.

Sirve para reintentar tras un timeout sin miedo a duplicar. Las claves se
conservan 24 horas.

Aun sin esta cabecera la ingesta es idempotente por diseño (`idealista_id` +
hash de contenido), pero con ella te ahorras incluso el trabajo de recalcular.

---

## 13. Modo simulación (dry-run)

Cabecera `X-SmartBC-Dry-Run: 1` (o `?dry_run=true`). Valida el payload y
devuelve **qué habría pasado**, sin escribir nada.

```bash
curl -s -X POST https://portal.bcousinoprop.com/api/v1/idealista/listings \
  -H "Authorization: Bearer $SMARTBC_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-SmartBC-Dry-Run: 1" \
  -d '{ "idealista_id": "108234567", "current_price": 470000 }'
```

**Empieza aquí.** Es la forma recomendada de integrar: itera en dry-run hasta
que las respuestas no traigan `warnings`, y solo entonces quita la cabecera.

---

## 14. Cambios que detectamos solos

No tienes que decirnos qué ha cambiado: lo calculamos comparando con lo último
que nos mandaste. Cada cambio real queda registrado como evento:

| Evento | Cuándo |
|---|---|
| `NEW_LISTING` | Primera vez que vemos el anuncio |
| `PRICE_DOWN` / `PRICE_UP` | Cambia `current_price` |
| `DESCRIPTION_CHANGED` | Cambia la descripción |
| `PHOTOS_CHANGED` | Cambia la galería |
| `FEATURES_CHANGED` | Cambian las características |
| `ADVERTISER_CHANGED` | Cambia el anunciante (p. ej. particular → agencia) |
| `PHONE_CHANGED` | Cambia el teléfono |
| `ADDITIONAL_LINK_CHANGED` | Cambian los enlaces |
| `BADGES_CHANGED` | Cambian los distintivos |
| `PROMOTED` / `PROMOTION_REMOVED` | Empieza o deja de estar destacado |
| `MISSING` / `OFF_MARKET` / `REACTIVATED` | Cambia el estado |

La respuesta te devuelve los emitidos en `events_created`. Reenviar el mismo
payload **no** genera eventos repetidos.

---

## 15. Errores

```json
{
  "error": {
    "code": "validation_error",
    "message": "El cuerpo de la petición no es válido",
    "details": [{ "field": "photos.0.url", "message": "Invalid url" }],
    "request_id": "req_9f2c1a…"
  }
}
```

| Código | HTTP | Cuándo | ¿Reintentar? |
|---|---|---|---|
| `validation_error` | 400 | Payload inválido; `details` da el campo exacto | No |
| `unauthorized` | 401 | Clave ausente, inválida, revocada o caducada | No |
| `forbidden` | 403 | La clave no tiene `idealista:write` | No |
| `not_found` | 404 | No existe ese anuncio | No |
| `conflict` | 409 | Idempotency-Key reutilizada con otro cuerpo | No |
| `rate_limited` | 429 | Superado el límite; respeta `Retry-After` | Sí, con espera |
| `payload_too_large` | 413 | Cuerpo > 2 MB; parte el lote | No |
| `service_unavailable` | 503 | Despliegue en curso | Sí, en unos minutos |
| `internal_error` | 500 | Error nuestro | Sí, con backoff |

> Un campo desconocido produce `validation_error`, **no se ignora en silencio**.
> Es deliberado: así una errata en un nombre de campo se detecta el primer día y
> no meses después, cuando ya se han perdido datos.

**Guarda siempre el `request_id`**: con él localizamos tu petición exacta (con
su cuerpo) en nuestro panel de integraciones.

---

## 16. Límites

| Límite | Valor |
|---|---|
| Peticiones por minuto | 120 por defecto (por clave; ajustable) |
| Tamaño del cuerpo | 2 MB |
| Anuncios por lote | 200 |
| Fotos por anuncio | 100 |
| Teléfonos por anuncio | 20 |
| Enlaces por anuncio | 30 |
| Observaciones por envío | 20 |
| Shards por run | 500 |

Cada respuesta trae `X-RateLimit-Limit`, `X-RateLimit-Remaining` y
`X-RateLimit-Reset`.

---

## 17. Integración recomendada

1. **Prueba `GET /api/v1/ping`.** Si responde 200, la clave y la conectividad
   están bien y cualquier fallo posterior es del payload.
2. **Lee `GET /api/v1/idealista/config`** y guarda `version`.
3. **Manda un anuncio en dry-run** e itera hasta que no haya `warnings`.
4. **Abre un run**, envía en lotes de 200, cierra el run con los contadores.
5. **Heartbeat cada pocos minutos**, siempre, tanto si hay trabajo como si no.
6. **Reintenta con espera exponencial** en 429, 503 y 500. Nunca en 400, 401,
   403 ni 409.
7. **Manda solo lo que has capturado.** No rellenes campos con `null` "para
   completar": ausente es lo correcto cuando no lo has mirado.

---

## Changelog

### v1.0.0 — 2026-08-15
- Primera versión: ingesta de anuncios (individual y por lotes), fotos con
  normalización automática al perfil sin marca de agua, teléfonos, enlaces,
  observaciones de búsqueda, estados, eventos automáticos, snapshots,
  configuración remota, heartbeat, runs y shards.
