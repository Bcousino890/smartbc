import type { RawPhoto, RawProperty, Scraper } from "../types";
import { extractFeaturesFromText } from "./level-real-estate";
import { cleanAgencyDescription, htmlToText } from "./clean-description";
import { normalizeZone, OTHER_ZONE_LABEL } from "@/lib/madrid-zones";

// Rentals HD / HD Luxury Rentals Apartments (https://rentalshd.com): WordPress
// con Elementor y SIN tipo de contenido "propiedad". Cada residencia es una
// página normal (/chamberi/, /colmenares/, /cortes/…) con título, una lista de
// iconos (dirección, dormitorios, baños), un párrafo y una galería. Se leen por
// la API REST de WordPress (/wp-json/wp/v2/pages), que devuelve también las
// páginas que no están enlazadas desde "Residencias".
//
// ⚠️ Lo decidido con BC: la web NO publica precios ni apenas datos. Entran
// TODAS sus residencias con su enlace y precio 0 ("Precio a consultar"); cuando
// una interese, el equipo pide precio y detalles a la agencia a mano. El motor
// de sync conserva el precio tecleado (ver lib/sync/price-rules.ts).
//
//   • Operación: alquiler de temporada (su web: "apartamentos corporativos",
//     "hogar temporal"). Sin mínimo de precio (no lo hay).
//   • Una propiedad por página, también en las dobles ("Cortes I & II").
//   • Marcador de "esta página es una residencia": el botón "Consultor
//     disponibilidad", presente en todas y solo en ellas.
//
// Su firewall (ModSecurity) responde 406 a user agents cortos: hay que usar el
// de un navegador real. Fotos: originales de wp-content/uploads, sin marca de
// agua; se toma la variante más grande del `srcset` (siempre existe).
const SITE_BASE = "https://rentalshd.com";
const API_BASE = `${SITE_BASE}/wp-json/wp/v2`;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 25_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const PAGE_FIELDS = "id,slug,link,title,content,modified";

export const RESIDENCE_MARKER = /consultor\s+disponibilidad/i;

// Párrafos de plantilla que se repiten en todas las páginas (pitch de la
// agencia, llamadas a la acción, aviso del formulario). No describen el piso.
const GENERIC_PARAGRAPH =
  /pr[oó]ximo escenario de su vida|seleccionamos el espacio que definir[aá]|dar forma a su pr[oó]ximo proyecto|delegar la transformaci[oó]n|activa javascript|elevamos el real estate|cuidada colecci[oó]n de propiedades exclusivas/i;

export type WpPage = {
  id: number;
  slug: string;
  link: string;
  modified?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
};

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

// Todas las páginas publicadas. WordPress responde 400 al pedir una página más
// allá de la última; a partir de la segunda eso significa "se acabó".
//
// IMPORTANTE: ante cualquier otro fallo LANZA en vez de devolver []. Este
// listado es la autoridad de archivado: una lista vacía por un error de red
// haría que el motor archivase todas las residencias.
export async function fetchAllPages(): Promise<WpPage[]> {
  const all: WpPage[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchJson<WpPage[]>(
      `${API_BASE}/pages?per_page=${PAGE_SIZE}&page=${page}&_fields=${PAGE_FIELDS}`,
    );
    if (!res.ok) {
      if (page > 1 && res.status === 400) break;
      throw new Error(`rentalshd_pages_http_${res.status}`);
    }
    if (!Array.isArray(res.data)) throw new Error("rentalshd_pages_malformed");
    all.push(...res.data);
    if (res.data.length < PAGE_SIZE) break;
  }
  if (all.length === 0) throw new Error("rentalshd_pages_empty");
  return all;
}

// ── Parseo del contenido Elementor ──────────────────────────────────────────

function contentOf(page: WpPage): string {
  return page.content?.rendered ?? "";
}

export function isResidencePage(page: WpPage): boolean {
  return RESIDENCE_MARKER.test(htmlToText(contentOf(page)));
}

