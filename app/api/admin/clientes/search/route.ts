import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { sanitizeSearchTerm } from "@/lib/db/search-term";
import { getAssignedClientIds, resolveViewScope } from "@/lib/db/queries/view-scope";
import { isClientInCountryScope } from "@/lib/permissions-scope";

const RESULT_LIMIT = 20;

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

    // La petición no trae país (el modal busca clientes de los dos países), así
    // que se aplica la regla de `canActOnClient` fila a fila: cada cliente se
    // juzga con la excepción de alcance de SU país (globales si no tiene).
    const [globalScope, esScope, clScope] = await Promise.all([
      resolveViewScope("clientes"),
      resolveViewScope("clientes", "view", "es"),
      resolveViewScope("clientes", "view", "cl"),
    ]);
    const scopes = {
      global: globalScope.restriction,
      byCountry: { es: esScope.restriction, cl: clScope.restriction },
    };
    const restrictions = [globalScope.restriction, esScope.restriction, clScope.restriction];
    if (restrictions.every((r) => r === "none")) return Response.json({ data: [] });
    const unrestricted = restrictions.every((r) => r === "all");
    const anyAll = restrictions.some((r) => r === "all");

    let ownIds = new Set<string>();
    let scopedIds: string[] | null = null; // null = sin restricción de cartera en la query
    if (!unrestricted) {
      ownIds = new Set(await getAssignedClientIds(gate.profile.id));
      // Si ningún país da «Todo», solo puede salir su cartera: se filtra ya en BD.
      if (!anyAll) {
        scopedIds = [...ownIds];
        if (scopedIds.length === 0) return Response.json({ data: [] });
      }
    }

    const url = new URL(req.url);
    const term = sanitizeSearchTerm(url.searchParams.get("q"));

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (admin as any)
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, role, country")
      .eq("role", "client")
      .order("created_at", { ascending: false })
      // Con alcance mixto por país se filtra después en código: se pide margen.
      .limit(unrestricted ? RESULT_LIMIT : RESULT_LIMIT * 3);

    if (scopedIds) query = query.in("id", scopedIds);
    if (term) {
      query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const data = ((rows ?? []) as Array<{ id: string; country?: string | null } & Record<string, unknown>>)
      .filter((c) => unrestricted || isClientInCountryScope(scopes, ownIds, c))
      .slice(0, RESULT_LIMIT)
      // Misma forma de respuesta que antes (sin `country`).
      .map(({ country: _country, ...rest }) => rest);

    return Response.json({ data });
  } catch (err) {
    console.error("[clientes-search] Error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
