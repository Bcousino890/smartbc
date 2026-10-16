// ─────────────────────────────────────────────────────────────────────────────
// Enlace de anuncios de particulares entre portales (y operaciones).
//
// Un mismo piso puede estar en Idealista y en Fotocasa, en venta en uno y en
// alquiler en el otro, a veces con otro teléfono y otro nombre (la pareja del
// propietario). Este módulo decide, SOLO con lo que ya hay en `particulares`,
// qué anuncios son el mismo inmueble y los agrupa en una ficha.
//
// Es PURO (sin red ni base de datos) para poder probarlo con casos reales:
// `scripts/test-particulares-linking.mts`. La parte que lee/escribe en la BD
// es `linking-runner.ts`.
//
// ⚠️ Medido contra los datos reales (2026-10-12, 21.078 anuncios) antes de
// escribir las reglas, y revisado a mano. Lo que enseñó:
//  · "mismo teléfono + características compatibles" es fiable (el teléfono
//    solo NO: el 16 % de los pares con el mismo teléfono eran OTRO piso del
//    mismo dueño u otra operación).
//  · "misma calle + número + m² + habitaciones" a secas NO es fiable: en un
//    edificio con varios pisos iguales (p. ej. 5 pisos de 65 m² y 1 hab. en la
//    misma avenida, de dueños con nombres distintos) enlaza pisos distintos.
//    Por eso sin teléfono en común exige además precio casi igual, que no haya
//    un segundo candidato, y nunca une dos grupos que se contradigan.
//  · Los pisos con planta desconocida actúan de puente y unían un 3.º con un
//    6.º: el agrupado comprueba TODOS los pares de cada grupo, no solo el
//    enlace que se añade.
// ─────────────────────────────────────────────────────────────────────────────

import type { LinkSummaryLite } from "./links-types";
import type { SourceKind } from "./source-kind";

export type LinkRow = {
  id: string;
  portal: string;
  operation: "rent" | "sale" | null;
  is_active: boolean;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  floor: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** 'exact' = pin del portal con la dirección; 'approximate' = pin de zona/calle (puede estar a cientos de metros). */
  location_precision?: string | null;
  phone: string | null;
  phone2: string | null;
  owner_name: string | null;
  assigned_to: string | null;
  n_photos: number;
  created_at: string | null;
  // ── Opcionales: los rellena el cruce con agencias (agency-matching.ts). El enlazado de
  // particulares puro no los necesita y su comportamiento NO cambia sin `refine`.
  /** Tipo de fuente (taxonomía de source-kind.ts): particular · agencia_portal · agencia_web. */
  kind?: SourceKind;
  /** Claves de la ficha en la web de la agencia (`wu:` URL, `wk:` dominio|ref), agency-web.ts. */
  web_keys?: string[];
  /** `scraper_extra.agency_url` (enlace adicional del anuncio). */
  agency_url?: string | null;
  /** Nombre de la agencia que publica (agencias). */
  agency_name?: string | null;
  /** Nombre normalizado de la agencia (`particulares.agency_key`). */
  agency_key?: string | null;
  /** Texto del anuncio (recortado). */
  description?: string | null;
  /** Referencias/IDs del anunciante y del portal ya normalizados (MAYÚSCULAS, solo A-Z0-9). */
  refs?: string[];
  /** Identificadores de foto (nombre de fichero sin tamaño ni extensión) o hashes. */
  photo_keys?: string[];
  /** Claves extra para generar candidatos (misma referencia, misma foto…). */
  block_keys?: string[];
};

export type LinkRelation = "mismo_inmueble" | "mismo_contacto";
export type LinkLevel = "cierto" | "probable" | "informativo";

export type ComputedLink = {
  /** Siempre a < b (comparación de cadenas, igual que `a_id < b_id` en la BD). */
  a: string;
  b: string;
  relation: LinkRelation;
  level: LinkLevel;
  rule: string;
  score: number;
  evidence: Record<string, unknown>;
};

export type LinkDecision = {
  a: string;
  b: string;
  relation: LinkRelation;
  status: "confirmado" | "descartado";
};

export type LinkSummary = LinkSummaryLite;

export type RowGroupState = {
  duplicate_of: string | null;
  link_summary: LinkSummary | null;
  link_ops: string[] | null;
};

export type RefinedClass = {
  relation: LinkRelation;
  level: LinkLevel;
  rule: string;
  /** Se funde en `evidence` (razones visibles: descripción, referencia, fotos…). */
  evidence?: Record<string, unknown>;
  /** Prueba propia (referencia / descripción / fotos): no se degrada por «varios pisos iguales». */
  extraStrong?: boolean;
};

