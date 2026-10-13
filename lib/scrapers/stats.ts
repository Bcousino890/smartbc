import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { SCRAPER_PORTALS, TASKS, billingPeriod, type ScraperPortal } from "./control-types";
import type { StatsOpFilter, StatsPayload, StatsPeriod, StatsPortalFilter, StatsZoneRow } from "./stats-types";

/**
 * Estadísticas agregadas para la pestaña «Estadísticas». Lee SOLO
 * `scraper_stats_daily` (la rellena el crawler) y los nombres de zona de
 * `scraper_zones`.
 *
 * Reglas de lectura de la tabla (contrato): zone_key '*' = total del portal,
 * task '*' = todas las tareas, operation '*' = venta y alquiler juntas.
 *  - KPIs y gráfico diario: filas con zona '*' y tarea '*'.
 *  - Ranking de zonas: filas con zona concreta y tarea '*'.
 *  - Créditos por tarea: filas con tarea concreta y zona '*'.
 * Con el filtro de operación se usa esa operación; sin filtro, '*'.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Row = {
  day: string;
  portal: ScraperPortal;
  zone_key: string;
  task: string;
  operation: string;
  new_listings: number;
  taken_down: number;
  reactivated: number;
  price_down: number;
  price_up: number;
  avg_price_change_pct: number | null;
  requests: number;
  credits: number;
};

export const isStatsPeriod = (v: string | null): v is StatsPeriod => v === "7" || v === "30" || v === "billing";
export const isPortalFilter = (v: string | null): v is StatsPortalFilter => v === "all" || (SCRAPER_PORTALS as readonly string[]).includes(v ?? "");
export const isOpFilter = (v: string | null): v is StatsOpFilter => v === "all" || v === "sale" || v === "rent";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const TASK_LABEL = new Map(Object.values(TASKS).flat().map((t) => [t.type, t.label]));

/** Pondera por nº de variaciones: la media de medias solo es correcta si se pesa. */
function weightedAvg(rows: Array<{ pct: number | null; n: number }>): number | null {
  let sum = 0;
  let w = 0;
  for (const r of rows) {
    if (r.pct == null || r.n <= 0) continue;
    sum += Number(r.pct) * r.n;
    w += r.n;
  }
  return w > 0 ? sum / w : null;
}

