import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { haversineKm } from "@/lib/geo/poi-distance";
import type { LocationPrecision } from "@/lib/types";
import { fetchHtml } from "./fetch-html";
import { extractIdealistaMapLocation } from "./extractors/idealista";

// ─────────────────────────────────────────────────────────────────────────────
// Backfill del pin de Idealista en fichas YA importadas (2026-10-08).
//
// Para cada ficha de "Portales externos" que viene de Idealista vuelve a leer
// el anuncio y guarda en `properties` el punto del mapa del propio anuncio
// (extractIdealistaMapLocation) y si es exacto o solo de zona
// (`location_precision`, migración 0175). Las fichas importadas antes de esta
// fecha no tienen esa precisión, y las que no trajeron coordenadas al
// importarse acabaron con un punto de Nominatim (calle/barrio) en vez del del
// anuncio.
//
// Idealista bloquea con facilidad, así que:
//   · secuencial, una ficha cada `pauseMs` (+ jitter), nunca en paralelo;
//   · solo descarga el HTML (fetchHtml, la misma cadena que el importador:
//     curl+UA WhatsApp → directo → Relay → proxy → Playwright → Wayback), sin
//     el extractor completo, que además pediría el teléfono por AJAX;
//   · tras `maxConsecutiveBlocks` bloqueos seguidos se para (en vez de quemar
//     IPs/créditos) y dice dónde se quedó; relanzar retoma solo, porque por
//     defecto se saltan las fichas que ya tienen `location_precision`;
//   · un anuncio retirado (404/410) no se toca: se queda con lo que tenía.
//
// No escribe nada con `dryRun`. Lo usa scripts/backfill-idealista-pins.mts.
// ─────────────────────────────────────────────────────────────────────────────

// Misma agencia que PORTAL_IMPORT_AGENCY_SLUG (lib/portal-links/auto-import).
// No se importa de allí para no arrastrar al bundle del script su cadena de
// dependencias (IA de descripciones, books…), que aquí no pinta nada.
const DEFAULT_AGENCY_SLUG = "portales-externos";

export type IdealistaPinBackfillOptions = {
  dryRun: boolean;
  agencySlug?: string;
  // Solo estas fichas (ids de `properties`). Útil para probar con 1–2.
  propertyIds?: string[];
  limit?: number | null;
  // Por defecto solo fichas vivas: las archivadas no tienen SmartLink.
  includeArchived?: boolean;
  // Re-leer también las que ya tienen `location_precision`.
  force?: boolean;
  pauseMs?: number;
  maxConsecutiveBlocks?: number;
  log?: (line: string) => void;
};

type Point = { lat: number | null; lng: number | null; precision: LocationPrecision | null };

export type IdealistaPinBackfillRow = {
  id: string;
  title: string | null;
  url: string;
  outcome:
    | "updated"
    | "would_update"
    | "unchanged"
    | "no_map"
    | "gone"
    | "blocked"
    | "error";
  before: Point;
  after?: Point;
  // Distancia entre el punto guardado y el del anuncio, en metros.
  movedMeters?: number | null;
  detail?: string;
};

export type IdealistaPinBackfillSummary = {
  dryRun: boolean;
  candidates: number;
  processed: number;
  counts: Record<IdealistaPinBackfillRow["outcome"], number>;
  // true si se paró por bloqueos seguidos; `processed` dice hasta dónde llegó.
  aborted: boolean;
  rows: IdealistaPinBackfillRow[];
};

type PropRow = {
  id: string;
  title: string | null;
  source_url: string | null;
  latitude: number | null;
  longitude: number | null;
  location_precision: LocationPrecision | null;
  geocoded_at: string | null;
};

