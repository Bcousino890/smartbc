import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { reconcileProperties } from "@/lib/services/idealista/partner-api/reconcile";

// Recorre los anuncios que Idealista tiene bajo nuestro feedKey ("Find All
// Properties") y deja guardada la correspondencia con las fichas del CRM. Es el
// paso que Idealista exige antes de pasar a producción, y también la forma de
// recuperar la relación si alguna vez se pierde.
//
// Sólo lee de Idealista y escribe en nuestra base: no modifica ni borra nada
// allí.

export const maxDuration = 300;

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await reconcileProperties();
    return Response.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    console.error("[idealista-api/reconcile]", err);
    return Response.json(
      { ok: false, errors: [err instanceof Error ? err.message : "Error inesperado"] },
      { status: 500 }
    );
  }
}