export type IconList = { address?: string; bedroomsRaw?: string; bathroomsRaw?: string };

// Lista de iconos: `<li><span><svg class="e-fas-bed"…/></span><span
// class="elementor-icon-list-text">2</span></li>`. El icono dice qué es cada
// valor; el viewBox del SVG sirve de respaldo si cambian las clases.
export function parseIconList(html: string): IconList {
  const out: IconList = {};
  const ul = html.match(/<ul class="elementor-icon-list-items[^"]*">[\s\S]*?<\/ul>/)?.[0];
  if (!ul) return out;
  for (const li of ul.match(/<li[\s\S]*?<\/li>/g) ?? []) {
    const value = htmlToText(li.match(/<span class="elementor-icon-list-text">([\s\S]*?)<\/span>/)?.[1] ?? "");
    if (!value) continue;
    const svgClass = li.match(/<svg[^>]*class="([^"]*)"/)?.[1] ?? "";
    const viewBox = li.match(/viewBox="([^"]*)"/)?.[1] ?? "";
    if (/map-marker|location/i.test(svgClass) || viewBox === "0 0 384 512") out.address ??= value;
    else if (/bed/i.test(svgClass) || viewBox === "0 0 640 512") out.bedroomsRaw ??= value;
    else if (/shower|bath/i.test(svgClass) || viewBox === "0 0 512 512") out.bathroomsRaw ??= value;
  }
  return out;
}

// "2" → 2, "ÚNICO DORMITORIO" → 1, "1 + ASEO CORTESIA" → 1.
export function parseCount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  if (/[uú]nic[oa]/i.test(raw)) return 1;
  const m = raw.match(/\d+/);
  return m ? parseInt(m[0], 10) : undefined;
}

// "CALLE COLMENARES 5" → "Calle Colmenares 5".
export function titleCaseAddress(raw: string): string {
  const small = new Set(["de", "del", "la", "las", "los", "y", "e"]);
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function rentalshdTitle(page: WpPage): string {
  const h1 = page.content?.rendered?.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1];
  const fromH1 = h1 ? htmlToText(h1).replace(/\s+/g, " ").trim() : "";
  if (fromH1) return fromH1;
  const plain = htmlToText(page.title?.rendered ?? "").trim();
  return plain ? `Residencia ${titleCaseAddress(plain)}` : `Residencia ${page.slug}`;
}

// Zona por calle/slug (son seis residencias conocidas); normalizeZone como
// respaldo para las que añadan, y "Madrid" si nada encaja.
const ZONE_BY_KEYWORD: Array<{ match: RegExp; zone: string; subzone?: string }> = [
  { match: /castell[oó]/i, zone: "Salamanca" },
  { match: /diego[\s-]+de[\s-]+le[oó]n/i, zone: "Salamanca" },
  { match: /recoletos/i, zone: "Salamanca", subzone: "Recoletos" },
  { match: /colmenares/i, zone: "Centro", subzone: "Justicia" },
  { match: /\bcortes\b/i, zone: "Centro", subzone: "Cortes" },
  { match: /chamber[ií]/i, zone: "Chamberí" },
];

export function rentalshdZone(page: Pick<WpPage, "slug">, address?: string, title?: string): { zone: string; subzone?: string } {
  const haystack = `${page.slug} ${address ?? ""} ${title ?? ""}`;
  for (const z of ZONE_BY_KEYWORD) {
    if (z.match.test(haystack)) return { zone: z.zone, subzone: z.subzone };
  }
  // "Calle de Goya 12" → "Goya" antes de buscar el barrio.
  const street = address
    ?.replace(/^(calle|c\/|paseo|avenida|avda\.?|plaza|pza\.?|ronda|glorieta)\s+(de\s+(la\s+|los\s+|las\s+)?|del\s+)?/i, "")
    .replace(/\s*\d.*$/, "")
    .trim();
  for (const c of [street, address, title]) {
    if (!c) continue;
    const n = normalizeZone(c);
    if (n.district !== OTHER_ZONE_LABEL) return { zone: n.district, subzone: n.barrio ?? undefined };
  }
  return { zone: "Madrid" };
}

