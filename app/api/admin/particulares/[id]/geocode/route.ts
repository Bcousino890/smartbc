import "server-only";
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { nominatimLookup } from "@/lib/geo/nominatim-queue";

// Idealista guarda el TÍTULO del anuncio como dirección («Alquiler de piso en Calle
// de Velázquez, 113»): hay que quitar tipo y operación o Nominatim no encuentra nada.
const TYPE_PREFIX =
  /^(?:(?:alquiler|venta)\s+de\s+)?(?:piso|apartamento|ático|atico|chalet|casa|dúplex|duplex|estudio|loft|local|finca|flat|apartment|house|studio|penthouse|villa)(?:\s*\/\s*(?:apartment|piso))?(?:\s+(?:en|for)\s+(?:venta|alquiler|sale|rent))?\s+(?:en|in)\s+/i;

/**
 * Pin de un anuncio bajo demanda.
 *  - Con coordenadas guardadas: se devuelven tal cual.
 *  - Calle CON número: Nominatim; solo se guarda si el resultado trae número de
 *    portal (precision 'approximate'). El enlazador une por coordenadas a ≤100 m,
 *    así que NUNCA se guardan puntos de calle sin número ni centros de zona.
 *  - Solo zona/calle sin número: se devuelve el punto para pintarlo (precision
 *    'zone'), sin guardarlo.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  // `?estimate=1`: el punto que sale de la DIRECCIÓN, aunque ya haya pin guardado y sin guardarlo.
  // Lo usa la ficha cuando el pin del portal es aproximado, para enseñar los dos puntos.
  const estimate = req.nextUrl.searchParams.get("estimate") === "1";

  if (!estimate && typeof row.latitude === "number" && typeof row.longitude === "number") {
    return Response.json({
      lat: row.latitude,
      lng: row.longitude,
      precision: row.location_precision === "exact" ? "exact" : "approximate",
      saved: true,
    });
  }

  const address = (row.address ?? "").replace(TYPE_PREFIX, "").trim();
  const zone = (row.zone ?? "").split("/").pop()?.replace(/-/g, " ").trim() ?? "";
  const withNumber = !!address && /\d/.test(address);
  const q = [address, zone, "Madrid", "España"].filter(Boolean).join(", ");
  if (!address && !zone) return Response.json({ lat: null, lng: null, precision: null });

  const hit = await nominatimLookup(q);
  if (!hit) return Response.json({ lat: null, lng: null, precision: null });

  if (estimate) {
    return Response.json({
      lat: hit.lat,
      lng: hit.lng,
      precision: withNumber && hit.hasHouseNumber ? "approximate" : "zone",
      saved: false,
    });
  }

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
