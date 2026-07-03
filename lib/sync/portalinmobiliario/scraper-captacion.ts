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

  // Description
  const description = desc.plain_text ? desc.plain_text.slice(0, 500) : null;

  // Attributes (bedrooms, bathrooms, m², etc.)
  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let square_meters: number | null = null;

  if (item.attributes && Array.isArray(item.attributes)) {
    for (const attr of item.attributes) {
      if (attr.name === "BEDROOMS" || attr.name === "Dormitorios") {
        bedrooms = parseInt(attr.value_name || attr.value);
      } else if (attr.name === "BATHROOMS" || attr.name === "Baños") {
        bathrooms = parseInt(attr.value_name || attr.value);
      } else if (attr.name === "TOTAL_AREA" || attr.name === "Superficie total") {
        square_meters = parseInt(attr.value_name || attr.value);
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

  // Photos: item.pictures may only include a subset; /pictures endpoint returns all
  const picMap = new Map<string, string>();
  if (item.pictures && Array.isArray(item.pictures)) {
    for (const pic of item.pictures) {
      if (pic.id && pic.url) picMap.set(pic.id, pic.url.replace(/-[A-Z]+\./, "-O."));
      else if (pic.url) picMap.set(pic.url, pic.url.replace(/-[A-Z]+\./, "-O."));
    }
  }
  try {
    const picRes = await fetch(`https://api.mercadolibre.com/items/${itemId}/pictures`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (picRes.ok) {
      const picData = (await picRes.json()) as any[];
      for (const pic of picData) {
        if (pic.id && pic.url) picMap.set(pic.id, pic.url.replace(/-[A-Z]+\./, "-O."));
      }
    }
  } catch {
    // ignore — we already have item.pictures as fallback
  }
  const photoUrls = Array.from(picMap.values()).slice(0, 50);

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

  const description = $("meta[name='description']").attr("content") || null;

  const { lat, lng } = extractLatLng(html);

  const seenUrls = new Set<string>();
  const photoUrls: string[] = [];

  function addPhoto(url: string) {
    if (!url || !url.startsWith("http")) return;
    const lower = url.toLowerCase();
    if (lower.includes("logo") || lower.includes("icon") || lower.includes("favicon") || lower.includes("avatar")) return;
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    photoUrls.push(url);
  }

  // og:image (suele ser la foto principal)
  $("meta[property='og:image'], meta[property='og:image:url']").each((_, el) => {
    addPhoto($(el).attr("content") || "");
  });

  // JSON-LD estructurado (muchos portales lo incluyen)
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const images = data.image || data.photo || [];
      const arr = Array.isArray(images) ? images : [images];
      for (const img of arr) {
        if (typeof img === "string") addPhoto(img);
        else if (img?.url) addPhoto(img.url);
        else if (img?.contentUrl) addPhoto(img.contentUrl);
      }
    } catch {}
  });

  // JSON embebido en scripts (ej: __PRELOADED_STATE__, window.PI_DATA, etc.)
  const jsonImagePattern = /"(?:url|src|image_url|photo_url|imageUrl)"\s*:\s*"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
  let jsonMatch: RegExpExecArray | null;
  while ((jsonMatch = jsonImagePattern.exec(html)) !== null) {
    addPhoto(jsonMatch[1]);
  }

  // Etiquetas <img>: src, data-src, data-lazy-src, srcset
  $("img").each((_, el) => {
    const el$ = $(el);
    const candidates = [
      el$.attr("src"),
      el$.attr("data-src"),
      el$.attr("data-lazy-src"),
      el$.attr("data-original"),
    ];
    for (const src of candidates) {
      if (src) addPhoto(src);
    }
    // srcset puede tener múltiples URLs con descriptores
    const srcset = el$.attr("srcset") || el$.attr("data-srcset") || "";
    if (srcset) {
      for (const part of srcset.split(",")) {
        const url = part.trim().split(/\s+/)[0];
        addPhoto(url);
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
    photo_urls: photoUrls.slice(0, 50),
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
    source_site: site,
  };
}
