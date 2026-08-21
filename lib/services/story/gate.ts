// SmartLink 2.0 · Quality gate de publicación — IMPLEMENTACIÓN ÚNICA.
//
// La usan LOS DOS consumidores, para que no puedan divergir:
//   · el batch publisher (scripts/publish-story-batch.mts)
//   · la cola de enriquecimiento (/{country}/admin/propiedades/story-review)
//
// Es pura: recibe los datos ya leídos y devuelve el veredicto + el detalle de
// qué bloque concreto falla (lo que la cola necesita para señalar el culpable).
// NO toca Engine v4: solo decide si una story YA generada es publicable.

import { copyWordCount } from "./validate";
import { unsupportedEntities } from "./structure";
import { extractFloor } from "@/lib/floor";

export const GATE_CODES = [
  "conflict",        // 1
  "duplicate_chapter", // 2
  "claim_reused",    // 3
  "too_long",        // 4
  "too_short",       // 5
  "entity",          // 6
  "floor",           // 7
  "photo_mismatch",  // 8
  "neighborhood",    // 9
  "few_chapters",    // 10
  "empty_heading",   // 15
  "boilerplate",     // 16
  "low_photos",      // cobertura
  "unavailable",     // disponibilidad
] as const;
export type GateCode = (typeof GATE_CODES)[number];

export const GATE_LABELS: Record<GateCode, string> = {
  conflict: "Conflicto factual con la ficha",
  duplicate_chapter: "Capítulo duplicado",
  claim_reused: "Claim usado en más de un capítulo",
  too_long: "Bloque de más de 70 palabras",
  too_short: "Bloque demasiado corto",
  entity: "Entidad sin respaldo en la evidencia",
  floor: "Planta inferida de una zona secundaria",
  photo_mismatch: "Foto incoherente con el capítulo",
  neighborhood: "Barrio incoherente con zona/subzona",
  few_chapters: "Menos de 3 capítulos narrativos",
  empty_heading: "Bloque sin texto (heading vacío)",
  boilerplate: "Texto de agencia en el copy",
  low_photos: "Cobertura fotográfica insuficiente (<8 fotos)",
  unavailable: "Propiedad no disponible",
};

// Agrupación operativa de la cola (backlog A–E del handoff).
export const QUEUE_BUCKETS = {
  short: { label: "Bloque corto", codes: ["too_short"] as GateCode[] },
  conflict: { label: "Conflicto factual", codes: ["conflict"] as GateCode[] },
  chapters: { label: "Pocos capítulos", codes: ["few_chapters"] as GateCode[] },
  photos: { label: "Pocas fotos", codes: ["low_photos"] as GateCode[] },
  other: {
    label: "Otros",
    codes: [
      "duplicate_chapter", "claim_reused", "too_long", "entity", "floor",
      "photo_mismatch", "neighborhood", "empty_heading", "boilerplate", "unavailable",
    ] as GateCode[],
  },
} as const;
export type QueueBucket = keyof typeof QUEUE_BUCKETS;

export const NARRATIVE_CHAPTERS = ["living", "kitchen", "private", "outdoor", "finishes", "building"];

// Clases de foto admisibles por capítulo — idénticas al renderer público.
export const CHAPTER_PHOTO_CLASSES: Record<string, string[]> = {
  living: ["living_room", "dining"],
  kitchen: ["kitchen"],
  private: ["bedroom", "bathroom"],
  outdoor: ["terrace_outdoor", "garden", "pool", "view"],
  finishes: [],
  building: ["facade_building"],
  barrio: [],
  overview: [],
};

const BOILERPLATE_RE =
  /(nuestra p[áa]gina web|call center|off[- ]market|24 horas|365 d[íi]as|no dude en contactar|cont[áa]ctenos|s[íi]guenos|gestionaremos para ti|oportunidad(es)? de inversi[óo]n)/i;

const MIN_PHOTOS = 8;

export type GateInput = {
  property: {
    id: string;
    bc_reference: string | null;
    slug: string;
    zone: string | null;
    subzone: string | null;
    title: string | null;
    description: string | null;
    features: string[] | null;
    features_manual: string[] | null;
    status: string | null;
    archived_at: string | null;
  };
  blocks: Array<{
    id: string;
    chapter: string;
    copy: string;
    status: string;
    claim_ids: string[] | null;
  }>;
  claims: Array<{
    id: string;
    source_text: string;
    fact: string;
    category: string;
    /** Marcado por el validador: su contenido NUNCA puede publicarse. */
    conflict?: boolean;
  }>;
  photos: Array<{
    position: number;
    ai_class: string | null;
    ai_confidence: number | null;
    class_override: string | null;
  }>;
  /** Barrio curado que casaría con esta propiedad, si existe. */
  neighborhoodDisplayName?: string | null;
};

export type GateFailure = {
  code: GateCode;
  label: string;
  /** Bloque(s) concretos que provocan el fallo, si aplica. */
  blockIds: string[];
  detail?: string;
};

