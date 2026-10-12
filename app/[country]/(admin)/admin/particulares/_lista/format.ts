// Formateo del listado de particulares: puro (sin React) para poder reutilizarlo
// en tarjetas, chips y estadísticas sin arrastrar dependencias de cliente.
//
// Regla del producto: NADA que venga crudo del portal llega a la pantalla.
// Las direcciones pasan por `esAddress` (es-labels), las zonas por `zoneLabel`
// (aquí: quita slugs tipo `madrid/chamberi/almagro` y títulos como «venta en
// Calle X en Zona» que el scraper a veces deja en `zone`), los portales van
// capitalizados y los números en es-ES.

import { esAddress } from "@/lib/particulares/es-labels";
import { normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";
import type { LinkSummaryLite } from "@/lib/particulares/links-types";

// es-ES no agrupa los números de 4 cifras por defecto («9524»): "always" lo fuerza («9.524»).
const NUM = new Intl.NumberFormat("es-ES", { useGrouping: "always" } as Intl.NumberFormatOptions);
const NUM_1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Entero con separador de miles es-ES: 44230 → «44.230». */
export const fmtNum = (n: number): string => NUM.format(n);

/** Importe en euros es-ES: 915000 → «915.000 €». */
export const fmtEur = (n: number): string => `${NUM.format(Math.round(n))} €`;

// ── Portales ────────────────────────────────────────────────────────────────

const PORTAL_NAMES: Record<string, string> = {
  idealista: "Idealista",
  fotocasa: "Fotocasa",
  pisos: "Pisos.com",
  "pisos.com": "Pisos.com",
  habitaclia: "Habitaclia",
  yaencontre: "Yaencontré",
  milanuncios: "Milanuncios",
};

/** «idealista» → «Idealista»; «pisos» → «Pisos.com». */
export function portalName(portal: string | null | undefined): string {
  const p = (portal ?? "").trim().toLowerCase();
  if (!p) return "Portal";
  return PORTAL_NAMES[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

// ── Operación ───────────────────────────────────────────────────────────────

type OpRow = {
  operation: "rent" | "sale" | null;
  link_ops?: string[] | null;
};

const opName = (op: string | null | undefined) =>
  op === "rent" ? "Alquiler" : op === "sale" ? "Venta" : "";

/** ¿El mismo inmueble está en venta Y en alquiler (anuncios enlazados, migración 0176)? */
export function hasBothOps(row: OpRow): boolean {
  return Boolean(row.link_ops && row.link_ops.includes("sale") && row.link_ops.includes("rent"));
}

/** «Venta», «Alquiler» o «Venta + Alquiler». */
export function opLabel(row: OpRow): string {
  if (hasBothOps(row)) return "Venta + Alquiler";
  return opName(row.operation) || "Venta";
}

// ── Zona y calle ────────────────────────────────────────────────────────────

const GENERIC_ZONE_PARTS = new Set([
  "madrid",
  "madrid capital",
  "madrid-capital",
  "comunidad de madrid",
  "comunidad-de-madrid",
  "espana",
  "españa",
  "spain",
]);

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) =>
      /^(de|del|la|las|los|el|y|en)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

/** Nombre canónico (con tildes) de un trozo de zona: barrio o distrito conocido, o el texto limpio. */
function canonicalPart(part: string): string {
  const n = normalizeZone(part);
  if (n.barrio) return n.barrio;
  if (n.district !== OTHER_ZONE_LABEL) return n.district;
  return part;
}

/**
 * Zona legible para una tarjeta.
 *  - `madrid/chamberi/almagro` (slug de portal) → «Chamberí · Almagro»
 *  - «venta en Calle X en Santa Eugenia» (título que se coló en `zone`) → «Santa Eugenia»
 *  - «Lavapiés-Embajadores» → «Lavapiés · Embajadores»
 *  - «Almagro» (barrio conocido) → «Chamberí · Almagro» (aporta el distrito)
 *  - Cualquier otro → tal cual, sin guiones técnicos.
 */
export function zoneLabel(zone: string | null | undefined): string {
  let z = (zone ?? "").trim();
  if (!z) return "Madrid";

  // Título de anuncio en vez de zona: nos quedamos con lo que va tras el último « en ».
  if (/^(venta|alquiler|piso|casa|chalet|local|flat|apartment)\b/i.test(z) && /\s+en\s+/i.test(z)) {
    const parts = z.split(/\s+en\s+/i);
    z = parts.length > 2 ? parts[parts.length - 1] : parts[parts.length - 1];
  }

  // Slug con barras: madrid/chamberi/almagro.
  if (z.includes("/")) {
    const parts = z
      .split("/")
      .map((p) => p.replace(/[-_]+/g, " ").trim())
      .filter((p) => p && !GENERIC_ZONE_PARTS.has(p.toLowerCase()));
    if (parts.length === 0) return "Madrid";
    return parts.map((p) => canonicalPart(titleCase(p))).join(" · ");
  }

  // Varias zonas unidas por guion: «Universidad - Malasaña», «Lavapiés-Embajadores».
  if (/\s[-–]\s|[A-Za-zÁ-ú]-[A-Za-zÁ-ú]/.test(z)) {
    return z
      .split(/\s*[-–]\s*/)
      .filter(Boolean)
      .join(" · ");
  }

  const n = normalizeZone(z);
  if (n.barrio && n.district !== n.barrio) return `${n.district} · ${n.barrio}`;
  if (n.district !== OTHER_ZONE_LABEL) return n.district;
  return z;
}

/** Nombre de zona tal cual de la BD pero con « · » en vez de guiones: «Universidad - Malasaña» → «Universidad · Malasaña». */
export function zoneShort(name: string): string {
  return name.split(/\s*[-–]\s*/).filter(Boolean).join(" · ");
}

const TYPE_PREFIX =
  /^(?:(?:alquiler|venta)\s+de\s+)?(?:piso|apartamento|ático|atico|chalet|casa|dúplex|duplex|estudio|loft|local|finca|flat|apartment|house|studio|penthouse|villa)(?:\s*\/\s*(?:apartment|piso))?(?:\s+(?:en|for)\s+(?:venta|alquiler|sale|rent))?\s+(?:en|in)\s+/i;

const sameWord = (a: string, b: string) =>
  a.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === b.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Calle de la tarjeta: el tipo y la operación («Alquiler de piso en…») ya salen en
 * las etiquetas, y el barrio/«Madrid» al final repiten la zona. Queda «Calle de
 * Navas del Rey, 20».
 */
export function streetLabel(address: string | null | undefined, zone: string | null | undefined): string {
  let a = esAddress(address).trim();
  if (!a) return "";
  a = a.replace(TYPE_PREFIX, "");

  const zoneParts = zoneLabel(zone)
    .split(" · ")
    .map((p) => p.trim())
    .filter(Boolean);
  const isZone = (s: string) => zoneParts.some((p) => sameWord(p, s));

  // «Calle de Zazúar en Santa Eugenia» → «Calle de Zazúar»
  const m = a.match(/^(.*?)\s+en\s+([^,]+)$/i);
  if (m && (isZone(m[2]) || normalizeZone(m[2]).district !== OTHER_ZONE_LABEL)) a = m[1];

  const kept: string[] = [];
  for (const part of a.split(",").map((p) => p.trim()).filter(Boolean)) {
    if (/^madrid$/i.test(part)) continue;
    // Los trozos que son barrio/distrito (tras la calle) repiten la zona.
    if (kept.length > 0 && !/^\d/.test(part) && (isZone(part) || normalizeZone(part).district !== OTHER_ZONE_LABEL)) continue;
    kept.push(part);
  }
  return kept.join(", ");
}

// ── Precio y superficie ─────────────────────────────────────────────────────

/** €/m² (venta) o €/m²·mes (alquiler, con un decimal) o null si faltan datos. */
export function pricePerM2Label(price: number | null, m2: number | null, operation: "rent" | "sale" | null): string | null {
  if (price == null || !m2 || m2 <= 0) return null;
  const v = price / m2;
  return operation === "rent" ? `${NUM_1.format(v)} €/m²` : `${NUM.format(Math.round(v))} €/m²`;
}

/** «4,7 %» a partir de un porcentaje positivo (el scraper guarda la bajada en positivo). */
export function fmtPct(p: number): string {
  return `${Number.isInteger(p) ? NUM.format(p) : NUM_1.format(p)} %`;
}

// ── Tiempo ──────────────────────────────────────────────────────────────────

/**
 * «hace 3 h», «hace 2 días». `now` null = aún sin hidratar (el servidor y el
 * navegador no coinciden al segundo): quien llama pinta entonces la fecha
 * absoluta, que sí es idéntica en ambos lados.
 */
export function timeAgo(iso: string | null | undefined, now: number | null): string | null {
  if (!iso || now == null) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "ahora mismo";
  const min = Math.floor(s / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return d === 1 ? "hace 1 día" : `hace ${d} días`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo === 1 ? "hace 1 mes" : `hace ${mo} meses`;
  const y = Math.floor(mo / 12);
  return y === 1 ? "hace 1 año" : `hace ${y} años`;
}

const HM = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" });
const DM = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" });

/** Hora exacta (Madrid): «Hoy 14:32», «Ayer 09:10», «8 oct 18:05». */
export function exactTime(iso: string | null | undefined, now: number | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const hm = HM.format(d);
  if (now == null) return `${DM.format(d)} ${hm}`;
  const day = DAY.format(d);
  if (day === DAY.format(new Date(now))) return `Hoy ${hm}`;
  if (day === DAY.format(new Date(now - 86400_000))) return `Ayer ${hm}`;
  return `${DM.format(d)} ${hm}`;
}

/** Hace menos de 24 h: lo que llamamos «Nuevo». */
export function isNew(iso: string | null | undefined, now: number | null): boolean {
  if (!iso || now == null) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t < 24 * 3600_000;
}

// ── Teléfono / WhatsApp ─────────────────────────────────────────────────────

/** Solo dígitos con prefijo de país; un móvil/fijo español de 9 cifras recibe +34. */
function internationalDigits(phone: string): string {
  const raw = phone.trim();
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d.slice(1).replace(/\D/g, "");
  d = d.replace(/\D/g, "");
  if (d.startsWith("00")) return d.slice(2);
  if (/^[6789]\d{8}$/.test(d)) return `34${d}`;
  return d;
}

/** `tel:+34600000001` */
export function telHref(phone: string): string {
  return `tel:+${internationalDigits(phone)}`;
}

/** Enlace de WhatsApp con un primer mensaje neutro que cita el anuncio. */
export function whatsappHref(phone: string, text: string): string {
  return `https://wa.me/${internationalDigits(phone)}?text=${encodeURIComponent(text)}`;
}

/** Teléfono para mostrar: móviles españoles sin prefijo (600 000 001), extranjeros con él. */
export function shortPhone(phone: string): string {
  const d = internationalDigits(phone);
  if (/^34[6789]\d{8}$/.test(d)) return `${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return phone.trim();
}

// ── Anuncios enlazados ──────────────────────────────────────────────────────

/** «También: Alquiler 3.900 €/mes (Idealista)» — las otras ofertas activas del mismo inmueble. */
export function otherOffersText(row: {
  operation: "rent" | "sale" | null;
  portal: string;
  link_summary?: LinkSummaryLite | null;
}): string | null {
  const s = row.link_summary;
  if (!s || s.n < 2 || !s.offers?.length) return null;
  const others = s.offers
    .filter((o) => o.active && !(o.op === row.operation && o.portal === row.portal))
    .slice(0, 2);
  if (others.length === 0) return null;
  return others
    .map(
      (o) =>
        `${opName(o.op) || "Anuncio"}${o.price == null ? "" : ` ${fmtEur(o.price)}${o.op === "rent" ? "/mes" : ""}`} (${portalName(o.portal)})`,
    )
    .join(" · ");
}
