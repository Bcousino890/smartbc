# Portalinmobiliario.com Integration Guide

## Status: Skeleton Implementation (API Access Required)

This document outlines the integration plan for publishing Chile properties directly to Portalinmobiliario.com.

## Key Findings

### API Availability
- **Status**: NO public REST API available
- **Access**: Only available to "certified integrators" with private API documentation
- **Owner**: Portalinmobiliario is owned by MercadoLibre (since 2014)

### Alternative Approaches
1. **MercadoLibre Real Estate API** (Public, parent company)
   - Publicly documented at: https://developers.mercadolibre.com.ar
   - Authentication: OAuth 2.0
   - Rate limit: 1500 requests/minute per seller
   - May or may not support Portalinmobiliario listings directly

2. **Seguidor Platform** (Manual UI-based tool)
   - Login at portalinmobiliario.com
   - Navigate to "Administración de Propiedades"
   - No API, purely manual property management

3. **Certified Integrator Program**
   - Contact Portalinmobiliario directly
   - Get private API documentation
   - Obtain authentication credentials
   - Expected to use OAuth 2.0 similar to parent company

## Current Implementation

### Files Created
- `lib/sync/portalinmobiliario/config.ts` - API key and settings management
- `lib/sync/portalinmobiliario/publisher.ts` - Publish/unpublish service (placeholder)
- `app/api/admin/cl/publish-to-portalinmobiliario/route.ts` - Chile admin endpoint
- `supabase/migrations/0040_add_portalinmobiliario_tracking.sql` - Database fields

### How It Works (When API is Available)
1. Admin uploads/creates property in Chile dashboard (/cl/admin)
2. Admin clicks "Publish to Portalinmobiliario"
3. API endpoint fetches property data and photos
4. Calls `publishPropertyToPortalinmobiliario()`
5. Service sends data to Portalinmobiliario API
6. Property ID is saved for tracking/updates
7. User sees confirmation link to Portalinmobiliario listing

## Next Steps to Complete Integration

### Step 1: Get Certified Integrator Access (REQUIRED)
```
Contact Portalinmobiliario:
- Email: integrations@portalinmobiliario.com (or support email)
- Explain: SmartBC is a real estate platform for Chile
- Request: Certified integrator API access, documentation, credentials
```

### Step 2: Understand Their API
Once you receive documentation:
- Authentication method (OAuth 2.0, API key, etc.)
- Required endpoints for creating/updating/deleting listings
- Property field mappings (title, price, address, etc.)
- Image upload requirements
- Rate limits and quotas

### Step 3: Implement the API Integration
Update `lib/sync/portalinmobiliario/publisher.ts`:
- Replace the placeholder comment with actual API calls
- Implement authentication
- Handle error responses
- Parse and return publication URLs

### Step 4: Add Property Type Detection
Update `app/api/admin/cl/publish-to-portalinmobiliario/route.ts`:
- Detect actual property type (not hardcoded "apartment")
- Map SmartBC property types to Portalinmobiliario categories
- Validate image requirements (image count, minimum resolution)

### Step 5: Add Database Tracking
Update property publication workflow:
- Save `portalinmobiliario_id` when published
- Track `portalinmobiliario_sync_status` (pending/synced/failed/archived)
- Implement updates when properties are modified
- Handle unpublishing

### Step 6: Add UI for Portalinmobiliario Publishing
Create new component for Chile admin:
- Button in property detail page: "Publish to Portalinmobiliario"
- Sync status indicator (✓ Published, ✗ Failed, ⏳ Pending)
- Link to Portalinmobiliario listing page
- Option to unpublish

## Expected Property Schema

Based on Portalinmobiliario requirements:

```typescript
{
  title: string;              // Max 60 chars (Chile)
  description: string;        // Full description
  price: number;             // In CLP (Chilean Pesos)
  address: string;           // Full address
  bedrooms: number;
  bathrooms: number;
  squareMeters: number;
  propertyType: string;      // house | apartment | office | land | parking
  images: {
    url: string;
    position: number;
  }[];
  // Minimum image requirements:
  // - Houses/Apartments/Offices/Plots: 12 images
  // - Premises/Agricultural/Sites/Lands/Warehouses: 6 images
  // - Parking: 4 images
  // Image specs: minimum 800x600px (1200x900 recommended)
}
```

