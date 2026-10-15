// Señales de similitud entre dos anuncios para el cruce con agencias (puras).
// Descripción (shingles + Jaccard con poda por frecuencia), referencias, nombre de
// agencia y fotos.

const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palabras del texto, sin tildes ni signos, con los números de teléfono/URL fuera. */
export function textWords(text: string | null | undefined): string[] {
  if (!text) return [];
  return fold(text)
    .replace(/https?:\/\/\S+|www\.\S+/g, " ")
    .replace(/\b\d[\d\s.\-]{7,}\d\b/g, " ")
    .match(/[a-z0-9]+/g) ?? [];
}

const SHINGLE = 4;
export const MIN_DESC_WORDS = 25;

/** Shingles de 4 palabras consecutivas (hash de cadena corto). */
export function shingles(words: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(" "));
  return out;
}

export function jaccardSets(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [s, l] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of s) if (l.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export type DescIndex = {
  /** Shingles característicos del anuncio (sin los de uso común) o null si no hay texto suficiente. */
  of: (id: string) => Set<string> | null;
};

/**
 * Indexa las descripciones de un universo de anuncios. Los shingles que salen en
 * MUCHOS anuncios (el pie legal de una agencia, «contacte con nosotros para más
 * información…», «piso luminoso en una finca bien cuidada») se descartan: si no,
 * dos pisos distintos de la misma agencia o del mismo edificio parecerían gemelos.
 */
export function buildDescIndex(items: Array<{ id: string; description: string | null | undefined }>): DescIndex {
  const raw = new Map<string, Set<string>>();
  const df = new Map<string, number>();
  for (const it of items) {
    const w = textWords(it.description);
    if (w.length < MIN_DESC_WORDS) continue;
    const sh = shingles(w);
    raw.set(it.id, sh);
    for (const x of sh) df.set(x, (df.get(x) ?? 0) + 1);
  }
  const maxDf = Math.max(4, Math.floor(items.length * 0.002));
  const pruned = new Map<string, Set<string>>();
  for (const [id, sh] of raw) {
    const keep = new Set<string>();
    for (const x of sh) if ((df.get(x) ?? 0) <= maxDf) keep.add(x);
    pruned.set(id, keep);
  }
  return { of: (id) => pruned.get(id) ?? null };
}

/** Referencia del anunciante normalizada («BC-1746», «bc 1746» → «BC1746»); null si es demasiado corta. */
export function normRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const r = fold(String(raw)).replace(/[^a-z0-9]/g, "").toUpperCase();
  return r.length >= 3 ? r : null;
}

const AGENCY_STOP = new Set([
  "inmobiliaria", "inmobiliarias", "inmuebles", "real", "estate", "realestate", "group", "grupo", "homes", "home",
  "properties", "property", "sl", "slu", "sa", "s", "l", "de", "del", "la", "el", "y", "and", "the", "agency",
  "agencia", "gestion", "servicios", "consulting", "asesores",
]);

/** Nombre de agencia comparable: sin forma jurídica ni palabras genéricas («Housingo Real Estate S.L.» → «housingo»). */
export function agencyCore(name: string | null | undefined): string | null {
  if (!name) return null;
  const t = (fold(name).match(/[a-z0-9]+/g) ?? []).filter((w) => !AGENCY_STOP.has(w));
  return t.length ? t.join(" ") : null;
}

export function sameAgency(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = agencyCore(a);
  const y = agencyCore(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 5 && y.startsWith(`${x} `)) || (y.length >= 5 && x.startsWith(`${y} `));
}

/** Identificador de una foto: nombre de fichero sin tamaño, extensión ni query («…/ab12cd.webp?w=300» → «ab12cd»). */
export function photoKey(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const last = url.split("?")[0].split("/").pop() ?? "";
  const base = last.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_](\d{2,4}x\d{2,4}|small|medium|large|thumb|orig(inal)?)$/i, "");
  return base.length >= 8 ? base.toLowerCase() : null;
}

/** Fotos en común (identificadores); `strong` = al menos 2 y ≥ 30 % de la galería más corta. */
export function photoOverlap(a: string[] | undefined, b: string[] | undefined): { shared: number; strong: boolean } {
  if (!a?.length || !b?.length) return { shared: 0, strong: false };
  const sb = new Set(b);
  let shared = 0;
  for (const k of new Set(a)) if (sb.has(k)) shared++;
  return { shared, strong: shared >= 2 && shared / Math.min(new Set(a).size, sb.size) >= 0.3 };
}
