import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getAssignedClientIds, resolveViewScope } from "@/lib/db/queries/view-scope";
import {
  clientLinkFromRow,
  clientLinkState,
  type ClientCatalogFeedback,
  type ClientLinkView,
  type ClientOption,
} from "./feedback-rules";
import { isHomeOwner } from "./owner";
import { sharePath } from "./share";

// ============================================================================
// Asignaciones de catálogos a clientes del CRM (0218). Lecturas para el
// gestor (solo el dueño de la HOME, con la guarda de 0218) y para la ficha
// del cliente (con los permisos de siempre: `clientes` · ver, con alcance;
// lo comprueba la página antes de llamar). Nunca escribe en `profiles`.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

/** Asignaciones de un catálogo (catalog_client_links_list: guarda del dueño). */
export async function listClientLinks(ownerId: string, catalogId: string): Promise<ClientLinkView[]> {
  const { data, error } = await db().rpc("catalog_client_links_list", { p_actor: ownerId, p_catalog: catalogId });
  if (error) throw new Error(error.message);
  const now = Date.now();
  return ((data ?? []) as Record<string, unknown>[]).map((r) => clientLinkFromRow(r, now));
}

/** Clientes del CRM que el usuario actual puede ver (alcance de `clientes`).
 *  Con «solo los suyos», solo sus clientes asignados; sin permiso, ninguno. */
export async function searchClientsInScope(q: string): Promise<ClientOption[]> {
  const scope = await resolveViewScope("clientes", "view");
  if (scope.restriction === "none") return [];
  let ids: string[] | null = null;
  if (scope.restriction !== "all" && scope.userId) {
    ids = await getAssignedClientIds(scope.userId);
    if (ids.length === 0) return [];
  }
  const like = `%${q}%`;
  let query = db()
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "client")
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .order("full_name", { ascending: true })
    .limit(12);
  if (ids) query = query.in("id", ids);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((r) => ({
    id: r.id,
    name: (r.full_name ?? "").trim() || r.email || "Cliente sin nombre",
    detail: r.email ?? null,
  }));
}

/** Ficha del cliente (DC16): sus opiniones de catálogos y sus enlaces
 *  personales. El enlace al gestor solo para el dueño de ese catálogo. */
export async function getClientCatalogFeedback(clientId: string, viewerId: string | null): Promise<ClientCatalogFeedback> {
  const [{ data: fbRows, error: fbErr }, { data: linkRows, error: linkErr }] = await Promise.all([
    db()
      .from("catalog_feedback")
      .select("id, catalog_id, property_id, catalog_title, property_title, rating, comment, created_at, updated_at")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .limit(200),
    db()
      .from("catalog_client_links")
      .select("id, catalog_id, token, expires_at, revoked_at, created_at, catalogs(title, owner_id)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (fbErr) throw new Error(`catalog_feedback: ${fbErr.message}`);
  if (linkErr) throw new Error(`catalog_client_links: ${linkErr.message}`);

  // ¿Sigue la vivienda en el catálogo? (lista efectiva, la misma del lector).
  const catalogIds = [...new Set(((fbRows ?? []) as any[]).map((r) => r.catalog_id).filter(Boolean))] as string[];
  const effective = new Map<string, Set<string>>();
  await Promise.all(
    catalogIds.map(async (id) => {
      const { data } = await db().rpc("catalog_effective_ids", { p_catalog: id });
      effective.set(id, new Set(((data ?? []) as string[]).map(String)));
    }),
  );

  const owner = viewerId ? await isHomeOwner(viewerId) : false;
  const now = Date.now();
  return {
    feedback: ((fbRows ?? []) as any[]).map((r) => ({
      id: String(r.id),
      catalogTitle: String(r.catalog_title),
      propertyTitle: String(r.property_title),
      rating: Number(r.rating),
      comment: r.comment ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      inCatalog: !!(r.catalog_id && r.property_id && effective.get(r.catalog_id)?.has(String(r.property_id))),
    })),
    links: ((linkRows ?? []) as any[]).map((r) => {
      const c = Array.isArray(r.catalogs) ? r.catalogs[0] : r.catalogs;
      const view = { revokedAt: r.revoked_at ? String(r.revoked_at) : null, expiresAt: String(r.expires_at) };
      return {
        id: String(r.id),
        catalogTitle: String(c?.title ?? "Catálogo"),
        url: sharePath(String(r.token)),
        expiresAt: view.expiresAt,
        revokedAt: view.revokedAt,
        state: clientLinkState(view, now),
        managerHref: owner && c?.owner_id === viewerId ? `/es/admin/mi-espacio/catalogos/${r.catalog_id}?seccion=compartir` : null,
      };
    }),
  };
}
