// Campos de una vivienda a partir del texto de sus páginas (BCP-01 P7, I-18).
// Puro, con reglas y sin IA. Cada campo sale con su estado y su prueba:
//   · seguro  → un solo valor claro en el documento;
//   · dudoso  → hay más de un valor, o la regla es débil (título, dirección);
//   · sin dato → el campo queda vacío y la revisión dice «Falta».
// Nada se inventa: si el documento no lo dice, el campo se queda vacío.

import { catalogFold, catalogZoneTerms } from "../../catalogs/zones";
import { ATICO_FLOOR, extractFloor } from "../../floor";
import { type DraftFields, EMPTY_FIELDS, type FieldEvidence, FIELD_LIMITS } from "../draft-model";
import { type RemovedContact, stripContacts } from "./sanitize";

export interface PageText {
  page: number;
  text: string;
}

export interface PdfFieldsResult {
  fields: DraftFields;
  evidence: Record<string, FieldEvidence>;
  /** Contactos del colaborador quitados de la descripción (se enseñan en la revisión). */
  removedContacts: RemovedContact[];
}

interface Hit<T> {
  value: T;
  page: number;
  snippet: string;
  /** Peso de la regla (p.ej. «construidos» frente a «útiles»). */
  weight?: number;
}

const WORD_NUM: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8 };

function snippetAt(text: string, index: number, length: number): string {
  const a = Math.max(0, index - 40);
  const b = Math.min(text.length, index + length + 40);
  return `${a > 0 ? "…" : ""}${text.slice(a, b).replace(/\s+/g, " ").trim()}${b < text.length ? "…" : ""}`;
}

/** «1.250.000», «450 000», «2.400», «2400,50» → entero (los decimales se descartan). */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[\s ]/g, "").replace(/,\d{1,2}$/, "");
  if (!/^\d{1,3}(\.\d{3})+$|^\d+$/.test(s)) return null;
  const n = Number(s.replace(/\./g, ""));
  return Number.isFinite(n) ? n : null;
}

// «2.800», «1.250.000» (toLocaleString("es-ES") no agrupa las de cuatro cifras).
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// ── Precio ──────────────────────────────────────────────────────────────────

type PriceKind = "sale" | "rent";
const PRICE_RE =
  /(?:(€|eur)\s*)?(\d{1,3}(?:[.\s ]\d{3})+|\d{3,9})(?:,\d{1,2})?\s*(€|eur(?:os)?\b)?(\s*(?:\/\s*mes|al mes|mensuales|\/mensual|€\s*\/\s*mes))?/gi;
// Importes que no son el precio del inmueble.
const NOT_PRICE_BEFORE = /(comunidad|ibi|fianza|gastos|dep[oó]sito|honorarios|tasa|basura|suministros|garaje opcional|plaza de garaje|trastero opcional|reserva|aval)[^\n€]{0,25}$/i;
const PER_AREA_AFTER = /^\s*(?:€|eur)?\s*\/\s*(?:m2|m²|m\b)/i;

function priceHits(p: PageText): Hit<{ amount: number; kind: PriceKind }>[] {
  const out: Hit<{ amount: number; kind: PriceKind }>[] = [];
  for (const m of p.text.matchAll(PRICE_RE)) {
    if (!m[1] && !m[3]) continue;
    const amount = parseAmount(m[2]);
    if (amount === null || amount < 100 || amount > FIELD_LIMITS.price) continue;
    const idx = m.index ?? 0;
    const before = p.text.slice(Math.max(0, idx - 60), idx);
    const after = p.text.slice(idx + m[0].length, idx + m[0].length + 12);
    if (NOT_PRICE_BEFORE.test(before) || PER_AREA_AFTER.test(after) || /\/\s*(?:m2|m²)/i.test(m[0])) continue;
    const line = p.text.slice(p.text.lastIndexOf("\n", idx) + 1, idx);
    let kind: PriceKind;
    if (m[4]) kind = "rent";
    else if (/alquiler|renta|se alquila/i.test(line) && amount < 30_000) kind = "rent";
    else if (amount >= 30_000) kind = "sale";
    else continue; // importe pequeño sin «/mes» ni «alquiler»: no se adivina
    out.push({ value: { amount, kind }, page: p.page, snippet: snippetAt(p.text, idx, m[0].length) });
  }
  return out;
}

// ── m², dormitorios, baños ──────────────────────────────────────────────────

