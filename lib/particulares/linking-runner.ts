import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import {
  computeLinks,
  type LinkDecision,
  type LinkRow,
  type LinkRelation,
  type RowGroupState,
} from "./linking-core";
import {
  applyAgencyToState,
  computeAgencyMatches,
  crmCandidateRows,
  computeAgencyPortalLinks,
  viewRowToLinkRow,
  type ViewRow,
  type AgencyDecision,
  type AgencyPropertyInput,
} from "./agency-matching";
import { mergeWebKeys, normalizeAgencyUrl } from "./agency-web";
import { loadAgencyWebCache, refreshAgencyWebs } from "./agency-web-runner";
import { autoReplaceWebPhotos, type AutoPhotosSummary } from "./web-photos";
import { isCollaboratingAgency } from "./source-kind";

/**
 * Job de enlazado de anuncios de particulares (migración 0176).
 *
 * Lee `particulares_link_rows`, calcula con `computeLinks` (lógica pura, probada
 * en scripts/test-particulares-linking.mts) y deja en la BD:
 *   · `particulares_links`: los pares relacionados, con regla y evidencia;
 *   · `particulares.duplicate_of / link_summary / link_ops`: la agrupación que
 *     usan el listado (oculta los duplicados) y la ficha (venta + alquiler +
 *     portales en una sola).
 *
 * Es idempotente y barato (~1 s de cálculo para 21.000 anuncios): se puede
 * lanzar cada pocos minutos desde el cron o a mano tras confirmar/descartar un
 * enlace. Las decisiones de una persona (`confirmado` / `descartado`) mandan
 * siempre sobre el algoritmo.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const PAGE = 1000;
const CHUNK = 400;

export type LinkingRunSummary = {
  ok: boolean;
  dryRun: boolean;
  ms: number;
  stats: Record<string, number>;
  changedRows: number;
  linksWritten: number;
  linksPruned: number;
  agencyMatches?: number;
  /** Lectura de webs propias de agencias (0203): planificadas / leídas / buenas / fallidas. */
  /** Reemplazo automático de fotos con marca por las limpias de la web de la agencia (0205/0206). */
  webPhotos?: AutoPhotosSummary | null;
  webs?: { planned: number; fetched: number; ok: number; failed: number; blocked?: number; unreadable?: number };
  /** Milisegundos por fase, pases de agencias saltados y errores aislados (no rompen el enlazado base). */
  timings?: Record<string, number>;
  skipped?: Record<string, string>;
  errors?: Record<string, string>;
  agencyReady?: boolean;
  error?: string;
};

type CurrentRow = LinkRow & {
  duplicate_of: string | null;
  link_summary: unknown;
  link_ops: string[] | null;
};

async function loadRows(db: Db, view = "particulares_link_rows", optional = false, deadline?: number): Promise<CurrentRow[]> {
  const out: CurrentRow[] = [];
  for (let from = 0; ; from += PAGE) {
    // Presupuesto de tiempo (pases de agencias): si se agota a medias, se abandona sin romper nada.
    if (deadline && Date.now() > deadline) throw new Error(`${view}: sin tiempo (cargadas ${out.length} filas)`);
    const { data, error } = await db
      .from(view)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      // Vista nueva (0200) sin aplicar: el cruce de agencias en portales se salta.
      if (optional) {
        console.warn(`[particulares-linking] ${view}:`, error.message);
        return [];
      }
      throw new Error(`${view}: ${error.message}`);
    }
    // Taxonomía de fuentes (kind/agencia), referencias, fotos… ya normalizadas para el enlazador.
    for (const r of (data ?? []) as Array<ViewRow & Pick<CurrentRow, "duplicate_of" | "link_summary" | "link_ops">>) {
      out.push({ ...viewRowToLinkRow(r), duplicate_of: r.duplicate_of, link_summary: r.link_summary, link_ops: r.link_ops });
    }
    if (!data || data.length < PAGE) break;
  }
  // Si el crawler inserta filas mientras se pagina, un mismo anuncio puede salir
  // en dos páginas y generar un enlace consigo mismo (viola a_id < b_id).
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

