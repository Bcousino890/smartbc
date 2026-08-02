# Prompt para Claude — Integración con la API de SmartBC

> **Cómo usar este documento**: pégalo entero como primer mensaje en una sesión de
> Claude (Claude Code, Claude.ai o la API) dentro del sistema del proveedor. Es
> autosuficiente: contiene todo el contrato, no hace falta ningún otro fichero.
> Solo hay que rellenar los tres datos del bloque «Datos de tu entorno».

---

## Datos de tu entorno (rellenar antes de empezar)

```
SMARTBC_BASE_URL = https://portal.bcousinoprop.com
SMARTBC_API_KEY  = <la clave sbc_live_… que te entregó Benjamín Cousiño Propiedades>
SISTEMA_ORIGEN   = <nombre y tipo de tu sistema: ERP, CRM, base de datos, scraper…>
```

---

# Instrucciones

Eres un ingeniero de integraciones. Tu tarea es construir, dentro de
`SISTEMA_ORIGEN`, un **sincronizador que envíe captaciones inmobiliarias a
SmartBC** (el CRM de Benjamín Cousiño Propiedades, Chile) usando su API pública
v1, documentada íntegramente más abajo.

## Objetivo de negocio

Hoy el equipo de SmartBC copia estas captaciones **a mano**. Cuando cambia un
precio o se añade una foto en el sistema de origen, nadie se entera. Tu
integración debe eliminar por completo ese trabajo manual: las captaciones se
dan de alta solas y **se mantienen actualizadas solas**.

## Qué tienes que construir

1. Un **cliente HTTP** de la API de SmartBC con autenticación, reintentos e
   idempotencia.
2. Un **mapeador** del modelo de datos de `SISTEMA_ORIGEN` al contrato de
   SmartBC (definido abajo, campo a campo).
3. Un **sincronizador** que detecte altas y cambios y los empuje, en lotes.
4. Una **tabla o log de sincronización** en el sistema de origen que registre,
   por captación, el `external_id` enviado, el `request_id` devuelto, la acción
   (`created` / `updated` / `unchanged`) y el último error si lo hubo.

## Antes de escribir código

1. Comprueba las credenciales con `GET /api/v1/ping`. Si no responde `200`, para
   y reporta: no tiene sentido seguir.
2. Descarga `GET /api/v1/openapi` — es la especificación OpenAPI 3.1 completa,
   generada desde el propio servidor. Úsala para generar tipos o el cliente.
3. Descarga los catálogos (`GET /api/v1/catalogos?tipo=…`) y **construye el
   mapeo contra ellos**, no contra valores inventados.
4. Enséñame el mapeo de campos propuesto (columna de origen → campo de SmartBC)
   **antes** de implementarlo. Si hay campos de origen que no encajan en ningún
   campo del contrato, dilo explícitamente en vez de forzarlos.

## Reglas de implementación (no negociables)

- **`external_id` es la clave de todo.** Usa el identificador estable y único de
  la captación en `SISTEMA_ORIGEN`. Nunca uses un valor que pueda cambiar (ni un
  índice de fila, ni un hash del contenido, ni la URL). Si cambia, SmartBC creará
  un duplicado.
- **Empieza siempre en modo simulación.** Todo el desarrollo se hace con la
  cabecera `X-SmartBC-Dry-Run: 1` hasta que ninguna respuesta traiga `warnings`.
- **`Idempotency-Key` en toda escritura automática.** Un timeout de red no puede
  provocar una captación duplicada.
- **Manda solo lo que cambia.** No reenvíes la ficha completa para corregir un
  precio: `PATCH` con el campo basta. Reenviar todo cada noche funciona, pero
  desperdicia ancho de banda y descargas de fotos.
- **Reintenta con espera exponencial** en `429`, `503` y `500`. **Nunca**
  reintentes en `400`, `401`, `403` ni `409`: son errores tuyos y reintentarlos
  no los arregla.
- **Respeta `Retry-After`** cuando llegue un `429`.
- **Registra el `request_id` de cada respuesta.** Es lo que permite al equipo de
  SmartBC encontrar tu petición exacta en su panel cuando algo no cuadre.
- **Un campo desconocido es un error, no un aviso.** El contrato es estricto a
  propósito: si te devuelve `validation_error` señalando un campo, es que lo has
  escrito mal. Arréglalo, no lo ignores.

## Lo que NO debes hacer

