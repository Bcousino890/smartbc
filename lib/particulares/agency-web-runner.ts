import "server-only";
import {
  MAX_WEB_FETCHES_PER_RUN,
  normalizeAgencyUrl,
  planAgencyWebFetches,
  toCacheRow,
  webSigOf,
  type AgencyWebCache,
  type NormalizedAgencyUrl,
  type WebFetchResult,
  type WebRowLite,
} from "./agency-web";
import { parseAgencyWebHtml, robotsAllows } from "./agency-web-readers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const TABLE = "particulares_agency_webs";
const CHUNK = 25; // las claves son URLs: con más, la URL de PostgREST pasa del límite («URI too long»)
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_500_000;
/** Pausa entre dos peticiones (aunque sean de webs distintas): ritmo de persona, no de robot. */
const DELAY_MS = 1500;
/** Tras este tiempo la pasada deja de leer webs aunque queden (el enlazado manda). */
const BUDGET_MS = 40_000;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Caché ya guardada para esas URLs. null = la tabla no existe (0203 sin aplicar): todo este módulo se salta. */
export type CachedWeb = AgencyWebCache & { next_retry_at: string | null; attempts: number; trigger_sig: string | null };

export async function loadAgencyWebCache(
  db: Db,
  urls: Array<string | null | undefined>,
): Promise<Map<string, CachedWeb> | null> {
  const keys = [...new Set(urls.map((u) => normalizeAgencyUrl(u)).filter((n): n is NormalizedAgencyUrl => !!n && n.isListing).map((n) => n.key))];
  const out = new Map<string, CachedWeb>();
  for (let i = 0; i < keys.length; i += CHUNK) {
    const { data, error } = await db
      .from(TABLE)
      .select("url_key, status, final_url, canonical_url, cms, ref, data, photos, fetched_at, next_retry_at, attempts, error, trigger_sig")
      .in("url_key", keys.slice(i, i + CHUNK));
    if (error) {
      console.warn(`[particulares-linking] ${TABLE}:`, error.message);
      return null;
    }
    for (const r of data ?? []) out.set(r.url_key as string, { ...r, photos: Array.isArray(r.photos) ? r.photos : [] });
  }
  return out;
}

type RobotsCache = Map<string, Promise<string | null | "error" | "dns">>;