---

## 🇨🇱 Chile: Integración vía MercadoLibre API

**Buenas noticias**: Portalinmobiliario.com está integrado con MercadoLibre y sus propiedades
se publican en ambas plataformas simultáneamente. La API de MercadoLibre Chile tiene
documentación pública específica para inmuebles.

### Documentación oficial

- **Guía para inmuebles (Chile)**: https://developers.mercadolibre.cl/es_ar/guia-para-inmuebles
- **Introducción a la guía**: https://developers.mercadolibre.cl/es_ar/introduccion-guia-de-inmuebles
- **Portal desarrolladores Chile**: https://developers.mercadolibre.cl

### Flujo de autenticación OAuth 2.0

```
1. Crear app en: https://developers.mercadolibre.cl → "Mis aplicaciones"
2. Obtener: APP_ID + SECRET_KEY
3. Redirigir al usuario a:
   https://auth.mercadolibre.cl/authorization
     ?response_type=code
     &client_id={APP_ID}
     &redirect_uri={TU_REDIRECT_URI}

4. Intercambiar el code por access_token:
   POST https://api.mercadolibre.com/oauth/token
   grant_type=authorization_code
   &client_id={APP_ID}
   &client_secret={SECRET_KEY}
   &code={CODE}
   &redirect_uri={TU_REDIRECT_URI}

5. Respuesta:
   { "access_token": "...", "token_type": "Bearer", "expires_in": 21600,
     "refresh_token": "...", "user_id": 123456789 }

6. Usar en todas las llamadas:
   Authorization: Bearer {access_token}
```

> El `access_token` expira en 6 horas. Guardar el `refresh_token` y renovar automáticamente.

### Site ID para Chile

```
MLC  →  Chile  (mercadolibre.cl)
```

Todos los endpoints de inmuebles usan `site_id=MLC`.

### Publicar propiedad: endpoint principal

```
POST https://api.mercadolibre.com/items
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Payload mínimo para inmueble en Chile**:
```json
{
  "site_id": "MLC",
  "title": "Departamento 3D 2B en Las Condes",
  "category_id": "MLC1459",
  "price": 95000000,
  "currency_id": "CLP",
  "available_quantity": 1,
  "buying_mode": "classified",
  "listing_type_id": "gold_special",
  "condition": "not_specified",
  "description": { "plain_text": "Descripción completa..." },
  "pictures": [
    { "source": "https://tu-dominio.com/foto1.jpg" },
    { "source": "https://tu-dominio.com/foto2.jpg" }
  ],
  "attributes": [
    { "id": "BEDROOMS", "value_name": "3" },
    { "id": "BATHROOMS", "value_name": "2" },
    { "id": "TOTAL_AREA", "value_name": "85" },
    { "id": "COVERED_AREA", "value_name": "75" },
    { "id": "OPERATION", "value_name": "Venta" },
    { "id": "PROPERTY_TYPE", "value_name": "Departamento" },
    { "id": "FULL_ADDRESS", "value_name": "Av. Apoquindo 5000, Las Condes, Santiago" },
    { "id": "PARKING_LOTS", "value_name": "1" }
  ],
  "sale_terms": [
    { "id": "OPERATION", "value_name": "Venta" }
  ]
}
```

### Categorías de inmuebles MLC

| Tipo propiedad     | category_id |
|--------------------|-------------|
| Departamento       | MLC1459     |
| Casa               | MLC1545     |
| Oficina            | MLC1467     |
| Local comercial    | MLC1468     |
| Terreno/Lote       | MLC1578     |
| Bodega             | MLC101719   |
| Estacionamiento    | MLC101720   |

### Tipos de publicación (listing_type_id)

| Tipo         | Equivalente          | Descripción                          |
|--------------|----------------------|--------------------------------------|
| `free`       | Gratuita             | Visibilidad muy baja                 |
| `bronze`     | Básica               | Visibilidad normal                   |
| `silver`     | Plata                | Mayor posicionamiento                |
| `gold`       | Oro                  | Posicionamiento destacado            |
| `gold_special` | Oro especial       | Máxima visibilidad (recomendado)     |
| `gold_premium` | Oro premium        | Posicionamiento exclusivo             |

### Operación: Venta vs Arriendo

El campo `OPERATION` dentro de `attributes` define si es venta o arriendo:

```json
{ "id": "OPERATION", "value_name": "Venta" }
// o
{ "id": "OPERATION", "value_name": "Arriendo" }
```

> En Chile se usa "Arriendo" (no "Alquiler" como en Argentina)

### Imagen mínimas requeridas

| Tipo propiedad                        | Mínimo |
|---------------------------------------|--------|
| Departamento / Casa / Oficina / Lote  | 12     |
| Local / Bodega / Sitio                | 6      |
| Estacionamiento                       | 4      |

Dimensiones: mínimo 800×600px (recomendado 1200×900px o superior)

### Endpoints clave

```
GET  /sites/MLC/categories/tree/MLC1459     → Ver atributos de la categoría
GET  /categories/MLC1459/attributes         → Lista completa de atributos
GET  /items/{ITEM_ID}                       → Estado del anuncio
PUT  /items/{ITEM_ID}                       → Actualizar anuncio
DELETE /items/{ITEM_ID}                     → Archivar anuncio

