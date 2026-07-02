import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { PROPERTY_TYPE_MAP } from "@/lib/services/idealista/selectors";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { AGENCY_NAME, DESCRIPTION_STYLE, enforceAgencyOpening } from "@/lib/services/idealista/description-style";

// Genera la descripción del anuncio con IA a partir de los datos de la ficha.
// Devuelve SOLO el cuerpo del texto: el footer fijo lo añade el formulario.
// El proveedor (Claude / OpenRouter / NVIDIA / Ollama) se elige por env — ver
// lib/services/ai/chat.ts.

type DescInput = {
  inspoTitle?: string;
  propertyType?: string;
  operation?: string; // "sale" | "rent"
  addressCity?: string;
  addressStreet?: string;
  squareMeters?: number;
  bedrooms?: number;
  bathrooms?: number;
  floor?: string;
  condition?: string;
  price?: number;
  totalRentalPrice?: number;
  communityFees?: number;
  constructionYear?: number;
  hasElevator?: boolean;
  hasTerrace?: boolean;
  hasBalcony?: boolean;
  hasParking?: boolean;
  hasStorage?: boolean;
  hasPool?: boolean;
  hasGarden?: boolean;
  hasWardrobes?: boolean;
  hasAC?: boolean;
  isPenthouse?: boolean;
  isStudio?: boolean;
  isDuplex?: boolean;
  equipmentType?: string;
  heatingType?: string;
  petsAllowed?: boolean;
  // URLs de fotos: si se aportan, la IA "ve" las imágenes y describe lo que
  // realmente aparece (mejor descripción). Se limitan para acotar coste/latencia.
  photos?: string[];
};

const MAX_VISION_PHOTOS = 8;

const CONDITION_ES: Record<string, string> = {
  good: "buen estado",
  "to-reform": "a reformar",
  "needs-reform": "necesita reforma",
  new: "obra nueva / a estrenar",
};

function buildFacts(d: DescInput): string {
  const lines: string[] = [];
  const type = PROPERTY_TYPE_MAP[d.propertyType ?? "flat"] ?? "Piso";
  const special = [
    d.isPenthouse && "ático",
    d.isStudio && "estudio",
    d.isDuplex && "dúplex",
  ].filter(Boolean).join(", ");
  lines.push(`Tipo: ${type}${special ? ` (${special})` : ""}`);
  lines.push(`Operación: ${d.operation === "sale" ? "venta" : "alquiler"}`);
  if (d.addressCity) lines.push(`Zona/Ciudad: ${d.addressCity}`);
  if (d.addressStreet) lines.push(`Calle: ${d.addressStreet}`);
  if (d.squareMeters) lines.push(`Superficie: ${d.squareMeters} m²`);
  if (d.bedrooms) lines.push(`Dormitorios: ${d.bedrooms}`);
  if (d.bathrooms) lines.push(`Baños: ${d.bathrooms}`);
  if (d.floor) lines.push(`Planta: ${d.floor}`);
  if (d.condition) lines.push(`Estado: ${CONDITION_ES[d.condition] ?? d.condition}`);
  if (d.constructionYear) lines.push(`Año de construcción: ${d.constructionYear}`);
  const price = d.operation === "sale" ? d.price : d.totalRentalPrice;
  if (price) lines.push(`Precio: ${price} €${d.operation === "sale" ? "" : "/mes"}`);
  if (d.communityFees) lines.push(`Gastos de comunidad: ${d.communityFees} €`);
  if (d.equipmentType === "furnished") lines.push("Amueblado");
  else if (d.equipmentType === "kitchen-only") lines.push("Cocina equipada");
  if (d.heatingType && d.heatingType !== "unknown" && d.heatingType !== "none") {
    lines.push(`Calefacción: ${d.heatingType === "centralized" ? "central" : "individual"}`);
  }
  const extras = [
    d.hasElevator && "ascensor",
    d.hasTerrace && "terraza",
    d.hasBalcony && "balcón",
    d.hasParking && "plaza de garaje",
    d.hasStorage && "trastero",
    d.hasPool && "piscina",
    d.hasGarden && "jardín",
    d.hasWardrobes && "armarios empotrados",
    d.hasAC && "aire acondicionado",
    d.petsAllowed && "se admiten mascotas",
  ].filter(Boolean);
  if (extras.length) lines.push(`Extras: ${extras.join(", ")}`);
  if (d.inspoTitle) lines.push(`Referencia interna: ${d.inspoTitle}`);
  return lines.join("\n");
}

const SYSTEM_PROMPT = `Eres el redactor de anuncios de ${AGENCY_NAME}, una inmobiliaria premium en España.

${DESCRIPTION_STYLE}

Si se aportan fotos, básate también en lo que se ve en ellas (luz, distribución, calidades, estado, exteriores).`;

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as DescInput | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const facts = buildFacts(body);
  const photos = (body.photos ?? [])
    .filter((u) => typeof u === "string" && u.startsWith("http"))
    .slice(0, MAX_VISION_PHOTOS);
  const userPrompt =
    `Redacta la descripción del anuncio con estos datos:\n\n${facts}` +
    (photos.length ? `\n\nSe adjuntan ${photos.length} fotos del inmueble.` : "");

  try {
    const raw = await aiComplete({
      system: SYSTEM_PROMPT,
      userText: userPrompt,
      images: photos,
      maxTokens: 1600,
    });
    if (!raw) {
      return Response.json({ error: "La IA no devolvió texto" }, { status: 502 });
    }
    return Response.json({ description: enforceAgencyOpening(raw) });
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Error al generar la descripción" },
      { status: 502 },
    );
  }
}
