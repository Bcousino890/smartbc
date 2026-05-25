import * as cheerio from "cheerio";
import type { RawPhoto, RawProperty, Scraper } from "../types";

const SITE_BASE = "https://levelrealestate.es";
const SITEMAP_URL = `${SITE_BASE}/property-sitemap.xml`;
const USER_AGENT =
  "smartbc-bot/1.0 (contacto@bencousinopropiedades.com)";
const REQUEST_DELAY_MS = 2500;
const REQUEST_TIMEOUT_MS = 20000;
// Límite por sync para no agotar el maxDuration del endpoint (300s). El primer
// sync completo se puede disparar localmente con LEVEL_SYNC_LIMIT=999 en env.
const DEFAULT_LIMIT = Number(process.env.LEVEL_SYNC_LIMIT ?? 25);

// Match parcial sobre la cadena completa de `property-location` (todos los
// segmentos, no solo el primero). Insensible a mayúsculas y acentos.
// El `label` es el nombre normalizado que se guarda en BD.
const ZONE_KEYWORDS: Array<{ match: RegExp; label: string }> = [
  { match: /salamanca/i, label: "Salamanca" },
  { match: /chamber[íi]/i, label: "Chamberí" },
  { match: /retiro/i, label: "Retiro" },
  { match: /pozuelo/i, label: "Pozuelo" },
  { match: /chamart[íi]n/i, label: "Chamartín" },
  { match: /chueca/i, label: "Chueca" },
  { match: /justicia/i, label: "Justicia" },
  { match: /moraleja/i, label: "La Moraleja" },
  { match: /centro/i, label: "Centro" },
];

// Lista de keywords (lowercase, sin acentos) que la propiedad DEBE contener
// en algún segmento de su ubicación para aceptarse. Si vacío, no filtra.
// Configurable vía `LEVEL_ALLOWED_ZONES=salamanca,chamberi,retiro,pozuelo`.
const ALLOWED_ZONE_KEYS = (process.env.LEVEL_ALLOWED_ZONES ?? "")
  .split(",")
  .map((s) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, ""),
  )
  .filter(Boolean);

const FEATURE_LABELS = new Set([
  "Terrazas",
  "Piscina",
  "Jardín",
  "Garaje",
  "Trastero",
  "Ascensor",
  "Aire acondicionado",
  "Calefacción",
  "Portero",
  "Orientación",
  "Reformado",
  "Amueblado",
]);

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
      redirect: "manual",
      cache: "no-store",
    });
    // Las propiedades retiradas devuelven 301 → home. Las consideramos no
    // disponibles y devolvemos null para que el caller las salte.
    if (res.status >= 300 && res.status < 400) return null;
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function refFromUrl(url: string): string | null {
  const match = url.match(/propiedad-ref-(\d+)\/?/);
  return match ? match[1] : null;
}

async function loadSitemapRefs(): Promise<
  Array<{ ref: string; url: string }>
> {
  const xml = await fetchText(SITEMAP_URL);
  if (!xml) return [];

  const urls: Array<{ ref: string; url: string }> = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1].trim();
    const ref = refFromUrl(url);
    if (ref) urls.push({ ref, url });
  }
  return urls;
}

function parsePriceText(raw: string): number {
  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\./g, "")
    .replace(/,\d{0,2}$/, "")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function parseZone(raw: string | undefined): string {
  if (!raw) return "Madrid";
  // Probamos match parcial contra cualquier keyword conocida: devuelve el
  // label canónico (Salamanca, Chamberí, Pozuelo...). Si no matchea ninguna,
  // devolvemos el primer segmento tal cual viene.
  for (const { match, label } of ZONE_KEYWORDS) {
    if (match.test(raw)) return label;
  }
  return raw.split(",")[0]?.trim() ?? "Madrid";
}

function zoneIsAllowed(rawLocation: string | undefined): boolean {
  if (ALLOWED_ZONE_KEYS.length === 0) return true;
  if (!rawLocation) return false;
  const normalized = stripAccents(rawLocation).toLowerCase();
  return ALLOWED_ZONE_KEYS.some((kw) => normalized.includes(kw));
}

function parseFeatureList(
  $: cheerio.CheerioAPI,
): { bedrooms: number; bathrooms: number; sqm: number | null; features: string[] } {
  let bedrooms = 0;
  let bathrooms = 0;
  let sqm: number | null = null;
  const features = new Set<string>();

  // Las características aparecen pareadas: <li>label</li><li>value</li>.
  // Recogemos todas las parejas que encontremos en cualquier lista de iconos.
  const items = $(".elementor-icon-list-text")
    .map((_, el) => $(el).text().trim())
    .get();

  for (let i = 0; i < items.length; i++) {
    const label = items[i];
    const value = items[i + 1] ?? "";

    if (label === "Dormitorios") {
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && bedrooms === 0) bedrooms = n;
    } else if (label === "Baños") {
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && bathrooms === 0) bathrooms = n;
    } else if (label === "Construido" || label === "Superficie") {
      const m = value.match(/([\d.,]+)\s*m/);
      if (m && sqm == null) {
        sqm = Math.round(Number(m[1].replace(",", ".")));
      }
    } else if (FEATURE_LABELS.has(label)) {
      // Solo añadimos como feature si parece que el valor confirma presencia
      // (en el HTML de Level los valores numéricos tipo "3" indican que el
      // dato existe; cualquier valor no-vacío basta como señal).
      if (value && value !== "0") features.add(label);
    }

    // También cubrimos el caso del listado compacto: m² aislado sin label.
    if (/^[\d.,]+\s*m²?$/.test(label) && sqm == null) {
      const m = label.match(/([\d.,]+)/);
      if (m) sqm = Math.round(Number(m[1].replace(",", ".")));
    }
  }

  return { bedrooms, bathrooms, sqm, features: Array.from(features) };
}

