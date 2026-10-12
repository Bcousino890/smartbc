// ─────────────────────────────────────────────────────────────────────────────
// Helpers PUROS de la ficha de un particular (sin React ni acceso a BD) para
// poder probarlos con `scripts/test-particulares-ficha.mts`.
//
// Todo lo que el captador lee en la ficha pasa por aquí: euros, fechas
// relativas, zona con tildes, precisión del mapa, enlace de WhatsApp…
// ─────────────────────────────────────────────────────────────────────────────

import { MADRID_DISTRICTS } from "@/lib/madrid-zones";

/** Espacio duro: evita que «915.000» y «€» queden en líneas distintas. */
const NBSP = " ";
const TZ = "Europe/Madrid";

// ─── Teléfono ───────────────────────────────────────────────────────────────

// Única función de formateo de teléfono del módulo (antes había una segunda
// casi idéntica, formatPhoneToInternational, que no reformateaba bien los
// números ya guardados con prefijo +34 — el caso más común, porque
// normalizeSpanishPhone ya los guarda así).
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/[\s\-\(\)\.]/g, "");
  if (/^[6789]\d{8}$/.test(d)) return `+34 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (/^34[6789]\d{8}$/.test(d)) return `+34 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (/^\+34[6789]\d{8}$/.test(d)) return `+${d.slice(1, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return phone;
}

/**
 * Dígitos internacionales para `https://wa.me/<dígitos>`. Un móvil/fijo español
 * de 9 cifras recibe el 34; «+33…» y «0033…» se respetan. Devuelve null si no
 * se puede deducir un número válido (mejor no ofrecer WhatsApp que uno roto).
 */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^[6789]\d{8}$/.test(d)) d = `34${d}`;
  return /^\d{9,15}$/.test(d) ? d : null;
}

export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
  const d = whatsappDigits(phone);
  if (!d) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export type PhoneBadge = { label: string; tone: "ok" | "warn" | "muted" } | null;

/** Estado de la extracción automática del teléfono (migración 0035). Sin dato (añadido a mano) → sin badge. */
export function phoneBadge(confidence: "high" | "medium" | "low" | null | undefined): PhoneBadge {
  if (confidence === "high") return { label: "Verificado", tone: "ok" };
  if (confidence === "medium") return { label: "Detectado", tone: "warn" };
  if (confidence === "low") return { label: "Sin verificar", tone: "muted" };
  return null;
}

// ─── Portal ─────────────────────────────────────────────────────────────────

const PORTAL_NAMES: Record<string, string> = {
  idealista: "Idealista",
  fotocasa: "Fotocasa",
  pisos: "Pisos.com",
  "pisos.com": "Pisos.com",
  habitaclia: "Habitaclia",
  yaencontre: "yaencontre",
  milanuncios: "Milanuncios",
};

