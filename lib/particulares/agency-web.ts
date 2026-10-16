// ─────────────────────────────────────────────────────────────────────────────
// «Web propia de la agencia»: la ficha del piso en la web de la agencia anunciante
// (el «Enlace adicional» de un anuncio de Idealista, `scraper_extra.agency_url`).
//
// PURO (sin red ni BD): normaliza la URL, reconoce el CMS, extrae la ficha de
// Mobilia y compara con el anuncio. La parte que hace la petición y la caché es
// `agency-web-runner.ts`. Pruebas: scripts/test-particulares-agency-web.mts.
// ─────────────────────────────────────────────────────────────────────────────

import * as cheerio from "cheerio";
import { extractMobiliaPhotos, toMobiliaOriginal } from "../sync/scrapers/mobilia";
import type { AgencyWebCms, AgencyWebSource, WebVerdict } from "./links-types";
import { normRef } from "./similarity";

export type { AgencyWebCms, AgencyWebSource, WebVerdict };

export type NormalizedAgencyUrl = {
  /** URL limpia (sin #, sin utm/fbclid, sin «/» final salvo la raíz). */
  url: string;
  host: string;
  /** Host sin «www.». */
  domain: string;
  path: string;
  /** Clave de caché/comparación: dominio + ruta en minúsculas + query ordenada. */
  key: string;
  /** Ruta con contenido: una ficha (no la portada de la agencia). */
  isListing: boolean;
};

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|_hs|yclid$)/i;

export function normalizeAgencyUrl(raw: string | null | undefined): NormalizedAgencyUrl | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".")) return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  let path = u.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  u.pathname = path;
  const domain = host.replace(/^www\./, "");
  const query = u.searchParams.toString();
  const isListing = path !== "/" && path !== "" && path.length > 1;
  return {
    url: `${u.protocol}//${u.host}${path}${query ? `?${query}` : ""}`,
    host,
    domain,
    path,
    key: `${domain}${path.toLowerCase()}${query ? `?${query.toLowerCase()}` : ""}`,
    isListing,
  };
}

/** CMS por la forma de la URL. Solo estos se leen; el resto se muestra pero no se toca. */
export function detectCms(url: string | null | undefined): AgencyWebCms {
  const n = normalizeAgencyUrl(url);
  if (!n) return null;
  if (/\/Mobilia\/VerInmueble\/\d+\/Ficha\.html$/i.test(n.path)) return "mobilia";
  if (/(^|\.)mobiliagestion\.es$/.test(n.domain) && n.isListing) return "mobilia";
  if (/(^|\.)inmoweb\.page$/.test(n.domain) || /\/details-es\d+\.html$/i.test(n.path)) return "inmoweb";
  return null;
}

/** Referencia que va dentro de la URL bonita («…/pisos/ref-3617_1091» → «3617»). */
export function refFromUrl(url: string | null | undefined): string | null {
  const n = normalizeAgencyUrl(url);
  if (!n) return null;
  const m = n.path.match(/\/ref-([A-Za-z0-9-]+?)(?:_\d+)?(?:\.html?)?$/);
  return m ? m[1] : null;
}

// ── Ficha de Mobilia ────────────────────────────────────────────────────────

export type AgencyWebParsed = {
  ref: string | null;
  /** <link rel="canonical"> (la URL bonita a la que redirige /Mobilia/VerInmueble/…). */
  canonical_url: string | null;
  title: string | null;
  operation: "rent" | "sale" | null;
  price: number | null;
  square_meters: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  /** Mobilia no publica la calle: barrio/municipio del título («Madrid (Salamanca)»). */
  address: string | null;
  description: string | null;
  /** Fotos ORIGINALES (sin marca de agua: `-original.jpg`). */
  photos: string[];
  available: boolean | null;
};