export type GateResult = {
  pass: boolean;
  failures: GateFailure[];
  /** Bucket principal para la cola (el primero según prioridad de negocio). */
  bucket: QueueBucket | null;
  narrativeChapters: number;
  photoCount: number;
};

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── SAFE PARTIAL STORY PUBLISHING ───────────────────────────────────────────
// Fallos BLOCK-LOCAL: afectan a un bloque y se resuelven excluyéndolo del
// publish (el conflicto sigue visible en admin). Todo lo demás es
// STORY-BLOCKING y retiene la propiedad entera en fallback.
const BLOCK_LOCAL_CODES: GateCode[] = ["conflict", "too_short"];

export type PublishPlan = {
  /** true si se puede publicar algo con total seguridad factual. */
  publishable: boolean;
  mode: "complete" | "partial" | "none";
  /** Bloques que pueden pasar a 'approved' (y por tanto al SmartLink). */
  publishBlockIds: string[];
  /** Bloques excluidos y por qué (conflicto o demasiado corto). */
  excluded: Array<{ blockId: string; chapter: string; reason: GateCode }>;
  /** Fallos que retienen la story entera, evaluados YA sobre el subconjunto. */
  storyFailures: GateFailure[];
  narrativeChapters: number;
};

/**
 * Decide QUÉ bloques pueden publicarse con seguridad factual.
 *
 * Garantías (verificadas aquí, no asumidas):
 *  · ningún bloque marcado en conflicto entra;
 *  · ningún bloque que se apoye en un claim conflictivo entra (cinturón y
 *    tirantes: aunque el bloque no estuviera marcado);
 *  · los bloques demasiado cortos se excluyen en vez de condenar la story;
 *  · el resto de gates se re-evalúa SOBRE EL SUBCONJUNTO publicable;
 *  · se exigen ≥3 capítulos narrativos tras las exclusiones.
 */
export function planPublication(input: GateInput): PublishPlan {
  const active = input.blocks.filter((b) => b.status !== "rejected");
  const conflictClaimIds = new Set(
    input.claims.filter((c) => c.conflict).map((c) => c.id),
  );

  const excluded: PublishPlan["excluded"] = [];
  const keep: typeof active = [];
  for (const b of active) {
    // 1 · bloque marcado en conflicto por el motor
    if (b.status === "conflict") {
      excluded.push({ blockId: b.id, chapter: b.chapter, reason: "conflict" });
      continue;
    }
    // 2 · cinturón de seguridad: ningún claim conflictivo puede alimentarlo
    if ((b.claim_ids ?? []).some((id) => conflictClaimIds.has(id))) {
      excluded.push({ blockId: b.id, chapter: b.chapter, reason: "conflict" });
      continue;
    }
    // 3 · bloque demasiado corto → se excluye, no condena la story
    const words = copyWordCount(b.copy);
    const factual = /\d{4}|\bm²\b|\d+/.test(b.copy) && ["building", "overview"].includes(b.chapter);
    if (words < 5 && !factual) {
      excluded.push({ blockId: b.id, chapter: b.chapter, reason: "too_short" });
      continue;
    }
    keep.push(b);
  }

  // Re-evaluación completa del gate SOLO sobre lo que se publicaría.
  const subsetResult = evaluateGate({ ...input, blocks: keep });
  const storyFailures = subsetResult.failures.filter(
    (f) => !BLOCK_LOCAL_CODES.includes(f.code),
  );

  const publishable = storyFailures.length === 0 && keep.length > 0;
  return {
    publishable,
    mode: !publishable ? "none" : excluded.length === 0 ? "complete" : "partial",
    publishBlockIds: keep.map((b) => b.id),
    excluded,
    storyFailures,
    narrativeChapters: subsetResult.narrativeChapters,
  };
}

