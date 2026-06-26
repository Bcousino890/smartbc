import type { CheerioAPI } from "cheerio";
import type { ImportPreview } from "../types";
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

/**
 * Extractor para yaencontre.com
 * Yaencontre embebe JSON-LD en el HTML (SingleFamilyResidence o similar).
 * Fallback a selectores CSS si el JSON-LD no está completo.
 */
export function extractYaencontre(
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
  let latitude: number | null = null;
  let longitude: number | null = null;
  const photos: Array<{ url: string; alt?: string }> = [];

  // Buscar JSON-LD de tipo SingleFamilyResidence (Yaencontre usa este schema)
  const jsonLd = findJsonLdByType($, ["SingleFamilyResidence"]);
  if (jsonLd && typeof jsonLd === "object") {
    const ld = jsonLd as Record<string, unknown>;

    // Título desde JSON-LD
    if (typeof ld.name === "string") {
      title = ld.name;
    }

    // Descripción
    if (typeof ld.description === "string") {
      description = ld.description;
    }

    // Precio
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
        address = addr.addressLocality;
      }
    }

    // Coordenadas geográficas
    if (ld.geo && typeof ld.geo === "object") {
      const geo = ld.geo as Record<string, unknown>;
      if (typeof geo.latitude === "number") {
        latitude = geo.latitude;
      } else if (typeof geo.latitude === "string") {
        latitude = parseFloat(geo.latitude);
      }
      if (typeof geo.longitude === "number") {
        longitude = geo.longitude;
      } else if (typeof geo.longitude === "string") {
        longitude = parseFloat(geo.longitude);
      }
    }

    // Habitaciones
    if (typeof ld.numberOfRooms === "number") {
      bedrooms = ld.numberOfRooms;
    } else if (typeof ld.numberOfRooms === "string") {
      bedrooms = parseBedrooms(ld.numberOfRooms);
    }

    // Fotos desde JSON-LD
    if (Array.isArray(ld.photo)) {
      for (const p of ld.photo) {
        if (typeof p === "string") {
          photos.push({ url: p });
        } else if (p && typeof p === "object") {
          const photo = p as Record<string, unknown>;
          if (typeof photo.contentUrl === "string") {
            photos.push({ url: photo.contentUrl });
          } else if (typeof photo.url === "string") {
            photos.push({ url: photo.url });
          }
        }
      }
    } else if (ld.photo && typeof ld.photo === "string") {
      photos.push({ url: ld.photo });
    }

    // Características desde additionalProperty
    if (Array.isArray(ld.additionalProperty)) {
      for (const prop of ld.additionalProperty) {
        if (prop && typeof prop === "object") {
          const p = prop as Record<string, unknown>;
          if (typeof p.name === "string" && typeof p.value === "string") {
            features.push(`${p.name}: ${p.value}`);
          } else if (typeof p.name === "string") {
            features.push(p.name);
          }
        }
      }
    }
  }

  // Fallback: si no encontramos el título en JSON-LD, buscarlo en meta/title
  if (!title) {
    title = getMeta($, "og:title") || getMeta($, "title");
    if (!title) {
      const titleEl = $("title").first();
      if (titleEl) {
        const full = titleEl.text().trim();
        // Yaencontre usa: "Título del inmueble · ID - yaencontre"
        const match = full.match(/^(.+?)\s+·\s+\d+\s+-\s+yaencontre/);
        if (match) {
          title = match[1].trim();
        }
      }
    }
  }

  // Fallback: descripción desde meta
  if (!description) {
    description = getMeta($, "og:description") || getMeta($, "description");
  }

  // Fallback: precio desde selector CSS "heading-text-l"
  if (!price) {
    const priceEl = $("p.heading-text-l").first();
    if (priceEl) {
      const text = priceEl.text();
      price = parsePriceString(text);
      const currencyMatch = text.match(/([€$£¥])/);
      if (currencyMatch) {
        currency = currencyMatch[1];
      }
    }
  }

  // Fallback: habitaciones desde selector CSS "icon-room"
  if (!bedrooms) {
    const bedEl = $(".icon-room span").first();
    if (bedEl) {
      bedrooms = parseBedrooms(bedEl.text());
    }
  }

  // Fallback: baños desde selector CSS "icon-bath"
  if (!bathrooms) {
    const bathEl = $(".icon-bath span").first();
    if (bathEl) {
      bathrooms = parseBathrooms(bathEl.text());
    }
  }

  // Fallback: metros desde selector CSS "icon-meter"
  if (!squareMeters) {
    const meterEl = $(".icon-meter span").first();
    if (meterEl) {
      squareMeters = parseAreaString(meterEl.text());
    }
  }

  // Fallback: dirección desde "details-address"
  if (!address) {
    const addrEl = $(".details-address").first();
    if (addrEl) {
      address = addrEl.text().trim();
    }
  }

  // Features desde selectores CSS (lista de características)
  if (features.length === 0) {
    $(".outstanding-equipment .feature").each((_, el) => {
      const text = $(el).find(".icon-text").text().trim();
      if (text) {
        features.push(text);
      }
    });
  }

  // Fotos: buscar en la galería principal
  if (photos.length === 0) {
    $(".gallery__panel img").each((_, el) => {
      const src = $(el).attr("src");
      const alt = $(el).attr("alt");
      if (src) {
        photos.push({ url: src, alt: alt || undefined });
      }
    });
  }

  // External ID desde el URL
  const externalReference = externalIdFromUrl("yaencontre", sourceUrl);

  // Zona: extraer del breadcrumb o de la dirección
  if (!zone) {
    // Yaencontre breadcrumb: Salamanca, Recoletos, etc.
    const breadcrumbEl = $(".breadcrumb-link li:nth-child(4) a").first();
    if (breadcrumbEl) {
      zone = breadcrumbEl.text().trim();
    }
  }

  return {
    portal: "yaencontre",
    sourceUrl,
    externalReference,
    title,
    description,
    operation: null, // Detectable desde la URL (venta/alquiler)
    stay: null,
    price,
    currency: currency || "EUR",
    bedrooms,
    bathrooms,
    squareMeters,
    zone,
    address,
    features,
    latitude,
    longitude,
    photos,
    rawAttributes: {},
    warnings,
  };
}
