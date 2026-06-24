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
  source_site: string;
};

function detectSite(url: string): string {
  if (url.includes("portalinmobiliario.com")) return "portalinmobiliario";
  if (url.includes("mercadolibre.cl")) return "mercadolibre";
  if (url.includes("toctoc.com")) return "toctoc";
  if (url.includes("yapo.cl")) return "yapo";
  if (url.includes("bienesraiceschile.cl")) return "bienesraiceschile";
  return "other";
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
      // Chile is roughly lat -17 to -56, lng -65 to -76
      if (lat >= -56 && lat <= -17 && lng >= -76 && lng <= -65) {
        return { lat, lng };
      }
    }
  }
  return { lat: null, lng: null };
}

function scrapePortalinmobiliario(
  $: cheerio.CheerioAPI,
  html: string
): Partial<ScrapedCaptacion> {
  // Title
  const title =
    $("h1.title-h1-re, h1[class*='title'], .property-title, h1").first().text().trim() || null;

  // Price — portalinmobiliario uses specific price sections
  let priceText =
    $("[class*='price-tag'] .price-tag-fraction, .price-section .price-tag-fraction").first().text() ||
    $("[class*='price']").first().text() ||
    $(".price").first().text();
  const currencyEl =
    $("[class*='price-tag'] .price-tag-symbol, .price-section .price-tag-symbol").first().text();
  if (currencyEl) priceText = currencyEl + priceText;
  const { price, currency } = parsePrice(priceText);

  // Description
  const description =
    $(".description-content p, [class*='description'] p, .description").first().text().trim() || null;

  // Specs
  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let square_meters: number | null = null;

  $("[class*='attribute'], [class*='specs'] li, .specs-list li, li.attribute").each((_, el) => {
    const text = $(el).text().toLowerCase().trim();
    if (text.includes("dormitorio") || text.includes("habitacion") || text.includes("recámara")) {
      const m = text.match(/(\d+)/);
      if (m) bedrooms = parseInt(m[1]);
    } else if (text.includes("baño")) {
      const m = text.match(/(\d+)/);
      if (m) bathrooms = parseInt(m[1]);
    } else if (text.includes("m²") || text.includes("m2") || text.includes("superficie")) {
      const m = text.match(/(\d+)/);
      if (m) square_meters = parseInt(m[1]);
    }
  });

  // Also try JSON-LD
  const jsonLdMatch = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      if (ld.numberOfRooms && !bedrooms) bedrooms = parseInt(ld.numberOfRooms);
      if (ld.numberOfBathroomsTotal && !bathrooms) bathrooms = parseInt(ld.numberOfBathroomsTotal);
      if (ld.floorSize?.value && !square_meters) square_meters = parseInt(ld.floorSize.value);
      if (ld.geo?.latitude && ld.geo?.longitude) {
        // override with structured data
      }
    } catch {}
  }

  // Location
  const locationText =
    $("[class*='location'] address, [class*='address'], .property-location, address").first().text().trim() || null;
  const breadcrumbItems = $("[class*='breadcrumb'] li, nav[aria-label*='breadcrumb'] li")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  let commune: string | null = null;
  let region: string | null = null;
  if (breadcrumbItems.length >= 2) {
    commune = breadcrumbItems[breadcrumbItems.length - 1] || null;
    region = breadcrumbItems[breadcrumbItems.length - 2] || null;
  }
  if (!commune && locationText) {
    const parts = locationText.split(",").map((s) => s.trim());
    commune = parts[parts.length - 1] || null;
  }

  // Coordinates from page source
  const { lat, lng } = extractLatLng(html);

  // Photos
  const photoUrls: string[] = [];
  $("img[class*='gallery'], img[class*='photo'], .carousel img, .gallery img, figure img").each((_, el) => {
    const src = $(el).attr("data-src") || $(el).attr("src") || "";
    if (src && src.startsWith("http") && !src.includes("placeholder") && !src.includes("logo")) {
      // Get largest resolution available
      const large = src.replace(/-[SWJN]\d+x\d+/, "").replace(/-\d+x\d+/, "");
      if (!photoUrls.includes(large)) photoUrls.push(large);
    }
  });

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
    address_scraped: locationText,
    latitude: lat,
    longitude: lng,
    cover_photo_url: photoUrls[0] || null,
    photo_urls: photoUrls.slice(0, 30),
  };
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

  const description = $("meta[name='description']").attr("content") || null;

  const { lat, lng } = extractLatLng(html);

  // Photos — look for og:image and regular img src with property keywords
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
  };
}

export async function scrapeCaptacionUrl(url: string): Promise<ScrapedCaptacion> {
  const site = detectSite(url);

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
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const $ = cheerio.load(html);

  let partial: Partial<ScrapedCaptacion>;
  if (site === "portalinmobiliario" || site === "mercadolibre") {
    partial = scrapePortalinmobiliario($, html);
  } else {
    partial = scrapeGeneric($, html);
  }

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
    source_site: site,
  };
}
