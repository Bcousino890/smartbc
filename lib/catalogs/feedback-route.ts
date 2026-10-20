import "server-only";
import { getPersonalFeedback, savePersonalFeedback } from "./feedback";
import { feedbackHttpStatus, parseFeedbackInput } from "./feedback-rules";
import { feedbackReadLimiter, feedbackWriteLimiter } from "./rate-limit";
import { isShareToken } from "./share";

// Lógica de GET/POST /api/seleccion/[token]/opiniones (0218), sin Next: la
// ruta solo la envuelve en una respuesta. Así se prueba tal cual en Node
// (scripts/test-catalogs-feedback.mts) contra el almacén sintético.

export interface FeedbackReply {
  status: number;
  body: Record<string, unknown>;
}

const BODY_MAX = 8_000;

export async function feedbackGet(token: string): Promise<FeedbackReply> {
  if (!isShareToken(token)) return { status: 200, body: { personal: false, items: {} } };
  if (!feedbackReadLimiter.allow(token)) return { status: 429, body: { error: "rate_limited" } };
  try {
    return { status: 200, body: { ...(await getPersonalFeedback(token)) } };
  } catch (err) {
    console.error("[catalogos] opiniones (leer):", err instanceof Error ? err.message : err);
    return { status: 503, body: { error: "unavailable_backend" } };
  }
}

export async function feedbackPost(token: string, rawBody: string): Promise<FeedbackReply> {
  if (!isShareToken(token)) return { status: 410, body: { error: "link_invalid" } };
  if (!feedbackWriteLimiter.allow(token)) return { status: 429, body: { error: "rate_limited" } };
  if (rawBody.length > BODY_MAX) return { status: 400, body: { error: "comment_too_long" } };
  let body: unknown = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }
  const parsed = parseFeedbackInput(body);
  if (!parsed.ok) return { status: feedbackHttpStatus(parsed.error), body: { error: parsed.error } };
  try {
    const r = await savePersonalFeedback(token, parsed.input);
    if (!r.ok) return { status: feedbackHttpStatus(r.error), body: { error: r.error } };
    return { status: 200, body: { ok: true, status: r.status, updatedAt: r.updatedAt } };
  } catch (err) {
    console.error("[catalogos] opiniones (guardar):", err instanceof Error ? err.message : err);
    return { status: 503, body: { error: "unavailable_backend" } };
  }
}
