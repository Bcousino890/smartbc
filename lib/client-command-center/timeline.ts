// ============================================================================
// CLIENT COMMAND CENTER · línea de tiempo
//
// Une en un solo hilo lo que hoy está repartido en ocho tablas. No consulta
// nada: recibe lo que la página ya cargó y lo ordena.
//
// Dos decisiones que gobiernan el resultado:
//
//  · **Cada evento dice quién lo hizo.** Cliente, agente o sistema. Un hilo en
//    el que no se distingue "abrió su selección" de "le mandamos la selección"
//    no sirve para decidir nada.
//
//  · **La analítica entra por SESIONES, no por vistas.** Doscientas tres filas
//    de `page_views` son unas pocas decenas de visitas reales; volcarlas una a
//    una enterraría los ocho eventos que de verdad importan.
// ============================================================================

import type { TimelineEvent } from "./types";

type Named = { title?: string | null };

export type TimelineInput = {
  client: { createdAt: string | null };
  preferencesUpdatedAt: string | null;

  portalLinks: Array<{
    id: string;
    title: string | null;
    created_at: string;
    last_called_at: string | null;
    status: string;
    notes_thread: Array<{
      id: string;
      kind: string;
      body: string;
      created_at: string;
      authorName: string | null;
    }>;
  }>;

  selections: Array<{
    id: string;
    added_at: string;
    client_feedback_at: string | null;
    client_rating: number;
    property: Named;
  }>;

  shortlists: Array<{
    id: string;
    title: string | null;
    created_at: string;
    first_opened_at: string | null;
    submitted_at: string | null;
    counts: { total: number; mustVisit: number };
    items: Array<{
      id: string;
      decision: string;
      decided_at: string | null;
      property: Named;
    }>;
  }>;

  itineraries: Array<{
    id: string;
    title: string | null;
    status: string;
    created_at: string;
    scheduled_date: string | null;
    shareCreatedAt: string | null;
    stops: number;
  }>;

  visits: Array<{
    id: string;
    status: string;
    requested_at: string;
    propertyTitle: string | null;
  }>;

  applications: Array<{
    id: string;
    status: string;
    createdAt: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    property: { title: string | null } | null;
    documents: Array<{ id: string; fileName: string; createdAt: string }>;
  }>;

  sessions: Array<{
    sessionId: string;
    at: string;
    views: number;
    pageType: string | null;
    device: string | null;
    city: string | null;
    events: Record<string, number>;
  }>;
};

/** Título legible de una propiedad, o null: nunca un id crudo. */
function nameOf(p: Named | null | undefined): string | null {
  const t = p?.title?.trim();
  return t ? t : null;
}

