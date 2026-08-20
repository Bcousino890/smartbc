// SmartLink 2.0 · clasificación persistente de fotos (foto→capítulo).
//
// Reutiliza el MISMO cliente de visión que analyze-photos (aiComplete con
// downscale server-side), pero PERSISTE el resultado en property_photos:
// hasta ahora todo análisis de visión era efímero. Caché por hash de
// (url+modelo): re-clasificar solo si cambia la foto o el modelo.
// `class_override` (humano) manda siempre sobre `ai_class`.

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete } from "@/lib/services/ai/chat";

export const PHOTO_CLASSES = [
  "living_room",
  "kitchen",
  "bedroom",
  "bathroom",
  "terrace_outdoor",
  "facade_building",
  "dining",
  "office",
  "view",
  "pool",
  "garden",
  "garage",
  "floor_plan",
  "other",
] as const;
export type PhotoClass = (typeof PHOTO_CLASSES)[number];

const MODEL_TAG = "photo-classify-v1";
const BATCH = 10;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["photos"],
  properties: {
    photos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "class", "confidence"],
        properties: {
          index: { type: "integer" },
          class: { enum: [...PHOTO_CLASSES] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

const SYSTEM = `Clasificas fotos de una vivienda en venta/alquiler en Madrid.
Para CADA foto devuelve su clase y confianza. Clases: living_room (salón),
kitchen (cocina), bedroom (dormitorio), bathroom (baño), terrace_outdoor
(terraza/balcón/exterior privado), facade_building (fachada/portal/edificio/calle),
dining (comedor separado), office (despacho), view (vistas desde la vivienda),
pool (piscina), garden (jardín), garage (garaje/trastero), floor_plan (plano), other.
Si dudas entre dos, elige la dominante y baja la confianza. No inventes.`;

export type ClassifySummary = { classified: number; skipped: number; failed: number };

export async function classifyPropertyPhotos(propertyId: string): Promise<ClassifySummary> {
  const db = createAdminClient() as any;
  const { data: photos } = await db
    .from("property_photos")
    .select("id, url, ai_source_hash, class_override")
    .eq("property_id", propertyId)
    .order("position");
  const summary: ClassifySummary = { classified: 0, skipped: 0, failed: 0 };
  const pending = (photos ?? []).filter((p: any) => {
    if (p.class_override) return false; // el humano ya decidió
    const hash = sha(p.url + MODEL_TAG);
    return p.ai_source_hash !== hash;
  });
  if (pending.length === 0) {
    summary.skipped = photos?.length ?? 0;
    return summary;
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    try {
      const raw = await aiComplete({
        system: SYSTEM,
        userText: `Clasifica estas ${batch.length} fotos (index 0..${batch.length - 1}, en el mismo orden).`,
        images: batch.map((p: any) => p.url),
        maxTokens: 1500,
        jsonSchema: SCHEMA as unknown as Record<string, unknown>,
        strictImages: true,
      });
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as {
        photos: Array<{ index: number; class: PhotoClass; confidence: number }>;
      };
      for (const r of parsed.photos ?? []) {
        const photo = batch[r.index];
        if (!photo || !PHOTO_CLASSES.includes(r.class)) continue;
        await db
          .from("property_photos")
          .update({
            ai_class: r.class,
            ai_confidence: r.confidence,
            ai_source_hash: sha(photo.url + MODEL_TAG),
            ai_model: MODEL_TAG,
            classified_at: new Date().toISOString(),
          })
          .eq("id", photo.id);
        summary.classified++;
      }
    } catch {
      summary.failed += batch.length;
    }
  }
  return summary;
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