const num = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const m = s.replace(/\s/g, "").match(/\d[\d.,]*/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Mobilia pinta la ficha con la clase `IDPropiedadBig` («Dormitorios <strong>3</strong>»). */
function mobiliaFacts($: cheerio.CheerioAPI): Map<string, string> {
  const out = new Map<string, string>();
  $(".IDPropiedadBig").each((_, el) => {
    const $el = $(el);
    const value = $el.find("strong").first().text().replace(/\s+/g, " ").trim();
    const label = $el.clone().children().remove().end().text().replace(/\s+/g, " ").trim().toLowerCase();
    if (label && !out.has(label)) out.set(label, value);
  });
  return out;
}

function htmlToText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/li>/gi, "\n");
  const t = cheerio.load(`<div>${withBreaks}</div>`)("div").text();
  return t
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isMobiliaHtml(html: string): boolean {
  return /media\.mobiliagestion\.es|ZwPortal|mobiliagestion\.es/i.test(html);
}

/** Extrae la ficha de una página de Mobilia (sin red). Devuelve null si no parece una ficha. */
export function parseMobiliaFicha(html: string): AgencyWebParsed | null {
  if (!html || !isMobiliaHtml(html)) return null;
  const $ = cheerio.load(html);
  const og = (p: string) => $(`meta[property="${p}"]`).attr("content")?.trim() || null;
  const title = og("og:title") ?? ($("title").first().text().replace(/\s+/g, " ").trim() || null);

  // Referencia: «… | Ref: 3617».
  let ref = title?.match(/Ref(?:erencia)?\.?:?\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*$/i)?.[1] ?? null;
  const canonical = $('link[rel="canonical"]').attr("href")?.trim() || null;
  if (!ref) ref = refFromUrl(canonical);
  if (!ref) {
    const dir = (og("og:image") ?? "").match(/\/Images\/([^/]+)\//i);
    if (dir) ref = dir[1];
  }

  // JSON-LD RealEstateListing → precio y disponibilidad.
  let price: number | null = null;
  let available: boolean | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text()) as Record<string, unknown>;
      if (String(j["@type"]) !== "RealEstateListing") return;
      const offers = j.offers as Record<string, unknown> | undefined;
      if (offers) {
        const p = Number(offers.price);
        if (Number.isFinite(p) && p > 0) price = Math.round(p);
        if (typeof offers.availability === "string") available = /InStock/i.test(offers.availability);
      }
    } catch {
      /* JSON-LD roto: se ignora */
    }
  });

  const facts = mobiliaFacts($);
  const m2 = num(facts.get("construidos")) ?? num(og("og:description")?.match(/(\d+)\s*m2/i)?.[1]);
  const beds = num(facts.get("dormitorios")) ?? num(og("og:description")?.match(/(\d+)\s*habitaci/i)?.[1]);
  const baths = num(facts.get("baños")) ?? num(og("og:description")?.match(/(\d+)\s*baños?/i)?.[1]);
  const floor = facts.get("altura/planta") || null;

  const descHtml = $(".IDDescripcionBig").first().html();
  const description = descHtml ? htmlToText(descHtml).slice(0, 4000) || null : null;

  const op = title?.match(/en\s+(alquiler|venta)/i)?.[1]?.toLowerCase();
  const loc = title?.match(/\ben\s+(?:alquiler|venta)\s+en\s+(.+?)\s*(?:\||$)/i)?.[1]?.trim() ?? null;

  const photos = extractMobiliaPhotos($, ref ? { pathMustInclude: `/Images/${ref}/` } : {})
    .map((p) => p.url)
    .filter((u) => !/-(thumb|large|small|medium)-original\.jpg/i.test(u));
  // Respaldo: si la galería no está en <img> (carga diferida), al menos la portada.
  if (photos.length === 0) {
    const cover = og("og:image");
    if (cover) photos.push(toMobiliaOriginal(cover.replace(/-(large|thumb|small|medium)(?=\.jpg)/i, "")));
  }

  if (!ref && price == null && !m2 && photos.length === 0) return null;
  return {
    ref,
    canonical_url: canonical,
    title,
    operation: op === "alquiler" ? "rent" : op === "venta" ? "sale" : null,
    price,
    square_meters: m2,
    bedrooms: beds,
    bathrooms: baths,
    floor,
    address: loc,
    description,
    photos: [...new Set(photos)],
    available,
  };
}