POST /items/{ITEM_ID}/descriptions          → Agregar/actualizar descripción
POST /pictures/items/upload                 → Subir foto (multipart/form-data)
```

### Variables de entorno a configurar

```env
# MercadoLibre Chile
ML_APP_ID=your_app_id
ML_SECRET_KEY=your_secret_key
ML_ACCESS_TOKEN=token_del_usuario_agencia
ML_REFRESH_TOKEN=refresh_token_del_usuario
ML_USER_ID=user_id_del_vendedor
```

Guardar en `app_settings` de la DB (clave: `ml.chile.access_token`, etc.)

### Pasos para activar

1. **Crear app en MercadoLibre Chile**: https://developers.mercadolibre.cl → "Mis aplicaciones" → "Crear app"
2. **Configurar redirect URI**: `https://tudominio.cl/api/cl/ml-callback`
3. **Completar flujo OAuth**: el usuario de la agencia autoriza la app
4. **Guardar tokens** en `app_settings` table
5. **Implementar** `lib/sync/portalinmobiliario/publisher.ts` con los endpoints reales

---

## MercadoLibre Alternative (If Portalinmobiliario Refuses API)

Si Portalinmobiliario no otorga acceso como integrador certificado, usar directamente
**MercadoLibre Real Estate API** (misma empresa, mismas propiedades aparecen en ambas plataformas):

1. Usar API de MercadoLibre Chile: `api.mercadolibre.com` con `site_id=MLC`
2. Propiedades publicadas vía MercadoLibre **aparecen automáticamente en Portalinmobiliario**
3. Pros: Públicamente documentado, sin aprobación especial, portal Chile oficial
4. Documentación: https://developers.mercadolibre.cl/es_ar/guia-para-inmuebles

## References

- MercadoLibre Chile - Guía inmuebles: https://developers.mercadolibre.cl/es_ar/guia-para-inmuebles
- MercadoLibre Chile - Introducción: https://developers.mercadolibre.cl/es_ar/introduccion-guia-de-inmuebles
- MercadoLibre Developers (AR): https://developers.mercadolibre.com.ar/en_us/real-estate-experience
- MercadoLibre Authentication: https://developers.mercadolibre.com.ar/en_us/authentication-and-authorization
- Portalinmobiliario Help Center: https://portalinmobiliario.zendesk.com/hc/es
- Portalinmobiliario Blog (Seguidor guides): https://www.portalinmobiliario.com/h/blog

## Architecture Decision

Publicar vía **MercadoLibre Chile API** es la vía recomendada porque:
1. Tiene API pública con documentación oficial en español
2. Propiedades aparecen automáticamente también en Portalinmobiliario.com
3. OAuth estándar, sin aprobación especial requerida
4. Mismo grupo empresarial que Portalinmobiliario

Para España se sigue usando Idealista (sin cambios).
