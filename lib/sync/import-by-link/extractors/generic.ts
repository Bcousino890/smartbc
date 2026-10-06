import type { CheerioAPI } from "cheerio";
import type { ImportPreview, ImportPortal } from "../types";
import {
  externalIdFromUrl,
  findJsonLdByType,
  getMeta,
  parseAreaString,
  parseBathrooms,
  parseBedrooms,
  parsePriceString,
} from "../parse-utils";
import { collectUrlStrings } from "../../scrapers/image-utils";

// Extractor genérico: usa Open Graph y Schema.org JSON-LD para portales no
// soportados específicamente o como fallback cuando el extractor dedicado
// no encuentra datos. NUNCA es exhaustivo — su trabajo es cubrir lo básico
// (título, descripción, imagen) para que el admin tenga algo que editar.

export function extractGeneric(
  $: CheerioAPI,
  sourceUrl: string,
  portal: ImportPortal,
): ImportPreview {
  const warnings: string[] = [];

  const ogTitle = getMeta($, "og:title");
  const ogDesc = getMeta($, "og:description");
  const ogImage = getMeta($, "og:image");
  const title = ogTitle ?? ($("h1").first().text().trim() || null);
  // Webs de promotoras/agencias (Google Sites, Wix, WordPress…) muchas veces
  // no traen og:description ni JSON-LD: los datos están en el texto visible
  // ("Tamaño: 130 m²", "3 habitaciones"…). Sin esto la vista previa salía
  // con título y una foto, y todo lo demás vacío.
  const blocks = visibleTextBlocks($);
  const visibleText = blocks.join("\n");
  const description =
    ogDesc ?? getMeta($, "description") ?? descriptionFromBlocks(blocks, title);

  const jsonLd =
    findJsonLdByType($, ["RealEstateListing", "Residence", "Apartment", "House", "Accommodation", "Product"]) ??
    null;

  let price: number | null = null;
  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let squareMeters: number | null = null;
  let zone: string | null = null;
  let address: string | null = null;
  let currency: string | null = null;

  if (jsonLd) {
    const offers = jsonLd["offers"];
    if (offers && typeof offers === "object") {
      const o = offers as Record<string, unknown>;
      const p = typeof o.price === "string" || typeof o.price === "number" ? String(o.price) : null;
      price = parsePriceString(p);
      currency = typeof o.priceCurrency === "string" ? o.priceCurrency : null;
    }
    const addr = jsonLd["address"];
    if (addr && typeof addr === "object") {
      const a = addr as Record<string, unknown>;
      const parts = [a.streetAddress, a.addressLocality, a.addressRegion]
        .filter((x): x is string => typeof x === "string");
      address = parts.join(", ") || null;
      zone = typeof a.addressLocality === "string" ? a.addressLocality : null;
    }
    const fr = jsonLd["floorSize"];
    if (fr && typeof fr === "object") {
      const v = (fr as Record<string, unknown>).value;
      if (typeof v === "number") squareMeters = Math.round(v);
      else if (typeof v === "string") squareMeters = parseAreaString(v);
    }
    if (typeof jsonLd["numberOfRooms"] === "number")
      bedrooms = jsonLd["numberOfRooms"] as number;
    if (typeof jsonLd["numberOfBathroomsTotal"] === "number")
      bathrooms = jsonLd["numberOfBathroomsTotal"] as number;
  }

  // Fallback: parsear de la descripción si no salió del JSON.
  if (bedrooms === null)
    bedrooms = parseBedrooms(description) ?? parseBedrooms(title) ?? parseBedrooms(visibleText);
  if (bathrooms === null)
    bathrooms = parseBathrooms(description) ?? parseBathrooms(title) ?? parseBathrooms(visibleText);
  if (squareMeters === null)
    squareMeters =
      parseAreaString(description) ?? parseAreaString(title) ?? parseAreaString(visibleText);
  // Solo un importe pegado a "€": antes se cogía el PRIMER número de todo el
  // <body> (scripts incluidos), y en una web sin precio salía basura.
  if (price === null) price = euroPrice(description) ?? euroPrice(visibleText);

  // Fotos: og:image como mínimo + cualquier URL en el JSON-LD que parezca
  // imagen. El extractor por-portal hace el filtrado fino.
  const photoSet = new Set<string>();
  if (ogImage) photoSet.add(ogImage);
  if (jsonLd) {
    for (const url of collectUrlStrings(jsonLd)) {
      if (/\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(url)) photoSet.add(url);
    }
  }
  $("img").each((_, el) => {
    const src = $(el).attr("data-original") ?? $(el).attr("data-src") ?? $(el).attr("src");
    if (!src || !/^https?:\/\//.test(src)) return;
    // Iconos (redes sociales, logos pequeños) declaran su tamaño: fuera.
    const w = Number($(el).attr("width"));
    const h = Number($(el).attr("height"));
    if ((w && w < 120) || (h && h < 120)) return;
    if (/\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(src) || isImageCdnUrl(src)) {
      photoSet.add(src);
    }
  });

  if (!title) warnings.push("título no detectado — el portal puede requerir JS");
  if (price === null) warnings.push("precio no detectado");
  if (photoSet.size === 0) warnings.push("no se encontraron fotos");

  return {
    portal,
    sourceUrl,
    externalReference: externalIdFromUrl(portal, sourceUrl),
    title,
    description,
    operation: null,
    stay: null,
    price,
    currency,
    bedrooms,
    bathrooms,
    squareMeters,
    zone,
    address,
    features: [],
    latitude: null,
    longitude: null,
    photos: Array.from(photoSet).map((url) => ({ url })),
    rawAttributes: {},
    warnings,
  };
}

// Bloques de texto visibles de la página, uno por párrafo/elemento de lista/
// título (sin scripts, estilos ni navegación). Los <span> partidos dentro de
// un mismo párrafo ("1"+"30 m²") se leen juntos.
function visibleTextBlocks($: CheerioAPI): string[] {
  const root = $("body").clone();
  root.find("script, style, noscript, template, svg, nav, header, footer").remove();
  const out: string[] = [];
  root.find("p, li, h1, h2, h3, h4, td, dd").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && !out.includes(t)) out.push(t);
  });
  return out;
}

// Descripción de respaldo: los párrafos con frases de verdad (≥ 60 letras),
// sin repetir el título, hasta ~1500 caracteres.
function descriptionFromBlocks(blocks: string[], title: string | null): string | null {
  const picked: string[] = [];
  let len = 0;
  for (const b of blocks) {
    if (b.length < 60 || b === title) continue;
    picked.push(b);
    len += b.length;
    if (len > 1500) break;
  }
  return picked.length ? picked.join("\n\n") : null;
}

// "450.000 €", "€ 1.200", "2.400 €/mes" → número. Sin "€" no es un precio.
function euroPrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const m =
    text.match(/(\d[\d.,\s]{0,14}\d|\d)\s*(?:€|eur(?:os?)?\b)/i) ??
    text.match(/€\s*(\d[\d.,\s]{0,14}\d|\d)/);
  if (!m) return null;
  const n = parsePriceString(m[1]);
  return n !== null && n >= 100 ? n : null;
}

// CDNs que sirven imágenes sin extensión en la URL (Google Sites/Photos…).
function isImageCdnUrl(src: string): boolean {
  try {
    const host = new URL(src).hostname;
    return /(^|\.)(googleusercontent\.com|ggpht\.com)$/.test(host);
  } catch {
    return false;
  }
}
