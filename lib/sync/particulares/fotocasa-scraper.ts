import "server-only";
import { normalizeSpanishPhone } from "./idealista-advertiser-detector";

// ─────────────────────────────────────────────────────────────────────────────
// Scraper de Fotocasa — SEGUNDA FUENTE de teléfonos de particulares.
//
// Por qué existe: muchos dueños publican el MISMO piso en Idealista y en
// Fotocasa, pero enseñan el teléfono en UNO solo de los dos. En Idealista el
// teléfono está detrás de DataDome (proxy + CapSolver, caro y frágil); en
// Fotocasa viene REGALADO en el HTML. Trayendo el anuncio de Fotocasa, el
// cross-match (`cross-match-phone.ts`) copia ese teléfono al gemelo de
// Idealista que no lo enseña.
//
// Todo lo que necesitamos está en un JSON embebido en el HTML:
//   <script type="application/json" id="__initial_props__">{...}</script>
// y dentro, en `initialSearch.result.realEstates[]`, cada anuncio del LISTADO
// ya trae teléfono, precio, m², descripción, fotos y coordenadas. Es decir:
// UNA petición por cada 30 anuncios, sin abrir la ficha ni usar navegador.
// (Verificado 2026-08-16: el teléfono del listado coincide carácter a carácter
// con el de la ficha en las 3 fichas comprobadas.)
//
// Dos trampas comprobadas contra el portal real, que cuestan horas si se
// asumen al revés:
//
//  1. `?tipoAnunciante=particular` NO filtra particulares: devuelve 31/31
//     anuncios `clientType: "professional"`. El filtro fiable es el propio
//     payload → `clientType === "particular"` (equivale a `clientTypeId === 1`).
//  2. El orden por defecto es por relevancia y en VENTA saca los promocionados
//     primero: la página 1 de comprar trae 0 particulares. Hay que pedir
//     `?sortType=publicationDate` para ordenar por fecha (novedades primero),
//     que es lo que hace útil el modo incremental del cron.
//
// Y una tercera sobre paginación: la página N va en la RUTA (`/l/2`). El
// `?paginacion=2` que parece natural devuelve otra vez la página 1.
//
// El extractor es PURO (recibe html, no toca red) para poder testearlo con un
// HTML guardado. La orquestación (paginación, fetch con proxy, upsert) vive en
// el cron `scrape-fotocasa`.
// ─────────────────────────────────────────────────────────────────────────────

export type FotocasaListing = {
  /** Clave en `particulares.external_id`, p.ej. "fotocasa-190461168". */
  externalId: string;
  propertyId: string;
  sourceUrl: string;
  phone: string | null; // +34XXXXXXXXX o null
  advertiserType: "particular" | "professional" | "unknown";
  isProfessional: boolean | null;
  contactName: string | null;
  operation: "rent" | "sale" | null;
  price: number | null;
  address: string | null;
  zone: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  photos: Array<{ url: string; alt?: string }>;
  features: string[];
  floorPlanUrl: string | null;
  videoUrl: string | null;
  hasFloorPlan: boolean;
  hasVideo: boolean;
  isTemporaryRental: boolean;
};

// Fotocasa: 1 = venta, 3 = alquiler (verificado contra /comprar/ y /alquiler/).
// El resto de valores (traspaso, alquiler con opción a compra…) no nos aplican.
const TRANSACTION_TYPE: Record<number, "rent" | "sale"> = { 1: "sale", 3: "rent" };

// Claves de `features[]` que son medidas numéricas y NO etiquetas de equipamiento.
const NUMERIC_FEATURE_KEYS = new Set([
  "rooms",
  "bathrooms",
  "surface",
  "antiquity",
  "conservationStatus",
  "orientation",
  "floor",
  "surfaceLand",
  "hotWater",
  "heating",
  "energyCertificate",
]);

/**
 * Saca el JSON de estado que Fotocasa incrusta en el HTML. Devuelve null si la
 * respuesta no lo trae (página antibot, error o rediseño del portal).
 */
