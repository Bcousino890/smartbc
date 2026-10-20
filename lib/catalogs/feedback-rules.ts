// ============================================================================
// Opiniones de clientes sobre un catálogo (BCP-01, expediente
// 2026-10-20-bcp-01-compacto-y-opiniones, DC10–DC18). Puro: lo usan las rutas
// públicas, el lector, el gestor y la ficha del cliente, y se prueba en
// scripts/test-catalogs-feedback.mts.
//
// La identidad del cliente NUNCA sale del navegador: el token personal
// identifica la asignación en el servidor (0218). Aquí solo se valida lo que
// escribe quien opina: la vivienda (su clave pública), 1–5 estrellas y un
// comentario opcional.
// ============================================================================

import type { ActionResult } from "./access";

export const FEEDBACK_COMMENT_MAX = 1000;
export const FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const;

export type FeedbackError = "invalid_body" | "invalid_rating" | "comment_too_long" | "not_in_catalog" | "link_invalid";

export interface FeedbackInput {
  key: string;
  rating: number;
  comment: string | null;
}

/** Clave pública de una vivienda en la instantánea (12–32 caracteres base64url). */
export function isItemKey(v: unknown): v is string {
  return typeof v === "string" && v.length >= 8 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);
}

/** Recorta y normaliza el comentario: vacío = sin comentario. No toca el
 *  contenido (se muestra siempre como texto, nunca como HTML). */
export function normalizeComment(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n?/g, "\n").trim();
  return t ? t : null;
}

/** Cuerpo de POST /api/seleccion/[token]/opiniones. Cualquier otro campo
 *  (un id de cliente, un nombre…) se ignora: nunca decide nada. */
export function parseFeedbackInput(body: unknown): { ok: true; input: FeedbackInput } | { ok: false; error: FeedbackError } {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isItemKey(b.key)) return { ok: false, error: "invalid_body" };
  const rating = b.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "invalid_rating" };
  if (b.comment !== undefined && b.comment !== null && typeof b.comment !== "string") return { ok: false, error: "invalid_body" };
  const comment = normalizeComment(b.comment);
  if (comment && [...comment].length > FEEDBACK_COMMENT_MAX) return { ok: false, error: "comment_too_long" };
  return { ok: true, input: { key: b.key, rating, comment } };
}

/** Código SQL de 0218 → código de la ruta. Lo desconocido no se reconoce. */
export function feedbackErrorOf(message: string | null | undefined): FeedbackError | null {
  const m = String(message ?? "");
  for (const code of ["link_invalid", "not_in_catalog", "invalid_rating", "comment_too_long"] as const) {
    if (m.includes(code)) return code;
  }
  return null;
}

export function feedbackHttpStatus(e: FeedbackError): number {
  switch (e) {
    case "link_invalid": return 410;
    case "not_in_catalog": return 404;
    default: return 400;
  }
}

/** Lo que lee el lector, en sus palabras. */
export function feedbackErrorText(e: FeedbackError | "rate_limited" | "network" | "backend"): string {
  switch (e) {
    case "link_invalid": return "Este enlace ya no admite opiniones. Pide uno nuevo a tu asesor.";
    case "not_in_catalog": return "Esta vivienda ya no está en la selección.";
    case "invalid_rating": return "Elige de 1 a 5 estrellas.";
    case "comment_too_long": return `El comentario no puede pasar de ${FEEDBACK_COMMENT_MAX.toLocaleString("es-ES")} caracteres.`;
    case "rate_limited": return "Has guardado muchas veces seguidas. Espera un momento y vuelve a intentarlo.";
    case "network": return "No se ha podido guardar: revisa la conexión y vuelve a intentarlo.";
    default: return "No se ha podido guardar ahora mismo. Vuelve a intentarlo en un momento.";
  }
}

export interface SavedFeedback {
  rating: number;
  comment: string | null;
  updatedAt: string;
}

/** Lo que lee el lector de un enlace personal: sus opiniones por clave. */
export interface PersonalFeedbackView {
  personal: boolean;
  items: Record<string, SavedFeedback>;
}

