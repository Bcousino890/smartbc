import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { runSyncForFeed } from "./diff-engine";
import { getScraperByKey } from "./scrapers";
import type { SyncResult } from "./types";

type RunFeedOptions = {
  feedId: string;
  triggeredBy: "cron" | "manual" | "test";
};

type RunFeedFailure = {
  ok: false;
  error:
    | "feed_not_found"
    | "agency_missing"
    | "scraper_not_registered"
    | "already_running";
};

type RunFeedSuccess = { ok: true; result: SyncResult };

export async function runFeedById(
  options: RunFeedOptions,
): Promise<RunFeedSuccess | RunFeedFailure> {
  const supabase = createAdminClient();
  const feedRes = await supabase
    .from("agency_feeds")
    .select("*, agencies(id, slug)")
    .eq("id", options.feedId)
    .maybeSingle();

  if (feedRes.error) throw new Error(feedRes.error.message);
  if (!feedRes.data) return { ok: false, error: "feed_not_found" };

  const row = feedRes.data as unknown as {
    id: string;
    agency_id: string;
    scraper_key: string;
    feed_url: string | null;
    last_status: string | null;
    agencies: { id: string; slug: string } | null;
  };
  if (!row.agencies) return { ok: false, error: "agency_missing" };

  // Guarda contra concurrencia: si el feed ya está corriendo, salimos sin
  // tocar nada para que dos disparos (manual + cron, o dos crones que se
  // solapan) no se pisen entre sí ni creen errores de duplicate-key.
  if (row.last_status === "running") {
    return { ok: false, error: "already_running" };
  }

  const scraper = getScraperByKey(row.scraper_key);
  if (!scraper) return { ok: false, error: "scraper_not_registered" };

  const result = await runSyncForFeed({
    feedId: row.id,
    agencyId: row.agency_id,
    agencySlug: row.agencies.slug,
    scraper,
    feedUrl: row.feed_url,
    triggeredBy: options.triggeredBy,
  });
  return { ok: true, result };
}

export async function runDueFeeds(): Promise<{
  attempted: number;
  results: Array<{ feedId: string; status: SyncResult["status"] | "error" }>;
}> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const dueRes = await supabase
    .from("agency_feeds")
    .select("id")
    .eq("active", true)
    // Excluir feeds que ya están corriendo (otro cron/manual los está
    // procesando). Sin este filtro dos crones solapados o un manual + cron
    // se pisaban entre sí causando errores de duplicate-key.
    .neq("last_status", "running")
    .or(`next_run_at.is.null,next_run_at.lte.${now}`);
  if (dueRes.error) throw new Error(dueRes.error.message);

  const ids = ((dueRes.data ?? []) as Array<{ id: string }>).map((r) => r.id);
  const results: Array<{
    feedId: string;
    status: SyncResult["status"] | "error";
  }> = [];

  for (const id of ids) {
    try {
      const r = await runFeedById({ feedId: id, triggeredBy: "cron" });
      results.push({
        feedId: id,
        status: r.ok ? r.result.status : "error",
      });
    } catch {
      results.push({ feedId: id, status: "error" });
    }
  }
  return { attempted: ids.length, results };
}