export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const out: TimelineEvent[] = [];

  const push = (
    at: string | null | undefined,
    e: Omit<TimelineEvent, "at" | "id"> & { id: string },
  ) => {
    if (!at) return;
    const t = new Date(at).getTime();
    if (Number.isNaN(t)) return;
    out.push({ ...e, at });
  };

  // ── El cliente ──
  push(input.client.createdAt, {
    id: "client:created",
    source: "client",
    kind: "created",
    actor: "agent",
    titleKey: "cc.tl.clientCreated",
  });
  push(input.preferencesUpdatedAt, {
    id: "client:prefs",
    source: "client",
    kind: "preferences_updated",
    actor: "agent",
    titleKey: "cc.tl.preferencesUpdated",
  });

  // ── Enlaces de portales: el hilo de llamadas ──
  for (const l of input.portalLinks) {
    push(l.created_at, {
      id: `portal_link:added:${l.id}`,
      source: "portal_link",
      kind: "added",
      actor: "agent",
      titleKey: "cc.tl.portalLinkAdded",
      detail: l.title,
    });
    for (const n of l.notes_thread) {
      push(n.created_at, {
        id: `portal_link:note:${n.id}`,
        source: "portal_link",
        kind: n.kind === "call" ? "call" : n.kind === "status" ? "status" : "note",
        actor: "agent",
        actorName: n.authorName,
        titleKey:
          n.kind === "call"
            ? "cc.tl.portalCall"
            : n.kind === "status"
              ? "cc.tl.portalStatus"
              : "cc.tl.portalNote",
        detail: n.body,
      });
    }
  }

  // ── Selección de BCP y la respuesta del cliente ──
  for (const s of input.selections) {
    push(s.added_at, {
      id: `selection:added:${s.id}`,
      source: "selection",
      kind: "added",
      actor: "agent",
      titleKey: "cc.tl.selectionAdded",
      detail: nameOf(s.property),
    });
    push(s.client_feedback_at, {
      id: `selection:feedback:${s.id}`,
      source: "selection",
      kind: "client_rated",
      actor: "client",
      titleKey: "cc.tl.selectionRated",
      vars: { rating: s.client_rating },
      detail: nameOf(s.property),
    });
  }

  // ── Selección privada ──
  for (const sl of input.shortlists) {
    push(sl.created_at, {
      id: `shortlist:created:${sl.id}`,
      source: "shortlist",
      kind: "sent",
      actor: "agent",
      titleKey: "cc.tl.shortlistSent",
      vars: { count: sl.counts.total },
      detail: sl.title,
    });
    push(sl.first_opened_at, {
      id: `shortlist:opened:${sl.id}`,
      source: "shortlist",
      kind: "opened",
      actor: "client",
      titleKey: "cc.tl.shortlistOpened",
      detail: sl.title,
    });
    push(sl.submitted_at, {
      id: `shortlist:submitted:${sl.id}`,
      source: "shortlist",
      kind: "submitted",
      actor: "client",
      titleKey: "cc.tl.shortlistSubmitted",
      vars: { count: sl.counts.mustVisit },
      detail: sl.title,
    });
    for (const it of sl.items) {
      if (!it.decided_at || it.decision === "undecided") continue;
      push(it.decided_at, {
        id: `shortlist:decision:${it.id}`,
        source: "shortlist",
        kind: `decision_${it.decision}`,
        actor: "client",
        titleKey:
          it.decision === "must_visit"
            ? "cc.tl.decisionMustVisit"
            : it.decision === "maybe"
              ? "cc.tl.decisionMaybe"
              : "cc.tl.decisionNotForMe",
        detail: nameOf(it.property),
      });
    }
  }

  // ── Jornadas de visita ──
  for (const it of input.itineraries) {
    push(it.created_at, {
      id: `itinerary:created:${it.id}`,
      source: "itinerary",
      kind: "created",
      actor: "agent",
      titleKey: "cc.tl.itineraryCreated",
      vars: { count: it.stops },
      detail: it.title,
    });
    push(it.shareCreatedAt, {
      id: `itinerary:published:${it.id}`,
      source: "itinerary",
      kind: "published",
      actor: "agent",
      titleKey: "cc.tl.itineraryPublished",
      detail: it.title,
    });
  }

  // ── Solicitudes de visita ──
  for (const v of input.visits) {
    push(v.requested_at, {
      id: `visit:requested:${v.id}`,
      source: "visit",
      kind: "requested",
      actor: "client",
      titleKey: "cc.tl.visitRequested",
      detail: v.propertyTitle,
    });
  }

  // ── Solicitud de alquiler/compra ──
  for (const a of input.applications) {
    push(a.createdAt, {
      id: `application:created:${a.id}`,
      source: "application",
      kind: "created",
      actor: "client",
      titleKey: "cc.tl.applicationCreated",
      detail: a.property?.title ?? null,
    });
    push(a.submittedAt, {
      id: `application:submitted:${a.id}`,
      source: "application",
      kind: "submitted",
      actor: "client",
      titleKey: "cc.tl.applicationSubmitted",
      detail: a.property?.title ?? null,
    });
    push(a.reviewedAt, {
      id: `application:reviewed:${a.id}`,
      source: "application",
      kind: "reviewed",
      actor: "agent",
      titleKey: "cc.tl.applicationReviewed",
      detail: a.property?.title ?? null,
    });
    for (const d of a.documents) {
      push(d.createdAt, {
        id: `application:doc:${d.id}`,
        source: "application",
        kind: "document",
        actor: "client",
        titleKey: "cc.tl.documentUploaded",
        detail: d.fileName,
      });
    }
  }

  // ── Analítica, una entrada por sesión ──
  for (const s of input.sessions) {
    const interactions = Object.entries(s.events)
      .filter(([k]) => k !== "time_on_page")
      .reduce((n, [, v]) => n + v, 0);
    push(s.at, {
      id: `analytics:${s.sessionId}`,
      source: "analytics",
      kind: s.pageType === "client_shortlist" ? "session_shortlist" : "session_collection",
      actor: "client",
      titleKey:
        s.pageType === "client_shortlist"
          ? "cc.tl.sessionShortlist"
          : "cc.tl.sessionCollection",
      vars: { views: s.views, actions: interactions },
      detail: [s.city, s.device].filter(Boolean).join(" · ") || null,
    });
  }

  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
