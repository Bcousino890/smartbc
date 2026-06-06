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

  // Try full query with joins first
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

  if (!error) return (data ?? []) as unknown as ClientWithRelations[];

  // Fallback: simple query without potentially-missing joins
  console.error("getClients full query failed, using fallback:", error.message);
  const { data: fallback, error: fallbackErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "client")
    .order("created_at", { ascending: false });

  if (fallbackErr) {
    console.error("getClients fallback error:", fallbackErr.message);
    return [];
  }
  return (fallback ?? []) as unknown as ClientWithRelations[];
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
  // Use admin client to bypass RLS policies on profiles table
  const supabase = createAdminClient();

  // Try with all roles (requires migration 0025 enum values to exist)
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin"])
    .order("created_at");

  if (!error) {
    return (data ?? []) as unknown as Array<Database["public"]["Tables"]["profiles"]["Row"]>;
  }

  // If the enum values from migration 0025 don't exist yet, fall back to legacy roles
  if (error.message?.includes("invalid input value for enum")) {
    const { data: fallback, error: fallbackError } = await supabase
      .from("profiles")
      .select("*")
      .in("role", ["owner", "admin", "advisor"])
      .order("created_at");

    if (fallbackError) {
      console.error("getStaff fallback error:", fallbackError);
      return [];
    }
    return (fallback ?? []) as unknown as Array<Database["public"]["Tables"]["profiles"]["Row"]>;
  }

  console.error("getStaff error:", error);
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
      favorites(property_id),
      visit_requests(id, property_id, requested_at, status)
    `)
    .eq("id", id)
    .eq("role", "client")
    .maybeSingle();

  if (error) throw error;
  return data;
}