// ── Comparación con el anuncio ──────────────────────────────────────────────

type AdFacts = {
  agency_url?: string | null;
  agency_reference?: string | null;
  reference?: string | null;
  price?: number | null;
  square_meters?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
};

/**
 * ¿La ficha leída es de ESTE anuncio? Referencia igual (la del anuncio contra la de la
 * ficha o la de la URL) y sin contradecir m², habitaciones ni baños = verificada. Una
 * referencia distinta = no coincide (la web ya apunta a otro piso). Sin lectura, solo
 * se compara la referencia que va dentro de la URL.
 */
export function verifyWebAgainstAd(web: { url: string; parsed?: AgencyWebParsed | null }, ad: AdFacts): WebVerdict {
  const adRefs = [normRef(ad.agency_reference), normRef(ad.reference)].filter((r): r is string => !!r);
  const webRef = normRef(web.parsed?.ref) ?? normRef(refFromUrl(web.parsed?.canonical_url ?? web.url));
  const reasons: string[] = [];
  if (!web.parsed) {
    if (webRef && adRefs.length && adRefs.includes(webRef)) return { state: "verificada", reasons: ["la referencia de la URL es la del anuncio"] };
    if (webRef && adRefs.length && !adRefs.includes(webRef)) return { state: "no_coincide", reasons: ["la referencia de la URL no es la del anuncio"] };
    return { state: "sin_leer", reasons };
  }
  const p = web.parsed;
  const conflicts: string[] = [];
  if (p.square_meters && ad.square_meters && Math.abs(p.square_meters - ad.square_meters) / Math.max(p.square_meters, ad.square_meters) > 0.1) conflicts.push("m² distintos");
  if (p.bedrooms != null && ad.bedrooms != null && p.bedrooms !== ad.bedrooms) conflicts.push("habitaciones distintas");
  if (p.bathrooms != null && ad.bathrooms != null && p.bathrooms !== ad.bathrooms) conflicts.push("baños distintos");
  const refEq = !!webRef && adRefs.includes(webRef);
  if (refEq) reasons.push("misma referencia");
  if (p.price && ad.price && p.price === ad.price) reasons.push("mismo precio");
  if (p.square_meters && ad.square_meters && !conflicts.includes("m² distintos")) reasons.push("m² coinciden");
  if (conflicts.length) return { state: "no_coincide", reasons: conflicts };
  if (refEq) return { state: "verificada", reasons };
  // Sin coincidir la referencia vale (precio + m² + habitaciones) a la vez.
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(1, Math.max(a, b) * tol);
  const same =
    !!p.price && !!ad.price && near(p.price, ad.price, 0.01) &&
    !!p.square_meters && !!ad.square_meters && near(p.square_meters, ad.square_meters, 0.03) &&
    p.bedrooms != null && ad.bedrooms != null && p.bedrooms === ad.bedrooms;
  if (same) return { state: "verificada", reasons: ["mismo precio, m² y habitaciones"] };
  if (webRef && adRefs.length) return { state: "no_coincide", reasons: ["referencia distinta"] };
  return { state: "sin_leer", reasons };
}

// ── Claves para el enlazador ────────────────────────────────────────────────

/**
 * Claves de la ficha en la web de la agencia, para el matching entre anuncios:
 *  · `wu:<url normalizada>`: la MISMA ficha enlazada desde dos anuncios;
 *  · `wk:<dominio>|<ref>`: misma agencia (dominio) + misma referencia, aunque la
 *    URL sea otra (redirección, idioma, /Mobilia/VerInmueble/… frente a la bonita).
 * Una portada sin ficha no genera nada (todos los pisos de la agencia la comparten).
 */
export function webKeysOf(agencyUrl: string | null | undefined, refs: Array<string | null | undefined>, extraUrls: Array<string | null | undefined> = []): string[] {
  const out = new Set<string>();
  for (const raw of [agencyUrl, ...extraUrls]) {
    const n = normalizeAgencyUrl(raw);
    if (!n || !n.isListing) continue;
    out.add(`wu:${n.key}`);
    const rs = [...refs, refFromUrl(raw)].map(normRef).filter((r): r is string => !!r);
    for (const r of new Set(rs)) out.add(`wk:${n.domain}|${r}`);
  }
  return [...out];
}

