import "server-only";
import { createAdminClient } from "../admin";
import { createClient } from "../server";

// Selectores del calendario (propiedades, clientes y staff para los
// desplegables de "nueva visita"). `country` aísla por país ('es' | 'cl'):
// propiedades por `properties.country` y clientes por `profiles.country`.
// Sin argumento se mantiene el comportamiento histórico (raíz y España);
// el árbol de Chile pasa 'cl'.
// El staff se deja GLOBAL a propósito: los admin/owner pueden operar en los
// dos países y muchos perfiles de staff aún tienen el default 'es'.
export async function getCalendarSelectors(country?: string) {
  const adminClient = createAdminClient();
  const supabase = await createClient();

  let propertiesQ = adminClient
    .from("properties")
    .select("id, title, address, zone, status, bc_reference")
    .neq("status", "archived");
  if (country) propertiesQ = propertiesQ.eq("country", country);

  let clientsQ = supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "client");
  if (country) clientsQ = clientsQ.eq("country", country);

  const [propertiesRes, clientsRes, staffRes] = await Promise.all([
    propertiesQ.order("bc_reference", { ascending: true }).limit(1000),
    clientsQ.order("full_name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin"])
      .order("full_name", { ascending: true }),
  ]);

  return {
    properties: propertiesRes.data ?? [],
    clients: clientsRes.data ?? [],
    staff: staffRes.data ?? [],
  };
}
