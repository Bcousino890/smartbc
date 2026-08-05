import type {
  IdealistaAddress,
  IdealistaFeatures,
  IdealistaOperationType,
  IdealistaPropertyCreate,
  IdealistaPropertyType,
} from "./types";

// Mapea el property_type interno de SmartBC (mismas claves que
// lib/services/idealista/selectors.ts PROPERTY_TYPE_MAP) al enum del Partner API.
const API_TYPE_MAP: Record<string, IdealistaPropertyType> = {
  apartment: "flat",
  flat: "flat",
  piso: "flat",
  house: "house",
  chalet: "house",
  rustic: "countryhouse",
  room: "room",
  habitacion: "room",
  commercial: "commercial",
  local: "commercial",
  garage: "garage",
  office: "office",
  land: "land",
  storage: "storage",
  building: "building",
};

function toApiConservation(condition: string | null | undefined): string | undefined {
  switch (condition) {
    case "good":
      return "good";
    case "to-reform":
      return "to_reform";
    case "needs-reform":
      return "needs_reform";
    default:
      return undefined;
  }
}

function toApiVisibility(visibility: string | null | undefined): IdealistaAddress["visibility"] {
  if (visibility === "exact") return "exact";
  if (visibility === "street") return "street";
  // Idealista requiere al menos visibilidad de calle en el Partner API; "hidden"/"none"
  // del formulario web no tiene equivalente documentado, así que degradamos a "street".
  return "street";
}

function toApiWindowsLocation(location: string | null | undefined): string | undefined {
  if (location === "exterior") return "external";
  if (location === "interior") return "internal";
  return undefined;
}

// Fila completa de la tabla idealista_listings (ver
// app/api/admin/publicacion/save-idealista-listing/route.ts para el shape exacto).
export function mapListingToIdealistaApiPayload(
  listing: Record<string, any>,
  contactId: number,
  photoUrls: string[]
): IdealistaPropertyCreate {
  const type = API_TYPE_MAP[listing.property_type ?? "flat"] ?? "flat";
  const operation: IdealistaOperationType = listing.operation === "sale" ? "sale" : "rent";

  const address: IdealistaAddress = {
    address: listing.address_street || undefined,
    number: listing.has_no_number ? undefined : listing.address_number || undefined,
    postalCode: listing.address_postal_code || undefined,
    latitude: listing.latitude ?? undefined,
    longitude: listing.longitude ?? undefined,
    floor: listing.floor || undefined,
    visibility: toApiVisibility(listing.address_visibility),
  };

  const price = operation === "rent" ? listing.total_rental_price ?? listing.price : listing.price;

  const features: IdealistaFeatures = {
    areaConstructed: listing.built_square_meters ?? listing.square_meters ?? undefined,
    areaUsable: listing.square_meters ?? undefined,
    bedroomNumber: listing.bedrooms ?? undefined,
    bathroomNumber: listing.bathrooms ?? undefined,
    rooms: listing.bedrooms ?? undefined,
    builtYear: listing.construction_year ?? undefined,
    conditionedAir: listing.has_ac ?? undefined,
    conservation: toApiConservation(listing.condition),
    energyCertificateRating: listing.energy_class || undefined,
    energyCertificatePerformance: listing.energy_performance ?? undefined,
    energyCertificateEmissionsRating: listing.emission_rating || undefined,
    energyCertificateEmissionsValue: listing.emission_value ?? undefined,
    isInTopFloor: listing.is_last_floor ?? undefined,
    garden: listing.has_garden ?? undefined,
    handicappedAdaptedAccess: listing.has_adapted_access ?? undefined,
    handicappedAdaptedUse: listing.has_wheelchair_access ?? undefined,
    liftAvailable: listing.has_elevator ?? undefined,
    orientationNorth: listing.orientation_north ?? undefined,
    orientationSouth: listing.orientation_south ?? undefined,
    orientationEast: listing.orientation_east ?? undefined,
    orientationWest: listing.orientation_west ?? undefined,
    parkingAvailable: listing.has_parking ?? undefined,
    penthouse: listing.is_penthouse ?? undefined,
    petsAllowed: listing.pets_allowed ?? undefined,
    tenantNumber: listing.max_tenants ?? undefined,
    pool: listing.has_pool ?? undefined,
    storage: listing.has_storage ?? undefined,
    studio: listing.is_studio ?? undefined,
    duplex: listing.is_duplex ?? undefined,
    terrace: listing.has_terrace ?? undefined,
    balcony: listing.has_balcony ?? undefined,
    wardrobes: listing.has_wardrobes ?? undefined,
    windowsLocation: toApiWindowsLocation(listing.windows_location),
    heatingType: listing.heating_type && listing.heating_type !== "unknown" ? listing.heating_type : undefined,
    priceCommunity: listing.community_fees ?? undefined,
    cadastralReference: listing.cadastral_reference || undefined,
  };

  return {
    type,
    address,
    reference: listing.reference_code || undefined,
    contactId,
    features,
    operation: { price: price ?? 0, type: operation },
    descriptions: listing.description ? [{ language: "es", description: listing.description }] : undefined,
    additionalLink: listing.external_link || undefined,
    scope: "idealista",
  };
}

export function mapPhotosToIdealistaImages(photoUrls: string[]): Array<{ url: string }> {
  return photoUrls.map((url) => ({ url }));
}
