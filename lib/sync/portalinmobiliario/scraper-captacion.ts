import "server-only";
import * as cheerio from "cheerio";

export type ScrapedCaptacion = {
  title: string | null;
  description: string | null;
  price: number | null;
  currency: "uf" | "clp" | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  region: string | null;
  commune: string | null;
  zone: string | null;
  address_scraped: string | null;
  latitude: number | null;
  longitude: number | null;
  cover_photo_url: string | null;
  photo_urls: string[];
  features: string[];
  source_site: string;
};

function detectSite(url: string): string {
  if (url.includes("portalinmobiliario.com") || url.includes("mercadolibre.cl"))
    return "mercadolibre";
  if (url.includes("toctoc.com")) return "toctoc";
  if (url.includes("yapo.cl")) return "yapo";
  if (url.includes("bienesraiceschile.cl")) return "bienesraiceschile";
  return "other";
}

function extractMLId(url: string): string | null {
  // URLs like: https://www.portalinmobiliario.com/MLC-3982845844-casa-en-arriendo
  // or: https://articulo.mercadolibre.cl/MLC-3982845844
  const match = url.match(/MLC-?(\d+)/i);
  if (match) {
    return `MLC${match[1]}`;
  }
  return null;
}

async function scrapeML(itemId: string): Promise<Partial<ScrapedCaptacion>> {
  const itemRes = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!itemRes.ok) throw new Error(`ML API error: ${itemRes.status}`);

  const item = (await itemRes.json()) as any;

  let desc: any = {};
  try {
    const descRes = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (descRes.ok) desc = await descRes.json();
  } catch {
    // ignore if description fails
  }

  // Title
  const title = item.title || null;

  // Price & currency
  let price: number | null = null;
  let currency: "uf" | "clp" | null = null;
  if (item.price) {
    price = Math.round(item.price);
    // MercadoLibre Chile uses CLP by default
    if (item.currency_id === "CLF") currency = "uf";
    else if (item.currency_id === "UYU") currency = "clp";
    else currency = "clp";
  }

  // Description: la ficha completa (antes se cortaba a 500 chars y se perdía
  // casi toda la descripción del aviso)
  const description = desc.plain_text ? String(desc.plain_text).slice(0, 8000) : null;

  // Attributes (bedrooms, bathrooms, m², etc.)
  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let square_meters: number | null = null;
  const features: string[] = [];

  if (item.attributes && Array.isArray(item.attributes)) {
    for (const attr of item.attributes) {
      if (attr.name === "BEDROOMS" || attr.name === "Dormitorios") {
        bedrooms = parseInt(attr.value_name || attr.value);
      } else if (attr.name === "BATHROOMS" || attr.name === "Baños") {
        bathrooms = parseInt(attr.value_name || attr.value);
      } else if (attr.name === "TOTAL_AREA" || attr.name === "Superficie total") {
        square_meters = parseInt(attr.value_name || attr.value);
      } else if (attr.name && attr.value_name) {
        // Resto de atributos de la ficha → características visibles
        // ("Piscina: Sí" se muestra como "Piscina"; "No" se omite)
        const value = String(attr.value_name).trim();
        if (/^s[ií]$/i.test(value)) features.push(attr.name);
        else if (!/^no$/i.test(value)) features.push(`${attr.name}: ${value}`);
      }
    }
  }

  // Location
  let region: string | null = null;
  let commune: string | null = null;
  if (item.location) {
    // location has: city, state (región), country
    commune = item.location.city || null;
    region = item.location.state || null;
  }
  if (item.address) {
    commune = item.address.city || commune;
    region = item.address.state || region;
  }

  // Photos
  const photoUrls: string[] = [];
  if (item.pictures && Array.isArray(item.pictures)) {
    for (const pic of item.pictures.slice(0, 30)) {
      if (pic.url) {
        // Get the largest resolution
        const large = pic.url.replace(/-[A-Z]+\./, "-O.");
        photoUrls.push(large);
      }
    }
  }

  // Geolocation
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (item.geolocation) {
    latitude = item.geolocation.latitude || null;
    longitude = item.geolocation.longitude || null;
  }

  const address_scraped =
    item.address?.address_line || item.address?.city || null;

  return {
    title,
    description,
    price,
    currency: currency ?? undefined,
    bedrooms,
    bathrooms,
    square_meters,
    region,
    commune,
    address_scraped,
    latitude,
    longitude,
    cover_photo_url: photoUrls[0] || null,
    photo_urls: photoUrls,
    features,
  };
}

function parsePrice(text: string): { price: number | null; currency: "uf" | "clp" | null } {
  if (!text) return { price: null, currency: null };
  const clean = text.replace(/\s/g, "").toUpperCase();

  if (clean.includes("UF")) {
    const match = clean.match(/[\d.,]+/);
    if (match) {
      const num = parseFloat(match[0].replace(/\./g, "").replace(",", "."));
      return { price: isNaN(num) ? null : num, currency: "uf" };
    }
  }

  const clpMatch = clean.match(/\$[\d.,]+/);
  if (clpMatch) {
    const num = parseInt(clpMatch[0].replace(/[$.,]/g, ""), 10);
    return { price: isNaN(num) ? null : num, currency: "clp" };
  }

  const numMatch = clean.match(/[\d.,]+/);
  if (numMatch) {
    const num = parseInt(numMatch[0].replace(/[.,]/g, ""), 10);
    return { price: isNaN(num) ? null : num, currency: "clp" };
  }

  return { price: null, currency: null };
}

