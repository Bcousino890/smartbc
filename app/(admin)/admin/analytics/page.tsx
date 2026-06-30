import { AnalyticsDashboard } from "@/components/admin/analytics/analytics-dashboard";
import {
  getAnalyticsSummary,
  getTopProperties,
  getRecentSessions,
  getPageViewsTimeline,
  getDeviceDistribution,
  getGeoDistribution,
  type AnalyticsFilters,
} from "@/lib/db/queries/analytics";

export const dynamic = "force-dynamic";

function getDateRange(
  period?: string,
  startDate?: string,
  endDate?: string,
): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const endStr = end.toISOString();

  let start = new Date(now);

  if (period === "personalizado" && startDate && endDate) {
    return {
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
    };
  }

  if (period === "esteAño") {
    start = new Date(now.getUTCFullYear(), 0, 1);
  } else {
    // Default: últimos 30 días
    start.setDate(start.getDate() - 30);
  }

  start.setHours(0, 0, 0, 0);
  return {
    startDate: start.toISOString(),
    endDate: endStr,
  };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;

  const { startDate, endDate } = getDateRange(
    params.period,
    params.startDate,
    params.endDate,
  );

  const filters: AnalyticsFilters = {
    startDate,
    endDate,
    propertyId: params.propertyId || undefined,
  };

  const [summary, topProperties, recentSessions, timeline, devices, geo] =
    await Promise.all([
      getAnalyticsSummary(filters),
      getTopProperties(10, filters),
      getRecentSessions(50, filters),
      getPageViewsTimeline(filters, "day"),
      getDeviceDistribution(filters),
      getGeoDistribution(filters),
    ]);

  return (
    <AnalyticsDashboard
      data={{
        summary,
        topProperties,
        recentSessions,
        timeline,
        devices,
        geo,
      }}
      filters={filters}
      period={params.period || "últimos30d"}
    />
  );
}
