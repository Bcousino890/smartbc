import type { RawPhoto, RawProperty, Scraper } from "../types";
import { extractFeaturesFromText } from "./level-real-estate";
import { cleanAgencyDescription } from "./clean-description";
import { normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";

// EnfoKa (https://www.enfoka.es) es un WordPress con el tema inmobiliario
// Houzez. Las fichas son páginas Elementor casi vacías de texto, pero WordPress
// expone TODO por su API REST pública (/wp-json/wp/v2/properties): precio, m²,
// habitaciones, baños, dirección, galería (ids de media), características y las
// taxonomías. Así que no se scrapea HTML: se pide la API.
//
// ⚠️ Lo importante para BC: EnfoKa NO retira los pisos vendidos, les pone la
// etiqueta "Vendido" (taxonomía `property_status`). Solo se importan los que
// NO la tienen. "Reservado" (y su variante con errata "Resercado") también se
// excluye. En octubre de 2026: 36 fichas, 28 vendidas.
//
// Dos tipos de ficha, por la etiqueta `property_label`:
//   • "EnfoKa Living": vivienda de lujo con precio ("Precio: 1.890.000€").
//   • "EnfoKa Inversiones": producto de inversión SIN precio de venta público
//     (el campo precio dice "Rentabilidad del 5% al 5,5% Alquiler estimado:
//     1.400€"). Sin precio no hay propiedad en el CRM: se descartan.
//
// Criterios de captación (decididos con BC): venta a cualquier precio, alquiler
// desde 3.000 €/mes, solo Madrid (toda su cartera), solo fichas con precio.
//
// Fotos: originales en wp-content/uploads (hasta 5.000 px), sin marca de agua
// (verificado). La galería incluye a veces el plano ("Plano-Pelayo.png"); se
// descarta por nombre.
const SITE_BASE = "https://www.enfoka.es";
const API_BASE = `${SITE_BASE}/wp-json/wp/v2`;
const USER_AGENT = "smartbc-bot/1.0 (contacto@bcousinoprop.com)";
const REQUEST_TIMEOUT_MS = 25_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const RENT_MIN_PRICE = 3000;

export const SOLD_STATUS = /vendid|reservad|resercad/i;

export type WpTerm = { id: number; name: string; slug?: string };
export type WpMedia = { id: number; source_url?: string; mime_type?: string };
export type WpPost = {
  id: number;
  link: string;
  title?: { rendered?: string };
  property_label?: number[];
  property_status?: number[];
  property_type?: number[];
  property_area?: number[];
  property_feature?: number[];
  featured_media?: number;
  yoast_head_json?: { title?: string; description?: string };
  property_meta?: Record<string, string[] | undefined>;
};
export type EnfokaCatalog = {
  posts: WpPost[];
  status: WpTerm[];
  types: WpTerm[];
  areas: WpTerm[];
  features: WpTerm[];
};

const POST_FIELDS =
  "id,link,title,property_label,property_status,property_type,property_area,property_feature,featured_media,yoast_head_json,property_meta";

async function fetchJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTerms(taxonomy: string): Promise<WpTerm[]> {
  const res = await fetchJson<WpTerm[]>(`${API_BASE}/${taxonomy}?per_page=100&_fields=id,name,slug`);
  if (!res.ok) throw new Error(`enfoka_${taxonomy}_http_${res.status}`);
  if (!Array.isArray(res.data)) throw new Error(`enfoka_${taxonomy}_malformed`);
  return res.data;
}

// Todas las fichas publicadas. WordPress responde 400 al pedir una página más
// allá de la última; a partir de la segunda eso significa "se acabó".
//
// IMPORTANTE: ante cualquier otro fallo LANZA en vez de devolver []. Este
// listado es la autoridad de archivado: una lista vacía por un error de red
// haría que el motor archivase toda la cartera.
async function fetchAllPosts(): Promise<WpPost[]> {
  const all: WpPost[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchJson<WpPost[]>(
      `${API_BASE}/properties?per_page=${PAGE_SIZE}&page=${page}&_fields=${POST_FIELDS}`,
    );
    if (!res.ok) {
      if (page > 1 && res.status === 400) break;
      throw new Error(`enfoka_properties_http_${res.status}`);
    }
    if (!Array.isArray(res.data)) throw new Error("enfoka_properties_malformed");
    all.push(...res.data);
    if (res.data.length < PAGE_SIZE) break;
  }
  if (all.length === 0) throw new Error("enfoka_properties_empty");
  return all;
}

export async function fetchEnfokaCatalog(): Promise<EnfokaCatalog> {
  const [posts, status, types, areas, features] = await Promise.all([
    fetchAllPosts(),
    fetchTerms("property_status"),
    fetchTerms("property_type"),
    fetchTerms("property_area"),
    fetchTerms("property_feature"),
  ]);
  return { posts, status, types, areas, features };
}

async function fetchMediaUrls(ids: number[]): Promise<Map<number, WpMedia>> {
  const out = new Map<number, WpMedia>();
  if (ids.length === 0) return out;
  const res = await fetchJson<WpMedia[]>(
    `${API_BASE}/media?include=${ids.join(",")}&per_page=100&_fields=id,source_url,mime_type`,
  );
  if (!res.ok || !Array.isArray(res.data)) return out;
  for (const m of res.data) out.set(m.id, m);
  return out;
}

// ── Mapeo ───────────────────────────────────────────────────────────────────

function meta(post: WpPost, key: string): string {
  return (post.property_meta?.[key]?.[0] ?? "").trim();
}

function names(ids: number[] | undefined, terms: WpTerm[]): string[] {
  const byId = new Map(terms.map((t) => [t.id, t.name]));
  return (ids ?? []).map((id) => byId.get(id)).filter((n): n is string => !!n);
}

// "Precio: 1.890.000€" → venta; "2.500 €/mes" → alquiler; "Rentabilidad del 5%
// al 5,5% Alquiler estimado: 1.400€" → null (no hay precio de venta).
export function parseEnfokaPrice(raw: string): { price: number; operation: "sale" | "rent" } | null {
  if (!raw || /rentabilidad/i.test(raw)) return null;
  const m = raw.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,})\s*€/);
  if (!m) return null;
  const price = Number(m[1].replace(/[.\s]/g, ""));
  if (!Number.isFinite(price) || price <= 0) return null;
  const operation = /\/\s*mes|al mes|mensual/i.test(raw) ? "rent" : "sale";
  return { price, operation };
}

