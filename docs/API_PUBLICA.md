# API pública de SmartBC · v1

Documento para el **proveedor externo**. Describe cómo enviar captaciones a
SmartBC para que se den de alta y se mantengan actualizadas solas, sin que nadie
tenga que rellenar nada a mano.

- **URL base**: `https://portal.bcousinoprop.com`
- **Especificación OpenAPI 3.1**: `GET /api/v1/openapi` (importable en Postman,
  Insomnia o cualquier generador de clientes)
- **Formato**: JSON en UTF-8
- **Versión**: v1 (los cambios incompatibles irán en `/api/v2`)

---

## 1. Autenticación

Cabecera `Authorization` con la clave que te entregue el equipo de SmartBC:

```
Authorization: Bearer sbc_live_a1b2c3d4_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

La clave es secreta y personal de la integración. Se puede revocar en cualquier
momento desde el panel; si eso ocurre recibirás `401 unauthorized`.

Prueba de humo antes de cualquier otra cosa:

```bash
curl -s https://portal.bcousinoprop.com/api/v1/ping \
  -H "Authorization: Bearer $SMARTBC_API_KEY"
```

```json
{
  "data": {
    "ok": true,
    "client": { "name": "Captaciones Chile", "slug": "captaciones-chile", "country": "cl" },
    "scopes": ["captaciones:read", "captaciones:write", "catalogos:read"],
    "rate_limit_per_minute": 120,
    "server_time": "2026-07-31T18:20:00.000Z",
    "api_version": "v1"
  },
  "request_id": "req_9f2c1a…"
}
```

---

## 2. Concepto clave: `external_id`

Cada captación se identifica por **`external_id`**, que es *tu* identificador en
*tu* sistema. Es el único campo obligatorio.

- Primera vez que lo mandas → **se crea** la captación (`201`, `action: "created"`).
- Vuelves a mandarlo con datos nuevos → **se actualiza** la existente
  (`200`, `action: "updated"`).
- Lo mandas sin cambios → no se escribe nada (`200`, `action: "unchanged"`).

**Nunca se duplica.** No necesitas guardar identificadores de SmartBC.

> Si la captación ya existía en SmartBC por otra vía (por ejemplo scraping) con
> la misma `source_url`, se adopta esa ficha en lugar de crear una nueva.

---

## 3. Campos que no se sobrescriben

SmartBC distingue dos clases de datos:

| Clase | Campos | Comportamiento |
|---|---|---|
| **Del anuncio** (tuyos) | título, descripción, operación, precio, moneda, dormitorios, baños, m², tipo, características, región, zona, dirección del anuncio, coordenadas, fotos, avisos | Se actualizan **siempre** con lo que envíes |
| **Del equipo** (nuestros) | `owner_name`, `owner_phone`, `owner_contact`, `owner_confirmed`, `address_real`, `address_verified`, `commune`, `rol_propiedad`, `notes`, `revision_notes`, `next_action_at`, `next_action_note`, asignación y etapa | Solo se escriben **si están vacíos** |

Esto es deliberado: si una captadora consigue el teléfono real del propietario,
tu siguiente sincronización no lo puede borrar.

La respuesta te dice exactamente qué pasó:

```json
{
  "changed_fields": ["price", "published_ago"],
  "protected_fields": ["owner_phone", "notes"]
}
```

Si tu integración necesita poder pisar esos campos, pídelo al equipo de SmartBC:
se habilita por integración y entonces puedes usar
`"options": { "overwrite_manual_fields": true }` o forzar campos concretos con
`"options": { "force_fields": ["owner_phone"] }`.

---

## 4. Crear o actualizar una captación

`POST /api/v1/captaciones`

Un único envío rellena **la ficha completa**: datos del anuncio, ubicación,
propietario y contactos, avisos de otras corredoras, galería de fotos e
intentos de contacto.

```bash
curl -s -X POST https://portal.bcousinoprop.com/api/v1/captaciones \
  -H "Authorization: Bearer $SMARTBC_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: sync-2026-07-31-0001" \
  -d '{
    "external_id": "MI-REF-001",

    "title": "Casa mediterránea en Las Condes",
    "description": "Casa de 4 dormitorios con jardín…",
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
    "broker_name": "Corredora Ejemplo",
    "external_reference": "EB-VX1848",
    "portal_publication_number": "3914632576",
    "published_ago": "Publicado hace 2 meses",

    "region": "Metropolitana",
    "commune": "Las Condes",
    "zone": "El Golf",
    "address_scraped": "Av. Apoquindo 1234",
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

    "contacts": [
      {
        "external_id": "CT-1",
        "contact_type": "owner",
        "contact_name": "María Pérez",
        "phone": "+56912345678",
        "email": "maria@ejemplo.cl",
        "has_whatsapp": true,
        "rut": "12.345.678-9",
        "photo_url": "https://cdn.mi-sistema.cl/foto-contacto?id=13387802&size=240",
        "extra_phones": [
          { "phone": "+56987654321", "has_whatsapp": false, "label": "Oficina" }
        ]
      },
      {
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
        "source_url": "https://portalinmobiliario.com/MLC-999",
        "source_site": "portalinmobiliario",
        "broker_name": "Corredora X",
        "external_reference": "CX-4412",
        "price": 460000000,
        "currency": "clp",
        "operation": "venta",
        "portal_publication_number": "3914632576",
        "published_ago": "Publicado hace 2 meses",
        "broker_website_url": "https://corredorax.cl/propiedad/4412",
        "broker_price": 455000000,
        "broker_currency": "clp",
        "broker_scraped_at": "2026-07-31T12:00:00Z"
      }
    ],

    "attempts": [
      {
        "external_id": "AT-1",
        "attempt_type": "call",
        "result": "no_answer",
        "notes": "No contesta, reintentar el viernes",
        "next_action_at": "2026-08-04T15:00:00Z",
        "next_action_note": "Volver a llamar"
      }
    ],

    "stage": "contacting"
  }'
