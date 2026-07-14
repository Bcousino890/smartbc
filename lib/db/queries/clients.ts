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
import { resolveViewScope, getAssignedClientIds } from "./view-scope";

export type {
  ClientPreferencesRow,
  ClientTagRow,
  ClientWithRelations,
  VisitRequestWithRelations,
};

// `country` aísla el listado por país ('es' | 'cl') vía `profiles.country`.
// Sin argumento se mantiene el comportamiento histórico (todos los clientes),
// que usan el árbol raíz y España. El árbol de Chile pasa 'cl'.
export async function getClients(country?: string): Promise<ClientWithRelations[]> {
  const supabase = await createClient();

  // Scope de datos (own/team/all) para el recurso "clientes". Un cliente es
  // "propio" si su `assigned_advisor_id` es el usuario actual. team ≈ own
  // (sin modelo formal de equipos, ver ViewRestriction).
  const { restriction, userId } = await resolveViewScope("clientes");
  if (restriction === "none") return []; // p.ej. captadora: no ve clientes
  // own_only / team / assigned_only → filtra por asesor asignado. Si por lo
  // que sea no hay userId, NO filtramos (preferimos mostrar de más a ocultar).
  const advisorFilter =
    restriction !== "all" && userId ? userId : null;

  // Try full query with joins first (session client, respects RLS)
  let fullQ = supabase
    .from("profiles")
    .select(`
      *,
      client_preferences(*),
      client_tag_assignments!client_tag_assignments_client_id_fkey(tag_id, client_tags(id, name, category, color)),
      favorites(count),
      visit_requests(count)
    `)
    .eq("role", "client");
  if (country) fullQ = fullQ.eq("country", country);
  if (advisorFilter) fullQ = fullQ.eq("assigned_advisor_id", advisorFilter);
  const { data, error } = await fullQ.order("created_at", { ascending: false });

  if (!error && data && data.length > 0) {
    return data as unknown as ClientWithRelations[];
  }

  // Fallback 1: simple query without potentially-missing joins (session client)
  if (error) {
    console.error("getClients full query failed, using fallback:", error.message);
  }
  let fallbackQ = supabase
    .from("profiles")
    .select("*")
    .eq("role", "client");
  if (country) fallbackQ = fallbackQ.eq("country", country);
  if (advisorFilter) fallbackQ = fallbackQ.eq("assigned_advisor_id", advisorFilter);
  const { data: fallback, error: fallbackErr } = await fallbackQ
    .order("created_at", { ascending: false });

  if (!fallbackErr && fallback && fallback.length > 0) {
    return fallback as unknown as ClientWithRelations[];
  }

  // Fallback 2: admin client (service role) — bypasses RLS when the
  // logged-in user's role isn't recognised by is_staff() yet.
  try {
    const admin = createAdminClient();
    let adminQ = admin
      .from("profiles")
      .select("*")
      .eq("role", "client");
    if (country) adminQ = adminQ.eq("country", country);
    // IMPORTANTE: el fallback admin salta las RLS, así que hay que reaplicar el
    // scope aquí o un rol restringido vería toda la base vía service role.
    if (advisorFilter) adminQ = adminQ.eq("assigned_advisor_id", advisorFilter);
    const { data: adminData, error: adminErr } = await adminQ
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

// `country` filtra por `visit_requests.country` ('es' | 'cl'); sin argumento
// se mantiene el comportamiento histórico (raíz y España). Chile pasa 'cl'.
export async function getVisitRequests(country?: string): Promise<VisitRequestWithRelations[]> {
  const supabase = await createClient();

  // Scope de datos para "solicitudes". `visit_requests` no tiene columna de
  // propietario propia: el dueño efectivo es el asesor asignado al cliente de
  // la visita, así que restringimos por `client_id` ∈ (clientes del asesor).
  const { restriction, userId } = await resolveViewScope("solicitudes");
  if (restriction === "none") return [];
  let clientIds: string[] | null = null;
  if (restriction !== "all" && userId) {
    clientIds = await getAssignedClientIds(userId, country);
    if (clientIds.length === 0) return []; // sin cartera → sin solicitudes
  }

  let query = supabase
    .from("visit_requests")
    .select(`
      *,
      profiles!visit_requests_client_id_fkey(id, full_name, email),
      properties(id, slug, title, external_id)
    `);
  if (country) query = query.eq("country", country);
  if (clientIds) query = query.in("client_id", clientIds);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as unknown as VisitRequestWithRelations[];
}

export async function getVisitRequestsStats(country?: string) {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const base = () => {
    let q = supabase.from("visit_requests").select("*", { count: "exact", head: true });
    if (country) q = q.eq("country", country);
    return q;
  };
  const [total, pending, confirmed, thisWeek] = await Promise.all([
    base(),
    base().eq("status", "pending"),
    base().eq("status", "confirmed"),
    base().gte("created_at", sevenDaysAgo),
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

  // Usamos directamente el admin client (service role). La página de
  // usuarios ya está protegida por el layout (solo staff llega aquí).
  // Con el cliente de sesión, una RLS que no reconozca el rol del usuario
  // logueado NO da error: simplemente filtra filas y devuelve solo el
  // propio perfil → "no se ven los usuarios ya creados".
  const adminClient = createAdminClient();
  const { data: adminData, error: adminError } = await adminClient
    .from("profiles")
    .select("*")
    .in("role", allRoles)
    .order("created_at");

  if (!adminError) {
    return (adminData ?? []) as unknown as Array<Database["public"]["Tables"]["profiles"]["Row"]>;
  }

  // Enum sin los roles agent_* (migración 0025 pendiente): reintenta solo
  // con los roles legacy.
  if (adminError.message?.includes("invalid input value for enum")) {
    const { data: fallback } = await adminClient
      .from("profiles")
      .select("*")
      .in("role", legacyRoles)
      .order("created_at");
    return (fallback ?? []) as unknown as Array<Database["public"]["Tables"]["profiles"]["Row"]>;
  }

  console.error("getStaff admin query failed:", adminError.message);

  // Último recurso: cliente de sesión (por si falta SUPABASE_SERVICE_ROLE_KEY).
  try {
    const sessionClient = await createClient();
    const { data } = await sessionClient
      .from("profiles")
      .select("*")
      .in("role", legacyRoles)
      .order("created_at");
    return (data ?? []) as unknown as Array<Database["public"]["Tables"]["profiles"]["Row"]>;
  } catch (e) {
    console.error("getStaff all attempts failed:", e);
    return [];
  }
}

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function getAllProfiles(): Promise<ProfileRow[]> {
  // PostgREST limita las filas por request (tope típico: 1000), así que una
  // sola query truncaría silenciosamente con muchos usuarios. Paginamos con
  // .range() hasta agotar.
  const PAGE_SIZE = 1000;

  const fetchAll = async (
    client:
      | ReturnType<typeof createAdminClient>
      | Awaited<ReturnType<typeof createClient>>,
  ): Promise<ProfileRow[]> => {
    const rows: ProfileRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const batch = (data ?? []) as unknown as ProfileRow[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    return rows;
  };

  // Admin client (service role) y SIN filtro de rol: cualquier perfil con un
  // rol fuera de las listas cerradas de getStaff/getClients (viewer, roles
  // nuevos del enum, valores inesperados…) también debe aparecer. Igual que
  // en getStaff, el admin client evita que una RLS que no reconozca el rol
  // del usuario logueado oculte filas sin dar error.
  try {
    const admin = createAdminClient();
    return await fetchAll(admin);
  } catch (e) {
    console.error(
      "getAllProfiles admin query failed:",
      e instanceof Error ? e.message : e,
    );
  }

  // Último recurso: cliente de sesión (por si falta SUPABASE_SERVICE_ROLE_KEY).
  try {
    const sessionClient = await createClient();
    return await fetchAll(sessionClient);
  } catch (e) {
    console.error("getAllProfiles all attempts failed:", e);
    return [];
  }
}

// `country` aísla los KPIs por país; sin argumento, comportamiento histórico
// (raíz y España). client_tag_assignments no tiene columna country: se filtra
// vía join con el profile del cliente (igual que property_shares en dashboard).
export async function getClientStats(country?: string) {
  const supabase = await createClient();

  let totalQ = supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "client");
  if (country) totalQ = totalQ.eq("country", country);

  const withTagsQ = country
    ? supabase
        .from("client_tag_assignments")
        .select(
          "client_id, profiles!client_tag_assignments_client_id_fkey!inner(country)",
          { count: "exact", head: true },
        )
        .eq("profiles.country", country)
    : supabase
        .from("client_tag_assignments")
        .select("client_id", { count: "exact", head: true });

  let visitsQ = supabase
    .from("visit_requests")
    .select("*", { count: "exact", head: true });
  if (country) visitsQ = visitsQ.eq("country", country);

  const [total, withTags, visits] = await Promise.all([totalQ, withTagsQ, visitsQ]);

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

export type ContactRequestRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  country_interest: string | null;
  subject: string | null;
  message: string;
  status: string;
  created_at: string;
};

// NOTA país: `contact_requests` NO tiene columna `country` (solo
// `country_interest`, un texto libre del formulario público que expresa
// interés — "España", "Chile", "Ambos"… — no la procedencia del dato), así
// que el listado se mantiene GLOBAL en los tres árboles admin. Si algún día
// se quiere aislar, habría que añadir la columna `country` en una migración
// y fijarla en /api/portal/contact según el sitio de origen.
export async function getContactRequests(): Promise<ContactRequestRow[]> {
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("contact_requests")
    .select("id, name, email, phone, country_interest, subject, message, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("getContactRequests error:", error);
    return [];
  }
  return (data ?? []) as ContactRequestRow[];
}

export async function markContactRequestRead(id: string): Promise<void> {
  const admin = createAdminClient() as any;
  await admin.from("contact_requests").update({ status: "read", updated_at: new Date().toISOString() }).eq("id", id);
}
