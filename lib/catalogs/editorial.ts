import { splitDescriptionForFallback } from "@/lib/services/story/fallback";
import { CHAPTER_PHOTO_CLASSES } from "@/lib/services/story/gate";
import { isMicroChapter, microChapterFact } from "@/lib/services/story/micro-chapter";
import { isStorySourceCurrent } from "@/lib/services/story/source-hash";
import { CHAPTER_HEADINGS, STORY_CHAPTERS, type StoryChapter } from "@/lib/services/story/types";
import { countWords, fold, HIGHLIGHT_TERMS, isPublicSafe, PHONE_RE, EMAIL_RE, URL_RE, sentences } from "./text-rules";

// ============================================================================
// Recorrido editorial de una vivienda (BCP-01 ampliación C2, R6). PURO: lo
// usan to-public.ts (lector) y la vista previa de la gestión.
//
// De dónde sale el texto, por prioridad (la primera fuente VIGENTE manda):
//   1. «text»  — texto publicado del catálogo (la instantánea solo lo trae si
//                su fuente no cambió desde que se publicó);
//   2. «story» — historia aprobada cuya huella coincide con la ficha actual;
//   3. «clean» — descripción limpia para clientes vigente;
//   4. «facts» — solo datos y fotos.
// Nunca se inventa: sin historia, el texto se reparte SIN títulos temáticos.
// La descripción completa (la del nivel que manda, o la limpia) va íntegra en
// el detalle; ningún dato estructurado se pierde.
// ============================================================================

export type EditorialLevel = "text" | "story" | "clean" | "facts";

export interface EditorialPhoto {
  u: string;
  c?: boolean | null;
  /** Clase de la foto (corregida a mano, o de la IA con confianza ≥ 0,75). */
  k?: string | null;
}

export interface EditorialInput {
  description: string | null;
  features: string[] | null;
  features_manual: string[] | null;
  bedrooms: number | string | null;
  bathrooms: number | string | null;
  square_meters: number | string | null;
  zone: string | null;
  subzone: string | null;
  /** Descripción limpia ya validada (null si no hay o no es vigente). */
  cleanDescription: string | null;
  /** Características limpias ya validadas ([] si no hay o no son vigentes). */
  cleanFeatures: string[];
  /** Texto publicado del catálogo (solo llega si es vigente). */
  text?: { b: string | null; l: string | null; h: string[] | null } | null;
  /** Historia aprobada (su vigencia se comprueba aquí con la huella). */
  story?: { h: string | null; p: string | null; ph?: string | null; b: Array<{ c: string; t: string }> | null } | null;
  /** Fotos públicas en el orden del proxy (sin repetidas). */
  photos: EditorialPhoto[];
  coverIndex: number;
}

export interface EditorialSection {
  /** Título del capítulo (solo con historia aprobada); null sin historia. */
  heading: string | null;
  text: string;
  /** Índice de la foto (en photos) que acompaña la sección, o null. */
  photo: number | null;
}

export interface Editorial {
  level: EditorialLevel;
  lead: string | null;
  highlights: string[];
  sections: EditorialSection[];
  /** Descripción completa, íntegra (o null si no hay ninguna vigente). */
  description: string | null;
  /** Características verificadas para el detalle (limpias + manuales + datos
   *  rescatados de los micro-capítulos de la historia). */
  features: string[];
}

const LEAD_MAX_WORDS = 45;

function num(v: number | string | null): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 1–2 primeras frases literales, de 45 palabras como máximo (o null). */
export function leadFrom(text: string | null): { lead: string | null; rest: string } {
  const all = sentences(text ?? "");
  if (all.length === 0) return { lead: null, rest: "" };
  if (countWords(all[0]) > LEAD_MAX_WORDS) return { lead: null, rest: all.join(" ") };
  let n = 1;
  if (all.length > 1 && countWords(all[0]) < 20 && countWords(`${all[0]} ${all[1]}`) <= LEAD_MAX_WORDS) n = 2;
  return { lead: all.slice(0, n).join(" "), rest: all.slice(n).join(" ") };
}