```

Respuesta:

```json
{
  "data": {
    "id": "6f0b…",
    "external_id": "MI-REF-001",
    "action": "created",
    "admin_url": "https://portal.bcousinoprop.com/cl/admin/captaciones/6f0b…",
    "changed_fields": ["title", "price", "commune", "…"],
    "protected_fields": [],
    "sections": {
      "contacts": { "created": 2, "updated": 0, "unchanged": 0 },
      "photos": { "added": 2, "removed": 0, "kept": 0 },
      "listings": { "created": 1, "updated": 0, "unchanged": 0, "price_snapshots": 2 },
      "attempts": { "created": 1, "unchanged": 0 }
    },
    "warnings": [],
    "dry_run": false
  },
  "request_id": "req_9f2c1a…"
}
```

### Notas de comportamiento

- **Fotos**: se descargan de tu CDN y se re-alojan en SmartBC (las URLs de los
  portales caducan). Se hace en segundo plano, por eso `photos.added` es lo
  enviado, no lo ya descargado. Modos: `sync` (por defecto: añade las nuevas y
  quita las que ya no mandas), `append` (solo añade), `replace` (reconstruye).
  Una foto ya conocida **no** se vuelve a descargar.
- **Avisos** (pestaña «Corredoras» del panel): la misma propiedad publicada por
  varias corredoras. Se deduplican por `source_url`, así que si está en venta y
  en arriendo se mandan los dos avisos. Cada cambio de `price` (portal) o de
  `broker_price` (web propia de la corredora) deja automáticamente un punto en
  el histórico, distinguiendo el origen con `source`.
- **Fotos de contacto** (`contacts[].photo_url`): se descargan y re-alojan igual
  que la galería, en segundo plano, y solo cuando la URL cambia respecto a la
  última que enviaste. Un `404` se interpreta como "ese número no tiene foto":
  no es un error. `sections.contacts.photos_queued` indica cuántas se pusieron
  en cola.
- **Intentos**: se deduplican por `external_id`. Sin él, se insertan siempre.
- **Etapa**: `stage` acepta la `key` de una etapa del pipeline
  (`GET /api/v1/catalogos?tipo=pipelines`). La etapa `converted` no se puede
  fijar por API.
- **Reparto**: una captación nueva se asigna automáticamente al miembro del
  equipo con menos carga, si el reparto está activo.

---

## 5. Lotes

`POST /api/v1/captaciones/batch` — hasta **100** captaciones por llamada.

```json
{ "items": [ { "external_id": "A-1", "price": 100000000 }, { "external_id": "A-2" } ] }
```

Responde siempre `200`. Cada elemento trae su propio resultado o su error —tanto
si el fallo es de validación (un campo o un enum mal escrito) como de negocio—,
de modo que un item mal formado **no** tumba el resto:

```json
{
  "data": [
    { "index": 0, "ok": true, "external_id": "A-1", "action": "updated", "…": "…" },
    { "index": 1, "ok": false, "external_id": "A-2",
      "error": { "code": "validation_error", "message": "El elemento no cumple el contrato",
                 "details": [{ "field": "property_type", "message": "Invalid input" }] } }
  ],
  "meta": { "summary": { "total": 2, "created": 0, "updated": 1, "unchanged": 0, "failed": 1 } }
}
```

---

## 6. Resto de endpoints

| Método y ruta | Para qué |
|---|---|
| `GET /api/v1/ping` | Comprobar credenciales |
| `GET /api/v1/captaciones` | Listar lo enviado (`?limit=&cursor=&updated_since=&stage=`) |
| `GET /api/v1/captaciones/{external_id}` | Ficha completa con los cinco sub-recursos |
| `PATCH /api/v1/captaciones/{external_id}` | Actualización parcial |
| `DELETE /api/v1/captaciones/{external_id}` | Baja lógica (pasa a etapa de rechazo) |
| `GET·POST /api/v1/captaciones/{id}/contactos` | Listar / upsert de contactos |
| `DELETE /api/v1/captaciones/{id}/contactos/{contactId}` | Eliminar un contacto |
| `GET·PUT /api/v1/captaciones/{id}/fotos` | Listar / sincronizar galería |
| `DELETE /api/v1/captaciones/{id}/fotos/{photoId}` | Eliminar una foto |
| `GET·POST /api/v1/captaciones/{id}/avisos` | Listar / upsert de avisos de corredoras (pestaña «Corredoras») |
| `DELETE /api/v1/captaciones/{id}/avisos/{listingId}` | Eliminar un aviso |
| `GET·POST /api/v1/captaciones/{id}/avisos/{listingId}/precios` | Histórico de precios |
| `GET·POST /api/v1/captaciones/{id}/intentos` | Historial de contacto |
| `POST /api/v1/captaciones/{id}/etapa` | Mover de etapa |
| `POST /api/v1/captaciones/{id}/asignar` | Asignar a un usuario por email |
| `GET /api/v1/catalogos?tipo=…` | `enums`, `pipelines`, `regiones`, `comunas`, `zonas`, `usuarios` |
| `GET /api/v1/openapi` | Especificación OpenAPI 3.1 |

En sub-recursos, los identificadores aceptan tanto el id interno de SmartBC como
tu propio `external_id` (y en avisos, además, la `source_url` codificada).

### Paginación

`GET /api/v1/captaciones` usa cursor opaco:

```json
{ "data": [ … ], "meta": { "limit": 25, "has_more": true, "next_cursor": "MjAyNi0…" } }
```

Pasa `next_cursor` en `?cursor=` hasta que `has_more` sea `false`.

---

## 7. Catálogos

Para no mandar texto libre:

```bash
curl -s "https://portal.bcousinoprop.com/api/v1/catalogos?tipo=pipelines" \
  -H "Authorization: Bearer $SMARTBC_API_KEY"