// ── Fila de la pestaña Fuentes ──────────────────────────────────────────────

export type AgencyWebCache = {
  url_key: string;
  status: "ok" | "gone" | "error" | "unsupported" | "blocked";
  error?: string | null;
  attempts?: number | null;
  final_url: string | null;
  canonical_url: string | null;
  cms: string | null;
  ref: string | null;
  data: Partial<AgencyWebParsed> | null;
  photos: string[];
  fetched_at: string | null;
};

type MemberLite = AdFacts & { id: string; owner_name?: string | null; advertiser_type?: string | null };

/** Fuentes «web propia» de un grupo de anuncios (solo URLs con ficha; la portada de la agencia no cuenta). */
export function buildAgencyWebSources(members: MemberLite[], cache: Map<string, AgencyWebCache> = new Map()): AgencyWebSource[] {
  const byKey = new Map<string, { n: NormalizedAgencyUrl; ms: MemberLite[] }>();
  for (const m of members) {
    const n = normalizeAgencyUrl(m.agency_url);
    if (!n || !n.isListing) continue;
    const e = byKey.get(n.key) ?? { n, ms: [] };
    e.ms.push(m);
    byKey.set(n.key, e);
  }
  const out: AgencyWebSource[] = [];
  for (const [key, { n, ms }] of byKey) {
    const c = cache.get(key) ?? null;
    const parsed = c?.status === "ok" ? ({ ...(c.data ?? {}), photos: c.photos ?? [], ref: c.ref ?? c.data?.ref ?? null, canonical_url: c.canonical_url } as AgencyWebParsed) : null;
    const first = ms[0];
    const blocked = c?.status === "blocked";
    const verdict: WebVerdict = blocked ? { state: "sin_leer", reasons: ["bloqueada por la web (robots.txt)"] } : verifyWebAgainstAd({ url: c?.final_url ?? n.url, parsed }, first);
    const note = blocked
      ? "Sin leer · bloqueada por la web"
      : c?.status === "error"
        ? `No se pudo leer${c.error ? ` (${c.error})` : ""}${(c.attempts ?? 0) >= MAX_WEB_ATTEMPTS ? " · reintentos agotados" : ""}`
        : c?.status === "gone"
          ? "La ficha ya no existe en la web"
          : c?.status === "unsupported"
            ? "Esta web no muestra los datos de la ficha sin JavaScript: no se puede leer"
            : null;
    const named = ms.map((m) => (m.advertiser_type === "professional" ? m.owner_name?.trim() : "")).find(Boolean) || null;
    out.push({
      key,
      url: n.url,
      canonical_url: c?.canonical_url ?? (c?.final_url && c.final_url !== n.url ? c.final_url : null),
      domain: n.domain,
      cms: (c?.cms as AgencyWebCms) || detectCms(n.url),
      ref: parsed?.ref ?? refFromUrl(c?.canonical_url ?? n.url) ?? first.agency_reference ?? first.reference ?? null,
      agency_name: named,
      member_ids: ms.map((m) => m.id),
      verdict,
      read: !!parsed,
      blocked,
      note,
      live: c?.status === "gone" ? false : parsed ? (parsed.available ?? true) : null,
      price: parsed?.price ?? null,
      square_meters: parsed?.square_meters ?? null,
      bedrooms: parsed?.bedrooms ?? null,
      bathrooms: parsed?.bathrooms ?? null,
      address: parsed?.address ?? null,
      fetched_at: c?.fetched_at ?? null,
      photos: (parsed?.photos ?? []).map((url) => ({ url })),
    });
  }
  return out;
}

