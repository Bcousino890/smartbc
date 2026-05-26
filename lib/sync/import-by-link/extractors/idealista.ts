import type { CheerioAPI } from "cheerio";
import type { ImportPreview } from "../types";
import { extractIdealistaPhotos } from "../../scrapers/idealista";
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

// Extractor de fichas de Idealista. Combina:
// - Schema.org JSON-LD (suelen exponer `Product` con precio y `Place` con
//   address embebida).
// - <meta og:*>.
// - Selectores CSS conocidos como fallback.
// - extractIdealistaPhotos para la galería (usa CDN + JSON-LD).

const FEATURE_KEYS = [
  "Aire acondicionado",
  "Calefacción",
  "Ascensor",
  "Terraza",
  "Balcón",
  "Piscina",
  "Garaje",
  "Trastero",
  "Amueblado",
  "Armarios empotrados",
  "Jardín",
  "Cocina equipada",
  "Suelo de gres",
  "Suelo radiante",
  "Domótica",
  "Vistas al mar",
  "Vistas a la montaña",
  "Orientación sur",
  "Exterior",
  "Interior",
];

export function extractIdealista(
  $: CheerioAPI,
  sourceUrl: string,
): ImportPreview {
  const warnings: string[] = [];

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

  // Precio: Idealista lo muestra en `.info-data-price` con formato "1.250.000 €"
  // y a veces lo expone como meta `product:price:amount`.
  let price: number | null = null;
  let currency: string | null = null;
  const priceText =
    firstText($, [
      ".info-data-price",
      ".price",
      ".info-features__price",
    ]);
  if (priceText) {
    price = parsePriceString(priceText);
    if (/€/.test(priceText)) currency = "EUR";
  }
  if (price === null) {
    const metaPrice = getMeta($, "product:price:amount");
    if (metaPrice) price = parsePriceString(metaPrice);
    currency = currency ?? getMeta($, "product:price:currency");
  }
  // Fallback: Schema.org Product offer.
  if (price === null) {
    const offer = findJsonLdByType($, ["Product"]);
    if (offer && typeof offer.offers === "object" && offer.offers) {
      const o = offer.offers as Record<string, unknown>;
      const p = typeof o.price === "number" || typeof o.price === "string" ? String(o.price) : null;
      price = parsePriceString(p);
      if (typeof o.priceCurrency === "string") currency = o.priceCurrency;
    }
  }

  // Detalle (m², habitaciones, baños) está en `.info-features` con varios <span>.
  const detailsText = $(".info-features").text();
  const squareMeters =
    parseAreaString(detailsText) ?? parseAreaString(description ?? "") ?? parseAreaString(title ?? "");
  const bedrooms = parseBedrooms(detailsText) ?? parseBedrooms(description ?? "");
  const bathrooms = parseBathrooms(detailsText) ?? parseBathrooms(description ?? "");

  // Dirección: header tiene un bloque "Ubicación".
  const addressLine = firstText($, [
    ".main-info__title-minor",
    "#headerMap",
    ".location-data",
  ]);
  const address = addressLine ?? null;
  const zone = addressLine ? addressLine.split(",")[0]?.trim() ?? null : null;

  // Operación: el path de Idealista marca venta vs alquiler.
  let operation: "rent" | "sale" | null = null;
  if (/\/inmueble\//.test(sourceUrl) || /\/venta-/i.test(sourceUrl)) operation = "sale";
  if (/\/alquiler-/i.test(sourceUrl)) operation = "rent";

  // Features: Idealista las lista en `.details-property_features li`.
  const featureSet = new Set<string>();
  $(".details-property_features li, .details-property-feature li").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt) featureSet.add(txt);
  });
  // Si no encontró el contenedor, escanea texto plano del body por keywords.
  if (featureSet.size === 0) {
    const body = $("body").text();
    for (const kw of FEATURE_KEYS) {
      if (body.toLowerCase().includes(kw.toLowerCase())) featureSet.add(kw);
    }
  }

  const photos = extractIdealistaPhotos($, sourceUrl);

  if (!title) warnings.push("título no detectado");
  if (price === null) warnings.push("precio no detectado");
  if (photos.length === 0)
    warnings.push("sin fotos — Idealista puede haber servido página de captcha o bloqueo");

  return {
    portal: "idealista",
    sourceUrl,
    externalReference: externalIdFromUrl("idealista", sourceUrl),
    title,
    description,
    operation,
    stay: null,
    price,
    currency,
    bedrooms,
    bathrooms,
    squareMeters,
    zone,
    address,
    features: Array.from(featureSet),
    photos,
    rawAttributes: {},
    warnings,
  };
}