const TYPE_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /^piso$/i, label: "Piso" },
  { match: /^estudio$/i, label: "Estudio" },
  { match: /^[aá]tico$/i, label: "Ático" },
  { match: /^d[uú]plex$/i, label: "Dúplex" },
  { match: /^casa|chalet/i, label: "Chalet" },
  { match: /^apartamento$/i, label: "Apartamento" },
];

function propertyTypeOf(post: WpPost, cat: EnfokaCatalog): string {
  for (const name of names(post.property_type, cat.types)) {
    for (const t of TYPE_LABELS) if (t.match.test(name)) return t.label;
  }
  return "Piso";
}

// Zona: primero la taxonomía de barrio/distrito de la ficha; si no, la
// dirección geocodificada ("42, Calle de Pelayo, Chueca, Justicia, Centro,
// Madrid, …"), que normalizeZone recorre tramo a tramo.
export function enfokaZone(post: WpPost, cat: EnfokaCatalog): { zone: string; subzone?: string } {
  const candidates = [...names(post.property_area, cat.areas), meta(post, "fave_property_map_address")];
  for (const c of candidates) {
    const n = normalizeZone(c);
    if (n.district !== OTHER_ZONE_LABEL) return { zone: n.district, subzone: n.barrio ?? undefined };
  }
  return { zone: "Madrid" };
}

const FEATURE_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /^aire acondicionado/i, label: "Aire acondicionado" },
  { match: /^balc[oó]n/i, label: "Balcón" },
  { match: /^calefacci[oó]n/i, label: "Calefacción" },
  { match: /^terraza/i, label: "Terraza" },
  { match: /^ascensor/i, label: "Ascensor" },
  { match: /^piscina/i, label: "Piscina" },
  { match: /^garaje|^parking/i, label: "Garaje" },
  { match: /^trastero/i, label: "Trastero" },
  { match: /^jard[ií]n/i, label: "Jardín" },
];

export function cleanEnfokaDescription(raw: string | null | undefined): string {
  return cleanAgencyDescription(raw, { brand: /enfoka/i });
}

