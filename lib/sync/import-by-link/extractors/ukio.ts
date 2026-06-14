import type { CheerioAPI } from "cheerio";
import type { ImportPreview } from "../types";
import {
  externalIdFromUrl,
  findJsonLdByType,
  getMeta,
  parseAreaString,
  parseBathrooms,
  parseBedrooms,
  parsePriceString,
} from "../parse-utils";

/**
 * Extractor para ukio.com (apartamentos amueblados)
 * Ukio embebe JSON-LD (Apartment schema) y usa selectores CSS específicos.
 * IMPORTANTE: Ukio tiene una tarifa de gestión de 1000 EUR fijos que se agrega
 * al precio mensual. Se almacena en rawAttributes para mostrar al admin.
 */
function sanitizeUkioUrl(url: string): string {
  // Elimina referencias a "ukio" del URL manteniendo la estructura
  // Ejemplo: quitar parámetros de tracking o partes identificables de ukio
  try {
    const u = new URL(url);
    // Limpia parámetros de tracking comunes
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    u.searchParams.delete("utm_content");
    return u.toString();
  } catch {
    return url;
  }
}

export function extractUkio(
  $: CheerioAPI,
  sourceUrl: string,
): ImportPreview {
  const warnings: string[] = [];

  let title: string | null = null;
  let description: string | null = null;
  let price: number | null = null;
  let currency: string | null = null;
  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let squareMeters: number | null = null;
  let zone: string | null = null;
  let address: string | null = null;
  const features: string[] = [];
  const photos: Array<{ url: string; alt?: string }> = [];
  const rawAttributes: Record<string, string | number | null> = {
    managementFee: 1000, // Tarifa de gestión fija de Ukio en EUR
  };

  // Buscar JSON-LD de tipo Apartment
  const jsonLd = findJsonLdByType($, "Apartment");
  if (jsonLd && typeof jsonLd === "object") {
    const ld = jsonLd as Record<string, unknown>;

    // Título
    if (typeof ld.name === "string") {
      title = ld.name;
    }

    // Descripción
    if (typeof ld.description === "string") {
      description = ld.description;
    }

    // Precio desde offers
    if (ld.offers && typeof ld.offers === "object") {
      const offer = ld.offers as Record<string, unknown>;
      if (typeof offer.price === "number") {
        price = offer.price;
      } else if (typeof offer.price === "string") {
        price = parsePriceString(offer.price);
      }
      if (typeof offer.priceCurrency === "string") {
        currency = offer.priceCurrency;
      }
    }

    // Dirección
    if (ld.address && typeof ld.address === "object") {
      const addr = ld.address as Record<string, unknown>;
      if (typeof addr.addressLocality === "string") {
        zone = addr.addressLocality;
      }
      const parts = [
        addr.streetAddress,
        addr.addressLocality,
        addr.addressRegion,
      ]
        .filter((x): x is string => typeof x === "string");
      if (parts.length) {
        address = parts.join(", ");
      }
    }

    // Habitaciones
    if (typeof ld.numberOfRooms === "number") {
      bedrooms = ld.numberOfRooms;
    } else if (typeof ld.numberOfRooms === "string") {
      bedrooms = parseBedrooms(ld.numberOfRooms);
    }

    // Baños
    if (typeof ld.numberOfBathroomsTotal === "number") {
      bathrooms = ld.numberOfBathroomsTotal;
    } else if (typeof ld.numberOfBathroomsTotal === "string") {
      bathrooms = parseBathrooms(ld.numberOfBathroomsTotal);
    }

    // Área
    if (ld.floorSize && typeof ld.floorSize === "object") {
      const size = ld.floorSize as Record<string, unknown>;
      if (typeof size.value === "number") {
        squareMeters = Math.round(size.value);
      } else if (typeof size.value === "string") {
        squareMeters = parseAreaString(size.value);
      }
    } else if (typeof ld.floorSize === "number") {
      squareMeters = Math.round(ld.floorSize);
    } else if (typeof ld.floorSize === "string") {
      squareMeters = parseAreaString(ld.floorSize);
    }

    // Fotos desde JSON-LD
    if (Array.isArray(ld.image)) {
      for (const img of ld.image) {
        if (typeof img === "string") {
          photos.push({ url: img });
        } else if (img && typeof img === "object") {
          const imgObj = img as Record<string, unknown>;
          if (typeof imgObj.url === "string") {
            photos.push({ url: imgObj.url });
          } else if (typeof imgObj.contentUrl === "string") {
            photos.push({ url: imgObj.contentUrl });
          }
        }
      }
    } else if (typeof ld.image === "string") {
      photos.push({ url: ld.image });
    }

    // Características desde amenityFeature
    if (Array.isArray(ld.amenityFeature)) {
      for (const feat of ld.amenityFeature) {
        if (feat && typeof feat === "object") {
          const f = feat as Record<string, unknown>;
          if (typeof f.name === "string") {
            features.push(f.name);
          }
        }
      }
    }
  }

  // Fallback: título desde og:title o <h1>
  if (!title) {
    title = getMeta($, "og:title") || getMeta($, "title");
    if (!title) {
      const h1 = $("h1").first();
      if (h1) {
        title = h1.text().trim() || null;
      }
    }
  }

  // Fallback: descripción desde og:description
  if (!description) {
    description = getMeta($, "og:description") || getMeta($, "description");
  }

  // Fallback: precio desde selectores CSS típicos de Ukio
  if (!price) {
    // Buscar en elementos que contengan el precio
    const priceTexts = [
      $('[data-testid*="price"]').first().text(),
      $(".price").first().text(),
      $(".rental-price").first().text(),
      $("span.amount").first().text(),
    ].filter(Boolean);

    for (const text of priceTexts) {
      price = parsePriceString(text);
      if (price) break;
    }
  }

  // Fallback: habitaciones, baños, área desde selectores CSS
  if (!bedrooms) {
    const bedText = [
      $('[data-testid*="bedroom"]').first().text(),
      $(".bedrooms").first().text(),
      $('[aria-label*="habitacion"]').first().text(),
    ]
      .filter(Boolean)
      .join(" ");
    if (bedText) bedrooms = parseBedrooms(bedText);
  }

  if (!bathrooms) {
    const bathText = [
      $('[data-testid*="bathroom"]').first().text(),
      $(".bathrooms").first().text(),
      $('[aria-label*="bano"]').first().text(),
    ]
      .filter(Boolean)
      .join(" ");
    if (bathText) bathrooms = parseBathrooms(bathText);
  }

  if (!squareMeters) {
    const areaText = [
      $('[data-testid*="area"]').first().text(),
      $(".area").first().text(),
      $('[aria-label*="metros"]').first().text(),
    ]
      .filter(Boolean)
      .join(" ");
    if (areaText) squareMeters = parseAreaString(areaText);
  }

  // Fallback: dirección
  if (!address) {
    const addrText = $('[data-testid*="address"]').first().text() ||
      $(".address").first().text() || null;
    if (addrText) address = addrText.trim();
  }

  // Fotos: fallback desde atributos og:image o <img>
  if (photos.length === 0) {
    const ogImage = getMeta($, "og:image");
    if (ogImage) photos.push({ url: ogImage });

    $("img").each((_, el) => {
      const src =
        $(el).attr("data-src") ||
        $(el).attr("src") ||
        $(el).attr("data-original");
      if (src && /\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(src)) {
        const url = src.startsWith("http") ? src : null;
        if (url && !photos.some((p) => p.url === url)) {
          photos.push({ url });
        }
      }
    });
  }

  // Agregar tarifa de gestión de Ukio (1000 EUR) al precio
  if (price !== null) {
    price += 1000;
  }

  // External ID desde el URL
  const externalReference = externalIdFromUrl(sourceUrl);

  // Características especiales de Ukio si existen
  const ukioFeatures = $(".features li, .amenities li").each((_, el) => {
    const text = $(el).text().trim();
    if (text && !features.includes(text)) {
      features.push(text);
    }
  });

  // Advertencia sobre la tarifa de gestión
  warnings.push(
    "Precio incluye tarifa de gestión Ukio de 1000 EUR. Puedes editar este valor.",
  );

  if (!currency) currency = "EUR";

  return {
    portal: "ukio",
    sourceUrl: sanitizeUkioUrl(sourceUrl),
    externalReference,
    title,
    description,
    operation: null, // Ukio es principalmente alquiler, pero detectable desde contexto
    stay: null,
    price,
    currency,
    bedrooms,
    bathrooms,
    squareMeters,
    zone,
    address,
    features,
    latitude: null,
    longitude: null,
    photos,
    rawAttributes,
    warnings,
  };
}
