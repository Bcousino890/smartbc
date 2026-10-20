import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { isCatalogFixtureMode } from "./fixture-mode";
import { feedbackErrorOf, parsePersonalFeedback, type FeedbackError, type FeedbackInput, type PersonalFeedbackView } from "./feedback-rules";
import { isShareToken } from "./share";

// ============================================================================
// Opiniones por enlace personal (0218, DC11–DC14). Solo el token decide la
// asignación, el cliente y el catálogo: lo resuelve catalog_feedback_get/set
// en la base de datos. En CATALOG_FIXTURES=1 (desarrollo) usa el almacén
// sintético con las mismas reglas.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

/** Opiniones de la asignación de este token (vacío si no es personal o ya no vale). */
export async function getPersonalFeedback(token: string): Promise<PersonalFeedbackView> {
  if (!isShareToken(token)) return { personal: false, items: {} };
  if (isCatalogFixtureMode()) {
    const { fixtureFeedbackGet } = await import("./fixture-store");
    return parsePersonalFeedback(await fixtureFeedbackGet(token));
  }
  const { data, error } = await db().rpc("catalog_feedback_get", { p_token: token });
  if (error) throw new Error(`catalog_feedback_get: ${error.message}`);
  return parsePersonalFeedback(data);
}

export type SaveFeedbackResult =
  | { ok: true; status: "saved" | "unchanged"; updatedAt: string }
  | { ok: false; error: FeedbackError };

/** Guarda la opinión. Lanza si falla la base de datos por otra causa (la
 *  ruta responde 503 y el lector NO dice «Guardado»). */
export async function savePersonalFeedback(token: string, input: FeedbackInput): Promise<SaveFeedbackResult> {
  if (!isShareToken(token)) return { ok: false, error: "link_invalid" };
  if (isCatalogFixtureMode()) {
    const { fixtureFeedbackSet } = await import("./fixture-store");
    try {
      const r = await fixtureFeedbackSet(token, input.key, input.rating, input.comment);
      return { ok: true, status: r.status, updatedAt: r.updated_at };
    } catch (err) {
      const code = feedbackErrorOf(err instanceof Error ? err.message : String(err));
      if (code) return { ok: false, error: code };
      throw err;
    }
  }
  const { data, error } = await db().rpc("catalog_feedback_set", {
    p_token: token,
    p_key: input.key,
    p_rating: input.rating,
    p_comment: input.comment,
  });
  if (error) {
    const code = feedbackErrorOf(error.message);
    if (code) return { ok: false, error: code };
    throw new Error(`catalog_feedback_set: ${error.message}`);
  }
  const status = data?.status === "unchanged" ? "unchanged" : data?.status === "saved" ? "saved" : null;
  if (!status) throw new Error("catalog_feedback_set: respuesta inesperada");
  return { ok: true, status, updatedAt: String(data.updated_at ?? "") };
}
