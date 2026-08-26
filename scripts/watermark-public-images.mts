// §14 · MARCA DE AGUA en las imágenes que el cliente VE HOY.
//
// Analizar las ~16.000 fotos clasificadas costaría ~1.600 llamadas de visión
// para proteger, en su mayoría, imágenes que nadie llega a ver. Esta pasada
// mira solo las que están en público ahora mismo:
//
//   · la portada (hero) de cada propiedad activa;
//   · la foto que encabeza cada capítulo, con el MISMO algoritmo de selección
//     que usa el SmartLink (clase compatible, primera libre, prefiriendo las
//     limpias);
//   · la primera de la galería, que es lo siguiente que se abre.
//
// Y solo aquellas cuyo dato de marca de agua todavía no se conoce.
//
// Uso (VPS): node scripts/watermark-public.bundle.cjs [--confirm] [--limit=N]

import { createAdminClient } from "../lib/db/admin";
import { aiComplete } from "../lib/services/ai/chat";

/** Mismo mapa capítulo→clases que el renderer público. */
const CHAPTER_PHOTO_CLASSES: Record<string, string[]> = {
  living: ["living_room", "dining"],
  kitchen: ["kitchen"],
  private: ["bedroom", "bathroom"],
  outdoor: ["terrace_outdoor", "garden", "pool", "view"],
  finishes: [],
  building: ["facade_building"],
};
const CHAPTER_ORDER = ["living", "kitchen", "private", "outdoor", "finishes", "building"];

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
        required: ["index", "watermark"],
        properties: {
          index: { type: "integer" },
          watermark: { type: "boolean" },
        },
      },
    },
  },
} as const;

const SYSTEM = `Miras fotos de anuncios inmobiliarios. Para CADA una dices solo
si lleva MARCA DE AGUA encima: el logo, el nombre o el rótulo de un portal o de
otra agencia (Idealista, Fotocasa, Habitaclia, pisos.com, Redpiso, Engel &
Völkers…), una banda con teléfono o web, o un sello de "vendido"/"reservado"
sobrepuesto.

No cuenta como marca de agua un letrero que forme parte de la escena real
(el rótulo de una tienda en la calle, un cuadro con texto), ni la firma
discreta de un fotógrafo integrada en la esquina si no tapa la imagen.`;

async function main() {
  const CONFIRM = process.argv.includes("--confirm");
  const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? 0);
  if (!CONFIRM) console.log("[watermark] sin --confirm → DRY-RUN");

  const db = createAdminClient() as any;

  const props: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("properties")
      .select("id, bc_reference")
      .is("archived_at", null)
      .neq("status", "archived")
      .range(from, from + 999);
    if (!data?.length) break;
    props.push(...data);
    if (data.length < 1000) break;
  }

  // Capítulos publicados por propiedad (para saber qué fotos se usan).
  const chaptersByProp = new Map<string, string[]>();
  {
    const { data: versions } = await db
      .from("property_story_versions")
      .select("id, property_id")
      .eq("status", "approved");
    const ids = (versions ?? []).map((v: any) => v.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data: blocks } = await db
        .from("property_story_blocks")
        .select("version_id, chapter, status")
        .in("version_id", ids.slice(i, i + 100))
        .eq("status", "approved");
      for (const b of blocks ?? []) {
        const v = (versions ?? []).find((x: any) => x.id === b.version_id);
        if (!v) continue;
        const list = chaptersByProp.get(v.property_id) ?? [];
        if (!list.includes(b.chapter)) list.push(b.chapter);
        chaptersByProp.set(v.property_id, list);
      }
    }
  }

  type Pub = { id: string; url: string; role: string; ref: string; propertyId: string };
  const publicPhotos: Pub[] = [];
  for (const p of props) {
    const { data: photos } = await db
      .from("property_photos")
      .select("id, url, position, ai_class, ai_confidence, class_override, ai_watermark")
      .eq("property_id", p.id)
      .order("position");
    if (!photos?.length) continue;

    const classOf = (ph: any) => {
      if (ph.class_override) return ph.class_override;
      if (!ph.ai_class) return null;
      const floor = ph.ai_class === "facade_building" ? 0.85 : 0.75;
      return (ph.ai_confidence ?? 0) >= floor ? ph.ai_class : null;
    };

    const used = new Set<number>([0]);
    publicPhotos.push({ id: photos[0].id, url: photos[0].url, role: "hero", ref: p.bc_reference, propertyId: p.id });
    if (photos[1]) {
      publicPhotos.push({ id: photos[1].id, url: photos[1].url, role: "galería", ref: p.bc_reference, propertyId: p.id });
    }

    const chapters = (chaptersByProp.get(p.id) ?? []).filter((c) => CHAPTER_ORDER.includes(c));
    for (const chapter of CHAPTER_ORDER.filter((c) => chapters.includes(c))) {
      const wanted = CHAPTER_PHOTO_CLASSES[chapter] ?? [];
      const candidates = photos
        .map((_: any, i: number) => i)
        .filter((i: number) => !used.has(i) && wanted.includes(classOf(photos[i]) ?? ""));
      const idx = candidates.find((i: number) => photos[i].ai_watermark !== true) ?? candidates[0];
      if (idx == null) continue;
      used.add(idx);
      publicPhotos.push({ id: photos[idx].id, url: photos[idx].url, role: `cap:${chapter}`, ref: p.bc_reference, propertyId: p.id });
    }
  }

  // Solo lo que no se sabe todavía.
  const known = new Map<string, boolean | null>();
  {
    const ids = [...new Set(publicPhotos.map((x) => x.id))];
    for (let i = 0; i < ids.length; i += 120) {
      const { data } = await db
        .from("property_photos")
        .select("id, ai_watermark")
        .in("id", ids.slice(i, i + 120));
      for (const r of data ?? []) known.set(r.id, r.ai_watermark);
    }
  }
  const seen = new Set<string>();
  const pending = publicPhotos.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return known.get(x.id) == null;
  });

  console.log(`[watermark] imágenes públicas: ${seen.size} · sin dato: ${pending.length}`);
  const todo = LIMIT ? pending.slice(0, LIMIT) : pending;

  let marked = 0;
  let failed = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const raw = await aiComplete({
        system: SYSTEM,
        userText: `¿Llevan marca de agua estas ${batch.length} fotos? (index 0..${batch.length - 1}, en orden)`,
        images: batch.map((x) => x.url),
        maxTokens: 900,
        jsonSchema: SCHEMA as unknown as Record<string, unknown>,
        strictImages: true,
      });
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as {
        photos: Array<{ index: number; watermark: boolean }>;
      };
      for (const r of parsed.photos ?? []) {
        const ph = batch[r.index];
        if (!ph) continue;
        if (r.watermark) {
          marked++;
          console.log(`  ⚑ ${ph.ref} [${ph.role}]`);
        }
        if (CONFIRM) {
          await db.from("property_photos").update({ ai_watermark: r.watermark === true }).eq("id", ph.id);
        }
      }
    } catch (e: any) {
      failed += batch.length;
      console.log(`  ✗ lote ${i}: ${e?.message?.slice(0, 60)}`);
    }
    if (i % 160 === 0) console.log(`  … ${i + batch.length}/${todo.length}`);
  }

  console.log(`\nPUBLIC IMAGES CHECKED: ${todo.length}`);
  console.log(`WATERMARKED PUBLIC IMAGES: ${marked}`);
  console.log(`FALLOS: ${failed}`);
  process.exit(0);
}

void main();
