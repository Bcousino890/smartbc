import "server-only";
import { type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getParticularLinks } from "@/lib/db/queries/particulares-links";

/**
 * Ficha unificada de un particular (migración 0176): anuncios del mismo
 * inmueble en otros portales / operaciones, posibles gemelos por confirmar y
 * otros anuncios del mismo contacto. Lo pide el modal al abrirse; va aparte
 * del `detail` para no engordarlo (y porque `detail` también lo usa el
 * prefetch al pasar el ratón por cada tarjeta).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role ?? "", "particulares", "view")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Falta el parámetro id" }, { status: 400 });
  try {
    const payload = await getParticularLinks(id);
    return Response.json(payload ?? { root_id: id, members: [], suggestions: [], same_contact: [], contacts: [] });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "query_failed" }, { status: 500 });
  }
}
