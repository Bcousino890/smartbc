// ─────────────────────────────────────────────────────────────────────────────
// Lectores de la ficha de una web de agencia (PUROS, sin red) y robots.txt.
//
//   Mobilia   → parseMobiliaFicha (agency-web.ts)
//   Inmoweb   → parseInmowebFicha
//   cualquier otra web → parseGenericFicha: JSON-LD (RealEstateListing / Product /
//               Offer / Residence…), OpenGraph/meta, pares «etiqueta · valor» y galería.
//
// Mismo contrato que el lector de Mobilia (`AgencyWebParsed`): referencia, precio, m²,
// habitaciones, baños, descripción y fotos (en su versión grande/original cuando la URL
// lo permite sin trucos: quitar el tamaño del nombre o la carpeta de miniaturas).
// Pruebas: scripts/test-particulares-agency-web.mts con fichas reales en scripts/fixtures/.
// ─────────────────────────────────────────────────────────────────────────────

import * as cheerio from "cheerio";
import { isMobiliaImageUrl, toMobiliaOriginal } from "../sync/scrapers/mobilia";
import { isMobiliaHtml, parseMobiliaFicha, refFromUrl, type AgencyWebParsed } from "./agency-web";

export type AgencyWebReaderKind = "mobilia" | "inmoweb" | "generico";

// ── Utilidades ──────────────────────────────────────────────────────────────

