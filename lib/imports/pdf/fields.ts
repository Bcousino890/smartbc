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
/** «REFORMADO» → «Reformado», «A REFORMAR» → «A reformar». */
function titleCase(s: string): string {
  const t = s.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// ── Precio ──────────────────────────────────────────────────────────────────

type PriceKind = "sale" | "rent";
const PRICE_RE =
  /(?:(€|eur)\s*)?(\d{1,3}(?:[.\s ]\d{3})+|\d{3,9})(?:,\d{1,2})?\s*(€|eur(?:os)?\b)?(\s*(?:\/\s*mes|al mes|mensuales|\/mensual|€\s*\/\s*mes))?/gi;
// Importes que no son el precio del inmueble.
const NOT_PRICE_BEFORE = /(comunidad|ibi|fianza|gastos|ratio|dep[oó]sito|honorarios|tasa|basura|suministros|garaje opcional|plaza de garaje|trastero opcional|reserva|aval)[^\n€]{0,25}$/i;
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
    // «RATIO €/M²» o «Precio/m²» en la línea anterior: es un precio por metro.
    const lineStart = p.text.lastIndexOf("\n", idx);
    const prevLines = lineStart < 0 ? [] : p.text.slice(0, lineStart).split("\n").map((l) => l.trim()).filter(Boolean);
    if (/ratio|€\s*\/\s*m(?!es)|precio\s*\/\s*m(?!es)|eur\s*\/\s*m(?!es)/i.test(prevLines[prevLines.length - 1] ?? "")) continue;
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

// Señales para separar viviendas (split.ts). Leen también las fichas de
// agencia («PRECIO» / «DORMITORIOS» con el valor en la línea siguiente).
const signalText = (text: string) => ({ page: 1, text: normalizeLayout(text) });
export const pageHasPrice = (text: string) => {
  const p = signalText(text);
  return priceHits(p).length > 0;
};
export const pageHasArea = (text: string) => {
  const p = signalText(text);
  return areaHits(p).length > 0 || labelPairs(p).some((l) => l.kind === "area");
};
export const pageHasRooms = (text: string) => {
  const p = signalText(text);
  return countHits(p, BEDROOMS).length > 0 || labelPairs(p).some((l) => l.kind === "bedrooms");
};

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

// ── Maquetado de las fichas de agencia ─────────────────────────────────────

/**
 * Deshace dos cosas del maquetado que estorban a las reglas:
 *  · títulos con letras espaciadas («D O R M I T O R I O S», «R E F : 1 1 7 8»):
 *    una racha de 4 o más caracteres sueltos separados por un espacio se junta;
 *  · palabras partidas con guion a final de línea («CASTEL-\nLANA», «ofre-\nciendo»).
 */
export function normalizeLayout(text: string): string {
  const dehyphen = text.replace(/(\p{L})-\n(\p{L})/gu, "$1$2");
  return dehyphen
    .split("\n")
    .map((line) => {
      const tokens = line.split(" ");
      const out: string[] = [];
      let run: string[] = [];
      const flush = () => {
        if (run.length >= 4) out.push(run.join(""));
        else out.push(...run);
        run = [];
      };
      for (const t of tokens) {
        if ([...t].length === 1) run.push(t);
        else {
          flush();
          out.push(t);
        }
      }
      flush();
      return out.join(" ");
    })
    .join("\n");
}

type LabelKind = "bedrooms" | "bathrooms" | "area" | "price" | "zone" | "floor" | "reference" | "situation" | "state" | "orientation" | "flag";
// Etiquetas sin espacios ni tildes (tras normalizeLayout las de letras espaciadas quedan juntas).
const LABELS: [RegExp, LabelKind][] = [
  [/^(dormitorios?|habitaciones?|hab\.?)$/, "bedrooms"],
  [/^(banos?|banoscompletos)$/, "bathrooms"],
  [/^(superficie|superficieconstruida|metros|metroscuadrados|metrosconstruidos|metroscatastrales|m2|m2construidos|superficieutil)$/, "area"],
  [/^(precio|preciodeventa|preciodealquiler|renta|alquiler|precioalquiler|precioventa)$/, "price"],
  [/^(zona|barrio|distrito|ubicacion|localizacion)$/, "zone"],
  [/^(planta|altura)$/, "floor"],
  [/^(ref|referencia)$/, "reference"],
  [/^(situacion|exterior\/interior)$/, "situation"],
  [/^(estado|estadodeconservacion|conservacion)$/, "state"],
  [/^(orientacion)$/, "orientation"],
  [/^(ascensor|garaje|parking|plazadegaraje|trastero|terraza|piscina|airea?condicionado|calefaccion|amueblado|portero|conserje|jardin|balcon|balcones)$/, "flag"],
];
const FLAG_FEATURE: Record<string, string> = {
  ascensor: "Ascensor", garaje: "Garaje", parking: "Garaje", plazadegaraje: "Garaje", trastero: "Trastero", terraza: "Terraza", piscina: "Piscina",
  aireacondicionado: "Aire acondicionado", airecondicionado: "Aire acondicionado", calefaccion: "Calefacción", amueblado: "Amueblado",
  portero: "Portero", conserje: "Portero", jardin: "Jardín", balcon: "Balcón", balcones: "Balcón",
};
const foldKey = (s: string) => catalogFold(s).replace(/[\s:.·]+/g, "");

interface LabelHit {
  kind: LabelKind;
  label: string;
  value: string;
  page: number;
  snippet: string;
}

/** Pares «ETIQUETA» → valor en la línea siguiente (o «Etiqueta: valor» en la misma). */
function labelPairs(p: PageText): LabelHit[] {
  const lines = p.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: LabelHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const inline = lines[i].match(/^([^:]{2,30}):\s*(.{1,80})$/);
    const candidates: [string, string | undefined][] = [[lines[i], lines[i + 1]]];
    if (inline) candidates.unshift([inline[1], inline[2]]);
    for (const [rawLabel, rawValue] of candidates) {
      if (!rawValue) continue;
      const key = foldKey(rawLabel);
      if (key.length > 30) continue;
      const hit = LABELS.find(([re]) => re.test(key));
      if (!hit) continue;
      // El valor no puede ser otra etiqueta conocida.
      if (LABELS.some(([re]) => re.test(foldKey(rawValue)))) continue;
      out.push({ kind: hit[1], label: key, value: rawValue.trim(), page: p.page, snippet: `${rawLabel.trim()}: ${rawValue.trim()}`.slice(0, 120) });
      break;
    }
  }
  return out;
}

