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

  /** De dónde salió el cliente. Solo el origen y la conversión: la línea de
   *  tiempo del cliente no es un segundo inbox. */
  origin: {
    receivedAt: string;
    convertedAt: string | null;
    propertyTitle: string | null;
  } | null;

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

  // ── De dónde vino ──
  if (input.origin) {
    push(input.origin.receivedAt, {
      id: "origin:received",
      source: "client",
      kind: "lead_received",
      actor: "client",
      titleKey: "cc.tl.leadReceived",
      detail: input.origin.propertyTitle,
    });
    push(input.origin.convertedAt, {
      id: "origin:converted",
      source: "client",
      kind: "lead_converted",
      actor: "agent",
      titleKey: "cc.tl.leadConverted",
    });
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
      // Los contadores viajan como variables y los compone la vista: en
      // español "1 páginas" delata que nadie miró el caso de uno.
      vars: { views: s.views, actions: interactions },
      detail: [s.city, s.device].filter(Boolean).join(" · ") || null,
    });
  }

  out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return collapseBursts(groupAnalyticsByDay(out));
}

/**
 * La analítica, un renglón por día y superficie.
 *
 * Aunque las vistas ya vengan agrupadas en visitas, un cliente que abre su
 * selección treinta veces en cinco días deja treinta renglones idénticos —
 * "Estuvo en su selección · 1 página"— que entierran la llamada de teléfono
 * que sí hay que leer. El día es la unidad con la que uno recuerda las cosas:
 * "el miércoles estuvo mirando", no "el miércoles a las 17:42, y otra vez a
 * las 17:51".
 *
 * No se pierde nada: el desglose fino vive en "Qué ha mirado", que para eso
 * está.
 */
function groupAnalyticsByDay(events: TimelineEvent[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const byDay = new Map<string, TimelineEvent>();

  for (const e of events) {
    if (e.source !== "analytics") {
      out.push(e);
      continue;
    }
    const key = `${e.at.slice(0, 10)}|${e.kind}`;
    const open = byDay.get(key);
    if (!open) {
      // Los eventos llegan de más nuevo a más viejo, así que el primero de
      // cada día ya trae la marca correcta: la última vez que estuvo.
      const seed: TimelineEvent = { ...e, count: 1 };
      byDay.set(key, seed);
      out.push(seed);
      continue;
    }
    open.count = (open.count ?? 1) + 1;
    open.vars = {
      views: Number(open.vars?.views ?? 0) + Number(e.vars?.views ?? 0),
      actions: Number(open.vars?.actions ?? 0) + Number(e.vars?.actions ?? 0),
    };
    // El sitio desde el que se conectó se queda con el del rato más reciente.
  }

  return out;
}

/** Ventana dentro de la cual varios gestos iguales son EL MISMO gesto. */
const BURST_MS = 30 * 60_000;

/** Cuántos detalles se conservan al plegar. Tres bastan para reconocerlo. */
const KEEP_DETAILS = 3;

/**
 * Pliega rachas: gestos seguidos, del mismo tipo y del mismo autor, hechos en
 * la misma media hora.
 *
 * Añadir veinte propiedades a la selección de una vez son veinte filas en la
 * base y **un** gesto para quien lee la ficha; sin plegarlas, esas veinte
 * entierran la llamada de teléfono que sí hay que ver. Se conserva la marca
 * más reciente, el número y los primeros detalles.
 */
export function collapseBursts(events: TimelineEvent[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];

  // ⚠️ No basta con mirar la fila ANTERIOR. Al añadir veinte propiedades de
  // una tacada, cualquier otro gesto que caiga en medio —guardar el encargo,
  // por ejemplo— parte la racha en dos y aparecen "×19" y un huérfano. Se
  // guarda un grupo abierto por tipo de gesto, y se cierra cuando pasa la
  // media hora.
  const open = new Map<string, TimelineEvent>();

  for (const e of events) {
    // La analítica ya viene agrupada por día; volver a plegarla aquí sumaría
    // dos ratos distintos en uno solo y falsearía el "cuándo".
    if (e.source === "analytics") {
      out.push({ ...e, count: e.count ?? 1, details: [] });
      continue;
    }

    const key = `${e.source}|${e.kind}|${e.actor}`;
    const group = open.get(key);
    const at = new Date(e.at).getTime();

    if (group && new Date(group.at).getTime() - at <= BURST_MS) {
      group.count = (group.count ?? 1) + 1;
      if (e.detail && (group.details?.length ?? 0) < KEEP_DETAILS) {
        group.details = [...(group.details ?? []), e.detail];
      }
      continue;
    }

    const fresh: TimelineEvent = {
      ...e,
      // `count` puede venir ya puesto: pisarlo con un 1 borraría esa cuenta.
      count: e.count ?? 1,
      details: e.details ?? (e.detail ? [e.detail] : []),
    };
    open.set(key, fresh);
    out.push(fresh);
  }

  return out;
}