export function rentalshdDescription(html: string): string {
  // `<p(?:\s…)?>` y no `<p[^>]*>`: este último también casa con `<path>`.
  const paragraphs = (html.match(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/g) ?? [])
    .map((p) => htmlToText(p).replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 40 && !GENERIC_PARAGRAPH.test(t));
  return cleanAgencyDescription(paragraphs.join("\n\n"), { brand: /rentals\s*hd|hd\s*luxury|rentalhd/i });
}

// Galería: cada <img> de wp-content/uploads, en orden, tomando la variante más
// grande del srcset (existe seguro; la "original" sin sufijo puede no servirse).
// Fuera logos, SVG y plugins; sin repetir la misma foto en dos tamaños.
export function rentalshdPhotos(html: string): RawPhoto[] {
  const seen = new Set<string>();
  const out: RawPhoto[] = [];
  for (const img of html.match(/<img[^>]+>/g) ?? []) {
    const src = img.match(/\ssrc="([^"]+)"/)?.[1] ?? "";
    if (!src.startsWith(`${SITE_BASE}/wp-content/uploads/`)) continue;
    if (/\/plugins\/|logo|\.svg(?:$|\?)/i.test(src)) continue;
    let best = src;
    let bestW = 0;
    const srcset = img.match(/\ssrcset="([^"]+)"/)?.[1];
    for (const part of srcset?.split(",") ?? []) {
      const [url, w] = part.trim().split(/\s+/);
      const width = parseInt(w ?? "0", 10);
      if (url && width > bestW) {
        best = url;
        bestW = width;
      }
    }
    if (!/\.(jpe?g|png|webp)(?:$|\?)/i.test(best)) continue;
    const key = best
      .split("/")
      .pop()!
      .replace(/-\d+x\d+(?=\.\w+$)/, "")
      .replace(/-scaled(?=\.\w+$)/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: best });
  }
  return out;
}

export function residenceIds(pages: WpPage[]): string[] {
  return pages.filter((p) => p.id && isResidencePage(p)).map((p) => String(p.id));
}

// Página → RawProperty. null si no es una residencia.
export function mapRentalshdPage(page: WpPage): RawProperty | null {
  if (!page?.id || !isResidencePage(page)) return null;
  const html = contentOf(page);
  const icons = parseIconList(html);
  const title = rentalshdTitle(page);
  const address = icons.address ? titleCaseAddress(icons.address) : undefined;
  const { zone, subzone } = rentalshdZone(page, address, title);
  const description = rentalshdDescription(html);

  return {
    externalId: String(page.id),
    sourceUrl: page.link,
    title,
    description: description || undefined,
    operation: "rent",
    stay: "short",
    propertyType: "Piso",
    // Sin precio público: 0 = "Precio a consultar" (ver lib/sync/price-rules.ts).
    price: 0,
    bedrooms: parseCount(icons.bedroomsRaw),
    bathrooms: parseCount(icons.bathroomsRaw),
    zone,
    subzone,
    address,
    features: extractFeaturesFromText(`${title} ${description}`),
    photos: rentalshdPhotos(html),
  };
}

export const rentalshdScraper: Scraper = {
  key: "rentalshd",
  label: "Rentals HD (web, sin precio público)",
  agencySlug: "rentalshd",
  scrape: async () => {
    const pages = await fetchAllPages();
    return pages.map(mapRentalshdPage).filter((p): p is RawProperty => p !== null);
  },
  // Autoridad de archivado: las páginas de residencia publicadas. Si la API
  // falla, LANZA (el motor entonces no archiva nada).
  listExternalIds: async () => residenceIds(await fetchAllPages()),
};
