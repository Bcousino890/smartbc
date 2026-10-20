import { splitDescriptionForFallback } from "@/lib/services/story/fallback";
import { CHAPTER_PHOTO_CLASSES } from "@/lib/services/story/gate";
import { isMicroChapter, microChapterFact } from "@/lib/services/story/micro-chapter";
import { isStorySourceCurrent } from "@/lib/services/story/source-hash";
import { CHAPTER_HEADINGS, STORY_CHAPTERS, type StoryChapter } from "@/lib/services/story/types";
import { fold, HIGHLIGHT_TERMS, isPublicSafe, PHONE_RE, EMAIL_RE, URL_RE } from "./text-rules";
import { leadFrom, organizeDescription, paragraphsOf, SECTION_ORDER, type SectionKey } from "./structure";

export { leadFrom, paragraphsOf };

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
//
// Lector compacto (expediente 2026-10-20-bcp-01-compacto-y-opiniones, DC3):
// el lector y el PDF ya no reparten el texto en secciones con fotos; usan
// `copy`, la descripción completa del catálogo en bloques, UNA sola vez y con
// la misma prioridad. `lead`, `highlights`, `sections` y `mosaic` se siguen
// calculando para la gestión y las pruebas.
//
// Descripción estructurada (expediente 2026-10-21-bcp-01-descripcion-
// estructurada, DE1–DE9): `copy` sale SIEMPRE del organizador determinista
// de structure.ts, en los tres niveles con texto: introducción, Salón y luz,
// Cocina y comedor, Acabados y confort, La finca y Vivir en [zona]. Cada
// frase, literal y una sola vez; ninguna parte vacía.
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
  /** E1 · Ficha breve (sin texto ni secciones): hasta 4 fotos adicionales
   *  elegibles (índices en photos, en su orden, sin la de apertura ni las
   *  clases excluidas). [] en cualquier otro caso. */
  mosaic: number[];
  /** DC3/DE1 · La descripción completa del catálogo, organizada en la
   *  estructura estándar (introducción sin título y partes con título), sin
   *  fotos: del texto publicado, de la historia aprobada o de la descripción
   *  limpia; [] solo con datos. Nunca se repite ni se pierde una frase. */
  copy: Array<{ heading: string | null; text: string }>;
  /** DE10 · Partes de la estructura sin material (aviso del editor). */
  missing: SectionKey[];
}

/** E1 (D-QA4) · Clases que el recorrido automático NO usa solas. Solo cuentan
 *  las clases fiables (corregidas a mano, o de la IA con confianza ≥ 0,75: la
 *  regla de 0197). Una foto sin clase sigue siendo elegible. */
export const JOURNEY_EXCLUDED_CLASSES: readonly string[] = ["floor_plan", "street_context", "other"];
export const MOSAIC_MAX = 4;

function eligible(p: EditorialPhoto): boolean {
  return !p.k || !JOURNEY_EXCLUDED_CLASSES.includes(p.k);
}

function num(v: number | string | null): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
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
    while (next < photos.length && (used.has(next) || !eligible(photos[next]))) next++;
    if (next >= photos.length) return s;
    used.add(next);
    return { ...s, photo: next++ };
  });
}

function deriveText(it: EditorialInput): Omit<Editorial, "mosaic"> {
  // Zona verificada de la ficha para «Vivir en …» y sus palabras clave (DE9).
  const area = [it.subzone, it.zone].map((x) => (typeof x === "string" ? x.trim() : "")).find(Boolean) ?? null;
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
    // La entrada propia (si la hay) abre la introducción; si la entrada salió
    // del propio texto, ya está dentro de él y no se repite. El resto se
    // organiza frase a frase (DE1–DE6).
    const organized = organizeDescription({
      lead: tl && noContact(tl) && !(tb ?? "").includes(tl) ? tl : null,
      paragraphs: paragraphsOf(tb).filter(noContact),
      area,
    });
    return {
      level: "text",
      lead: autoLead && noContact(autoLead) ? autoLead : null,
      highlights: (chosen.length ? chosen : candidates).slice(0, 3),
      sections,
      description: tb,
      features,
      copy: organized.copy,
      missing: organized.missing,
    };
  }

  // 2 · Historia aprobada vigente.
  if (storyCurrent) {
    const sections: EditorialSection[] = [];
    const chapters: Array<{ chapter: StoryChapter; text: string }> = [];
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
      chapters.push({ chapter, text: t });
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
    const safePrelude = prelude && isPublicSafe(prelude) ? prelude : null;
    // La historia ES la descripción (DC3): su entrada y sus capítulos, en la
    // estructura estándar (DE7: los capítulos compatibles conservan su título;
    // los demás van a la introducción). La limpia no se repite debajo.
    const organized = organizeDescription({ lead: safePrelude, paragraphs: [], chapters, area });
    return {
      level: "story",
      lead: safePrelude ?? leadFrom(it.cleanDescription).lead,
      highlights: candidates.slice(0, 3),
      sections,
      description: it.cleanDescription,
      features,
      copy: organized.copy,
      missing: organized.missing,
    };
  }

  // 3 · Descripción limpia vigente (organizada como el texto propio).
  if (it.cleanDescription) {
    const { lead, rest } = leadFrom(it.cleanDescription);
    const sections = alternatePhotos(
      splitDescriptionForFallback(rest).filter(isPublicSafe).map((t) => ({ heading: null, text: t, photo: null })),
      it.photos,
      used,
    );
    const organized = organizeDescription({ lead: null, paragraphs: paragraphsOf(it.cleanDescription).filter(isPublicSafe), area });
    return {
      level: "clean",
      lead: lead && isPublicSafe(lead) ? lead : null,
      highlights: candidates.slice(0, 3),
      sections,
      description: it.cleanDescription,
      features,
      copy: organized.copy,
      missing: organized.missing,
    };
  }

  // 4 · Solo datos y fotos.
  return { level: "facts", lead: null, highlights: candidates.slice(0, 3), sections: [], description: null, features, copy: [], missing: [...SECTION_ORDER] };
}

export function deriveEditorial(it: EditorialInput): Editorial {
  const ed = deriveText(it);
  // Ficha breve (D-QA6): sin texto ni secciones que mostrar.
  const brief = ed.sections.length === 0 && !ed.description;
  const mosaic = brief
    ? it.photos.map((p, i) => ({ p, i })).filter(({ p, i }) => i !== it.coverIndex && eligible(p)).slice(0, MOSAIC_MAX).map(({ i }) => i)
    : [];
  return { ...ed, mosaic };
}