export function extractFotocasaInitialProps(html: string): unknown | null {
  const m = html.match(
    /<script[^>]+id=["']__initial_props__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Zona del anuncio. Se prefiere el barrio (la granularidad que usa Idealista en
 * `particulares.zone`, p.ej. "Cuatro Caminos"), y se cae a distrito o municipio.
 */
function pickZone(address: Record<string, unknown> | null): string | null {
  if (!address) return null;
  return (
    strOrNull(address.neighborhood) ??
    strOrNull(address.district) ??
    strOrNull(address.upperLevel) ??
    strOrNull(address.city) ??
    strOrNull(address.municipality)
  );
}

/** Mapea un elemento de `realEstates[]` (listado) al tipo común. */
function mapSearchItem(raw: unknown): FotocasaListing | null {
  const it = asRecord(raw);
  if (!it) return null;

  const id = it.id;
  const propertyId =
    typeof id === "number" ? String(id) : typeof id === "string" ? id : null;
  if (!propertyId) return null;

  // URL de la ficha: `detail` es un mapa por idioma.
  const detail = asRecord(it.detail);
  const path =
    strOrNull(detail?.["es-ES"]) ??
    strOrNull(detail?.["es_ES"]) ??
    (detail ? strOrNull(Object.values(detail)[0]) : null);
  const sourceUrl = path
    ? `https://www.fotocasa.es${path.startsWith("/") ? path : `/${path}`}`
    : `https://www.fotocasa.es/es/d/${propertyId}`;

  // Anunciante. `clientType` es la señal buena; `clientTypeId` (1 = particular)
  // se usa de refuerzo si el string faltara.
  const clientType = strOrNull(it.clientType)?.toLowerCase() ?? null;
  const clientTypeId = numOrNull(it.clientTypeId);
  let advertiserType: FotocasaListing["advertiserType"] = "unknown";
  if (clientType === "particular" || (clientType === null && clientTypeId === 1)) {
    advertiserType = "particular";
  } else if (clientType === "professional" || clientType === "profesional") {
    advertiserType = "professional";
  } else if (clientType === null && clientTypeId != null && clientTypeId !== 1) {
    advertiserType = "professional";
  }

  // Medidas: `features` es una lista [{key, value}], no un objeto, y no todos
  // los anuncios traen todas las claves (hay pisos sin `rooms` ni `bathrooms`).
  let bedrooms: number | null = null;
  let bathrooms: number | null = null;
  let squareMeters: number | null = null;
  const featureLabels: string[] = [];
  const feats = Array.isArray(it.features) ? it.features : [];
  for (const f of feats) {
    const fr = asRecord(f);
    if (!fr) continue;
    const key = strOrNull(fr.key);
    if (!key) continue;
    const value = numOrNull(fr.value);
    if (key === "rooms") bedrooms = value;
    else if (key === "bathrooms") bathrooms = value;
    else if (key === "surface") squareMeters = value;
    else if (!NUMERIC_FEATURE_KEYS.has(key)) featureLabels.push(key);
  }

  // Precio: `price` viene formateado ("1.250 €"); el número está en `rawPrice`.
  const price = numOrNull(it.rawPrice) ?? numOrNull(it.price);

  const coords = asRecord(it.coordinates);
  const addressObj = asRecord(it.address);

  const photos: Array<{ url: string; alt?: string }> = [];
  const multimedia = Array.isArray(it.multimedia) ? it.multimedia : [];
  let videoUrl: string | null = null;
  for (const m of multimedia) {
    const mr = asRecord(m);
    if (!mr) continue;
    const src = strOrNull(mr.src) ?? strOrNull(mr.url);
    if (!src) continue;
    const type = strOrNull(mr.type)?.toLowerCase();
    if (type === "video") {
      videoUrl = videoUrl ?? src;
    } else {
      photos.push({ url: src });
    }
  }

  const transactionTypeId = numOrNull(it.transactionTypeId);
  const operation =
    transactionTypeId != null ? (TRANSACTION_TYPE[transactionTypeId] ?? null) : null;

  const hasVideo = !!numOrNull(it.hasVideo) || it.hasVideo === true || !!videoUrl;
  const hasFloorPlan = it.hasFloorPlans === true;

  return {
    externalId: `fotocasa-${propertyId}`,
    propertyId,
    sourceUrl,
    phone: normalizeSpanishPhone(strOrNull(it.phone)),
    advertiserType,
    isProfessional:
      advertiserType === "unknown" ? null : advertiserType === "professional",
    contactName: strOrNull(it.clientAlias) ?? strOrNull(it.clientName),
    operation,
    price,
    // `location` trae calle + número + barrio ("Calle de Carlos Arniches, 44,
    // Embajadores - Lavapiés"), que es la forma que el cross-match sabe leer.
    address: strOrNull(it.location),
    zone: pickZone(addressObj),
    bedrooms,
    bathrooms,
    squareMeters,
    description: strOrNull(it.description),
    latitude: coords ? numOrNull(coords.latitude) : null,
    longitude: coords ? numOrNull(coords.longitude) : null,
    photos,
    features: featureLabels,
    floorPlanUrl: null, // el listado no expone la URL del plano, solo el flag
    videoUrl,
    hasFloorPlan,
    hasVideo,
    isTemporaryRental: it.isTemporaryRental === true,
  };
}

/**
 * Extrae TODOS los anuncios de una página de resultados de Fotocasa
 * (particulares y profesionales — el filtrado lo decide quien llama).
 * Devuelve [] si el HTML no trae el payload esperado.
 */
export function extractFotocasaSearchListings(html: string): FotocasaListing[] {
  const props = asRecord(extractFotocasaInitialProps(html));
  if (!props) return [];
  const initialSearch = asRecord(props.initialSearch);
  const result = asRecord(initialSearch?.result);
  const realEstates = result?.realEstates;
  if (!Array.isArray(realEstates)) return [];

  const out: FotocasaListing[] = [];
  for (const raw of realEstates) {
    const mapped = mapSearchItem(raw);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Total de anuncios que dice el buscador (para saber cuántas páginas hay). */
export function extractFotocasaTotalCount(html: string): number | null {
  const props = asRecord(extractFotocasaInitialProps(html));
  const counters = asRecord(props?.counters);
  return counters ? numOrNull(counters.realEstates) : null;
}

export type FotocasaOperation = "rent" | "sale";

/**
 * Construye la URL de búsqueda.
 *
 * `location` es el slug de Fotocasa ("madrid-capital", "barcelona-capital"…) y
 * `zone` el de la zona dentro de esa localidad ("todas-las-zonas" por defecto).
 *
 * Ojo con las dos trampas (ver cabecera): la página va en la RUTA y el orden
 * por fecha es obligatorio para que el modo incremental vea las novedades.
 */
export function buildFotocasaSearchUrl(opts: {
  operation: FotocasaOperation;
  location?: string;
  zone?: string;
  page?: number;
}): string {
  const { operation, location = "madrid-capital", zone = "todas-las-zonas" } = opts;
  const page = Math.max(1, opts.page ?? 1);
  const segment = operation === "sale" ? "comprar" : "alquiler";
  const base = `https://www.fotocasa.es/es/${segment}/viviendas/${location}/${zone}/l`;
  const paged = page === 1 ? base : `${base}/${page}`;
  return `${paged}?sortType=publicationDate`;
}
