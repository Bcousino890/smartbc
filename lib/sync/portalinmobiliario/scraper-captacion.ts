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
  useful_square_meters: number | null;
  region: string | null;
  commune: string | null;
  zone: string | null;
  address_scraped: string | null;
  latitude: number | null;
  longitude: number | null;
  cover_photo_url: string | null;
  photo_urls: string[];
  features: string[];
  broker_name: string | null;
  external_reference: string | null;
  operation: "venta" | "arriendo" | null;
  portal_publication_number: string | null;
  published_ago: string | null;
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

// Venta o arriendo según la URL del aviso o el subtítulo/título de la página.
// La misma propiedad suele estar publicada dos veces (un aviso por operación).
function detectOperation(text: string): "venta" | "arriendo" | null {
  if (/arriendo|arrienda|alquiler/i.test(text)) return "arriendo";
  if (/venta|vende/i.test(text)) return "venta";
  return null;
}

// Hay corredoras que no publican su código en el HTML del portal pero sí lo
// ponen en la descripción (ej: "KR49345-AD" en la primera línea, o
// "Código: AB-1234"). Se intenta con etiqueta explícita y, si no, con un
// token tipo código (letras+números con guión) al inicio de la descripción.
export function extractReferenceFromDescription(description: string | null): string | null {
  if (!description) return null;
  const labeled = description.match(
    /(?:c[oó]d(?:igo)?|ref(?:erencia)?)\.?\s*(?:de\s+(?:la\s+)?propiedad)?\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9\-\/.]{1,23})/i
  );
  if (labeled) return labeled[1].replace(/[.,;]+$/, "");
  // Token solo en una de las primeras líneas: debe mezclar letras y números
  // (evita capturar palabras o cifras sueltas)
  const firstLines = description.split(/\n/, 4).map((l) => l.trim());
  for (const line of firstLines) {
    if (
      /^[A-Za-z0-9][A-Za-z0-9\-\/.]{2,23}$/.test(line) &&
      /[A-Za-z]/.test(line) &&
      /\d/.test(line)
    ) {
      return line;
    }
  }
  return null;
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
  let useful_square_meters: number | null = null;
  let operation: "venta" | "arriendo" | null = null;
  const features: string[] = [];

  if (item.attributes && Array.isArray(item.attributes)) {
    for (const attr of item.attributes) {
      if (attr.id === "OPERATION" || /^operaci[oó]n$/i.test(String(attr.name || ""))) {
        operation = detectOperation(String(attr.value_name || attr.value || ""));
      } else if (attr.name === "BEDROOMS" || attr.name === "Dormitorios") {
        bedrooms = parseIntCl(String(attr.value_name || attr.value || ""));
      } else if (attr.name === "BATHROOMS" || attr.name === "Baños") {
        bathrooms = parseIntCl(String(attr.value_name || attr.value || ""));
      } else if (attr.name === "TOTAL_AREA" || attr.name === "Superficie total") {
        square_meters = parseIntCl(String(attr.value_name || attr.value || ""));
      } else if (attr.name === "COVERED_AREA" || attr.name === "Superficie útil") {
        useful_square_meters = parseIntCl(String(attr.value_name || attr.value || ""));
      } else if (attr.name && attr.value_name) {
        // Resto de atributos de la ficha → características visibles
        // ("Piscina: Sí" se muestra como "Piscina"; los "No" se conservan
        // para que la ficha quede idéntica a la del portal)
        const value = String(attr.value_name).trim();
        if (/^s[ií]$/i.test(value)) features.push(attr.name);
        else features.push(`${attr.name}: ${value}`);
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
    useful_square_meters,
    region,
    commune,
    address_scraped,
    latitude,
    longitude,
    cover_photo_url: photoUrls[0] || null,
    photo_urls: photoUrls,
    features,
    operation: operation ?? detectOperation(title || ""),
    portal_publication_number: itemId.replace(/^MLC/i, "") || null,
    external_reference: extractReferenceFromDescription(description),
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

// parseInt directo rompe con separador de miles chileno: "1.142 m²" -> 1.
function parseIntCl(text: string): number | null {
  const match = text.match(/[\d.]+/);
  if (!match) return null;
  const num = parseInt(match[0].replace(/\./g, ""), 10);
  return isNaN(num) ? null : num;
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

// La página SSR del aviso solo incluye las primeras ~5 fotos; el resto carga
// por JS. El modal de galería (vis-modals/gallery/{itemId}) lista los IDs de
// TODAS las fotos, y las URLs se construyen con el template del picture_config
// del aviso: D_NQ_NP_{id}-F.webp (variante zoom, funciona sin el slug).
async function fetchMLGalleryPhotos(itemId: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      `https://www.portalinmobiliario.com/vis-modals/gallery/${itemId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "es-CL,es;q=0.9",
        },
        signal: controller.signal,
      }
    );
    if (!res.ok) return [];
    const modalHtml = await res.text();
    const ids: string[] = [];
    for (const m of modalHtml.matchAll(/\d{6}-MLC\d+(?:_\d{6})?/g)) {
      if (!ids.includes(m[0])) ids.push(m[0]);
    }
    return ids.map((id) => `https://http2.mlstatic.com/D_NQ_NP_${id}-F.webp`);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// La API pública de items de MercadoLibre pasó a exigir OAuth (403 PolicyAgent
// para requests anónimos), así que la ficha se extrae directamente del HTML de
// la página del aviso. portalinmobiliario.com es una VIP de MercadoLibre y usa
// sus clases ui-pdp-* / andes-*.
function scrapeMLPage($: cheerio.CheerioAPI, html: string): Partial<ScrapedCaptacion> {
  const title =
    $("h1.ui-pdp-title").first().text().trim() ||
    $("h1").first().text().trim() ||
    null;

  // Precio: primer monto del bloque principal (UF o CLP según el símbolo)
  let price: number | null = null;
  let currency: "uf" | "clp" | null = null;
  const priceEl = $(".ui-pdp-price__second-line .andes-money-amount").first();
  const symbol = priceEl.find(".andes-money-amount__currency-symbol").first().text().trim().toUpperCase();
  const fraction = priceEl.find(".andes-money-amount__fraction").first().text().trim();
  if (fraction) {
    if (symbol.includes("UF")) {
      currency = "uf";
      const num = parseFloat(fraction.replace(/\./g, "").replace(",", "."));
      price = isNaN(num) ? null : num;
    } else {
      currency = "clp";
      const num = parseInt(fraction.replace(/[.,]/g, ""), 10);
      price = isNaN(num) ? null : num;
    }
  }

  // Specs: la tabla rayada trae TODAS las características de la ficha.
  // Se incluyen también los "No" (Calefacción: No, etc.) para que la ficha
  // quede idéntica a la sección "Características del inmueble" del portal.
  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let square_meters: number | null = null;
  let useful_square_meters: number | null = null;
  const features: string[] = [];
  const seenFeatures = new Set<string>();
  const addFeature = (label: string, value: string) => {
    const key = label.toLowerCase();
    if (seenFeatures.has(key)) return;
    seenFeatures.add(key);
    features.push(/^s[ií]$/i.test(value) ? label : `${label}: ${value}`);
  };
  const handleSpec = (label: string, value: string) => {
    if (!label || !value) return;
    if (/^dormitorios$/i.test(label)) {
      bedrooms = bedrooms ?? parseIntCl(value);
    } else if (/^baños$/i.test(label)) {
      bathrooms = bathrooms ?? parseIntCl(value);
    } else if (/^superficie total$/i.test(label)) {
      square_meters = square_meters ?? parseIntCl(value);
    } else if (/^superficie útil$/i.test(label)) {
      useful_square_meters = useful_square_meters ?? parseIntCl(value);
    } else {
      addFeature(label, value);
    }
  };
  $(".ui-vpp-striped-specs__row").each((_, el) => {
    handleSpec(
      $(el).find("th").first().text().trim(),
      $(el).find("td").first().text().trim()
    );
  });
  // Bloque destacado "Características del inmueble" (key-values con ícono).
  // Algunos atributos solo aparecen aquí o con otro nombre (ej: Quincho).
  $(".ui-vpp-highlighted-specs__key-value__labels__key-value").each((_, el) => {
    const spans = $(el).find("span");
    const label = spans.first().text().trim().replace(/:\s*$/, "");
    const value = spans.last().text().trim();
    handleSpec(label, value);
  });

  // Fallback dormitorios/baños/m² desde los specs destacados ("5 dorm.", "5 baños", "820 m² totales")
  $(".ui-pdp-highlighted-specs-res span").each((_, el) => {
    const text = $(el).text().trim();
    let m: RegExpMatchArray | null;
    if (bedrooms == null && (m = text.match(/(\d+)\s*dorm/i))) bedrooms = parseInt(m[1]);
    if (bathrooms == null && (m = text.match(/(\d+)\s*baño/i))) bathrooms = parseInt(m[1]);
    if (square_meters == null && (m = text.match(/([\d.]+)\s*m²/i)))
      square_meters = parseInt(m[1].replace(/\./g, ""));
  });

  // Descripción completa de la ficha (no los meta tags truncados)
  const description =
    $(".ui-pdp-description__content").first().text().trim().slice(0, 8000) ||
    $("meta[property='og:description']").attr("content") ||
    $("meta[name='description']").attr("content") ||
    null;

  // Fotos de la galería: patrón D_NQ_NP exclusivo de las fotos del aviso
  // (miniaturas de avisos recomendados y avatares usan otros patrones)
  const photoUrls: string[] = [];
  const picRegex = /https:\/\/http2\.mlstatic\.com\/D_NQ_NP_[^"'\\\s)]+?\.(?:jpg|jpeg|png|webp)/g;
  for (const m of html.matchAll(picRegex)) {
    if (!photoUrls.includes(m[0])) photoUrls.push(m[0]);
  }

  // Ubicación desde el breadcrumb: ... > Región > Comuna > Barrio
  const crumbs = $(".andes-breadcrumb__link")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t && t !== "...");
  let region: string | null = null;
  let commune: string | null = null;
  let zone: string | null = null;
  if (crumbs.length >= 3) {
    region = crumbs[crumbs.length - 3];
    commune = crumbs[crumbs.length - 2];
    zone = crumbs[crumbs.length - 1];
  }

  // Dirección textual de la sección "Ubicación" (el texto negro, no los avisos grises)
  const address_scraped =
    $("#location_and_points .ui-pdp-media__title.ui-pdp-color--BLACK span").first().text().trim() ||
    $("#location_and_points .ui-pdp-media__title").filter((_, el) => $(el).text().includes(",")).first().text().trim() ||
    null;

  // Corredora y código de referencia (para seguimiento del aviso). Viven en el
  // JSON embebido del componente seller_profile de la página. Si el portal no
  // trae el código, muchas corredoras lo ponen en la descripción.
  const broker_name =
    html.match(/"seller_name":\{"title":\{"text":"([^"]+)"/)?.[1] || null;
  const external_reference =
    html.match(/"Código de la propiedad"[\s\S]{0,300}?"subtitles":\[\{"text":"([^"]+)"/)?.[1] ||
    extractReferenceFromDescription(description) ||
    null;

  // Subtítulo del aviso: "Casa en Venta  |  Publicado hace 2 meses" →
  // operación (venta/arriendo) y antigüedad de la publicación.
  const subtitle = $(".ui-pdp-subtitle").first().text().trim();
  const operation = detectOperation(subtitle || title || "");
  const published_ago =
    subtitle.match(/publicado\s+(.+)$/i)?.[0]?.trim().replace(/\s+/g, " ") || null;

  // Número de publicación del portal ("Publicación #3914632576"). Suele venir
  // en el HTML; si no, el caller lo deriva del MLC de la URL.
  const portal_publication_number =
    html.match(/Publicaci[oó]n\s*#?\s*(\d{6,})/i)?.[1] ||
    html.match(/"item_id"\s*:\s*"MLC(\d+)"/)?.[1] ||
    null;

  // Coordenadas reales: el mapa estático de Google del aviso trae center=lat,lng
  // (extractLatLng suele capturar el centro del mapa de Chile, no el aviso)
  let latitude: number | null = null;
  let longitude: number | null = null;
  const mapMatch = html.match(
    /maps\.googleapis\.com\/maps\/api\/staticmap\?[^"']*?center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/i
  );
  if (mapMatch) {
    latitude = parseFloat(mapMatch[1]);
    longitude = parseFloat(mapMatch[2]);
  } else {
    const g = extractLatLng(html);
    latitude = g.lat;
    longitude = g.lng;
  }

  return {
    title,
    description,
    price,
    currency: currency ?? undefined,
    bedrooms,
    bathrooms,
    square_meters,
    useful_square_meters,
    region,
    commune,
    zone,
    address_scraped,
    latitude,
    longitude,
    cover_photo_url: photoUrls[0] || null,
    photo_urls: photoUrls.slice(0, 30),
    features: features.slice(0, 60),
    broker_name,
    external_reference,
    operation,
    portal_publication_number,
    published_ago,
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
          useful_square_meters: partial.useful_square_meters ?? null,
          region: partial.region ?? null,
          commune: partial.commune ?? null,
          zone: partial.zone ?? null,
          address_scraped: partial.address_scraped ?? null,
          latitude: partial.latitude ?? null,
          longitude: partial.longitude ?? null,
          cover_photo_url: partial.cover_photo_url ?? null,
          photo_urls: partial.photo_urls ?? [],
          features: partial.features ?? [],
          broker_name: partial.broker_name ?? null,
          external_reference: partial.external_reference ?? null,
          operation: partial.operation ?? detectOperation(url),
          portal_publication_number:
            partial.portal_publication_number ?? mlId.replace(/^MLC/i, ""),
          published_ago: partial.published_ago ?? null,
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
  const partial = site === "mercadolibre" ? scrapeMLPage($, html) : scrapeGeneric($, html);

  // Completar la galería: la página solo trae las primeras fotos, el modal
  // de galería tiene todas. Se conserva la foto de portada del SSR al frente.
  if (site === "mercadolibre") {
    const mlId = extractMLId(url);
    if (mlId) {
      const galleryPhotos = await fetchMLGalleryPhotos(mlId);
      if (galleryPhotos.length > (partial.photo_urls?.length ?? 0)) {
        const coverId = partial.cover_photo_url?.match(/\d{6}-MLC\d+(?:_\d{6})?/)?.[0];
        if (coverId) {
          const coverUrl = `https://http2.mlstatic.com/D_NQ_NP_${coverId}-F.webp`;
          const idx = galleryPhotos.indexOf(coverUrl);
          if (idx > 0) {
            galleryPhotos.splice(idx, 1);
            galleryPhotos.unshift(coverUrl);
          }
        }
        partial.photo_urls = galleryPhotos;
        partial.cover_photo_url = galleryPhotos[0];
      }
    }
  }

  return {
    title: partial.title ?? null,
    description: partial.description ?? null,
    price: partial.price ?? null,
    currency: partial.currency ?? null,
    bedrooms: partial.bedrooms ?? null,
    bathrooms: partial.bathrooms ?? null,
    square_meters: partial.square_meters ?? null,
    useful_square_meters: partial.useful_square_meters ?? null,
    region: partial.region ?? null,
    commune: partial.commune ?? null,
    zone: partial.zone ?? null,
    address_scraped: partial.address_scraped ?? null,
    latitude: partial.latitude ?? null,
    longitude: partial.longitude ?? null,
    cover_photo_url: partial.cover_photo_url ?? null,
    photo_urls: partial.photo_urls ?? [],
    features: partial.features ?? [],
    broker_name: partial.broker_name ?? null,
    external_reference:
      partial.external_reference ??
      extractReferenceFromDescription(partial.description ?? null),
    operation: partial.operation ?? detectOperation(url),
    portal_publication_number:
      partial.portal_publication_number ??
      extractMLId(url)?.replace(/^MLC/i, "") ??
      null,
    published_ago: partial.published_ago ?? null,
    source_site: site,
  };
}