export async function loadStats(period: StatsPeriod, portal: StatsPortalFilter, op: StatsOpFilter): Promise<StatsPayload> {
  const db = createAdminClient() as Db;
  const now = new Date();

  let from: Date;
  if (period === "billing") {
    const { data } = await db.from("scraper_settings").select("value").eq("key", "crawio.billing_day").maybeSingle();
    from = billingPeriod(now, typeof data?.value === "number" ? data.value : 8).start;
  } else {
    from = new Date(now.getTime() - (Number(period) - 1) * 86_400_000);
  }
  const fromS = ymd(from);
  const toS = ymd(now);
  const empty: StatsPayload = {
    tableReady: true,
    hasData: false,
    from: fromS,
    to: toS,
    kpis: { newListings: 0, takenDown: 0, reactivated: 0, priceDown: 0, priceUp: 0, avgChangePct: null, requests: 0, credits: 0 },
    daily: [],
    zones: [],
    tasks: [],
  };

  // PostgREST corta en 1.000 filas por petición: se pagina (tope de seguridad de 30 páginas).
  const rows: Row[] = [];
  for (let page = 0; page < 30; page++) {
    let q = db
      .from("scraper_stats_daily")
      .select("day,portal,zone_key,task,operation,new_listings,taken_down,reactivated,price_down,price_up,avg_price_change_pct,requests,credits")
      .gte("day", fromS)
      .lte("day", toS)
      .eq("operation", op === "all" ? "*" : op)
      .order("day", { ascending: true })
      .order("portal", { ascending: true })
      .order("zone_key", { ascending: true })
      .order("task", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (portal !== "all") q = q.eq("portal", portal);
    const { data, error } = await q;
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "")) {
        return { ...empty, tableReady: false };
      }
      console.error("[scraper-stats] error leyendo:", error.message);
      throw new Error("No se pudieron leer las estadísticas");
    }
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  if (rows.length === 0) return empty;

  // KPIs y gráfico diario
  const totals = rows.filter((r) => r.zone_key === "*" && r.task === "*");
  const k = empty.kpis;
  const byDay = new Map<string, { newListings: number; takenDown: number; credits: number }>();
  for (const r of totals) {
    k.newListings += r.new_listings;
    k.takenDown += r.taken_down;
    k.reactivated += r.reactivated;
    k.priceDown += r.price_down;
    k.priceUp += r.price_up;
    k.requests += r.requests;
    k.credits += r.credits;
    const d = byDay.get(r.day) ?? { newListings: 0, takenDown: 0, credits: 0 };
    d.newListings += r.new_listings;
    d.takenDown += r.taken_down;
    d.credits += r.credits;
    byDay.set(r.day, d);
  }
  k.avgChangePct = weightedAvg(totals.map((r) => ({ pct: r.avg_price_change_pct, n: r.price_down + r.price_up })));
  // Todos los días del periodo, también los vacíos, para que el gráfico no se «comprima».
  const daily: StatsPayload["daily"] = [];
  for (let d = new Date(`${fromS}T00:00:00Z`); ymd(d) <= toS; d = new Date(d.getTime() + 86_400_000)) {
    const key = ymd(d);
    daily.push({ day: key, ...(byDay.get(key) ?? { newListings: 0, takenDown: 0, credits: 0 }) });
  }

  // Ranking de zonas
  const labels = new Map<string, string>();
  // PostgREST corta a 1.000 filas por petición y hay más zonas que eso: se lee por páginas.
  for (let page = 0; page < 20; page++) {
    const { data: zl } = await db
      .from("scraper_zones")
      .select("portal,zone_key,label")
      .order("portal", { ascending: true })
      .order("zone_key", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    for (const z of (zl ?? []) as Array<{ portal: string; zone_key: string; label: string }>) labels.set(`${z.portal}|${z.zone_key}`, z.label);
    if (!zl || zl.length < 1000) break;
  }
  const zmap = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.zone_key === "*" || r.task !== "*") continue;
    const key = `${r.portal}|${r.zone_key}`;
    zmap.set(key, [...(zmap.get(key) ?? []), r]);
  }
  const zones: StatsZoneRow[] = [...zmap.entries()].map(([key, rs]) => {
    const sum = (f: (r: Row) => number) => rs.reduce((n, r) => n + f(r), 0);
    const nw = sum((r) => r.new_listings);
    const credits = sum((r) => r.credits);
    return {
      portal: rs[0].portal,
      zone_key: rs[0].zone_key,
      label: labels.get(key) ?? rs[0].zone_key,
      newListings: nw,
      takenDown: sum((r) => r.taken_down),
      priceDown: sum((r) => r.price_down),
      priceUp: sum((r) => r.price_up),
      avgChangePct: weightedAvg(rs.map((r) => ({ pct: r.avg_price_change_pct, n: r.price_down + r.price_up }))),
      credits,
      creditsPerNew: nw > 0 ? credits / nw : null,
    };
  });

  // Créditos por tarea
  const tmap = new Map<string, { credits: number; requests: number }>();
  for (const r of rows) {
    if (r.zone_key !== "*" || r.task === "*") continue;
    const t = tmap.get(r.task) ?? { credits: 0, requests: 0 };
    t.credits += r.credits;
    t.requests += r.requests;
    tmap.set(r.task, t);
  }
  const tasks = [...tmap.entries()]
    .map(([task, v]) => ({ task, label: TASK_LABEL.get(task) ?? task, ...v }))
    .sort((a, b) => b.credits - a.credits);

  return { tableReady: true, hasData: true, from: fromS, to: toS, kpis: k, daily, zones, tasks };
}