export type LinkOptions = {
  /** Ajusta la decisión de un par (o la crea si `base` es null). Solo lo usa el cruce con agencias. */
  refine?: (a: LinkRow, b: LinkRow, base: RefinedClass | null, f: Feats) => RefinedClass | null;
};

export type LinkingResult = {
  links: ComputedLink[];
  /** Estado deseado de CADA fila (las no agrupadas llevan todo a null). */
  state: Map<string, RowGroupState>;
  groups: Array<{ primary: string; members: string[] }>;
  stats: Record<string, number>;
};

// ── Normalización ────────────────────────────────────────────────────────────

const fold = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Clave E.164 sin "+" para comparar teléfonos de CUALQUIER país: "+34 600 12 34 56",
 * "0034600123456" y "600123456" dan la misma clave; "+33 7 12 34 56 78" y
 * "0033712345678" también. Menos de 8 dígitos no es un teléfono.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // "0600123456": un 0 delante de un móvil/fijo español de 9 cifras.
  else if (d.length === 10 && /^0[6-9]/.test(d)) d = d.slice(1);
  if (d.length < 8) return null;
  if (d.length === 9 && /^[6-9]/.test(d)) return `34${d}`;
  return d;
}

// Palabras que aparecen en el título del anuncio ("Piso en venta en Calle de
// Tribaldos, 8", "Studio for rent in Calle de Ayala, 81") y no son la calle.
const STREET_STOP = new Set([
  "calle", "c", "cl", "avenida", "avda", "av", "paseo", "pso", "plaza", "pza", "pl", "camino",
  "carretera", "ctra", "travesia", "trv", "ronda", "glorieta", "bulevar", "urbanizacion", "urb",
  "de", "del", "la", "las", "los", "el", "y", "en", "a", "piso", "pisos", "apartamento", "atico",
  "chalet", "casa", "estudio", "duplex", "loft", "local", "vivienda", "adosado", "pareado", "finca",
  "villa", "bajo", "venta", "alquiler", "for", "rent", "sale", "studio", "flat", "apartment",
  "penthouse", "house", "to", "in", "the", "and", "of", "unifamiliar", "independiente", "rustica",
  "oficina", "garaje", "trastero", "terreno", "solar", "habitacion", "room",
  // abreviaturas de vía: «c/», «cl.», «avd», «avgda», «p.º», «ps», «pl.», «cmno»…
  "avd", "avgda", "ps", "p", "cmno", "crta", "cra", "pje", "pasaje", "sn", "flat", "apartamentos", "pisos",
]);

// Abreviaturas de nombre que cambian de un portal a otro («Gral. Pardiñas» / «General Pardiñas»).
const NAME_ABBR: Record<string, string> = {
  gral: "general", gen: "general", dr: "doctor", dra: "doctora", sta: "santa", sto: "santo",
  ntra: "nuestra", sra: "senora", cdad: "ciudad", pte: "puente", mtro: "maestro", ppe: "principe",
  tte: "teniente", cmdt: "comandante", cnel: "coronel", alf: "alferez", fdez: "fernandez",
  gmez: "gomez", gzlez: "gonzalez", glez: "gonzalez", rguez: "rodriguez", mrz: "martinez",
};

export function streetKey(address: string | null | undefined): {
  tokens: Set<string>;
  number: string | null;
} {
  const a = fold(address);
  if (!a) return { tokens: new Set(), number: null };
  // «Calle Mayor 5 2ºB», «Calle Mayor, nº 5, 2º izq», «C/ Mayor, 14 - Bis»: se quita la
  // planta/puerta que cuelga detrás del número y el «nº».
  const cleanPart = (p: string) =>
    p
      .replace(/\bn(?:um|[º°o])?\.?\s*(?=\d)/g, "")
      .replace(/\bs\/n\b/g, " sn ")
      .replace(/\s+\d{1,2}\s*[º°ª]\s*[a-z]?(?:\s.*)?$/, "")
      .replace(/\s+(?:bajo|entresuelo|principal|escalera|esc|portal|puerta|izq|izda|dcha|drcha)\b.*$/, "")
      .trim();
  const parts = a.split(",").map((p) => cleanPart(p.trim()));
  let street = parts[0] ?? "";
  let number: string | null = null;
  const tail = street.match(/\b(\d{1,3})\b\s*(?:-\s*)?(?:bis|dup|duplicado|[a-z])?\s*$/);
  if (tail) {
    number = tail[1];
    street = street.slice(0, tail.index).trim();
  } else if (parts[1] && /^\d{1,3}\b/.test(parts[1])) {
    number = (parts[1].match(/\d+/) as RegExpMatchArray)[0];
  }
  const tokens = new Set(
    (street.match(/[a-z0-9]+/g) ?? [])
      .map((t) => NAME_ABBR[t] ?? t)
      .filter((t) => t.length > 1 && !STREET_STOP.has(t)),
  );
  return { tokens, number };
}

