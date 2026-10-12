import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { SCRAPER_PORTALS, type ScraperPortal } from "./control-types";
import {
  COMPONENT_PREFIX,
  NO_ZONE_KEY,
  emptyComponents,
  isComponent,
  type CostsPayload,
  type PortalCosts,
} from "./cost-model";

/**
 * Gasto REAL en créditos por portal / zona / componente / tarea, medido por el crawler
 * (libro de gasto) y publicado en `scraper_stats_daily` (ver cost-model.ts para el formato de las filas).
 * La ventana son los últimos 7 días COMPLETOS (los de «hoy» solo se usan si no hay ningún día completo,
 * y entonces la proyección se prorratea por las horas transcurridas y se marca como provisional).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Row = { day: string; portal: ScraperPortal; zone_key: string; task: string; requests: number; credits: number };

export const COST_WINDOW_DAYS = 7;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.code === "42P01" || err.code === "PGRST205" || /does not exist|schema cache/i.test(err.message ?? ""));
}

/** PostgREST corta en 1.000 filas por petición: se pagina (tope de seguridad de 40 páginas). */
async function readRows(db: Db, from: string, to: string, kind: "cmp" | "totals") {
  const rows: Row[] = [];
  for (let page = 0; page < 40; page++) {
    let q = db
      .from("scraper_stats_daily")
      .select("day,portal,zone_key,task,requests,credits")
      .gte("day", from)
      .lte("day", to)
      .eq("operation", "*")
      .order("day", { ascending: true })
      .order("portal", { ascending: true })
      .order("zone_key", { ascending: true })
      .order("task", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    q = kind === "cmp" ? q.like("task", `${COMPONENT_PREFIX}%`) : q.eq("zone_key", "*");
    const { data, error } = await q;
    if (error) return { rows, error };
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return { rows, error: null };
}

export async function loadCosts(): Promise<CostsPayload> {
  const db = createAdminClient() as Db;
  const now = new Date();
  const today = ymd(now);
  const from = ymd(new Date(now.getTime() - COST_WINDOW_DAYS * 86_400_000));
  const empty: CostsPayload = {
    tableReady: true,
    hasData: false,
    from,
    to: today,
    daysMeasured: 0,
    provisional: false,
    projectionDays: 0,
    portals: { idealista: null, fotocasa: null, pisos: null, habitaclia: null },
  };

  const [cmp, tot] = await Promise.all([readRows(db, from, today, "cmp"), readRows(db, from, today, "totals")]);
  const err = cmp.error ?? tot.error;
  if (err) {
    if (isMissingTable(err)) return { ...empty, tableReady: false };
    console.error("[scraper-costs] error leyendo:", err.message);
    throw new Error("No se pudo leer el gasto de créditos");
  }

  // Días con datos del libro = días con filas por componente. Los completos son los anteriores a hoy.
  const ledgerDays = new Set(cmp.rows.map((r) => r.day));
  const complete = [...ledgerDays].filter((d) => d < today);
  let days: Set<string>;
  let provisional = false;
  let projectionDays: number;
  if (complete.length > 0) {
    days = new Set(complete);
    projectionDays = complete.length;
  } else if (ledgerDays.has(today)) {
    days = new Set([today]);
    provisional = true;
    // Fracción del día UTC transcurrida (mínimo 3 h: antes la proyección sería puro ruido).
    projectionDays = Math.max(3 / 24, (now.getUTCHours() * 60 + now.getUTCMinutes()) / 1440);
  } else {
    return empty;
  }

  const portals: Record<ScraperPortal, PortalCosts | null> = { idealista: null, fotocasa: null, pisos: null, habitaclia: null };
  const get = (p: ScraperPortal): PortalCosts =>
    (portals[p] ??= { totalCredits: 0, components: emptyComponents(), tasks: [], leaves: [], unattributed: emptyComponents() });

  const leafIdx = new Map<string, number>();
  for (const r of cmp.rows) {
    if (!days.has(r.day) || !SCRAPER_PORTALS.includes(r.portal)) continue;
    const comp = r.task.slice(COMPONENT_PREFIX.length);
    if (!isComponent(comp)) continue;
    const p = get(r.portal);
    p.components[comp] += r.credits;
    if (r.zone_key === NO_ZONE_KEY) {
      p.unattributed[comp] += r.credits;
      continue;
    }
    const key = `${r.portal}|${r.zone_key}`;
    let i = leafIdx.get(key);
    if (i === undefined) {
      i = p.leaves.push({ zone_key: r.zone_key, components: emptyComponents() }) - 1;
      leafIdx.set(key, i);
    }
    p.leaves[i].components[comp] += r.credits;
  }

  const taskSum = new Map<string, number>();
  for (const r of tot.rows) {
    if (!days.has(r.day) || !SCRAPER_PORTALS.includes(r.portal)) continue;
    const p = get(r.portal);
    if (r.task === "*") p.totalCredits += r.credits;
    else if (!r.task.startsWith(COMPONENT_PREFIX)) taskSum.set(`${r.portal}|${r.task}`, (taskSum.get(`${r.portal}|${r.task}`) ?? 0) + r.credits);
  }
  for (const [k, credits] of taskSum) {
    const [portal, task] = k.split("|") as [ScraperPortal, string];
    get(portal).tasks.push({ task, credits });
  }
  for (const p of Object.values(portals)) p?.tasks.sort((a, b) => b.credits - a.credits);

  return { ...empty, hasData: true, daysMeasured: provisional ? 0 : days.size, provisional, projectionDays, portals };
}
