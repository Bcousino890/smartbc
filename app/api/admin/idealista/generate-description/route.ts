import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { PROPERTY_TYPE_MAP } from "@/lib/services/idealista/selectors";

// Genera la descripción del anuncio con IA (Claude) a partir de los datos de la
// ficha. Devuelve SOLO el cuerpo del texto: el footer fijo lo añade el formulario.
//
// Llamamos a la API de Claude por fetch (sin SDK) a propósito: evita añadir una
// dependencia que el VPS tendría que resolver en cada `npm install` y que, con un
// pin malo, rompería el build de producción. El formato es estable.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// claude-opus-4-8 por defecto; overridable por si se quiere abaratar (p.ej. haiku).
const MODEL = process.env.IDEALISTA_DESC_MODEL ?? "claude-opus-4-8";

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
};

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

const SYSTEM_PROMPT = `Eres un redactor experto de anuncios inmobiliarios para Idealista en España. Escribes descripciones atractivas, profesionales y honestas en español de España.

Reglas:
- Devuelve SOLO el texto de la descripción, sin títulos, sin markdown, sin comillas, sin viñetas.
- Longitud: 120-180 palabras, en 2-3 párrafos cortos.
- Usa únicamente los datos aportados; NO inventes características, medidas, ni servicios cercanos que no se indiquen.
- Destaca los puntos fuertes reales (superficie, extras, estado, zona).
- Tono cálido y comercial, sin exageraciones ni superlativos huecos.
- Termina invitando a solicitar una visita.
- No incluyas precio salvo que aporte valor comercial; nunca inventes cifras.
- No incluyas datos de contacto ni el footer (se añaden aparte).`;

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Falta ANTHROPIC_API_KEY en el servidor. Configúrala en el VPS." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as DescInput | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const facts = buildFacts(body);
  const userPrompt = `Redacta la descripción del anuncio con estos datos:\n\n${facts}`;

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch {
    return Response.json({ error: "No se pudo contactar con la IA" }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json(
      { error: `La IA devolvió un error (${res.status})`, detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  const data = (await res.json().catch(() => null)) as
    | { stop_reason?: string; content?: Array<{ type: string; text?: string }> }
    | null;

  if (!data) return Response.json({ error: "Respuesta inválida de la IA" }, { status: 502 });
  if (data.stop_reason === "refusal") {
    return Response.json({ error: "La IA no pudo generar el texto para estos datos" }, { status: 422 });
  }

  const description = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();

  if (!description) {
    return Response.json({ error: "La IA no devolvió texto" }, { status: 502 });
  }

  return Response.json({ description });
}
