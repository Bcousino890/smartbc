import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";

// Analiza las fotos del inmueble con IA (visión) y devuelve SUGERENCIAS solo para
// campos que se pueden ver en las imágenes: extras visibles (terraza, piscina...),
// estado y amueblado. NUNCA infiere datos duros (m², habitaciones, precio): esos
// no están en las fotos y se los inventaría.
// El proveedor de IA se elige por env — ver lib/services/ai/chat.ts.

const MAX_VISION_PHOTOS = 10;

const SYSTEM_PROMPT = `Eres un tasador inmobiliario que analiza ÚNICAMENTE lo que se ve en las fotos de un inmueble.

Reglas estrictas:
- Marca un extra como true SOLO si lo ves con claridad en alguna foto.
- NO infieras metros cuadrados, número de habitaciones ni baños, precio, año, ni nada que no sea visible: eso no es tu tarea.
- Para "condition" (estado): "new" si parece a estrenar/obra nueva, "needs-reform" o "to-reform" si se ven desperfectos o está anticuado, si no "good".
- Para "equipmentType": "furnished" si está claramente amueblado, "empty" si está vacío, "kitchen-only" si solo la cocina está equipada, "unknown" si no se aprecia.
- En "detected" lista en español y breve lo que has visto que justifica las marcas (p.ej. "terraza amplia", "piscina comunitaria", "cocina equipada").
- Responde ÚNICAMENTE con el objeto JSON pedido, sin texto adicional.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    hasTerrace: { type: "boolean" },
    hasBalcony: { type: "boolean" },
    hasPool: { type: "boolean" },
    hasGarden: { type: "boolean" },
    hasAC: { type: "boolean" },
    hasWardrobes: { type: "boolean" },
    condition: { type: "string", enum: ["good", "to-reform", "needs-reform", "new"] },
    equipmentType: { type: "string", enum: ["furnished", "kitchen-only", "empty", "unknown"] },
    detected: { type: "array", items: { type: "string" } },
  },
  required: [
    "hasTerrace",
    "hasBalcony",
    "hasPool",
    "hasGarden",
    "hasAC",
    "hasWardrobes",
    "condition",
    "equipmentType",
    "detected",
  ],
};

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { photos?: string[] } | null;
  const photos = (body?.photos ?? [])
    .filter((u) => typeof u === "string" && u.startsWith("http"))
    .slice(0, MAX_VISION_PHOTOS);

  if (photos.length === 0) {
    return Response.json({ error: "Añade fotos a la ficha antes de analizarlas." }, { status: 400 });
  }

  let raw: string;
  try {
    raw = await aiComplete({
      system: SYSTEM_PROMPT,
      userText: "Analiza estas fotos del inmueble y rellena el esquema con lo que veas.",
      images: photos,
      maxTokens: 1024,
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

  return Response.json({ suggestion });
}
