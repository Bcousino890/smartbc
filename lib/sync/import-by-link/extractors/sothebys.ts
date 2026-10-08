import type { CheerioAPI } from "cheerio";
import type { ImportPhoto, ImportPreview } from "../types";
import { externalIdFromUrl, extractNextData } from "../parse-utils";
import { extractGeneric } from "./generic";

// Extractor para fichas de Spain Sotheby's International Realty
// (www.spain-sothebysrealty.com/property/<slug>-<ref>, y sus variantes /es/,
// /fr/… del mismo anuncio).
//
// Por qué un extractor propio y no el genérico (2026-10-08): la web es Next.js
// (pages router) y la galería se pinta con <Image> de Next, así que en el HTML
// las fotos solo aparecen como `/_next/image?url=<foto codificada>&w=…`. El
// genérico no las reconoce como foto (la extensión queda en mitad del query) y
// se quedaba con og:image + la única imagen del JSON-LD — que son LA MISMA
// foto con dos URLs distintas (una pasa por el redimensionado de Cloudflare),
// así que la ficha salía con "2 fotos" que eran una. Además el JSON-LD trae el
// título/descripción de SEO en inglés ("Flat Nuevos Ministerios - …"), sin
// dormitorios/baños legibles.
//
// Todo lo bueno está en `__NEXT_DATA__` → props.pageProps.property:
//  - mediaSeo[]: la galería completa, en el orden del carrusel (comprobado
//    contra los slides de swiper: 32 de 32, mismo orden). Ojo: la página trae
//    también `similarProperties` con SUS fotos (otras referencias); por eso NO
//    se barre el HTML entero como hace el genérico.
//  - listing_title / description: en 9 idiomas; pedimos siempre español,
//    pegue el agente el enlace en el idioma que lo pegue.
//  - listingprices.eur, rentMonthlyPrice, bedrooms, fullbathrooms, totalarea,
//    latitude/longitude (exactas; también hay unas *_aprox que ignoramos),
//    location (barrio → distrito → ciudad), street, amenities (códigos que se
//    traducen con pageProps.allAmenitiesArray).
//
// Si algún día cambian la estructura y no aparece `property`, caemos al
// genérico con un aviso en vez de devolver una ficha vacía.

type Json = Record<string, unknown>;

const LANG_PREFERENCE = ["es", "en"];