function extractLatLng(html: string): { lat: number | null; lng: number | null } {
  const patterns = [
    /"lat(?:itude)?"\s*:\s*([-\d.]+)\s*,\s*"lng|lon(?:gitude)?"\s*:\s*([-\d.]+)/i,
    /lat(?:itude)?[=:]\s*([-\d.]+)[&,\s]+lon(?:gitude)?[=:]\s*([-\d.]+)/i,
    /@([-\d.]+),([-\d.]+)/,
    /maps\.google\.com[^"]*?q=([-\d.]+),([-\d.]+)/i,
    /"latitude":([-\d.]+),"longitude":([-\d.]+)/,
    /lat:([-\d.]+),\s*lng:([-\d.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -56 && lat <= -17 && lng >= -76 && lng <= -65) {
        return { lat, lng };
      }
    }
  }
  return { lat: null, lng: null };
}

function scrapeGeneric($: cheerio.CheerioAPI, html: string): Partial<ScrapedCaptacion> {
  const title = $("h1").first().text().trim() || $("title").text().trim() || null;

  const priceSelectors = ["[class*='precio'], [class*='price'], [id*='price'], [id*='precio']"];
  let priceText = "";
  for (const sel of priceSelectors) {
    priceText = $(sel).first().text().trim();
    if (priceText) break;
  }
  const { price, currency } = parsePrice(priceText);

  // Descripción: primero el bloque de descripción de la página (ficha
  // completa); si no existe, caemos a los meta tags (suelen estar truncados).
  let description: string | null = null;
  const descBlock = $(
    "[class*='descripcion'], [class*='description'], [id*='descripcion'], [id*='description']"
  ).first();
  if (descBlock.length) {
    const text = descBlock.text().replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    if (text.length > 40) description = text.slice(0, 8000);
  }
  if (!description) {
    description =
      $("meta[property='og:description']").attr("content") ||
      $("meta[name='description']").attr("content") ||
      null;
  }

  // Características: items de listas en secciones de características/amenities
  const features: string[] = [];
  $(
    "[class*='caracter'] li, [class*='feature'] li, [class*='amenit'] li, [id*='caracter'] li"
  ).each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && text.length <= 80 && !features.includes(text)) features.push(text);
  });

  const { lat, lng } = extractLatLng(html);

  const photoUrls: string[] = [];
  const ogImage = $("meta[property='og:image']").attr("content");
  if (ogImage) photoUrls.push(ogImage);

  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    if (src && src.startsWith("http") && !src.includes("logo") && !src.includes("icon")) {
      const w = $(el).attr("width");
      if (w && parseInt(w) > 200) {
        if (!photoUrls.includes(src)) photoUrls.push(src);
      }
    }
  });

  return {
    title,
    description,
    price,
    currency: currency ?? undefined,
    latitude: lat,
    longitude: lng,
    cover_photo_url: photoUrls[0] || null,
    photo_urls: photoUrls.slice(0, 30),
    features: features.slice(0, 60),
  };
}

export async function scrapeCaptacionUrl(url: string): Promise<ScrapedCaptacion> {
  const site = detectSite(url);

  try {
    // Try ML API first
    if (site === "mercadolibre") {
      const mlId = extractMLId(url);
      if (mlId) {
        const partial = await scrapeML(mlId);
        return {
          title: partial.title ?? null,
          description: partial.description ?? null,
          price: partial.price ?? null,
          currency: partial.currency ?? null,
          bedrooms: partial.bedrooms ?? null,
          bathrooms: partial.bathrooms ?? null,
          square_meters: partial.square_meters ?? null,
          region: partial.region ?? null,
          commune: partial.commune ?? null,
          zone: partial.zone ?? null,
          address_scraped: partial.address_scraped ?? null,
          latitude: partial.latitude ?? null,
          longitude: partial.longitude ?? null,
          cover_photo_url: partial.cover_photo_url ?? null,
          photo_urls: partial.photo_urls ?? [],
          features: partial.features ?? [],
          source_site: site,
        };
      }
    }
  } catch (err) {
    console.warn(`[scraper] ML API failed for ${url}:`, err);
    // Fall through to web scraping
  }

  // Fallback: web scraping
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-CL,es;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let html: string;
  try {
    const res = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const $ = cheerio.load(html);
  const partial = scrapeGeneric($, html);

  return {
    title: partial.title ?? null,
    description: partial.description ?? null,
    price: partial.price ?? null,
    currency: partial.currency ?? null,
    bedrooms: partial.bedrooms ?? null,
    bathrooms: partial.bathrooms ?? null,
    square_meters: partial.square_meters ?? null,
    region: partial.region ?? null,
    commune: partial.commune ?? null,
    zone: partial.zone ?? null,
    address_scraped: partial.address_scraped ?? null,
    latitude: partial.latitude ?? null,
    longitude: partial.longitude ?? null,
    cover_photo_url: partial.cover_photo_url ?? null,
    photo_urls: partial.photo_urls ?? [],
    features: partial.features ?? [],
    source_site: site,
  };
}
