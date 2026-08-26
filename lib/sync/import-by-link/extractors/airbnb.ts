import type { CheerioAPI } from "cheerio";
import type { ImportPreview } from "../types";
import { externalIdFromUrl, getMeta, parseAreaString } from "../parse-utils";
import { extractGeneric } from "./generic";

/**
 * Extractor para Airbnb (fichas /rooms/<id>).
 *
 * Dos cosas hacen que el extractor genérico NO sirva aquí:
 *  1. `www.airbnb.com` responde una interstitial de 900 bytes ("Redirigiendo a
 *     es.airbnb.com": un <form> POST a /v2/domain_switch/handoff que solo se
 *     envía con JS). Sin datos, sin fotos. Por eso normalizeAirbnbUrl fuerza
 *     el dominio español ANTES del fetch (ver normalizeAirbnbUrl).
 *  2. La ficha real no tiene JSON-LD ni <img> con la galería: todo vive en el
 *     JSON embebido `<script id="data-deferred-state-0">` (respuesta GraphQL
 *     del PDP). Las ~30 fotos están en `pdpPresentation.heroMedia.edges[]`.
 *
 * El precio NO viaja en ese HTML (Airbnb lo pide por API al cargar, según
 * fechas y huéspedes), así que se deja null con un warning: el admin lo pone.
 */

const MAX_PHOTOS = 60;

// Normaliza cualquier host/idioma de Airbnb a la ficha en español de España y
// tira TODOS los parámetros del link pegado (check_in, source_impression_id,
// modal=PHOTO_TOUR_SCROLLABLE…). Motivos:
//  - `airbnb.es` + `locale=es-ES` evita la interstitial de domain_switch y
//    devuelve los textos en es-ES ("Ascensor", "2 dormitorios"), que es lo que
//    espera el mapeador de inspo (busca "ascensor", "terraza"… en español).
//    Con es.airbnb.com el HTML sale en es-419 ("Elevador", "recámaras") y las
//    inferencias de equipamiento fallan.
//  - Los parámetros de sesión/modal no aportan nada y ensucian el externalLink.
export function normalizeAirbnbUrl(url: URL): URL {
  const id = url.pathname.match(/\/rooms\/(?:plus\/)?(\d+)/)?.[1];
  // Sin ID de anuncio no reescribimos nada: puede ser un link corto (abnb.me/…)
  // que hay que seguir tal cual para que el redirect nos lleve a la ficha.
  if (!id) return url;
  const out = new URL(`https://www.airbnb.es/rooms/${id}`);
  out.searchParams.set("locale", "es-ES");
  out.searchParams.set("currency", "EUR");
  return out;
}

// ── Utilidades sobre el JSON del PDP ────────────────────────────────────────

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Busca en profundidad el primer objeto que cumpla `pred`. El JSON del PDP
 * cambia de forma con frecuencia (a veces bajo `data.node.pdpPresentation`, a
 * veces bajo `data.presentation.stayProductDetailPage`), así que buscamos por
 * FORMA y no por ruta fija: así un cambio de envoltorio no rompe el extractor.
 */
function deepFind(root: unknown, pred: (o: Json) => boolean): Json | null {
  const queue: unknown[] = [root];
  let steps = 0;
  while (queue.length && steps < 200_000) {
    const cur = queue.shift();
    steps++;
    if (Array.isArray(cur)) {
      for (const v of cur) queue.push(v);
    } else if (isObj(cur)) {
      if (pred(cur)) return cur;
      for (const v of Object.values(cur)) queue.push(v);
    }
  }
  return null;
}

// Lee los <script type="application/json"> de estado diferido y devuelve los
// que parseen. Normalmente hay uno (`data-deferred-state-0`).
function parseDeferredStates($: CheerioAPI): unknown[] {
  const states: unknown[] = [];
  $('script[type="application/json"]').each((_, el) => {
    const id = $(el).attr("id") ?? "";
    if (!id.startsWith("data-deferred-state")) return;
    const raw = $(el).text();
    if (!raw) return;
    try {
      states.push(JSON.parse(raw));
    } catch {
      // Estado corrupto/truncado: lo ignoramos y seguimos con el resto.
    }
  });
  return states;
}