/** «idealista» → «Idealista», «pisos» → «Pisos.com». */
export function portalName(portal: string | null | undefined): string {
  const p = (portal ?? "").trim();
  if (!p) return "Portal";
  return PORTAL_NAMES[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

/**
 * ID del anuncio en el portal a partir de `external_id` («idealista-112787483» → «112787483»,
 * «habitaclia-<uuid>» → el uuid). Sin prefijo se devuelve tal cual; vacío → null.
 */
export function portalAdId(portal: string | null | undefined, externalId: string | null | undefined): string | null {
  const raw = (externalId ?? "").trim();
  if (!raw) return null;
  const prefix = `${(portal ?? "").trim().toLowerCase()}-`;
  const id = prefix.length > 1 && raw.toLowerCase().startsWith(prefix) ? raw.slice(prefix.length) : raw;
  return id || null;
}

/** Recorta un id largo (uuid) para la tabla: «a1b2c3d4…e5f6»; los cortos quedan enteros. */
export function shortId(id: string, max = 14): string {
  return id.length <= max ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/** Dominio de un enlace sin «www.» (`https://www.bcousinoprop.com/x` → `bcousinoprop.com`); null si no es http(s) válido. */
export function agencyDomain(url: string | null | undefined): { href: string; domain: string } | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const domain = u.hostname.replace(/^www\./i, "");
    return domain.includes(".") ? { href: u.href, domain } : null;
  } catch {
    return null;
  }
}

export type SourceRefs = {
  /** Referencia del anunciante / portal (`reference` o `scraper_extra.agency_reference`); null si no hay o es el propio id. */
  reference: string | null;
  /** ID del anuncio en el portal. */
  adId: string | null;
  /** Referencia interna PART-… */
  internal: string | null;
  agency: { href: string; domain: string } | null;
};

/** Lo que enseña la columna «Referencia» de la pestaña Fuentes. La referencia que coincide con el id no se duplica. */
export function sourceRefs(m: {
  portal: string;
  external_id?: string | null;
  reference?: string | null;
  agency_reference?: string | null;
  agency_url?: string | null;
  particular_reference?: string | null;
}): SourceRefs {
  const adId = portalAdId(m.portal, m.external_id);
  const ref = (m.reference ?? "").trim() || (m.agency_reference ?? "").trim() || null;
  const sameAsId = !!ref && (ref === adId || ref === (m.external_id ?? "").trim());
  return {
    reference: ref && !sameAsId ? ref : null,
    adId,
    internal: m.particular_reference?.trim() || null,
    agency: agencyDomain(m.agency_url),
  };
}

// ─── Números y euros (es-ES) ────────────────────────────────────────────────

/**
 * Agrupa miles con punto A MANO. `Intl.NumberFormat("es-ES")` NO agrupa los
 * números de 4 cifras (CLDR: minimumGroupingDigits = 2) y «1200 €/mes» se lee
 * peor que «1.200 €/mes»; además así servidor y navegador dan lo mismo.
 */
export function groupThousands(n: number): string {
  const sign = n < 0 ? "-" : "";
  const [int, dec] = Math.abs(n).toString().split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped}${dec ? `,${dec}` : ""}`;
}

/** «915.000 €» (o «1.200 €/mes» en alquiler). null si no hay precio. */
export function formatEuros(n: number | null | undefined, opts: { monthly?: boolean } = {}): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `${groupThousands(Math.round(n))}${NBSP}€${opts.monthly ? "/mes" : ""}`;
}

/** «4,7 %» (coma decimal y espacio duro, como se escribe en español). */
export function formatPct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${String(r).replace(".", ",")}${NBSP}%`;
}

export function formatArea(m2: number | null | undefined): string | null {
  if (typeof m2 !== "number" || !Number.isFinite(m2) || m2 <= 0) return null;
  return `${groupThousands(Math.round(m2 * 10) / 10)}${NBSP}m²`;
}

// ─── Fechas ─────────────────────────────────────────────────────────────────

export const DATE_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

export const DATE_LONG_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

export const DATE_ONLY_FMT = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TZ,
});

const TIME_FMT = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TZ, hourCycle: "h23" });
const DAY_PARTS = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

/** Día natural en Madrid como número de días desde 1970 (para restar fechas sin líos de horario de verano). */
function madridDayNumber(ms: number): number {
  const [y, m, d] = DAY_PARTS.format(new Date(ms)).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Días naturales (hora de Madrid) entre una fecha y «ahora». null si la fecha no es válida. */
export function daysSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, madridDayNumber(now) - madridDayNumber(t));
}

/**
 * Tiempo relativo en español: «hoy 09:12», «ayer 18:40», «hace 3 días»,
 * «hace 2 semanas», «hace 5 meses». null si la fecha no es válida.
 */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const days = madridDayNumber(now) - madridDayNumber(t);
  if (days <= 0) return `hoy ${TIME_FMT.format(new Date(t))}`;
  if (days === 1) return `ayer ${TIME_FMT.format(new Date(t))}`;
  if (days < 7) return `hace ${days} días`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `hace ${w} ${w === 1 ? "semana" : "semanas"}`;
  }
  if (days < 365) {
    const m = Math.max(1, Math.floor(days / 30));
    return `hace ${m} ${m === 1 ? "mes" : "meses"}`;
  }
  const y = Math.floor(days / 365);
  return `hace ${y} ${y === 1 ? "año" : "años"}`;
}

// ─── Precio ─────────────────────────────────────────────────────────────────

export type PriceVariation = {
  previous: number;
  current: number;
  /** Positivo = subió, negativo = bajó. */
  pct: number;
  direction: "down" | "up";
};