// ── Qué leer y cómo guardarlo (puro) ────────────────────────────────────────
//
// Política de refresco: la web de la agencia se lee cuando se detecta su enlace y se refresca cada
// 14 días (WEB_REFRESH_DAYS). Antes de eso solo se vuelve a leer si cambia el anuncio del portal que sí
// rastreamos (precio, estado, referencia o el propio agency_url) o a petición manual («Releer web»).

/** Tope de URLs por pasada del job: no se martillea webs ajenas. */
export const MAX_WEB_FETCHES_PER_RUN = 30;
/** Tras tantos fallos seguidos se deja de reintentar sola (solo «Releer web» o un cambio del anuncio). */
export const MAX_WEB_ATTEMPTS = 6;

/** Refresco automático de una web ya leída. */
export const WEB_REFRESH_DAYS = 14;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type WebFetchResult =
  | { kind: "ok"; finalUrl: string; httpStatus: number; parsed: AgencyWebParsed; cms: AgencyWebCms | "generico" }
  | { kind: "gone"; finalUrl: string | null; httpStatus: number | null; reason: string }
  | { kind: "blocked"; reason: string }
  /** La página responde bien pero no trae datos de ficha en el HTML (se pinta con JavaScript): no se reintenta. */
  | { kind: "unsupported"; httpStatus: number | null; reason: string }
  | { kind: "error"; httpStatus: number | null; reason: string };

export type WebRowLite = {
  agency_url?: string | null;
  price?: number | null;
  is_active?: boolean | null;
  reference?: string | null;
  agency_reference?: string | null;
};

/** Huella de lo que rastreamos del anuncio del portal: si cambia, la web se vuelve a leer. */
export function webSigOf(rows: WebRowLite[]): string {
  return rows
    .map((r) => `${r.price ?? ""}|${r.is_active === false ? 0 : 1}|${normRef(r.agency_reference) ?? ""}|${normRef(r.reference) ?? ""}`)
    .sort()
    .join(";");
}

export type WebCacheLite = {
  status: string;
  trigger_sig?: string | null;
  next_retry_at: string | null;
  attempts?: number | null;
};

export type WebFetchPlan = {
  fetch: Array<{ n: NormalizedAgencyUrl; sig: string; attempts: number }>;
  /** Filas leídas antes de existir la huella: se les apunta sin leer nada. */
  backfill: Array<{ key: string; sig: string }>;
};

/**
 * Qué leer en esta pasada (máx. `limit`): las URLs nunca leídas; las que cambiaron en el anuncio del
 * portal; y los fallos cuyo reintento ya toca (con espera creciente y un máximo de intentos).
 * Una URL compartida por varios anuncios se lee una vez. Cualquier web con ruta de ficha vale
 * (Mobilia, Inmoweb o lector genérico); el robots.txt se mira al leer.
 */
export function planAgencyWebFetches(rows: WebRowLite[], cache: Map<string, WebCacheLite>, now: number, limit = MAX_WEB_FETCHES_PER_RUN): WebFetchPlan {
  const byKey = new Map<string, { n: NormalizedAgencyUrl; rows: WebRowLite[] }>();
  for (const r of rows) {
    const n = normalizeAgencyUrl(r.agency_url);
    if (!n || !n.isListing) continue;
    const e = byKey.get(n.key) ?? { n, rows: [] };
    e.rows.push(r);
    byKey.set(n.key, e);
  }
  const fresh: WebFetchPlan["fetch"] = [];
  const changed: WebFetchPlan["fetch"] = [];
  const retry: Array<WebFetchPlan["fetch"][number] & { due: number }> = [];
  const backfill: WebFetchPlan["backfill"] = [];
  for (const [key, { n, rows: rs }] of byKey) {
    const sig = webSigOf(rs);
    const c = cache.get(key);
    const attempts = c?.attempts ?? 0;
    if (!c) {
      fresh.push({ n, sig, attempts: 0 });
    } else if (c.trigger_sig != null && c.trigger_sig !== sig) {
      changed.push({ n, sig, attempts: 0 });
    } else if (c.status === "ok") {
      // Leída bien: se refresca a los 14 días (next_retry_at); si no hay fecha (filas antiguas) no se toca.
      const due = c.next_retry_at ? Date.parse(c.next_retry_at) : NaN;
      if (Number.isFinite(due) && due <= now) retry.push({ n, sig, attempts: 0, due });
      else if (c.trigger_sig == null) backfill.push({ key, sig });
    } else if (c.status === "error") {
      const due = c.next_retry_at ? Date.parse(c.next_retry_at) : NaN;
      if (attempts < MAX_WEB_ATTEMPTS && Number.isFinite(due) && due <= now) retry.push({ n, sig, attempts, due });
    } else if (c.trigger_sig == null) {
      backfill.push({ key, sig });
    }
  }
  retry.sort((a, b) => a.due - b.due);
  return { fetch: [...fresh, ...changed, ...retry.map(({ n, sig, attempts }) => ({ n, sig, attempts }))].slice(0, limit), backfill };
}

