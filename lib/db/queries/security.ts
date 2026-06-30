import "server-only";
import { createAdminClient } from "../admin";

export type IpBlocklistEntry = {
  id: string;
  ip_address: string;
  reason: string;
  severity: string;
  cidr_range: string | null;
  is_active: boolean;
  blocked_at: string;
  expires_at: string | null;
  blocked_by: string | null;
  notes: string | null;
};

export type IpWhitelistEntry = {
  id: string;
  ip_address: string;
  cidr_range: string | null;
  description: string | null;
  is_active: boolean;
  added_by: string | null;
  created_at: string;
};

export type IpActivityLogEntry = {
  id: string;
  ip_address: string;
  session_id: string | null;
  action: string;
  page_path: string | null;
  http_status: number | null;
  detected_bot: boolean;
  detected_scraper: boolean;
  request_count_last_minute: number | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// isIPBlocked
// ---------------------------------------------------------------------------
export async function isIPBlocked(ip: string): Promise<boolean> {
  const supabase = createAdminClient();
  // We fetch matching active entries and check expiry in memory to avoid
  // complex raw SQL through the client builder.
  const res = await supabase
    .from("ip_blacklist")
    .select("expires_at")
    .eq("ip_address", ip)
    .eq("is_active", true);
  if (res.error) throw new Error(res.error.message);
  const rows = (res.data ?? []) as Array<{ expires_at: string | null }>;
  const now = new Date();
  return rows.some(
    (r) => r.expires_at === null || new Date(r.expires_at) > now,
  );
}

// ---------------------------------------------------------------------------
// isIPWhitelisted
// ---------------------------------------------------------------------------
export async function isIPWhitelisted(ip: string): Promise<boolean> {
  const supabase = createAdminClient();
  const res = await supabase
    .from("ip_whitelist")
    .select("id")
    .eq("ip_address", ip)
    .eq("is_active", true)
    .limit(1);
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []).length > 0;
}