/** Primer número entero de un valor («2 + 1 ASEO» → 2, «tres» → 3, «212 M²» → 212, «1.250.000 €» → 1250000). */
function firstNumber(s: string): number | null {
  const m = s.match(/\d{1,3}(?:\.\d{3})+|\d+/);
  if (m) return Number(m[0].replace(/\./g, ""));
  const w = catalogFold(s).match(new RegExp(`(?:^|\\s)(${Object.keys(WORD_NUM).join("|")})(?:\\s|$)`));
  return w ? WORD_NUM[w[1]] : null;
}
const YES = /^(s[ií]|yes|x|✓|✔|incluid[oa]|con\b)/i;
const NO = /^(no\b|sin\b|[—–-]+$)/i;

// ── Otros campos ────────────────────────────────────────────────────────────

// Sin flag «i»: con él \p{Lu} casaría cualquier letra; el tipo de vía admite mayúscula inicial.
const ADDRESS_RE = /(?<![\p{L}])(?:[Cc]alle|[Cc]\/|[Aa]vda\.?|[Aa]venida|[Pp]aseo|[Pp][ºo]\.|[Pp]laza|[Pp]za\.?|[Rr]onda|[Gg]lorieta|[Cc]amino|[Tt]raves[ií]a)\s+(?:de(?:l| la| los| las)?\s+)?\p{Lu}[\p{L}'.]*(?:\s+(?:de(?:l| la)?\s+)?\p{Lu}[\p{L}'.]*){0,4}(?:,?\s*(?:n[ºo°]\.?\s*)?\d{1,4})?/gu;
// Sin flag «i» para que «…TÉCNICOSREF:1178» (mayúsculas pegadas) valga y «preferencia» no.
const REF_RE = /(?<![a-záéíóúñ])(?:[Rr]ef(?:erencia)?|REF(?:ERENCIA)?)\.?\s*(?:[Ii]nterna|INTERNA)?\s*[:#º]?\s*([A-Za-z0-9][A-Za-z0-9\-/]{2,19})\b/g;
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
// Con límites de palabra Unicode: «\b» de JS no ve la «Á» de «Ático».
const TITLE_HINT = /(?<![\p{L}])(piso|[áa]tico|chalet|casa|apartamento|estudio|d[úu]plex|local|loft|vivienda|bajo|villa|tr[ií]plex|[áa]tico|[áa]tico)(?![\p{L}])/iu;

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
  // Por cada valor, su aparición de más peso (antes se quedaba con la primera y,
  // si la de más peso repetía un valor ya visto, no quedaba candidato: fallo).
  const distinct = new Map<string, Hit<T>>();
  for (const h of hits) {
    const k = key(h.value);
    const cur = distinct.get(k);
    if (!cur || (h.weight ?? 1) > (cur.weight ?? 1)) distinct.set(k, h);
  }
  const best = Math.max(...hits.map((h) => h.weight ?? 1));
  const top = [...distinct.values()].filter((h) => (h.weight ?? 1) === best);
  const hit = top[0];
  const others = [...distinct.values()].filter((h) => h !== hit).map((h) => `${label(h.value)} (pág. ${h.page})`);
  const sure = distinct.size === 1 || (top.length === 1 && best > 1);
  return { hit, ev: { status: sure ? "seguro" : "dudoso", page: hit.page, snippet: hit.snippet, ...(others.length && !sure ? { alternatives: others.slice(0, 5) } : {}) } };
}