export function parsePersonalFeedback(raw: unknown): PersonalFeedbackView {
  const r = (raw ?? {}) as { personal?: unknown; items?: Record<string, { rating?: unknown; comment?: unknown; updated_at?: unknown; updatedAt?: unknown }> };
  const items: Record<string, SavedFeedback> = {};
  if (r.personal === true && r.items && typeof r.items === "object") {
    for (const [k, v] of Object.entries(r.items)) {
      const rating = Number(v?.rating);
      if (!isItemKey(k) || !Number.isInteger(rating) || rating < 1 || rating > 5) continue;
      items[k] = { rating, comment: normalizeComment(v?.comment), updatedAt: String(v?.updated_at ?? v?.updatedAt ?? "") };
    }
  }
  return { personal: r.personal === true, items };
}

/** ¿Hay algo que guardar? (el botón no reenvía lo mismo). */
export function feedbackDirty(saved: SavedFeedback | null, rating: number | null, comment: string): boolean {
  if (rating === null) return false;
  if (!saved) return true;
  return saved.rating !== rating || (saved.comment ?? null) !== normalizeComment(comment);
}

export function starsLabel(n: number): string {
  return n === 1 ? "1 estrella" : `${n} estrellas`;
}

// ── Gestor: asignaciones (Compartir → «Asignar a cliente») ──────────────────

export type ClientLinkState = "active" | "expired" | "revoked";

export interface ClientLinkView {
  id: string;
  clientId: string;
  clientName: string;
  token: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  feedbackCount: number;
  lastFeedbackAt: string | null;
  state: ClientLinkState;
}

export interface ClientOption {
  id: string;
  name: string;
  /** Correo del cliente para distinguir homónimos (solo en el CRM). */
  detail: string | null;
}

export interface ClientLinkActions {
  list: (i: { catalogId: string }) => Promise<ActionResult<{ links: ClientLinkView[] }>>;
  search: (i: { catalogId: string; q: string }) => Promise<ActionResult<{ clients: ClientOption[] }>>;
  create: (i: { catalogId: string; clientId: string; days: number }) => Promise<ActionResult<{ link: ClientLinkView }>>;
  renew: (i: { catalogId: string; linkId: string; days: number }) => Promise<ActionResult<{ expiresAt: string }>>;
  revoke: (i: { catalogId: string; linkId: string }) => Promise<ActionResult<object>>;
}

export function clientLinkState(row: { revokedAt: string | null; expiresAt: string }, now = Date.now()): ClientLinkState {
  if (row.revokedAt) return "revoked";
  return new Date(row.expiresAt).getTime() <= now ? "expired" : "active";
}

/** Fila de catalog_client_links_list (0218) → vista. */
export function clientLinkFromRow(r: Record<string, unknown>, now = Date.now()): ClientLinkView {
  const base = {
    id: String(r.id),
    clientId: String(r.client_id),
    clientName: String(r.client_name ?? "Cliente"),
    token: String(r.token),
    expiresAt: String(r.expires_at),
    revokedAt: r.revoked_at ? String(r.revoked_at) : null,
    createdAt: String(r.created_at ?? ""),
    feedbackCount: Number(r.feedback_count ?? 0),
    lastFeedbackAt: r.last_feedback_at ? String(r.last_feedback_at) : null,
  };
  return { ...base, state: clientLinkState(base, now) };
}

/** Búsqueda de clientes: texto corto, sin comodines de PostgREST. */
export function normalizeClientQuery(q: unknown): string | null {
  if (typeof q !== "string") return null;
  const t = q.replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim();
  return t.length >= 2 && t.length <= 80 ? t : null;
}

// ── Ficha del cliente ───────────────────────────────────────────────────────

export interface ClientFeedbackRow {
  id: string;
  catalogTitle: string;
  propertyTitle: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  /** false: la vivienda salió del catálogo o se borró (histórico, DC15). */
  inCatalog: boolean;
}

export interface ClientCatalogLinkRow {
  id: string;
  catalogTitle: string;
  url: string;
  expiresAt: string;
  revokedAt: string | null;
  state: ClientLinkState;
  /** Solo para el dueño de la HOME: enlace a su gestor (DC16). */
  managerHref: string | null;
}

export interface ClientCatalogFeedback {
  feedback: ClientFeedbackRow[];
  links: ClientCatalogLinkRow[];
}
