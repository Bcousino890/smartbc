import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";

// Nº máximo de entradas de historial devueltas (más recientes primero).
const MAX_ENTRIES = 50;

export interface AuditEntry {
  id: string;
  eventType: string;
  resource: string | null;
  action: string | null;
  country: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
  actor: { id: string | null; name: string | null; email: string | null };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  const currentProfile = await getCurrentProfile();
  if (!currentProfile) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  // Autorización: solo owner/admin/agent_admin pueden ver el historial de
  // permisos de un usuario (mismo criterio que el POST de permisos).
  const callerRole = currentProfile.role as string;
  if (!["owner", "admin", "agent_admin"].includes(callerRole)) {
    return Response.json({ error: "Sin acceso" }, { status: 403 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    // Join al actor (profiles) para mostrar nombre/email de quién hizo el cambio.
    const { data, error } = await db
      .from("permission_audit_log")
      .select(
        "id, event_type, resource, action, country, old_value, new_value, created_at, actor:actor_id(id, full_name, email)",
      )
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_ENTRIES);

    // Defensivo: si la tabla aún no existe en el VPS (migración 0089 sin
    // aplicar) devolvemos una lista vacía en lugar de un error.
    if (error) {
      return Response.json({ entries: [] });
    }

    const rows = (data ?? []) as Array<{
      id: string;
      event_type: string;
      resource: string | null;
      action: string | null;
      country: string | null;
      old_value: unknown;
      new_value: unknown;
      created_at: string;
      actor:
        | { id: string; full_name: string | null; email: string | null }
        | null;
    }>;

    const entries: AuditEntry[] = rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      resource: r.resource,
      action: r.action,
      country: r.country,
      oldValue: r.old_value,
      newValue: r.new_value,
      createdAt: r.created_at,
      actor: {
        id: r.actor?.id ?? null,
        name: r.actor?.full_name ?? null,
        email: r.actor?.email ?? null,
      },
    }));

    return Response.json({ entries });
  } catch {
    return Response.json({ entries: [] });
  }
}
