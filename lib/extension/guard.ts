import "server-only";

// ============================================================================
// Lo que cada ruta /api/extension/** necesita para decidir:
//   · `requireExtension`: quién llama (o la respuesta de error ya hecha);
//   · `canUseClient`: si ese usuario puede tocar la ficha de ese cliente,
//     con LAS MISMAS reglas que el CRM — permiso `viewing_collections` y su
//     cartera (un agente junior solo ve a sus clientes) en sus países.
//
// El token compartido antiguo no identifica a nadie, así que con él se
// mantiene el comportamiento de antes (acceso de equipo completo) hasta que
// un admin lo apague.
// ============================================================================

import { getEffectivePermissions } from "@/lib/db/queries/permissions";
import { getViewRestriction, type PermissionAction } from "@/lib/permissions";
import { authenticateExtension, type ExtensionAuth, type ExtensionUser } from "./sessions";

type Ok = Extract<ExtensionAuth, { ok: true }>;

export async function requireExtension(
  request: Request,
  headers: Record<string, string>,
): Promise<{ ok: true; auth: Ok } | { ok: false; response: Response }> {
  const auth = await authenticateExtension(request);
  if (!auth.ok) {
    return {
      ok: false,
      response: Response.json(
        { error: auth.error, code: auth.code, reconnect: auth.status === 401 },
        { status: auth.status, headers },
      ),
    };
  }
  return { ok: true, auth };
}

/** ¿Tiene ese permiso sobre la cartera de visitas (anuncios, selecciones…)? */
export async function hasCollectionsPermission(
  user: ExtensionUser,
  action: PermissionAction,
): Promise<boolean> {
  for (const country of user.countries) {
    const perms = await getEffectivePermissions(user.id, user.role, country);
    if (perms.viewing_collections?.[action]) return true;
  }
  return false;
}

/** Lo que el CRM le deja ver a este usuario: todo, solo lo suyo o nada. */
export function clientRestriction(user: ExtensionUser) {
  return getViewRestriction(user.role, "viewing_collections");
}

export type ClientRef = { id: string; country: string | null; assigned_advisor_id: string | null };

export function canUseClient(user: ExtensionUser, client: ClientRef): boolean {
  const restriction = clientRestriction(user);
  if (restriction === "none") return false;
  if (!user.countries.includes(client.country ?? "es")) return false;
  if (restriction === "all") return true;
  // own_only / team (hoy "team" ≈ "own", ver lib/db/queries/view-scope.ts)
  return client.assigned_advisor_id === user.id;
}
