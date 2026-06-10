import type { CheerioAPI } from "cheerio";
import type { ImportPreview } from "../types";
import {
  isIdealistaImageUrl,
  toIdealistaHighQuality,
} from "../../scrapers/idealista";
import { PhotoCollector } from "../../scrapers/image-utils";
import {
  externalIdFromUrl,
  findJsonLdByType,
  firstText,
  getMeta,
  parseAreaString,
  parseBathrooms,
  parseBedrooms,
  parsePriceString,
} from "../parse-utils";
import { detectAdvertiserFromHtml } from "../../particulares/idealista-advertiser-detector";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos que refleja el JSON embebido de Idealista. Basado en el schema real de
// la API de Idealista (y del HTML embebido). Campos opcionales porque no todos
// los listados los incluyen.
// ─────────────────────────────────────────────────────────────────────────────
type IdealistaListing = {
  propertyCode?: string;
  externalReference?: string;
  price?: number;
  priceInfo?: { price?: { amount?: number } };
  size?: number;
  rooms?: number;
  bathrooms?: number;
  operation?: string;
  propertyType?: string;
  address?: string;
  province?: string;
  municipality?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  floor?: string;
  exterior?: boolean;
  hasLift?: boolean;
  description?: string;
  url?: string;
  suggestedTexts?: { title?: string; subtitle?: string };
  multimedia?: {
    images?: Array<{ url?: string; tag?: string }>;
    virtual3DTours?: unknown[];
  };
  features?: {
    hasSwimmingPool?: boolean;
    hasTerrace?: boolean;
    hasAirConditioning?: boolean;
    hasBoxRoom?: boolean;
    hasGarden?: boolean;
  };
  parkingSpace?: {
    hasParkingSpace?: boolean;
    isParkingSpaceIncludedInPrice?: boolean;
  };
  detailedType?: { typology?: string };
};

