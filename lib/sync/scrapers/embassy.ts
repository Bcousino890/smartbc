import * as cheerio from "cheerio";
import type { RawPhoto, RawProperty, Scraper } from "../types";
import { extractFeaturesFromText } from "./level-real-estate";
import { cleanAgencyDescription, htmlToText } from "./clean-description";
import { normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";

// Embassy Properties (https://www.embassy-properties.com) usa la "web de
// agencia" de Idealista: listados en /ads/{venta|alquiler}/inmueble, fichas en
// /ad/{id de Idealista} y fotos del CDN img*.idealista.com.
//
// Listado: el navegador pagina con un POST JSON a /api/AdsSearch/PostSearch
// (el mismo objeto de búsqueda que la web guarda en la cookie
// `search_buscador_pro`). Pidiendo itemsPerPage alto sale TODO en una llamada
// por operación, con precio, referencia, dormitorios, baños, m² y la
// descripción completa. Solo las fotos y las características están en la ficha.
//
// ⚠️ Fotos: llevan el logo "EMBASSY PROPERTIES" grabado en el centro. No hay
// variante limpia (la agencia sube así las fotos a Idealista).
//
// NO usar aquí el borrador DINÁMICO (`dynamicWatermark`). Probado el
// 2026-10-23 con las 28 fotos de Serrano: estima la marca comparando las fotos
// del MISMO piso, y como todas comparten estancia confunde la escena con la
// marca; deja el logo casi igual y pinta "fantasmas" de otras fotos en las
// paredes. Para Embassy hace falta un perfil horneado con fotos de MUCHOS
// pisos distintos (lib/sync/watermark-removal.ts), no el dinámico.
//
// Criterios de captación (decididos con BC): venta a cualquier precio, alquiler
// desde 3.000 €/mes, solo viviendas (fuera terrenos, garajes, locales…).
const SITE_BASE = "https://www.embassy-properties.com";
const SEARCH_API = `${SITE_BASE}/api/AdsSearch/PostSearch`;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 25_000;
const REQUEST_DELAY_MS = 1000;
const ITEMS_PER_PAGE = 200;
const MAX_PAGES = 10;
const MAX_PHOTOS = 40;
const RENT_MIN_PRICE = 3000;

// Idealista: 1 = venta, 2 = alquiler.
const OPERATIONS: Array<{ id: "1" | "2"; operation: "sale" | "rent" }> = [
  { id: "1", operation: "sale" },
  { id: "2", operation: "rent" },
];

const EXCLUDED_TYPES =
  /terreno|solar|garaje|parking|plaza|local|nave|oficina|edificio|trastero|habitaci[oó]n/i;

// Objeto de búsqueda mínimo que acepta la API (el resto de filtros van a null
// en la cookie de la web y el servidor los toma por "sin filtro").
function searchBody(operationId: string, page: number) {
  return {
    currentPage: page,
    itemsPerPage: ITEMS_PER_PAGE,
    order: "desc",
    orderfield: "creationDate",
    ids: [],
    showAddress: 1,
    adOperationId: operationId,
    adTypologyId: "0",
    locationId: [],
  };
}

export type EmbassyCard = {
  id: string;
  operation: "sale" | "rent";
  /** "Piso", "Ático", "Casa/Chalet independiente"… (antes de " en "). */
  type: string;
  /** "Calle de los Astros" o undefined cuando la tarjeta solo trae el barrio. */
  street?: string;
  /** Barrio tal cual lo nombra Idealista: "Estrella", "Chueca-Justicia"… */
  barrio: string;
  heading: string;
  price: number;
  bedrooms?: number;
  bathrooms?: number;
  squareMeters?: number;
  descriptionHtml: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
      cache: "no-store",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// "1.090.000 €" → 1090000; "3.000/Mes" → 3000.
export function parseEmbassyPrice(raw: string): number {
  const m = raw.match(/\d{1,3}(?:\.\d{3})+|\d+/);
  if (!m) return 0;
  const n = Number(m[0].replace(/\./g, ""));
  return Number.isFinite(n) ? n : 0;
}

function intFrom(text: string | undefined, re: RegExp): number | undefined {
  const m = (text ?? "").match(re);
  return m ? parseInt(m[1].replace(/\./g, ""), 10) : undefined;
}

// "Piso en Calle de los Astros, Estrella" → tipo, calle y barrio.
export function splitEmbassyHeading(heading: string): { type: string; street?: string; barrio: string } {
  const h = heading.replace(/\s+/g, " ").trim();
  const enIdx = h.search(/\s+en\s+/i);
  const type = enIdx > 0 ? h.slice(0, enIdx).trim() : h;
  const rest = enIdx > 0 ? h.slice(enIdx).replace(/^\s+en\s+/i, "").trim() : "";
  const comma = rest.lastIndexOf(",");
  if (comma < 0) return { type, barrio: rest };
  return { type, street: rest.slice(0, comma).trim() || undefined, barrio: rest.slice(comma + 1).trim() };
}

// Una tarjeta HTML de la API de búsqueda → datos del listado.
export function parseEmbassyCard(html: string, operation: "sale" | "rent"): EmbassyCard | null {
  const $ = cheerio.load(html);
  const box = $(".result-details").first();
  const id = box.attr("id") ?? "";
  if (!/^\d+$/.test(id)) return null;
  const heading = $("h1").first().text().replace(/\s+/g, " ").trim();
  const priceText = $(".price").first().text();
  const facts = $("ul li")
    .map((_, li) => $(li).text().replace(/\s+/g, " ").trim())
    .get()
    .join(" | ");
  const { type, street, barrio } = splitEmbassyHeading(heading);
  return {
    id,
    operation: /\/\s*mes/i.test(priceText) ? "rent" : operation,
    type,
    street,
    barrio,
    heading,
    price: parseEmbassyPrice(priceText),
    bedrooms: intFrom(facts, /(\d+)\s*Dorm/i),
    bathrooms: intFrom(facts, /(\d+)\s*Baño/i),
    squareMeters: intFrom(facts, /([\d.]+)\s*m²/i),
    descriptionHtml: $("p[contitle]").first().html() ?? "",
  };
}

export function embassyAccepts(c: EmbassyCard): boolean {
  if (EXCLUDED_TYPES.test(c.type)) return false;
  if (c.price <= 0) return false;
  if (c.operation === "rent" && c.price < RENT_MIN_PRICE) return false;
  return true;
}

// Todas las tarjetas de una operación.
//
// IMPORTANTE: ante cualquier fallo LANZA en vez de devolver []: este listado es
// la autoridad de archivado y una lista incompleta archivaría pisos vivos.
async function fetchCards(operationId: "1" | "2", operation: "sale" | "rent"): Promise<EmbassyCard[]> {
  const cards: EmbassyCard[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchWithTimeout(SEARCH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${SITE_BASE}/ads/${operation === "rent" ? "alquiler" : "venta"}/inmueble`,
      },
      body: JSON.stringify(searchBody(operationId, page)),
    });
    if (!res.ok) throw new Error(`embassy_search_http_${res.status}`);
    const data = (await res.json()) as { numFound?: number; PlainTextArray?: string[] };
    if (!Array.isArray(data.PlainTextArray)) throw new Error("embassy_search_malformed");
    for (const html of data.PlainTextArray) {
      const card = parseEmbassyCard(html, operation);
      if (card) cards.push(card);
    }
    const total = Number(data.numFound ?? 0);
    if (data.PlainTextArray.length < ITEMS_PER_PAGE || cards.length >= total) {
      if (total > 0 && cards.length < total) throw new Error("embassy_search_incomplete");
      break;
    }
  }
  return cards;
}

async function listEmbassyCards(): Promise<EmbassyCard[]> {
  const all: EmbassyCard[] = [];
  for (const op of OPERATIONS) all.push(...(await fetchCards(op.id, op.operation)));
  if (all.length === 0) throw new Error("embassy_search_empty");
  const seen = new Set<string>();
  return all.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

// ── Ficha ───────────────────────────────────────────────────────────────────

// Galería: el JSON que la ficha pasa a `WEBS.FICHA.init(id, '0', '[…]', …)`,
// en el orden de la web, perfil HOME_WI_1500 (1500 px).
export function embassyPhotos(adHtml: string): RawPhoto[] {
  const seen = new Set<string>();
  const out: RawPhoto[] = [];
  const re = /"src":"(https?:\/\/img\d*\.idealista\.com\/[^"]+\.(?:jpe?g|png|webp))"/gi;
  for (const m of adHtml.matchAll(re)) {
    const url = m[1].replace(/\\\//g, "/");
    const key = url.replace(/\/blur\/[^/]+\//, "/");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url });
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

const CARACTERISTICA_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /^terraza/i, label: "Terraza" },
  { match: /^balc[oó]n/i, label: "Balcón" },
  { match: /garaje/i, label: "Garaje" },
  { match: /^trastero/i, label: "Trastero" },
  { match: /^armarios empotrados/i, label: "Armarios empotrados" },
  { match: /^con ascensor/i, label: "Ascensor" },
  { match: /^aire acondicionado/i, label: "Aire acondicionado" },
  { match: /^calefacci[oó]n/i, label: "Calefacción" },
  { match: /^piscina/i, label: "Piscina" },
  { match: /^jard[ií]n/i, label: "Jardín" },
  { match: /amueblad[ao]/i, label: "Amueblado" },
  { match: /exterior/i, label: "Exterior" },
  { match: /^portero|conserje/i, label: "Portero" },
];

export function embassyFeatures(adHtml: string): string[] {
  const $ = cheerio.load(adHtml);
  const found = new Set<string>();
  $("#caracteristicas li").each((_, li) => {
    const text = $(li).text().replace(/\s+/g, " ").trim();
    // "Cocina con electrodomésticos y casa sin amueblar" no es "Amueblado".
    if (/sin amueblar/i.test(text)) return;
    for (const c of CARACTERISTICA_LABELS) if (c.match.test(text)) found.add(c.label);
  });
  return [...found];
}

// ── Mapeo ───────────────────────────────────────────────────────────────────

// Barrios de Idealista fuera de Madrid capital que usa su cartera → zona del CRM.
const OUTSIDE_MADRID: Array<{ match: RegExp; zone: string }> = [
  { match: /monteclaro|avenida europa|somosaguas|pozuelo/i, zone: "Pozuelo" },
  { match: /moraleja/i, zone: "La Moraleja" },
  { match: /molino de la hoz|las rozas/i, zone: "Las Rozas" },
];

// "Chueca-Justicia" → Centro/Chueca; "Bernabéu-Hispanoamérica" →
// Chamartín/Hispanoamérica; "Huertas-Cortes" → Centro/Cortes. normalizeZone
// recorre los tramos separados por guion.
export function embassyZone(barrio: string): { zone: string; subzone?: string } {
  for (const o of OUTSIDE_MADRID) if (o.match.test(barrio)) return { zone: o.zone };
  const n = normalizeZone(barrio);
  if (n.district !== OTHER_ZONE_LABEL) return { zone: n.district, subzone: n.barrio ?? undefined };
  return { zone: barrio || "Madrid" };
}

export function cleanEmbassyDescription(html: string): string {
  // Fuera la referencia al inicio de cualquier línea, en todas sus formas
  // reales: "MD-2118- EMBASSY PROPERTIES presenta…", "**MD-5024. Descubre…**",
  // "Ref. MV-2724 EMBASSY…", "MV-2915 EMBASSY…". Sus refs son siempre dos
  // letras, guion y 3+ cifras (MD-8164, MV-2933, AT-2285, CL-2002…). La firma y
  // las líneas con la marca las quita después cleanAgencyDescription.
  const text = htmlToText(html)
    .replace(/\*\*/g, "")
    .replace(/^[ \t]*(?:ref\.?[ \t]*)?[A-Za-z]{2}-\d{3,}[\w-]*[ \t]*[-|–.:]?[ \t]*/gim, "");
  return cleanAgencyDescription(text, {
    brand: /embassy/i,
    signature: /embassy\s+properties\s+(te\s+)?presenta\s+(en\s+exclusiva\s+)?/gi,
  });
}

const TYPE_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /^[aá]tico\s*\/\s*d[uú]plex/i, label: "Ático" },
  { match: /^[aá]tico/i, label: "Ático" },
  { match: /^d[uú]plex/i, label: "Dúplex" },
  { match: /^estudio/i, label: "Estudio" },
  { match: /chalet|casa/i, label: "Chalet" },
  { match: /^apartamento/i, label: "Apartamento" },
  { match: /^loft/i, label: "Loft" },
];

function propertyTypeOf(type: string): string {
  for (const t of TYPE_LABELS) if (t.match.test(type)) return t.label;
  return "Piso";
}

export function embassySourceUrl(id: string): string {
  return `${SITE_BASE}/ad/${id}`;
}

// Tarjeta (+ ficha si se tiene) → RawProperty. null si no pasa los criterios.
export function mapEmbassyProperty(card: EmbassyCard, adHtml: string | null): RawProperty | null {
  if (!embassyAccepts(card)) return null;
  const photos = adHtml ? embassyPhotos(adHtml) : [];
  if (adHtml && photos.length === 0) return null;
  const description = cleanEmbassyDescription(card.descriptionHtml);
  const { zone, subzone } = embassyZone(card.barrio);
  const features = new Set<string>(adHtml ? embassyFeatures(adHtml) : []);
  for (const f of extractFeaturesFromText(description)) features.add(f);
  const isTemporada = /temporada/i.test(`${card.heading} ${description}`);

  return {
    externalId: card.id,
    sourceUrl: embassySourceUrl(card.id),
    title: card.heading.replace(/embassy(\s+properties)?/gi, "").replace(/\s{2,}/g, " ").trim(),
    description: description || undefined,
    operation: card.operation,
    stay: card.operation === "rent" ? (isTemporada ? "short" : "long") : undefined,
    propertyType: propertyTypeOf(card.type),
    price: card.price,
    bedrooms: card.bedrooms,
    bathrooms: card.bathrooms,
    squareMeters: card.squareMeters,
    zone,
    subzone,
    address: card.street,
    features: [...features],
    photos,
  };
}

export const embassyScraper: Scraper = {
  key: "embassy",
  label: "Embassy Properties (web Idealista)",
  agencySlug: "embassy-properties",
  scrape: async () => {
    const cards = (await listEmbassyCards()).filter(embassyAccepts);
    const results: RawProperty[] = [];
    for (let i = 0; i < cards.length; i++) {
      try {
        const res = await fetchWithTimeout(embassySourceUrl(cards[i].id));
        if (res.ok) {
          const mapped = mapEmbassyProperty(cards[i], await res.text());
          if (mapped) results.push(mapped);
        }
      } catch {
        // fallos individuales se ignoran; el sync log refleja el agregado
      }
      if (i < cards.length - 1) await delay(REQUEST_DELAY_MS);
    }
    return results;
  },
  // Autoridad de archivado: todas las tarjetas vivas que pasan los criterios.
  listExternalIds: async () => (await listEmbassyCards()).filter(embassyAccepts).map((c) => c.id),
};
