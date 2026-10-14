import type { PublicItem } from "./public-contract";

// ============================================================================
// Composición del recorrido de una vivienda en doble página (BCP-01 E1,
// D-QA1/2/3/6 y L1). PURA y determinista: la usan el estado del lector
// (partes, folios, D12) y las páginas, así que todos los lectores ven lo mismo
// y una actualización en vivo no depende de medir nada en el navegador.
//
// Reglas (plan E1 §3.3):
//   1. Los bloques (entrada larga + secciones) conservan su orden, ninguno se
//      parte y cada uno aparece una vez. Lo que no cabe en las dobles páginas
//      del recorrido queda íntegro en el detalle.
//   2. Peso = palabras + coste del título. Capacidad de una página de texto:
//      C_TEXT, o C_PHOTO si lleva su foto pequeña. Constantes calibradas con
//      el renderizado real a 15 px (1280 × 720 y 1440 × 900).
//   3. Las páginas se llenan en orden; una página lleva como mucho una foto,
//      la primera de sus bloques.
//   4. Nada escaso: una página no se cierra con menos de TINY_WORDS (el bloque
//      siguiente se une a ella), y una última página escasa se une a la
//      anterior si cabe con un margen (lo que sobre se desplaza dentro).
//   5. Un bloque más largo que una página ocupa la suya y se desplaza dentro.
//   6. Las páginas se emparejan de dos en dos; una página suelta con foto da
//      [foto grande | texto] y sin foto, una página de texto compuesta sola.
//   7. Entrada de más de LEAD_OPENING_MAX_WORDS: fuera de la apertura y al
//      principio del recorrido.
//   8. Detalle si hay descripción, características o capítulos de historia
//      que no caben en el recorrido («La historia completa»).
//   9. Sin texto ni secciones: ficha breve en la apertura, sin detalle.
// ============================================================================

export const LEAD_OPENING_MAX_WORDS = 45;
export const TINY_WORDS = 25;
export const HEADING_COST = 10;
export const C_TEXT = 165;
export const C_PHOTO = 100;
export const MAX_JOURNEY_SPREADS = 3;

export type JourneyBlock =
  | { kind: "intro"; words: number }
  | { kind: "section"; index: number; words: number; heading: boolean; photo: number | null };

export interface JourneyPage {
  blocks: JourneyBlock[];
  /** Primera foto de sus bloques (o null). */
  photo: number | null;
  weight: number;
}

export type JourneySlot =
  | { kind: "photo"; photo: number }
  | { kind: "text"; page: JourneyPage; /** Foto pequeña dentro de la página (o null). */ inlinePhoto: number | null };

export interface JourneySpread {
  slots: JourneySlot[];
}

export interface ItemLayout {
  /** La entrada cabe en la apertura (≤ ~45 palabras) o no hay entrada. */
  introInOpening: boolean;
  spreads: JourneySpread[];
  /** Quedan secciones fuera del recorrido (están íntegras en el detalle). */
  truncated: boolean;
  detail: { story: boolean; description: boolean; features: boolean } | null;
  /** Ficha breve: sin texto ni secciones. */
  brief: boolean;
}

export function countWords(text: string | null | undefined): number {
  return ((text ?? "").trim().match(/\S+/g) ?? []).length;
}

function weight(b: JourneyBlock): number {
  return b.words + (b.kind === "section" && b.heading ? HEADING_COST : 0);
}

function blockPhoto(b: JourneyBlock): number | null {
  return b.kind === "section" ? b.photo : null;
}

function capacity(photo: number | null): number {
  return photo === null ? C_TEXT : C_PHOTO;
}

/** Bloques del recorrido en orden (regla 1 y 7). */
export function journeyBlocks(item: PublicItem): JourneyBlock[] {
  const blocks: JourneyBlock[] = [];
  const leadWords = countWords(item.lead);
  if (leadWords > LEAD_OPENING_MAX_WORDS) blocks.push({ kind: "intro", words: leadWords });
  item.sections.forEach((s, index) => {
    const photo = s.photo !== null && item.photos[s.photo] ? s.photo : null;
    blocks.push({ kind: "section", index, words: countWords(s.text), heading: !!s.heading, photo });
  });
  return blocks;
}

