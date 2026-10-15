import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { FeedsStatsBlock } from "@/components/admin/feeds-stats";
import {
  RecentSyncsPanel,
  type RecentSyncVM,
} from "@/components/admin/recent-syncs";
import { SindicacionTabs, type SindicacionTabId } from "@/components/admin/sindicacion-tabs";
import { ParticularesCrawlerPanel } from "@/components/admin/particulares-crawler-panel";
import { PortalesPanel, SaludPanel } from "@/components/admin/scraper-control/panels";
import { SindicacionShell } from "@/components/admin/sindicacion-shell";
import type { FeedRowVM } from "@/components/admin/feeds-table";
import { PageFooter } from "@/components/ui/page-footer";
import { minutesSince } from "@/lib/db/adapters";
import { getAgencies } from "@/lib/db/queries/agencies";
import {
  getFeedAggregateStats,
  getFeedsWithAgency,
} from "@/lib/db/queries/feeds";
import { createClient } from "@/lib/db/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getScraperByKey, listScraperKeys } from "@/lib/sync/scrapers";
import { getCountryConfig, type Country } from "@/lib/country-config";

async function loadRecentLogs(): Promise<RecentSyncVM[]> {
  const supabase = await createClient();
  const recentLogsRes = await supabase
    .from("sync_logs")
    .select(
      "id, started_at, finished_at, status, triggered_by, properties_inserted, properties_updated, properties_archived, error_message, feed_id, agency_feeds(agency_id, agencies(name))",
    )
    .order("started_at", { ascending: false })
    .limit(15);

  type LogJoin = {
    id: string;
    started_at: string;
    finished_at: string | null;
    status: "running" | "success" | "partial" | "error";
    triggered_by: string;
    properties_inserted: number;
    properties_updated: number;
    properties_archived: number;
    error_message: string | null;
    agency_feeds:
      | {
          agencies: { name: string } | { name: string }[] | null;
        }
      | Array<{
          agencies: { name: string } | { name: string }[] | null;
        }>
      | null;
  };

  function pickName(row: LogJoin): string {
    const feed = Array.isArray(row.agency_feeds)
      ? row.agency_feeds[0]
      : row.agency_feeds;
    if (!feed) return "—";
    const agency = Array.isArray(feed.agencies)
      ? feed.agencies[0]
      : feed.agencies;
    return agency?.name ?? "—";
  }

  return (
    (recentLogsRes.data ?? []) as unknown as LogJoin[]
  ).map((row) => ({
    id: row.id,
    agencyName: pickName(row),
    status: row.status,
    triggeredBy: row.triggered_by,
    startedMinutesAgo: minutesSince(row.started_at),
    durationSeconds: row.finished_at
      ? Math.max(
          0,
          Math.round(
            (new Date(row.finished_at).getTime() -
              new Date(row.started_at).getTime()) /
              1000,
          ),
        )
      : null,
    inserted: row.properties_inserted,
    updated: row.properties_updated,
    archived: row.properties_archived,
    errorMessage: row.error_message,
  }));
}

export const dynamic = "force-dynamic";

export default async function AdminSindicacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: Country }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { country } = await params;
  // La sindicación de feeds (Idealista/Fotocasa) es solo de España.
  if (country !== "es") redirect(getCountryConfig(country).prefix);

  const currentProfile = await getCurrentProfile();
  const role = currentProfile?.role ?? "";
  // Feeds de agencias → permiso «sindicacion»; scrapers de portales, particulares y salud → «particulares»
  // (el mismo que ya exige la API del crawler).
  const canFeeds = canAccess(role, "sindicacion", "view");
  const canScrapers = canAccess(role, "particulares", "view");
  if (!canFeeds && !canScrapers) {
    redirect(getCountryConfig(country).prefix);
  }
  const allowed: SindicacionTabId[] = [
    ...(canFeeds ? (["feeds"] as const) : []),
    ...(canScrapers ? (["portales", "particulares", "salud"] as const) : []),
  ];
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: SindicacionTabId = allowed.includes(rawTab as SindicacionTabId) ? (rawTab as SindicacionTabId) : allowed[0];

  const header = (
    <>
      <AdminPageHeader titleKey="sindicacion.title" subtitleKey="sindicacion.subtitle" />
      <div className="mt-6">
        <SindicacionTabs active={tab} allowed={allowed} />
      </div>
    </>
  );
  const footer = <PageFooter textKey="admin.realtime.footer" variant="inline" />;
  const wrap = "mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10";

  if (tab === "portales" || tab === "particulares" || tab === "salud") {
    return (
      <div className={wrap}>
        {header}
        <div className="mt-5" role="tabpanel">
          {tab === "portales" ? <PortalesPanel /> : tab === "salud" ? <SaludPanel /> : <ParticularesCrawlerPanel />}
        </div>
        {tab === "salud" && canFeeds ? <div className="mt-5"><RecentSyncsPanel logs={await loadRecentLogs()} /></div> : null}
        {footer}
      </div>
    );
  }

  const [feeds, stats, allAgencies] = await Promise.all([
    getFeedsWithAgency(),
    getFeedAggregateStats(),
    getAgencies(),
  ]);

  const recentLogs = await loadRecentLogs();

  const feedRows: FeedRowVM[] = feeds.map((f) => ({
    id: f.id,
    agencyName: f.agencies?.name ?? "—",
    agencySlug: f.agencies?.slug ?? "",
    scraperKey: f.scraper_key,
    active: f.active,
    health: f.health,
    lastStatus: f.last_status,
    lastError: f.last_error,
    lastRunMinutesAgo: f.last_run_at ? minutesSince(f.last_run_at) : null,
    frequencyHours: f.frequency_hours,
  }));

  const usedAgencyIds = new Set(feeds.map((f) => f.agency_id));
  type AgencyLite = { id: string; name: string; slug: string };
  const agenciesWithoutFeed = ((allAgencies ?? []) as unknown as AgencyLite[])
    .filter((a) => !usedAgencyIds.has(a.id))
    .map((a) => ({ id: a.id, name: a.name, slug: a.slug }));

  const scrapers = listScraperKeys().map((key) => {
    const scraper = getScraperByKey(key);
    return { key, label: scraper?.label ?? key };
  });

  return (
    <div className={wrap}>
      {header}

      <div className="mt-7">
        <FeedsStatsBlock stats={stats} />
      </div>

      <div className="mt-5">
        <SindicacionShell
          feeds={feedRows}
          agenciesWithoutFeed={agenciesWithoutFeed}
          scrapers={scrapers}
        />
      </div>

      <div className="mt-5">
        <RecentSyncsPanel logs={recentLogs} />
      </div>

      {footer}
    </div>
  );
}