// ─────────────────────────────────────────────────────────────────────────────
// Busca el JSON de la ficha embebido en los <script> inline de la página.
// Idealista inyecta window.listingPageData / window.adData / initialProps / etc.
// con el objeto completo de la propiedad. Si no lo encuentra, devuelve null y
// el extractor cae a los selectores DOM.
// ─────────────────────────────────────────────────────────────────────────────
function findEmbeddedListing($: CheerioAPI): IdealistaListing | null {
  const scripts: string[] = [];
  $("script:not([src])").each((_, el) => {
    const txt = $(el).contents().text();
    if (txt && txt.includes("propertyCode") && txt.includes("multimedia")) {
      scripts.push(txt);
    }
  });

  for (const src of scripts) {
    // Intenta extraer el primer objeto JSON que contenga `propertyCode`.
    // Buscamos el patrón `{"propertyCode"` o `{...,"propertyCode":` y tomamos
    // el JSON completo que empieza ahí.
    const startIdx = src.indexOf('"propertyCode"');
    if (startIdx === -1) continue;

    // Retrocede hasta encontrar la `{` de apertura del objeto.
    let objStart = startIdx;
    while (objStart > 0 && src[objStart] !== "{") objStart--;
    if (objStart < 0) continue;

    // Avanza buscando el `}` de cierre equilibrado.
    let depth = 0;
    let objEnd = objStart;
    for (let i = objStart; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          objEnd = i;
          break;
        }
      }
    }
    if (objEnd === objStart) continue;

    try {
      const obj = JSON.parse(src.slice(objStart, objEnd + 1));
      if (obj && typeof obj.propertyCode === "string") return obj as IdealistaListing;
    } catch {
      // JSON malformado — seguimos buscando en el siguiente script.
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapea el objeto de listing al shape de ImportPreview.
// ─────────────────────────────────────────────────────────────────────────────
function listingToPreview(
  listing: IdealistaListing,
  sourceUrl: string,
): ImportPreview {
  const warnings: string[] = [];

  const price =
    listing.price ??
    listing.priceInfo?.price?.amount ??
    null;

  const title =
    listing.suggestedTexts?.title ??
    null;

  const description = listing.description ?? null;

  // Zona: lo más específico primero (distrito > municipio > provincia).
  // Ej.: en Madrid capital queremos "Retiro", no "Madrid".
  const zone = listing.district ?? listing.municipality ?? listing.province ?? null;
  const addressParts = [listing.address, listing.municipality, listing.province].filter(Boolean);
  const address = addressParts.length ? addressParts.join(", ") : null;

  const operation = listing.operation === "rent" ? "rent" : "sale";

  // Fotos: `multimedia.images[].url` en formato WEB_LISTING-M → upgrade a
  // WEB_DETAIL_TOP-XL-L con el helper del scraper de imágenes.
  const collector = new PhotoCollector();
  for (const img of listing.multimedia?.images ?? []) {
    if (!img.url) continue;
    if (!isIdealistaImageUrl(img.url)) continue;
    collector.add(toIdealistaHighQuality(img.url), img.tag ?? undefined);
  }
  const photos = collector.toArray();

  // Features: combina booleanos del objeto `features` + campos raíz.
  const featureSet = new Set<string>();
  const f = listing.features;
  if (f) {
    if (f.hasAirConditioning) featureSet.add("Aire acondicionado");
    if (f.hasTerrace) featureSet.add("Terraza");
    if (f.hasSwimmingPool) featureSet.add("Piscina");
    if (f.hasBoxRoom) featureSet.add("Trastero");
    if (f.hasGarden) featureSet.add("Jardín");
  }
  if (listing.hasLift) featureSet.add("Ascensor");
  if (listing.exterior) featureSet.add("Exterior");
  if (listing.parkingSpace?.hasParkingSpace) featureSet.add("Garaje");

  // Atributos adicionales (sin campo directo en NormalizedProperty).
  const rawAttributes: Record<string, string | number | null> = {};
  if (listing.floor) rawAttributes["Planta"] = listing.floor;
  if (listing.detailedType?.typology) rawAttributes["Tipología"] = listing.detailedType.typology;
  if (listing.propertyCode) rawAttributes["propertyCode"] = listing.propertyCode;
  if (listing.externalReference) rawAttributes["externalReference"] = listing.externalReference;
  if (listing.latitude) rawAttributes["latitude"] = listing.latitude;
  if (listing.longitude) rawAttributes["longitude"] = listing.longitude;
  if (listing.parkingSpace?.isParkingSpaceIncludedInPrice != null)
    rawAttributes["garagePriceIncluded"] = String(listing.parkingSpace.isParkingSpaceIncludedInPrice);

  if (!title) warnings.push("título no detectado");
  if (price === null) warnings.push("precio no detectado");
  if (photos.length === 0)
    warnings.push("sin fotos en multimedia.images — puede ser listado de prueba o sin galería");

  return {
    portal: "idealista",
    sourceUrl,
    externalReference: listing.propertyCode
      ? `idealista-${listing.propertyCode}`
      : externalIdFromUrl("idealista", sourceUrl),
    title,
    description,
    operation,
    stay: null,
    price,
    currency: "EUR",
    bedrooms: listing.rooms ?? null,
    bathrooms: listing.bathrooms ?? null,
    squareMeters: listing.size ?? null,
    zone,
    address,
    features: Array.from(featureSet),
    latitude: typeof listing.latitude === "number" ? listing.latitude : null,
    longitude: typeof listing.longitude === "number" ? listing.longitude : null,
    photos,
    rawAttributes,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback: sin JSON embebido → DOM / og:meta / JSON-LD.
// ─────────────────────────────────────────────────────────────────────────────
function extractFromDom($: CheerioAPI, sourceUrl: string): ImportPreview {
  const warnings: string[] = [
    "JSON embebido no encontrado — extrayendo de DOM (menos preciso)",
  ];

  const ogTitle = getMeta($, "og:title");
  const ogDesc = getMeta($, "og:description");

  const title =
    firstText($, [".main-info__title-main", "h1.main-info__title"]) ??
    ogTitle ??
    null;
  const description =
    firstText($, [".comment p", ".comment", "[data-comment]"]) ??
    ogDesc ??
    null;

  let price: number | null = null;
  let currency: string | null = null;
  const priceText = firstText($, [".info-data-price", ".price", ".info-features__price"]);
  if (priceText) {
    price = parsePriceString(priceText);
    if (/€/.test(priceText)) currency = "EUR";
  }
  if (price === null) {
    const metaPrice = getMeta($, "product:price:amount");
    if (metaPrice) price = parsePriceString(metaPrice);
    currency = currency ?? getMeta($, "product:price:currency");
  }
  if (price === null) {
    const ld = findJsonLdByType($, ["Product"]);
    if (ld && typeof ld.offers === "object" && ld.offers) {
      const o = ld.offers as Record<string, unknown>;
      const p = typeof o.price === "number" || typeof o.price === "string" ? String(o.price) : null;
      price = parsePriceString(p);
      if (typeof o.priceCurrency === "string") currency = o.priceCurrency;
    }
  }

  const detailsText = $(".info-features").text();
  // Fallback amplio: texto completo del body para buscar m²/habs/baños
  // cuando los selectores específicos no existen (caso típico del HTML
  // archivado por Wayback, que es SSR sin la hidratación React completa).
  const bodyText = $("body").text();

  const squareMeters =
    parseAreaString(detailsText) ??
    parseAreaString(description ?? "") ??
    parseAreaString(title ?? "") ??
    parseAreaString(bodyText);
  const bedrooms =
    parseBedrooms(detailsText) ??
    parseBedrooms(description ?? "") ??
    parseBedrooms(bodyText);
  const bathrooms =
    parseBathrooms(detailsText) ??
    parseBathrooms(description ?? "") ??
    parseBathrooms(bodyText);

  const addressLine = firstText($, [
    ".main-info__title-minor",
    "#headerMap",
    ".location-data",
  ]);
  const address = addressLine ?? null;
  const zone = addressLine ? (addressLine.split(",")[0]?.trim() ?? null) : null;

  // Detección de operación. La URL `/inmueble/<id>/` es la misma para
  // alquiler y venta, así que NO es buen indicador. Mejor mirar el texto
  // visible: el título y el og:description suelen empezar con "Alquiler de
  // piso..." o "Venta de piso..." según corresponda. Como último recurso,
  // un precio en "€/mes" indica alquiler.
  let operation: "rent" | "sale" | null = null;
  const operationCorpus = [title, description, ogTitle, ogDesc, priceText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\balquile[rt]\b|\barrendam|€\s*\/\s*mes|\beur\s*\/\s*mes/i.test(operationCorpus)) {
    operation = "rent";
  } else if (/\bventa\b|\bcompra\b|\bvende\b|\ben venta\b/i.test(operationCorpus)) {
    operation = "sale";
  } else if (/\/alquiler-/i.test(sourceUrl)) {
    operation = "rent";
  } else if (/\/venta-/i.test(sourceUrl)) {
    operation = "sale";
  }

  const featureSet = new Set<string>();
  $(".details-property_features li, .details-property-feature li").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt) featureSet.add(txt);
  });

  // Fotos via CDN (scraper de imágenes).
  const collector = new PhotoCollector();
  $("img").each((_, el) => {
    const $el = $(el);
    const candidates = [
      $el.attr("data-original"),
      $el.attr("data-src"),
      $el.attr("src"),
    ];
    for (const c of candidates) {
      if (!c) continue;
      if (isIdealistaImageUrl(c)) {
        collector.add(toIdealistaHighQuality(c), $el.attr("alt"));
        break;
      }
    }
  });
  $("source").each((_, el) => {
    const srcset = $(el).attr("srcset") ?? "";
    for (const part of srcset.split(",")) {
      const u = part.trim().split(/\s+/)[0];
      if (u && isIdealistaImageUrl(u)) collector.add(toIdealistaHighQuality(u));
    }
  });

  // Fallback adicional: cuando el HTML viene de Wayback Machine, las fotos
  // del slider no están en <img>/<source> sino en una variable JS inline
  // `multimediaCarrousel: { multimedias: [...] }`. Extraemos las URLs
  // `img\d+.idealista.com/blur/...` con un regex sobre el HTML raw.
  const rawHtml = $.html();
  if (/multimediaCarrousel/.test(rawHtml)) {
    const carrouselRe =
      /https?:\/\/img\d*\.idealista\.com\/blur\/[A-Z_-]+\/[^"'\s)>]+\.(?:jpe?g|webp|png)/gi;
    let m: RegExpExecArray | null;
    while ((m = carrouselRe.exec(rawHtml)) !== null) {
      const u = m[0];
      if (isIdealistaImageUrl(u)) collector.add(toIdealistaHighQuality(u));
    }
  }

  const photos = collector.toArray();

  if (!title) warnings.push("título no detectado");
  if (price === null) warnings.push("precio no detectado");
  if (photos.length === 0)
    warnings.push("sin fotos — Idealista puede haber servido captcha o bloqueo");

  return {
    portal: "idealista",
    sourceUrl,
    externalReference: externalIdFromUrl("idealista", sourceUrl),
    title,
    description,
    operation,
    stay: null,
    price,
    currency: currency ?? "EUR",
    bedrooms,
    bathrooms,
    squareMeters,
    zone,
    address,
    features: Array.from(featureSet),
    latitude: null,
    longitude: null,
    photos,
    rawAttributes: {},
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point del extractor de Idealista.
// ─────────────────────────────────────────────────────────────────────────────
export async function extractIdealista(
  $: CheerioAPI,
  sourceUrl: string,
  options?: { proxyUrl?: string }
): Promise<ImportPreview> {
  const embedded = findEmbeddedListing($);
  const preview = embedded
    ? listingToPreview(embedded, sourceUrl)
    : extractFromDom($, sourceUrl);

  // Detectar particular vs profesional desde el HTML (campo
  // `adProfessionalName`). Más fiable que el endpoint AJAX (que DataDome
  // bloquea) y sin coste de request extra.
  const advertiserInfo = detectAdvertiserFromHtml($.html());

  return {
    ...preview,
    advertiserInfo,
  };
}