/** Reparte los bloques en páginas de texto (reglas 2–5). */
export function packPages(blocks: JourneyBlock[]): JourneyPage[] {
  const pages: JourneyPage[] = [];
  let cur: JourneyPage = { blocks: [], photo: null, weight: 0 };
  for (const b of blocks) {
    const w = weight(b);
    const bp = blockPhoto(b);
    const nextPhoto = cur.photo ?? bp;
    const fits = cur.weight + w <= capacity(nextPhoto);
    // Segunda foto en la misma página: abre página nueva si la actual ya
    // tiene contenido suficiente (cada foto de capítulo se ve).
    const secondPhoto = cur.photo !== null && bp !== null && cur.weight >= TINY_WORDS;
    // Regla 4: nunca se cierra una página escasa; el bloque siguiente se une
    // a ella aunque no quepa entero (la página se desplaza por dentro).
    if (cur.blocks.length && (!fits || secondPhoto) && cur.weight >= TINY_WORDS) {
      pages.push(cur);
      cur = { blocks: [], photo: null, weight: 0 };
    }
    cur.blocks.push(b);
    cur.weight += w;
    cur.photo = cur.photo ?? bp;
  }
  if (cur.blocks.length) pages.push(cur);
  // Regla 4: la última página escasa se une a la anterior si cabe con margen.
  if (pages.length > 1) {
    const last = pages[pages.length - 1];
    const prev = pages[pages.length - 2];
    const lastPhoto = last.photo;
    if (last.weight < TINY_WORDS && (lastPhoto === null || prev.photo === null)) {
      const merged = prev.weight + last.weight;
      if (merged <= capacity(prev.photo ?? lastPhoto) + TINY_WORDS) {
        pages.splice(pages.length - 2, 2, { blocks: [...prev.blocks, ...last.blocks], photo: prev.photo ?? lastPhoto, weight: merged });
      }
    }
  }
  return pages;
}

/** Empareja las páginas en dobles páginas (regla 6). */
export function pairSpreads(pages: JourneyPage[]): JourneySpread[] {
  const spreads: JourneySpread[] = [];
  for (let i = 0; i < pages.length; i += 2) {
    const a = pages[i];
    const b = pages[i + 1];
    if (b) {
      spreads.push({ slots: [{ kind: "text", page: a, inlinePhoto: a.photo }, { kind: "text", page: b, inlinePhoto: b.photo }] });
    } else if (a.photo !== null) {
      spreads.push({ slots: [{ kind: "photo", photo: a.photo }, { kind: "text", page: a, inlinePhoto: null }] });
    } else {
      spreads.push({ slots: [{ kind: "text", page: a, inlinePhoto: null }] });
    }
  }
  return spreads;
}

export function itemLayout(item: PublicItem): ItemLayout {
  const introInOpening = countWords(item.lead) <= LEAD_OPENING_MAX_WORDS;
  const brief = item.sections.length === 0 && !item.description;
  const all = pairSpreads(packPages(journeyBlocks(item)));
  const spreads = all.slice(0, MAX_JOURNEY_SPREADS);
  const truncated = all.length > spreads.length;
  const story = truncated && item.sections.some((s) => !!s.heading);
  const description = !!item.description;
  const features = item.features.length > 0;
  const detail = !brief && (story || description || features) ? { story, description, features } : null;
  return { introInOpening, spreads, truncated, detail, brief };
}

/** Índices de las secciones que se ven en el recorrido (en orden). */
export function sectionsInJourney(layout: ItemLayout): number[] {
  const out: number[] = [];
  for (const sp of layout.spreads) {
    for (const slot of sp.slots) {
      if (slot.kind !== "text") continue;
      for (const b of slot.page.blocks) if (b.kind === "section") out.push(b.index);
    }
  }
  return out;
}
