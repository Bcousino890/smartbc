import "server-only";
import { createClient } from "../server";
import { createAdminClient } from "../admin";
import type { Database } from "../database.types";
import type {
  ClientPreferencesRow,
  ClientTagRow,
  ClientWithRelations,
  VisitRequestWithRelations,
} from "../row-types";

export type {
  ClientPreferencesRow,
  ClientTagRow,
  ClientWithRelations,
  VisitRequestWithRelations,
};

export async function getClients(): Promise<ClientWithRelations[]> {
  const supabase = await createClient();

  // Try full query with joins first (session client, respects RLS)
  const { data, error } = await supabase
    .from("profiles")
    .select(`
      *,
      client_preferences(*),
      client_tag_assignments!client_tag_assignments_client_id_fkey(tag_id, client_tags(id, name, category, color)),
      favorites(count),
      visit_requests(count)
    `)
    .eq("role", "client")
    .order("created_at", { ascending: false });

  if (!error && data && data.length > 0) {
    return data as unknown as ClientWithRelations[];
  }

  // Fallback 1: simple query without potentially-missing joins (session client)
  if (error) {
    console.error("getClients full query failed, using fallback:", error.message);
  }
  const { data: fallback, error: fallbackErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "client")
    .order("created_at", { ascending: false });

  if (!fallbackErr && fallback && fallback.length > 0) {
    return fallback as unknown as ClientWithRelations[];
  }

  // Fallback 2: admin client (service role) — bypasses RLS when the
  // logged-in user's role isn't recognised by is_staff() yet.
  try {
    const admin = createAdminClient();
    const { data: adminData, error: adminErr } = await admin
      .from("profiles")
      .select("*")
      .eq("role", "client")
      .order("created_at", { ascending: false });
    if (!adminErr) {
      return (adminData ?? []) as unknown as ClientWithRelations[];
    }
    console.error("getClients admin fallback error:", adminErr.message);
  } catch (e) {
    console.error("getClients admin fallback threw:", e);
  }

  return [];
}

export async function getVisitRequests(): Promise<VisitRequestWithRelations[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visit_requests")
    .select(`
      *,
      profiles!visit_requests_client_id_fkey(id, full_name, email),
      properties(id, slug, title, external_id)
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as unknown as VisitRequestWithRelations[];
}

export async function getVisitRequestsStats() {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [total, pending, confirmed, thisWeek] = await Promise.all([
    supabase.from("visit_requests").select("*", { count: "exact", head: true }),
    supabase.from("visit_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("visit_requests").select("*", { count: "exact", head: true }).eq("status", "confirmed"),
    supabase.from("visit_requests").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
  ]);

  return {
    total: total.count ?? 0,
    pending: pending.count ?? 0,
    confirmed: confirmed.count ?? 0,
    thisWeek: thisWeek.count ?? 0,
  };
}

export async function getStaff() {
  const allRoles = ["owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin"];
  const legacyRoles = ["owner", "admin", "advisor"];

  // Primary: session-based client — works for authenticated staff via RLS (migration 0032)
  try {
    const sessionClient = await createClient();
    const { data, error } = await sessionClient
      .from("profiles")
      .select("*")
      .in("role", allRoles)
      .order("created_at");

    if (!error) {
      return (data ?? []) as unknown as Array<Database["public"]["Tables"]["profiles"]["Row"]>;
    }

    if (error.message?.includes("invalid input value for enum")) {
      const { data: fallback, error: fallbackErr } = await sessionClient
        .from("profiles")
        .select("*")
        .in("role", legacyRoles)
        .order("created_at");
      if (!fallbackErr) {
        return (fallback ?? []) as unknown as Array<Database["public"]["Tables"]["profiles"]["Row"]>;
      }
    }
    console.error("getStaff session error:", error.message);
  } catch (e) {
    console.error("getStaff session client threw:", e);
  }

  // Fallback: admin client (requires SUPABASE_SERVICE_ROLE_KEY)
  const adminClient = createAdminClient();
  const { data: adminData, error: adminError } = await adminClient
    .from("profiles")
    .select("*")
    .in("role", allRoles)
    .order("created_at");

  if (!adminError) {
    return (adminData ?? []) as unknown as Array<Database["public"]["Tables"]["profiles"]["Row"]>;
  }

  if (adminError.message?.includes("invalid input value for enum")) {
    const { data: fallback } = await adminClient
      .from("profiles")
      .select("*")
      .in("role", legacyRoles)
      .order("created_at");
    return (fallback ?? []) as unknown as Array<Database["public"]["Tables"]["profiles"]["Row"]>;
  }

  console.error("getStaff all attempts failed:", adminError);
  return [];
}

export async function getClientStats() {
  const supabase = await createClient();
  const [total, withTags, visits] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "client"),
    supabase.from("client_tag_assignments").select("client_id", { count: "exact", head: true }),
    supabase.from("visit_requests").select("*", { count: "exact", head: true }),
  ]);

  return {
    totalClients: total.count ?? 0,
    activeToday: 0,
    visitsRequested: visits.count ?? 0,
    customFilters: withTags.count ?? 0,
    priorityFollowUp: 0,
  };
}

export async function getClientById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(`
      *,
      client_preferences(*),
      client_tag_assignments(tag_id, client_tags(id, name, category, color)),
      favorites(property_id, properties(slug, title)),
      visit_requests(id, property_id, requested_at, status, properties(slug, title))
    `)
    .eq("id", id)
    .eq("role", "client")
    .maybeSingle();

  if (error) throw error;
  return data;
}
