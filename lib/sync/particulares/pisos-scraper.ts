import "server-only";
import { normalizeSpanishPhone } from "./idealista-advertiser-detector";

// ─────────────────────────────────────────────────────────────────────────────
// Scraper de pisos.com — FUENTE ALTERNATIVA de teléfonos de particulares.
//
// A diferencia de Idealista (teléfono tras DataDome + proxy residencial), pisos.com incrusta el teléfono del anunciante DIRECTAMENTE
// en el HTML de la ficha, sin captcha ni anti-bot:
//   ...,"telefono":"622383562","caracteristicasInmueble":...
// Verificado: 8/8 fichas de particulares exponían el teléfono. Esta es la vía
// "estilo Casafari": agregar el mismo tipo de anuncio (particular en Madrid)
// desde el portal que menos lo esconde.
//
// El extractor es una función PURA (recibe html + url) para poder testearla sin
// red. La orquestación (paginación, fetch, upsert) vive en el cron scrape-pisos.
// ─────────────────────────────────────────────────────────────────────────────

export type PisosListing = {
  externalId: string;        // p.ej. "pisos-63382107681"
  sourceUrl: string;
  phone: string | null;      // +34XXXXXXXXX o null
  operation: "rent" | "sale" | null;
  price: number | null;
  title: string | null;
  address: string | null;
  zone: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  isProfessional: boolean | null;
  description: string | null;
};

// El ID numérico del anuncio va al final del slug de la URL:
//   /alquilar/apartamento-abrantes28025-63382107681_109800/  → 63382107681
export function pisosIdFromUrl(url: string): string | null {
  const m = url.match(/[-_](\d{9,})_\d+\/?$/) ?? url.match(/(\d{9,})/);
  return m?.[1] ?? null;
}

function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // "1.025 €/mes" | "250.000 €" → 1025 | 250000
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Extrae los datos de una ficha de pisos.com a partir de su HTML.
 * Devuelve null si no parece una ficha válida (sin ID).
 */
export function extractPisosListing(html: string, sourceUrl: string): PisosListing | null {
  const id = pisosIdFromUrl(sourceUrl);
  if (!id) return null;

  // Teléfono: campo "telefono":"..." del blob JSON embebido.
  let phone: string | null = null;
  const telMatch = html.match(/"telefono"\s*:\s*"([+\d][\d\s]{6,15})"/);
  if (telMatch?.[1]) phone = normalizeSpanishPhone(telMatch[1]);

  // Habitaciones / baños / superficie del blob.
  const num = (key: string): number | null => {
    const m = html.match(new RegExp(`"${key}"\\s*:\\s*"?(\\d{1,4})`));
    return m?.[1] ? Number.parseInt(m[1], 10) : null;
  };
  const bedrooms = num("nHabitaciones");
  const bathrooms = num("nBanios");
  const squareMeters = num("superficieInmueble");

  // og:title trae título + operación + dirección + zona + precio:
  //  "Apartamento en alquiler en Avenida de Abrantes, 95, cerca de Calle Vía
  //   Lusitana en Abrantes por 1.025 €/mes"
  const ogTitle = html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<title>([^<]+)<\/title>/i)?.[1]
    ?? null;

  let operation: "rent" | "sale" | null = null;
  if (ogTitle && /\ben alquiler\b/i.test(ogTitle)) operation = "rent";
  else if (ogTitle && /\ben venta\b/i.test(ogTitle)) operation = "sale";
  else if (/\/alquilar\//.test(sourceUrl)) operation = "rent";
  else if (/\/comprar\//.test(sourceUrl)) operation = "sale";

  // Precio: "por X €" del og:title; fallback a €/mes suelto.
  let price: number | null = null;
  const priceMatch = ogTitle?.match(/por\s+([\d.,]+)\s*€/i) ?? ogTitle?.match(/([\d.,]+)\s*€/i);
  if (priceMatch?.[1]) price = parsePrice(priceMatch[1]);

  // Dirección: el tramo tras "en alquiler/venta en " hasta la primera coma+zona
  // o "cerca de" o "por". Zona: el nombre tras el último " en " antes de "por".
  let address: string | null = null;
  let zone: string | null = null;
  if (ogTitle) {
    const afterEn = ogTitle.match(/en (?:alquiler|venta) en (.+?)(?:,?\s+cerca de |,?\s+por |$)/i)?.[1];
    if (afterEn) address = afterEn.trim();
    // "... en Abrantes por 1.025" → zona = "Abrantes"
    const zoneMatch = ogTitle.match(/\ben ([^,]+?)\s+por\s+[\d.,]+\s*€/i);
    if (zoneMatch?.[1]) zone = zoneMatch[1].trim();
  }

  // Anunciante: pisos.com marca `tp=Particular` / `tp=Profesional` en cadenas
  // de tracking. Como filtramos por la sección /particulares/ del listado, por
  // defecto es particular, pero si detectamos Profesional lo marcamos.
  let isProfessional: boolean | null = null;
  if (/tp=Profesional/i.test(html)) isProfessional = true;
  else if (/tp=Particular/i.test(html)) isProfessional = false;

  // Descripción: meta description (resumen) — suele traer texto del anunciante.
  const description = html.match(/name=["']description["']\s+content=["']([^"']{20,})["']/i)?.[1]?.trim() ?? null;

  const title = ogTitle?.trim() ?? null;

  return {
    externalId: `pisos-${id}`,
    sourceUrl,
    phone,
    operation,
    price,
    title,
    address,
    zone,
    bedrooms,
    bathrooms,
    squareMeters,
    isProfessional,
    description,
  };
}

// Extrae las URLs de ficha de una página de listado de pisos.com.
export function extractPisosListingUrls(searchHtml: string): string[] {
  const seen = new Set<string>();
  const re = /\/(alquilar|comprar)\/[a-z0-9_-]+_\d+\//gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(searchHtml)) !== null) {
    seen.add(`https://www.pisos.com${m[0]}`);
  }
  return Array.from(seen);
}
