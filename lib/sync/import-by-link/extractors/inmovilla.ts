import type { CheerioAPI } from "cheerio";
import type { ImportPreview } from "../types";
import { extractInmovillaPhotos } from "../../scrapers/inmovilla";
import {
  getMeta,
  parseAreaString,
  parseBathrooms,
  parseBedrooms,
  parsePriceString,
} from "../parse-utils";

// Extractor para fichas de Inmovilla (CRM inmobiliario español, multi-tenant
// con dominio propio por agencia — deurbanitas.com, etc.). A diferencia de
// otros portales, Inmovilla expone los datos con selectores MUY consistentes
// entre agencias (misma plantilla base, solo cambia el tema visual), así que
// no hace falta la heurística laxa de Inmoweb: apoyamos directamente en el
// bloque `#fichapropiedad-bloquecaracteristicas` (pares clave/valor) y en el
// bloque de título/precio de cabecera.

// El path de la ficha lleva DOS segmentos numéricos: el ID de agencia (más
// corto, ej. "4089") y el ID de la propiedad (ej. "5259821"), en ese orden —
// `/ficha/piso/madrid/goya/4089/5259821/es/`. El helper genérico
// `externalIdFromUrl` se queda con el PRIMER número de 4+ dígitos que
// encuentra, que sería el de AGENCIA (compartido por todas sus propiedades):
// usarlo tal cual colisionaría el external_id de fichas distintas de la
// misma agencia. Por eso aquí cogemos el ÚLTIMO segmento puramente numérico.
function inmovillaExternalId(sourceUrl: string): string {
  try {
    const segments = new URL(sourceUrl).pathname.split("/").filter(Boolean);
    const numeric = segments.filter((s) => /^\d{4,}$/.test(s));
    if (numeric.length > 0) return `inmovilla-${numeric[numeric.length - 1]}`;
  } catch {
    /* URL inválida: cae al fallback de abajo */
  }
  const fallbackHash = sourceUrl.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  return `inmovilla-${(fallbackHash >>> 0).toString(36)}`;
}

function parseCaracteristicas($: CheerioAPI): Record<string, string> {
  const attrs: Record<string, string> = {};
  $("#fichapropiedad-bloquecaracteristicas .fichapropiedad-listadatos li").each((_, el) => {
    const key = $(el).find(".caracteristica").first().text().trim();
    const val = $(el).find(".valor").first().text().trim();
    if (key && val) attrs[key] = val;
  });
  return attrs;
}

export function extractInmovilla($: CheerioAPI, sourceUrl: string): ImportPreview {
  const warnings: string[] = [];

  const title =
    getMeta($, "og:title") ??
    ($("#fichapropiedad-titulos h1, .fichapropiedad-tituloprincipal h1").first().text().trim() ||
      null);

  const description =
    $("#fichapropiedad-bloquedescripcion").text().replace(/\s+/g, " ").trim() ||
    getMeta($, "og:description") ||
    null;

  const attrs = parseCaracteristicas($);

  const priceText = $(".fichapropiedad-precio").first().text().trim();
  const price = parsePriceString(priceText) ?? parsePriceString(attrs["Precio"]);
  const currency = /€/.test(priceText) ? "EUR" : null;

  let operation: "rent" | "sale" | null = null;
  const tipoOperacion = attrs["Tipo Operación"] ?? "";
  if (/alquil/i.test(tipoOperacion)) operation = "rent";
  else if (/vend|venta/i.test(tipoOperacion)) operation = "sale";
  else if (/\/\s*mes/i.test(priceText)) operation = "rent";
  else if (price !== null) operation = "sale";

  const bedrooms =
    (attrs["Habitaciones"] ? parseInt(attrs["Habitaciones"], 10) : null) ??
    parseBedrooms($(".habitaciones").first().text()) ??
    parseBedrooms(description);
  const bathrooms =
    (attrs["Baños"] ? parseInt(attrs["Baños"], 10) : null) ??
    parseBathrooms($(".banyos").first().text()) ??
    parseBathrooms(description);

  const squareMeters =
    parseAreaString(attrs["Superficie Construida"]) ??
    parseAreaString(attrs["Superficie Útil"]) ??
    parseAreaString(description);

  const zone = attrs["Zona / Ciudad"] ?? null;

  const features: string[] = [];
  $(".fichapropiedad-listacalidades .etiqueta").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt) features.push(txt);
  });

  const photos = extractInmovillaPhotos($);

  if (!title) warnings.push("título no detectado");
  if (price === null) warnings.push("precio no detectado");
  if (photos.length === 0)
    warnings.push("sin fotos — verifica que la ficha exponga la galería en #fotosNormales");

  return {
    portal: "inmovilla",
    sourceUrl,
    externalReference: inmovillaExternalId(sourceUrl),
    title,
    description,
    operation,
    stay: null,
    price,
    currency,
    bedrooms: Number.isFinite(bedrooms) ? bedrooms : null,
    bathrooms: Number.isFinite(bathrooms) ? bathrooms : null,
    squareMeters,
    zone,
    address: zone,
    features,
    latitude: null,
    longitude: null,
    photos,
    rawAttributes: attrs,
    warnings,
  };
}
