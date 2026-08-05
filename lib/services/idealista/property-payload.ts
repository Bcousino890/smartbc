// Traduce una fila de idealista_listings al payload JSON que espera el
// Partner API de Idealista (POST/PUT /v1/properties y PUT .../images).
//
// ⚠️ IMPORTANTE: el swagger entregado (partnerapiv1_2.yml) define los endpoints,
// la autenticación y las reglas de negocio en texto, pero los JSON Schema exactos
// del body (jsonschemas/property/property_create.json, images_process.json, etc.)
// no se incluyeron. Los nombres de campo de abajo son la mejor traducción posible
// a partir de: los requisitos textuales del spec (code como referencia externa —
// confirmado por el error 409 "property_already_exists_for_code"—, contactId,
// operación+precio, dirección con calle+número+CP o coordenadas, características
// por tipología) y las convenciones camelCase que usa el resto del spec. Antes de
// depender de esto en producción, hay que validarlo contra sandbox y ajustar los
// nombres de campo según los primeros errores 400 (que Idealista documenta como
// respuestas de validación con detalle por campo).
import "server-only";

export interface IdealistaListingRow {
  reference_code: string | null;
  property_type: string | null;
  is_penthouse: boolean;
  is_studio: boolean;
  is_duplex: boolean;
  cadastral_reference: string | null;
  address_street: string | null;
  address_number: string | null;
  has_no_number: boolean;
  address_postal_code: string | null;
  address_city: string | null;
  address_visibility: string | null;
  latitude: number | null;
  longitude: number | null;
  square_meters: number | null;
  built_square_meters: number | null;
  floor: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  condition: string | null;
  operation: string | null;
  price: number | null;
  community_fees: number | null;
  total_rental_price: number | null;
  rental_type: string | null;
  equipment_type: string | null;
  windows_location: string | null;
  has_elevator: boolean;
  heating_type: string | null;
  construction_year: number | null;
  orientation_north: boolean;
  orientation_south: boolean;
  orientation_east: boolean;
  orientation_west: boolean;
  has_terrace: boolean;
  has_balcony: boolean;
  has_parking: boolean;
  has_storage: boolean;
  has_pool: boolean;
  has_garden: boolean;
  has_wardrobes: boolean;
  has_ac: boolean;
  energy_class: string | null;
  energy_performance: number | null;
  emission_rating: string | null;
  emission_value: number | null;
  description: string | null;
  contact_id: string | null;
  photo_ids: string[] | null;
}

// Tipologías confirmadas por el spec (sección "Property"): flats, chalets,
// country houses, offices, commercial, garages, lands, buildings, storage
// rooms, rooms. El enum exacto (singular/plural, snake_case...) no está
// confirmado — se usa singular por convención común de APIs.
const TYPOLOGY_MAP: Record<string, string> = {
  flat: "flat",
  penthouse: "flat",
  studio: "flat",
  duplex: "flat",
  house: "chalet",
  "semi-detached": "chalet",
  chalet: "chalet",
  villa: "chalet",
  land: "land",
  office: "office",
  local: "commercial",
  storage: "storage_room",
  garage: "garage",
};

const CONDITION_MAP: Record<string, string> = {
  good: "good",
  "to-reform": "renew",
  "needs-reform": "renew",
  new: "new_development",
};

const HEATING_MAP: Record<string, string> = {
  individual: "individual",
  centralized: "central",
  none: "none",
};

export function mapPropertyType(row: IdealistaListingRow): string {
  const key = (row.property_type ?? "flat").toLowerCase();
  return TYPOLOGY_MAP[key] ?? "flat";
}

export interface PropertyPayloadResult {
  payload: Record<string, unknown>;
  contactId: number;
  warnings: string[];
}

