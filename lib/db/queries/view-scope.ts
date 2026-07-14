import "server-only";
import { createAdminClient } from "../admin";
import { getCurrentProfile } from "./session";
import {
  getViewRestriction,
  type PermissionResource,
  type ViewRestriction,
} from "@/lib/permissions";

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
): Promise<ViewScope> {
  let profile = null;
  try {
    profile = await getCurrentProfile();
  } catch {
    // Sin perfil resoluble → tratamos como acceso total (no ocultar por error).
    profile = null;
  }
  const role = profile?.role ?? null;
  const restriction: ViewRestriction = role
    ? getViewRestriction(role, resource)
    : "all";
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