```

| `tipo` | Devuelve |
|---|---|
| `enums` | Valores válidos de `property_type`, `currency`, `operation`, `contact_type`, `attempt_type`, `attempt_result`, `photo_mode` |
| `pipelines` | Pipelines con sus etapas (`key`, `label`, `stage_type`) |
| `regiones` | Regiones de Chile |
| `comunas` | Comunas (filtrable con `?region=`) |
| `zonas` | Zonas (filtrable con `?comuna=`) |
| `usuarios` | Staff al que se puede asignar una captación (email + nombre) |

Las regiones y comunas se normalizan contra este maestro; si mandas una que no
existe, se guarda tal cual y la respuesta incluye un aviso en `warnings`.

---

## 8. Idempotencia

Añade la cabecera `Idempotency-Key` en cualquier escritura:

```
Idempotency-Key: sync-2026-07-31-0001
```

- Misma clave + mismo cuerpo → se devuelve la **respuesta original**, sin volver
  a escribir. La respuesta lleva `X-Idempotent-Replay: true`.
- Misma clave + cuerpo distinto → `409 conflict`.

Sirve para reintentar tras un timeout sin miedo a duplicar. Las claves se
conservan 24 horas.

---

## 9. Modo simulación (dry-run)

Cabecera `X-SmartBC-Dry-Run: 1` (o `?dry_run=true`). Valida el payload y
devuelve **qué habría pasado**, sin escribir nada. Es la forma recomendada de
probar la integración antes de ponerla en producción.

```bash
curl -s -X POST https://portal.bcousinoprop.com/api/v1/captaciones \
  -H "Authorization: Bearer $SMARTBC_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-SmartBC-Dry-Run: 1" \
  -d '{ "external_id": "MI-REF-001", "price": 470000000 }'