// La URL guardada lleva a veces utm_*, /pro/<agencia>/ o /en/: se pide siempre
// la ficha canónica en español (los textos del mapa no dependen del idioma,
// pero así la petición es la misma que haría el importador hoy).
export function canonicalIdealistaUrl(sourceUrl: string): { url: string; adId: string } | null {
  const adId = sourceUrl.match(/idealista\.com\/.*?inmueble\/(\d+)/i)?.[1];
  return adId ? { url: `https://www.idealista.com/inmueble/${adId}/`, adId } : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function backfillIdealistaPins(
  opts: IdealistaPinBackfillOptions,
): Promise<IdealistaPinBackfillSummary> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const pauseMs = opts.pauseMs ?? 15_000;
  const maxBlocks = opts.maxConsecutiveBlocks ?? 4;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: agency, error: agencyErr } = await db
    .from("agencies")
    .select("id")
    .eq("slug", opts.agencySlug ?? DEFAULT_AGENCY_SLUG)
    .maybeSingle();
  if (agencyErr) throw new Error(`agencia: ${agencyErr.message}`);
  if (!agency) throw new Error(`no existe la agencia ${opts.agencySlug ?? DEFAULT_AGENCY_SLUG}`);

  const query = (withPrecision: boolean) => {
    let q = db
      .from("properties")
      .select(
        `id, title, source_url, latitude, longitude, geocoded_at${withPrecision ? ", location_precision" : ""}`,
      )
      .eq("agency_id", agency.id)
      .ilike("source_url", "%idealista.com%")
      .order("created_at", { ascending: false });
    if (opts.propertyIds?.length) q = q.in("id", opts.propertyIds);
    if (!opts.includeArchived) q = q.is("archived_at", null).neq("status", "archived");
    if (withPrecision && !opts.force) q = q.is("location_precision", null);
    if (opts.limit) q = q.limit(opts.limit);
    return q;
  };
  let { data, error } = await query(true);
  // Sin la migración 0175 la columna no existe. Escribir así no tiene sentido,
  // pero el dry-run sí sirve ANTES de desplegar para ver qué cambiaría.
  if (error && /location_precision/.test(error.message)) {
    if (!opts.dryRun) {
      throw new Error("falta la columna properties.location_precision: aplica antes la migración 0175");
    }
    log("[pin-backfill] ⚠ sin migración 0175: dry-run sin columna de precisión (se da por vacía)");
    ({ data, error } = await query(false));
  }
  if (error) throw new Error(`consulta de fichas: ${error.message}`);
  const props = ((data ?? []) as PropRow[]).map((p) => ({
    ...p,
    location_precision: p.location_precision ?? null,
  }));

  const summary: IdealistaPinBackfillSummary = {
    dryRun: opts.dryRun,
    candidates: props.length,
    processed: 0,
    counts: { updated: 0, would_update: 0, unchanged: 0, no_map: 0, gone: 0, blocked: 0, error: 0 },
    aborted: false,
    rows: [],
  };
  log(
    `[pin-backfill] ${props.length} fichas candidatas${opts.dryRun ? " · DRY-RUN (no se escribe nada)" : ""}`,
  );

  let consecutiveBlocks = 0;
  for (const [i, p] of props.entries()) {
    if (i > 0) await sleep(pauseMs + Math.round(Math.random() * pauseMs * 0.5));

    const before: Point = {
      lat: p.latitude,
      lng: p.longitude,
      precision: p.location_precision,
    };
    const tag = `[pin-backfill] ${i + 1}/${props.length} ${p.id}`;
    const push = (row: Omit<IdealistaPinBackfillRow, "id" | "title" | "before">) => {
      const full = { id: p.id, title: p.title, before, ...row };
      summary.rows.push(full);
      summary.counts[full.outcome]++;
      summary.processed++;
      return full;
    };

    const canon = p.source_url ? canonicalIdealistaUrl(p.source_url) : null;
    if (!canon) {
      push({ url: p.source_url ?? "", outcome: "error", detail: "source_url sin id de anuncio" });
      log(`${tag} ✗ source_url sin id de anuncio: ${p.source_url}`);
      continue;
    }

    let fetched: Awaited<ReturnType<typeof fetchHtml>>;
    try {
      fetched = await fetchHtml(canon.url);
    } catch (err) {
      push({ url: canon.url, outcome: "error", detail: err instanceof Error ? err.message : String(err) });
      log(`${tag} ✗ error descargando: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    if (!fetched.ok) {
      const e = fetched.error;
      if (e.kind === "fetch_failed" && (e.status === 404 || e.status === 410)) {
        consecutiveBlocks = 0;
        push({ url: canon.url, outcome: "gone", detail: e.reason });
        log(`${tag} · anuncio retirado (${e.status}): no se toca`);
        continue;
      }
      consecutiveBlocks++;
      push({ url: canon.url, outcome: "blocked", detail: e.reason });
      log(`${tag} ✗ no se pudo leer (${e.kind}): ${e.reason.slice(0, 200)}`);
      if (consecutiveBlocks >= maxBlocks) {
        summary.aborted = true;
        log(
          `[pin-backfill] ${consecutiveBlocks} bloqueos seguidos: se para aquí para no quemar IPs/créditos. ` +
            `Relanzar más tarde retoma solo (se saltan las fichas ya resueltas).`,
        );
        break;
      }
      continue;
    }
    consecutiveBlocks = 0;

    // Que el HTML sea DE ESTE anuncio (un redirect a un listado o una página de
    // reto también es "200 OK" con HTML de sobra).
    if (!fetched.html.includes(canon.adId)) {
      push({ url: canon.url, outcome: "error", detail: "el HTML no es de este anuncio" });
      log(`${tag} ✗ el HTML descargado no contiene el id ${canon.adId}`);
      continue;
    }

    const loc = extractIdealistaMapLocation(fetched.html);
    if (!loc.coords) {
      push({ url: canon.url, outcome: "no_map", detail: "la ficha no trae el bloque del mapa" });
      log(`${tag} · sin bloque de mapa en el HTML: no se toca`);
      continue;
    }

    const after: Point = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      precision: loc.precision,
    };
    const movedMeters =
      before.lat != null && before.lng != null
        ? Math.round(haversineKm(before.lat, before.lng, after.lat!, after.lng!) * 1000)
        : null;
    const detail =
      `addressVisibility=${loc.addressVisibility ?? "?"} markerVisible=${loc.markerVisible ?? "?"}` +
      // geocoded_at lo rellenan Nominatim Y el guardado de la ficha en el admin
      // (que reenvía siempre el pin): es una pista, no una certeza.
      (p.geocoded_at ? " · geocoded_at relleno (Nominatim o guardado en el admin)" : "");
    const changed =
      movedMeters == null || movedMeters > 0 || before.precision !== after.precision;
    const desc =
      `(${before.lat ?? "—"}, ${before.lng ?? "—"}) → (${after.lat}, ${after.lng}) ` +
      `${movedMeters == null ? "" : `· ${movedMeters} m `}· precisión ${before.precision ?? "—"} → ${after.precision ?? "—"} · ${detail}`;

    if (!changed) {
      push({ url: canon.url, outcome: "unchanged", after, movedMeters, detail });
      log(`${tag} = sin cambios ${desc}`);
      continue;
    }
    if (opts.dryRun) {
      push({ url: canon.url, outcome: "would_update", after, movedMeters, detail });
      log(`${tag} ~ actualizaría ${desc}`);
      continue;
    }

    const { data: upd, error: updErr } = await db
      .from("properties")
      .update({
        latitude: after.lat,
        longitude: after.lng,
        location_precision: after.precision,
        // Ya no es un punto de Nominatim: es el del anuncio.
        geocoded_at: null,
      })
      .eq("id", p.id)
      .select("id");
    if (updErr || !upd?.length) {
      push({ url: canon.url, outcome: "error", after, movedMeters, detail: updErr?.message ?? "0 filas actualizadas" });
      log(`${tag} ✗ no se pudo guardar: ${updErr?.message ?? "0 filas actualizadas"}`);
      continue;
    }
    push({ url: canon.url, outcome: "updated", after, movedMeters, detail });
    log(`${tag} ✓ actualizada ${desc}`);
  }

  const c = summary.counts;
  log(
    `[pin-backfill] fin${summary.aborted ? " (PARADO por bloqueos)" : ""}: ${summary.processed}/${summary.candidates} · ` +
      `${opts.dryRun ? `actualizaría ${c.would_update}` : `actualizadas ${c.updated}`} · sin cambios ${c.unchanged} · ` +
      `sin mapa ${c.no_map} · retiradas ${c.gone} · bloqueadas ${c.blocked} · errores ${c.error}`,
  );
  return summary;
}
