// Helpers compartidos entre las dos pantallas que preparan/publican fichas de
// Idealista (/admin/idealista y /admin/publicacion), para no duplicar el
// mapeo BD -> formulario ni el checklist de "¿está lista para publicar?".
import type { IdealistaListing } from "@/app/[country]/(admin)/admin/publicacion/idealista-form";

export type DbIdealistaListing = {
  id: string;
  property_id: string | null;
  is_inspo: boolean;
  inspo_title: string | null;
  reference_code: string | null;
  property_type: string | null;
  cadastral_reference: string | null;
  address_street: string | null;
  address_number: string | null;
  has_no_number: boolean;
  address_postal_code: string | null;
  address_city: string | null;
  address_block: string | null;
  address_door: string | null;
  building_name: string | null;
  is_last_floor: boolean;
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
  sale_exception: string | null;
  total_rental_price: number | null;
  rental_type: string | null;
  max_tenants: number | null;
  pets_allowed: boolean;
  children_recommended: boolean;
  equipment_type: string | null;
  windows_location: string | null;
  has_elevator: boolean;
  is_bank_property: boolean;
  heating_type: string | null;
  construction_year: number | null;
  has_adapted_access: boolean;
  has_wheelchair_access: boolean;
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
  is_penthouse: boolean;
  is_studio: boolean;
  is_duplex: boolean;
  energy_class: string | null;
  energy_performance: number | null;
  emission_rating: string | null;
  emission_value: number | null;
  external_link: string | null;
  contact_id: string | null;
  notes: string | null;
  description: string | null;
  photo_ids: string[];
  video_ids: string[];
  plan_ids: string[];
  idealista_property_id: string | null;
  idealista_state: string | null;
  scheduled_publish_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export function listingToInitialData(
  listing: DbIdealistaListing,
  propertyId: string
): Partial<IdealistaListing> {
  return {
    // listingId: id de la fila. Necesario para que al editar (sobre todo inspos)
    // el guardado ACTUALICE en vez de insertar un duplicado.
    listingId: listing.id,
    propertyId,
    isInspo: listing.is_inspo,
    inspoTitle: listing.inspo_title ?? "",
    referenceCode: listing.reference_code ?? "",
    propertyType: listing.property_type ?? "flat",
    cadastralReference: listing.cadastral_reference ?? "",
    addressStreet: listing.address_street ?? "",
    addressNumber: listing.address_number ?? "",
    hasNoNumber: listing.has_no_number,
    addressPostalCode: listing.address_postal_code ?? "",
    addressCity: listing.address_city ?? "",
    addressBlock: listing.address_block ?? "",
    addressDoor: listing.address_door ?? "",
    buildingName: listing.building_name ?? "",
    isLastFloor: listing.is_last_floor,
    addressVisibility: (listing.address_visibility ?? "exact") as
      | "exact"
      | "street"
      | "hidden",
    latitude: listing.latitude ?? 0,
    longitude: listing.longitude ?? 0,
    squareMeters: listing.square_meters ?? 0,
    builtSquareMeters: listing.built_square_meters ?? 0,
    floor: listing.floor ?? "",
    bedrooms: listing.bedrooms ?? 0,
    bathrooms: listing.bathrooms ?? 0,
    condition: (listing.condition ?? "good") as
      | "good"
      | "to-reform"
      | "needs-reform"
      | "new",
    operation: (listing.operation ?? "rent") as "sale" | "rent",
    price: listing.price ?? 0,
    communityFees: listing.community_fees ?? 0,
    saleException: (listing.sale_exception ?? "none") as
      | "none"
      | "illegally-occupied"
      | "rented-with-tenants"
      | "bare-ownership",
    totalRentalPrice: listing.total_rental_price ?? 0,
    rentalType: (listing.rental_type ?? "residential") as
      | "residential"
      | "temporary",
    maxTenants: listing.max_tenants ?? 0,
    petsAllowed: listing.pets_allowed,
    childrenRecommended: listing.children_recommended,
    equipmentType: (listing.equipment_type ?? "unknown") as
      | "furnished"
      | "kitchen-only"
      | "empty"
      | "unknown",
    windowsLocation: (listing.windows_location ?? "exterior") as
      | "interior"
      | "exterior",
    hasElevator: listing.has_elevator,
    isBankProperty: listing.is_bank_property,
    heatingType: (listing.heating_type ?? "unknown") as
      | "individual"
      | "centralized"
      | "none"
      | "unknown",
    constructionYear: listing.construction_year ?? 0,
    hasAdaptedAccess: listing.has_adapted_access,
    hasWheelchairAccess: listing.has_wheelchair_access,
    orientationNorth: listing.orientation_north,
    orientationSouth: listing.orientation_south,
    orientationEast: listing.orientation_east,
    orientationWest: listing.orientation_west,
    hasTerrace: listing.has_terrace,
    hasBalcony: listing.has_balcony,
    hasParking: listing.has_parking,
    hasStorage: listing.has_storage,
    hasPool: listing.has_pool,
    hasGarden: listing.has_garden,
    hasWardrobes: listing.has_wardrobes,
    hasAC: listing.has_ac,
    isPenthouse: listing.is_penthouse,
    isStudio: listing.is_studio,
    isDuplex: listing.is_duplex,
    energyClass: listing.energy_class ?? "",
    energyPerformance: listing.energy_performance ?? 0,
    emissionRating: listing.emission_rating ?? "",
    emissionValue: listing.emission_value ?? 0,
    externalLink: listing.external_link ?? "",
    contactId: listing.contact_id ?? "",
    notes: listing.notes ?? "",
    description: listing.description ?? "",
    photos: listing.photo_ids ?? [],
    videos: listing.video_ids ?? [],
    plans: listing.plan_ids ?? [],
    scheduledPublishAt: listing.scheduled_publish_at ?? null,
  };
}

// Qué le falta a una ficha para estar lista para publicar en Idealista.
// Devuelve una lista de carencias en texto (vacía = ficha completa).
export function listingMissingFields(l: DbIdealistaListing): string[] {
  const missing: string[] = [];
  const photoCount = l.photo_ids?.length ?? 0;
  if (photoCount === 0) missing.push("fotos");
  else if (photoCount < 4) missing.push(`más fotos (tiene ${photoCount}, mínimo recomendable 4)`);
  if (!l.description?.trim()) missing.push("descripción");
  const price = l.operation === "rent" ? l.total_rental_price : l.price;
  if (!price) missing.push("precio");
  if (l.is_inspo && !l.inspo_title?.trim()) missing.push("título");
  if (!l.reference_code) missing.push("referencia");
  if (!l.address_city?.trim()) missing.push("zona/ciudad");
  return missing;
}

// Además del checklist "recomendado" de arriba, el Partner API real exige un
// ID de contacto de Idealista — sin él, la publicación por API falla siempre.
export function listingMissingForApi(l: DbIdealistaListing): string[] {
  const missing = listingMissingFields(l);
  if (!l.contact_id?.trim()) missing.push("ID de contacto de Idealista");
  return missing;
}