```

---

## 10. Errores

Todos los errores tienen la misma forma:

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

| Código | HTTP | Cuándo |
|---|---|---|
| `unauthorized` | 401 | Falta la clave, es inválida, está revocada o caducada |
| `forbidden` | 403 | La clave no tiene el permiso necesario, o la integración está desactivada |
| `not_found` | 404 | No existe esa captación / contacto / aviso |
| `validation_error` | 400 | Payload inválido. `details` indica el campo exacto |
| `conflict` | 409 | Idempotency-Key reutilizada con otro cuerpo, o petición en curso |
| `rate_limited` | 429 | Superado el límite. Respeta la cabecera `Retry-After` |
| `payload_too_large` | 413 | Cuerpo mayor de 2 MB — usa `/batch` en varias tandas |
| `service_unavailable` | 503 | Despliegue en curso. Reintenta en unos minutos |
| `internal_error` | 500 | Error nuestro. Cita el `request_id` al reportarlo |

> Un campo desconocido produce `validation_error`, no se ignora en silencio.
> Es deliberado: así una errata en el nombre de un campo se detecta el primer
> día y no meses después.

**Guarda siempre el `request_id`**: con él, el equipo de SmartBC localiza tu
petición exacta (con su cuerpo) en el panel de integraciones.

---

## 11. Límites

| Límite | Valor |
|---|---|
| Peticiones por minuto | 120 por defecto (por clave; ajustable) |
| Tamaño del cuerpo | 2 MB |
| Captaciones por lote | 100 |
| Contactos por captación | 20 |
| Fotos por envío | 60 |
| Avisos por captación | 20 |
| Intentos por envío | 50 |

Cada respuesta trae `X-RateLimit-Limit`, `X-RateLimit-Remaining` y
`X-RateLimit-Reset`.

---

## 12. Recomendaciones de integración

1. **Empieza con dry-run** hasta que las respuestas no traigan `warnings`.
2. **Manda solo lo que cambia.** No hace falta reenviar la ficha entera para
   corregir un precio: `PATCH` con `external_id` y `price` basta.
3. **Usa `Idempotency-Key`** en toda escritura automática.
4. **Reintenta con espera exponencial** en `429`, `503` y `500`. No reintentes
   en `400`, `401`, `403` ni `409`.
5. **Sincroniza por lotes** si tienes muchos cambios: 100 por llamada es mucho
   más eficiente que 100 llamadas.
6. **Concilia periódicamente** con `GET /api/v1/captaciones?updated_since=…`.

---

## Changelog

### v1.0.0 — 2026-07-31
- Primera versión pública: alta y actualización de captaciones con la ficha
  completa, sub-recursos (contactos, fotos, avisos, precios, intentos),
  catálogos, lotes, idempotencia, dry-run y límite por clave.
