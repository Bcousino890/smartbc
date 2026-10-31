import { scrapeCaptacionFromHtml } from "@/lib/sync/portalinmobiliario/scraper-captacion";
import type { ImportPreview } from "../types";

/**
 * Extractor para portalinmobiliario.com (y avisos de mercadolibre.cl).
 * Reutiliza la lectura que ya hace la captación y la traduce al formato del
 * importador. El precio llega en `currency` ("uf" o "clp"): el borrador lo
 * respeta al crear la ficha.
 */
export async function extractPortalInmobiliario(html: string, sourceUrl: string): Promise<ImportPreview> {
  const s = await scrapeCaptacionFromHtml(sourceUrl, html);
  const warnings: string[] = [];
  if (!s.title) warnings.push("No se pudo leer el título del aviso.");
  if (!s.price) warnings.push("No se pudo leer el precio.");
  if (s.photo_urls.length === 0) warnings.push("No se encontraron fotos.");

  const operation = s.operation === "venta" ? "sale" : s.operation === "arriendo" ? "rent" : null;
  const ref = s.portal_publication_number ?? sourceUrl.match(/MLC-?(\d{6,})/i)?.[1] ?? null;
  const place = [s.commune, s.region].filter(Boolean).join(", ");

  return {
    portal: "portalinmobiliario",
    sourceUrl,
    externalReference: ref ? `portalinmobiliario-${ref}` : `portalinmobiliario-${Math.abs(hash(sourceUrl)).toString(36)}`,
    title: s.title,
    description: s.description,
    operation,
    stay: operation === "rent" ? "long" : null,
    price: s.price,
    currency: s.currency,
    bedrooms: s.bedrooms,
    bathrooms: s.bathrooms,
    squareMeters: s.square_meters ?? s.useful_square_meters,
    zone: s.commune ?? s.zone ?? s.region,
    address: s.address_scraped ?? (place || null),
    features: s.features,
    latitude: s.latitude,
    longitude: s.longitude,
    photos: s.photo_urls.map((url) => ({ url })),
    rawAttributes: {
      region: s.region,
      comuna: s.commune,
      m2_utiles: s.useful_square_meters,
      corredor: s.broker_name,
      referencia_corredor: s.external_reference,
      publicado: s.published_ago,
    },
    warnings,
  };
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}
