import "server-only";

// ============================================================================
// REPARTO COMERCIAL · lectura
//
// Los inmuebles repartibles son las fichas propias (properties) y los anuncios
// de Idealista sin ficha propia (las «inspo», que son la mayoría de lo que
// consulta la gente). Se leen enteros una vez y se filtran aquí: son unos
// pocos miles de filas cortas, y así la búsqueda y el filtro «sin regla» no
// necesitan un NOT IN gigante en la URL de PostgREST.
// ============================================================================

import { createAdminClient } from "../admin";
import type { RoutingSubject, ZintoSyncInfo, ZintoSyncState } from "@/lib/sales-inbox/routing";
import { subjectKey } from "@/lib/sales-inbox/routing";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

export type RoutingRuleRef = {
  id: string;
  advisorId: string | null;
  active: boolean;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type RoutingTarget = {
  key: string;
  subject: RoutingSubject;
  /** BC-xxxx de la ficha o reference_code del anuncio. */
  reference: string | null;
  title: string;
  address: string | null;
  /** Anuncios de Idealista enlazados (referencia · código). */
  listings: Array<{ id: string; reference: string | null; code: string | null; state: string | null }>;
  operation: string | null;
  rule: RoutingRuleRef | null;
};

export type RoutingFilter = {
  search?: string;
  /** 'none' = sin regla activa; uuid = de ese asesor. */
  advisor?: string;
  page: number;
  pageSize: number;
};

export type RoutingPage = {
  items: RoutingTarget[];
  total: number;
  page: number;
  pageSize: number;
  /** Totales para la cabecera: con regla activa / sin regla. */
  withRule: number;
  withoutRule: number;
};

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export async function getRoutingTargets(country: string, f: RoutingFilter): Promise<RoutingPage> {
  const [propsRes, listingsRes, rulesRes] = await Promise.all([
    db()
      .from("properties")
      .select("id, title, address, zone, bc_reference, operation")
      .eq("country", country)
      .is("archived_at", null)
      .order("bc_reference", { ascending: false })
      .limit(5000),
    // Los anuncios de Idealista son de España; con ficha propia se agrupan
    // bajo ella, sin ficha son su propio inmueble.
    country === "es"
      ? db()
          .from("idealista_listings")
          .select("id, property_id, reference_code, idealista_property_id, inspo_title, address_street, address_city, operation, idealista_state, archived_at")
          .is("archived_at", null)
          .limit(5000)
      : Promise.resolve({ data: [] }),
    db()
      .from("property_routing_rules")
      .select("id, property_id, listing_id, advisor_id, active, version, updated_at, updated_by")
      .eq("country", country),
  ]);

  const rules = new Map<string, RoutingRuleRef>();
  for (const r of (rulesRes.data ?? []) as any[]) {
    const key = r.property_id ? `p:${r.property_id}` : `l:${r.listing_id}`;
    rules.set(key, {
      id: r.id,
      advisorId: r.advisor_id ?? null,
      active: !!r.active,
      version: Number(r.version),
      updatedAt: r.updated_at,
      updatedBy: r.updated_by ?? null,
    });
  }

  const listingsByProperty = new Map<string, RoutingTarget["listings"]>();
  const targets: RoutingTarget[] = [];
  for (const l of (listingsRes.data ?? []) as any[]) {
    const ref = { id: l.id, reference: l.reference_code ?? null, code: l.idealista_property_id ?? null, state: l.idealista_state ?? null };
    if (l.property_id) {
      const arr = listingsByProperty.get(l.property_id) ?? [];
      arr.push(ref);
      listingsByProperty.set(l.property_id, arr);
      continue;
    }
    const subject: RoutingSubject = { kind: "listing", id: l.id };
    targets.push({
      key: subjectKey(subject),
      subject,
      reference: l.reference_code ?? null,
      title: l.inspo_title || l.address_street || l.reference_code || "Anuncio sin título",
      address: [l.address_street, l.address_city].filter(Boolean).join(", ") || null,
      listings: [ref],
      operation: l.operation ?? null,
      rule: rules.get(subjectKey(subject)) ?? null,
    });
  }
  for (const p of (propsRes.data ?? []) as any[]) {
    const subject: RoutingSubject = { kind: "property", id: p.id };
    targets.push({
      key: subjectKey(subject),
      subject,
      reference: p.bc_reference ?? null,
      title: p.title ?? "Sin título",
      address: [p.address, p.zone].filter(Boolean).join(", ") || null,
      listings: listingsByProperty.get(p.id) ?? [],
      operation: p.operation ?? null,
      rule: rules.get(subjectKey(subject)) ?? null,
    });
  }

  const active = (t: RoutingTarget) => !!t.rule?.active && !!t.rule.advisorId;
  const withRule = targets.filter(active).length;

  let rows = targets;
  const term = norm(f.search?.trim());
  if (term) {
    rows = rows.filter((t) =>
      [t.reference, t.title, t.address, ...t.listings.flatMap((l) => [l.reference, l.code])]
        .some((v) => norm(v).includes(term)),
    );
  }
  if (f.advisor === "none") rows = rows.filter((t) => !active(t));
  else if (f.advisor) rows = rows.filter((t) => active(t) && t.rule?.advisorId === f.advisor);

  // Primero lo que tiene referencia (lo que el equipo busca por BC-xxxx).
  rows.sort((a, b) => (b.reference ?? "").localeCompare(a.reference ?? "", "es", { numeric: true }));

  const start = (f.page - 1) * f.pageSize;
  return {
    items: rows.slice(start, start + f.pageSize),
    total: rows.length,
    page: f.page,
    pageSize: f.pageSize,
    withRule,
    withoutRule: targets.length - withRule,
  };
}

/** Responsables para elegir: los que pueden llevar clientes (routing_is_advisor). */
export async function getRoutingAdvisors(): Promise<Array<{ id: string; name: string; role: string }>> {
  const { data } = await db()
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin"])
    .order("full_name");
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    name: p.full_name || p.email || "—",
    role: p.role,
  }));
}

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
