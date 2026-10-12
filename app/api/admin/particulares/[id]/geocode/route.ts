import "server-only";
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { nominatimLookup } from "@/lib/geo/nominatim-queue";

/**
 * Pin de un anuncio bajo demanda.
 *  - Con coordenadas guardadas: se devuelven tal cual.
 *  - Calle CON número: Nominatim; solo se guarda si el resultado trae número de
 *    portal (precision 'approximate'). El enlazador une por coordenadas a ≤100 m,
 *    así que NUNCA se guardan puntos de calle sin número ni centros de zona.
 *  - Solo zona/calle sin número: se devuelve el punto para pintarlo (precision
 *    'zone'), sin guardarlo.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role ?? "", "particulares", "view")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: row, error } = await admin
    .from("particulares")
    .select("id, address, zone, latitude, longitude, location_precision")
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!row) return Response.json({ error: "Anuncio no encontrado" }, { status: 404 });

  if (typeof row.latitude === "number" && typeof row.longitude === "number") {
    return Response.json({
      lat: row.latitude,
      lng: row.longitude,
      precision: row.location_precision === "exact" ? "exact" : "approximate",
      saved: true,
    });
  }

  const address = (row.address ?? "").trim();
  const zone = (row.zone ?? "").split("/").pop()?.replace(/-/g, " ").trim() ?? "";
  const withNumber = !!address && /\d/.test(address);
  const q = [address, zone, "Madrid", "España"].filter(Boolean).join(", ");
  if (!address && !zone) return Response.json({ lat: null, lng: null, precision: null });

  const hit = await nominatimLookup(q);
  if (!hit) return Response.json({ lat: null, lng: null, precision: null });

  if (withNumber && hit.hasHouseNumber) {
    await admin
      .from("particulares")
      .update({
        latitude: hit.lat,
        longitude: hit.lng,
        location_precision: "approximate",
        geocoded_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("latitude", null);
    return Response.json({ lat: hit.lat, lng: hit.lng, precision: "approximate", saved: true });
  }
  return Response.json({ lat: hit.lat, lng: hit.lng, precision: "zone", saved: false });
}