/** Candidatos a punto verificado: literales, de la lista cerrada y sin contacto. */
export function highlightCandidates(cleanFeatures: string[], manualFeatures: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...cleanFeatures, ...manualFeatures]) {
    const f = (raw ?? "").trim();
    if (!f || f.length > 80 || !HIGHLIGHT_TERMS.test(f) || !isPublicSafe(f)) continue;
    const k = fold(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

/** Sin contacto (texto del catálogo: ya bloqueado al publicar, defensa extra). */
function noContact(t: string): boolean {
  return !EMAIL_RE.test(t) && !URL_RE.test(t) && !PHONE_RE.test(t);
}

/** Reparte fotos «en su orden» (sin la de portada) entre secciones sin foto. */
function alternatePhotos(sections: EditorialSection[], photos: EditorialPhoto[], used: Set<number>): EditorialSection[] {
  let next = 0;
  return sections.map((s) => {
    if (s.photo !== null) return s;
    while (next < photos.length && used.has(next)) next++;
    if (next >= photos.length) return s;
    used.add(next);
    return { ...s, photo: next++ };
  });
}

export function deriveEditorial(it: EditorialInput): Editorial {
  const manual = (it.features_manual ?? []).filter((f) => typeof f === "string" && f.trim() && isPublicSafe(f)).map((f) => f.trim());
  const features: string[] = [];
  const seenF = new Set<string>();
  const cleanF = it.cleanFeatures.filter((f) => typeof f === "string" && f.trim() && noContact(f)).map((f) => f.trim());
  for (const f of [...cleanF, ...manual]) {
    const k = fold(f);
    if (!seenF.has(k)) {
      seenF.add(k);
      features.push(f);
    }
  }
  const candidates = highlightCandidates(cleanF, manual);
  const used = new Set<number>([it.coverIndex]);
  const storyInput = {
    description: it.description,
    bedrooms: num(it.bedrooms),
    bathrooms: num(it.bathrooms),
    squareMeters: num(it.square_meters),
    features: [...(it.features ?? []), ...(it.features_manual ?? [])],
  };
  const storyBlocks = (it.story?.b ?? []).filter(
    (b) => b && typeof b.t === "string" && b.t.trim() && (STORY_CHAPTERS as readonly string[]).includes(b.c),
  );
  const storyCurrent = !!it.story && storyBlocks.length > 0 && isStorySourceCurrent(it.story.h, storyInput);

  // 1 · Texto publicado del catálogo.
  const tb = (it.text?.b ?? "").trim() || null;
  const tl = (it.text?.l ?? "").trim() || null;
  if (it.text && (tb || tl)) {
    const { lead: autoLead, rest } = tl ? { lead: tl, rest: tb ?? "" } : leadFrom(tb);
    const chosen = (it.text.h ?? []).filter((h) => candidates.some((c) => fold(c) === fold(h)));
    const sections = alternatePhotos(
      splitDescriptionForFallback(rest).filter(noContact).map((t) => ({ heading: null, text: t, photo: null })),
      it.photos,
      used,
    );
    return {
      level: "text",
      lead: autoLead && noContact(autoLead) ? autoLead : null,
      highlights: (chosen.length ? chosen : candidates).slice(0, 3),
      sections,
      description: tb,
      features,
    };
  }

  // 2 · Historia aprobada vigente.
  if (storyCurrent) {
    const sections: EditorialSection[] = [];
    for (const b of storyBlocks) {
      const t = b.t.trim();
      if (!isPublicSafe(t)) continue;
      if (isMicroChapter(b.c, t)) {
        const fact = microChapterFact(t);
        if (!seenF.has(fold(fact))) {
          seenF.add(fold(fact));
          features.push(fact);
        }
        continue;
      }
      const chapter = b.c as StoryChapter;
      const wanted = CHAPTER_PHOTO_CLASSES[chapter] ?? [];
      const idx = wanted.length ? it.photos.findIndex((p, i) => !used.has(i) && !!p.k && wanted.includes(p.k)) : -1;
      if (idx >= 0) used.add(idx);
      const place = it.subzone || it.zone;
      sections.push({
        heading: chapter === "barrio" ? (place ? `Vivir en ${place}` : CHAPTER_HEADINGS.barrio) : CHAPTER_HEADINGS[chapter],
        text: t,
        photo: idx >= 0 ? idx : null,
      });
    }
    const prelude = (it.story?.p ?? "").trim();
    return {
      level: "story",
      lead: prelude && isPublicSafe(prelude) ? prelude : leadFrom(it.cleanDescription).lead,
      highlights: candidates.slice(0, 3),
      sections,
      description: it.cleanDescription,
      features,
    };
  }

  // 3 · Descripción limpia vigente (sin títulos inventados).
  if (it.cleanDescription) {
    const { lead, rest } = leadFrom(it.cleanDescription);
    const sections = alternatePhotos(
      splitDescriptionForFallback(rest).filter(isPublicSafe).map((t) => ({ heading: null, text: t, photo: null })),
      it.photos,
      used,
    );
    return {
      level: "clean",
      lead: lead && isPublicSafe(lead) ? lead : null,
      highlights: candidates.slice(0, 3),
      sections,
      description: it.cleanDescription,
      features,
    };
  }

  // 4 · Solo datos y fotos.
  return { level: "facts", lead: null, highlights: candidates.slice(0, 3), sections: [], description: null, features };
}