// Texto localizado de un nodo UGCText: preferimos la traducción al idioma de la
// página y caemos al original del anfitrión.
function ugcText(node: unknown): string | null {
  if (!isObj(node)) return null;
  const inner = isObj(node.content) ? node.content : node;
  for (const key of [
    "localizedStringWithTranslationPreference",
    "localizedString",
    "source",
  ]) {
    const v = inner[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// La descripción de Airbnb viene como HTML con <br /> y <b>. La pasamos a texto
// plano conservando los saltos (el formulario de Idealista es un textarea).
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Airbnb usa espacios finos/no-rompibles y coma decimal ("4 viajeros",
// "2,5 baños"). Normalizamos antes de aplicar regex numéricas.
function plain(s: string): string {
  return s.replace(/[   ]/g, " ");
}

function numFrom(text: string, unitRe: string): number | null {
  const m = plain(text).match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unitRe}`, "i"));
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ── Extractor ───────────────────────────────────────────────────────────────

export function extractAirbnb($: CheerioAPI, sourceUrl: string): ImportPreview {
  const warnings: string[] = [];

  // La interstitial de cambio de dominio es un HTML mínimo con un form POST.
  // Si llegamos aquí con eso, no hay nada que parsear: mejor decirlo claro.
  if (/domain_switch\/handoff/.test($.html())) {
    return {
      ...extractGeneric($, sourceUrl, "airbnb"),
      warnings: [
        "Airbnb devolvió la página de cambio de dominio (sin datos). Reintenta o pega el link de www.airbnb.es",
      ],
    };
  }

  const states = parseDeferredStates($);

  // pdpPresentation: lo reconocemos por tener la galería + las descripciones.
  let pdp: Json | null = null;
  for (const state of states) {
    pdp = deepFind(state, (o) => isObj(o.heroMedia) && "descriptions" in o);
    if (pdp) break;
  }

  if (!pdp) {
    // Sin JSON no hay galería completa: caemos al genérico (og:image, título)
    // para que el admin tenga algo, pero avisamos de por qué falta el resto.
    const generic = extractGeneric($, sourceUrl, "airbnb");
    return {
      ...generic,
      operation: "rent",
      stay: "short",
      warnings: [
        ...generic.warnings,
        "No se encontró el JSON del anuncio de Airbnb (cambió su estructura): solo datos básicos",
      ],
    };
  }

  const title = ugcText(pdp.title) ?? getMeta($, "og:title");

  const descriptions = isObj(pdp.descriptions) ? pdp.descriptions : null;
  const rawDescription =
    (descriptions && ugcText(descriptions.longDescriptionHtml)) ??
    (descriptions && ugcText(descriptions.descriptionHtml)) ??
    getMeta($, "og:description");
  const description = rawDescription ? htmlToText(rawDescription) : null;

  // overview.items: ["4 viajeros", "2 dormitorios", "2 camas", "2,5 baños"].
  const overview = isObj(pdp.overview) ? pdp.overview : null;
  const overviewItems = Array.isArray(overview?.items)
    ? (overview!.items as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const overviewText = overviewItems.join(" · ");

  let bedrooms = numFrom(overviewText, "(?:dormitorio|habitaci|recámara|rec[aá]mara|bedroom)");
  // "Estudio" / "Monoambiente": Airbnb no lista dormitorios → 0 (es un estudio).
  if (bedrooms === null && /\bestudio\b|\bstudio\b/i.test(`${title ?? ""} ${overviewText}`)) {
    bedrooms = 0;
  }
  // "2,5 baños" = 2 completos + 1 aseo. Redondeamos al alza porque Idealista
  // cuenta baños enteros y el aseo existe físicamente.
  const bathsRaw = numFrom(overviewText, "(?:ba[ñn]o|bathroom)");
  const bathrooms = bathsRaw === null ? null : Math.ceil(bathsRaw);
  const beds = numFrom(overviewText, "(?:cama|bed)s?\\b");
  const guests =
    numFrom(overviewText, "(?:viajero|hu[eé]sped|guest)") ??
    (typeof pdp.personCapacity === "number" ? pdp.personCapacity : null);

  // Airbnb no publica los m² como dato estructurado; muchos anfitriones los
  // ponen en el título o la descripción ("apartamento de 100 m²").
  const squareMeters = parseAreaString(title) ?? parseAreaString(description);

  // Ubicación: ciudad + coordenadas aproximadas (Airbnb ofusca la dirección
  // exacta hasta reservar, así que address queda vacío a propósito).
  const locNode = deepFind(states, (o) => isObj(o.coordinate) && "city" in o);
  const coord = locNode && isObj(locNode.coordinate) ? locNode.coordinate : null;
  const latitude = typeof coord?.latitude === "number" ? coord.latitude : null;
  const longitude = typeof coord?.longitude === "number" ? coord.longitude : null;
  const zone =
    (typeof locNode?.city === "string" && locNode.city) ||
    (typeof pdp.localizedLocation === "string" ? pdp.localizedLocation : null) ||
    null;

  // Amenities: `seeAllAmenitiesGroups` es la lista completa (la preview solo
  // trae ~7). Nos quedamos con las disponibles — el grupo "No incluido" viene
  // marcado con available:false y quedaría fuera igualmente.
  // Todo anuncio de Airbnb es una vivienda amueblada y lista para entrar: lo
  // damos por hecho para que el mapeador marque equipamiento "amueblado".
  const features: string[] = ["Amueblado"];
  const amenities = isObj(pdp.amenities) ? pdp.amenities : null;
  for (const key of ["seeAllAmenitiesGroups", "previewAmenitiesGroups"]) {
    const groups = amenities?.[key];
    if (!Array.isArray(groups)) continue;
    const before = features.length;
    for (const group of groups) {
      if (!isObj(group) || !Array.isArray(group.amenities)) continue;
      for (const item of group.amenities) {
        if (!isObj(item) || item.available === false) continue;
        const name = typeof item.title === "string" ? item.title.trim() : "";
        // "Wifi rápido (421 Mbps)." → nos quedamos con la parte útil.
        const clean = name.replace(/\s*\(.*?\)\s*\.?$/, "").replace(/\.$/, "").trim();
        if (clean && !features.includes(clean)) features.push(clean);
      }
    }
    // Si `seeAll` ya trajo la lista completa, no hace falta la preview (es un
    // subconjunto). Solo seguimos si este grupo no aportó nada.
    if (features.length > before) break;
  }

  // Galería completa: heroMedia son TODAS las fotos del anuncio (~30), en el
  // orden del carrusel. Las URIs `original` de muscache ya vienen optimizadas
  // (~180KB); no añadimos ?im_w porque devuelve un archivo MÁS pesado.
  const photos: Array<{ url: string; alt?: string }> = [];
  const seen = new Set<string>();
  const pushPhoto = (uri: unknown, alt: unknown) => {
    if (typeof uri !== "string" || !/^https?:\/\//.test(uri)) return;
    if (seen.has(uri) || photos.length >= MAX_PHOTOS) return;
    seen.add(uri);
    photos.push({ url: uri, ...(typeof alt === "string" && alt ? { alt } : {}) });
  };

  const heroEdges = isObj(pdp.heroMedia) && Array.isArray(pdp.heroMedia.edges)
    ? pdp.heroMedia.edges
    : [];
  for (const edge of heroEdges) {
    const node = isObj(edge) && isObj(edge.node) ? edge.node : null;
    const image = node && isObj(node.image) ? node.image : null;
    if (image) pushPhoto(image.uri, image.altText ?? image.caption);
    else if (node) pushPhoto(node.uri, node.altText);
  }

  // Respaldo: el tour por estancias (dormitorios) suele ser un subconjunto de
  // heroMedia, pero si la galería no salió, sirve para no quedarnos a cero.
  if (photos.length === 0) {
    const tour = isObj(pdp.sleepingArrangements) ? pdp.sleepingArrangements : null;
    const stops = Array.isArray(tour?.stops) ? tour!.stops : [];
    for (const stop of stops) {
      const items = isObj(stop) && Array.isArray(stop.items) ? stop.items : [];
      for (const item of items) {
        const image = isObj(item) && isObj(item.image) ? item.image : null;
        if (image) pushPhoto(image.uri, image.altText ?? image.caption);
      }
    }
  }
  if (photos.length === 0) {
    const ogImage = getMeta($, "og:image");
    if (ogImage) pushPhoto(ogImage, null);
    warnings.push("no se encontraron fotos en el anuncio de Airbnb");
  }

  // El precio se pide por API con fechas/huéspedes: no está en el HTML.
  warnings.push(
    "Airbnb no publica el precio en el HTML (depende de fechas): rellénalo a mano",
  );
  if (squareMeters === null) {
    warnings.push("m² no detectados (Airbnb no los publica salvo en el texto)");
  }

  const rawAttributes: Record<string, string | number | null> = {
    // "tipo" lo usa el mapeador de inspo como pista de tipo de inmueble
    // ("Alojamiento entero: apartamento en París, Francia" → flat).
    tipo: typeof overview?.title === "string" ? overview.title : null,
    huespedes: guests,
    camas: beds,
    ...(bathsRaw !== null && bathsRaw % 1 !== 0
      ? { "baños (Airbnb)": plain(overviewText).match(/[\d,.]+\s*ba[ñn]os?/i)?.[0] ?? null }
      : {}),
  };

  return {
    portal: "airbnb",
    sourceUrl,
    externalReference: externalIdFromUrl("airbnb", sourceUrl),
    title,
    description,
    // Airbnb es siempre alquiler y de estancia corta/temporal.
    operation: "rent",
    stay: "short",
    price: null,
    currency: "EUR",
    bedrooms,
    bathrooms,
    squareMeters,
    zone,
    address: null,
    features,
    latitude,
    longitude,
    photos,
    rawAttributes,
    warnings,
  };
}