function obj(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Número desde number o string ("88.0000", "3500.0000"). 0 o negativo = sin dato
// (la web rellena con 0 los precios en monedas que no usa y la parcela vacía).
function positiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Latitud/longitud válida (0 exacto = campo vacío, no el golfo de Guinea).
function coordinate(v: unknown, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n !== 0 && Math.abs(n) <= max ? n : null;
}

// Texto traducido ({ es, en, fr… }) en el idioma preferido: español, luego el
// idioma de la página, luego inglés, luego el primero que haya.
function pickLang(v: unknown, pageLocale: string | null): string | null {
  const o = obj(v);
  if (!o) return str(v);
  const order = [...new Set([LANG_PREFERENCE[0], pageLocale, ...LANG_PREFERENCE])];
  for (const lang of order) {
    if (!lang) continue;
    const t = str(o[lang]);
    if (t) return t;
  }
  for (const val of Object.values(o)) {
    const t = str(val);
    if (t) return t;
  }
  return null;
}

// Los barrios en el CRM siguen el formato de Idealista ("Nuevos Ministerios-Ríos
// Rosas", "Chueca-Justicia"), que es lo que usa el cruce con las búsquedas de
// los clientes. Sotheby's los escribe con espacios alrededor del guion.
function normalizeZone(name: string): string {
  return name.replace(/\s*-\s*/g, "-").replace(/\s{2,}/g, " ").trim();
}

function galleryPhotos(property: Json): ImportPhoto[] {
  const media = Array.isArray(property.mediaSeo) ? property.mediaSeo : [];
  const seen = new Set<string>();
  const photos: ImportPhoto[] = [];
  for (const m of media) {
    const item = obj(m);
    const href = str(item?.href);
    if (!href || !/^https?:\/\//i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const alt = str(item?.alt);
    photos.push(alt ? { url: href, alt } : { url: href });
  }
  return photos;
}

// Códigos "feat_liftelevator;views_city-strip;…" → etiquetas en español del
// diccionario que manda la propia página. Los "lifestyle_*" ("Sofisticación
// urbana", "Entusiastas del arte…") son reclamo de marketing, no
// características de la vivienda: fuera. Un código sin traducción también se
// descarta (no queremos "accooling_other" en la ficha).
function amenityLabels(property: Json, dictionary: Json | null): string[] {
  const codes = [property.commercial_amenities, property.private_amenities]
    .map((v) => (typeof v === "string" ? v : ""))
    .join(";")
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const code of codes) {
    if (code.startsWith("lifestyle_")) continue;
    const label = pickLang(dictionary?.[code], null);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

export function extractSothebys($: CheerioAPI, sourceUrl: string): ImportPreview {
  const nextData = obj(extractNextData($));
  const pageProps = obj(obj(nextData?.props)?.pageProps);
  const property = obj(pageProps?.property);

  if (!property || !Array.isArray(property.mediaSeo)) {
    const fallback = extractGeneric($, sourceUrl, "sothebys");
    fallback.warnings.unshift(
      "no se encontraron los datos de la ficha de Sotheby's (__NEXT_DATA__) — extracción genérica, revisa fotos y datos",
    );
    return fallback;
  }

  const warnings: string[] = [];
  const pageLocale = str(nextData?.locale);
  const rawAttributes: Record<string, string | number | null> = {};

  const title =
    pickLang(property.listing_title, pageLocale) ??
    pickLang(property.PageTitle, pageLocale) ??
    pickLang(property.OGTitle, pageLocale);
  const description = pickLang(property.description, pageLocale);

  // Operación y precio. En alquiler `listingprices.eur` es un equivalente que
  // calcula la web (en un alquiler semanal de 32.400 €/semana guarda 129.600):
  // usamos el mensual real si existe y, si no, ese equivalente con aviso.
  const listingType = str(property.listingtype)?.toLowerCase() ?? null;
  const operation: "rent" | "sale" | null =
    listingType === "rent" ? "rent" : listingType === "sale" ? "sale" : null;
  const rental = obj(property.rentalpricing);
  const prices = obj(property.listingprices);
  let price: number | null = null;
  let currency: string | null = null;
  if (operation === "rent") {
    const monthly = positiveNumber(property.rentMonthlyPrice);
    price = monthly ?? positiveNumber(prices?.eur);
    currency = price !== null ? (str(rental?.currencyIsoCode) ?? "EUR") : null;
    const weekly = positiveNumber(property.rentWeeklyPrice);
    const daily = positiveNumber(property.rentDailyPrice);
    if (weekly) rawAttributes["precio semanal"] = Math.round(weekly);
    if (daily) rawAttributes["precio diario"] = Math.round(daily);
    if (!monthly && price !== null) {
      const period = str(property.rentPriceTypes)?.toLowerCase();
      const label = period === "weekly" ? "semana" : period === "daily" ? "día" : "periodo";
      warnings.push(
        `el portal publica el alquiler por ${label}, no por mes: el precio es el equivalente mensual que calcula la web — revísalo`,
      );
    }
  } else {
    // Venta: la web guarda el precio en EUR/GBP/USD y deja a 0 las que no usa.
    for (const [key, iso] of [["eur", "EUR"], ["usd", "USD"], ["gbp", "GBP"]] as const) {
      const v = positiveNumber(prices?.[key]);
      if (v !== null) {
        price = v;
        currency = iso;
        break;
      }
    }
  }
  if (price !== null) price = Math.round(price);
  // "Precio a consultar": el dato está en el JSON pero la web NO lo enseña. No
  // lo publicamos como si fuera público; se deja a mano y se guarda aparte.
  // `rentalpricing.show_price` solo cuenta en alquiler (en venta no se usa).
  if (property.poa === true || (operation === "rent" && rental?.show_price === false)) {
    if (price !== null) rawAttributes["precio oculto en el portal"] = price;
    price = null;
    currency = null;
    warnings.push("el portal lo publica como «precio a consultar» — rellena el precio a mano");
  }

  let stay: "long" | "short" | null = null;
  if (operation === "rent") {
    const types = (Array.isArray(rental?.rentTypes) ? rental.rentTypes : [])
      .map((t) => String(t).toLowerCase());
    if (types.some((t) => t.includes("long"))) stay = "long";
    else if (types.some((t) => /short|vacation|vacational|seasonal/.test(t))) stay = "short";
  }

  const bedrooms = positiveNumber(property.bedrooms);
  const bathrooms = positiveNumber(property.fullbathrooms);
  const area = positiveNumber(property.totalarea);
  const plot = positiveNumber(property.lotsize);
  if (plot) rawAttributes["parcela (m²)"] = Math.round(plot);

  // Coordenadas exactas (las *_aprox son el centro aproximado que pinta el
  // mapa público). Solo si vienen las dos.
  const lat = coordinate(property.latitude, 90);
  const lng = coordinate(property.longitude, 180);
  const latitude = lat !== null && lng !== null ? lat : null;
  const longitude = lat !== null && lng !== null ? lng : null;

  // Ubicación: location = barrio, parent = distrito, parent.parent = ciudad.
  const location = obj(property.location);
  const district = obj(location?.parent);
  const city = obj(district?.parent);
  const neighbourhood = str(location?.name);
  const zone = neighbourhood
    ? normalizeZone(neighbourhood)
    : str(district?.name) ?? str(city?.name);
  // "Calle de Vallehermoso. Madrid" → "Calle de Vallehermoso, Madrid".
  const street = str(property.street)?.replace(/\s*\.\s+/g, ", ") ?? null;
  const address = street ?? str(property.address);
  if (str(district?.name)) rawAttributes.distrito = str(district?.name);
  if (str(city?.name)) rawAttributes.ciudad = str(city?.name);
  if (str(property.postalcode)) rawAttributes["código postal"] = str(property.postalcode);

  const reference = str(property.property);
  if (reference) rawAttributes.referencia = reference;
  if (str(property.propertytype)) rawAttributes.tipo = str(property.propertytype);
  if (str(property.energy_efficiency))
    rawAttributes["certificado energético"] = str(property.energy_efficiency);

  const photos = galleryPhotos(property);

  const floorplans = Array.isArray(property.floorplans) ? property.floorplans : [];
  const firstPlan = floorplans
    .map((f) => (typeof f === "string" ? f : str(obj(f)?.href) ?? str(obj(f)?.url)))
    .find((u): u is string => !!u && /^https?:\/\//i.test(u));
  const video = str(property.video_streaming);

  if (!title) warnings.push("título no detectado");
  if (photos.length === 0) warnings.push("la ficha de Sotheby's no trae fotos en la galería");
  if (area === null) warnings.push("superficie no detectada");

  return {
    portal: "sothebys",
    sourceUrl,
    externalReference: reference
      ? `sothebys-${reference}`
      : externalIdFromUrl("sothebys", sourceUrl),
    title,
    description,
    operation,
    stay,
    price,
    currency,
    bedrooms: bedrooms !== null ? Math.round(bedrooms) : null,
    bathrooms: bathrooms !== null ? Math.round(bathrooms) : null,
    squareMeters: area !== null ? Math.round(area) : null,
    zone,
    address,
    features: amenityLabels(property, obj(pageProps?.allAmenitiesArray)),
    latitude,
    longitude,
    photos,
    rawAttributes,
    warnings,
    floorPlanUrl: firstPlan ?? null,
    videoUrl: video && /^https?:\/\//i.test(video) ? video : null,
  };
}
