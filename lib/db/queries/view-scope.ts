import "server-only";
import { createAdminClient } from "../admin";
import { getCurrentProfile } from "./session";
import {
  getViewRestriction,
  type PermissionResource,
  type ViewRestriction,
} from "@/lib/permissions";
import {
  isScopedResource,
  resolveRestriction,
  type ScopedResource,
  type ScopeKind,
} from "@/lib/permissions-scope";
import { getScopeOverrides } from "./permissions";

/**
 * Scope de datos resuelto para el usuario actual sobre un recurso concreto.
 * Es el puente entre la política de negocio (`getViewRestriction` en
 * `lib/permissions.ts`) y las queries del panel.
 */
export type ViewScope = {
  restriction: ViewRestriction;
  /** Id del usuario actual (o null si no hay sesión/perfil). */
  userId: string | null;
  /** Rol del usuario actual (o null). */
  role: string | null;
};

/**
 * Resuelve la restricción de visibilidad del usuario actual para `resource`.
 *
 * Si no hay perfil/rol resoluble (no debería ocurrir en /admin, ya protegido
 * por el layout) se devuelve "all" para NO ocultar datos por error, en línea
 * con el criterio conservador de `getViewRestriction`.
 */
export async function resolveViewScope(
  resource: PermissionResource,
  kind: ScopeKind = "view",
  country?: string,
): Promise<ViewScope> {
  let profile = null;
  try {
    profile = await getCurrentProfile();
  } catch {
    // Sin perfil resoluble → tratamos como acceso total (no ocultar por error).
    profile = null;
  }
  const role = profile?.role ?? null;
  let restriction: ViewRestriction = "all";
  if (role && profile) {
    restriction = isScopedResource(resource)
      ? resolveRestriction(
          role,
          resource,
          kind,
          await getScopeOverrides(profile.id),
          country,
        )
      : getViewRestriction(role, resource);
  }
  return { restriction, userId: profile?.id ?? null, role };
}

/**
 * IDs de clientes (perfiles con role=client) cuyo asesor asignado es
 * `advisorId`. Es el "puente" para aplicar own/team a recursos que NO tienen
 * columna propia de propietario (p.ej. `visit_requests`,
 * `property_applications`) pero sí un `client_id`: el dueño efectivo del
 * registro es el asesor del cliente (`profiles.assigned_advisor_id`).
 *
 * team ≈ own: sin un modelo formal de equipos en el esquema, "team" resuelve
 * al mismo conjunto que "own_only" (los clientes asignados directamente al
 * usuario). Documentado como simplificación temporal.
 *
 * Usa el cliente admin (service role) para leer de forma fiable la asignación
 * con independencia de las RLS (solo devuelve IDs filtrados por asesor).
 */
export async function getAssignedClientIds(
  advisorId: string,
  country?: string,
): Promise<string[]> {
  try {
    const admin = createAdminClient();
    let q = admin
      .from("profiles")
      .select("id")
      .eq("role", "client")
      .eq("assigned_advisor_id", advisorId);
    if (country) q = q.eq("country", country);
    const { data, error } = await q;
    if (error || !data) return [];
    return (data as unknown as { id: string }[]).map((r) => r.id);
  } catch {
    return [];
  }
}

/** País (profiles.country) del cliente; undefined si falla o es null. */
async function getClientCountry(clientId: string): Promise<string | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createAdminClient() as any)
      .from("profiles")
      .select("country")
      .eq("id", clientId)
      .maybeSingle();
    if (error || !data) return undefined;
    return (data as { country: string | null }).country ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * ¿Puede el usuario actual ver/editar a este cliente en `resource`? Misma
 * lógica que `canAccessClient` de viewing-collections, pero con el alcance
 * (`kind`) y el país pedidos: el dueño efectivo es el asesor asignado.
 */
export async function canActOnClient(
  clientId: string,
  resource: ScopedResource,
  kind: ScopeKind,
  country?: string,
): Promise<boolean> {
  // Sin país explícito (acciones/rutas) se deriva del propio cliente en BD,
  // nunca de la petición, para que cuenten las excepciones por país.
  const effectiveCountry = country ?? (await getClientCountry(clientId));
  const { restriction, userId } = await resolveViewScope(resource, kind, effectiveCountry);
  if (restriction === "none") return false;
  if (restriction === "all" || !userId) return true;
  const ids = await getAssignedClientIds(userId);
  return ids.includes(clientId);
}

/**
 * ¿Puede el usuario actual ver/editar este lead? Con alcance "own" solo si
 * está asignado a él o no está asignado a nadie (los sin asignar son de todos).
 */
export async function canActOnLead(leadId: string, kind: ScopeKind): Promise<boolean> {
  const { restriction, userId } = await resolveViewScope("solicitudes", kind);
  if (restriction === "none") return false;
  if (restriction === "all" || !userId) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createAdminClient() as any)
      .from("lead_inbox_facts")
      .select("assigned_to")
      .eq("id", leadId)
      .maybeSingle();
    if (error || !data) return false;
    const assignedTo = (data as { assigned_to: string | null }).assigned_to;
    return assignedTo == null || assignedTo === userId;
  } catch {
    return false;
  }
}