- **No intentes sobrescribir los datos del equipo de SmartBC.** Teléfono del
  propietario, dirección real, notas, etapa y asignación son suyos: si una
  captadora consigue el teléfono real, tu sincronización no puede borrarlo. La
  API los protege sola, pero no intentes forzarlo con `options` salvo que te lo
  pidan expresamente.
- **No inventes valores de enumeración.** Si el tipo de propiedad de tu sistema
  no encaja en la lista cerrada, usa `other` y déjalo anotado en `metadata`.
- **No mandes texto libre en región y comuna.** Normaliza contra el catálogo.
- **No hagas polling agresivo.** El límite es 120 peticiones/minuto. Sincroniza
  por lotes de 100 y programa la sincronización, no la dispares en bucle.
- **No guardes la clave de API en el repositorio.** Va en variable de entorno.

## Criterios de aceptación

La integración está terminada cuando, con datos reales:

1. `GET /api/v1/ping` responde `200`.
2. Una captación nueva del origen aparece en SmartBC con `action: "created"` y
   con **todas** sus secciones: ficha, ubicación, propietario y contactos,
   avisos de corredoras, fotos e intentos.
3. Reenviarla sin cambios devuelve `action: "unchanged"` (no escribe nada).
4. Cambiar un precio en el origen produce `action: "updated"` y
   `changed_fields: ["price"]` — solo ese campo.
5. Repetir una petición con la misma `Idempotency-Key` no crea un duplicado.
6. Un lote de 100 con un elemento inválido procesa los 99 buenos y reporta el
   malo, sin abortar.
7. El log de sincronización del origen refleja fielmente lo ocurrido.

---

---

# Referencia de la API de SmartBC v1

## 1. Autenticación