const clean = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** «227.000€», «1.250,50 €», «575000» → número (null si no hay). */
export function parseEuros(s: string | null | undefined): number | null {
  const m = (s ?? "").replace(/ /g, " ").match(/\d[\d.,\s]*\d|\d/);
  if (!m) return null;
  let t = m[0].replace(/\s/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, "");
  else t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const intOf = (s: string | null | undefined): number | null => {
  const m = (s ?? "").match(/\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function htmlToText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n");
  const t = cheerio.load(`<div>${withBreaks}</div>`)("div").text();
  return t.replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function opOf(text: string | null | undefined): "rent" | "sale" | null {
  const m = (text ?? "").match(/\b(alquiler|alquilar|renta|en venta|venta|comprar)\b/i)?.[1]?.toLowerCase();
  if (!m) return null;
  return /alquil|renta/.test(m) ? "rent" : "sale";
}

// ── Fotos: miniatura → original ─────────────────────────────────────────────

const IMG_EXT = /\.(?:jpe?g|png|webp)(?:$|[?#])/i;
const NOT_PHOTO = /(?:^|[/_.-])(logo|icon|icono|sprite|favicon|banner|avatar|flag|bandera|placeholder|pixel|tracker|facebook|twitter|instagram|whatsapp|marker|loading|spinner|energ[ei]|certificado|qr)(?:[/_.\-?]|$)|\/(?:icons?|logos?|images\/ui|social)\//i;
/** Parámetros que solo piden otro tamaño: se pueden quitar sin cambiar la foto. */
const SIZE_PARAMS = new Set(["w", "h", "width", "height", "size", "resize", "quality", "q", "fit", "crop", "maxwidth", "maxheight"]);

/**
 * Versión grande/original de una foto SOLO con reglas seguras:
 *  · Mobilia: `.jpg` → `-original.jpg` (sin marca de agua);
 *  · Inmoweb: `/image/thumb/585_335/x.png` → `/image/x.png`;
 *  · sufijo de tamaño de WordPress `x-300x200.jpg` → `x.jpg`;
 *  · parámetros de tamaño (`?w=300`) fuera.
 * No se inventan rutas: lo que no encaja se devuelve tal cual.
 */
export function toOriginalImageUrl(url: string): string {
  if (isMobiliaImageUrl(url)) {
    const noSize = url.replace(/-(thumb|large|small|medium)(?=\.jpg)/i, "");
    return toMobiliaOriginal(noSize);
  }
  let u = url;
  u = u.replace(/(\/property\/\d+\/image)\/thumb\/\d+_\d+\//i, "$1/");
  u = u.replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)(?:$|[?#]))/i, "");
  const q = u.indexOf("?");
  if (q > -1) {
    const params = new URLSearchParams(u.slice(q + 1));
    const had = [...params.keys()].filter((k) => SIZE_PARAMS.has(k.toLowerCase()));
    if (had.length) {
      for (const k of had) params.delete(k);
      const rest = params.toString();
      u = u.slice(0, q) + (rest ? `?${rest}` : "");
    }
  }
  return u;
}

const stem = (u: string): string => (u.split("?")[0].split("/").pop() ?? "").replace(/\.[a-z0-9]{2,5}$/i, "").toLowerCase();
const BIG_HINT = /(original|full|large|big|zoom|propertyphoto|gallery|galeria)/i;

function absolutize(src: string, base: string): string | null {
  try {
    const u = new URL(src.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Fotos de la ficha: img/data-src/srcset/enlaces a imagen/og:image, sin logos ni iconos ni «pisos similares». */
export function collectGalleryPhotos($: cheerio.CheerioAPI, pageUrl: string, extra: string[] = [], max = 60): string[] {
  const cands: string[] = [];
  const push = (raw: string | undefined | null) => {
    if (!raw) return;
    const abs = absolutize(raw, pageUrl);
    if (abs && IMG_EXT.test(abs) && !NOT_PHOTO.test(abs) && !/^data:/i.test(raw)) cands.push(abs);
  };
  for (const e of extra) push(e);
  $("img").each((_, el) => {
    const $el = $(el);
    // Fuera: cabecera, pie, navegación y bloques de «similares / relacionados».
    if ($el.closest('header, footer, nav, aside, [class*="similar"], [class*="related"], [class*="relacionad"], [class*="suggest"], [class*="destacad"], [id*="similar"]').length) return;
    const w = Number($el.attr("width"));
    const h = Number($el.attr("height"));
    if ((w && w < 150) || (h && h < 100)) return;
    const srcset = $el.attr("srcset") ?? $el.attr("data-srcset");
    const bestSrcset = srcset
      ? srcset
          .split(",")
          .map((p) => p.trim().split(/\s+/))
          .sort((a, b) => (parseInt(b[1] ?? "0") || 0) - (parseInt(a[1] ?? "0") || 0))[0]?.[0]
      : undefined;
    push($el.attr("data-original") ?? $el.attr("data-full") ?? $el.attr("data-large") ?? $el.attr("data-zoom") ?? bestSrcset ?? $el.attr("data-src") ?? $el.attr("src"));
  });
  $("a[href]").each((_, el) => {
    const $el = $(el);
    if ($el.closest('header, footer, nav, aside, [class*="similar"], [class*="related"], [class*="relacionad"]').length) return;
    const href = $el.attr("href");
    const galleryish = $el.find("img").length > 0 || $el.is("[data-full], [data-thumb], [data-large], [data-fancybox], [data-lightbox]") || /(gallery|galeria|imagen|photo|foto|fancybox|lightbox|zoom)/i.test($el.attr("class") ?? "");
    if (href && IMG_EXT.test(href) && galleryish) push($el.attr("data-full") ?? href);
  });
  const best = new Map<string, string>();
  const order: string[] = [];
  for (const raw of cands) {
    const url = toOriginalImageUrl(raw);
    const key = stem(url);
    if (!key) continue;
    const cur = best.get(key);
    if (!cur) {
      best.set(key, url);
      order.push(key);
    } else if (BIG_HINT.test(url) && !BIG_HINT.test(cur)) best.set(key, url);
  }
  return order.slice(0, max).map((k) => best.get(k) as string);
}

// ── JSON-LD ─────────────────────────────────────────────────────────────────

type LD = Record<string, unknown>;

function jsonLdNodes($: cheerio.CheerioAPI): LD[] {
  const out: LD[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as LD;
    out.push(o);
    if (o["@graph"]) walk(o["@graph"]);
    if (o.mainEntity) walk(o.mainEntity);
    if (o.offers) walk(o.offers);
    if (o.itemOffered) walk(o.itemOffered);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).contents().text()));
    } catch {
      /* JSON-LD roto: se ignora */
    }
  });
  return out;
}

const LISTING_TYPES = /^(RealEstateListing|Product|Offer|Residence|SingleFamilyResidence|House|Apartment|Accommodation|Place|Room|Suite|Villa|ApartmentComplex)$/i;
const typeOf = (n: LD): string[] => (Array.isArray(n["@type"]) ? (n["@type"] as unknown[]) : [n["@type"]]).filter((t): t is string => typeof t === "string");

const valueOf = (v: unknown): unknown => (v && typeof v === "object" && "value" in (v as LD) ? (v as LD).value : v);

type Ld = {
  name?: string;
  description?: string;
  ref?: string;
  price?: number;
  m2?: number;
  beds?: number;
  baths?: number;
  images: string[];
  available?: boolean;
};

function readJsonLd($: cheerio.CheerioAPI): Ld {
  const out: Ld = { images: [] };
  for (const n of jsonLdNodes($).filter((x) => typeOf(x).some((t) => LISTING_TYPES.test(t)))) {
    out.name ??= typeof n.name === "string" ? clean(n.name) : undefined;
    out.description ??= typeof n.description === "string" ? htmlToText(n.description).slice(0, 4000) : undefined;
    const idv = n.sku ?? n.productID ?? n.identifier ?? n.mpn ?? n.propertyID;
    if (!out.ref && (typeof idv === "string" || typeof idv === "number")) out.ref = String(idv);
    const price = Number(valueOf(n.price));
    if (!out.price && Number.isFinite(price) && price > 0) out.price = Math.round(price);
    if (typeof n.availability === "string") out.available ??= /InStock|LimitedAvailability/i.test(n.availability);
    const fs = Number(valueOf(n.floorSize));
    if (!out.m2 && Number.isFinite(fs) && fs > 0) out.m2 = fs;
    const beds = Number(n.numberOfBedrooms ?? n.numberOfRooms);
    if (out.beds == null && Number.isFinite(beds)) out.beds = beds;
    const baths = Number(n.numberOfBathroomsTotal ?? n.numberOfBathrooms);
    if (out.baths == null && Number.isFinite(baths)) out.baths = baths;
    const im = n.image;
    for (const i of Array.isArray(im) ? im : im ? [im] : []) {
      const url = typeof i === "string" ? i : typeof (i as LD)?.url === "string" ? ((i as LD).url as string) : null;
      if (url) out.images.push(url);
    }
  }
  return out;
}

// ── Pares «etiqueta · valor» ────────────────────────────────────────────────

/** Etiquetas de características: `<strong>Habitaciones</strong> 3`, `<th>/<td>`, `<dt>/<dd>`, `<li>Baños: 2</li>`. */
function labelledFacts($: cheerio.CheerioAPI): Map<string, string> {
  const out = new Map<string, string>();
  const put = (label: string, value: string) => {
    const l = clean(label).replace(/[:：]\s*$/, "").toLowerCase();
    const v = clean(value);
    if (l && v && l.length <= 40 && !out.has(l)) out.set(l, v);
  };
  $("dt").each((_, el) => put($(el).text(), $(el).next("dd").text()));
  $("tr").each((_, el) => {
    const c = $(el).children("th,td");
    if (c.length === 2) put($(c[0]).text(), $(c[1]).text());
  });
  $("li, p, div.line, div.row, span.item").each((_, el) => {
    const $el = $(el);
    if ($el.children().length > 4) return;
    const st = $el.children("strong, b, label, span.label").first();
    if (st.length) {
      const label = st.text();
      const value = $el.clone().children("strong, b, label, span.label").first().remove().end().text();
      if (clean(value).length <= 40) put(label, value);
    }
  });
  return out;
}

const pick = (facts: Map<string, string>, re: RegExp): string | null => {
  for (const [k, v] of facts) if (re.test(k)) return v;
  return null;
};

// ── Lector genérico ─────────────────────────────────────────────────────────

// «Ref: X», «Referencia: X», «Nº de referencia: X»: con dos puntos o # y al menos un dígito (si no, «Ref. También…» daría «Tambi»).
const REF_TEXT = /\bref(?:erencia)?\.?\s*[:#]\s*([A-Za-z0-9._/-]*\d[A-Za-z0-9._/-]*)/i;

/** Último tramo de la ruta si parece una referencia («/propiedad/MV6245» → MV6245). */
function refFromLastSegment(url: string): string | null {
  try {
    const seg = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.[a-z]{3,4}$/i, "");
    return /^[A-Za-z0-9._-]{3,20}$/.test(seg) && /\d/.test(seg) && !/^\d{4}$/.test(seg) ? seg : null;
  } catch {
    return null;
  }
}

/** Lector para cualquier web de agencia (sin CMS conocido). null si la página no parece una ficha de inmueble. */
export function parseGenericFicha(html: string, pageUrl: string): AgencyWebParsed | null {
  if (!html || html.length < 500) return null;
  const $ = cheerio.load(html);
  const ld = readJsonLd($);
  const og = (p: string) => $(`meta[property="${p}"]`).attr("content")?.trim() || $(`meta[name="${p}"]`).attr("content")?.trim() || null;
  const title = ld.name ?? og("og:title") ?? (clean($("h1").first().text()) || clean($("title").first().text()) || null);
  const facts = labelledFacts($);

  // Texto visible de la ficha (sin cabecera/pie/similares) para las cifras que solo salen en prosa.
  const $main = $("main, article, #content, .content, body").first().clone();
  $main.find('script, style, noscript, header, footer, nav, aside, form, select, [class*="similar"], [class*="related"], [class*="relacionad"], [class*="suggest"]').remove();
  const text = clean($main.text());

  const price =
    ld.price ??
    parseEuros(og("product:price:amount") ?? og("og:price:amount")) ??
    parseEuros(pick(facts, /^(precio|price)/)) ??
    parseEuros($('[class*="price"], [class*="precio"], [itemprop="price"]').first().attr("content") ?? $('[class*="price"], [class*="precio"]').first().text()) ??
    parseEuros(text.match(/(\d{1,3}(?:\.\d{3})+|\d{4,})\s?€/)?.[0]);
  const m2 =
    ld.m2 ??
    intOf(pick(facts, /(sup(erficie)?\.?\s*(construida|const|útil|util)?|m²|metros|área|area)/)) ??
    intOf(text.match(/(\d{2,4}(?:[.,]\d+)?)\s?m(?:²|2)\b/)?.[1]);
  const beds =
    ld.beds ??
    intOf(pick(facts, /^(habitaciones|dormitorios|hab\.?|cuartos)/)) ??
    intOf(text.match(/(\d{1,2})\s*(?:habitaci|dormitor|hab\.)/i)?.[1]);
  const baths =
    ld.baths ??
    intOf(pick(facts, /^(baños|banos|aseos)/)) ??
    intOf(text.match(/(\d{1,2})\s*(?:baño|bano|aseo)/i)?.[1]);

  const refFact = pick(facts, /^(referencia|ref\.?|código|codigo|nº de referencia|n° de referencia)$/);
  const ref =
    (ld.ref && /\d/.test(ld.ref) ? ld.ref : null) ??
    (refFact && /^[A-Za-z0-9._/-]{3,24}$/.test(refFact) ? refFact : null) ??
    clean($("[itemprop='sku'], [class*='referencia'] span, [class*='reference'] span").first().text()).match(/^[A-Za-z0-9][A-Za-z0-9._/-]{2,24}$/)?.[0] ??
    text.match(REF_TEXT)?.[1]?.replace(/[.,;]+$/, "") ??
    refFromUrl(pageUrl) ??
    refFromLastSegment(pageUrl);

  const descNode = $('[itemprop="description"], [class*="description"], [class*="descripcion"], #descripcion, #description').first();
  const description =
    (descNode.length ? htmlToText(descNode.html() ?? "") : "") || ld.description || og("og:description") || clean($('meta[name="description"]').attr("content")) || null;

  const photos = collectGalleryPhotos($, pageUrl, [...ld.images, og("og:image") ?? ""]);

  // Una ficha de inmueble tiene al menos precio + (m² | habitaciones) o una referencia clara con fotos.
  const enough = (price && (m2 || beds)) || (ref && photos.length >= 2 && (m2 || beds || price));
  if (!enough) return null;
  return {
    ref: ref ? String(ref).slice(0, 40) : null,
    canonical_url: $('link[rel="canonical"]').attr("href")?.trim() ? (absolutize($('link[rel="canonical"]').attr("href") as string, pageUrl) ?? null) : null,
    title: title ? title.slice(0, 200) : null,
    operation: opOf(title) ?? opOf(og("og:title")) ?? opOf(clean($("title").first().text())) ?? opOf(pageUrl),
    price: price ?? null,
    square_meters: m2 ? Math.round(m2) : null,
    bedrooms: beds ?? null,
    bathrooms: baths ?? null,
    floor: pick(facts, /^(planta|altura|piso)/) ?? null,
    address: null,
    description: description ? description.slice(0, 4000) : null,
    photos,
    available: ld.available ?? null,
  };
}

// ── Lector de Inmoweb ───────────────────────────────────────────────────────

export function isInmowebHtml(html: string): boolean {
  return /static\.inmoweb\.es|staticweb\.inmoweb\.es|name="author" content="inmoweb\.es"/i.test(html);
}

/** Ficha de una web hecha con Inmoweb. null si es una web «fuera de servicio» o no es una ficha. */
export function parseInmowebFicha(html: string, pageUrl: string): AgencyWebParsed | null {
  if (!html || !isInmowebHtml(html)) return null;
  const $ = cheerio.load(html);
  const ref = clean($(".headerTitulo .headerLeft p span, .headerLeft p span").first().text()) || null;
  const priceText = clean($(".headerTitulo .precio, .headerRight .precio").first().text());
  const price = parseEuros(priceText);
  const facts = new Map<string, string>();
  $(".caracteristicasPrincipales li, #caracteristicas li, .detallesFicha li").each((_, el) => {
    const label = clean($(el).children("strong").first().text()).replace(/[:：]\s*$/, "").toLowerCase();
    const value = clean($(el).clone().children("strong").remove().end().text());
    if (label && value && !facts.has(label)) facts.set(label, value);
  });
  const m2 = intOf(pick(facts, /^sup\.? construida|^superficie/));
  const beds = intOf(pick(facts, /^habitaciones|^dormitorios/));
  const baths = intOf(pick(facts, /^baños|^banos/));
  const h1 = clean($(".headerTitulo h1, h1").first().text()) || clean($('meta[property="og:title"]').attr("content")) || null;
  const descP = $("#descripcionFicha p").first().html();
  const description = descP ? htmlToText(descP).slice(0, 4000) : clean($('meta[property="og:description"]').attr("content")) || null;
  const photos = collectGalleryPhotos($, pageUrl, [$('meta[property="og:image"]').attr("content") ?? ""]).filter((u) => /\/property\/\d+\/image\//i.test(u));
  if (!ref && price == null && photos.length === 0) return null;
  if (price == null && !m2 && !beds) return null;
  return {
    ref,
    canonical_url: $('link[rel="alternate"][hreflang="es"]').attr("href")?.trim() || null,
    title: h1,
    operation: opOf(h1),
    price,
    square_meters: m2 ? Math.round(m2) : null,
    bedrooms: beds,
    bathrooms: baths,
    floor: null,
    address: h1?.match(/\ben\s+([^,]+)/i)?.[1]?.trim() ?? null,
    description,
    photos,
    available: null,
  };
}

// ── Despacho ────────────────────────────────────────────────────────────────

/** Elige el lector por el HTML (no por la URL: una web con dominio propio puede usar Mobilia o Inmoweb). */
export function parseAgencyWebHtml(html: string, pageUrl: string): { cms: AgencyWebReaderKind; parsed: AgencyWebParsed } | null {
  if (isMobiliaHtml(html)) {
    const p = parseMobiliaFicha(html);
    if (p) return { cms: "mobilia", parsed: p };
  }
  if (isInmowebHtml(html)) {
    const p = parseInmowebFicha(html, pageUrl);
    return p ? { cms: "inmoweb", parsed: p } : null;
  }
  const g = parseGenericFicha(html, pageUrl);
  return g ? { cms: "generico", parsed: g } : null;
}

// ── robots.txt ──────────────────────────────────────────────────────────────

/**
 * ¿Permite robots.txt leer `pathAndQuery` a un lector con ese nombre? Reglas básicas:
 * grupo del propio agente o `*`, la regla más larga gana (Allow gana al empate), `*` y `$`.
 * Sin robots (vacío) todo está permitido.
 */
export function robotsAllows(robotsTxt: string | null | undefined, pathAndQuery: string, agent = "smartbc"): boolean {
  if (!robotsTxt) return true;
  type Rule = { allow: boolean; pat: string };
  const groups: Array<{ agents: string[]; rules: Rule[] }> = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      if (cur && value !== "") cur.rules.push({ allow: field === "allow", pat: value });
    } else lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)));
  const star = groups.filter((g) => g.agents.includes("*"));
  const rules = (mine.length ? mine : star).flatMap((g) => g.rules);
  const test = (pat: string): number => {
    const anchored = pat.endsWith("$");
    const body = (anchored ? pat.slice(0, -1) : pat).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${body}${anchored ? "$" : ""}`).test(pathAndQuery) ? pat.length : -1;
  };
  let best: { len: number; allow: boolean } | null = null;
  for (const r of rules) {
    const len = test(r.pat);
    if (len < 0) continue;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}
