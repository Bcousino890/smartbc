// La marca de agua PROPIA no es un defecto.
//
// La detección de marca de agua se hizo para no encabezar un capítulo con el
// logo de otro portal. Pero muchas fotos vienen de re-importar NUESTROS
// PROPIOS anuncios de Idealista, y ahí la marca impresa es la de Benjamín
// Cousiño Propiedades: 211 de las 423 fotos de esa procedencia estaban
// marcadas, y por eso el hero se movía a otra foto sin motivo.
//
// Esta pasada vuelve a mirar SOLO las marcadas de ese origen y distingue la
// marca propia de la ajena. La propia se desmarca (`ai_watermark = false`):
// no es algo de lo que haya que huir.
//
// Uso (VPS): node scripts/own-watermark.bundle.cjs [--confirm]

import { createAdminClient } from "../lib/db/admin";
import { aiComplete } from "../lib/services/ai/chat";

const BATCH = 8;

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
        required: ["index", "owner"],
        properties: {
          index: { type: "integer" },
          owner: { enum: ["bcp", "otra", "ninguna"] },
        },
      },
    },
  },
} as const;

const SYSTEM = `Todas estas fotos llevan algún rótulo o logo sobreimpreso. Para
CADA una dices de quién es:

- "bcp": es de Benjamín Cousiño Propiedades. Suele aparecer como "BENJAMÍN
  COUSIÑO" con "PROPIEDADES" debajo, en tipografía serif fina y gris, centrado
  y semitransparente. También cuenta cualquier variante con ese nombre.
- "otra": el logo o rótulo es de OTRO portal o agencia (Idealista, Fotocasa,
  Habitaclia, pisos.com, Redpiso, Engel & Völkers, Century 21…), una banda con
  teléfono o web ajenos, o un sello de vendido/reservado de un tercero.
- "ninguna": mirándola bien, no hay ninguna marca sobreimpresa.

Ante la duda entre "bcp" y "otra", responde "otra": dejar puesta la marca de un
competidor es el error caro.`;

async function main() {
  const CONFIRM = process.argv.includes("--confirm");
  if (!CONFIRM) console.log("[marca] sin --confirm → DRY-RUN");

  const db = createAdminClient() as any;
  const rows: any[] = [];
  for (let from = 0; ; from += 500) {
    const { data } = await db
      .from("property_photos")
      .select("id, url")
      .eq("ai_watermark", true)
      .like("url", "%portales-externos%")
      .range(from, from + 499);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 500) break;
  }
  console.log(`[marca] fotos marcadas de anuncios republicados: ${rows.length}`);

  const tally = { bcp: 0, otra: 0, ninguna: 0, fallos: 0 };
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    try {
      const raw = await aiComplete({
        system: SYSTEM,
        userText: `¿De quién es la marca de estas ${batch.length} fotos? (index 0..${batch.length - 1}, en orden)`,
        images: batch.map((p: any) => p.url),
        maxTokens: 900,
        jsonSchema: SCHEMA as unknown as Record<string, unknown>,
        strictImages: true,
      });
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as {
        photos: Array<{ index: number; owner: "bcp" | "otra" | "ninguna" }>;
      };
      for (const r of parsed.photos ?? []) {
        const ph = batch[r.index];
        if (!ph) continue;
        tally[r.owner]++;
        // Solo la marca AJENA sigue contando como marca de agua.
        if (r.owner !== "otra" && CONFIRM) {
          await db.from("property_photos").update({ ai_watermark: false }).eq("id", ph.id);
        }
      }
    } catch (e: any) {
      tally.fallos += batch.length;
      console.log(`  ✗ lote ${i}: ${e?.message?.slice(0, 60)}`);
    }
    if (i % 80 === 0) console.log(`  … ${i + batch.length}/${rows.length}`);
  }
  console.log(`\n[marca] propia=${tally.bcp} · ajena=${tally.otra} · sin marca=${tally.ninguna} · fallos=${tally.fallos}`);
  process.exit(0);
}

void main();