/** robots.txt del sitio (1 petición por dominio y pasada). null = no hay / no limita; "error" = no se pudo saber. */
function loadRobots(origin: string, cache: RobotsCache): Promise<string | null | "error" | "dns"> {
  let p = cache.get(origin);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`${origin}/robots.txt`, {
          redirect: "follow",
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": BROWSER_UA, Accept: "text/plain,*/*;q=0.5" },
        });
        if (res.status >= 500) return "error" as const;
        if (!res.ok) return null; // 4xx: sin robots = sin restricciones
        const t = await res.text();
        return /<html/i.test(t.slice(0, 500)) ? null : t.slice(0, 500_000);
      } catch (e) {
        return (e as { cause?: { code?: string } })?.cause?.code === "ENOTFOUND" ? ("dns" as const) : ("error" as const);
      }
    })();
    cache.set(origin, p);
  }
  return p;
}

/**
 * Una petición GET a la ficha (más el robots.txt del sitio, una vez por dominio): respeta robots.txt,
 * redirecciones normales, timeout, tope de tamaño, sin proxies ni saltarse protecciones.
 */
export async function fetchAgencyWeb(n: NormalizedAgencyUrl, robots: RobotsCache = new Map()): Promise<WebFetchResult> {
  try {
    const rb = await loadRobots(new URL(n.url).origin, robots);
    if (rb === "dns") return { kind: "gone", finalUrl: null, httpStatus: null, reason: "el dominio ya no existe" };
    if (rb === "error") return { kind: "error", httpStatus: null, reason: "no se pudo consultar robots.txt" };
    if (!robotsAllows(rb, `${n.path}${n.url.includes("?") ? n.url.slice(n.url.indexOf("?")) : ""}`)) {
      return { kind: "blocked", reason: "robots.txt de la web prohíbe esta ruta" };
    }
    const res = await fetch(n.url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "es-ES,es;q=0.9",
      },
    });
    if (res.status === 404 || res.status === 410) return { kind: "gone", finalUrl: res.url || null, httpStatus: res.status, reason: `HTTP ${res.status}` };
    // 401/403/429/5xx: no se insiste ni se intenta saltar nada; se reintenta más tarde.
    if (!res.ok) return { kind: "error", httpStatus: res.status, reason: `HTTP ${res.status}` };
    const final = normalizeAgencyUrl(res.url || n.url);
    // Una ficha retirada suele redirigir a la portada del sitio.
    if (final && !final.isListing) return { kind: "gone", finalUrl: final.url, httpStatus: res.status, reason: "redirige a la portada" };
    // Si la redirección lleva a otro dominio, la ruta de destino también debe estar permitida.
    if (final && final.domain !== n.domain) {
      const rb2 = await loadRobots(new URL(final.url).origin, robots);
      if (rb2 !== "error" && rb2 !== "dns" && !robotsAllows(rb2, `${final.path}`)) return { kind: "blocked", reason: "robots.txt de la web de destino prohíbe esta ruta" };
    }
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const dec = new TextDecoder("utf-8");
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += dec.decode(value, { stream: true });
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          break;
        }
      }
    } else html = await res.text();
    const got = parseAgencyWebHtml(html, final?.url ?? n.url);
    // Página diminuta que redirige por JavaScript a /404 (ficha retirada en webs tipo «ficha/index.php?codigo=»).
    if (!got && html.length < 2000 && /window\.location/i.test(html) && /404|no-?encontrad|not-?found/i.test(html)) {
      return { kind: "gone", finalUrl: final?.url ?? null, httpStatus: res.status, reason: "la web redirige a su página 404" };
    }
    // 200 sin datos de ficha en el HTML (web hecha con JavaScript): es estable, no se reintenta.
    if (!got) return { kind: "unsupported", httpStatus: res.status, reason: "sin datos de ficha en el HTML (se carga con JavaScript)" };
    return { kind: "ok", finalUrl: final?.url ?? n.url, httpStatus: res.status, parsed: got.parsed, cms: got.cms };
  } catch (e) {
    // El dominio ya no existe (DNS): la ficha no volverá; no se reintenta.
    const code = (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "ENOTFOUND") return { kind: "gone", finalUrl: null, httpStatus: null, reason: "el dominio ya no existe" };
    return { kind: "error", httpStatus: null, reason: e instanceof Error ? e.message.slice(0, 160) : "fetch_failed" };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lee (y cachea) las fichas de webs de agencias pendientes: nunca leídas o cuyo anuncio del portal
 * cambió (precio, estado, referencia, agency_url), más reintentos de fallos. Como mucho `limit` por
 * pasada (30), en serie, con pausa y presupuesto de tiempo. NO hay refresco por el paso del tiempo.
 * Nunca lanza: un fallo aquí no debe romper el enlazado.
 */
export async function refreshAgencyWebs(
  db: Db,
  rows: WebRowLite[],
  cache: Map<string, CachedWeb>,
  opts: { limit?: number; dryRun?: boolean; budgetMs?: number } = {},
): Promise<{ planned: number; fetched: number; ok: number; failed: number; blocked: number; unreadable: number }> {
  const started = Date.now();
  const plan = planAgencyWebFetches(rows, cache, started, opts.limit ?? MAX_WEB_FETCHES_PER_RUN);
  const out = { planned: plan.fetch.length, fetched: 0, ok: 0, failed: 0, blocked: 0, unreadable: 0 };
  if (opts.dryRun) return out;
  try {
    // Filas leídas antes de existir la huella: se les apunta sin leer nada.
    for (const b of plan.backfill.slice(0, 300)) await db.from(TABLE).update({ trigger_sig: b.sig }).eq("url_key", b.key);
    const robots: RobotsCache = new Map();
    for (const item of plan.fetch) {
      if (Date.now() - started > (opts.budgetMs ?? BUDGET_MS)) break;
      if (out.fetched > 0) await sleep(DELAY_MS);
      const res = await fetchAgencyWeb(item.n, robots);
      out.fetched++;
      if (res.kind === "ok") out.ok++;
      else if (res.kind === "blocked") out.blocked++;
      // Retirada (404/410/dominio muerto) o web que no da datos sin JavaScript: resultado estable, no un fallo nuestro.
      else if (res.kind === "gone" || res.kind === "unsupported") out.unreadable++;
      else out.failed++;
      const row = toCacheRow(item.n, res, item.attempts, Date.now(), item.sig);
      const { error } = await db.from(TABLE).upsert(row, { onConflict: "url_key" });
      if (error) {
        console.warn(`[particulares-linking] ${TABLE} upsert:`, error.message);
        break;
      }
    }
  } catch (e) {
    console.warn("[particulares-linking] refreshAgencyWebs:", e instanceof Error ? e.message : e);
  }
  return out;
}

/**
 * «Releer web»: lee AHORA una URL (1 GET + robots) y guarda el resultado, con intentos a cero. `rows` son los
 * anuncios del portal que la enlazan (para fijar la huella). Devuelve la fila guardada o el error.
 */
export async function rereadAgencyWeb(db: Db, rawUrl: string, rows: WebRowLite[]): Promise<{ ok: boolean; status?: string; error?: string }> {
  const n = normalizeAgencyUrl(rawUrl);
  if (!n || !n.isListing) return { ok: false, error: "URL no válida" };
  const res = await fetchAgencyWeb(n);
  const row = toCacheRow(n, res, 0, Date.now(), webSigOf(rows));
  const { error } = await db.from(TABLE).upsert(row, { onConflict: "url_key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, status: row.status };
}