export function exposureOf(floor: string | null | undefined): "ext" | "int" | null {
  const t = fold(floor);
  if (/\bexterior\b/.test(t)) return "ext";
  if (/\binterior\b/.test(t)) return "int";
  return null;
}

export function floorNumber(floor: string | null | undefined): number | null {
  const t = fold(floor);
  if (!t) return null;
  // Español («3ª planta exterior») e inglés de Idealista («3rd floor exterior»).
  const m =
    t.match(/(\d+)\s*[ªa]?\s*planta/) ?? t.match(/planta\s*(\d+)/) ?? t.match(/(\d+)\s*(?:st|nd|rd|th)\s+floor/);
  if (m) return Number(m[1]);
  if (/\b(bajo|planta baja|entreplanta|semisotano|ground floor|basement)\b/.test(t)) return 0;
  return null;
}

function haversineM(
  a: [number | null, number | null],
  b: [number | null, number | null],
): number | null {
  if (a[0] == null || a[1] == null || b[0] == null || b[1] == null) return null;
  const p = Math.PI / 180;
  const h =
    Math.sin(((b[0] - a[0]) * p) / 2) ** 2 +
    Math.cos(a[0] * p) * Math.cos(b[0] * p) * Math.sin(((b[1] - a[1]) * p) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

const GENERIC_NAMES = new Set(["", "particular", "propietario", "anunciante", "owner", "private"]);

type Norm = {
  row: LinkRow;
  phones: Set<string>;
  tokens: Set<string>;
  number: string | null;
  floor: number | null;
  /** "ext" / "int" según el texto de la planta (Idealista: «1ª planta exterior»). */
  exposure: "ext" | "int" | null;
  firstName: string | null;
};

function normalize(row: LinkRow): Norm {
  const sk = streetKey(row.address);
  const phones = new Set<string>();
  for (const p of [row.phone, row.phone2]) {
    const k = phoneKey(p);
    if (k) phones.add(k);
  }
  const first = fold(row.owner_name).split(" ")[0] ?? "";
  return {
    row,
    phones,
    tokens: sk.tokens,
    number: sk.number,
    floor: floorNumber(row.floor),
    exposure: exposureOf(row.floor),
    firstName: GENERIC_NAMES.has(first) ? null : first,
  };
}

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

// ── Características de un par ────────────────────────────────────────────────

export type Feats = {
  T: boolean; // algún teléfono en común
  phonesDiffer: boolean; // los dos tienen teléfono y ninguno coincide
  streetBoth: boolean; // los dos tienen calle y número reconocibles
  S: boolean; // misma calle y número
  /** Misma calle (por nombre) aunque el número sea otro. */
  nameSame: boolean;
  /** |número A − número B| cuando los dos lo tienen. */
  numDelta: number | null;
  dist: number | null;
  /** Hay coordenadas pero una es aproximada: no sirven para enlazar, solo para vetar si están MUY lejos. */
  distWeak: boolean;
  far: boolean;
  M: boolean; // m² ±3 %
  m2Known: boolean;
  Mw: boolean; // m² ±8 %
  m2Conflict: boolean;
  B: boolean;
  bKnown: boolean;
  bConflict: boolean;
  BA: boolean;
  baKnown: boolean;
  baConflict: boolean;
  /** Baños que difieren en 1 entre PORTALES distintos con mismo teléfono y metros iguales (5 vs 6: cada portal cuenta los aseos a su manera). */
  baTol: boolean;
  /** Coordenadas a menos de 60 m. */
  near60: boolean;
  /** Los dos suelos conocidos y la misma planta (y misma exposición si se sabe). */
  Fx: boolean;
  F: boolean;
  fConflict: boolean;
  eConflict: boolean; // uno «exterior» y el otro «interior»: pisos distintos del mismo edificio
  sameOp: boolean;
  samePortal: boolean;
  pricePct: number | null;
  P3: boolean;
  P5: boolean;
  P15: boolean;
  P40: boolean;
  N: boolean; // mismo nombre de pila
};

function pairFeats(x: Norm, y: Norm): Feats {
  const a = x.row;
  const b = y.row;
  const T = [...x.phones].some((p) => y.phones.has(p));
  const phonesDiffer = x.phones.size > 0 && y.phones.size > 0 && !T;
  const streetBoth = !!(x.number && y.number && x.tokens.size && y.tokens.size);
  const S = streetBoth && x.number === y.number && jaccard(x.tokens, y.tokens) >= 0.6;
  const rawDist = haversineM([a.latitude, a.longitude], [b.latitude, b.longitude]);
  // Un pin «aproximado» (dirección oculta en Idealista) puede caer a 100-400 m del piso real: con
  // él ni «a ≤100 m» ni «a ≤150 m» significan nada, así que no cuenta para enlazar y el veto de
  // distancia se relaja. Solo cuentan las coordenadas cuando las DOS son exactas (o no dicen nada).
  const distWeak = rawDist != null && (a.location_precision === "approximate" || b.location_precision === "approximate");
  const dist = distWeak ? null : rawDist;
  const am = a.square_meters;
  const bm = b.square_meters;
  const m2known = !!(am && bm);
  const diff = m2known ? Math.abs((am as number) - (bm as number)) : 0;
  const mx = m2known ? Math.max(am as number, bm as number) : 0;
  const bKnown = a.bedrooms != null && b.bedrooms != null;
  const baKnown = a.bathrooms != null && b.bathrooms != null;
  const sameOp = a.operation != null && a.operation === b.operation;
  const pr =
    sameOp && a.price && b.price ? Math.abs(a.price - b.price) / Math.max(a.price, b.price) : null;
  const baDiff = baKnown ? Math.abs((a.bathrooms as number) - (b.bathrooms as number)) : 0;
  const Mw = m2known && diff <= Math.max(2, 0.08 * mx);
  const baTol = baKnown && baDiff === 1 && T && a.portal !== b.portal && Mw;
  return {
    T,
    phonesDiffer,
    baTol,
    near60: dist != null && dist <= 60,
    Fx: x.floor != null && x.floor === y.floor && !(x.exposure && y.exposure && x.exposure !== y.exposure),
    streetBoth,
    S,
    nameSame: streetBoth && jaccard(x.tokens, y.tokens) >= 0.6,
    numDelta: x.number && y.number ? Math.abs(Number(x.number) - Number(y.number)) : null,
    dist,
    distWeak,
    far: rawDist != null && rawDist > (distWeak ? 1500 : 800),
    M: m2known && diff <= Math.max(1, 0.03 * mx),
    m2Known: m2known,
    Mw,
    m2Conflict: m2known && diff > Math.max(4, 0.12 * mx),
    B: bKnown && a.bedrooms === b.bedrooms,
    bKnown,
    bConflict: bKnown && Math.abs((a.bedrooms as number) - (b.bedrooms as number)) >= 1,
    BA: baKnown && a.bathrooms === b.bathrooms,
    baKnown,
    baConflict: baKnown && baDiff >= 1 && !baTol,
    F: x.floor != null && x.floor === y.floor,
    fConflict: x.floor != null && y.floor != null && x.floor !== y.floor,
    eConflict: x.exposure != null && y.exposure != null && x.exposure !== y.exposure,
    sameOp,
    samePortal: a.portal === b.portal,
    pricePct: pr,
    P3: pr != null && pr <= 0.03,
    P5: pr != null && pr <= 0.05,
    P15: pr != null && pr <= 0.15,
    P40: pr != null && pr <= 0.4,
    N: !!(x.firstName && y.firstName && x.firstName === y.firstName),
  };
}

/** Contradicción dura entre dos anuncios: no pueden ser el mismo piso. */
const hardConflict = (f: Feats): boolean =>
  f.m2Conflict || f.bConflict || f.baConflict || f.fConflict || f.eConflict;

type Classified = { relation: LinkRelation; level: LinkLevel; rule: string } | null;

function classify(f: Feats): Classified {
  const far = f.far;
  const streetDiffers = f.streetBoth && !f.S;
  const veto = hardConflict(f) || far;
  const priceOk = !f.sameOp || f.P15;
  const compat = (!f.bKnown || f.B) && (!f.baKnown || f.BA);

  // Mismo portal y misma operación: solo si es el MISMO contacto (una
  // republicación) o, sin teléfono en común, una coincidencia muy fuerte: calle,
  // metros, habitaciones, baños, precio casi idéntico Y mismo nombre o misma
  // planta. En un edificio con pisos iguales (de dueños distintos) lo demás
  // enlaza pisos que no son el mismo.
  if (f.samePortal && f.sameOp && !f.T) {
    const strong = !f.phonesDiffer && f.S && f.M && f.B && f.BA && f.P3 && (f.N || f.F);
    if (!strong) return null;
  }

  if (!veto) {
    // 1 · El mismo teléfono es la señal más fuerte… pero solo propone: las
    // características tienen que cuadrar (un dueño puede tener varios pisos).
    // «cierto» exige además que la dirección no contradiga (otra calle u otro número a más
    // de 60 m = otro piso del mismo dueño) y evidencia fuerte: metros ±3 % y habitaciones
    // iguales (o ±8 % con habitaciones y baños iguales y precio ±5 %; o sin metros en un
    // lado pero habitaciones, baños y precio ±5 % iguales).
    if (f.T && (f.Mw || (f.B && f.BA)) && priceOk) {
      const bathsOk = !f.baKnown || f.BA || (f.baTol && (!f.sameOp || f.P5));
      const roomsOk = f.B || !f.bKnown;
      // Calle u número distintos = otro portal/otro piso, aunque las coordenadas estén cerca (los
      // portales vecinos están a 5-50 m y el pin no distingue). Única excepción: MISMA calle, entre
      // portales distintos (un portal redondea/oculta el número) y pin ≤60 m con o bien número ±2
      // y pin ≤25 m, o bien misma operación con precio ±3 % y metros ±3 % (misma ficha clavada).
      const numberSlip =
        f.nameSame &&
        !f.samePortal &&
        f.near60 &&
        ((f.numDelta != null && f.numDelta <= 2 && f.dist != null && f.dist <= 25) || (f.sameOp && f.P3 && f.M));
      const addrOk = !streetDiffers || numberSlip;
      const strong =
        addrOk &&
        bathsOk &&
        ((f.M && roomsOk) ||
          (f.Mw && f.B && f.BA && (!f.sameOp || f.P5)) ||
          (!f.m2Known && f.B && f.BA && (!f.sameOp || f.P5)));
      if (strong) {
        return {
          relation: "mismo_inmueble",
          level: "cierto",
          rule: f.baTol ? "R1 teléfono + características (baños ±1 entre portales)" : "R1 teléfono + características",
        };
      }
      return {
        relation: "mismo_inmueble",
        level: "probable",
        rule: !addrOk ? "R1d teléfono, otra dirección" : "R1e teléfono, características aproximadas",
      };
    }
    if (f.T && f.Mw && f.sameOp && !f.P15 && f.P40) {
      return { relation: "mismo_inmueble", level: "probable", rule: "R1b teléfono, precio distinto" };
    }
    if (f.T && !f.sameOp && !streetDiffers && !f.m2Conflict && !f.bConflict) {
      return { relation: "mismo_inmueble", level: "probable", rule: "R6 teléfono, otra operación" };
    }
    // 2 · Sin teléfono en común: hay que probarlo con la dirección o las coordenadas.
    if (!f.T && !streetDiffers) {
      const strongPrice = f.sameOp ? f.P5 : true;
      if (f.S && f.M && compat) {
        if (!f.phonesDiffer && strongPrice && priceOk && (f.N || f.F || (f.sameOp && f.BA && f.P3))) {
          return { relation: "mismo_inmueble", level: "cierto", rule: "R2 calle + metros + habitaciones" };
        }
        if (priceOk || f.P40 || !f.sameOp) {
          return {
            relation: "mismo_inmueble",
            level: "probable",
            rule: f.phonesDiffer ? "R4 calle + metros, otro contacto" : "R4 calle + metros, precio distinto",
          };
        }
      }
      if (f.dist != null && f.dist <= 100 && f.M && f.B && (!f.baKnown || f.BA) && priceOk) {
        // «cierto» solo con coordenadas < 60 m + metros + habitaciones + MISMA planta conocida
        // (y precio ±5 % si es la misma operación); sin planta, a lo sumo probable.
        if (!f.phonesDiffer && f.near60 && f.Fx && (!f.sameOp || f.P5)) {
          return { relation: "mismo_inmueble", level: "cierto", rule: "R3 coordenadas + metros + habitaciones" };
        }
        return { relation: "mismo_inmueble", level: "probable", rule: "R3b coordenadas, otro contacto" };
      }
      if (f.dist != null && f.dist <= 150 && f.M && f.B && priceOk) {
        return { relation: "mismo_inmueble", level: "probable", rule: "R5 coordenadas + metros" };
      }
    }
  }
  // 3 · Mismo teléfono pero otro inmueble: informativo (el propietario tiene
  // varios pisos). Nunca agrupa.
  if (f.T) {
    return { relation: "mismo_contacto", level: "informativo", rule: "R7 mismo teléfono, otro inmueble" };
  }
  return null;
}

function scoreOf(f: Feats): number {
  return (
    (f.T ? 3 : 0) + (f.S ? 2 : 0) + (f.dist != null && f.dist <= 100 ? 2 : 0) + (f.M ? 1.5 : 0) +
    (f.B ? 1 : 0) + (f.BA ? 0.5 : 0) + (f.F ? 1 : 0) + (f.P5 ? 1.5 : f.P15 ? 0.5 : 0) + (f.N ? 0.5 : 0)
  );
}

function evidenceOf(f: Feats): Record<string, unknown> {
  return {
    phone: f.T,
    other_contact: f.phonesDiffer,
    street: f.S,
    coords_m: f.dist == null ? null : Math.round(f.dist),
    m2_close: f.M,
    beds_equal: f.bKnown ? f.B : null,
    baths_equal: f.baKnown ? f.BA : null,
    floor_equal: f.F ? true : f.fConflict ? false : null,
    other_operation: !f.sameOp,
    same_portal: f.samePortal,
    price_diff_pct: f.pricePct == null ? null : Math.round(f.pricePct * 1000) / 10,
    same_first_name: f.N,
  };
}

// ── Candidatos (bloques) ─────────────────────────────────────────────────────

const MAX_BLOCK = 40; // más anuncios con el mismo teléfono / calle = agencia o edificio grande
const CELL = 400; // ≈ 280 m × 210 m en Madrid

type Blocks = {
  byNum: Map<string, Norm[]>;
  byPhone: Map<string, Norm[]>;
  byCell: Map<string, Norm[]>;
  byKey: Map<string, Norm[]>;
};

function buildBlocks(norms: Norm[]): Blocks {
  const blocks: Blocks = { byNum: new Map(), byPhone: new Map(), byCell: new Map(), byKey: new Map() };
  for (const n of norms) {
    // Clave = número + CADA palabra de la calle: así el bloque es "calle X número 8"
    // y no "todo número 8 de la ciudad" (miles de anuncios, que se descartaba entero).
    if (n.number) for (const t of n.tokens) push(blocks.byNum, `${n.number}|${t}`, n);
    for (const p of n.phones) push(blocks.byPhone, p, n);
    for (const k of n.row.block_keys ?? []) push(blocks.byKey, k, n);
    if (n.row.latitude != null && n.row.longitude != null) {
      push(blocks.byCell, `${Math.round(n.row.latitude * CELL)}|${Math.round(n.row.longitude * CELL)}`, n);
    }
  }
  return blocks;
}

function nearCells(blocks: Blocks, n: Norm): Norm[] {
  if (n.row.latitude == null || n.row.longitude == null) return [];
  const cx = Math.round(n.row.latitude * CELL);
  const cy = Math.round(n.row.longitude * CELL);
  const out: Norm[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(...(blocks.byCell.get(`${cx + dx}|${cy + dy}`) ?? []));
  return out;
}

function* candidatePairs(blocks: Blocks): Generator<[Norm, Norm]> {
  const seen = new Set<string>();
  const key = (x: Norm, y: Norm) => (x.row.id < y.row.id ? `${x.row.id}|${y.row.id}` : `${y.row.id}|${x.row.id}`);
  function* within(list: Norm[]): Generator<[Norm, Norm]> {
    if (list.length > MAX_BLOCK) return;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const k = key(list[i], list[j]);
        if (!seen.has(k)) {
          seen.add(k);
          yield [list[i], list[j]];
        }
      }
    }
  }
  for (const l of blocks.byNum.values()) yield* within(l);
  for (const l of blocks.byPhone.values()) yield* within(l);
  for (const l of blocks.byKey.values()) yield* within(l);
  for (const [ck, l] of blocks.byCell) {
    const [cx, cy] = ck.split("|").map(Number);
    const near: Norm[] = [...l];
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
      near.push(...(blocks.byCell.get(`${cx + dx}|${cy + dy}`) ?? []));
    }
    for (const a of l) {
      for (const b of near) {
        if (a === b) continue;
        const k = key(a, b);
        if (seen.has(k)) continue;
        seen.add(k);
        yield [a, b];
      }
    }
  }
}