/**
 * Variación del precio respecto al anterior. Se fía del % que da el portal
 * (`price_drop_pct`) cuando lo hay; si no, lo calcula. null si no hay anterior
 * o es igual al actual (no se pinta «Variación —»).
 */
export function priceVariation(
  current: number | null | undefined,
  previous: number | null | undefined,
  dropPct?: number | null,
): PriceVariation | null {
  if (typeof current !== "number" || typeof previous !== "number") return null;
  if (!(previous > 0) || previous === current) return null;
  const computed = ((current - previous) / previous) * 100;
  const pct = typeof dropPct === "number" && dropPct > 0 && current < previous ? -dropPct : computed;
  return { previous, current, pct, direction: current < previous ? "down" : "up" };
}

/** €/m²: el del portal si lo hay; si no, precio / superficie. */
export function pricePerM2(price: number | null | undefined, m2: number | null | undefined, portalValue?: number | null): number | null {
  if (typeof portalValue === "number" && portalValue > 0) return Math.round(portalValue);
  if (typeof price === "number" && typeof m2 === "number" && m2 > 0 && price > 0) return Math.round(price / m2);
  return null;
}

// ─── Dirección y mapa ───────────────────────────────────────────────────────

// Tipos de vía. Se buscan sin lookbehind (Safari < 16.4 no lo soporta y
// tumbaría TODO el bundle al analizarlo).
const STREET_WORD =
  /(?:^|[^\p{L}\d])(calle|c\/|cl\.?|avda\.?|avenida|av\.|paseo|p\.º|pº|plaza|pl\.|camino|carretera|ctra\.?|ronda|traves[ií]a|v[ií]a|glorieta|bulevar|gran\s+v[ií]a|cuesta|costanilla|callej[oó]n|street|avenue|road)(?=$|[^\p{L}])/iu;

/** «Piso en venta en Calle Teruel» → «Calle Teruel»; «Alquiler de piso en Europa» → «Europa». */
export function streetFromTitle(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  if (!t) return "";
  const m = STREET_WORD.exec(t);
  // m[0] = separador opcional + tipo de vía (m[1]); la vía empieza donde empieza m[1].
  if (m) return t.slice(m.index + m[0].length - m[1].length).trim();
  const after = /^.*\b(?:en|in)\s+(.+)$/i.exec(t);
  return (after ? after[1] : t).trim();
}

/**
 * ¿La dirección trae número de portal? «Calle del Mediodía Grande, 20, Palacio»
 * sí; «Calle Teruel» no; «Calle Mayor 3º» no (el 3º es la planta).
 */
export function hasStreetNumber(address: string | null | undefined): boolean {
  const street = streetFromTitle(address);
  if (!street) return false;
  const m = STREET_WORD.exec(street);
  const tail = m ? street.slice(m.index + m[0].length) : street;
  for (const n of tail.matchAll(/(?:^|[\s,])(?:n[.º°]?\s*)?(\d{1,4})(?![\dºª°])(?!\s*(?:m2|m²|hab|dorm|baños|€))/giu)) {
    if (n[1]) return true;
  }
  return false;
}

export type MapPrecision = "exact" | "approximate" | null;

/**
 * Qué le decimos a <AdMap> sobre la fiabilidad del punto:
 *  - «exact»: hay coordenadas del portal Y la dirección trae número de portal.
 *  - «approximate»: hay coordenadas pero la dirección no trae número, o solo
 *    hay calle/zona (AdMap la geocodifica y el punto es orientativo).
 *  - null: no hay nada que ubicar.
 */
export function mapPrecision(input: {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  zone?: string | null;
  /** Lo que dice el portal/crawler. Manda sobre la deducción por el número de portal. */
  locationPrecision?: string | null;
}): MapPrecision {
  const hasCoords =
    typeof input.latitude === "number" &&
    typeof input.longitude === "number" &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude);
  const hasAddress = !!input.address?.trim();
  const hasZone = !!input.zone?.trim();
  if (hasCoords && (input.locationPrecision === "exact" || input.locationPrecision === "approximate")) return input.locationPrecision;
  if (hasCoords) return hasAddress && hasStreetNumber(input.address) ? "exact" : "approximate";
  if (hasAddress || hasZone) return "approximate";
  return null;
}

// ─── Zona ───────────────────────────────────────────────────────────────────

