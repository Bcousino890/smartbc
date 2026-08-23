// §12 · AUDITORÍA DE CALIDAD DEL HERO.
//
// Clasifica la portada de cada propiedad activa. Sin IA y sin descargar nada:
// solo metadatos (0153) y la misma aritmética que hace el navegador.
//
//   GOOD          la portada da para el hueco que ocupa;
//   MARGINAL      llega para 1× pero no para una pantalla retina;
//   WRONG_VARIANT hay OTRA foto de la misma propiedad claramente mejor —
//                 es decir, elegimos mal, no es que falte material;
//   LOW_RES_SOURCE ninguna foto de la propiedad da la talla: hace falta
//                 fotografía nueva, no código.
//
// Uso (VPS): node scripts/audit-hero.bundle.cjs [--fix]
// Con --fix solo se corrige lo corregible (WRONG_VARIANT), que en la práctica
// ya lo hace el adaptador al renderizar: aquí sirve para dar la cifra.

import { createAdminClient } from "../lib/db/admin";

/** Ancho que pide el hero a ancho completo en un portátil (1440 CSS px). */
const HERO_CSS = 1440;
/** Suficiente para 1×; por debajo, la foto se amplía siempre. */
const GOOD_1X = HERO_CSS;
/** Suficiente para una pantalla retina de verdad. */
const GOOD_2X = HERO_CSS * 2;

type Photo = {
  position: number;
  source_width: number | null;
  ai_watermark: boolean | null;
  class_override: string | null;
  ai_class: string | null;
  ai_confidence: number | null;
};

async function main() {
  const db = createAdminClient() as any;

  const props: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("properties")
      .select("id, bc_reference, slug")
      .is("archived_at", null)
      .neq("status", "archived")
      .range(from, from + 999);
    if (!data?.length) break;
    props.push(...data);
    if (data.length < 1000) break;
  }

  let autoFixed = 0;
  const buckets = {
    GOOD: [] as string[],
    MARGINAL: [] as string[],
    WRONG_VARIANT: [] as string[],
    LOW_RES_SOURCE: [] as string[],
    SIN_DATO: [] as string[],
    SIN_FOTOS: [] as string[],
  };

  for (const p of props) {
    const { data } = await db
      .from("property_photos")
      .select("position, source_width, ai_watermark, class_override, ai_class, ai_confidence")
      .eq("property_id", p.id)
      .lte("position", 7)
      .order("position");
    const photos = (data ?? []) as Photo[];
    if (!photos.length) { buckets.SIN_FOTOS.push(p.bc_reference); continue; }

    // Portada EFECTIVA: la misma regla que aplica el adaptador al renderizar
    // (marca de agua y resolución sobre las ocho primeras). Auditar la foto 0
    // en crudo daría por malas fichas que el renderer ya corrige solo.
    const raw = photos.find((x) => x.position === 0) ?? photos[0];
    const SHORT = 1440;
    let cover = raw;
    if (raw.ai_watermark || (raw.source_width != null && raw.source_width < SHORT)) {
      let bestScore = -Infinity;
      for (const cand of photos.slice(0, 8)) {
        const score =
          (cand.source_width ?? SHORT) - (cand.ai_watermark ? 4000 : 0) - cand.position * 40;
        if (score > bestScore) { bestScore = score; cover = cand; }
      }
    }
    if (cover.position !== raw.position) autoFixed++;
    if (cover.source_width == null) { buckets.SIN_DATO.push(p.bc_reference); continue; }

    // La mejor alternativa limpia entre las primeras (mismo horizonte que usa
    // el adaptador al elegir portada).
    const alternatives = photos.filter((x) => x !== cover && x.source_width != null && !x.ai_watermark);
    const bestAlt = alternatives.reduce<number>((m, x) => Math.max(m, x.source_width ?? 0), 0);

    const w = cover.source_width;
    if (w >= GOOD_2X) { buckets.GOOD.push(p.bc_reference); continue; }
    // Elegimos mal si otra foto da un salto REAL de calidad (un 25% más de
    // ancho); diferencias pequeñas no justifican cambiar la portada elegida.
    if (bestAlt >= w * 1.25 && bestAlt >= GOOD_1X) {
      buckets.WRONG_VARIANT.push(`${p.bc_reference} (${w}→${bestAlt})`);
      continue;
    }
    if (w >= GOOD_1X) { buckets.MARGINAL.push(p.bc_reference); continue; }
    buckets.LOW_RES_SOURCE.push(`${p.bc_reference} (${w}px)`);
  }

  console.log(`ACTIVE HEROES AUDITED: ${props.length}`);
  console.log(`  AUTO-FIXED (el renderer ya usa otra foto mejor): ${autoFixed}`);
  console.log(`  GOOD (≥${GOOD_2X}px, sirve hasta retina): ${buckets.GOOD.length}`);
  console.log(`  MARGINAL (≥${GOOD_1X}px, se queda corta en retina): ${buckets.MARGINAL.length}`);
  console.log(`  WRONG_VARIANT (hay otra foto mejor): ${buckets.WRONG_VARIANT.length}`);
  console.log(`  LOW_RES_SOURCE (hace falta fotografía nueva): ${buckets.LOW_RES_SOURCE.length}`);
  console.log(`  sin medir todavía: ${buckets.SIN_DATO.length}`);
  console.log(`  sin fotos: ${buckets.SIN_FOTOS.length}`);
  console.log(`\nWRONG_VARIANT: ${buckets.WRONG_VARIANT.slice(0, 20).join(", ")}`);
  console.log(`\nLOW_RES_SOURCE: ${buckets.LOW_RES_SOURCE.slice(0, 20).join(", ")}`);
  process.exit(0);
}

void main();