function detectOperation(
  classAttrs: string,
): { operation: "rent" | "sale"; stay: "short" | "long" | null } | null {
  if (classAttrs.includes("property_offer-alquiler-es")) {
    // Posibles taxonomías futuras: property_stay-corta vs property_stay-larga.
    // Por defecto larga estancia hasta que la web exponga el distinto.
    const isShort =
      classAttrs.includes("property_stay-corta") ||
      classAttrs.includes("temporada");
    return { operation: "rent", stay: isShort ? "short" : "long" };
  }
  if (classAttrs.includes("property_offer-venta-es")) {
    return { operation: "sale", stay: null };
  }
  return null;
}

function extractPhotos(
  $: cheerio.CheerioAPI,
  ref: string,
): RawPhoto[] {
  const photos = new Map<string, RawPhoto>(); // dedupe por URL
  const refPath = `/Images/${ref}/`;
  $(".swiper-slide-image, .swiper-slide img").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    // Solo aceptamos fotos cuyo path contenga la referencia de la propiedad
    // actual. Esto descarta automáticamente las galerías de propiedades
    // sugeridas que aparecen al final de la página.
    if (!src.includes(refPath)) return;
    if (!photos.has(src)) {
      photos.set(src, { url: src, alt: $(el).attr("alt") ?? undefined });
    }
  });
  return Array.from(photos.values());
}

export async function scrapeProperty(
  url: string,
): Promise<RawProperty | null> {
  const html = await fetchText(url);
  if (!html) return null;

  const ref = refFromUrl(url);
  if (!ref) return null;

  const $ = cheerio.load(html);
  // Los slugs de taxonomía property_offer-* viven en un wrapper interno de
  // Elementor (no en <body>). Concatenamos cualquier class de los elementos
  // con la propia clase "property" para asegurar la detección.
  const classAttrs = $("[class*='property_offer-']")
    .map((_, el) => $(el).attr("class") ?? "")
    .get()
    .join(" ");

  const opInfo = detectOperation(classAttrs);
  if (!opInfo) return null;

  const locationText = $(".property-location").first().text().trim();
  // Filtro de zona: si LEVEL_ALLOWED_ZONES está activo y esta propiedad
  // no cumple, la descartamos antes de procesar fotos (lo costoso).
  if (!zoneIsAllowed(locationText)) return null;

  const title =
    $("h1.elementor-heading-title").first().text().trim() ||
    `Propiedad ${ref}`;
  const priceText = $(".property-price").first().contents().first().text();
  const price = parsePriceText(priceText);
  if (price <= 0) return null;

  const description = $("#propiedadcontenido")
    .text()
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const zone = parseZone(locationText);

  const { bedrooms, bathrooms, sqm, features } = parseFeatureList($);

  const photos = extractPhotos($, ref);

  return {
    externalId: ref,
    sourceUrl: url,
    title,
    description: description || undefined,
    operation: opInfo.operation,
    stay: opInfo.stay ?? undefined,
    price,
    bedrooms,
    bathrooms,
    squareMeters: sqm ?? undefined,
    zone,
    features,
    photos,
  };
}

const HAS_ZONE_FILTER = ALLOWED_ZONE_KEYS.length > 0;

const scraperBase: Scraper = {
  key: "level-real-estate",
  label: "Level Real Estate (web pública)",
  agencySlug: "level-real-estate",
  scrape: async () => {
    const refs = await loadSitemapRefs();
    // Con filtro de zonas activo, ignoramos LIMIT: hay que abrir cada ficha
    // igualmente para conocer su zona y decidir si entra. Sin filtro, LIMIT
    // controla cuántas procesa cada sync (cron de 6h cubre el catálogo
    // poco a poco).
    const sliced = HAS_ZONE_FILTER
      ? refs
      : refs.slice(0, Math.max(1, DEFAULT_LIMIT));
    const results: RawProperty[] = [];

    for (let i = 0; i < sliced.length; i++) {
      const { url } = sliced[i];
      try {
        const prop = await scrapeProperty(url);
        if (prop) results.push(prop);
      } catch {
        // ignorar fallos individuales; el sync log refleja el total agregado
      }
      // Rate limit cortés excepto la última iteración
      if (i < sliced.length - 1) await delay(REQUEST_DELAY_MS);
    }

    return results;
  },
};

// `listExternalIds()` SOLO se expone cuando no hay filtro de zonas. Con
// filtro activo no podemos saber qué refs pasan sin abrir la ficha, así que
// el motor cae al modo legacy (usar `seenExternal` como autoridad).
if (!HAS_ZONE_FILTER) {
  scraperBase.listExternalIds = async () => {
    const refs = await loadSitemapRefs();
    return refs.map((r) => r.ref);
  };
}

export const levelRealEstateScraper: Scraper = scraperBase;