/**
 * ¿Hay otro anuncio (distinto de x e y) que también "encaja" con x por calle o
 * coordenadas + metros? Entonces x es uno de varios pisos iguales de un mismo
 * edificio y un enlace sin teléfono en común no es de fiar.
 */
function hasLookalike(blocks: Blocks, x: Norm, y: Norm): boolean {
  const pool = new Set<Norm>();
  if (x.number) for (const t of x.tokens) for (const r of blocks.byNum.get(`${x.number}|${t}`) ?? []) pool.add(r);
  for (const r of nearCells(blocks, x)) pool.add(r);
  for (const r of pool) {
    if (r === x || r === y) continue;
    const f = pairFeats(x, r);
    if ((f.S || (f.dist != null && f.dist <= 100)) && f.M && !hardConflict(f)) return true;
  }
  return false;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const l = m.get(k);
  if (l) l.push(v);
  else m.set(k, [v]);
}

// ── Cálculo ──────────────────────────────────────────────────────────────────

const pairKey = (a: string, b: string, rel: string) => `${a}|${b}|${rel}`;
const ordered = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
const MAX_GROUP = 12;

export function computeLinks(rows: LinkRow[], decisions: LinkDecision[] = [], opts: LinkOptions = {}): LinkingResult {
  const norms = rows.map(normalize);
  const byId = new Map(norms.map((n) => [n.row.id, n]));
  const decided = new Map<string, "confirmado" | "descartado">();
  for (const d of decisions) {
    const [a, b] = ordered(d.a, d.b);
    decided.set(pairKey(a, b, d.relation), d.status);
  }

  const links: ComputedLink[] = [];
  const featsOf = new Map<string, Feats>();
  const blocks = buildBlocks(norms);
  for (const [x, y] of candidatePairs(blocks)) {
    const f = pairFeats(x, y);
    // Atajo: sin m² comparable, sin teléfono común y sin calle igual no hay nada que decidir.
    const shortcut = !f.T && !f.S && !(f.dist != null && f.dist <= 150);
    const base = shortcut ? null : classify(f);
    const c: RefinedClass | null = opts.refine ? opts.refine(x.row, y.row, base, f) : base;
    if (!c) continue;
    const [a, b] = ordered(x.row.id, y.row.id);
    const k = pairKey(a, b, c.relation);
    if (decided.get(k) === "descartado") continue;
    featsOf.set(k, f);
    const evidence = { ...evidenceOf(f), ...(c.evidence ?? {}), ...(c.extraStrong ? { extra_strong: true } : {}) };
    links.push({ a, b, relation: c.relation, level: c.level, rule: c.rule, score: scoreOf(f) + (c.extraStrong ? 4 : 0), evidence });
  }

  // Ambigüedad: un enlace "cierto" SIN teléfono en común solo se mantiene si no hay
  // otro piso del mismo edificio que encaje igual (varios pisos iguales de dueños
  // distintos), salvo que coincidan nombre o planta.
  for (const l of links) {
    if (l.relation !== "mismo_inmueble" || l.level !== "cierto" || l.evidence.phone) continue;
    if (l.evidence.same_first_name || l.evidence.floor_equal === true || l.evidence.extra_strong) continue;
    if (hasLookalike(blocks, byId.get(l.a)!, byId.get(l.b)!) || hasLookalike(blocks, byId.get(l.b)!, byId.get(l.a)!)) {
      l.level = "probable";
      l.rule += " (varios pisos iguales)";
      l.evidence.ambiguous = true;
    }
  }

  // Los enlaces confirmados a mano entran siempre (aunque el algoritmo ya no los
  // proponga, p. ej. porque cambió un dato); los descartados ya no están.
  const have = new Set(links.map((l) => pairKey(l.a, l.b, l.relation)));
  for (const d of decisions) {
    if (d.status !== "confirmado" || d.relation !== "mismo_inmueble") continue;
    const [a, b] = ordered(d.a, d.b);
    if (!byId.has(a) || !byId.has(b) || have.has(pairKey(a, b, d.relation))) continue;
    links.push({ a, b, relation: d.relation, level: "cierto", rule: "Confirmado a mano", score: 100, evidence: { manual: true } });
  }

  for (const l of links) {
    if (decided.get(pairKey(l.a, l.b, l.relation)) === "confirmado") l.level = "cierto";
  }

  // ── Grupos: solo enlaces "cierto" de mismo_inmueble, de más a menos seguros,
  // y SIN unir dos grupos si cualquier par de sus miembros se contradice.
  const parent = new Map<string, string>();
  const members = new Map<string, string[]>();
  const find = (x: string): string => {
    let r = x;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) as string;
    parent.set(x, r);
    return r;
  };
  const group = (x: string): string[] => members.get(find(x)) ?? [x];
  let blocked = 0;
  const strongPairs = new Set(links.filter((l) => l.evidence.extra_strong).map((l) => pairKey(l.a, l.b, l.relation)));
  const edges = links
    .filter((l) => l.relation === "mismo_inmueble" && l.level === "cierto")
    .sort((p, q) => q.score - p.score);
  for (const e of edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    const ga = group(e.a);
    const gb = group(e.b);
    const forced = decided.get(pairKey(e.a, e.b, e.relation)) === "confirmado";
    let conflict = ga.length + gb.length > MAX_GROUP;
    if (!conflict && !forced) {
      outer: for (const x of ga) {
        for (const y of gb) {
          const f = pairFeats(byId.get(x)!, byId.get(y)!);
          const xr = byId.get(x)!.row;
          const yr = byId.get(y)!.row;
          // Misma operación en el mismo portal en un grupo = anuncios distintos del mismo
          // piso solo si comparten contacto; si no, se contradice.
          if (hardConflict(f) || f.far || (f.streetBoth && !f.S && !f.T) ||
              (xr.portal === yr.portal && xr.operation === yr.operation && !f.T &&
            !strongPairs.has(pairKey(...ordered(x, y), "mismo_inmueble")))) {
            conflict = true;
            break outer;
          }
        }
      }
    }
    if (conflict) {
      e.level = "probable";
      e.evidence.blocked_by_group = true;
      blocked++;
      continue;
    }
    parent.set(ra, rb);
    members.set(rb, [...ga, ...gb]);
    members.delete(ra);
  }

  const groups: Array<{ primary: string; members: string[] }> = [];
  const state = new Map<string, RowGroupState>();
  for (const r of rows) state.set(r.id, { duplicate_of: null, link_summary: null, link_ops: null });
  for (const ms of members.values()) {
    if (ms.length < 2) continue;
    const rowsOf = ms.map((id) => byId.get(id)!.row);
    const rank = (r: LinkRow) =>
      (r.is_active ? 1000 : 0) + (r.assigned_to ? 500 : 0) + (r.phone ? 100 : 0) + Math.min(r.n_photos, 60) +
      (r.portal === "idealista" ? 5 : 0);
    const sorted = [...rowsOf].sort(
      (p, q) => rank(q) - rank(p) || (p.created_at ?? "").localeCompare(q.created_at ?? "") || p.id.localeCompare(q.id),
    );
    const primary = sorted[0];
    const names = [...new Set(rowsOf.map((r) => (r.owner_name ?? "").trim()).filter((n) => n && !GENERIC_NAMES.has(fold(n))))].slice(0, 4);
    const summary: LinkSummary = {
      n: rowsOf.length,
      portals: [...new Set(rowsOf.map((r) => r.portal))].sort(),
      ops: [...new Set(rowsOf.map((r) => r.operation).filter((o): o is "rent" | "sale" => !!o))].sort(),
      active_ops: [...new Set(rowsOf.filter((r) => r.is_active).map((r) => r.operation).filter((o): o is "rent" | "sale" => !!o))].sort(),
      phones: new Set(rowsOf.flatMap((r) => [phoneKey(r.phone), phoneKey(r.phone2)]).filter(Boolean)).size,
      names,
      // Qué se ofrece y dónde (para "también en alquiler: 2.500 €/mes" en el listado).
      offers: [...rowsOf]
        .sort((p, q) => Number(q.is_active) - Number(p.is_active) || (p.operation ?? "").localeCompare(q.operation ?? ""))
        .slice(0, 6)
        .map((r) => ({
          op: r.operation,
          portal: r.portal,
          price: r.price,
          active: r.is_active,
          ...(r.kind ? { kind: r.kind } : {}),
          ...(r.agency_name ? { agency: r.agency_name } : {}),
        })),
    };
    for (const r of rowsOf) {
      state.set(
        r.id,
        r.id === primary.id
          ? { duplicate_of: null, link_summary: summary, link_ops: summary.ops }
          : { duplicate_of: primary.id, link_summary: null, link_ops: null },
      );
    }
    groups.push({ primary: primary.id, members: sorted.map((r) => r.id) });
  }

  const count = (pred: (l: ComputedLink) => boolean) => links.filter(pred).length;
  return {
    links,
    state,
    groups,
    stats: {
      rows: rows.length,
      links: links.length,
      cierto: count((l) => l.relation === "mismo_inmueble" && l.level === "cierto"),
      probable: count((l) => l.relation === "mismo_inmueble" && l.level === "probable"),
      mismo_contacto: count((l) => l.relation === "mismo_contacto"),
      groups: groups.length,
      grouped_rows: groups.reduce((s, g) => s + g.members.length, 0),
      hidden_duplicates: groups.reduce((s, g) => s + g.members.length - 1, 0),
      blocked_by_group: blocked,
    },
  };
}