/** Construye el body para POST/PUT /v1/properties a partir de una ficha. */
export function buildPropertyPayload(row: IdealistaListingRow): PropertyPayloadResult {
  const warnings: string[] = [];

  const contactIdNum = row.contact_id ? Number(row.contact_id) : NaN;
  if (!Number.isFinite(contactIdNum)) {
    throw new Error(
      "Falta el ID de contacto de Idealista en la ficha (sección 'Contacto e info interna'). Es obligatorio para publicar por API."
    );
  }

  const hasCoordinates = !!(row.latitude && row.longitude);
  const hasStreetAddress = !!(row.address_street && row.address_postal_code && (row.address_number || row.has_no_number));
  if (!hasCoordinates && !hasStreetAddress) {
    throw new Error(
      "Falta dirección completa: indica coordenadas en el mapa, o calle + número (o 'Sin número') + código postal."
    );
  }

  const operationType = row.operation === "sale" ? "sale" : "rent";
  const price = operationType === "sale" ? row.price ?? 0 : row.total_rental_price ?? 0;
  if (!price) warnings.push("Precio en 0 — revisa el precio antes de confiar en esta publicación.");

  const orientation = [
    row.orientation_north && "north",
    row.orientation_south && "south",
    row.orientation_east && "east",
    row.orientation_west && "west",
  ].filter(Boolean) as string[];

  const payload: Record<string, unknown> = {
    code: row.reference_code ?? undefined,
    contactId: contactIdNum,
    typology: mapPropertyType(row),
    operations: [{ type: operationType, price }],
    address: {
      street: row.address_street || undefined,
      number: row.has_no_number ? undefined : row.address_number || undefined,
      postalCode: row.address_postal_code || undefined,
      city: row.address_city || undefined,
      coordinates: hasCoordinates
        ? { latitude: row.latitude, longitude: row.longitude }
        : undefined,
      showExactAddress: (row.address_visibility ?? "exact") === "exact",
    },
    characteristics: {
      size: row.square_meters || undefined,
      builtSize: row.built_square_meters || undefined,
      rooms: row.bedrooms ?? undefined,
      bathrooms: row.bathrooms ?? undefined,
      floor: row.floor || undefined,
      condition: CONDITION_MAP[row.condition ?? "good"] ?? "good",
      constructionYear: row.construction_year || undefined,
      hasLift: row.has_elevator,
      exterior: (row.windows_location ?? "exterior") === "exterior",
      hasTerrace: row.has_terrace,
      hasBalcony: row.has_balcony,
      hasParking: row.has_parking,
      hasStorageRoom: row.has_storage,
      hasSwimmingPool: row.has_pool,
      hasGarden: row.has_garden,
      hasWardrobe: row.has_wardrobes,
      hasAirConditioning: row.has_ac,
      heating: row.heating_type ? HEATING_MAP[row.heating_type] ?? undefined : undefined,
      orientation: orientation.length ? orientation : undefined,
      cadastralReference: row.cadastral_reference || undefined,
    },
    energyCertificate: row.energy_class
      ? {
          consumption: { rating: row.energy_class, value: row.energy_performance || undefined },
          emissions: row.emission_rating
            ? { rating: row.emission_rating, value: row.emission_value || undefined }
            : undefined,
        }
      : { status: "not_indicated" },
    description: row.description || undefined,
  };

  if (operationType === "rent" && row.rental_type) {
    (payload.operations as Array<Record<string, unknown>>)[0].rentalPeriod = row.rental_type;
  }
  if (operationType === "sale" && row.community_fees) {
    (payload.operations as Array<Record<string, unknown>>)[0].communityFees = row.community_fees;
  }

  return { payload, contactId: contactIdNum, warnings };
}

/** Construye el body para PUT /v1/properties/{id}/images (snapshot completo, orden = portada primero). */
export function buildImagesPayload(row: IdealistaListingRow): Record<string, unknown> | null {
  const urls = row.photo_ids ?? [];
  if (urls.length === 0) return null;
  return {
    images: urls.map((url) => ({ url })),
  };
}