const AREA_RE = /(\d{2,5}(?:[.,]\d{1,2})?)[ \t\u00a0]*(?:m2|m²|m\s²|m\?|mts\.?2?|metros(?:\s+cuadrados)?)(?![\w])/gi; // «m?»: el OCR lee así «m²»
function areaHits(p: PageText): Hit<number>[] {
  const out: Hit<number>[] = [];
  for (const m of p.text.matchAll(AREA_RE)) {
    const idx = m.index ?? 0;
    if (/€[ \t]*\/[ \t]*$/.test(p.text.slice(Math.max(0, idx - 4), idx))) continue; // «€/ 95 m²» (precio por m²)
    const n = Math.round(Number(m[1].replace(",", ".").replace(/\.(\d{3})$/, "$1")));
    if (!Number.isFinite(n) || n < 10 || n > FIELD_LIMITS.area) continue;
    // Lo que acompaña a ESTA cifra (hasta el siguiente separador o número): «útiles», «construidos».
    const near = p.text.slice(Math.max(0, idx - 22), idx + m[0].length + 22).toLowerCase().split(/[·|\n;]/).find((seg) => seg.includes(m[0].toLowerCase())) ?? "";
    const weight = /constru/.test(near) ? 2 : /[úu]tiles/.test(near) ? 0 : 1;
    out.push({ value: n, page: p.page, snippet: snippetAt(p.text, idx, m[0].length), weight });
  }
  return out;
}

function countHits(p: PageText, nouns: string): Hit<number>[] {
  const out: Hit<number>[] = [];
  // Sin cruzar de línea: «Dormitorios: 4\nBaños: 3» no es «4 baños».
  const a = new RegExp(`\\b(\\d{1,2}|${Object.keys(WORD_NUM).join("|")})[ \\t\\u00a0]+(?:${nouns})(?![\\p{L}])`, "giu");
  const b = new RegExp(`\\b(?:${nouns})[ \\t\\u00a0]*[:\\-]?[ \\t\\u00a0]*(\\d{1,2})\\b`, "giu");
  for (const re of [a, b]) {
    for (const m of p.text.matchAll(re)) {
      const raw = m[1].toLowerCase();
      const n = /^\d+$/.test(raw) ? Number(raw) : WORD_NUM[raw];
      if (n === undefined || n > FIELD_LIMITS.rooms) continue;
      out.push({ value: n, page: p.page, snippet: snippetAt(p.text, m.index ?? 0, m[0].length) });
    }
  }
  return out;
}
const BEDROOMS = "dormitorios?|habitaciones?|hab\\.|dorm\\.?|dorms\\.?";
const BATHROOMS = "baños?|banos?";

// Señales para separar viviendas (split.ts).
export const pageHasPrice = (text: string) => priceHits({ page: 1, text }).length > 0;
export const pageHasArea = (text: string) => areaHits({ page: 1, text }).length > 0;
export const pageHasRooms = (text: string) => countHits({ page: 1, text }, BEDROOMS).length > 0;

// ── Zona (taxonomía de los catálogos) ───────────────────────────────────────

// Barrios que también son palabras corrientes: solo cuentan con mayúscula y
// con su distrito en el documento, o detrás de «barrio de».
const COMMON_WORDS = new Set(
  ["sol", "lista", "estrella", "paz", "colina", "rosas", "ibiza", "castilla", "salvador", "universidad", "palacio", "justicia", "imperial", "concepcion", "atalaya", "arcos", "valverde", "comillas", "cortes", "pacifico", "prosperidad", "delicias", "castellana", "goya", "almagro", "trafalgar", "chopera", "acacias", "atocha", "legazpi", "ventas", "adelfas", "estrella", "media legua", "lucero", "aeropuerto", "simancas", "canillas", "palomas", "rejas", "amposta", "buenavista", "numancia", "portazgo", "berruguete", "almenara", "colina", "quintana", "costillares", "embajadores", "huertas", "san isidro", "san diego", "san fermin", "san andres", "san cristobal", "san juan bautista", "san pascual", "las tablas", "la paz"].map(catalogFold),
);

