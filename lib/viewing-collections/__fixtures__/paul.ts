// ============================================================================
// Fixture del caso Paul.
//
// Escenario de referencia del módulo, reutilizado por los tests de proyección
// y por el script de verificación end-to-end contra base de datos.
//
// Fechas verificadas: 2026-08-17 es LUNES y 2026-08-19 es MIÉRCOLES.
// ============================================================================

import type {
  RawCollectionData,
  RawPublicProperty,
  RawPublicStop,
} from "../to-public";
import type { StopConfirmation } from "../types";

export const MONDAY = "2026-08-17";
export const WEDNESDAY = "2026-08-19";

/** Datos sensibles que NUNCA deben aparecer en la superficie pública. */
export const FORBIDDEN_IN_PUBLIC = {
  ownerName: "Doña Remedios Propietaria",
  ownerPhone: "+34600111222",
  ownerEmail: "propietario@ejemplo.com",
  internalNotes: "Llaves en portería, avisar 30 min antes",
  agentNotes: "El cliente regatea, margen hasta 1.650",
  sourceUrl: "https://www.idealista.com/inmueble/99887766/",
  externalId: "LEVEL-3291",
  storagePhotoUrl:
    "https://crm.bcousinoprop.com/storage/v1/object/public/properties-photos/synced/level/3291/0.webp",
  shareLabel: "Para María Pérez",
  clientLastName: "Cabrera",
  clientEmail: "paul@ejemplo.com",
} as const;

function property(over: Partial<RawPublicProperty> = {}): RawPublicProperty {
  return {
    slug: "piso-en-trafalgar",
    title: "Piso en Trafalgar",
    title_rent: null,
    property_type: "Piso",
    zone: "Chamberí",
    subzone: "Trafalgar",
    address: "Calle Trafalgar 24, 3ºB",
    bedrooms: 2,
    bathrooms: 1,
    square_meters: 68,
    price: 1750,
    rent_price: null,
    currency: "eur",
    operation: "rent",
    operations: ["rent"],
    status: "available",
    archived_at: null,
    bc_reference: "BC-0871",
    latitude: 40.4331,
    longitude: -3.7012,
    country: "es",
    last_synced_at: "2026-08-10T10:00:00Z",
    updated_at: "2026-08-10T10:00:00Z",
    property_photos: [
      {
        url: FORBIDDEN_IN_PUBLIC.storagePhotoUrl,
        position: 0,
        is_cover: true,
      },
      {
        url: FORBIDDEN_IN_PUBLIC.storagePhotoUrl.replace("0.webp", "1.webp"),
        position: 1,
        is_cover: false,
      },
    ],
    ...over,
  };
}

function stop(over: Partial<RawPublicStop> = {}): RawPublicStop {
  return {
    position: 100,
    scheduled_at: `${MONDAY}T08:00:00Z`, // 10:00 en Europe/Madrid (CEST)
    duration_minutes: 30,
    confirmation_status: "confirmed" as StopConfirmation,
    address_visibility: "exact",
    hidden_from_client: false,
    created_at: "2026-08-14T09:00:00Z",
    smartLinkToken: "aaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    property: property(),
    ...over,
  };
}

/**
 * Lunes 17 de agosto: 6 paradas.
 *   4 confirmadas (2 con dirección exacta autorizada)
 *   1 propuesta, pendiente de confirmar
 *   1 cancelada, sustituida por otra propiedad
 */
export function mondayCollection(
  over: Partial<RawCollectionData> = {},
): RawCollectionData {
  return {
    itinerary: {
      title: "Visitas del lunes",
      scheduled_date: MONDAY,
      window_start: "10:00:00",
      window_end: "14:00:00",
      timezone: "Europe/Madrid",
      country: "es",
    },
    clientFullName: `Paul ${FORBIDDEN_IN_PUBLIC.clientLastName}`,
    agent: {
      full_name: "María López",
      email: "maria@bcousinoprop.com",
      phone: "+34 694 20 97 63",
      avatar_url: null,
    },
    expiresAt: "2026-10-16T10:00:00Z",
    stops: [
      // 1 · confirmada, dirección exacta
      stop({ position: 100 }),
      // 2 · confirmada, dirección exacta
      stop({
        position: 200,
        scheduled_at: `${MONDAY}T08:45:00Z`,
        smartLinkToken: "bbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        property: property({
          slug: "atico-en-chamberi",
          title: "Ático en Chamberí",
          bc_reference: "BC-0912",
          bedrooms: 3,
          bathrooms: 2,
          square_meters: 95,
          price: 1900,
          address: "Calle Almagro 12, Ático",
        }),
      }),
      // 3 · PROPUESTA · solo zona · propiedad reservada
      stop({
        position: 300,
        scheduled_at: `${MONDAY}T09:30:00Z`,
        confirmation_status: "proposed",
        address_visibility: "area_only",
        smartLinkToken: "cccccccccccccccccccccccccccc",
        property: property({
          slug: "piso-en-rios-rosas",
          title: "Piso en Ríos Rosas",
          subzone: "Ríos Rosas",
          bc_reference: "BC-0934",
          status: "reserved",
          price: 1650,
          address: "Calle Alenza 8, 2ºC",
        }),
      }),
      // 4 · confirmada · dirección CONTAMINADA (descripción volcada)
      stop({
        position: 400,
        scheduled_at: `${MONDAY}T10:15:00Z`,
        smartLinkToken: "dddddddddddddddddddddddddddd",
        property: property({
          slug: "estudio-en-malasana",
          title: "Estudio en Malasaña",
          zone: "Centro",
          subzone: "Malasaña",
          bc_reference: "BC-0888",
          bedrooms: 1,
          square_meters: 45,
          price: 1400,
          address:
            "Calle del Molino de Viento 6. Apartamento de 1 dormitorio. Distrito Centro. Metro: Noviciado. CONDICIONES DE ALQUILER: contrato de temporada, máximo 12 meses. Reserva: 1er mes + fee de gestión. No se admiten mascotas.",
        }),
      }),
      // 5 · confirmada · SUSTITUTA de la cancelada
      stop({
        position: 500,
        scheduled_at: `${MONDAY}T11:00:00Z`,
        smartLinkToken: "eeeeeeeeeeeeeeeeeeeeeeeeeeee",
        property: property({
          slug: "piso-en-bilbao",
          title: "Piso en Bilbao",
          bc_reference: "BC-0901",
          price: 1800,
          address: "Glorieta de Bilbao 3, 4ºA",
        }),
      }),
      // 6 · CANCELADA · sin SmartLink → cae al enlace estable
      stop({
        position: 600,
        scheduled_at: null,
        confirmation_status: "cancelled",
        address_visibility: "area_only",
        smartLinkToken: null,
        property: property({
          slug: "loft-en-alonso-martinez",
          title: "Loft en Alonso Martínez",
          bc_reference: "BC-0877",
          price: 1550,
        }),
      }),
    ],
    ...over,
  };
}

/** Variante con la parada cancelada oculta al cliente. */
export function mondayWithHiddenStop(): RawCollectionData {
  const base = mondayCollection();
  return {
    ...base,
    stops: base.stops.map((s) =>
      s.position === 600 ? { ...s, hidden_from_client: true } : s,
    ),
  };
}

/** Variante con una propiedad archivada. */
export function mondayWithArchivedProperty(): RawCollectionData {
  const base = mondayCollection();
  return {
    ...base,
    stops: base.stops.map((s) =>
      s.position === 500
        ? {
            ...s,
            property: {
              ...s.property,
              archived_at: "2026-08-16T00:00:00Z",
              status: "archived",
            },
          }
        : s,
    ),
  };
}
