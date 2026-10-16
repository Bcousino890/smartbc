import "server-only";
import {
  MAX_WEB_FETCHES_PER_RUN,
  normalizeAgencyUrl,
  parseMobiliaFicha,
  planAgencyWebFetches,
  toCacheRow,
  type AgencyWebCache,
  type NormalizedAgencyUrl,
  type WebFetchResult,
} from "./agency-web";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const TABLE = "particulares_agency_webs";
const CHUNK = 150;
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_500_000;
/** Pausa entre dos peticiones (aunque sean de webs distintas): ritmo de persona, no de robot. */
const DELAY_MS = 1500;
/** Tras este tiempo la pasada deja de leer webs aunque queden (el enlazado manda). */
const BUDGET_MS = 40_000;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Caché ya guardada para esas URLs. null = la tabla no existe (0203 sin aplicar): todo este módulo se salta. */
export async function loadAgencyWebCache(
  db: Db,
  urls: Array<string | null | undefined>,
): Promise<Map<string, AgencyWebCache & { next_retry_at: string | null; attempts: number }> | null> {
  const keys = [...new Set(urls.map((u) => normalizeAgencyUrl(u)).filter((n): n is NormalizedAgencyUrl => !!n && n.isListing).map((n) => n.key))];
  const out = new Map<string, AgencyWebCache & { next_retry_at: string | null; attempts: number }>();
  for (let i = 0; i < keys.length; i += CHUNK) {
    const { data, error } = await db
      .from(TABLE)
      .select("url_key, status, final_url, canonical_url, cms, ref, data, photos, fetched_at, next_retry_at, attempts")
      .in("url_key", keys.slice(i, i + CHUNK));
    if (error) {
      console.warn(`[particulares-linking] ${TABLE}:`, error.message);
      return null;
    }
    for (const r of data ?? []) out.set(r.url_key as string, { ...r, photos: Array.isArray(r.photos) ? r.photos : [] });
  }
  return out;
}

/** Una petición GET a la ficha: redirecciones normales, timeout, tope de tamaño, sin saltarse protecciones. */
export async function fetchAgencyWeb(n: NormalizedAgencyUrl): Promise<WebFetchResult> {
  try {
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
    const parsed = parseMobiliaFicha(html);
    if (!parsed) return { kind: "error", httpStatus: res.status, reason: "no es una ficha de Mobilia" };
    return { kind: "ok", finalUrl: final?.url ?? n.url, httpStatus: res.status, parsed };
  } catch (e) {
    return { kind: "error", httpStatus: null, reason: e instanceof Error ? e.message.slice(0, 160) : "fetch_failed" };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lee (y cachea) las fichas de webs de agencias pendientes. Como mucho `limit` por pasada
 * (30), en serie, con pausa y con presupuesto de tiempo. Nunca lanza: un fallo aquí no
 * debe romper el enlazado.
 */
export async function refreshAgencyWebs(
  db: Db,
  rows: Array<{ agency_url?: string | null }>,
  cache: Map<string, { next_retry_at: string | null; attempts?: number }>,
  opts: { limit?: number; dryRun?: boolean } = {},
): Promise<{ planned: number; fetched: number; ok: number; failed: number }> {
  const started = Date.now();
  const plan = planAgencyWebFetches(rows, cache, started, opts.limit ?? MAX_WEB_FETCHES_PER_RUN);
  const out = { planned: plan.length, fetched: 0, ok: 0, failed: 0 };
  if (opts.dryRun) return out;
  try {
    for (const n of plan) {
      if (Date.now() - started > BUDGET_MS) break;
      if (out.fetched > 0) await sleep(DELAY_MS);
      const res = await fetchAgencyWeb(n);
      out.fetched++;
      if (res.kind === "ok") out.ok++;
      else out.failed++;
      const row = toCacheRow(n, res, cache.get(n.key)?.attempts ?? 0, Date.now());
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
