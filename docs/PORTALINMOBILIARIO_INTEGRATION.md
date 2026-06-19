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

## MercadoLibre Alternative (If Portalinmobiliario Refuses API)

If Portalinmobiliario doesn't grant certified integrator access:

1. Use MercadoLibre Real Estate API instead
2. MercadoLibre OAuth flow:
   ```
   1. Redirect to: https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI
   2. Exchange code for access_token at: https://api.mercadolibre.com/oauth/token
   3. Use Bearer token in all API calls
   ```
3. Pros: Publicly documented, no gatekeeping
4. Cons: May not show listings on Portalinmobiliario directly (might only be on MercadoLibre)

## References

- MercadoLibre Developers: https://developers.mercadolibre.com.ar/en_us/real-estate-experience
- MercadoLibre Authentication: https://developers.mercadolibre.com.ar/en_us/authentication-and-authorization
- Portalinmobiliario Help Center: https://portalinmobiliario.zendesk.com/hc/es
- Portalinmobiliario Blog (Seguidor guides): https://www.portalinmobiliario.com/h/blog

## Architecture Decision

We're implementing Portalinmobiliario-specific integration (not MercadoLibre) because:
1. Portalinmobiliario is the primary property portal in Chile
2. User explicitly requested "solo Portalinmobiliario.com si toda" (only Portalinmobiliario for everything)
3. If API access is denied, we can fall back to Seguidor UI automation or export features

For Spain, we continue using Idealista (no change).
