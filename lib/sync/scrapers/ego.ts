import type { RawPhoto, RawProperty, Scraper } from "../types";
import { extractFeaturesFromText } from "./level-real-estate";
import { cleanAgencyDescription } from "./clean-description";
import { MADRID_DISTRICTS } from "@/lib/madrid-zones";

// Motor común para las agencias cuya web es de eGO Real Estate (CRM portugués):
// Housely Consulting e INNEA Properties. Las páginas solo traen el esqueleto;
// los inmuebles los pinta el navegador pidiéndolos a la API pública de eGO
// (websiteapi.egorealestate.com/v1/Properties), que devuelve en UNA llamada la
// ficha completa de todos (habitaciones, baños, m², barrio, descripción,
// galería y características). Por eso no se abren fichas.
//
// La API exige tres cosas que la web incrusta en cada página servida:
//   • Cabecera `AuthorizationToken`: el `APIToken` del `WebApp.push({...})`.
//   • Cabecera `x-requestid`: el `requestID` del `DataApi.push({...})`. Sin él
//     (o con uno inventado) responde 430.
//   • Cabeceras `x-async: true` y `X-Served-By: JanelaDigital`, más un `vui`
//     (UUID de visitante) en la query. Sin ellas también da 430.
// Por eso cada run pide primero una página de la web y saca de ahí la sesión.
//
// Fotos: las variantes redimensionadas del CDN (Z2560x1920, Z1280x960…) llevan
// la marca de agua de la agencia. `ZOriginal` es la MISMA foto SIN marca —
// mismo truco que el `-original.jpg` de Mobilia. Se usa siempre `ZOriginal` y
// el diff engine la re-aloja en nuestro storage.
//
// Criterios comunes (decididos con BC): venta a cualquier precio, alquiler
// desde 3.000 €/mes, solo viviendas. Cada agencia puede acotar zonas en su
// config; las dos actuales son cartera Madrid prime y no filtran.

export type EgoSiteConfig = {
  key: string;
  label: string;
  agencySlug: string;
  siteBase: string;
  /** Cualquier página de la web sirve para sacar la sesión. */
  sessionPage: string;
  /** Segmento de la URL pública de la ficha: /{detailPath}/{slug}/{ID}. */
  detailPath: string;
  /** Frases que mencionen la marca se descartan de la descripción. */
  brand: RegExp;
  /** Firma de inicio ("INNEA Properties presenta ") que se recorta. Con `g`. */
  signature: RegExp;
  /** Si devuelve false, el inmueble se descarta por zona. Por defecto, todo. */
  zoneFilter?: (zone: string, p: EgoProperty) => boolean;
};

const API_BASE = "https://websiteapi.egorealestate.com/v1";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 25_000;
// Inmuebles por página de la API. INNEA ronda los 150; se pagina igual.
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const RENT_MIN_PRICE = 3000;

// Tipos NO residenciales (ruido para un CRM de viviendas).
const EXCLUDED_TYPES =
  /garaje|trastero|plaza|local|oficina|nave|terreno|solar|parking|edificio/i;

// IDs de negocio de eGO. El nombre se usa como respaldo.
const BUSINESS_SALE = 1;
const BUSINESS_RENT = 2;

export type EgoSession = { token: string; requestId: string };

type EgoImage = { Original?: string | null; Thumbnail?: string | null };
type EgoPrice = { PriceValue?: number | null };
type EgoBusiness = {
  BusinessID?: number;
  BusinessName?: string;
  Prices?: EgoPrice[] | null;
};
type EgoFeature = {
  Title?: string;
  Value?: string;
  Tag?: string;
  Childs?: EgoFeature[] | null;
};

export type EgoProperty = {
  ID: number;
  Reference?: string;
  Title?: string;
  Description?: string;
  Type?: string;
  Parish?: string;
  District?: string;
  Municipality?: string;
  Rooms?: number;
  Bathrooms?: number;
  GrossArea?: number;
  NetArea?: number;
  Images?: EgoImage[] | null;
  PropertyBusiness?: EgoBusiness[] | null;
  Features?: EgoFeature[] | null;
};

