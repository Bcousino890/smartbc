// ============================================================================
// CLIENT COMMAND CENTER · derivaciones puras
//
// Etapa, próxima acción, métricas y última actividad. Todo se calcula a partir
// de lo que YA existe en la base: ninguna de estas cuatro señales tiene columna
// propia, y es a propósito — un campo "etapa" que alguien pone a mano se
// desincroniza el primer día. Deducirlo cuesta un poco más y no puede mentir.
//
// `now` entra siempre por parámetro para que las pruebas no dependan del reloj.
// ============================================================================

import type {
  ClientMetrics,
  ClientStage,
  NextAction,
  TimelineSource,
} from "./types";

const DAY = 86_400_000;

/** Días entre dos instantes, con signo: positivo si `iso` ya pasó. */
function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / DAY;
}

function daysUntil(iso: string | null | undefined, now: Date): number | null {
  const d = daysSince(iso, now);
  return d === null ? null : -d;
}

// ─── Lo que entra ────────────────────────────────────────────────────────────

/**
 * El retrato mínimo del cliente. Se declara campo a campo (en vez de aceptar
 * las filas enteras) para que quede escrito qué se mira de verdad: si mañana
 * alguien cambia una consulta, el compilador dice exactamente qué señales se
 * quedan sin dato.
 */
export type CommandCenterSnapshot = {
  hasPreferences: boolean;
  hasAdvisor: boolean;

  selections: Array<{ status: string }>;

  portalLinks: Array<{ status: string; last_called_at: string | null }>;

  shortlists: Array<{
    id: string;
    status: "reviewing" | "submitted" | "archived";
    linkState: "active" | "expired" | "revoked";
    created_at: string;
    first_opened_at: string | null;
    submitted_at: string | null;
    client_updated_at: string | null;
    expires_at: string;
    updatedAfterSubmit: boolean;
    counts: { total: number; decided: number; mustVisit: number };
  }>;

  itineraries: Array<{
    id: string;
    status: string;
    scheduled_date: string | null;
    blockers: number;
    stopsPendingConfirmation: number;
    hasActiveShare: boolean;
  }>;

  visits: Array<{ status: string; requested_at: string; updated_at?: string | null }>;

  applications: Array<{
    id: string;
    status: string;
    submitted_at: string | null;
    updated_at: string;
    documentsPending: number;
  }>;

  engagement: { views: number; lastViewAt: string | null; totalLinks: number };

  /** Marcas sueltas que solo sirven para "última actividad". */
  lastFeedbackAt: string | null;
  lastDecisionAt: string | null;
  lastPortalNoteAt: string | null;
};

// ─── Etapa ───────────────────────────────────────────────────────────────────

/**
 * La etapa más avanzada que el cliente ha alcanzado de verdad. Se va subiendo
 * en orden y se devuelve la última que se cumple: así una visita completada no
 * "retrocede" porque la selección privada esté archivada.
 */
export function deriveClientStage(s: CommandCenterSnapshot): ClientStage {
  let stage: ClientStage = "new";

  if (s.hasPreferences) stage = "qualified";

  const liveSelections = s.selections.filter((x) => x.status !== "discarded");
  if (liveSelections.length > 0 || s.portalLinks.length > 0) stage = "sourcing";

  if (s.shortlists.some((x) => x.status !== "archived")) stage = "shortlisted";

  if (s.shortlists.some((x) => x.status === "submitted")) stage = "prioritised";

  // "Día montado" es tener una jornada viva, con o sin enlace publicado: un
  // borrador con paradas ya es trabajo hecho.
  if (
    s.itineraries.some(
      (x) => x.status === "draft" || x.status === "published",
    )
  ) {
    stage = "scheduled";
  }

  if (
    s.itineraries.some((x) => x.status === "completed") ||
    s.visits.some((v) => v.status === "completed")
  ) {
    stage = "visited";
  }

  if (s.applications.some((a) => a.status !== "draft")) stage = "applying";

  return stage;
}

// ─── Próxima acción ──────────────────────────────────────────────────────────

/**
 * El orden de esta lista ES la decisión de producto: primero lo que tiene a
 * otra persona esperando, después lo que tiene fecha, y al final la higiene de
 * la ficha. La primera de la lista es la que se pinta grande.
 */