/**
 * La descripción de una página: sus párrafos de texto corrido (25 palabras o más),
 * sin el aviso legal ni los bloques de ficha («PRECIO», «2.190.000 €»…), con las
 * líneas de cada párrafo unidas. Si la página no tiene ninguno, su texto tal cual.
 */
const LEGAL = /informaci[oó]n legal|car[aá]cter contractual|TRLGDCU|RDL\s*\d|ITP\/AJD|protecci[oó]n de datos|RGPD/i;
function proseOf(text: string): { prose: string; rest: string } {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  // Las palabras se cuentan sin letras espaciadas («C O Q U E T O» es una, no seis).
  const prose = blocks.filter((b) => normalizeLayout(b).split(/\s+/).length >= 25 && !LEGAL.test(b));
  return {
    prose: prose.map((b) => b.replace(/([^.!?:;])\n(?=\S)/g, "$1 ")).join("\n\n"),
    rest: blocks.filter((b) => !LEGAL.test(b)).join("\n\n"),
  };
}

export function extractPdfFields(pages: PageText[]): PdfFieldsResult {
  const fields: DraftFields = { ...EMPTY_FIELDS, features: [] };
  const evidence: Record<string, FieldEvidence> = {};
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  // Para las reglas, el texto sin letras espaciadas ni palabras partidas; para la
  // descripción, el original solo sin las palabras partidas.
  const ordered = sorted.map((p) => ({ page: p.page, text: normalizeLayout(p.text.normalize("NFC")) }));
  const readable = sorted.map((p) => ({ page: p.page, text: p.text.normalize("NFC").replace(/(\p{L})-\n(\p{L})/gu, "$1$2") }));
  const all = ordered.map((p) => p.text).join("\n");
  // Fichas de agencia: «ETIQUETA» → valor. Mandan sobre el texto libre (peso 3).
  const labels = ordered.flatMap(labelPairs);
  const ofKind = (k: LabelKind) => labels.filter((l) => l.kind === k);
  const fromLabel = <T,>(k: LabelKind, parse: (l: LabelHit) => T | null): Hit<T>[] =>
    ofKind(k).flatMap((l) => {
      const v = parse(l);
      return v === null ? [] : [{ value: v, page: l.page, snippet: l.snippet, weight: 3 }];
    });

  // Precio y operación. Venta y alquiler a la vez → dudoso: V1 no crea duales (I-12a).
  const prices = [
    ...ordered.flatMap(priceHits),
    ...ofKind("price").flatMap((l) => priceHits({ page: l.page, text: `${l.label.includes("alquiler") || l.label === "renta" ? "Alquiler: " : ""}${l.value}` }).map((h) => ({ ...h, snippet: l.snippet, weight: 3 }))),
  ];
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

  const area = choose(
    [...ordered.flatMap(areaHits), ...fromLabel("area", (l) => {
      const n = firstNumber(l.value);
      return n !== null && n >= 10 && n <= FIELD_LIMITS.area ? n : null;
    })],
    String,
    (v) => `${v} m²`,
  );
  if (area) {
    fields.squareMeters = area.hit.value;
    evidence.squareMeters = area.ev;
  }
  const smallCount = (l: LabelHit) => {
    const n = firstNumber(l.value);
    return n !== null && n <= FIELD_LIMITS.rooms ? n : null;
  };
  const beds = choose([...ordered.flatMap((p) => countHits(p, BEDROOMS)), ...fromLabel("bedrooms", smallCount)], String, String);
  if (beds) {
    fields.bedrooms = beds.hit.value;
    evidence.bedrooms = beds.ev;
  }
  const baths = choose([...ordered.flatMap((p) => countHits(p, BATHROOMS)), ...fromLabel("bathrooms", smallCount)], String, String);
  if (baths) {
    fields.bathrooms = baths.hit.value;
    evidence.bathrooms = baths.ev;
  }

  // Planta: la etiqueta manda; si no, el mismo parser que la ficha (lib/floor.ts).
  const floorLabel = ofKind("floor")[0];
  const labelFloor = floorLabel ? extractFloor(null, `planta ${floorLabel.value}`) : null;
  const extraFeatures: string[] = [];
  // «ENTREPLANTA», «SEMISÓTANO», «PRINCIPAL»: no son un número de planta; van como característica.
  const odd = floorLabel ? /entreplanta|semis[oó]tano|principal|entresuelo/i.test(floorLabel.value) : false;
  if (floorLabel && (labelFloor === null || odd)) extraFeatures.push(titleCase(floorLabel.value));
  const floors = (floorLabel && labelFloor !== null && labelFloor >= 0 ? [{ p: { page: floorLabel.page, text: floorLabel.snippet }, n: labelFloor }] : [])
    .concat(ordered.map((p) => ({ p, n: extractFloor(null, p.text) })) as { p: PageText; n: number }[])
    .filter((x): x is { p: PageText; n: number } => x.n !== null && x.n >= 0);
  const ignored = Boolean(floorLabel && (labelFloor === null || odd));
  if (floors.length && !ignored) {
    const n = floors[0].n;
    fields.floor = n === ATICO_FLOOR ? "ático" : n === 0 ? "bajo" : String(n);
    const m = floors[0].p.text.match(/planta|piso|[áa]tico|bajo/i);
    evidence.floor = {
      status: new Set(floors.map((f) => f.n)).size === 1 || (floorLabel && labelFloor === n) ? "seguro" : "dudoso",
      page: floors[0].p.page,
      ...(m ? { snippet: snippetAt(floors[0].p.text, m.index ?? 0, m[0].length) } : {}),
    };
  }
  // Zona: distrito y barrio de la taxonomía de los catálogos.
  const zones = [
    ...ofKind("zone").flatMap((l) => zoneHits({ page: l.page, text: l.value }).map((z) => ({ ...z, strong: true, snippet: l.snippet }))),
    ...ordered.flatMap(zoneHits),
  ];
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

  const refLabel = ofKind("reference").find((l) => /\d/.test(l.value));
  const ref = firstPageWith(ordered, (p) => [...p.text.matchAll(REF_RE)].find((m) => /\d/.test(m[1])) ?? null);
  if (refLabel) evidence.reference = { status: "seguro", page: refLabel.page, snippet: refLabel.value.replace(/\s+/g, "").slice(0, 20) };
  else if (ref) evidence.reference = { status: "seguro", page: ref.page.page, snippet: ref.value[1] };

  // Características: las etiquetas «SÍ/NO» mandan sobre las palabras sueltas
  // («GARAJE: NO» no puede acabar como «Garaje»).
  const flagYes = new Set<string>();
  const flagNo = new Set<string>();
  for (const l of ofKind("flag")) {
    const f = FLAG_FEATURE[l.label];
    if (!f) continue;
    if (NO.test(l.value.trim())) flagNo.add(f);
    else if (YES.test(l.value.trim()) || /\d/.test(l.value)) flagYes.add(f);
  }
  const push = (f: string) => {
    if (fields.features.length < FIELD_LIMITS.features && !fields.features.includes(f) && !flagNo.has(f)) fields.features.push(f);
  };
  for (const f of flagYes) push(f);
  for (const l of ofKind("situation")) {
    if (/exterior/i.test(l.value)) push("Exterior");
    else if (/interior/i.test(l.value)) push("Interior");
  }
  for (const l of ofKind("state")) if (l.value.length <= 40) push(titleCase(l.value));
  for (const l of ofKind("orientation")) if (l.value.length <= 30) push(`Orientación ${l.value.toLowerCase()}`);
  for (const f of extraFeatures) push(f);
  for (const [re, label] of FEATURES) {
    const f = firstPageWith(ordered, (p) => p.text.match(re));
    if (f) {
      if (label === "Amueblado" && fields.features.includes("Sin amueblar")) continue;
      push(label);
    }
  }
  if (fields.features.length) evidence.features = { status: "seguro", page: ordered[0]?.page };

  // Título: una línea del propio documento (nunca redactada), siempre «dudoso».
  const lines = readable.flatMap((p) => p.text.split("\n").map((l) => ({ l: l.replace(/\s+/g, " ").trim(), p })));
  // Un título es una línea corta, no un trozo de párrafo (sin punto a mitad ni coma final).
  const candidate = (x: { l: string }) =>
    x.l.length >= 8 &&
    x.l.length <= 90 &&
    /\p{L}{3}/u.test(x.l) &&
    !/[.,;]\s+\p{Ll}|[,;]$/u.test(x.l) &&
    !/€|@|https?:|www\.|\d{3}[\s.-]?\d{3}[\s.-]?\d{3}|p[áa]gina \d/i.test(x.l);
  // Primero entre las primeras líneas del documento; luego en cualquier sitio.
  const head = lines.slice(0, 12);
  const t = head.find((x) => candidate(x) && TITLE_HINT.test(x.l)) ?? head.find(candidate) ?? lines.find((x) => candidate(x) && TITLE_HINT.test(x.l)) ?? lines.find(candidate);
  if (t) {
    fields.title = t.l.slice(0, FIELD_LIMITS.title);
    evidence.title = { status: "dudoso", page: t.p.page, snippet: t.l.slice(0, 120) };
  }

  // Descripción: el texto del documento sin los contactos del colaborador.
  const removedContacts: RemovedContact[] = [];
  // Si el documento tiene párrafos de texto corrido, la descripción son esos; si
  // no (fichas solo de datos), el texto de las páginas sin el aviso legal.
  const split = readable.map((p) => ({ page: p.page, ...proseOf(p.text) }));
  const useProse = split.some((x) => x.prose);
  const parts = split.map((x) => {
    const s = stripContacts(useProse ? x.prose : x.rest, x.page);
    removedContacts.push(...s.removed);
    return s.text;
  });
  const description = parts.filter(Boolean).join("\n\n").slice(0, FIELD_LIMITS.description);
  if (description) {
    fields.description = description;
    evidence.description = removedContacts.length
      ? { status: "dudoso", page: readable[0]?.page, snippet: `Se han quitado ${removedContacts.length} dato(s) de contacto del colaborador` }
      : { status: "seguro", page: readable[0]?.page };
  }

  return { fields, evidence, removedContacts };
}
