import "server-only";
import { createAdminClient } from "../admin";

// `country` aísla los KPIs por país ('es' | 'cl'). Sin argumento se mantiene
// el comportamiento histórico (todo el CRM junto) que usan el árbol raíz y
// España. El dashboard de Chile pasa 'cl' para no mezclar el catálogo español.
/**
 * Qué parte del dashboard puede ver quien lo abre. Sin opciones se mantiene el
 * comportamiento histórico (todo), que es el de los llamadores que no tienen
 * contexto de usuario.
 *
 * Antes el dashboard lo veía cualquier staff (también la captadora y el
 * agent_junior) con nombre y email de los clientes de las últimas visitas de
 * TODOS los asesores. Ahora cada bloque se pide solo si el usuario tiene permiso
 * y se acota a su alcance.
 */
export type DashboardOptions = {
  /** Propiedades activas, SmartLinks y últimas propiedades. Por defecto true. */
  properties?: boolean;
  /** Total de clientes: todos, solo los asignados a `advisorId`, o ninguno. */
  clients?: "all" | "own" | "none";
  /** Visitas: todas, ninguna o solo las de estos clientes. */
  visits?: "all" | "none" | { clientIds: string[] };
  /** Asesor al que se refiere `clients: "own"`. */
  advisorId?: string;
};

export async function getDashboardData(country?: string, opts: DashboardOptions = {}) {
  const db = createAdminClient() as any;
  const showProps = opts.properties !== false;
  const clientsMode = opts.clients ?? "all";
  const visitsMode = opts.visits ?? "all";
  const noRows = Promise.resolve({ count: 0, data: [] as unknown[] });
  const visitClientIds =
    typeof visitsMode === "object" ? visitsMode.clientIds : null;
  // Sin clientes en alcance no hay nada que consultar (y `.in(..., [])` no es válido).
  const noVisits = visitsMode === "none" || (visitClientIds !== null && visitClientIds.length === 0);
  const noClients = clientsMode === "none" || (clientsMode === "own" && !opts.advisorId);

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
  if (clientsMode === "own" && opts.advisorId) {
    clientsQ = clientsQ.eq("assigned_advisor_id", opts.advisorId);
  }

  let visitsQ = db
    .from("visit_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  if (country) visitsQ = visitsQ.eq("country", country);
  if (visitClientIds !== null && visitClientIds.length > 0) {
    visitsQ = visitsQ.in("client_id", visitClientIds);
  }

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
  if (visitClientIds !== null && visitClientIds.length > 0) {
    recentVisitsQ = recentVisitsQ.in("client_id", visitClientIds);
  }

  const [props, clients, visits, shares, recentProps, recentVisits] =
    await Promise.all([
      showProps ? propsQ : noRows,
      noClients ? noRows : clientsQ,
      noVisits ? noRows : visitsQ,
      showProps ? sharesQ : noRows,
      showProps ? recentPropsQ : noRows,
      noVisits ? noRows : recentVisitsQ,
    ]);

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
