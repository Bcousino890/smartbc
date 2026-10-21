import * as cheerio from "cheerio";
import type { RawPhoto, RawProperty, Scraper } from "../types";
import { extractFeaturesFromText } from "./level-real-estate";
import { cleanAgencyDescription, htmlToText } from "./clean-description";
import { normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";

// ESRIV Inmobiliarias (https://www.esrivinmobiliaria.com) es una web Inmovilla
// (cliente 9927). Listados y fichas server-rendered → Cheerio, sin Playwright.
//
// Tiene oficina en Madrid y en Badajoz y mezcla las dos carteras en el mismo
// listado (en octubre de 2026: 17 de 54 en venta eran de Madrid; el resto,
// Badajoz, Olivenza, Lobón…). La ciudad va en la URL de cada ficha
// (/ficha/{tipo}/{ciudad}/{zona}/9927/{id}/es/), así que se filtra desde el
// listado sin abrir fichas de fuera.
//
// Paginación: la web la hace por JS con `?res=<por página>&pag=<n>`; la
// cabecera dice "Pag 1/2 - Total 54 Propiedades". Pedimos 48 por página.
//
// Fotos: CDN fotosN.apinmo.com/9927/{id}/{set}-{n}s.jpg es la miniatura y
// {set}-{n}.jpg la grande (1448px, sin marca de agua — verificado). Las fichas
// vienen con 25-40 fotos.
//
// Criterios de captación (decididos con BC):
//   • Solo Madrid (ciudad "madrid" en la URL de la ficha).
//   • Venta: cualquier precio. Alquiler: desde 3.000 €/mes, como el resto de
//     agencias (sus alquileres actuales, de 1.400-1.550 €/mes, quedan fuera).
//   • Solo viviendas (fuera locales, naves, edificios, fincas, garajes…).
const SITE_BASE = "https://www.esrivinmobiliaria.com";
const USER_AGENT = "smartbc-bot/1.0 (contacto@bcousinoprop.com)";
const REQUEST_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 20000;
const PAGE_SIZE = 48;
const MAX_PAGES = 10;
const MAX_PHOTOS = 40;
const RENT_MIN_PRICE = 3000;
const TARGET_CITY = "madrid";

const LIST_PATHS: Record<"sale" | "rent", string> = {
  sale: "venta/es/",
  rent: "alquiler/es/",
};

// Segmento de tipo en la URL de la ficha. Fuera todo lo que no sea vivienda.
const EXCLUDED_TYPE_SEGMENTS =
  /local|nave|edificio|finca|terreno|solar|garaje|parking|oficina|trastero|negocio|hotel|industrial/i;

const FICHA_HREF = /^(?:https?:\/\/[^/]+\/)?ficha\/([^/]+)\/([^/]+)\/([^/]+)\/(\d+)\/(\d+)\/[a-z]{2}\/?$/i;

export type EsrivEntry = {
  id: string;
  url: string;
  typeSlug: string;
  city: string;
  zoneSlug: string;
  operation: "sale" | "rent";
  /** Precio de la tarjeta del listado (0 si no se pudo leer). */
  price: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "es-ES,es;q=0.9" },
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// "1.195.000 €", "1.550 €/mes", "Venta 329.000 €" → entero.
export function parseEsrivPrice(raw: string): number {
  const m = raw.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*€/);
  if (!m) return 0;
  const n = Number(m[1].replace(/[.\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function firstInt(raw: string | undefined): number | undefined {
  const m = (raw ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : undefined;
}

// ── Listado ─────────────────────────────────────────────────────────────────

export function parseEsrivListing(
  html: string,
  operation: "sale" | "rent",
): { entries: EsrivEntry[]; totalPages: number } {
  const $ = cheerio.load(html);
  const entries: EsrivEntry[] = [];
  $("article.paginacion-ficha").each((_, art) => {
    const href = $(art).find('a[href*="ficha/"]').first().attr("href") ?? "";
    const m = href.match(FICHA_HREF);
    if (!m) return;
    const [, typeSlug, city, zoneSlug, , id] = m;
    const priceText = $(art).find(".paginacion-ficha-tituloprecio").first().text();
    entries.push({
      id,
      url: `${SITE_BASE}/${href.replace(/^https?:\/\/[^/]+\//, "").replace(/^\//, "")}`,
      typeSlug: typeSlug.toLowerCase(),
      city: city.toLowerCase(),
      zoneSlug: zoneSlug.toLowerCase(),
      operation: /alquiler|\/\s*mes/i.test(priceText) ? "rent" : operation,
      price: parseEsrivPrice(priceText),
    });
  });
  const pag = $("body").text().match(/Pag\s+\d+\s*\/\s*(\d+)/i);
  const totalPages = pag ? Math.max(1, parseInt(pag[1], 10)) : 1;
  return { entries, totalPages };
}

// Vivienda en Madrid que pasa los criterios de precio del listado.
export function esrivAccepts(e: EsrivEntry): boolean {
  if (e.city !== TARGET_CITY) return false;
  if (EXCLUDED_TYPE_SEGMENTS.test(e.typeSlug)) return false;
  if (e.operation === "rent" && e.price > 0 && e.price < RENT_MIN_PRICE) return false;
  return true;
}

// Enumera (barato, 2-3 peticiones) todas las fichas de Madrid de venta y
// alquiler. Es la base de scrape() y de listExternalIds().
//
// IMPORTANTE: si una página del listado no responde, LANZA en vez de devolver
// una lista corta: esa lista es la autoridad de archivado y una lista
// incompleta archivaría propiedades vivas.
async function listMadridEntries(): Promise<EsrivEntry[]> {
  const seen = new Set<string>();
  const entries: EsrivEntry[] = [];
  for (const operation of ["sale", "rent"] as const) {
    let totalPages = 1;
    for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page++) {
      const html = await fetchText(`${SITE_BASE}/${LIST_PATHS[operation]}?res=${PAGE_SIZE}&pag=${page}`);
      if (!html) throw new Error(`esriv_list_failed_${operation}_${page}`);
      const parsed = parseEsrivListing(html, operation);
      if (page === 1) totalPages = parsed.totalPages;
      for (const e of parsed.entries) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        if (esrivAccepts(e)) entries.push(e);
      }
      if (parsed.entries.length < PAGE_SIZE) break;
      await delay(REQUEST_DELAY_MS);
    }
  }
  return entries;
}

// ── Ficha ───────────────────────────────────────────────────────────────────

const CALIDAD_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /^balc[oó]n/i, label: "Balcón" },
  { match: /^aire acond/i, label: "Aire acondicionado" },
  { match: /^ascensor/i, label: "Ascensor" },
  { match: /^armarios empotrados/i, label: "Armarios empotrados" },
  { match: /^muebles|^amueblad/i, label: "Amueblado" },
  { match: /^calefacci[oó]n/i, label: "Calefacción" },
  { match: /^terraza/i, label: "Terraza" },
  { match: /^piscina/i, label: "Piscina" },
  { match: /^garaje|^parking|^plaza de garaje/i, label: "Garaje" },
  { match: /^trastero/i, label: "Trastero" },
  { match: /^portero|^conserje/i, label: "Portero" },
  { match: /^exterior$/i, label: "Exterior" },
  { match: /^jard[ií]n/i, label: "Jardín" },
  { match: /^vestidor/i, label: "Vestidor" },
];

const TYPE_FROM_SLUG: Record<string, string> = {
  piso: "Piso",
  apartamento: "Apartamento",
  atico: "Ático",
  duplex: "Dúplex",
  estudio: "Estudio",
  chalet: "Chalet",
  casa: "Casa",
  adosado: "Adosado",
  loft: "Loft",
};

// "Lista / Madrid" → zona canónica (distrito + barrio) y ciudad.
export function esrivZone(zoneCity: string): { zone: string; subzone?: string; city: string } {
  const [zoneRaw = "", cityRaw = ""] = zoneCity.split("/").map((s) => s.trim());
  const norm = normalizeZone(zoneRaw);
  if (norm.district !== OTHER_ZONE_LABEL) {
    return { zone: norm.district, subzone: norm.barrio ?? undefined, city: cityRaw };
  }
  // "Centro Histórico" y similares: distrito Centro.
  if (/centro/i.test(zoneRaw)) return { zone: "Centro", city: cityRaw };
  return { zone: zoneRaw || cityRaw || "Madrid", city: cityRaw };
}

export function cleanEsrivDescription(raw: string | null | undefined): string {
  return cleanAgencyDescription(raw, {
    brand: /esriv/i,
    // "ESRIV Inmobiliarias Real Estate tiene el placer de presentar esta…" y
    // "ESRIV INMOBILIARIA REAL ESTATE presenta en exclusiva este…".
    signature:
      /esriv\s+inmobiliarias?(\s+real\s+estate)?(\s+s\.?l\.?)?\s*(tiene el placer de presentar(le|les|te)?|(te\s+|les?\s+)?presenta(\s+en\s+exclusiva)?)\s*/gi,
  });
}

// Fotos del visor: `cargafoto` del principal (grande) y de las miniaturas
// (`-{n}s.jpg` → `-{n}.jpg`). Se conserva el orden.
export function esrivPhotos($: cheerio.CheerioAPI): RawPhoto[] {
  const seen = new Set<string>();
  const out: RawPhoto[] = [];
  $("[cargafoto]").each((_, el) => {
    const raw = $(el).attr("cargafoto") ?? "";
    if (!/apinmo\.com\//i.test(raw)) return;
    const url = raw.replace(/-(\d+)s\.(jpe?g|png|webp)(?=$|[?#])/i, "-$1.$2");
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url });
  });
  return out.slice(0, MAX_PHOTOS);
}

// La ficha → RawProperty. Devuelve null si no es una ficha de Madrid o no se
// puede leer. Los criterios de precio/tipo se aplican en `esrivAccepts` sobre
// la entrada del listado y se repiten aquí por si la tarjeta mentía.
export function parseEsrivFicha(html: string, entry: EsrivEntry): RawProperty | null {
  const $ = cheerio.load(html);
  const title = $(".fichapropiedad-tituloprincipal h1").first().text().replace(/\s+/g, " ").trim();
  if (!title) return null;

  const data: Record<string, string> = {};
  $(".fichapropiedad-listadatos li").each((_, li) => {
    const label = $(li).find(".caracteristica").first().text().replace(/\s+/g, " ").trim().toLowerCase();
    const value = $(li).find(".valor").first().text().replace(/\s+/g, " ").trim();
    if (label) data[label] = value;
  });

  const priceText = $(".fichapropiedad-precio").first().text();
  const price = parseEsrivPrice(priceText);
  if (price <= 0) return null;

  const opText = data["tipo operación"] ?? "";
  const operation: "sale" | "rent" = /alquil/i.test(opText)
    ? "rent"
    : /vend/i.test(opText)
      ? "sale"
      : /\/\s*mes/i.test(priceText)
        ? "rent"
        : entry.operation;

  const { zone, subzone, city } = esrivZone(data["zona / ciudad"] ?? "");
  if (city && city.toLowerCase() !== TARGET_CITY) return null;

  const descriptionHtml = $("#fichapropiedad-bloquedescripcion").first().html() ?? "";
  const description = cleanEsrivDescription(htmlToText(descriptionHtml));

  const features = new Set<string>();
  $(".fichapropiedad-listacalidades .etiqueta").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    for (const c of CALIDAD_LABELS) if (c.match.test(text)) features.add(c.label);
  });
  if (/reformad/i.test(data["conservación"] ?? "")) features.add("Reformado");
  for (const f of extractFeaturesFromText(description)) features.add(f);

  const sqm = firstInt(data["superficie construida"]) ?? firstInt(data["superficie útil"]);
  const isTemporada = /temporada/i.test(`${title} ${description}`);

  return {
    externalId: entry.id,
    sourceUrl: entry.url,
    title,
    description: description || undefined,
    operation,
    stay: operation === "rent" ? (isTemporada ? "short" : "long") : undefined,
    propertyType: data["tipo de propiedad"] || TYPE_FROM_SLUG[entry.typeSlug] || "Piso",
    price,
    bedrooms: firstInt(data["habitaciones"]),
    bathrooms: firstInt(data["baños"]),
    squareMeters: sqm,
    zone,
    subzone,
    features: [...features],
    photos: esrivPhotos($),
  };
}

export function esrivPassesCriteria(p: RawProperty): boolean {
  if (p.operation === "rent" && p.price < RENT_MIN_PRICE) return false;
  if (EXCLUDED_TYPE_SEGMENTS.test(p.propertyType ?? "")) return false;
  return p.photos.length > 0;
}

export const esrivScraper: Scraper = {
  key: "esriv",
  label: "ESRIV Inmobiliarias (web pública, solo Madrid)",
  agencySlug: "esriv-inmobiliaria",
  scrape: async () => {
    const entries = await listMadridEntries();
    const results: RawProperty[] = [];
    for (let i = 0; i < entries.length; i++) {
      try {
        const html = await fetchText(entries[i].url);
        if (html) {
          const prop = parseEsrivFicha(html, entries[i]);
          if (prop && esrivPassesCriteria(prop)) results.push(prop);
        }
      } catch {
        // fallos individuales se ignoran; el sync log refleja el agregado
      }
      if (i < entries.length - 1) await delay(REQUEST_DELAY_MS);
    }
    return results;
  },
  // Autoridad de archivado: todas las fichas de Madrid vivas en el listado.
  listExternalIds: async () => {
    const entries = await listMadridEntries();
    return entries.map((e) => e.id);
  },
};