```
Authorization: Bearer sbc_live_a1b2c3d4_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

La clave es secreta, revocable en cualquier momento y no se puede recuperar (si
se pierde, se emite otra). Todas las peticiones van sobre HTTPS con JSON UTF-8.

Prueba:

```bash
curl -s $SMARTBC_BASE_URL/api/v1/ping -H "Authorization: Bearer $SMARTBC_API_KEY"
```

```json
{
  "data": {
    "ok": true,
    "client": { "name": "Tu integración", "slug": "tu-integracion", "country": "cl" },
    "scopes": ["captaciones:read", "captaciones:write", "catalogos:read"],
    "rate_limit_per_minute": 120,
    "server_time": "2026-07-31T18:20:00.000Z",
    "api_version": "v1"
  },
  "request_id": "req_9f2c1a…"
}
```

## 2. Modelo mental

Una **captación** es una propiedad en prospección. Su ficha en SmartBC tiene seis
secciones, y la API las cubre todas:

| Sección | Campo del contrato | Qué es |
|---|---|---|
| Ficha | campos raíz | datos del anuncio: precio, superficie, tipo, características |
| Ubicación | campos raíz | región, comuna, zona, dirección, coordenadas, rol SII |
| Datos del dueño | `owner` + `contacts[]` | propietario y sus contactos (cónyuge, familiares…) |
| Corredoras | `listings[]` | la misma propiedad publicada por otras corredoras + histórico de precios |
| Fotos | `photos` | galería |
| Intentos | `attempts[]` | historial de contacto con el propietario |

**Identidad**: `external_id` (tu id). Primera vez → se crea. Siguientes veces →
se actualiza la misma. Nunca se duplica.

## 3. Endpoint principal

### `POST /api/v1/captaciones`

Crea o actualiza una captación completa. `201` si la crea, `200` si la actualiza.

**Cabeceras opcionales**
- `Idempotency-Key: <clave única de la petición>`
- `X-SmartBC-Dry-Run: 1` → valida y devuelve qué pasaría, sin escribir

**Cuerpo — ejemplo exhaustivo con todos los campos:**

```json
{
  "external_id": "MI-REF-001",

  "title": "Casa mediterránea en Las Condes",
  "description": "Casa de 4 dormitorios con jardín y piscina…",
  "operation": "venta",
  "price": 450000000,
  "currency": "clp",
  "bedrooms": 4,
  "bathrooms": 3,
  "square_meters": 320,
  "useful_square_meters": 265,
  "property_type": "house",
  "features": ["Piscina", "Bodega", "2 estacionamientos"],
  "source_url": "https://mi-portal.cl/aviso/123",
  "source_site": "mi-portal",
  "cover_photo_url": "https://cdn.mi-portal.cl/123/portada.jpg",
  "broker_name": "Corredora Ejemplo",
  "external_reference": "EB-VX1848",
  "portal_publication_number": "3914632576",
  "published_ago": "Publicado hace 2 meses",

  "region": "Metropolitana",
  "commune": "Las Condes",
  "zone": "El Golf",
  "subzone": "Nueva Costanera",
  "address_scraped": "Av. Apoquindo 1234",
  "address_real": null,
  "address_verified": false,
  "latitude": -33.4089,
  "longitude": -70.5673,
  "rol_propiedad": "1234-56",

  "owner": {
    "name": "María Pérez",
    "phone": "+56912345678",
    "contact": "Prefiere WhatsApp por la tarde",
    "confirmed": false
  },
  "notes": "Vende por traslado",
  "revision_notes": null,
  "next_action_at": "2026-08-04T15:00:00Z",
  "next_action_note": "Volver a llamar",

  "contacts": [
    {
      "external_id": "CT-1",
      "contact_type": "owner",
      "contact_name": "María Pérez",
      "phone": "+56912345678",
      "email": "maria@ejemplo.cl",
      "has_whatsapp": true,
      "relationship": null,
      "rut": "12.345.678-9",
      "photo_url": "https://cdn.mi-sistema.cl/foto-contacto?id=13387802&size=240",
      "extra_phones": [
        { "phone": "+56987654321", "has_whatsapp": false, "label": "Oficina" }
      ]
    },
    {
      "external_id": "CT-2",
      "contact_type": "spouse",
      "contact_name": "Juan Soto",
      "phone": "+56911112222",
      "relationship": "Cónyuge"
    }
  ],

  "photos": {
    "mode": "sync",
    "items": [
      { "url": "https://cdn.mi-portal.cl/123/1.jpg", "position": 0 },
      { "url": "https://cdn.mi-portal.cl/123/2.jpg", "position": 1 }
    ]
  },

  "listings": [
    {
      "external_id": "AV-1",
      "source_url": "https://portalinmobiliario.com/MLC-999",
      "source_site": "portalinmobiliario",
      "broker_name": "Corredora X",
      "external_reference": "CX-4412",
      "title": "Casa en Las Condes",
      "description": "…",
      "price": 460000000,
      "currency": "clp",
      "bedrooms": 4,
      "bathrooms": 3,
      "square_meters": 320,
      "useful_square_meters": 265,
      "region": "Metropolitana",
      "commune": "Las Condes",
      "zone": "El Golf",
      "address_scraped": "Av. Apoquindo 1234",
      "latitude": -33.4089,
      "longitude": -70.5673,
      "cover_photo_url": "https://cdn.corredorax.cl/1.jpg",
      "photo_urls": ["https://cdn.corredorax.cl/1.jpg"],
      "features": ["Piscina"],
      "operation": "venta",
      "portal_publication_number": "3914632576",
      "published_ago": "Publicado hace 2 meses",
      "broker_website_url": "https://corredorax.cl/propiedad/4412",
      "broker_price": 455000000,
      "broker_currency": "clp",
      "broker_scraped_at": "2026-07-31T12:00:00Z",
      "broker_scrape_error": null,
      "scrape_status": "scraped",
      "scrape_error": null
    }
  ],

  "attempts": [
    {
      "external_id": "AT-1",
      "attempt_type": "call",
      "result": "no_answer",
      "owner_phone": "+56912345678",
      "owner_name": "María Pérez",
      "owner_contact": null,
      "address_real": null,
      "notes": "No contesta, reintentar el viernes",
      "photo_url": null,
      "next_action_at": "2026-08-04T15:00:00Z",
      "next_action_note": "Volver a llamar"
    }
  ],

  "pipeline": "Captaciones",
  "stage": "contacting",
  "assigned_to_email": "agente@bcousinoprop.com",

  "options": { "overwrite_manual_fields": false, "force_fields": [] },
  "metadata": { "origen": "erp", "id_interno": 4412 }
}
```

**Respuesta:**

```json
{
  "data": {
    "id": "6f0b…",
    "external_id": "MI-REF-001",
    "action": "created",
    "admin_url": "https://portal.bcousinoprop.com/cl/admin/captaciones/6f0b…",
    "changed_fields": ["title", "price", "commune"],
    "protected_fields": [],
    "sections": {
      "contacts": { "created": 2, "updated": 0, "unchanged": 0 },
      "photos":   { "added": 2, "removed": 0, "kept": 0 },
      "listings": { "created": 1, "updated": 0, "unchanged": 0, "price_snapshots": 2 },
      "attempts": { "created": 1, "unchanged": 0 }
    },
    "warnings": [],
    "dry_run": false
  },
  "request_id": "req_9f2c1a…"
}
```

`changed_fields` = lo que realmente cambió. `protected_fields` = lo que mandaste
pero **no** se escribió porque pertenece al equipo de SmartBC y ya tenía valor.

## 4. Diccionario de campos

### Raíz — Ficha

| Campo | Tipo | Notas |
|---|---|---|
| `external_id` | string (1-200) | **Obligatorio.** Tu id estable |
| `title` | string (≤500) | |
| `description` | string (≤20000) | |
| `operation` | `venta` \| `arriendo` | |
| `price` | number ≥ 0 | En la moneda de `currency` |
| `currency` | `clp` \| `uf` \| `usd` \| `eur` | |
| `bedrooms`, `bathrooms` | int 0-1000 | |
| `square_meters` | int | Superficie total |
| `useful_square_meters` | int | Superficie útil |
| `property_type` | `house` \| `apartment` \| `land` \| `office` \| `commercial` \| `other` | |
| `features` | string[] (≤100) | Piscina, bodega, estacionamientos… |
| `source_url` | URL | Anuncio de origen. Si no lo mandas, se genera una referencia interna |
| `source_site` | string (≤100) | Por defecto, el slug de tu integración |
| `cover_photo_url` | URL | |
| `broker_name` | string (≤200) | Corredora del aviso original |
| `external_reference` | string (≤120) | Código de la corredora, ej. `EB-VX1848`. **No confundir con `external_id`** |
| `portal_publication_number` | string (≤80) | Nº de publicación del portal |
| `published_ago` | string (≤100) | Ej. "Publicado hace 2 meses" |

### Raíz — Ubicación

| Campo | Tipo | Notas |
|---|---|---|
| `region` | string | Normalizado contra el catálogo de Chile |
| `commune` | string | Idem. **Campo del equipo**: no se pisa si ya tiene valor |
| `zone`, `subzone` | string | |
| `address_scraped` | string (≤500) | Dirección del anuncio |
| `address_real` | string (≤500) | **Campo del equipo** |
| `address_verified` | boolean | **Campo del equipo**. Si está a `true`, no se actualizan las coordenadas |
| `latitude` | number −90..90 | |
| `longitude` | number −180..180 | |
| `rol_propiedad` | string (≤50) | Rol de avalúo SII. **Campo del equipo** |

### Raíz — Propietario y seguimiento (todos campos del equipo)

| Campo | Tipo |
|---|---|
| `owner.name`, `owner.phone`, `owner.contact` | string |
| `owner.confirmed` | boolean — marca que el dueño quiere vender; mueve la captación a la etapa «Confirmada» |
| `notes`, `revision_notes` | string |
| `next_action_at` | fecha ISO 8601 |
| `next_action_note` | string |

### `contacts[]` — máx. 20

| Campo | Tipo | Notas |
|---|---|---|
| `external_id` | string | Tu id del contacto. Sin él se deduplica por teléfono |
| `contact_type` | `owner` \| `spouse` \| `family` \| `other` | **Obligatorio** |
| `contact_name` | string | |
| `phone` | string | Se normaliza a formato chileno `+569…` |
| `email` | email | |
| `has_whatsapp` | boolean | |
| `relationship` | string | Si `contact_type: family` → "Hijo", "Hermano"… |
| `rut` | string (≤30) | Formato libre, ej. `12.345.678-9` |
| `photo_url` | URL | Foto de perfil asociada al número de `phone`. SmartBC la descarga y guarda copia propia; un `404` significa "sin foto" y no invalida el contacto. Si alguien del equipo sube una foto a mano, la suya gana y la sincronización no la pisa. |
| `extra_phones` | `[{ phone, has_whatsapp, label }]` (≤20) | Teléfonos adicionales del mismo contacto |

### `photos` — máx. 60 por envío

| Campo | Tipo | Notas |
|---|---|---|
| `mode` | `sync` \| `append` \| `replace` | `sync` (por defecto) añade las nuevas y quita las que ya no mandas; `append` solo añade; `replace` reconstruye |
| `items[].url` | URL | **Obligatorio** |
| `items[].position` | int | Orden en la galería |

SmartBC **descarga cada foto y la re-aloja** en su almacenamiento, porque las URLs
de los portales caducan. Una foto ya conocida no se vuelve a descargar. La
descarga es asíncrona: `photos.added` es lo enviado, no lo ya procesado.

### `listings[]` — pestaña Corredoras, máx. 20

La misma propiedad publicada por otras corredoras. **Deduplicados por
`source_url`**: si está en venta y en arriendo, manda los dos avisos.

`source_url` es el único obligatorio. El resto: `external_id`, `source_site`,
`broker_name`, `external_reference`, `title`, `description`, `price`, `currency`,
`bedrooms`, `bathrooms`, `square_meters`, `useful_square_meters`, `region`,
`commune`, `zone`, `address_scraped`, `latitude`, `longitude`, `cover_photo_url`,
`photo_urls[]`, `features[]`, `operation`, `portal_publication_number`,
`published_ago`, `broker_website_url`, `broker_price`, `broker_currency`,
`broker_scraped_at`, `broker_scrape_error`, `scrape_status`, `scrape_error`.

**Histórico de precios automático**: cada vez que cambia `price` (precio del
portal) o `broker_price` (precio en la web propia de la corredora), SmartBC
inserta solo un punto en el histórico, distinguiendo el origen. No tienes que
llamar a nada aparte.

### `attempts[]` — máx. 50 por envío

| Campo | Tipo | Notas |
|---|---|---|
| `external_id` | string | Sin él, el intento se inserta siempre (se duplicaría al resincronizar) |
| `attempt_type` | `call` \| `visit` \| `message` \| `whatsapp` \| `status_change` | **Obligatorio** |
| `result` | `answered` \| `no_answer` \| `interested` \| `not_interested` \| `call_back` \| `wrong_number` \| `busy` | **Obligatorio** |
| `owner_phone`, `owner_name`, `owner_contact`, `address_real`, `notes` | string | |
| `photo_url` | URL | |
| `next_action_at`, `next_action_note` | fecha ISO / string | Actualizan el próximo paso en la cabecera de la ficha |

### Workflow

| Campo | Notas |
|---|---|
| `pipeline` | Nombre del pipeline. Por defecto, el del país |
| `stage` | `key` de la etapa (`GET /api/v1/catalogos?tipo=pipelines`). La etapa `converted` **no** se puede fijar por API |
| `assigned_to_email` | Email de un usuario del equipo. Si no lo mandas, SmartBC reparte automáticamente |

## 5. Campos protegidos

SmartBC distingue dos clases de datos:

- **Del anuncio (tuyos)**: se actualizan **siempre** con lo que envíes.
- **Del equipo (suyos)**: `owner_name`, `owner_phone`, `owner_contact`,
  `owner_confirmed`, `address_real`, `address_verified`, `commune`,
  `rol_propiedad`, `notes`, `revision_notes`, `next_action_at`,
  `next_action_note`, asignación y etapa. Solo se escriben **si están vacíos**.

Sobrescribirlos exige **dos** condiciones: que el admin de SmartBC lo autorice en
tu integración **y** que tú lo pidas en ese envío con
`"options": { "overwrite_manual_fields": true }` o
`"options": { "force_fields": ["owner_phone"] }`. No lo uses salvo que te lo
pidan expresamente.

## 6. Resto de endpoints

| Método y ruta | Para qué |
|---|---|
| `GET /api/v1/ping` | Comprobar credenciales |
| `POST /api/v1/captaciones` | Crear o actualizar (ficha completa) |
| `POST /api/v1/captaciones/batch` | Hasta 100 por llamada |
| `GET /api/v1/captaciones` | Listar (`?limit=&cursor=&updated_since=&stage=`) |
| `GET /api/v1/captaciones/{external_id}` | Ficha completa con sus sub-recursos |
| `PATCH /api/v1/captaciones/{external_id}` | Actualización parcial |
| `DELETE /api/v1/captaciones/{external_id}` | Baja lógica (etapa de rechazo) |
| `GET·POST /api/v1/captaciones/{id}/contactos` | Listar / upsert de contactos |
| `DELETE /api/v1/captaciones/{id}/contactos/{contactId}` | Eliminar contacto |
| `GET·PUT /api/v1/captaciones/{id}/fotos` | Listar / sincronizar galería |
| `DELETE /api/v1/captaciones/{id}/fotos/{photoId}` | Eliminar foto |
| `GET·POST /api/v1/captaciones/{id}/avisos` | Listar / upsert de avisos de corredoras |
| `DELETE /api/v1/captaciones/{id}/avisos/{listingId}` | Eliminar aviso |
| `GET·POST /api/v1/captaciones/{id}/avisos/{listingId}/precios` | Histórico de precios |
| `GET·POST /api/v1/captaciones/{id}/intentos` | Historial de contacto |
| `POST /api/v1/captaciones/{id}/etapa` | Mover de etapa (`{ "stage": "contacting" }`) |
| `POST /api/v1/captaciones/{id}/asignar` | Asignar (`{ "email": "…" }`) |
| `GET /api/v1/catalogos?tipo=…` | Valores válidos |
| `GET /api/v1/openapi` | Especificación OpenAPI 3.1 |

En los sub-recursos, el identificador acepta el id interno de SmartBC, tu propio
`external_id` o (en avisos) la `source_url` codificada.

### Lotes

```json
{ "items": [ { "external_id": "A-1", "price": 100000000 }, { "external_id": "A-2" } ] }
```

Responde siempre `200`; cada elemento trae su resultado o su error, sea de
validación o de negocio:

```json
{
  "data": [
    { "index": 0, "ok": true,  "external_id": "A-1", "action": "updated" },
    { "index": 1, "ok": false, "external_id": "A-2",
      "error": { "code": "validation_error", "message": "El elemento no cumple el contrato",
                 "details": [{ "field": "property_type", "message": "Invalid input" }] } }
  ],
  "meta": { "summary": { "total": 2, "created": 0, "updated": 1, "unchanged": 0, "failed": 1 } }
}
```

### Paginación

`GET /api/v1/captaciones` usa cursor opaco. Pasa `meta.next_cursor` en `?cursor=`
hasta que `meta.has_more` sea `false`.

### Catálogos

| `tipo` | Devuelve |
|---|---|
| `enums` | Valores válidos de todas las listas cerradas |
| `pipelines` | Pipelines con sus etapas (`key`, `label`, `stage_type`) |
| `regiones` | Regiones de Chile |
| `comunas` | Comunas (`?region=`) |
| `zonas` | Zonas (`?comuna=`) |
| `usuarios` | Staff asignable (email + nombre) |

## 7. Idempotencia

```
Idempotency-Key: sync-2026-07-31-0001
```

- Misma clave + mismo cuerpo → devuelve la **respuesta original**, sin volver a
  escribir. Lleva `X-Idempotent-Replay: true`.
- Misma clave + cuerpo distinto → `409 conflict`.

Las claves se conservan 24 h. Úsala en toda escritura automática.

## 8. Errores

```json
{
  "error": {
    "code": "validation_error",
    "message": "El cuerpo de la petición no es válido",
    "details": [{ "field": "listings.0.price", "message": "Expected number" }],
    "request_id": "req_9f2c1a…"
  }
}
```

| Código | HTTP | Reintentar | Cuándo |
|---|---|---|---|
| `unauthorized` | 401 | ❌ | Clave ausente, inválida, revocada o caducada |
| `forbidden` | 403 | ❌ | Sin permiso, o integración desactivada |
| `not_found` | 404 | ❌ | No existe ese recurso |
| `validation_error` | 400 | ❌ | Payload inválido. `details` señala el campo |
| `conflict` | 409 | ❌ | Idempotency-Key reutilizada con otro cuerpo |
| `rate_limited` | 429 | ✅ | Respeta `Retry-After` |
| `payload_too_large` | 413 | ❌ | Cuerpo > 2 MB. Usa `/batch` en tandas |
| `service_unavailable` | 503 | ✅ | Despliegue en curso. Espera unos minutos |
| `internal_error` | 500 | ✅ | Error de SmartBC. Reporta el `request_id` |

Un campo desconocido produce `validation_error`, no se ignora en silencio.

## 9. Límites

| Límite | Valor |
|---|---|
| Peticiones/minuto | 120 (por clave) |
| Cuerpo | 2 MB |
| Captaciones por lote | 100 |
| Contactos por captación | 20 |
| Fotos por envío | 60 |
| Avisos por captación | 20 |
| Intentos por envío | 50 |

Cada respuesta trae `X-RateLimit-Limit`, `X-RateLimit-Remaining` y
`X-RateLimit-Reset`.

---

## Empieza por aquí

1. Ejecuta el `ping` y confirma que responde `200`.
2. Descarga el OpenAPI y los catálogos.
3. **Enséñame el mapeo de campos propuesto antes de escribir el sincronizador.**