// El título SEO ("Exclusiva vivienda a estrenar en Justicia-Chueca, Madrid -
// Enfoka") es el bueno. Cuando es solo la dirección ("Hortaleza, 96 - Enfoka")
// se compone uno neutro: no queremos el número de portal como titular.
function titleOf(post: WpPost, type: string, zone: string, subzone?: string): string {
  const seo = (post.yoast_head_json?.title ?? "")
    .replace(/\s*[-|–]\s*enfoka\s*$/i, "")
    .replace(/enfoka/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const plain = (post.title?.rendered ?? "").replace(/&#?\w+;/g, "").trim();
  const looksLikeAddress = (s: string) => /^[^,]+,\s*\d+\s*[a-zº]?$/i.test(s);
  if (seo && seo !== plain && !looksLikeAddress(seo)) return seo;
  return `${type} en ${subzone ?? zone}`;
}

// Galería en el orden de la ficha. Fuera los planos y lo que no sea imagen.
export function enfokaPhotos(post: WpPost, media: Map<number, WpMedia>): RawPhoto[] {
  const ids = (post.property_meta?.fave_property_images ?? []).map((s) => Number(s)).filter((n) => n > 0);
  if (post.featured_media && !ids.includes(post.featured_media)) ids.unshift(post.featured_media);
  const seen = new Set<string>();
  const out: RawPhoto[] = [];
  for (const id of ids) {
    const m = media.get(id);
    const url = m?.source_url;
    if (!url) continue;
    if (m?.mime_type && !/^image\/(jpe?g|png|webp)$/i.test(m.mime_type)) continue;
    if (/plano|plan[-_]|floor/i.test(url.split("/").pop() ?? "")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url });
  }
  return out;
}

// WordPress → RawProperty. `media` null = modo listado (sin exigir fotos).
export function mapEnfokaProperty(
  post: WpPost,
  cat: EnfokaCatalog,
  media: Map<number, WpMedia> | null,
): RawProperty | null {
  if (!post?.id) return null;
  if (names(post.property_status, cat.status).some((n) => SOLD_STATUS.test(n))) return null;
  const priced = parseEnfokaPrice(meta(post, "fave_property_price"));
  if (!priced) return null;
  if (priced.operation === "rent" && priced.price < RENT_MIN_PRICE) return null;

  const photos = media ? enfokaPhotos(post, media) : [];
  if (media && photos.length === 0) return null;

  const type = propertyTypeOf(post, cat);
  const { zone, subzone } = enfokaZone(post, cat);
  const title = titleOf(post, type, zone, subzone);
  const description = cleanEnfokaDescription(post.yoast_head_json?.description);

  const features = new Set<string>();
  for (const name of names(post.property_feature, cat.features)) {
    for (const f of FEATURE_LABELS) if (f.match.test(name)) features.add(f.label);
  }
  for (const f of extractFeaturesFromText(`${title} ${description}`)) features.add(f);

  const int = (s: string) => {
    const m = s.match(/\d+/);
    return m ? parseInt(m[0], 10) : undefined;
  };

  return {
    externalId: String(post.id),
    sourceUrl: post.link,
    title,
    description: description || undefined,
    operation: priced.operation,
    stay: priced.operation === "rent" ? "long" : undefined,
    propertyType: type,
    price: priced.price,
    bedrooms: int(meta(post, "fave_property_bedrooms")),
    bathrooms: int(meta(post, "fave_property_bathrooms")),
    squareMeters: int(meta(post, "fave_property_size")),
    zone,
    subzone,
    address: meta(post, "fave_property_address") || undefined,
    features: [...features],
    photos,
  };
}

export const enfokaScraper: Scraper = {
  key: "enfoka",
  label: "EnfoKa (API WordPress, sin vendidos)",
  agencySlug: "enfoka",
  scrape: async () => {
    const cat = await fetchEnfokaCatalog();
    const results: RawProperty[] = [];
    for (const post of cat.posts) {
      // Primero sin fotos (barato): si no pasa los criterios, no pedimos media.
      if (!mapEnfokaProperty(post, cat, null)) continue;
      const ids = (post.property_meta?.fave_property_images ?? []).map(Number);
      if (post.featured_media) ids.push(post.featured_media);
      const media = await fetchMediaUrls(ids.filter((n) => n > 0));
      const mapped = mapEnfokaProperty(post, cat, media);
      if (mapped) results.push(mapped);
    }
    return results;
  },
  // Autoridad de archivado: fichas vivas (publicadas, no vendidas, con precio).
  listExternalIds: async () => {
    const cat = await fetchEnfokaCatalog();
    return cat.posts
      .map((post) => mapEnfokaProperty(post, cat, null))
      .filter((p): p is RawProperty => p !== null)
      .map((p) => p.externalId);
  },
};
