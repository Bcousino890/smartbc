import "server-only";
import { createAdminClient } from "@/lib/db/admin";

// Tipos de evento de auditoría de permisos/roles/país. Texto libre en la BD,
// pero se restringe aquí para uso coherente desde el código.
export type PermissionAuditEventType =
  | "role_changed"
  | "country_changed"
  | "permissions_updated"
  | "user_created";

export interface LogPermissionEventInput {
  /** Quién hace el cambio. Puede ser null si no hay actor identificable. */
  actorId?: string | null;
  /** Sobre qué usuario se aplica el cambio. */
  targetUserId: string;
  eventType: PermissionAuditEventType;
  resource?: string | null;
  action?: string | null;
  country?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Inserta un evento en `permission_audit_log` de forma DEFENSIVA: si la tabla
 * aún no existe en el VPS (migración 0089 sin aplicar) o el insert falla por
 * cualquier motivo, se traga el error para NO romper la operación principal
 * (guardar overrides, editar rol/país, crear usuario…). El registro de
 * auditoría es best-effort: nunca debe bloquear un cambio válido.
 */
export async function logPermissionEvent(
  input: LogPermissionEventInput,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { error } = await db.from("permission_audit_log").insert({
      actor_id: input.actorId ?? null,
      target_user_id: input.targetUserId,
      event_type: input.eventType,
      resource: input.resource ?? null,
      action: input.action ?? null,
      country: input.country ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
    });
    // supabase-js no lanza: devuelve el error en el resultado. Si la tabla no
    // existe (migración sin aplicar), lo registramos sin propagar.
    if (error) {
      console.warn("[audit] logPermissionEvent no pudo insertar (ignorado):", error.message);
    }
  } catch (err) {
    // Best-effort: registramos en logs del servidor pero no propagamos.
    console.warn("[audit] logPermissionEvent falló (ignorado):", err);
  }
}