const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Distritos y barrios de Madrid capital con su ortografía correcta.
const CANON = new Map<string, string>();
for (const [district, barrios] of Object.entries(MADRID_DISTRICTS)) {
  CANON.set(fold(district), district);
  for (const b of barrios) CANON.set(fold(b), b);
}
// Localidades y zonas que llegan como slug sin tildes del portal.
for (const name of [
  "Pozuelo de Alarcón", "Alcalá de Henares", "Torrejón de Ardoz", "Móstoles", "Alcorcón", "Leganés",
  "Fuenlabrada", "Getafe", "Majadahonda", "Las Rozas de Madrid", "Boadilla del Monte", "Villaviciosa de Odón",
  "Villanueva de la Cañada", "San Sebastián de los Reyes", "Rivas-Vaciamadrid", "La Moraleja", "Alcobendas",
  "Aranjuez", "Valdemoro", "San Lorenzo de El Escorial", "El Escorial", "Collado Villalba", "Tres Cantos",
  "Torrelodones", "Galapagar", "Coslada", "Arganda del Rey", "Parla", "Pinto", "Humanes de Madrid",
  "Navalcarnero", "Sevilla la Nueva", "Brunete", "Moralzarzal", "Prado de Somosaguas", "Somosaguas",
  "Aravaca", "Pozuelo", "Ibiza", "Lavapiés", "Malasaña", "Chueca", "Conde Orgaz", "Puerta del Sol",
  "Barrio de Salamanca", "Madrid Capital", "Madrid",
]) {
  CANON.set(fold(name), name);
}
// Slugs de portal que no son el nombre del barrio.
CANON.set("barrio de salamanca", "Salamanca");
CANON.set("ibiza de madrid", "Ibiza");

const LOWER_WORDS = new Set(["de", "del", "la", "las", "los", "el", "y", "en"]);
const SLUG_CITY = new Set(["madrid", "madrid capital", "madrid provincia", "comunidad de madrid"]);
const WHOLE_AREA = new Set(["todas las zonas", "todas"]);

function humanizeSegment(seg: string): string {
  let s = seg.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(barrio|distrito|zona)\s+(de\s+|del\s+)?/i, (m) => (CANON.has(fold(s.slice(m.length))) ? "" : m));
  const known = CANON.get(fold(s));
  if (known) return known;
  // Compuestos con guion real («Lavapiés-Embajadores»): cada parte por separado.
  return s
    .split(" ")
    .map((w, i) => {
      const lw = w.toLowerCase();
      if (i > 0 && LOWER_WORDS.has(lw)) return lw;
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join(" ");
}

/**
 * Zona legible: «madrid/chamberi/almagro» → «Chamberí · Almagro»;
 * «pozuelo-de-alarcon/todas-las-zonas» → «Pozuelo de Alarcón»; un texto ya
 * legible («Prado de Somosaguas», «Lavapiés-Embajadores») se respeta.
 * Cadena vacía si no hay zona.
 */
export function formatZone(zone: string | null | undefined): string {
  const raw = (zone ?? "").trim();
  if (!raw) return "";
  if (!raw.includes("/")) {
    // Sin barras: si ya trae mayúsculas/espacios es texto del portal; si es un
    // slug en minúsculas («chamberi», «pozuelo-de-alarcon») se humaniza.
    const looksSlug = raw === raw.toLowerCase();
    return looksSlug ? humanizeSegment(raw) : raw;
  }
  const parts = raw
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  const words = parts.map((p) => fold(p.replace(/[-_]+/g, " ")));
  const kept: string[] = [];
  parts.forEach((p, i) => {
    if (WHOLE_AREA.has(words[i])) return;
    // La ciudad genérica solo sobra si hay algo más específico detrás.
    if (i === 0 && SLUG_CITY.has(words[i]) && parts.length > 1 && !WHOLE_AREA.has(words[1])) return;
    kept.push(humanizeSegment(p));
  });
  const out = kept.filter((v, i) => v && kept.indexOf(v) === i);
  return out.join(" · ");
}

/** Texto de zona para geocodificar: lo más concreto primero y sin «·» («Almagro, Chamberí»). */
export function zoneForMap(zone: string | null | undefined): string {
  const label = formatZone(zone);
  if (!label) return "";
  return label
    .split(" · ")
    .reverse()
    .join(", ");
}
