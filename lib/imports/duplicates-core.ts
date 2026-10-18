import { jaccardSets, MIN_DESC_WORDS, normRef, shingles, textWords } from "@/lib/particulares/similarity";
import type { DraftFields } from "./draft-model";

// ============================================================================
// Posibles duplicados de un borrador (BCP-01 P5, I-13). Puro: el servidor trae
// las candidatas y aquí se decide el nivel y las razones.
//   clave    misma agencia + referencia (choque de índice único: no se puede
//            crear otra; se usa o se actualiza la existente)
//   cierto   misma URL de origen o una referencia BC citada en el texto
//   probable / posible   parecido por datos (zona, m², dormitorios, precio,
//            calle, descripción). No impide crear otra.
// Nunca se sobrescribe nada sin que la persona lo elija.
// ============================================================================

export type DuplicateLevel = "clave" | "cierto" | "probable" | "posible";

export interface DuplicateCandidate {
  id: string;
  slug: string;
  title: string;
  bc_reference: string | null;
  external_id: string | null;
  agency_id: string | null;
  source_url: string | null;
  zone: string | null;
  subzone: string | null;
  address: string | null;
  operation: string;
  operations: string[] | null;
  price: number | string | null;
  rent_price: number | string | null;
  bedrooms: number | null;
  square_meters: number | null;
  description: string | null;
  status: string;
  archived_at: string | null;
  updated_at: string;
}

export interface DuplicateMatch {
  propertyId: string;
  slug: string;
  title: string;
  bcReference: string | null;
  status: string;
  archived: boolean;
  updatedAt: string;
  level: DuplicateLevel;
  reasons: string[];
  /** Solo con clave o URL: se puede ofrecer «Actualizar la existente». */
  canUpdate: boolean;
  /** Con clave: no se puede crear otra (choque del índice único). */
  blocksNew: boolean;
}

const fold = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** URL de origen comparable: sin protocolo, www., barra final, query ni #. */
export function normalizeSourceUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return null;
  }
}

/** Referencias BC citadas («BC-1766», «bc 1766», «Ref. BC1766»). */
export function bcReferencesIn(...texts: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const t of texts) for (const m of (t ?? "").matchAll(/\bBC[\s-]?(\d{3,6})\b/gi)) out.add(`BC-${m[1]}`);
  return [...out];
}

/** Calle sin número ni prefijos («Calle de Serrano, 12» → «serrano»). */
export function streetKey(address: string | null | undefined): string | null {
  const t = fold(address)
    .replace(/^(c\/|c\.|calle|avda\.?|avenida|av\.|plaza|pza\.?|paseo|pº|camino|ronda|travesia)\s+/, "")
    .replace(/^(de|del|de la|de los|de las)\s+/, "")
    .split(/[,\d]/)[0]
    .trim();
  return t.length >= 3 ? t : null;
}

const effPrice = (c: DuplicateCandidate, op: string): number | null => {
  const v = op === "rent" && c.operation !== "rent" ? c.rent_price : c.price;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const near = (a: number | null, b: number | null, pct: number) => a !== null && b !== null && a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= pct;

/** Clasifica las candidatas frente al borrador. Devuelve solo las que pasan. */
export function classifyDuplicates(args: {
  fields: DraftFields;
  agencyId: string | null;
  externalId: string | null;
  sourceUrl: string | null;
  extraText?: string | null;
  candidates: DuplicateCandidate[];
}): DuplicateMatch[] {
  const { fields: f } = args;
  const url = normalizeSourceUrl(args.sourceUrl);
  const bcs = new Set(bcReferencesIn(f.title, f.description, args.extraText).map((r) => normRef(r)));
  const street = streetKey(f.address);
  const draftWords = textWords(f.description);
  const draftSh = draftWords.length >= MIN_DESC_WORDS ? shingles(draftWords) : null;

  const out: DuplicateMatch[] = [];
  for (const c of args.candidates) {
    const reasons: string[] = [];
    let level: DuplicateLevel | null = null;
    const sameKey = Boolean(args.externalId && c.external_id === args.externalId && c.agency_id && c.agency_id === args.agencyId);
    const sameUrl = Boolean(url && normalizeSourceUrl(c.source_url) === url);
    const sameBc = Boolean(c.bc_reference && bcs.has(normRef(c.bc_reference)));
    if (sameKey) {
      level = "clave";
      reasons.push("Misma agencia y misma referencia del anuncio");
    }
    if (sameUrl) {
      level = level ?? "cierto";
      reasons.push("Mismo enlace de origen");
    }
    if (sameBc) {
      level = level ?? "cierto";
      reasons.push(`El texto cita su referencia ${c.bc_reference}`);
    }
    // Parecido por datos.
    let score = 0;
    const op = f.operation || c.operation;
    if (f.zone && (fold(c.zone) === fold(f.zone) || fold(c.subzone) === fold(f.zone) || (f.subzone && fold(c.subzone) === fold(f.subzone)))) {
      score++;
      reasons.push("Misma zona");
    }
    if (f.bedrooms !== null && c.bedrooms === f.bedrooms) {
      score++;
      reasons.push(`${f.bedrooms} dormitorios`);
    }
    if (near(f.squareMeters, c.square_meters, 0.05)) {
      score++;
      reasons.push(`m² parecidos (${c.square_meters} m²)`);
    }
    if (near(f.price, effPrice(c, op), 0.1)) {
      score++;
      reasons.push("Precio parecido");
    }
    if (street && streetKey(c.address) === street) {
      score += 2;
      reasons.push("Misma calle");
    }
    if (draftSh) {
      const cw = textWords(c.description);
      if (cw.length >= MIN_DESC_WORDS) {
        const j = jaccardSets(draftSh, shingles(cw));
        if (j >= 0.5) {
          score += 2;
          reasons.push(`Descripción casi igual (${Math.round(j * 100)} %)`);
        }
      }
    }
    if (!level) level = score >= 5 ? "probable" : score >= 4 ? "posible" : null;
    if (!level) continue;
    out.push({
      propertyId: c.id,
      slug: c.slug,
      title: c.title,
      bcReference: c.bc_reference,
      status: c.status,
      archived: Boolean(c.archived_at),
      updatedAt: c.updated_at,
      level,
      reasons,
      canUpdate: sameKey || sameUrl,
      blocksNew: sameKey,
    });
  }
  const rank: Record<DuplicateLevel, number> = { clave: 0, cierto: 1, probable: 2, posible: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, 10);
}
