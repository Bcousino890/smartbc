import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getIdealistaScraperConfig, type IdealistaScraperConfig } from "./config";

/**
 * Estado técnico del scraper para el mini panel.
 *
 * La pregunta que tiene que contestar es una sola: **¿está funcionando?**
 * Todo lo demás (contadores, cobertura, cuota) es contexto para entender por
 * qué no lo está.
 *
 * El estado NO se lee de lo que el scraper dice de sí mismo, sino de cuándo fue
 * la última vez que dio señales. Un worker puede reportar `status: "running"` y
 * estar colgado; lo que no puede es seguir mandando heartbeats si está muerto.
 */

export type ScraperState = "RUNNING" | "IDLE" | "STALE" | "ERROR" | "STOPPED";

export type WorkerStatus = {
  worker_id: string;
  state: ScraperState;
  reported_status: string;
  last_heartbeat_at: string;
  minutes_since_heartbeat: number;
  current_run_type: string | null;
  current_shard: string | null;
  message: string | null;
};

export type ScraperStatus = {
  state: ScraperState;
  scraping_enabled: boolean;
  stale_threshold_minutes: number;

  workers: WorkerStatus[];
  last_heartbeat_at: string | null;
  last_listing_at: string | null;
  last_run: {
    external_run_id: string;
    run_type: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    listings_seen: number;
    listings_sent: number;
    new_listings: number;
    updated_listings: number;
    unchanged_listings: number;
    errors_count: number;
    requests_used: number;
    coverage_percentage: number | null;
    shards_total: number | null;
    shards_success: number | null;
    shards_failed: number | null;
    error_summary: string | null;
  } | null;

  month: {
    requests_used: number;
    budget: number;
    reserve: number;
    /** % del presupuesto consumido. Pasado el 100 % se está tirando de reserva. */
    percentage: number;
    runs: number;
  };

  totals: {
    listings_active: number;
    listings_missing: number;
    listings_off_market: number;
    listings_last_24h: number;
    events_last_24h: number;
  };
};

function minutesSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

/**
 * Estado de un worker suelto.
 *
 * El orden de las comprobaciones importa: si el scraping está apagado, dar
 * "STALE" sería una falsa alarma — no reporta porque le hemos dicho que no
 * trabaje. Y un worker sin heartbeat reciente es STALE aunque él afirme estar
 * corriendo, porque su última afirmación es justamente la que ya no llega.
 */
function deriveWorkerState(
  reportedStatus: string,
  minutesSinceHeartbeat: number,
  config: IdealistaScraperConfig,
): ScraperState {
  if (!config.scraping_enabled) return "STOPPED";
  if (reportedStatus === "stopped") return "STOPPED";
  if (minutesSinceHeartbeat > config.heartbeat_stale_minutes) return "STALE";
  if (reportedStatus === "error") return "ERROR";
  if (reportedStatus === "idle") return "IDLE";
  return "RUNNING";
}

/**
 * Estado global: el del peor worker.
 *
 * Con varios workers, que uno funcione no compensa que otro esté caído — el
 * panel tiene que enseñar el problema, no la media.
 */
function worstState(states: ScraperState[]): ScraperState {
  const severity: Record<ScraperState, number> = {
    ERROR: 5,
    STALE: 4,
    STOPPED: 3,
    IDLE: 2,
    RUNNING: 1,
  };
  return states.reduce((worst, s) => (severity[s] > severity[worst] ? s : worst), "RUNNING");
}

export async function getIdealistaScraperStatus(): Promise<ScraperStatus> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const config = await getIdealistaScraperConfig();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [workersRes, lastListingRes, lastRunRes, monthRunsRes] = await Promise.all([
    db.from("idealista_scraper_workers").select("*").order("last_heartbeat_at", { ascending: false }),
    db
      .from("idealista_market_listings")
      .select("last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("idealista_scraper_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("idealista_scraper_runs")
      .select("requests_used")
      .gte("started_at", monthStart.toISOString()),
  ]);

  const workers: WorkerStatus[] = (workersRes.data ?? []).map(
    (w: Record<string, string | null>) => {
      const mins = minutesSince(w.last_heartbeat_at ?? null);
      return {
        worker_id: w.worker_id as string,
        reported_status: (w.status as string) ?? "unknown",
        state: deriveWorkerState((w.status as string) ?? "unknown", mins, config),
        last_heartbeat_at: w.last_heartbeat_at as string,
        minutes_since_heartbeat: Math.round(mins),
        current_run_type: w.current_run_type ?? null,
        current_shard: w.current_shard ?? null,
        message: w.message ?? null,
      };
    },
  );

  // Sin ningún worker registrado no hay nada que promediar: si el scraping está
  // activo y nadie ha dado señales nunca, eso es STALE (falta por conectar), no
  // "todo bien".
  const state: ScraperState = !config.scraping_enabled
    ? "STOPPED"
    : workers.length === 0
      ? "STALE"
      : worstState(workers.map((w) => w.state));

  const [activeRes, missingRes, offMarketRes, recentRes, eventsRes] = await Promise.all([
    db
      .from("idealista_market_listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    db
      .from("idealista_market_listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "missing"),
    db
      .from("idealista_market_listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "off_market"),
    db
      .from("idealista_market_listings")
      .select("id", { count: "exact", head: true })
      .gte("first_seen_at", dayAgo),
    db
      .from("idealista_market_events")
      .select("id", { count: "exact", head: true })
      .gte("detected_at", dayAgo),
  ]);

  const requestsUsed = (monthRunsRes.data ?? []).reduce(
    (sum: number, r: { requests_used: number | null }) => sum + (r.requests_used ?? 0),
    0,
  );

  const run = lastRunRes.data;

  return {
    state,
    scraping_enabled: config.scraping_enabled,
    stale_threshold_minutes: config.heartbeat_stale_minutes,
    workers,
    last_heartbeat_at: workers[0]?.last_heartbeat_at ?? null,
    last_listing_at: lastListingRes.data?.last_seen_at ?? null,
    last_run: run
      ? {
          external_run_id: run.external_run_id,
          run_type: run.run_type,
          status: run.status,
          started_at: run.started_at,
          finished_at: run.finished_at,
          listings_seen: run.listings_seen ?? 0,
          listings_sent: run.listings_sent ?? 0,
          new_listings: run.new_listings ?? 0,
          updated_listings: run.updated_listings ?? 0,
          unchanged_listings: run.unchanged_listings ?? 0,
          errors_count: run.errors_count ?? 0,
          requests_used: run.requests_used ?? 0,
          coverage_percentage: run.coverage_percentage,
          shards_total: run.shards_total,
          shards_success: run.shards_success,
          shards_failed: run.shards_failed,
          error_summary: run.error_summary,
        }
      : null,
    month: {
      requests_used: requestsUsed,
      budget: config.monthly_request_budget,
      reserve: config.monthly_request_reserve,
      percentage:
        config.monthly_request_budget > 0
          ? Math.round((requestsUsed / config.monthly_request_budget) * 1000) / 10
          : 0,
      runs: (monthRunsRes.data ?? []).length,
    },
    totals: {
      listings_active: activeRes.count ?? 0,
      listings_missing: missingRes.count ?? 0,
      listings_off_market: offMarketRes.count ?? 0,
      listings_last_24h: recentRes.count ?? 0,
      events_last_24h: eventsRes.count ?? 0,
    },
  };
}