interface ZoneHit {
  district: string;
  barrio: string | null;
  page: number;
  snippet: string;
  strong: boolean;
}
let zoneTermsCache: { re: RegExp; byTerm: Map<string, { district: string; barrio: string | null }> } | null = null;
function zoneTerms() {
  if (zoneTermsCache) return zoneTermsCache;
  const byTerm = new Map<string, { district: string; barrio: string | null }>();
  for (const t of catalogZoneTerms()) byTerm.set(t.term, { district: t.district, barrio: t.barrio });
  const alts = [...byTerm.keys()].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  zoneTermsCache = { re: new RegExp(`(?<![\\p{L}])(${alts.join("|")})(?![\\p{L}])`, "gu"), byTerm };
  return zoneTermsCache;
}

function zoneHits(p: PageText): ZoneHit[] {
  const { re, byTerm } = zoneTerms();
  // Mismo pliegue que catalogFold pero SIN trim, para conservar las posiciones.
  const original = p.text.normalize("NFC");
  const folded = original.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const sameLength = folded.length === original.length;
  const out: ZoneHit[] = [];
  for (const m of folded.matchAll(re)) {
    const t = byTerm.get(m[1]);
    if (!t) continue;
    const idx = m.index ?? 0;
    const orig = sameLength ? original.slice(idx, idx + m[1].length) : m[1];
    const capital = /^\p{Lu}/u.test(orig);
    const before = folded.slice(Math.max(0, idx - 14), idx);
    const introduced = /(barrio|distrito|zona)\s+(de\s+)?$/.test(before) || /\ben\s+$/.test(before);
    const common = COMMON_WORDS.has(m[1]);
    if (common && !capital) continue;
    out.push({ district: t.district, barrio: t.barrio, page: p.page, snippet: snippetAt(p.text, idx, m[1].length), strong: !common || introduced });
  }
  return out;
}

// ── Otros campos ────────────────────────────────────────────────────────────

