import "server-only";
import { createAdminClient } from "../admin";

export type PageViewRow = {
  id: string;
  property_id: string | null;
  share_id: string | null;
  collection_share_id: string | null;
  page_type: string;
  page_path: string;
  session_id: string;
  ip: string | null;
  device_type: string | null;
  browser: string | null;
  country_code: string | null;
  country_name: string | null;
  city: string | null;
  created_at: string;
};

export type AnalyticsFilters = {
  startDate?: string; // ISO
  endDate?: string; // ISO
  propertyId?: string;
  shareId?: string;
  pageType?: string;
};

export type AnalyticsSummary = {
  totalSessions: number;
  totalPageViews: number;
  sessionsWithPhotos: number;
  sessionsWithVideos: number;
  sessionsWithVisitRequest: number;
  sessionsWithContact: number;
  avgTimeSeconds: number | null;
  lastViewedAt: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnyQueryBuilder = ReturnType<ReturnType<typeof createAdminClient>["from"]>;

function applyViewFilters(
  query: AnyQueryBuilder,
  filters: AnalyticsFilters,
): AnyQueryBuilder {
  let q = query;
  if (filters.startDate) q = (q as unknown as { gte: (col: string, val: string) => AnyQueryBuilder }).gte("created_at", filters.startDate) as unknown as AnyQueryBuilder;
  if (filters.endDate) q = (q as unknown as { lte: (col: string, val: string) => AnyQueryBuilder }).lte("created_at", filters.endDate) as unknown as AnyQueryBuilder;
  if (filters.propertyId) q = (q as unknown as { eq: (col: string, val: string) => AnyQueryBuilder }).eq("property_id", filters.propertyId) as unknown as AnyQueryBuilder;
  if (filters.shareId) q = (q as unknown as { eq: (col: string, val: string) => AnyQueryBuilder }).eq("share_id", filters.shareId) as unknown as AnyQueryBuilder;
  if (filters.pageType) q = (q as unknown as { eq: (col: string, val: string) => AnyQueryBuilder }).eq("page_type", filters.pageType) as unknown as AnyQueryBuilder;
  return q;
}

// ---------------------------------------------------------------------------
// getAnalyticsSummary
// ---------------------------------------------------------------------------
export async function getAnalyticsSummary(
  filters: AnalyticsFilters,
): Promise<AnalyticsSummary> {
  const supabase = createAdminClient();

  // Fetch page_views with filters
  let viewsQ = supabase
    .from("page_views")
    .select("id, session_id, created_at") as unknown as AnyQueryBuilder;
  viewsQ = applyViewFilters(viewsQ, filters);

  const viewsRes = await (viewsQ as unknown as Promise<{
    data: Array<{ id: string; session_id: string; created_at: string }> | null;
    error: { message: string } | null;
  }>);
  if (viewsRes.error) throw new Error(viewsRes.error.message);
  const views = viewsRes.data ?? [];

  const totalPageViews = views.length;
  const uniqueSessions = new Set(views.map((v) => v.session_id));
  const totalSessions = uniqueSessions.size;
  const lastViewedAt =
    views.length > 0
      ? views.reduce((latest, v) =>
          v.created_at > latest.created_at ? v : latest,
        ).created_at
      : null;

  if (views.length === 0) {
    return {
      totalSessions,
      totalPageViews,
      sessionsWithPhotos: 0,
      sessionsWithVideos: 0,
      sessionsWithVisitRequest: 0,
      sessionsWithContact: 0,
      avgTimeSeconds: null,
      lastViewedAt: null,
    };
  }

  const viewIds = views.map((v) => v.id);
  const viewSessionMap = new Map<string, string>(
    views.map((v) => [v.id, v.session_id]),
  );

  // Fetch events for these page_views
  const eventsRes = await supabase
    .from("page_events")
    .select("page_view_id, event_type, data")
    .in("page_view_id", viewIds);
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  const events = (eventsRes.data ?? []) as Array<{
    page_view_id: string;
    event_type: string;
    data: Record<string, unknown> | null;
  }>;

  const sessionsWithPhotos = new Set<string>();
  const sessionsWithVideos = new Set<string>();
  const sessionsWithVisitRequest = new Set<string>();
  const sessionsWithContact = new Set<string>();
  const timeSamples: number[] = [];

  for (const evt of events) {
    const sessionId = viewSessionMap.get(evt.page_view_id);
    if (!sessionId) continue;

    if (evt.event_type === "photo_view") sessionsWithPhotos.add(sessionId);
    if (evt.event_type === "video_play") sessionsWithVideos.add(sessionId);
    if (evt.event_type === "visit_request")
      sessionsWithVisitRequest.add(sessionId);
    if (evt.event_type === "contact_click") sessionsWithContact.add(sessionId);
    if (evt.event_type === "time_on_page" && evt.data) {
      const t = Number(evt.data["time_seconds"]);
      if (!isNaN(t)) timeSamples.push(t);
    }
  }

  const avgTimeSeconds =
    timeSamples.length > 0
      ? timeSamples.reduce((a, b) => a + b, 0) / timeSamples.length
      : null;

  return {
    totalSessions,
    totalPageViews,
    sessionsWithPhotos: sessionsWithPhotos.size,
    sessionsWithVideos: sessionsWithVideos.size,
    sessionsWithVisitRequest: sessionsWithVisitRequest.size,
    sessionsWithContact: sessionsWithContact.size,
    avgTimeSeconds,
    lastViewedAt,
  };
}

// ---------------------------------------------------------------------------
// getTopProperties
// ---------------------------------------------------------------------------
export async function getTopProperties(
  limit: number,
  filters?: AnalyticsFilters,
): Promise<
  Array<{ propertyId: string; totalSessions: number; lastViewedAt: string }>
> {
  const supabase = createAdminClient();

  let q = supabase
    .from("page_views")
    .select("property_id, session_id, created_at")
    .not("property_id", "is", null) as unknown as AnyQueryBuilder;
  if (filters) q = applyViewFilters(q, filters);

  const res = await (q as unknown as Promise<{
    data: Array<{
      property_id: string;
      session_id: string;
      created_at: string;
    }> | null;
    error: { message: string } | null;
  }>);
  if (res.error) throw new Error(res.error.message);
  const rows = res.data ?? [];

  // Aggregate in memory
  const byProperty = new Map<
    string,
    { sessions: Set<string>; lastViewedAt: string }
  >();
  for (const row of rows) {
    const entry = byProperty.get(row.property_id) ?? {
      sessions: new Set(),
      lastViewedAt: row.created_at,
    };
    entry.sessions.add(row.session_id);
    if (row.created_at > entry.lastViewedAt)
      entry.lastViewedAt = row.created_at;
    byProperty.set(row.property_id, entry);
  }

  return Array.from(byProperty.entries())
    .map(([propertyId, agg]) => ({
      propertyId,
      totalSessions: agg.sessions.size,
      lastViewedAt: agg.lastViewedAt,
    }))
    .sort((a, b) => b.totalSessions - a.totalSessions)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// getRecentSessions
// ---------------------------------------------------------------------------
export async function getRecentSessions(
  limit: number,
  filters?: AnalyticsFilters,
): Promise<Array<PageViewRow & { eventsCount: number }>> {
  const supabase = createAdminClient();

  let q = supabase
    .from("page_views")
    .select(
      "id, property_id, share_id, page_type, page_path, session_id, ip, device_type, browser, country_code, country_name, city, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit) as unknown as AnyQueryBuilder;
  if (filters) q = applyViewFilters(q, filters);

  const res = await (q as unknown as Promise<{
    data: PageViewRow[] | null;
    error: { message: string } | null;
  }>);
  if (res.error) throw new Error(res.error.message);
  const views = res.data ?? [];
  if (views.length === 0) return [];

  const eventsRes = await supabase
    .from("page_events")
    .select("page_view_id")
    .in(
      "page_view_id",
      views.map((v) => v.id),
    );
  if (eventsRes.error) throw new Error(eventsRes.error.message);
  const events = (eventsRes.data ?? []) as Array<{ page_view_id: string }>;

  const eventCounts = new Map<string, number>();
  for (const evt of events) {
    eventCounts.set(evt.page_view_id, (eventCounts.get(evt.page_view_id) ?? 0) + 1);
  }

  return views.map((v) => ({
    ...v,
    eventsCount: eventCounts.get(v.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// getPageViewsTimeline
// ---------------------------------------------------------------------------
export async function getPageViewsTimeline(
  filters: AnalyticsFilters,
  granularity: "day" | "week" | "month",
): Promise<Array<{ date: string; sessions: number; pageViews: number }>> {
  const supabase = createAdminClient();

  let q = supabase
    .from("page_views")
    .select("session_id, created_at") as unknown as AnyQueryBuilder;
  q = applyViewFilters(q, filters);

  const res = await (q as unknown as Promise<{
    data: Array<{ session_id: string; created_at: string }> | null;
    error: { message: string } | null;
  }>);
  if (res.error) throw new Error(res.error.message);
  const rows = res.data ?? [];

  function truncateDate(iso: string): string {
    const d = new Date(iso);
    if (granularity === "month") {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    }
    if (granularity === "week") {
      const day = d.getUTCDay(); // 0=Sun
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Mon
      const monday = new Date(d);
      monday.setUTCDate(diff);
      return monday.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 10);
  }

  const buckets = new Map<string, { sessions: Set<string>; pageViews: number }>();
  for (const row of rows) {
    const key = truncateDate(row.created_at);
    const entry = buckets.get(key) ?? { sessions: new Set(), pageViews: 0 };
    entry.sessions.add(row.session_id);
    entry.pageViews++;
    buckets.set(key, entry);
  }

  return Array.from(buckets.entries())
    .map(([date, agg]) => ({
      date,
      sessions: agg.sessions.size,
      pageViews: agg.pageViews,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// getDeviceDistribution
// ---------------------------------------------------------------------------
export async function getDeviceDistribution(
  filters: AnalyticsFilters,
): Promise<Array<{ device: string; count: number; percentage: number }>> {
  const supabase = createAdminClient();

  let q = supabase
    .from("page_views")
    .select("device_type") as unknown as AnyQueryBuilder;
  q = applyViewFilters(q, filters);

  const res = await (q as unknown as Promise<{
    data: Array<{ device_type: string | null }> | null;
    error: { message: string } | null;
  }>);
  if (res.error) throw new Error(res.error.message);
  const rows = res.data ?? [];

  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.device_type ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const total = rows.length;
  return Array.from(counts.entries())
    .map(([device, count]) => ({
      device,
      count,
      percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// getGeoDistribution
// ---------------------------------------------------------------------------
export async function getGeoDistribution(
  filters: AnalyticsFilters,
): Promise<Array<{ country: string; countryCode: string; count: number }>> {
  const supabase = createAdminClient();

  let q = supabase
    .from("page_views")
    .select("country_code, country_name") as unknown as AnyQueryBuilder;
  q = applyViewFilters(q, filters);

  const res = await (q as unknown as Promise<{
    data: Array<{ country_code: string | null; country_name: string | null }> | null;
    error: { message: string } | null;
  }>);
  if (res.error) throw new Error(res.error.message);
  const rows = res.data ?? [];

  const counts = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const code = row.country_code ?? "unknown";
    const name = row.country_name ?? code;
    const entry = counts.get(code) ?? { name, count: 0 };
    entry.count++;
    counts.set(code, entry);
  }

  return Array.from(counts.entries())
    .map(([countryCode, agg]) => ({
      country: agg.name,
      countryCode,
      count: agg.count,
    }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// getShareAnalytics
// ---------------------------------------------------------------------------
export async function getShareAnalytics(
  shareId: string,
  filters?: AnalyticsFilters,
): Promise<AnalyticsSummary & { shareId: string }> {
  const merged: AnalyticsFilters = { ...filters, shareId };
  const summary = await getAnalyticsSummary(merged);
  return { ...summary, shareId };
}

// ---------------------------------------------------------------------------
// insertPageView
// ---------------------------------------------------------------------------
/**
 * Registra una visita de página y devuelve su id.
 *
 * ⚠️ La versión anterior llamaba a `.insert(payload, { select: "id" })`. Esa no
 * es la firma de supabase-js: el segundo argumento admite `count`, no `select`,
 * así que la fila SÍ se insertaba pero la respuesta no traía datos y la función
 * lanzaba "no row returned" → el endpoint devolvía 500 y el navegador nunca
 * recibía el `pageViewId`. Sin ese id, `flush()` del tracker descarta la cola:
 * las visitas se contaban pero NINGÚN evento granular (photo_view, stop_view,
 * share_click…) llegaba a guardarse.
 *
 * Detectado en el QA de producción de Viewing Collections. La forma correcta es
 * encadenar `.select().single()`.
 */
export async function insertPageView(
  data: Omit<PageViewRow, "id" | "created_at">,
): Promise<{ id: string }> {
  const supabase = createAdminClient();
  const extra = data as unknown as Record<string, unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (supabase as any)
    .from("page_views")
    .insert({
      property_id: data.property_id,
      share_id: data.share_id,
      collection_share_id: data.collection_share_id ?? null,
      page_type: data.page_type,
      page_path: data.page_path,
      referrer: extra["referrer"] ?? null,
      session_id: data.session_id,
      ip: data.ip,
      user_agent: extra["user_agent"] ?? null,
      device_type: data.device_type,
      browser: data.browser,
      os: extra["os"] ?? null,
      country_code: data.country_code,
      country_name: data.country_name,
      city: data.city,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!row?.id) throw new Error("insertPageView: no row returned");
  return { id: row.id };
}

// ---------------------------------------------------------------------------
// insertPageEvent
// ---------------------------------------------------------------------------
export async function insertPageEvent(data: {
  pageViewId: string;
  eventType: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createAdminClient();
  const insertTbl = supabase.from("page_events") as unknown as {
    insert: (payload: Record<string, unknown>) => Promise<{
      error: { message: string } | null;
    }>;
  };
  const res = await insertTbl.insert({
    page_view_id: data.pageViewId,
    event_type: data.eventType,
    data: data.data ?? null,
  });
  if (res.error) throw new Error(res.error.message);
}

// ---------------------------------------------------------------------------
// resolveCollectionShareId
// ---------------------------------------------------------------------------
/**
 * Traduce el token público de una Viewing Collection a su `share_id` interno.
 *
 * Existe para que la página pública no tenga que pasar el UUID del share como
 * prop a un Client Component: todo lo que se pasa como prop viaja en el payload
 * RSC y quedaba visible en el HTML. El token, en cambio, ya está en la URL.
 *
 * Devuelve null si el token no existe: el tracking nunca debe romper la
 * petición ni revelar si un token es válido.
 */
export async function resolveCollectionShareId(
  token: string,
): Promise<string | null> {
  if (!token || token.length < 16) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any;
    const { data } = await supabase
      .from("viewing_collection_shares")
      .select("id")
      .eq("token", token)
      .maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}
