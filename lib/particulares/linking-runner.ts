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
  computeAgencyPortalLinks,
  viewRowToLinkRow,
  type ViewRow,
  type AgencyDecision,
  type AgencyPropertyInput,
} from "./agency-matching";

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
  error?: string;
};

type CurrentRow = LinkRow & {
  duplicate_of: string | null;
  link_summary: unknown;
  link_ops: string[] | null;
};

async function loadRows(db: Db, view = "particulares_link_rows", optional = false): Promise<CurrentRow[]> {
  const out: CurrentRow[] = [];
  for (let from = 0; ; from += PAGE) {
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
  "id, description, external_id, property_reference, bc_reference, cover_photo_url, operation, status, archived_at, price, bedrooms, bathrooms, square_meters, address, latitude, longitude, location_precision, created_at, agencies(name)";

async function loadAgencyProperties(db: Db): Promise<AgencyPropertyInput[] | null> {
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
      out.push({ ...r, description: typeof r.description === "string" ? r.description.slice(0, 700) : null, agency_name: ag?.name ?? null });
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

async function doRun({ dryRun = false }: { dryRun?: boolean }): Promise<LinkingRunSummary> {
  const started = Date.now();
  const runStart = new Date(started - 5000).toISOString();
  const db = createAdminClient() as Db;
  try {
    const [rows, decisions] = await Promise.all([loadRows(db), loadDecisions(db)]);
    const result = computeLinks(rows, decisions);

    // Agencias anunciantes en portales (tipo «agencia_portal»): misma agencia en varios portales
    // o republicada → se agrupan con descripción, referencia, fotos y geometría (agency-matching.ts).
    const proRows = await loadRows(db, "particulares_agency_rows", true);
    if (proRows.length > 0) {
      const pro = computeAgencyPortalLinks(proRows, decisions);
      result.links.push(...pro.links);
      for (const [id, st] of pro.state) result.state.set(id, st);
      result.groups.push(...pro.groups);
      result.stats.pro_rows = proRows.length;
      result.stats.pro_links = pro.links.length;
      result.stats.pro_groups = pro.groups.length;
    }
    const allRows = [...rows, ...proRows];

    // Propiedades de agencias del CRM: mismo piso en otro portal → fuente «Agencia».
    let agencyMatches: ReturnType<typeof computeAgencyMatches> = [];
    let agencyReady = false;
    const [props, agencyDecisions] = await Promise.all([loadAgencyProperties(db), loadAgencyDecisions(db)]);
    if (props && agencyDecisions) {
      agencyReady = true;
      // Solo el anuncio principal de cada grupo: sus copias (otro portal, mismo piso) serían
      // «gemelos parecidos» y degradarían a «probable» un enlace que es cierto.
      const primaries = allRows.filter((r) => !result.state.get(r.id)?.duplicate_of);
      agencyMatches = computeAgencyMatches(primaries, props, agencyDecisions);
      applyAgencyToState(result, primaries, props, agencyMatches);
      result.stats.agency_matches = agencyMatches.length;
      result.stats.agency_matches_cierto = agencyMatches.filter((m) => m.level === "cierto").length;
    }

    const changes: Array<Record<string, unknown>> = [];
    for (const cur of allRows) {
      const want = result.state.get(cur.id);
      if (want && !sameState(cur, want)) {
        changes.push({
          id: cur.id,
          duplicate_of: want.duplicate_of,
          link_summary: want.link_summary,
          link_ops: want.link_ops,
        });
      }
    }

    let linksWritten = 0;
    let linksPruned = 0;
    if (!dryRun) {
      // Enlaces primero (así el modal los ve en cuanto cambia la agrupación).
      for (let i = 0; i < result.links.length; i += CHUNK) {
        const { data, error } = await db.rpc("apply_particulares_links", {
          p: result.links.slice(i, i + CHUNK),
        });
        if (error) throw new Error(`apply_particulares_links: ${error.message}`);
        linksWritten += Number(data ?? 0);
      }
      const pruned = await db.rpc("prune_particulares_links", { p_before: runStart });
      if (pruned.error) throw new Error(`prune_particulares_links: ${pruned.error.message}`);
      linksPruned = Number(pruned.data ?? 0);

      if (agencyReady) {
        for (let i = 0; i < agencyMatches.length; i += CHUNK) {
          const { error } = await db.rpc("apply_particulares_agency_matches", { p: agencyMatches.slice(i, i + CHUNK) });
          if (error) throw new Error(`apply_particulares_agency_matches: ${error.message}`);
        }
        const pr = await db.rpc("prune_particulares_agency_matches", { p_before: runStart });
        if (pr.error) throw new Error(`prune_particulares_agency_matches: ${pr.error.message}`);
      }

      for (let i = 0; i < changes.length; i += CHUNK) {
        const { error } = await db.rpc("apply_particulares_groups", { p: changes.slice(i, i + CHUNK) });
        if (error) throw new Error(`apply_particulares_groups: ${error.message}`);
      }
    }

    return {
      ok: true,
      dryRun,
      ms: Date.now() - started,
      stats: result.stats,
      changedRows: changes.length,
      linksWritten,
      linksPruned,
      agencyMatches: agencyMatches.length,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "linking_failed";
    console.error("[particulares-linking]", error);
    return { ok: false, dryRun, ms: Date.now() - started, stats: {}, changedRows: 0, linksWritten: 0, linksPruned: 0, error };
  }
}
