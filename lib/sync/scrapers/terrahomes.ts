import * as cheerio from "cheerio";
import type { RawPhoto, RawProperty, Scraper } from "../types";
import { extractFeaturesFromText } from "./level-real-estate";

// TerraHomes (https://www.terrahomes.es) es una web Inmoweb (cliente 2700).
// Listados y fichas server-rendered → scraping con Cheerio, sin Playwright.
//
// Criterios de captación (decididos con BC):
//   • Alquiler: solo a partir de 3.000 €/mes.
//   • Venta: cualquier precio.
//   • Ambos: solo en las zonas premium Salamanca, Chamberí, Retiro,
//     Chamartín y Pozuelo (el resto de Madrid se descarta).
const SITE_BASE = "https://www.terrahomes.es";
const USER_AGENT = "smartbc-bot/1.0 (contacto@bcousinoprop.com)";
const REQUEST_DELAY_MS = 2500;
const REQUEST_TIMEOUT_MS = 20000;
const PAGE_SIZE = 18; // Inmoweb pagina con &i=<offset>&c=18
const MAX_PAGES = 40; // tope de seguridad por operación (40×18 = 720 fichas)

// Inmoweb usa códigos de operación: 1 = venta, 2 = alquiler.
const OP_SALE = 1;
const OP_RENT = 2;
const RENT_MIN_PRICE = 3000;

// Zonas permitidas (clave en slug, sin acentos) → etiqueta canónica en BD.
const ALLOWED_ZONES: Array<{ key: string; label: string }> = [
  { key: "salamanca", label: "Salamanca" },
  { key: "chamberi", label: "Chamberí" },
  { key: "retiro", label: "Retiro" },
  { key: "chamartin", label: "Chamartín" },
  { key: "pozuelo", label: "Pozuelo" },
];

// CDN de fotos de Inmoweb. Acotamos al cliente 2700 (TerraHomes).
const PHOTO_HOST = "storage.googleapis.com/static.inmoweb.es/clients/2700";

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  piso: "Piso",
  atico: "Ático",
  duplex: "Dúplex",
  estudio: "Estudio",
  chalet: "Chalet",
  villa: "Villa",
  casa: "Casa",
  local: "Local",
  oficina: "Oficina",
  garaje: "Garaje",
  apartamento: "Apartamento",
};

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
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

// El ID externo es el número tras `es` en el slug: `...-es937355.html`.
function refFromUrl(url: string): string | null {
  const m = url.match(/-es(\d+)\.html/i);
  return m ? m[1] : null;
}

