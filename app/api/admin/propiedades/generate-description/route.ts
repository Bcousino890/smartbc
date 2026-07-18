import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { AGENCY_NAME } from "@/lib/services/idealista/description-style";

// Genera la descripción de una propiedad (ficha del admin de Propiedades,
// ES o CL) con IA a partir de los datos del formulario + características
// marcadas + fotos ya subidas. A diferencia de
// /api/admin/idealista/generate-description (pensado solo para el formulario
// de Idealista/España), este endpoint es genérico por país: cambia moneda,
// mercado de referencia y no exige el footer/apertura fija de Idealista.

type DescInput = {
  country?: string; // "es" | "cl"
  operation?: "sale" | "rent" | string;
  zone?: string;
  address?: string;
  squareMeters?: number;
  bedrooms?: number;
  bathrooms?: number;
  price?: number;
  currency?: string; // solo CL: "uf" | "clp" | "usd"
  features?: string[];
  // URLs de fotos ya subidas: si se aportan, la IA "ve" las imágenes.
  photos?: string[];
};

const MAX_VISION_PHOTOS = 8;

const CURRENCY_LABEL: Record<string, string> = {
  uf: "UF",
  clp: "CLP",
  usd: "USD",
};

function buildFacts(d: DescInput): string {
  const isCL = d.country === "cl";
  const lines: string[] = [];
  lines.push(`Operación: ${d.operation === "sale" ? "venta" : "arriendo/alquiler"}`);
  if (d.zone) lines.push(`Zona/Comuna: ${d.zone}`);
  if (d.address) lines.push(`Dirección: ${d.address}`);
  if (d.squareMeters) lines.push(`Superficie: ${d.squareMeters} m²`);
  if (d.bedrooms) lines.push(`Dormitorios: ${d.bedrooms}`);
  if (d.bathrooms) lines.push(`Baños: ${d.bathrooms}`);
  if (d.price) {
    const currency = isCL ? CURRENCY_LABEL[d.currency ?? "clp"] ?? "CLP" : "€";
    lines.push(`Precio: ${d.price} ${currency}${d.operation === "rent" ? "/mes" : ""}`);
  }
  const features = (d.features ?? []).filter(Boolean);
  if (features.length) lines.push(`Características: ${features.join(", ")}`);
  return lines.join("\n");
}

function systemPrompt(country?: string): string {
  const isCL = country === "cl";
  const market = isCL ? "chileno" : "español";
  const portal = isCL ? "PortalInmobiliario" : "Idealista";
  return `Eres el redactor de anuncios de ${AGENCY_NAME}, una inmobiliaria premium en ${isCL ? "Chile" : "España"}.

Escribe la descripción del anuncio con un registro PREMIUM e inmobiliario de alta gama, elegante, aspiracional y evocador, sin caer en superlativos huecos ni promesas que los datos no respalden, adaptado al mercado residencial ${market} y a ${portal}.

FORMATO FIJO (180-240 palabras, 3-4 párrafos, español ${isCL ? "de Chile (sin \"vosotros\", usa \"tú\"/\"usted\" neutro)" : "de España"}):
1) Apertura: presenta el tipo de vivienda y, si se conoce, la zona/comuna. Un gancho que transmita estilo de vida.
2) La vivienda: distribución, luz, estancias, calidades y detalles que se aprecien en las fotos o los datos aportados (incluidas las características marcadas). Concreto y sensorial.
3) El entorno / estilo de vida: qué ofrece la zona (solo si se conoce); si no, habla del carácter del inmueble.
4) Cierre: una invitación elegante a concertar una visita.

Reglas:
- Usa ÚNICAMENTE datos reales aportados o visibles en las fotos. NO inventes metros, número de estancias, precio, servicios cercanos concretos ni la dirección exacta.
- No incluyas datos de contacto.
- Nada de markdown, títulos, viñetas ni comillas: solo el texto corrido en párrafos.
- Si se aportan fotos, básate también en lo que se ve en ellas (luz, distribución, calidades, estado, exteriores).`;
}

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
      system: systemPrompt(body.country),
      userText: userPrompt,
      images: photos,
      maxTokens: 1600,
    });
    if (!raw) {
      return Response.json({ error: "La IA no devolvió texto" }, { status: 502 });
    }
    return Response.json({ description: raw.trim() });
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