type EgoListing = { Properties?: EgoProperty[]; TotalRecords?: number };

// ── Sesión ──────────────────────────────────────────────────────────────────

// Saca `APIToken` y `requestID` del HTML de cualquier página de la web.
export function extractEgoSession(html: string): EgoSession | null {
  const token = html.match(/"APIToken"\s*:\s*"([^"]+)"/)?.[1];
  const requestId = html.match(/['"]requestID['"]\s*:\s*['"]([^'"]+)['"]/)?.[1];
  if (!token || !requestId) return null;
  return { token, requestId };
}

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT, ...headers },
      cache: "no-store",
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function openSession(cfg: EgoSiteConfig): Promise<EgoSession> {
  const res = await fetchWithTimeout(cfg.sessionPage, {});
  if (!res.ok) throw new Error(`${cfg.key}_session_http_${res.status}`);
  const session = extractEgoSession(await res.text());
  if (!session) throw new Error(`${cfg.key}_session_not_found`);
  return session;
}

// ── Listado ─────────────────────────────────────────────────────────────────

async function fetchPage(
  cfg: EgoSiteConfig,
  session: EgoSession,
  visitorId: string,
  page: number,
): Promise<EgoListing> {
  const qs = new URLSearchParams({
    nre: String(PAGE_SIZE),
    pag: String(page),
    lng: "es-es",
    oar: "1",
    vui: visitorId,
  });
  const res = await fetchWithTimeout(`${API_BASE}/Properties?${qs}`, {
    Accept: "application/json",
    AuthorizationToken: session.token,
    "x-requestid": session.requestId,
    "x-async": "true",
    "X-Served-By": "JanelaDigital",
    Referer: cfg.sessionPage,
  });
  if (!res.ok) throw new Error(`${cfg.key}_api_http_${res.status}`);
  return (await res.json()) as EgoListing;
}

// Todos los inmuebles publicados (venta y alquiler en la misma consulta).
//
// IMPORTANTE: ante cualquier fallo LANZA en vez de devolver []. Este listado es
// la autoridad de archivado (`listExternalIds`): una lista vacía por un error
// de red haría que el motor archivase toda la cartera de la agencia.
export async function fetchAllEgoProperties(cfg: EgoSiteConfig): Promise<EgoProperty[]> {
  const session = await openSession(cfg);
  const visitorId = crypto.randomUUID();
  const all: EgoProperty[] = [];
  let total = Infinity;
  for (let page = 1; page <= MAX_PAGES && all.length < total; page++) {
    const data = await fetchPage(cfg, session, visitorId, page);
    if (!Array.isArray(data.Properties)) {
      throw new Error(`${cfg.key}_api_malformed`);
    }
    if (typeof data.TotalRecords === "number") total = data.TotalRecords;
    all.push(...data.Properties);
    if (data.Properties.length < PAGE_SIZE) break;
  }
  if (all.length === 0) throw new Error(`${cfg.key}_api_empty`);
  return all;
}

// ── Mapeo ───────────────────────────────────────────────────────────────────

// La operación sale de los negocios CON precio. Algunos inmuebles vienen
// marcados venta+alquiler pero con el alquiler a 0 €: eso es venta. Si tuviera
// los dos precios, gana la venta (external_id único por agencia, igual que en
// Housingo).
export function pickOperation(
  p: EgoProperty,
): { operation: "sale" | "rent"; price: number } | null {
  let sale = 0;
  let rent = 0;
  for (const b of p.PropertyBusiness ?? []) {
    const price = Number(b.Prices?.[0]?.PriceValue ?? 0);
    if (!Number.isFinite(price) || price <= 0) continue;
    const name = (b.BusinessName ?? "").toLowerCase();
    if (b.BusinessID === BUSINESS_SALE || name.includes("venta")) sale = price;
    else if (b.BusinessID === BUSINESS_RENT || name.includes("alquiler")) rent = price;
  }
  if (sale > 0) return { operation: "sale", price: sale };
  if (rent > 0) return { operation: "rent", price: rent };
  return null;
}

// "Barrio de Salamanca" → "Salamanca". El resto de distritos vienen ya limpios.
export function egoZone(p: EgoProperty): string {
  const raw = (p.Parish || p.District || p.Municipality || "Madrid").trim();
  return raw.replace(/^barrio\s+(de\s+(la\s+|los\s+|las\s+)?|del\s+)?/i, "").trim() || "Madrid";
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Barrio (subzona), siempre uno del propio distrito. Primero el TÍTULO ("Ático
// dúplex en Justicia", "Piso en venta en Recoletos"); si no, la descripción, pero
// solo con la fórmula explícita "barrio de Recoletos". Se compara respetando
// mayúsculas para no confundir nombres propios con palabras comunes ("lista",
// "sol", "cortes"). Ante la duda, nada.
export function egoSubzone(
  title: string,
  zone: string,
  description = "",
): string | undefined {
  const barrios = MADRID_DISTRICTS[zone];
  if (!barrios) return undefined;
  const t = fold(title);
  const d = fold(description);
  for (const barrio of barrios) {
    const name = fold(barrio);
    if (new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`).test(t)) return barrio;
  }
  for (const barrio of barrios) {
    const name = fold(barrio);
    if (new RegExp(`\\bbarrio de(l| la| los)? ${name}([^A-Za-z]|$)`, "i").test(d)) {
      return barrio;
    }
  }
  return undefined;
}

export function cleanEgoDescription(cfg: EgoSiteConfig, raw: string | null | undefined): string {
  return cleanAgencyDescription(raw, { brand: cfg.brand, signature: cfg.signature });
}

// Las fotos limpias son las `ZOriginal`. Si falta, se deriva de la miniatura
// cambiando el segmento de tamaño (`/Z512x384/` → `/ZOriginal/`).
export function egoPhotos(p: EgoProperty): RawPhoto[] {
  const seen = new Set<string>();
  const out: RawPhoto[] = [];
  for (const img of p.Images ?? []) {
    const src = img.Original || img.Thumbnail;
    if (!src) continue;
    const url = src.replace(/\/Z\d+x\d+\//i, "/ZOriginal/");
    if (!/\/ZOriginal\//.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url });
  }
  return out;
}

// Características que eGO marca explícitamente (título del nodo hoja). Se
// mapean a las etiquetas canónicas que ya usan el resto de scrapers.
const FEATURE_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /^ascensor$/i, label: "Ascensor" },
  { match: /^aire acondicionado$/i, label: "Aire acondicionado" },
  { match: /^amueblado$/i, label: "Amueblado" },
  { match: /^terraza$/i, label: "Terraza" },
  { match: /^balc[oó]n$/i, label: "Balcón" },
  { match: /^garaje$/i, label: "Garaje" },
  { match: /^trastero$/i, label: "Trastero" },
  { match: /^armarios empotrados$/i, label: "Armarios empotrados" },
  { match: /^calefacci[oó]n/i, label: "Calefacción" },
  { match: /^piscina/i, label: "Piscina" },
  { match: /^jard[ií]n/i, label: "Jardín" },
];

export function egoFeatures(p: EgoProperty, description: string): string[] {
  const found = new Set<string>();
  const walk = (nodes: EgoFeature[] | null | undefined) => {
    for (const n of nodes ?? []) {
      const title = (n.Title ?? "").trim();
      for (const f of FEATURE_LABELS) if (f.match.test(title)) found.add(f.label);
      if (/^interior\/exterior$/i.test(title) && /exterior/i.test(n.Value ?? "")) {
        found.add("Exterior");
      }
      walk(n.Childs);
    }
  };
  walk(p.Features);
  for (const f of extractFeaturesFromText(description)) found.add(f);
  return [...found];
}

function positive(n: unknown): number | undefined {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

// Algunas fichas traen `Bathrooms: 0` aunque el texto diga "2 baños".
function bathroomsFrom(p: EgoProperty, description: string): number | undefined {
  const fromApi = positive(p.Bathrooms);
  if (fromApi) return fromApi;
  const m = description.match(/\b(\d{1,2})\s+ba[ñn]os?\b/i);
  return m ? parseInt(m[1], 10) : undefined;
}

// URL pública de la ficha, idéntica a la del sitemap de la web (verificado con
// las 42 de Housely y las 151 de INNEA): /{detailPath}/{slug}/{ID}. El slug
// sale del título; si el inmueble no tiene título, eGO lo compone con "{Tipo}
// {N} habitaciones {Descripción}" y lo corta a 100 caracteres (sin recortar el
// guion final).
export function egoSourceUrl(cfg: EgoSiteConfig, p: EgoProperty): string {
  const title = (p.Title ?? "").trim();
  const base = title || `${p.Type ?? ""} ${p.Rooms ?? 0} habitaciones ${p.Description ?? ""}`;
  let slug = fold(base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 100);
  if (title) slug = slug.replace(/-+$/, "");
  return `${cfg.siteBase}/${cfg.detailPath}/${slug}/${p.ID}`;
}

// Algunos inmuebles llegan sin título. En vez de "Vivienda 123" se compone uno
// neutro con lo que sí sabemos: "Piso de 3 habitaciones en Centro".
function fallbackTitle(p: EgoProperty, zone: string): string {
  const type = p.Type?.trim() || "Vivienda";
  const rooms = positive(p.Rooms);
  const roomsText = rooms ? ` de ${rooms} ${rooms === 1 ? "habitación" : "habitaciones"}` : "";
  return `${type}${roomsText} en ${zone}`;
}

// eGO → RawProperty. Devuelve null si el inmueble no entra en los criterios.
export function mapEgoProperty(cfg: EgoSiteConfig, p: EgoProperty): RawProperty | null {
  if (!p || !p.ID) return null;
  if (EXCLUDED_TYPES.test(p.Type ?? "")) return null;
  const op = pickOperation(p);
  if (!op) return null;
  if (op.operation === "rent" && op.price < RENT_MIN_PRICE) return null;
  const zone = egoZone(p);
  if (cfg.zoneFilter && !cfg.zoneFilter(zone, p)) return null;
  const photos = egoPhotos(p);
  if (photos.length === 0) return null;

  const title =
    (p.Title ?? "").replace(cfg.brand, "").replace(/\s{2,}/g, " ").trim() ||
    fallbackTitle(p, zone);
  const description = cleanEgoDescription(cfg, p.Description);
  const isTemporada = /temporada/i.test(`${title} ${description}`);
  const sqm = positive(p.GrossArea) ?? positive(p.NetArea);

  return {
    externalId: String(p.ID),
    sourceUrl: egoSourceUrl(cfg, p),
    title,
    description: description || undefined,
    operation: op.operation,
    stay: op.operation === "rent" ? (isTemporada ? "short" : "long") : undefined,
    propertyType: p.Type?.trim() || "Piso",
    price: op.price,
    bedrooms: positive(p.Rooms),
    bathrooms: bathroomsFrom(p, description),
    squareMeters: sqm ? Math.round(sqm) : undefined,
    zone,
    subzone: egoSubzone(title, zone, description),
    features: egoFeatures(p, description),
    photos,
  };
}

export function createEgoScraper(cfg: EgoSiteConfig): Scraper {
  return {
    key: cfg.key,
    label: cfg.label,
    agencySlug: cfg.agencySlug,
    scrape: async () => {
      const properties = await fetchAllEgoProperties(cfg);
      const results: RawProperty[] = [];
      for (const p of properties) {
        const mapped = mapEgoProperty(cfg, p);
        if (mapped) results.push(mapped);
      }
      return results;
    },
    // Autoridad de archivado: todos los inmuebles vivos que pasan los criterios.
    // Si la API falla, LANZA (el motor entonces no archiva nada).
    listExternalIds: async () => {
      const properties = await fetchAllEgoProperties(cfg);
      return properties
        .map((p) => mapEgoProperty(cfg, p))
        .filter((p): p is RawProperty => p !== null)
        .map((p) => p.externalId);
    },
  };
}