export function deriveNextActions(
  s: CommandCenterSnapshot,
  now: Date = new Date(),
): NextAction[] {
  const out: NextAction[] = [];

  // 1. El cliente contestó y su ranking está sin usar. Nadie más puede
  //    desbloquear esto: es la acción más urgente que existe en la ficha.
  for (const sl of s.shortlists) {
    if (sl.status !== "submitted") continue;
    const usable = s.itineraries.some(
      (i) => i.status === "draft" || i.status === "published",
    );
    if (usable) continue;
    out.push({
      kind: "shortlist_submitted",
      urgency: "now",
      titleKey: "cc.next.shortlistSubmitted.title",
      detailKey: "cc.next.shortlistSubmitted.detail",
      vars: { count: sl.counts.mustVisit },
      tab: "properties",
      anchor: sl.id,
    });
    break;
  }

  // 2. Jornada publicada con paradas sin confirmar: el cliente ya tiene el
  //    enlace en la mano y ve huecos.
  for (const it of s.itineraries) {
    if (it.status !== "published" || it.stopsPendingConfirmation === 0) continue;
    out.push({
      kind: "stops_pending_confirmation",
      urgency: "now",
      titleKey: "cc.next.stopsPending.title",
      detailKey: "cc.next.stopsPending.detail",
      vars: { count: it.stopsPendingConfirmation },
      tab: "viewings",
      anchor: it.id,
    });
    break;
  }

  // 3. Borrador que no se puede publicar.
  for (const it of s.itineraries) {
    if (it.status !== "draft" || it.blockers === 0) continue;
    out.push({
      kind: "itinerary_blockers",
      urgency: "now",
      titleKey: "cc.next.itineraryBlockers.title",
      detailKey: "cc.next.itineraryBlockers.detail",
      vars: { count: it.blockers },
      tab: "viewings",
      anchor: it.id,
    });
    break;
  }

  // 4. Solicitudes de visita sin responder.
  const pendingVisits = s.visits.filter((v) => v.status === "pending").length;
  if (pendingVisits > 0) {
    out.push({
      kind: "visit_pending",
      urgency: "soon",
      titleKey: "cc.next.visitPending.title",
      detailKey: "cc.next.visitPending.detail",
      vars: { count: pendingVisits },
      tab: "viewings",
    });
  }

  // 5. Llamadas de portales pendientes. `callback` va delante porque hay una
  //    persona esperando a que se la devuelvan.
  const callbacks = s.portalLinks.filter((l) => l.status === "callback").length;
  const toCall = s.portalLinks.filter(
    (l) => l.status === "pending" || l.status === "no_answer",
  ).length;
  if (callbacks > 0 || toCall > 0) {
    out.push({
      kind: "portal_calls_pending",
      urgency: "soon",
      titleKey: callbacks > 0
        ? "cc.next.portalCallbacks.title"
        : "cc.next.portalCalls.title",
      detailKey: "cc.next.portalCalls.detail",
      vars: { count: callbacks > 0 ? callbacks : toCall },
      tab: "properties",
    });
  }

  // 6. Enlace privado a punto de caducar con el trabajo a medias.
  for (const sl of s.shortlists) {
    if (sl.status !== "reviewing" || sl.linkState !== "active") continue;
    const left = daysUntil(sl.expires_at, now);
    if (left === null || left > 7) continue;
    out.push({
      kind: "shortlist_expiring",
      urgency: "soon",
      titleKey: "cc.next.shortlistExpiring.title",
      detailKey: "cc.next.shortlistExpiring.detail",
      vars: { days: Math.max(0, Math.ceil(left)) },
      tab: "properties",
      anchor: sl.id,
    });
    break;
  }

  // 7. Mandada hace días y sin abrir. Tres días es el umbral: por debajo, aún
  //    es pronto para dar la lata.
  for (const sl of s.shortlists) {
    if (sl.status !== "reviewing" || sl.first_opened_at) continue;
    const age = daysSince(sl.created_at, now);
    if (age === null || age < 3) continue;
    out.push({
      kind: "shortlist_unopened",
      urgency: "soon",
      titleKey: "cc.next.shortlistUnopened.title",
      detailKey: "cc.next.shortlistUnopened.detail",
      vars: { days: Math.floor(age) },
      tab: "properties",
      anchor: sl.id,
    });
    break;
  }

  // 8. Solicitud esperando revisión nuestra.
  for (const app of s.applications) {
    if (app.status !== "pending_review") continue;
    out.push({
      kind: "application_in_review",
      urgency: "soon",
      titleKey: "cc.next.applicationReview.title",
      detailKey: "cc.next.applicationReview.detail",
      vars: { count: app.documentsPending },
      tab: "application",
      anchor: app.id,
    });
    break;
  }

  // 9-10. Higiene de la ficha: sin esto, todo lo demás se hace a ciegas.
  if (!s.hasPreferences) {
    out.push({
      kind: "missing_preferences",
      urgency: "later",
      titleKey: "cc.next.missingPreferences.title",
      detailKey: "cc.next.missingPreferences.detail",
      tab: "overview",
    });
  }

  if (!s.hasAdvisor) {
    out.push({
      kind: "no_advisor",
      urgency: "later",
      titleKey: "cc.next.noAdvisor.title",
      detailKey: "cc.next.noAdvisor.detail",
      tab: "overview",
    });
  }

  return out;
}