/** Evalúa los 16 gates. Devuelve TODOS los fallos (no corta en el primero). */
export function evaluateGate(input: GateInput): GateResult {
  const { property, blocks, claims, photos } = input;
  const failures: GateFailure[] = [];
  const add = (code: GateCode, blockIds: string[] = [], detail?: string) =>
    failures.push({ code, label: GATE_LABELS[code], blockIds, detail });

  // Disponibilidad
  if (property.archived_at || property.status === "archived") add("unavailable");

  // 1 · conflicto
  const conflictBlocks = blocks.filter((b) => b.status === "conflict");
  if (conflictBlocks.length > 0) add("conflict", conflictBlocks.map((b) => b.id));

  // 2 · capítulo duplicado
  const chapters = blocks.map((b) => b.chapter);
  if (new Set(chapters).size !== chapters.length) {
    const dupes = chapters.filter((c, i) => chapters.indexOf(c) !== i);
    add("duplicate_chapter", blocks.filter((b) => dupes.includes(b.chapter)).map((b) => b.id));
  }

  // 3 · claim reutilizado
  const allClaimIds = blocks.flatMap((b) => b.claim_ids ?? []);
  if (new Set(allClaimIds).size !== allClaimIds.length) {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const id of allClaimIds) {
      if (seen.has(id)) repeated.add(id);
      seen.add(id);
    }
    add("claim_reused", blocks.filter((b) => (b.claim_ids ?? []).some((c) => repeated.has(c))).map((b) => b.id));
  }

  // 4 · >70 palabras
  const tooLong = blocks.filter((b) => copyWordCount(b.copy) > 70);
  if (tooLong.length > 0) add("too_long", tooLong.map((b) => b.id));

  // 5 · <5 palabras salvo hecho deliberadamente factual
  const tooShort = blocks.filter((b) => {
    const w = copyWordCount(b.copy);
    if (w >= 5) return false;
    const factual = /\d{4}|\bm²\b|\d+/.test(b.copy) && ["building", "overview"].includes(b.chapter);
    return !factual;
  });
  if (tooShort.length > 0) {
    add("too_short", tooShort.map((b) => b.id),
      tooShort.map((b) => `${b.chapter}: ${copyWordCount(b.copy)} palabras`).join(" · "));
  }

  // 6 · entidad sin respaldo / bloque sin evidencia
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const entityBad: string[] = [];
  const entityDetail: string[] = [];
  for (const b of blocks) {
    const support = (b.claim_ids ?? [])
      .map((id) => claimById.get(id))
      .filter(Boolean)
      .flatMap((c) => [c!.fact, c!.source_text]);
    if (support.length === 0) {
      entityBad.push(b.id);
      entityDetail.push(`${b.chapter}: sin evidencia asociada`);
      continue;
    }
    const bad = unsupportedEntities(b.copy, support);
    if (bad.length > 0) {
      entityBad.push(b.id);
      entityDetail.push(`${b.chapter}: ${bad.join(", ")}`);
    }
  }
  if (entityBad.length > 0) add("entity", entityBad, entityDetail.join(" · "));

  // 7 · planta inferida de zona secundaria
  const floor = extractFloor(
    [...(property.features ?? []), ...(property.features_manual ?? [])],
    property.title,
    property.description,
  );
  if (
    floor === 0 &&
    /planta baja[^.]*\b(trastero|garaje|gimnasio|almacen|zonas? comunes)\b/i.test(property.description ?? "")
  ) {
    add("floor");
  }

  // 8 · foto coherente por capítulo
  const classes = photos.map((p) =>
    p.class_override ?? ((p.ai_confidence ?? 0) >= 0.75 ? p.ai_class : null),
  );
  const used = new Set<number>([0]);
  const photoBad: string[] = [];
  for (const b of blocks) {
    const wanted = CHAPTER_PHOTO_CLASSES[b.chapter] ?? [];
    if (wanted.length === 0) continue;
    const idx = classes.findIndex((c, i) => !used.has(i) && c != null && wanted.includes(c));
    if (idx >= 0) {
      used.add(idx);
      if (!wanted.includes(classes[idx]!)) photoBad.push(b.id);
    }
  }
  if (photoBad.length > 0) add("photo_mismatch", photoBad);

  // 9 · barrio coherente
  const barrioBlock = blocks.find((b) => b.chapter === "barrio");
  if (barrioBlock && input.neighborhoodDisplayName) {
    const copyNorm = norm(barrioBlock.copy);
    const ok =
      copyNorm.includes(norm(input.neighborhoodDisplayName)) ||
      copyNorm.includes(norm(property.zone)) ||
      copyNorm.includes(norm(property.subzone));
    if (!ok) add("neighborhood", [barrioBlock.id]);
  }

  // 15 · heading vacío
  const empty = blocks.filter((b) => !b.copy || !b.copy.trim());
  if (empty.length > 0) add("empty_heading", empty.map((b) => b.id));

  // 16 · boilerplate de agencia
  const boiler = blocks.filter((b) => BOILERPLATE_RE.test(b.copy));
  if (boiler.length > 0) add("boilerplate", boiler.map((b) => b.id));

  // 10 · ≥3 capítulos narrativos (se cuentan los que NO están rechazados)
  const narrative = blocks.filter(
    (b) => NARRATIVE_CHAPTERS.includes(b.chapter) && b.status !== "rejected",
  );
  if (narrative.length < 3) add("few_chapters", [], `${narrative.length} de 3`);

  // Cobertura fotográfica
  if (photos.length < MIN_PHOTOS) add("low_photos", [], `${photos.length} fotos`);

  // Bucket principal por prioridad de negocio: conflicto > corto > capítulos >
  // fotos > otros (el conflicto manda porque nunca es auto-resoluble).
  let bucket: QueueBucket | null = null;
  const codes = failures.map((f) => f.code);
  if (codes.includes("conflict")) bucket = "conflict";
  else if (codes.includes("too_short")) bucket = "short";
  else if (codes.includes("few_chapters")) bucket = "chapters";
  else if (codes.includes("low_photos")) bucket = "photos";
  else if (codes.length > 0) bucket = "other";

  return {
    pass: failures.length === 0,
    failures,
    bucket,
    narrativeChapters: narrative.length,
    photoCount: photos.length,
  };
}
