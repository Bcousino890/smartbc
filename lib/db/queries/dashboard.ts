import "server-only";
import { createAdminClient } from "../admin";

// `country` aísla los KPIs por país ('es' | 'cl'). Sin argumento se mantiene
// el comportamiento histórico (todo el CRM junto) que usan el árbol raíz y
// España. El dashboard de Chile pasa 'cl' para no mezclar el catálogo español.
export async function getDashboardData(country?: string) {
  const db = createAdminClient() as any;

  let propsQ = db
    .from("properties")
    .select("*", { count: "exact", head: true })
    .is("archived_at", null)
    .eq("status", "available");
  if (country) propsQ = propsQ.eq("country", country);

  let clientsQ = db
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "client");
  if (country) clientsQ = clientsQ.eq("country", country);

  let visitsQ = db
    .from("visit_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  if (country) visitsQ = visitsQ.eq("country", country);

  // property_shares no tiene columna country: se filtra vía la propiedad.
  let sharesQ = country
    ? db
        .from("property_shares")
        .select("id, properties!inner(country)", { count: "exact", head: true })
        .eq("properties.country", country)
    : db.from("property_shares").select("*", { count: "exact", head: true });

  let recentPropsQ = db
    .from("properties")
    .select(
      "id,slug,title,zone,commune,price,currency,operation,status,bc_reference,cover_photo_url"
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(5);
  if (country) recentPropsQ = recentPropsQ.eq("country", country);

  let recentVisitsQ = db
    .from("visit_requests")
    .select(
      "id,created_at,status,profiles!visit_requests_client_id_fkey(full_name,email),properties(title,bc_reference)"
    )
    .order("created_at", { ascending: false })
    .limit(5);
  if (country) recentVisitsQ = recentVisitsQ.eq("country", country);

  const [props, clients, visits, shares, recentProps, recentVisits] =
    await Promise.all([propsQ, clientsQ, visitsQ, sharesQ, recentPropsQ, recentVisitsQ]);

  return {
    kpis: {
      activeProperties: props.count ?? 0,
      totalClients: clients.count ?? 0,
      pendingVisits: visits.count ?? 0,
      smartLinks: shares.count ?? 0,
    },
    recentProperties: (recentProps.data ?? []) as Array<{
      id: string;
      slug: string;
      title: string;
      zone: string | null;
      commune: string | null;
      price: number | null;
      currency: string | null;
      operation: string | null;
      status: string | null;
      bc_reference: string | null;
      cover_photo_url: string | null;
    }>,
    recentVisits: (recentVisits.data ?? []) as Array<{
      id: string;
      created_at: string;
      status: string;
      profiles: { full_name: string | null; email: string | null } | null;
      properties: { title: string | null; bc_reference: string | null } | null;
    }>,
  };
}