// ─── Métricas ────────────────────────────────────────────────────────────────

/**
 * Cuatro cifras reales. `clientPriorities` y `views` pueden ser `null`: no es
 * lo mismo "ha marcado cero" que "todavía no le hemos preguntado", y la ficha
 * anterior enseñaba un 0 para ambas cosas.
 */
export function deriveMetrics(s: CommandCenterSnapshot): ClientMetrics {
  const selected = s.selections.filter((x) => x.status !== "discarded").length;

  // La selección privada más reciente que el cliente haya llegado a tocar.
  const answered = s.shortlists.filter(
    (x) => x.status === "submitted" || x.counts.decided > 0,
  );
  const clientPriorities = answered.length
    ? answered.reduce((max, x) => Math.max(max, x.counts.mustVisit), 0)
    : null;

  const viewings = s.itineraries.filter(
    (x) => x.status !== "cancelled" && x.status !== "archived",
  ).length;

  const views = s.engagement.totalLinks > 0 ? s.engagement.views : null;

  return { selected, clientPriorities, viewings, views };
}

// ─── Última actividad ────────────────────────────────────────────────────────

export type LastActivity = {
  at: string;
  source: TimelineSource;
  /** ¿Fue el cliente o fuimos nosotros? Cambia por completo cómo se lee. */
  actor: "client" | "agent";
} | null;

/**
 * La marca más reciente de todas las que sabemos leer. Se prefiere una vista
 * de página cuando empata, porque es la señal más granular y la única que
 * demuestra que el cliente estaba MIRANDO.
 */
export function deriveLastActivity(s: CommandCenterSnapshot): LastActivity {
  const candidates: Array<{
    at: string | null;
    source: TimelineSource;
    actor: "client" | "agent";
  }> = [
    { at: s.engagement.lastViewAt, source: "analytics", actor: "client" },
    { at: s.lastFeedbackAt, source: "selection", actor: "client" },
    { at: s.lastDecisionAt, source: "shortlist", actor: "client" },
    { at: s.lastPortalNoteAt, source: "portal_link", actor: "agent" },
  ];

  for (const sl of s.shortlists) {
    candidates.push({ at: sl.client_updated_at, source: "shortlist", actor: "client" });
    candidates.push({ at: sl.submitted_at, source: "shortlist", actor: "client" });
    candidates.push({ at: sl.first_opened_at, source: "shortlist", actor: "client" });
  }
  for (const l of s.portalLinks) {
    candidates.push({ at: l.last_called_at, source: "portal_link", actor: "agent" });
  }
  for (const v of s.visits) {
    candidates.push({ at: v.updated_at ?? v.requested_at, source: "visit", actor: "client" });
  }
  for (const a of s.applications) {
    candidates.push({ at: a.updated_at, source: "application", actor: "client" });
  }

  let best: LastActivity = null;
  for (const c of candidates) {
    if (!c.at) continue;
    const t = new Date(c.at).getTime();
    if (Number.isNaN(t)) continue;
    if (!best || t > new Date(best.at).getTime()) {
      best = { at: c.at, source: c.source, actor: c.actor };
    }
  }
  return best;
}
