// Marca de agua en TODAS las fotos de una ficha concreta.
// Uso (VPS): node scripts/watermark-one.bundle.cjs BC-1419 [--confirm]
import { createAdminClient } from "../lib/db/admin";
import { aiComplete } from "../lib/services/ai/chat";

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["photos"],
  properties: { photos: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["index", "owner"],
    properties: { index: { type: "integer" }, owner: { enum: ["bcp", "otra", "ninguna"] } },
  } } },
} as const;

const SYSTEM = `Para CADA foto di si lleva una marca de agua sobreimpresa y de quién:
- "bcp": es de Benjamín Cousiño Propiedades.
- "otra": es de otro portal o agencia (Engel & Völkers, Idealista, Fotocasa, Redpiso, Century 21…).
- "ninguna": no hay marca sobreimpresa.
Ante la duda entre bcp y otra, responde "otra".`;

async function main() {
  const ref = process.argv[2];
  const CONFIRM = process.argv.includes("--confirm");
  const db = createAdminClient() as any;
  const { data: prop } = await db.from("properties").select("id").eq("bc_reference", ref).maybeSingle();
  if (!prop) { console.log("no existe"); process.exit(1); }
  const { data: photos } = await db.from("property_photos")
    .select("id, url, position").eq("property_id", prop.id).order("position");
  console.log(`[${ref}] fotos: ${photos?.length ?? 0}`);
  const tally = { bcp: 0, otra: 0, ninguna: 0 };
  const clean: number[] = [];
  for (let i = 0; i < (photos ?? []).length; i += 8) {
    const batch = photos.slice(i, i + 8);
    try {
      const raw = await aiComplete({
        system: SYSTEM,
        userText: `¿Marca de agua en estas ${batch.length}? (index 0..${batch.length - 1})`,
        images: batch.map((p: any) => p.url), maxTokens: 900,
        jsonSchema: SCHEMA as unknown as Record<string, unknown>, strictImages: true,
      });
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw);
      for (const r of parsed.photos ?? []) {
        const ph = batch[r.index]; if (!ph) continue;
        tally[r.owner as keyof typeof tally]++;
        if (r.owner === "ninguna") clean.push(ph.position);
        if (CONFIRM) await db.from("property_photos").update({ ai_watermark: r.owner === "otra" }).eq("id", ph.id);
      }
    } catch (e: any) { console.log(`  ✗ lote ${i}: ${e?.message?.slice(0, 50)}`); }
  }
  console.log(`propia=${tally.bcp} · AJENA=${tally.otra} · sin marca=${tally.ninguna}`);
  console.log(`posiciones limpias: ${clean.length ? clean.sort((a,b)=>a-b).join(", ") : "NINGUNA"}`);
  process.exit(0);
}
void main();