// Sin flag «i»: con él \p{Lu} casaría cualquier letra; el tipo de vía admite mayúscula inicial.
const ADDRESS_RE = /(?<![\p{L}])(?:[Cc]alle|[Cc]\/|[Aa]vda\.?|[Aa]venida|[Pp]aseo|[Pp][ºo]\.|[Pp]laza|[Pp]za\.?|[Rr]onda|[Gg]lorieta|[Cc]amino|[Tt]raves[ií]a)\s+(?:de(?:l| la| los| las)?\s+)?\p{Lu}[\p{L}'.]*(?:\s+(?:de(?:l| la)?\s+)?\p{Lu}[\p{L}'.]*){0,4}(?:,?\s*(?:n[ºo°]\.?\s*)?\d{1,4})?/gu;
const REF_RE = /\bref(?:erencia)?\.?\s*(?:interna)?\s*[:#º]?\s*([A-Z0-9][A-Z0-9\-/]{2,19})\b/gi;
const STAY_LONG = /larga (?:estancia|duraci[oó]n)|vivienda habitual|contrato (?:de )?(?:1|un|5|cinco) años?/i;
const STAY_SHORT = /temporada|corta (?:estancia|duraci[oó]n)|media estancia|alquiler temporal|por meses|m[ií]nimo \d+ meses/i;
const FEATURES: [RegExp, string][] = [
  [/(?<!sin\s)\bascensor\b/i, "Ascensor"],
  [/\bterraza\b/i, "Terraza"],
  [/\bbalc[oó]n(es)?\b/i, "Balcón"],
  [/\bexterior\b/i, "Exterior"],
  [/\b(garaje|plaza de aparcamiento|parking)\b/i, "Garaje"],
  [/\btrastero\b/i, "Trastero"],
  [/\bpiscina\b/i, "Piscina"],
  [/\baire acondicionado\b/i, "Aire acondicionado"],
  [/\bcalefacci[oó]n\b/i, "Calefacción"],
  [/\b(portero|conserje)\b/i, "Portero"],
  [/\bjard[ií]n\b/i, "Jardín"],
  [/(?<!sin\s|no\s)\bamueblad[oa]\b/i, "Amueblado"],
  [/\bsin amueblar\b/i, "Sin amueblar"],
];
const TITLE_HINT = /\b(piso|[áa]tico|chalet|casa|apartamento|estudio|d[úu]plex|local|loft|vivienda|bajo|villa|tr[ií]plex|[áa]tico)\b/i;

function firstPageWith<T>(pages: PageText[], fn: (p: PageText) => T | null): { value: T; page: PageText } | null {
  for (const p of pages) {
    const v = fn(p);
    if (v !== null) return { value: v, page: p };
  }
  return null;
}

/** Elige un valor y dice si es seguro: un único valor distinto (o el de más peso sin empate). */
function choose<T>(hits: Hit<T>[], key: (v: T) => string, label: (v: T) => string): { hit: Hit<T>; ev: FieldEvidence } | null {
  if (!hits.length) return null;
  const distinct = new Map<string, Hit<T>>();
  for (const h of hits) if (!distinct.has(key(h.value))) distinct.set(key(h.value), h);
  const best = Math.max(...hits.map((h) => h.weight ?? 1));
  const top = [...distinct.values()].filter((h) => (h.weight ?? 1) === best);
  const hit = top[0];
  const others = [...distinct.values()].filter((h) => h !== hit).map((h) => `${label(h.value)} (pág. ${h.page})`);
  const sure = distinct.size === 1 || (top.length === 1 && best > 1);
  return { hit, ev: { status: sure ? "seguro" : "dudoso", page: hit.page, snippet: hit.snippet, ...(others.length && !sure ? { alternatives: others.slice(0, 5) } : {}) } };
}

export function extractPdfFields(pages: PageText[]): PdfFieldsResult {
  const fields: DraftFields = { ...EMPTY_FIELDS, features: [] };
  const evidence: Record<string, FieldEvidence> = {};
  const ordered = [...pages].sort((a, b) => a.page - b.page).map((p) => ({ page: p.page, text: p.text.normalize("NFC") }));
  const all = ordered.map((p) => p.text).join("\n");

  // Precio y operación. Venta y alquiler a la vez → dudoso: V1 no crea duales (I-12a).
  const prices = ordered.flatMap(priceHits);
  const pc = choose(prices, (v) => `${v.kind}:${v.amount}`, (v) => `${fmt(v.amount)} €${v.kind === "rent" ? "/mes" : ""}`);
  if (pc) {
    fields.price = pc.hit.value.amount;
    fields.operation = pc.hit.value.kind;
    evidence.price = pc.ev;
    const kinds = new Set(prices.map((h) => h.value.kind));
    evidence.operation = { status: kinds.size === 1 ? pc.ev.status : "dudoso", page: pc.hit.page, snippet: pc.hit.snippet };
  } else {
    const rent = /\b(se alquila|en alquiler|alquiler de)\b/i.test(all);
    const sale = /\b(se vende|en venta|venta de)\b/i.test(all);
    if (rent !== sale) {
      fields.operation = rent ? "rent" : "sale";
      const f = firstPageWith(ordered, (p) => p.text.match(/\b(se alquila|en alquiler|alquiler de|se vende|en venta|venta de)\b/i));
      evidence.operation = { status: "dudoso", page: f?.page.page, snippet: f ? snippetAt(f.page.text, f.value.index ?? 0, f.value[0].length) : undefined };
    }
  }

  const area = choose(ordered.flatMap(areaHits), String, (v) => `${v} m²`);
  if (area) {
    fields.squareMeters = area.hit.value;
    evidence.squareMeters = area.ev;
  }
  const beds = choose(ordered.flatMap((p) => countHits(p, BEDROOMS)), String, String);
  if (beds) {
    fields.bedrooms = beds.hit.value;
    evidence.bedrooms = beds.ev;
  }
  const baths = choose(ordered.flatMap((p) => countHits(p, BATHROOMS)), String, String);
  if (baths) {
    fields.bathrooms = baths.hit.value;
    evidence.bathrooms = baths.ev;
  }

  // Planta: el mismo parser que la ficha (lib/floor.ts), página a página.
  const floors = ordered
    .map((p) => ({ p, n: extractFloor(null, p.text) }))
    .filter((x): x is { p: PageText; n: number } => x.n !== null && x.n >= 0);
  if (floors.length) {
    const n = floors[0].n;
    fields.floor = n === ATICO_FLOOR ? "ático" : n === 0 ? "bajo" : String(n);
    const m = floors[0].p.text.match(/planta|piso|[áa]tico|bajo/i);
    evidence.floor = {
      status: new Set(floors.map((f) => f.n)).size === 1 ? "seguro" : "dudoso",
      page: floors[0].p.page,
      ...(m ? { snippet: snippetAt(floors[0].p.text, m.index ?? 0, m[0].length) } : {}),
    };
  }

  // Zona: distrito y barrio de la taxonomía de los catálogos.
  const zones = ordered.flatMap(zoneHits);
  const districts = new Set(zones.map((z) => z.district));
  const supported = zones.filter((z) => z.strong || (z.barrio !== null && zones.some((o) => o.barrio === null && o.district === z.district)));
  const usable = supported.length ? supported : [];
  if (usable.length) {
    const z = usable.find((x) => x.barrio) ?? usable[0];
    fields.zone = z.district;
    if (z.barrio && usable.every((x) => x.district === z.district)) fields.subzone = z.barrio;
    const usableDistricts = new Set(usable.map((x) => x.district));
    evidence.zone = {
      status: usableDistricts.size === 1 ? "seguro" : "dudoso",
      page: z.page,
      snippet: z.snippet,
      ...(usableDistricts.size > 1 ? { alternatives: [...usableDistricts].filter((d) => d !== z.district) } : {}),
    };
    if (fields.subzone) evidence.subzone = { status: evidence.zone.status, page: z.page, snippet: z.snippet };
  } else if (districts.size) {
    // Solo palabras corrientes sin apoyo: se proponen como dudosas.
    const z = zones[0];
    fields.zone = z.district;
    evidence.zone = { status: "dudoso", page: z.page, snippet: z.snippet };
  }

  if (fields.operation === "rent") {
    const l = firstPageWith(ordered, (p) => p.text.match(STAY_LONG));
    const s = firstPageWith(ordered, (p) => p.text.match(STAY_SHORT));
    const hit = l && !s ? { v: "long" as const, f: l } : s && !l ? { v: "short" as const, f: s } : null;
    if (hit) {
      fields.stay = hit.v;
      evidence.stay = { status: "seguro", page: hit.f.page.page, snippet: snippetAt(hit.f.page.text, hit.f.value.index ?? 0, hit.f.value[0].length) };
    }
  }

  const addr = firstPageWith(ordered, (p) => [...p.text.matchAll(ADDRESS_RE)][0] ?? null);
  if (addr) {
    fields.address = addr.value[0].trim().slice(0, FIELD_LIMITS.address);
    evidence.address = { status: "dudoso", page: addr.page.page, snippet: snippetAt(addr.page.text, addr.value.index ?? 0, addr.value[0].length) };
  }

  const ref = firstPageWith(ordered, (p) => [...p.text.matchAll(REF_RE)].find((m) => /\d/.test(m[1])) ?? null);
  if (ref) evidence.reference = { status: "seguro", page: ref.page.page, snippet: ref.value[1] };

  for (const [re, label] of FEATURES) {
    const f = firstPageWith(ordered, (p) => p.text.match(re));
    if (f && fields.features.length < FIELD_LIMITS.features) {
      if (label === "Amueblado" && fields.features.includes("Sin amueblar")) continue;
      fields.features.push(label);
    }
  }
  if (fields.features.length) evidence.features = { status: "seguro", page: ordered[0]?.page };

  // Título: una línea del propio documento (nunca redactada), siempre «dudoso».
  const lines = ordered.flatMap((p) => p.text.split("\n").map((l) => ({ l: l.replace(/\s+/g, " ").trim(), p })));
  const candidate = (x: { l: string }) =>
    x.l.length >= 8 && x.l.length <= 140 && /\p{L}{3}/u.test(x.l) && !/€|@|https?:|www\.|\d{3}[\s.-]?\d{3}[\s.-]?\d{3}|p[áa]gina \d/i.test(x.l);
  const t = lines.find((x) => candidate(x) && TITLE_HINT.test(x.l)) ?? lines.find(candidate);
  if (t) {
    fields.title = t.l.slice(0, FIELD_LIMITS.title);
    evidence.title = { status: "dudoso", page: t.p.page, snippet: t.l.slice(0, 120) };
  }

  // Descripción: el texto del documento sin los contactos del colaborador.
  const removedContacts: RemovedContact[] = [];
  const parts = ordered.map((p) => {
    const s = stripContacts(p.text, p.page);
    removedContacts.push(...s.removed);
    return s.text;
  });
  const description = parts.filter(Boolean).join("\n\n").slice(0, FIELD_LIMITS.description);
  if (description) {
    fields.description = description;
    evidence.description = removedContacts.length
      ? { status: "dudoso", page: ordered[0]?.page, snippet: `Se han quitado ${removedContacts.length} dato(s) de contacto del colaborador` }
      : { status: "seguro", page: ordered[0]?.page };
  }

  return { fields, evidence, removedContacts };
}