async function loadDecisions(db: Db): Promise<LinkDecision[]> {
  const out: LinkDecision[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("particulares_links")
      .select("a_id, b_id, relation, status")
      .in("status", ["confirmado", "descartado"])
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`particulares_links: ${error.message}`);
    for (const d of data ?? []) {
      out.push({
        a: d.a_id as string,
        b: d.b_id as string,
        relation: d.relation as LinkRelation,
        status: d.status as "confirmado" | "descartado",
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ── Propiedades de agencias del CRM (migración 0199) ────────────────────────
// Si la migración o alguna columna aún no existen, el cruce se salta sin romper el
// enlazado de particulares (devuelve null).

const PROPERTY_COLUMNS =
  "id, description, external_id, property_reference, bc_reference, cover_photo_url, operation, status, archived_at, price, bedrooms, bathrooms, square_meters, address, latitude, longitude, location_precision, created_at, agency_id, agencies(name, slug)";

/**
 * Agencias con feed de sindicación (`agency_feeds`) = colaboradoras reales. Las propiedades de
 * «Portales externos» (sin feed) son importaciones de portales, no una web de agencia.
 * null si la tabla no se puede leer (se cae al slug del cajón de importación).
 */
async function loadFeedAgencyIds(db: Db): Promise<Set<string> | null> {
  const { data, error } = await db.from("agency_feeds").select("agency_id");
  if (error) {
    console.warn("[particulares-linking] agency_feeds:", error.message);
    return null;
  }
  return new Set((data ?? []).map((r: { agency_id: string }) => r.agency_id));
}

async function loadAgencyProperties(db: Db): Promise<AgencyPropertyInput[] | null> {
  const feeds = await loadFeedAgencyIds(db);
  const out: AgencyPropertyInput[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("properties")
      .select(PROPERTY_COLUMNS)
      .is("archived_at", null)
      .eq("country", "es")
      .not("agency_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn("[particulares-linking] properties:", error.message);
      return null;
    }
    for (const r of data ?? []) {
      const ag = Array.isArray(r.agencies) ? r.agencies[0] : r.agencies;
      out.push({
        ...r,
        description: typeof r.description === "string" ? r.description.slice(0, 700) : null,
        agency_name: ag?.name ?? null,
        agency_collab: isCollaboratingAgency({ hasFeed: feeds && r.agency_id ? feeds.has(r.agency_id) : null, slug: ag?.slug }),
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function loadAgencyDecisions(db: Db): Promise<AgencyDecision[] | null> {
  const out: AgencyDecision[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("particulares_agency_matches")
      .select("particular_id, property_id, status")
      .in("status", ["confirmado", "descartado"])
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null; // migración 0199 sin aplicar
    out.push(...(data as AgencyDecision[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// jsonb de Postgres NO conserva el orden de las claves (las reordena por
// longitud y luego alfabéticamente), así que comparar con JSON.stringify
// "a pelo" daba siempre distinto y cada pasada reescribía ~530 filas. Se
// compara con las claves ordenadas y sin los `undefined` (que JSON omite).
function stable(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}

const sameState = (cur: CurrentRow, want: RowGroupState): boolean =>
  (cur.duplicate_of ?? null) === want.duplicate_of &&
  stable(cur.link_summary ?? null) === stable(want.link_summary) &&
  stable(cur.link_ops ?? null) === stable(want.link_ops);

// Un solo recálculo a la vez en este proceso (PM2 de un solo proceso).
let running: Promise<LinkingRunSummary> | null = null;

export function runParticularesLinking(opts: { dryRun?: boolean } = {}): Promise<LinkingRunSummary> {
  if (running) return running;
  running = doRun(opts).finally(() => {
    running = null;
  });
  return running;
}

/** Presupuesto duro de una pasada (el enlazado base va primero; los pases de agencias solo si queda tiempo). */
const BUDGET_MS = Number(process.env.PARTICULARES_LINK_BUDGET_MS) || 80_000;
/** Interruptor: PARTICULARES_AGENCY_PASSES=0 apaga los pases de agencias (portal, CRM, webs, fotos). */
const AGENCY_PASSES = process.env.PARTICULARES_AGENCY_PASSES !== "0";
type StateMap = Map<string, RowGroupState>;

/** Filas cuyo estado deseado difiere de lo ya escrito (o, si no se escribió, de lo que había al cargar). */
function diffRows(rows: CurrentRow[], state: StateMap, written: Map<string, string>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const cur of rows) {
    const want = state.get(cur.id);
    if (!want) continue;
    const sig = stable({ d: want.duplicate_of, s: want.link_summary, o: want.link_ops });
    const prev = written.get(cur.id);
    if (prev === undefined ? sameState(cur, want) : prev === sig) continue;
    out.push({ id: cur.id, duplicate_of: want.duplicate_of, link_summary: want.link_summary, link_ops: want.link_ops });
    written.set(cur.id, sig);
  }
  return out;
}

async function writeGroups(db: Db, changes: Array<Record<string, unknown>>): Promise<void> {
  for (let i = 0; i < changes.length; i += CHUNK) {
    const { error } = await db.rpc("apply_particulares_groups", { p: changes.slice(i, i + CHUNK) });
    if (error) throw new Error(`apply_particulares_groups: ${error.message}`);
  }
}

async function writeLinks(db: Db, links: unknown[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < links.length; i += CHUNK) {
    const { data, error } = await db.rpc("apply_particulares_links", { p: links.slice(i, i + CHUNK) });
    if (error) throw new Error(`apply_particulares_links: ${error.message}`);
    n += Number(data ?? 0);
  }
  return n;
}

async function doRun({ dryRun = false }: { dryRun?: boolean }): Promise<LinkingRunSummary> {
  const started = Date.now();
  const runStart = new Date(started - 5000).toISOString();
  const left = () => BUDGET_MS - (Date.now() - started);
  const db = createAdminClient() as Db;
  const timings: Record<string, number> = {};
  const skipped: Record<string, string> = {};
  const errors: Record<string, string> = {};
  let lap = Date.now();
  const mark = (k: string) => {
    timings[k] = Date.now() - lap;
    lap = Date.now();
  };
  /** Un pase de agencias nunca rompe el resto: su error se anota y se sigue. */
  const safe = async <T,>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (e) {
      errors[name] = e instanceof Error ? e.message : String(e);
      console.warn(`[particulares-linking] pase «${name}» falló:`, errors[name]);
      return undefined;
    }
  };
  try {
    // ── 1. ENLAZADO BASE (lo que no puede dejar de ejecutarse): se calcula y se ESCRIBE primero ──
    const [rows, decisions] = await Promise.all([loadRows(db), loadDecisions(db)]);
    mark("load_base");
    const result = computeLinks(rows, decisions);
    mark("compute_base");
    const written = new Map<string, string>();
    const baseChanges = diffRows(rows, result.state, written);
    let linksWritten = 0;
    let linksPruned = 0;
    if (!dryRun) {
      linksWritten += await writeLinks(db, result.links);
      await writeGroups(db, baseChanges);
    }
    mark("write_base");
    let changedRows = baseChanges.length;

    // ── 2. PASES DE AGENCIAS (después, con presupuesto y aislados) ──
    let allRows: CurrentRow[] = rows;
    let agencyMatches: ReturnType<typeof computeAgencyMatches> = [];
    let agencyReady = false;
    if (!AGENCY_PASSES) skipped.agency_passes = "apagados (PARTICULARES_AGENCY_PASSES=0)";

    // 2a. Agencias anunciantes en portales (vista 0200).
    let proRows: CurrentRow[] = [];
    if (AGENCY_PASSES) {
      await safe("pro", async () => {
        if (left() < 25_000) return void (skipped.pro = "sin tiempo");
        // Solo las candidatas (0208): ~9.500 de las ~70.000. Sin la función, el pase se salta.
        const rpc = await db.rpc("get_particulares_agency_candidates");
        if (rpc.error) return void (skipped.pro = `migración 0208 sin aplicar (${rpc.error.message})`);
        proRows = ((rpc.data ?? []) as ViewRow[]).map((r) => ({
          ...viewRowToLinkRow(r),
          duplicate_of: (r as unknown as CurrentRow).duplicate_of,
          link_summary: (r as unknown as CurrentRow).link_summary,
          link_ops: (r as unknown as CurrentRow).link_ops,
        }));
        mark("load_pro");
        if (proRows.length === 0) return void (skipped.pro = "sin candidatas");
        const wc = await loadAgencyWebCache(db, proRows.map((r) => r.agency_url));
        if (wc) {
          for (const r of proRows) {
            const n = normalizeAgencyUrl(r.agency_url);
            if (!n?.isListing) continue;
            const keys = mergeWebKeys(r, wc.get(n.key));
            if (keys.length !== (r.web_keys?.length ?? 0)) {
              r.web_keys = keys;
              r.block_keys = [...new Set([...(r.block_keys ?? []), ...keys])];
            }
          }
        }
        const pro = computeAgencyPortalLinks(proRows, decisions);
        mark("compute_pro");
        for (const [id, st] of pro.state) result.state.set(id, st);
        result.stats.pro_rows = proRows.length;
        result.stats.pro_links = pro.links.length;
        result.stats.pro_groups = pro.groups.length;
        if (!dryRun) {
          linksWritten += await writeLinks(db, pro.links);
          const ch = diffRows(proRows, result.state, written);
          await writeGroups(db, ch);
          changedRows += ch.length;
        }
        allRows = [...rows, ...proRows];
        mark("write_pro");
      });
    }

    // 2b. Propiedades de agencias del CRM: mismo piso en otro portal → fuente «Agencia».
    if (AGENCY_PASSES) {
      await safe("crm", async () => {
        if (left() < 20_000) return void (skipped.crm = "sin tiempo");
        const [props, agencyDecisions] = await Promise.all([loadAgencyProperties(db), loadAgencyDecisions(db)]);
        if (!props || !agencyDecisions) return void (skipped.crm = "migración 0199 sin aplicar");
        agencyReady = true;
        // Solo el anuncio principal de cada grupo: sus copias (otro portal, mismo piso) serían
        // «gemelos parecidos» y degradarían a «probable» un enlace que es cierto.
        const primaries = crmCandidateRows(allRows.filter((r) => !result.state.get(r.id)?.duplicate_of), props) as CurrentRow[];
        result.stats.crm_candidates = primaries.length;
        agencyMatches = computeAgencyMatches(primaries, props, agencyDecisions);
        applyAgencyToState(result, primaries, props, agencyMatches);
        result.stats.agency_matches = agencyMatches.length;
        result.stats.agency_matches_cierto = agencyMatches.filter((m) => m.level === "cierto").length;
        mark("compute_crm");
        if (!dryRun) {
          for (let i = 0; i < agencyMatches.length; i += CHUNK) {
            const { error } = await db.rpc("apply_particulares_agency_matches", { p: agencyMatches.slice(i, i + CHUNK) });
            if (error) throw new Error(`apply_particulares_agency_matches: ${error.message}`);
          }
          const pr = await db.rpc("prune_particulares_agency_matches", { p_before: runStart });
          if (pr.error) throw new Error(`prune_particulares_agency_matches: ${pr.error.message}`);
          const ch = diffRows(allRows, result.state, written);
          await writeGroups(db, ch);
          changedRows += ch.length;
        }
        mark("write_crm");
      });
    }

    // ── 3. Limpieza de enlaces no vistos en esta pasada (al final: no borra los de los pases de agencias) ──
    if (!dryRun) {
      const pruned = await db.rpc("prune_particulares_links", { p_before: runStart });
      if (pruned.error) throw new Error(`prune_particulares_links: ${pruned.error.message}`);
      linksPruned = Number(pruned.data ?? 0);
    }
    mark("prune");

    // ── 4. Webs de agencias y fotos limpias (solo si queda tiempo; lo leído ayuda a la PRÓXIMA pasada) ──
    let webs: LinkingRunSummary["webs"];
    let webPhotos: AutoPhotosSummary | null | undefined;
    if (AGENCY_PASSES) {
      await safe("webs", async () => {
        if (left() < 15_000) return void (skipped.webs = "sin tiempo");
        // Solo los anuncios con enlace a una web de agencia (~1.000), no las 70.000 filas.
        const wr: Array<{ agency_url: string | null; price: number | null; is_active: boolean | null; reference: string | null; agency_reference: string | null }> = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await db
            .from("particulares")
            .select("agency_url:scraper_extra->>agency_url, price, is_active, reference, agency_reference:scraper_extra->>agency_reference")
            .not("scraper_extra->>agency_url", "is", null)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw new Error(error.message);
          wr.push(...(data ?? []));
          if (!data || data.length < PAGE) break;
        }
        // Propiedades del CRM cuyo propio source_url es una ficha Mobilia: también se leen (verifican contra la propiedad).
        const sp = await db
          .from("properties")
          .select("source_url, price, external_id, property_reference")
          .is("archived_at", null)
          .or("source_url.ilike.%Mobilia/VerInmueble%,source_url.ilike.%mobiliagestion.es%")
          .limit(2000);
        for (const r of (sp.data ?? []) as Array<{ source_url: string; price: number | string | null; external_id: string | null; property_reference: string | null }>) {
          wr.push({ agency_url: r.source_url, price: r.price == null ? null : Number(r.price), is_active: true, reference: r.external_id, agency_reference: r.property_reference });
        }
        const cache = await loadAgencyWebCache(db, wr.map((r) => r.agency_url));
        // Primero las FOTOS LIMPIAS (rápido de planificar y es lo que más importa): antes iba detrás de la lectura de
        // webs (25 s) y cuando llegaba quedaban < 15 s de presupuesto, así que NUNCA se ejecutaba.
        if (cache) {
          if (left() > 12_000) webPhotos = await autoReplaceWebPhotos(db, { dryRun, budgetMs: Math.min(40_000, left() - 8_000) });
          else skipped.web_photos = "sin tiempo";
          mark("web_photos");
          if (left() > 12_000) webs = await refreshAgencyWebs(db, wr, cache, { dryRun, budgetMs: Math.min(40_000, left() - 8_000) });
          else skipped.webs_read = "sin tiempo";
          mark("webs");
        }
      });
    }

    return {
      ok: true,
      dryRun,
      ms: Date.now() - started,
      stats: result.stats,
      changedRows,
      linksWritten,
      linksPruned,
      agencyMatches: agencyMatches.length,
      webs,
      webPhotos,
      timings,
      skipped,
      errors,
      agencyReady,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "linking_failed";
    console.error("[particulares-linking]", error);
    return { ok: false, dryRun, ms: Date.now() - started, stats: {}, changedRows: 0, linksWritten: 0, linksPruned: 0, error, timings, skipped, errors };
  }
}
