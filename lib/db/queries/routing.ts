import "server-only";

// ============================================================================
// REPARTO · lectura (sincronización con Zinto, alcance e historial de las
// reasignaciones). El asesor de cada piso se lee en la bandeja (sales-inbox).
// ============================================================================

import { createAdminClient } from "../admin";
import type { ZintoSyncInfo, ZintoSyncState } from "@/lib/sales-inbox/routing";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

/** Último estado de la sincronización con Zinto de un cliente o una solicitud. */
export async function getZintoSync(kind: "client" | "lead", subjectId: string): Promise<ZintoSyncInfo | null> {
  const { data } = await db()
    .from("zinto_owner_sync")
    .select("id, status, blocked_reason, last_error, assignment_version, updated_at")
    .eq("subject_kind", kind)
    .eq("subject_id", subjectId)
    .order("assignment_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const state: ZintoSyncState =
    data.status === "superseded" ? "pending" : (data.status as ZintoSyncState);
  return {
    id: data.id,
    state,
    blockedReason: data.blocked_reason ?? null,
    lastError: data.last_error ?? null,
    version: Number(data.assignment_version),
    updatedAt: data.updated_at,
  };
}

/** Lo que mueve una reasignación de cliente, para enseñarlo ANTES de confirmar. */
export type ClientReassignScope = {
  clientId: string;
  clientName: string;
  currentAdvisorId: string | null;
  version: number;
  openLeads: Array<{ id: string; title: string | null; assignedTo: string | null; nextActionAt: string | null }>;
  pendingTasks: number;
  hasConversation: boolean;
};

export async function getClientReassignScope(clientId: string): Promise<ClientReassignScope | null> {
  const { data: client } = await db()
    .from("profiles")
    .select("id, full_name, email, phone, role, assigned_advisor_id, advisor_assignment_version")
    .eq("id", clientId)
    .maybeSingle();
  if (!client || client.role !== "client") return null;
  const [{ data: leads }, conv] = await Promise.all([
    db()
      .from("idealista_leads")
      .select("id, property_title, assigned_to, next_action_at")
      .eq("client_id", clientId)
      .is("merged_into_id", null)
      .neq("status", "descartado")
      .order("created_at", { ascending: false })
      .limit(200),
    (async () => {
      const digits = String(client.phone ?? "").replace(/\D/g, "");
      if (digits.length < 9) return false;
      const { count } = await db()
        .from("zinto_conversations")
        .select("id", { count: "exact", head: true })
        .like("phone_number", `%${digits.slice(-9)}`);
      return (count ?? 0) > 0;
    })(),
  ]);
  const open = ((leads ?? []) as any[]).map((l) => ({
    id: l.id,
    title: l.property_title ?? null,
    assignedTo: l.assigned_to ?? null,
    nextActionAt: l.next_action_at ?? null,
  }));
  return {
    clientId,
    clientName: client.full_name || client.email || "—",
    currentAdvisorId: client.assigned_advisor_id ?? null,
    version: Number(client.advisor_assignment_version ?? 0),
    openLeads: open,
    pendingTasks: open.filter((l) => l.nextActionAt).length,
    hasConversation: conv,
  };
}

/** Historial de reparto de una solicitud (y de su cliente) para la ficha. */
export type AssignmentEventRef = {
  id: string;
  kind: string;
  actorId: string | null;
  occurredAt: string;
  previousAdvisorId: string | null;
  newAdvisorId: string | null;
  reason: string | null;
};

export async function getAssignmentEvents(leadId: string, clientId: string | null): Promise<AssignmentEventRef[]> {
  let q = db()
    .from("assignment_events")
    .select("id, kind, actor_id, occurred_at, previous_advisor_id, new_advisor_id, reason")
    .order("occurred_at", { ascending: false })
    .limit(30);
  q = clientId ? q.or(`lead_id.eq.${leadId},client_id.eq.${clientId}`) : q.eq("lead_id", leadId);
  const { data } = await q;
  return ((data ?? []) as any[]).map((e) => ({
    id: e.id,
    kind: e.kind,
    actorId: e.actor_id ?? null,
    occurredAt: e.occurred_at,
    previousAdvisorId: e.previous_advisor_id ?? null,
    newAdvisorId: e.new_advisor_id ?? null,
    reason: e.reason ?? null,
  }));
}
