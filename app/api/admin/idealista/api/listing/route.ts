import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import {
  cloneListingViaApi,
  deactivateListingViaApi,
  publishListingViaApi,
  reactivateListingViaApi,
  refreshListingStateViaApi,
  syncListingImagesViaApi,
} from "@/lib/services/idealista/partner-api/publish";

// Operaciones sobre un anuncio concreto en Idealista. Todo lo que la API
// permite hacer con un anuncio se hace desde aquí: Idealista prohíbe gestionar
// por su área privada lo que se puede gestionar por API.

export const maxDuration = 120;

const ACTIONS = {
  publish: publishListingViaApi,
  deactivate: deactivateListingViaApi,
  reactivate: reactivateListingViaApi,
  clone: cloneListingViaApi,
  "sync-images": syncListingImagesViaApi,
  "refresh-state": refreshListingStateViaApi,
} as const;

type Action = keyof typeof ACTIONS;

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { listingId?: string; action?: string };
  try {
    body = (await req.json()) as { listingId?: string; action?: string };
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const listingId = (body.listingId ?? "").trim();
  const action = (body.action ?? "publish") as Action;

  if (!listingId) return Response.json({ error: "Falta listingId" }, { status: 400 });
  if (!(action in ACTIONS)) {
    return Response.json(
      { error: `Acción desconocida "${action}". Admitidas: ${Object.keys(ACTIONS).join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    const result = await ACTIONS[action](listingId);
    // Un fallo de validación o de Idealista no es un error del servidor: el
    // panel necesita el detalle para poder enseñarlo, no un 500 genérico.
    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    console.error(`[idealista-api/listing] ${action}:`, err);
    return Response.json(
      {
        ok: false,
        steps: [],
        warnings: [],
        errors: [err instanceof Error ? err.message : "Error inesperado al hablar con Idealista."],
      },
      { status: 500 }
    );
  }
}
