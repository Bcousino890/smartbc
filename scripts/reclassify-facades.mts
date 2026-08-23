// LA FINCA · reclasificación estricta de las fotos "de fuera".
//
// Hasta la v1 del clasificador, `facade_building` significaba
// "fachada/portal/edificio/CALLE": una sola clase para el inmueble y para su
// entorno. Por eso el capítulo LA FINCA acabó encabezado por calles,
// escaparates, iglesias y edificios vecinos.
//
// La v2 separa `facade_building` (el inmueble: fachada, portal, zaguán,
// patio, entrada, zonas comunes) de `street_context` (todo lo demás de
// fuera). Este script vuelve a pasar por visión SOLO las fotos que hoy están
// en la clase vieja — que son las únicas que pueden alimentar LA FINCA — y de
// paso registra si llevan marca de agua (0152).
//
// Uso (VPS): node scripts/reclassify-facades.bundle.cjs [--confirm] [--limit=N]
// Sin --confirm es dry-run: dice qué cambiaría y no escribe.

import { createAdminClient } from "../lib/db/admin";
import { aiComplete } from "../lib/services/ai/chat";

const MODEL_TAG = "photo-classify-v2";
const BATCH = 8;

const SYSTEM = `Miras fotos de anuncios inmobiliarios de Madrid. Todas son "de
exterior" o de zonas comunes. Para CADA una decides una sola cosa: si muestra
EL EDIFICIO DE LA VIVIENDA o su ENTORNO.

- facade_building: el inmueble en sí. Su fachada vista de frente, el portal,
  el zaguán, la entrada, el patio interior, el rellano, la escalera, el
  ascensor, las zonas comunes (piscina o jardín comunitario, gimnasio) o un
  elemento arquitectónico claramente suyo.
- street_context: la calle, la acera, los comercios, los edificios de al lado,
  una plaza, un parque público, un monumento, una iglesia, el skyline o
  cualquier vista del barrio. Aunque salga "un" edificio bonito, si la foto
  está contando la CALLE y no el portal, es street_context.
- other: interiores, planos, fotos ilegibles o cualquier cosa que no encaje.

Ante la duda entre facade_building y street_context, elige street_context:
poner una calle cualquiera como si fuera la finca es el error caro.

Devuelve además watermark: true si la foto lleva encima el logo o el rótulo de
un portal u otra agencia (Idealista, Fotocasa, Habitaclia, pisos.com), una
banda con teléfono o web, o un sello de vendido/reservado.`;

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
        required: ["index", "class", "confidence", "watermark"],
        properties: {
          index: { type: "integer" },
          class: { enum: ["facade_building", "street_context", "other"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          watermark: { type: "boolean" },
        },
      },
    },
  },
} as const;

async function main() {
  const CONFIRM = process.argv.includes("--confirm");
  const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? 0);
  if (!CONFIRM) console.log("[fincas] sin --confirm → DRY-RUN");

  const db = createAdminClient() as any;
  const photos: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("property_photos")
      .select("id, url, property_id, ai_confidence, class_override")
      .eq("ai_class", "facade_building")
      .range(from, from + 999);
    if (!data?.length) break;
    photos.push(...data);
    if (data.length < 1000) break;
  }
  // El override humano manda: si alguien ya decidió la clase, no se toca.
  const pending = photos.filter((p) => !p.class_override).slice(0, LIMIT || photos.length);
  console.log(`[fincas] fotos en la clase vieja: ${photos.length} · a revisar: ${pending.length}`);

  const stats = { facade: 0, street: 0, other: 0, watermark: 0, failed: 0 };
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    try {
      const raw = await aiComplete({
        system: SYSTEM,
        userText: `Clasifica estas ${batch.length} fotos (index 0..${batch.length - 1}, en el mismo orden).`,
        images: batch.map((p: any) => p.url),
        maxTokens: 1200,
        jsonSchema: SCHEMA as unknown as Record<string, unknown>,
        strictImages: true,
      });
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as {
        photos: Array<{ index: number; class: string; confidence: number; watermark: boolean }>;
      };
      for (const r of parsed.photos ?? []) {
        const photo = batch[r.index];
        if (!photo) continue;
        if (r.class === "facade_building") stats.facade++;
        else if (r.class === "street_context") stats.street++;
        else stats.other++;
        if (r.watermark) stats.watermark++;
        if (CONFIRM) {
          await db
            .from("property_photos")
            .update({
              ai_class: r.class,
              ai_confidence: r.confidence,
              ai_watermark: r.watermark === true,
              ai_model: MODEL_TAG,
              classified_at: new Date().toISOString(),
            })
            .eq("id", photo.id);
        }
      }
    } catch (e: any) {
      stats.failed += batch.length;
      console.log(`  ✗ lote ${i}: ${e?.message?.slice(0, 70)}`);
    }
    if (i % 80 === 0) console.log(`  … ${i + batch.length}/${pending.length}`);
  }
  console.log(
    `\n[fincas] finca=${stats.facade} · entorno=${stats.street} · otras=${stats.other} · con marca de agua=${stats.watermark} · fallos=${stats.failed}`,
  );
  process.exit(0);
}

void main();