// ---------------------------------------------------------------------------
// addToBlacklist
// ---------------------------------------------------------------------------
export async function addToBlacklist(entry: {
  ip: string;
  reason: string;
  severity?: string;
  notes?: string;
  blockedBy?: string;
  expiresAt?: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const tbl = supabase.from("ip_blacklist") as unknown as {
    insert: (payload: Record<string, unknown>) => Promise<{
      error: { message: string } | null;
    }>;
  };
  const res = await tbl.insert({
    ip_address: entry.ip,
    reason: entry.reason,
    severity: entry.severity ?? "high",
    notes: entry.notes ?? null,
    blocked_by: entry.blockedBy ?? null,
    expires_at: entry.expiresAt ?? null,
  });
  if (res.error) throw new Error(res.error.message);
}

// ---------------------------------------------------------------------------
// removeFromBlacklist
// ---------------------------------------------------------------------------
export async function removeFromBlacklist(id: string): Promise<void> {
  const supabase = createAdminClient();
  const tbl = supabase.from("ip_blacklist") as unknown as {
    update: (
      payload: Record<string, unknown>,
    ) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
  };
  const res = await tbl.update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

// ---------------------------------------------------------------------------
// addToWhitelist
// ---------------------------------------------------------------------------
export async function addToWhitelist(entry: {
  ip: string;
  description?: string;
  addedBy?: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const tbl = supabase.from("ip_whitelist") as unknown as {
    insert: (payload: Record<string, unknown>) => Promise<{
      error: { message: string } | null;
    }>;
  };
  const res = await tbl.insert({
    ip_address: entry.ip,
    description: entry.description ?? null,
    added_by: entry.addedBy ?? null,
  });
  if (res.error) throw new Error(res.error.message);
}

// ---------------------------------------------------------------------------
// removeFromWhitelist
// ---------------------------------------------------------------------------
export async function removeFromWhitelist(id: string): Promise<void> {
  const supabase = createAdminClient();
  const tbl = supabase.from("ip_whitelist") as unknown as {
    update: (
      payload: Record<string, unknown>,
    ) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
  };
  const res = await tbl.update({ is_active: false }).eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

// ---------------------------------------------------------------------------
// getBlacklist
// ---------------------------------------------------------------------------
export async function getBlacklist(
  onlyActive?: boolean,
): Promise<IpBlocklistEntry[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from("ip_blacklist")
    .select(
      "id, ip_address, reason, severity, cidr_range, is_active, blocked_at, expires_at, blocked_by, notes",
    )
    .order("blocked_at", { ascending: false }) as unknown as {
    eq: (col: string, val: unknown) => typeof q;
    then: Promise<{
      data: IpBlocklistEntry[] | null;
      error: { message: string } | null;
    }>["then"];
  };

  if (onlyActive) {
    q = q.eq("is_active", true);
  }

  const res = await (q as unknown as Promise<{
    data: IpBlocklistEntry[] | null;
    error: { message: string } | null;
  }>);
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

// ---------------------------------------------------------------------------
// getWhitelist
// ---------------------------------------------------------------------------
export async function getWhitelist(
  onlyActive?: boolean,
): Promise<IpWhitelistEntry[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from("ip_whitelist")
    .select(
      "id, ip_address, cidr_range, description, is_active, added_by, created_at",
    )
    .order("created_at", { ascending: false }) as unknown as {
    eq: (col: string, val: unknown) => typeof q;
    then: Promise<{
      data: IpWhitelistEntry[] | null;
      error: { message: string } | null;
    }>["then"];
  };

  if (onlyActive) {
    q = q.eq("is_active", true);
  }

  const res = await (q as unknown as Promise<{
    data: IpWhitelistEntry[] | null;
    error: { message: string } | null;
  }>);
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

// ---------------------------------------------------------------------------
// getActivityLog
// ---------------------------------------------------------------------------
export async function getActivityLog(
  limit: number,
  filters?: { ip?: string; onlyBots?: boolean; onlyScrapers?: boolean },
): Promise<IpActivityLogEntry[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from("ip_activity_log")
    .select(
      "id, ip_address, session_id, action, page_path, http_status, detected_bot, detected_scraper, request_count_last_minute, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit) as unknown as {
    eq: (col: string, val: unknown) => typeof q;
    then: Promise<{
      data: IpActivityLogEntry[] | null;
      error: { message: string } | null;
    }>["then"];
  };

  if (filters?.ip) q = q.eq("ip_address", filters.ip);
  if (filters?.onlyBots) q = q.eq("detected_bot", true);
  if (filters?.onlyScrapers) q = q.eq("detected_scraper", true);

  const res = await (q as unknown as Promise<{
    data: IpActivityLogEntry[] | null;
    error: { message: string } | null;
  }>);
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

// ---------------------------------------------------------------------------
// logActivity
// ---------------------------------------------------------------------------
export async function logActivity(entry: {
  ip: string;
  sessionId?: string;
  action: string;
  pagePath?: string;
  httpStatus?: number;
  detectedBot?: boolean;
  detectedScraper?: boolean;
  requestCountLastMinute?: number;
}): Promise<void> {
  const supabase = createAdminClient();
  const tbl = supabase.from("ip_activity_log") as unknown as {
    insert: (payload: Record<string, unknown>) => Promise<{
      error: { message: string } | null;
    }>;
  };
  const res = await tbl.insert({
    ip_address: entry.ip,
    session_id: entry.sessionId ?? null,
    action: entry.action,
    page_path: entry.pagePath ?? null,
    http_status: entry.httpStatus ?? null,
    detected_bot: entry.detectedBot ?? false,
    detected_scraper: entry.detectedScraper ?? false,
    request_count_last_minute: entry.requestCountLastMinute ?? null,
  });
  if (res.error) throw new Error(res.error.message);
}

// ---------------------------------------------------------------------------
// getRecentRequestCount
// ---------------------------------------------------------------------------
export async function getRecentRequestCount(
  ip: string,
  windowSeconds = 60,
): Promise<number> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const res = await supabase
    .from("ip_activity_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", since);
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}
