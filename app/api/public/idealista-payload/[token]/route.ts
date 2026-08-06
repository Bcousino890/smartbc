import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { verifyPublishToken } from "@/lib/services/idealista/publish-token";
import { PROPERTY_TYPE_MAP } from "@/lib/services/idealista/selectors";

// Público a propósito: lo consume la extensión de Chrome desde idealista.com.
// La seguridad la da el token firmado (HMAC, expira a los 30 min, un solo listingId).
const ALLOWED_ORIGIN = "https://www.idealista.com";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    return await handleGet(req, params);
  } catch (err) {
    // Cualquier excepción no controlada (DB caída, env var faltante, etc.)
    // debe seguir devolviendo los headers CORS — si no, Chrome la muestra
    // como "Failed to fetch"/bloqueo CORS sin ningún detalle real del error,
    // y la extensión no puede mostrarle al usuario qué pasó de verdad.
    console.error("[idealista-payload] Error inesperado:", err);
    const message = err instanceof Error ? err.message : "Error inesperado";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders() });
  }
}

async function handleGet(req: Request, paramsPromise: Promise<{ token: string }>) {
  const { token } = await paramsPromise;
  const verified = verifyPublishToken(token);
  if (!verified) {
    return Response.json({ error: "Token inválido o expirado" }, { status: 401, headers: corsHeaders() });
  }

  const db = createAdminClient() as any;
  const { data: l } = await db
    .from("idealista_listings")
    .select("*")
    .eq("id", verified.listingId)
    .single();

  if (!l) {
    return Response.json({ error: "Ficha no encontrada" }, { status: 404, headers: corsHeaders() });
  }

  const origin = process.env.NEXT_PUBLIC_PORTAL_URL ?? new URL(req.url).origin;
  const toAbsolute = (u: string) => (u.startsWith("http") ? u : `${origin}${u}`);

  const payload = {
    id: l.id,
    title: l.inspo_title ?? "",
    referenceCode: l.reference_code ?? "",
    propertyType: l.property_type ?? "flat",
    propertyTypeLabel: PROPERTY_TYPE_MAP[l.property_type ?? "flat"] ?? "Piso",
    operation: l.operation ?? "rent",
    cadastralReference: l.cadastral_reference ?? "",

    addressStreet: l.address_street ?? "",
    addressNumber: l.address_number ?? "",
    hasNoNumber: !!l.has_no_number,
    addressPostalCode: l.address_postal_code ?? "",
    addressCity: l.address_city ?? "",
    addressBlock: l.address_block ?? "",
    addressDoor: l.address_door ?? "",
    buildingName: l.building_name ?? "",
    isLastFloor: !!l.is_last_floor,
    addressVisibility: l.address_visibility ?? "exact",

    squareMeters: l.square_meters ?? null,
    builtSquareMeters: l.built_square_meters ?? null,
    floor: l.floor ?? "",
    bedrooms: l.bedrooms ?? 0,
    bathrooms: l.bathrooms ?? 0,
    condition: l.condition ?? "good",

    price: l.price ?? null,
    communityFees: l.community_fees ?? null,
    saleException: l.sale_exception ?? "none",
    totalRentalPrice: l.total_rental_price ?? null,
    rentalType: l.rental_type ?? "residential",
    maxTenants: l.max_tenants ?? null,
    petsAllowed: !!l.pets_allowed,
    childrenRecommended: !!l.children_recommended,

    equipmentType: l.equipment_type ?? "unknown",
    windowsLocation: l.windows_location ?? "exterior",
    hasElevator: !!l.has_elevator,
    isBankProperty: !!l.is_bank_property,
    heatingType: l.heating_type ?? "unknown",
    heatingFuel: l.heating_fuel ?? "unknown",
    constructionYear: l.construction_year ?? null,
    hasAdaptedAccess: !!l.has_adapted_access,
    hasWheelchairAccess: !!l.has_wheelchair_access,

    orientationNorth: !!l.orientation_north,
    orientationSouth: !!l.orientation_south,
    orientationEast: !!l.orientation_east,
    orientationWest: !!l.orientation_west,

    hasTerrace: !!l.has_terrace,
    hasBalcony: !!l.has_balcony,
    hasParking: !!l.has_parking,
    hasStorage: !!l.has_storage,
    hasPool: !!l.has_pool,
    hasGarden: !!l.has_garden,
    hasWardrobes: !!l.has_wardrobes,
    hasAC: !!l.has_ac,

    // OR con property_type: si eligieron "Ático/Estudio/Dúplex" en el selector
    // de tipo pero no marcaron también el chip correspondiente, igual se debe
    // marcar la subtipología en Idealista (si no, el campo queda vacío y el
    // formulario lo marca como error).
    isPenthouse: !!l.is_penthouse || l.property_type === "penthouse",
    isStudio: !!l.is_studio || l.property_type === "studio",
    isDuplex: !!l.is_duplex || l.property_type === "duplex",

    energyClass: l.energy_class ?? "",
    energyPerformance: l.energy_performance ?? null,
    emissionRating: l.emission_rating ?? "",
    emissionValue: l.emission_value ?? null,

    description: l.description ?? "",
    externalLink: l.external_link ?? "",
    internalReference: l.reference_code ?? "",
    notes: l.notes ?? "",

    photos: ((l.photo_ids ?? []) as string[]).map(toAbsolute),
  };

  return Response.json(payload, { headers: corsHeaders() });
}
