import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { resolveStopIdByPublicOrder } from "@/lib/db/queries/viewing-collections";

// ============================================================================
// Valoración del CLIENTE desde su colección privada (/v/[token]).
//
// Es la única escritura que llega desde una superficie sin sesión, y por eso
// está acotada por todos lados:
//
//   · Se nombra la residencia por su PUESTO en la jornada (1..N), nunca por un
//     id: la proyección pública no expone un solo UUID. El servidor traduce
//     ese puesto con el mismo comparador que usó para numerarlas.
//   · La escritura la hace `record_collection_feedback`, que vuelve a validar
//     token ↔ parada dentro de la propia base de datos y solo toca
//     client_rating / client_rank / client_feedback_at. Doble barrera.
//   · Devuelve lo mismo (204) cuando el token no vale y cuando sí: distinguir
//     "no existe" de "existe pero no puedes" ya es información, igual que
//     hace la página pública.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Freno en memoria del proceso, por token. Un enlace es de una persona
 * mirando pisos: veinte valoraciones por minuto sobran de largo. Asume el PM2
 * de un solo proceso que tenemos, igual que los contadores de la Partner API
 * de Idealista.
 */
const RATE_LIMIT = 20;
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function overRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = hits.get(token);
  if (!entry || now > entry.resetAt) {
    hits.set(token, { count: 1, resetAt: now + WINDOW_MS });
    // Barrido perezoso: sin él el Map crece con cada token que pasa por aquí.
    if (hits.size > 500) {
      for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    }
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) return new Response(null, { status: 204 });
  if (overRateLimit(token)) return new Response(null, { status: 429 });

  let body: { order?: unknown; rating?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  const order = Number(body.order);
  const rating = Number(body.rating);
  if (!Number.isInteger(order) || order < 1 || order > 200) {
    return new Response(null, { status: 204 });
  }
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
    return new Response(null, { status: 204 });
  }

  const stopId = await resolveStopIdByPublicOrder(token, order);
  if (!stopId) return new Response(null, { status: 204 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin.rpc("record_collection_feedback", {
    p_token: token,
    p_stop_id: stopId,
    p_rating: rating,
    // El orden del cliente se deriva de la nota: no le pedimos que arrastre
    // nada en una publicación que se lee con el pulgar.
    p_rank: null,
  });

  if (error) {
    console.error("[collection-feedback] no se pudo guardar:", error.message);
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
