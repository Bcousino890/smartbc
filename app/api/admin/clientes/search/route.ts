import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { sanitizeSearchTerm } from "@/lib/db/search-term";
import { getAssignedClientIds, resolveViewScope } from "@/lib/db/queries/view-scope";

/**
 * Autocompletado de clientes (p. ej. en "Nueva solicitud de documentación").
 *
 * Antes: solo exigía sesión + una lista de roles escrita a mano, leía con
 * service role SIN alcance ni permiso (un agent_junior veía email y teléfono de
 * todos los clientes; con `q` vacía, los 20 más recientes), mezclaba en los
 * resultados a las cuentas con rol `owner` (las cuentas de Propietario reales,
 * con su email y teléfono) y concatenaba `q` sin escapar dentro de un `.or()`.
 *
 * Ahora: exige `clientes.view` efectivo, acota a la cartera del usuario cuando su
 * alcance es "solo lo suyo", devuelve únicamente clientes y sanea `q`.
 */
export async function GET(req: Request) {
  try {
    const gate = await requirePermission("clientes", "view");
    if (!gate.ok) return gate.response;

    const scope = await resolveViewScope("clientes");
    if (scope.restriction === "none") return Response.json({ data: [] });

    let scopedIds: string[] | null = null; // null = sin restricción de cartera
    if (scope.restriction !== "all") {
      scopedIds = await getAssignedClientIds(gate.profile.id);
      if (scopedIds.length === 0) return Response.json({ data: [] });
    }

    const url = new URL(req.url);
    const term = sanitizeSearchTerm(url.searchParams.get("q"));

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (admin as any)
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, role")
      .eq("role", "client")
      .order("created_at", { ascending: false })
      .limit(20);

    if (scopedIds) query = query.in("id", scopedIds);
    if (term) {
      query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return Response.json({ data: data ?? [] });
  } catch (err) {
    console.error("[clientes-search] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