/** Espera antes de reintentar un fallo: 1 h, 2 h, 4 h … hasta 7 días. */
export function retryDelayMs(attempts: number): number {
  return Math.min(7 * DAY, HOUR * 2 ** Math.max(0, attempts - 1));
}

/** Resultado de una lectura → fila de `particulares_agency_webs`. Una lectura buena se refresca a los 14 días; ficha retirada o bloqueada, no. */
export function toCacheRow(n: NormalizedAgencyUrl, res: WebFetchResult, prevAttempts: number, now: number, sig: string | null = null) {
  const base = { url_key: n.key, url: n.url, domain: n.domain, fetched_at: new Date(now).toISOString(), trigger_sig: sig };
  if (res.kind === "ok") {
    const { photos, ref, canonical_url, ...data } = res.parsed;
    return {
      ...base, cms: res.cms, final_url: res.finalUrl, canonical_url: canonical_url ?? res.finalUrl, ref, status: "ok" as const,
      http_status: res.httpStatus, data, photos, attempts: 0, error: null,
      next_retry_at: new Date(now + WEB_REFRESH_DAYS * DAY).toISOString(),
    };
  }
  if (res.kind === "gone") {
    return {
      ...base, cms: detectCms(n.url), final_url: res.finalUrl, canonical_url: null, ref: refFromUrl(n.url), status: "gone" as const,
      http_status: res.httpStatus, data: {}, photos: [], attempts: 0, error: res.reason, next_retry_at: null as string | null,
    };
  }
  if (res.kind === "unsupported") {
    return {
      ...base, cms: detectCms(n.url), final_url: null, canonical_url: null, ref: refFromUrl(n.url), status: "unsupported" as const,
      http_status: res.httpStatus, data: {}, photos: [], attempts: 0, error: res.reason, next_retry_at: null as string | null,
    };
  }
  if (res.kind === "blocked") {
    return {
      ...base, cms: detectCms(n.url), final_url: null, canonical_url: null, ref: refFromUrl(n.url), status: "blocked" as const,
      http_status: null, data: {}, photos: [], attempts: 0, error: res.reason, next_retry_at: null as string | null,
    };
  }
  const attempts = prevAttempts + 1;
  return {
    ...base, cms: detectCms(n.url), final_url: null, canonical_url: null, ref: refFromUrl(n.url), status: "error" as const,
    http_status: res.httpStatus, data: {}, photos: [], attempts, error: res.reason,
    next_retry_at: attempts >= MAX_WEB_ATTEMPTS ? null : new Date(now + retryDelayMs(attempts)).toISOString(),
  };
}

/**
 * Claves de matching de una fila contando lo que dice la ficha leída: su referencia y las
 * URLs canónicas (la bonita y la antigua /Mobilia/VerInmueble/… dan la misma clave `wk:`).
 */
export function mergeWebKeys(
  row: { agency_url?: string | null; web_keys?: string[] },
  cached: { ref: string | null; canonical_url: string | null; final_url: string | null; status: string } | undefined,
): string[] {
  const base = row.web_keys ?? [];
  if (!cached || cached.status !== "ok") return base;
  return [...new Set([...base, ...webKeysOf(row.agency_url, [cached.ref], [cached.canonical_url, cached.final_url])])];
}
