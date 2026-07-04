import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { DESCRIPTION_STYLE, enforceAgencyOpening } from "@/lib/services/idealista/description-style";

// Lee las fotos del inmueble con IA (visión) y COMPLETA la ficha con lo que se
// puede deducir de las imágenes: título, descripción, tipo, estado, amueblado,
// extras visibles y una ESTIMACIÓN de dormitorios/baños. Nunca inventa datos que
// no están en las fotos (m², precio, dirección, año): esos quedan para el usuario.
// El proveedor de IA se elige por env / panel — ver lib/services/ai/chat.ts.

const MAX_VISION_PHOTOS = 12;

const SYSTEM_PROMPT = `Eres un agente inmobiliario experto que redacta fichas para Idealista (España) a partir de FOTOS de un inmueble. Analiza TODAS las fotos y rellena el esquema.

Reglas:
- Escribe "title": un título comercial breve y atractivo en español (máx ~70 caracteres), basado en lo que se ve (tipo de vivienda, luz, estado, ambiente) y, si se conoce, la zona.
- Escribe "description" siguiendo ESTE estilo y formato:
${DESCRIPTION_STYLE}
- "propertyType": el tipo que mejor encaje (flat, house, studio no existe como tipo: usa "flat" y marca isStudio).
- "isStudio"/"isPenthouse"/"isDuplex": true si se ve claramente.
- "bedrooms"/"bathrooms": ESTIMA a partir de las fotos (cuenta dormitorios y baños distintos que veas). Si no puedes estimarlo con confianza, pon 0.
- "condition": "new" si parece a estrenar, "to-reform"/"needs-reform" si está anticuado o con desperfectos, si no "good".
- "equipmentType": "furnished" si está claramente amueblado, "empty" si está vacío, "kitchen-only" si solo la cocina está equipada, "unknown" si no se aprecia.
- Extras (true solo si se ven con claridad): hasTerrace, hasBalcony, hasPool, hasGarden, hasAC, hasWardrobes, hasElevator.
- "detected": lista breve en español de lo relevante que has visto (p.ej. "cocina equipada", "2 dormitorios", "terraza").
- NO estimes m², precio, dirección ni año: no están en las fotos.
- Responde ÚNICAMENTE con el objeto JSON pedido.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    propertyType: {
      type: "string",
      enum: ["flat", "house", "rustic", "commercial", "office", "land", "storage", "building", "room", "garage"],
    },
    isStudio: { type: "boolean" },
    isPenthouse: { type: "boolean" },
    isDuplex: { type: "boolean" },
    bedrooms: { type: "integer" },
    bathrooms: { type: "integer" },
    condition: { type: "string", enum: ["good", "to-reform", "needs-reform", "new"] },
    equipmentType: { type: "string", enum: ["furnished", "kitchen-only", "empty", "unknown"] },
    hasTerrace: { type: "boolean" },
    hasBalcony: { type: "boolean" },
    hasPool: { type: "boolean" },
    hasGarden: { type: "boolean" },
    hasAC: { type: "boolean" },
    hasWardrobes: { type: "boolean" },
    hasElevator: { type: "boolean" },
    detected: { type: "array", items: { type: "string" } },
  },
  required: [
    "title",
    "description",
    "propertyType",
    "isStudio",
    "isPenthouse",
    "isDuplex",
    "bedrooms",
    "bathrooms",
    "condition",
    "equipmentType",
    "hasTerrace",
    "hasBalcony",
    "hasPool",
    "hasGarden",
    "hasAC",
    "hasWardrobes",
    "hasElevator",
    "detected",
  ],
};

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { photos?: string[]; addressCity?: string; addressStreet?: string }
    | null;
  const photos = (body?.photos ?? [])
    .filter((u) => typeof u === "string" && u.startsWith("http"))
    .slice(0, MAX_VISION_PHOTOS);

  if (photos.length === 0) {
    return Response.json({ error: "Añade fotos a la ficha antes de analizarlas." }, { status: 400 });
  }

  // Zona/calle (si el usuario las indicó): la IA las usa en título y descripción.
  // La calle solo se usa si viene dada; la IA nunca se la inventa.
  const zone = (body?.addressCity ?? "").trim();
  const street = (body?.addressStreet ?? "").trim();
  const locationCtx =
    zone || street
      ? `\n\nUbicación (úsala en título y descripción, no la inventes): ${[street, zone].filter(Boolean).join(", ")}.`
      : "\n\nNo se conoce el barrio: no menciones zona ni calle concretas.";

  let raw: string;
  try {
    raw = await aiComplete({
      system: SYSTEM_PROMPT,
      userText: `Analiza estas ${photos.length} fotos del inmueble y completa la ficha (esquema JSON).${locationCtx}`,
      images: photos,
      maxTokens: 2200,
      jsonSchema: SCHEMA,
    });
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Error al analizar las fotos" },
      { status: 502 },
    );
  }

  // Parseo defensivo: algunos proveedores devuelven el JSON envuelto en texto.
  let suggestion: Record<string, unknown> | null = null;
  try {
    suggestion = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        suggestion = JSON.parse(m[0]);
      } catch {
        suggestion = null;
      }
    }
  }

  if (!suggestion) {
    return Response.json({ error: "Respuesta de la IA no interpretable" }, { status: 502 });
  }

  // La descripción debe empezar por la apertura de la agencia, salga el modelo que salga.
  if (typeof suggestion.description === "string") {
    suggestion.description = enforceAgencyOpening(suggestion.description);
  }

  return Response.json({ suggestion, photosUsed: photos.length });
}