// La zona viaja en el slug: `/piso-en-madrid-salamanca--goya-...`. Solo nos
// interesan las 5 zonas premium (todas un único token, sin guiones).
function zoneKeyFromUrl(url: string): string | null {
  const m = url.match(/-en-madrid-([a-z]+)/i);
  if (!m) return null;
  const key = m[1].toLowerCase();
  return ALLOWED_ZONES.some((z) => z.key === key) ? key : null;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Zona canónica a partir del h1 ("Piso en Madrid, Chamberí - Almagro, ...").
// Cae al slug si el h1 no contiene ninguna zona conocida.
function parseZone(h1: string, urlKey: string | null): string {
  const norm = stripAccents(h1).toLowerCase();
  for (const z of ALLOWED_ZONES) {
    if (norm.includes(z.key)) return z.label;
  }
  const fromUrl = ALLOWED_ZONES.find((z) => z.key === urlKey);
  return fromUrl?.label ?? "Madrid";
}

function parsePriceText(raw: string): number {
  const cleaned = raw
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(/,\d{0,2}$/, "")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// "Habitaciones: 3", "Baños: 2", "Sup. Construida 124 m²" → número.
function firstIntAfter(text: string, label: RegExp): number {
  const m = text.match(label);
  return m ? parseInt(m[1], 10) : 0;
}

function detectPropertyType(h1: string): string | undefined {
  const first = stripAccents(h1).trim().toLowerCase().split(/\s+/)[0] ?? "";
  return PROPERTY_TYPE_LABELS[first];
}

// Fotos: solo las de ESTA propiedad (`/property/<ref>/image/`), excluyendo
// las de "propiedades similares" que también aparecen en la ficha. La
// versión grande es la URL sin el segmento `/thumb/<dims>/`.
function extractPhotos($: cheerio.CheerioAPI, ref: string): RawPhoto[] {
  const wanted = `/property/${ref}/image/`;
  const seen = new Set<string>();
  const photos: RawPhoto[] = [];

  const consider = (raw: string | null | undefined) => {
    if (!raw) return;
    let url = raw.trim();
    if (url.startsWith("//")) url = `https:${url}`;
    if (!url.includes(PHOTO_HOST)) return;
    if (!url.includes(wanted)) return;
    url = url.split("?")[0]; // fuera cache-busters
    url = url.replace(/\/thumb\/\d+_\d+\//, "/"); // thumb → full size
    // Inmoweb sirve cada foto en dos rutas: `/image/<f>.jpg` (original limpio)
    // y `/image/w/<f>.jpg` (con marca de agua). Colapsamos ambas al original
    // para no duplicar y quedarnos con la versión sin marca.
    url = url.replace(/\/image\/w\//, "/image/");
    if (!/\.(jpe?g|png|webp)$/i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    photos.push({ url });
  };

  $("img").each((_, el) => {
    const $el = $(el);
    consider($el.attr("src"));
    consider($el.attr("data-src"));
    consider($el.attr("data-lazy"));
    consider($el.attr("data-original"));
  });
  $("source").each((_, el) => {
    const srcset = $(el).attr("srcset") ?? $(el).attr("data-srcset");
    if (srcset) for (const part of srcset.split(",")) consider(part.trim().split(/\s+/)[0]);
  });
  $("a[href]").each((_, el) => consider($(el).attr("href")));

  return photos;
}

export async function scrapeProperty(
  url: string,
  operationHint: "rent" | "sale",
): Promise<RawProperty | null> {
  const ref = refFromUrl(url);
  if (!ref) return null;

  const html = await fetchText(url);
  if (!html) return null;
  const $ = cheerio.load(html);

  const h1 = $("h1").first().text().trim();
  // Página retirada / redirigida a otra cosa: sin h1 de ficha → saltar.
  if (!h1) return null;

  const priceText = $(".precio").first().text();
  const price = parsePriceText(priceText);
  if (price <= 0) return null;

  // La operación REAL la decide la ficha (h1 / "€/mes"), no la lista de la
  // que vino — así nunca guardamos un alquiler como venta ni al revés.
  let operation: "rent" | "sale" = operationHint;
  if (/\balquiler\b/i.test(h1) || /\/mes\b|€\s*\/\s*mes/i.test(priceText)) {
    operation = "rent";
  } else if (/\bventa\b/i.test(h1)) {
    operation = "sale";
  }
  if (operation === "rent" && price < RENT_MIN_PRICE) return null;

  // Bloque principal de características (excluye las de propiedades similares).
  const mainBlock = $(".caracteristicasPrincipales").first().text();
  const bedrooms = firstIntAfter(mainBlock, /Habitaciones\D*(\d+)/i);
  const bathrooms = firstIntAfter(mainBlock, /Ba[ñn]os\D*(\d+)/i);
  const sqmMatch = mainBlock.match(/Sup\.?\s*(?:Construida|[ÚU]til)\D*(\d+)\s*m/i);
  const squareMeters = sqmMatch ? parseInt(sqmMatch[1], 10) : undefined;

  const description = $(".descripcion")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const zone = parseZone(h1, zoneKeyFromUrl(url));
  const propertyType = detectPropertyType(h1);

  // Alquiler de temporada (corta estancia) lo marca el h1 o la descripción.
  const isTemporada = /temporada/i.test(`${h1} ${description}`);
  const stay = operation === "rent" ? (isTemporada ? "short" : "long") : undefined;

  const features = extractFeaturesFromText(description);
  const photos = extractPhotos($, ref);

  return {
    externalId: ref,
    sourceUrl: url,
    title: h1,
    description: description || undefined,
    operation,
    stay,
    propertyType,
    price,
    bedrooms,
    bathrooms,
    squareMeters,
    zone,
    features,
    photos,
  };
}

// Enumera las URLs de ficha de una operación, paginando con &i=<offset>&c=18,
// y filtrando por zona desde el slug (barato, sin abrir la ficha).
async function listUrlsForOperation(
  operation: "rent" | "sale",
): Promise<string[]> {
  const opCode = operation === "rent" ? OP_RENT : OP_SALE;
  const priceParam = operation === "rent" ? `&precio_min=${RENT_MIN_PRICE}` : "";
  const seen = new Set<string>();
  const urls: string[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const listUrl = `${SITE_BASE}/results/?id_tipo_operacion=${opCode}${priceParam}&i=${offset}&c=${PAGE_SIZE}`;
    const html = await fetchText(listUrl);
    if (!html) break;

    let addedOnThisPage = 0;
    const re = /href="(\/[a-z0-9-]+-es\d+\.html)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const path = m[1];
      const ref = refFromUrl(path);
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      addedOnThisPage++;
      if (zoneKeyFromUrl(path)) urls.push(`${SITE_BASE}${path}`); // solo zonas premium
    }

    // Sin fichas nuevas en esta página = hemos llegado al final (Inmoweb repite
    // la última página cuando el offset se pasa del total).
    if (addedOnThisPage === 0) break;
    if (page < MAX_PAGES - 1) await delay(REQUEST_DELAY_MS);
  }

  return urls;
}

export const terrahomesScraper: Scraper = {
  key: "terrahomes",
  label: "TerraHomes (web pública)",
  agencySlug: "terrahomes",
  scrape: async () => {
    const results: RawProperty[] = [];
    for (const operation of ["sale", "rent"] as const) {
      const urls = await listUrlsForOperation(operation);
      for (let i = 0; i < urls.length; i++) {
        try {
          const prop = await scrapeProperty(urls[i], operation);
          if (prop) results.push(prop);
        } catch {
          // fallos individuales se ignoran; el sync log refleja el agregado
        }
        if (i < urls.length - 1) await delay(REQUEST_DELAY_MS);
      }
    }
    return results;
  },
};
