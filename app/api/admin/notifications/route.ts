import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getEffectivePermissions } from "@/lib/db/queries/permissions";
import {
  getAssignedClientIds,
  resolveViewScope,
} from "@/lib/db/queries/view-scope";

export type NotificationItem = {
  id: string;
  type: "visit" | "message";
  title: string;
  subtitle: string;
  created_at: string;
  href: string;
};

/**
 * Campanita del panel.
 *
 * Antes cualquier usuario con sesión (incluido un cliente) recibía las visitas
 * pendientes de TODOS los clientes y los mensajes directos no leídos de CUALQUIER
 * conversación del equipo (se leía con service role sin filtrar). Ahora:
 *
 *   - Solo staff (un `client` no tiene campanita de panel).
 *   - Mensajes: únicamente de las conversaciones en las que el usuario participa.
 *   - Visitas: solo si tiene permiso de ver solicitudes/calendario y, cuando su
 *     alcance es "solo lo suyo", únicamente las de sus clientes asignados.
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json([], { status: 401 });
  if (profile.role === "client") {
    return Response.json([], { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const effective = await getEffectivePermissions(profile.id, profile.role);
  const canSeeVisits =
    (effective.solicitudes?.view ?? false) || (effective.calendario?.view ?? false);

  // Visitas pendientes: con permiso y dentro de su alcance.
  let clientIds: string[] | null = null; // null = sin restricción
  if (canSeeVisits) {
    const scope = await resolveViewScope("solicitudes");
    if (scope.restriction === "none") {
      clientIds = [];
    } else if (scope.restriction !== "all") {
      clientIds = await getAssignedClientIds(profile.id);
    }
  }

  // Conversaciones de equipo en las que participa el usuario.
  const { data: convs } = (await db
    .from("team_direct_conversations")
    .select("id")
    .or(`participant_a.eq.${profile.id},participant_b.eq.${profile.id}`)) as {
    data: Array<{ id: string }> | null;
  };
  const convIds = (convs ?? []).map((c) => c.id);

  const visitsQuery =
    !canSeeVisits || (clientIds !== null && clientIds.length === 0)
      ? Promise.resolve({ data: [] })
      : (() => {
          let q = db
            .from("visit_requests")
            .select(
              "id, created_at, status, profiles!visit_requests_client_id_fkey(full_name), properties(title, bc_reference)"
            )
            .eq("status", "pending")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(10);
          if (clientIds !== null) q = q.in("client_id", clientIds);
          return q;
        })();

  const messagesQuery =
    convIds.length === 0
      ? Promise.resolve({ data: [] })
      : db
          .from("team_direct_messages")
          .select(
            "id, content, created_at, sender_id, profiles!team_direct_messages_sender_id_fkey(full_name)"
          )
          .in("conversation_id", convIds)
          .neq("sender_id", profile.id)
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(5);

  const [visits, messages] = await Promise.all([visitsQuery, messagesQuery]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifications: NotificationItem[] = [
    ...(visits.data ?? []).map((v: any) => ({
      id: `visit-${v.id}`,
      type: "visit" as const,
      title: `Visita: ${v.properties?.title ?? "Propiedad"}`,
      subtitle: `${v.profiles?.full_name ?? "Cliente"} solicitó una visita`,
      created_at: v.created_at,
      href: "/admin/calendario",
    })),
    ...(messages.data ?? []).map((m: any) => ({
      id: `msg-${m.id}`,
      type: "message" as const,
      title: `Mensaje de ${m.profiles?.full_name ?? "Usuario"}`,
      subtitle:
        m.content.slice(0, 60) + (m.content.length > 60 ? "..." : ""),
      created_at: m.created_at,
      href: "/admin/mensajes?tab=equipo",
    })),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return Response.json(notifications);
}
