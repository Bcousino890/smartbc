import "server-only";
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";

/**
 * Campos pesados / de detalle de un anuncio, servidos bajo demanda.
 *
 * El listado de /admin/particulares ya no trae el array `photos` de cada fila
 * (con 30+ URLs por anuncio el payload dejaba la página colgada). El modal
 * pide aquí la galería completa al abrirse — y, de paso, la ficha técnica
 * scrapeada (precio/m², rebaja, planta, año, estado, energía, etc.), que
 * tampoco viaja en el listado para mantenerlo ligero.
 */
const DETAIL_COLUMNS =
  "id, photos, price_per_m2, previous_price, price_drop_pct, floor, has_lift, " +
  "condition, year_built, orientation, energy_consumption, energy_emissions, " +
  "advertiser_profile_url, reference, source_update_text";
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccess(profile.role ?? "", "particulares", "view")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Falta el parámetro id" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data, error } = await admin
      .from("particulares")
      .select(DETAIL_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return Response.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }

    return Response.json({ ...data, photos: data.photos ?? [] });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "query_failed" },
      { status: 500 },
    );
  }
}
