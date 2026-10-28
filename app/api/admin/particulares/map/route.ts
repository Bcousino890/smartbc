import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/guard";
import { decodeZonePolygons } from "@/lib/zone-polygon";
import { getParticularesMapPins } from "@/lib/db/queries/particulares-map";
import { getParticularesZoneCounts } from "@/lib/db/queries/particulares";
import { parseParticularesParams, resolveZoneNames } from "@/lib/particulares/filters-from-params";

export const dynamic = "force-dynamic";

/** `minLng,minLat,maxLng,maxLat` → objeto, o null si no es válido. */
function parseBbox(raw: string | null) {
  if (!raw) return null;
  const parts = raw.split(",").map((s) => (s.trim() === "" ? NaN : Number(s)));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  if (Math.abs(minLng) > 180 || Math.abs(maxLng) > 180) return null;
  if (Math.abs(minLat) > 90 || Math.abs(maxLat) > 90) return null;
  return { minLng, minLat, maxLng, maxLat };
}

/**
 * Pines del mapa de captaciones. Los anuncios llevan datos de propietario en
 * la tabla, así que exige `particulares.view` (el payload no los incluye).
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requirePermission("particulares", "view");
    if (!gate.ok) return gate.response;

    const sp = req.nextUrl.searchParams;
    const bbox = parseBbox(sp.get("bbox"));
    if (!bbox) {
      return NextResponse.json({ error: "bbox inválido (minLng,minLat,maxLng,maxLat)" }, { status: 400 });
    }
    const polygons = decodeZonePolygons(sp.get("zonePoly"));

    // Los filtros de la lista (precio, dormitorios, zona, bajadas, búsqueda…) viajan aquí con los mismos nombres
    // que en la URL de la página y se leen con la misma función: el mapa enseña lo que enseñaría la lista.
    const parsed = parseParticularesParams(Object.fromEntries(sp.entries()), gate.profile.id);
    let zoneNames: string[] | undefined;
    if (parsed.zoneSelections.length) {
      const zc = await getParticularesZoneCounts(parsed.showRetired, parsed.advertiserFilter, parsed.showOutOfZone);
      zoneNames = resolveZoneNames(parsed.zoneSelections, zc.zoneGroups);
    }

    const result = await getParticularesMapPins({
      bbox,
      polygons,
      showRetired: parsed.showRetired,
      filters: { ...parsed.filters, zoneNames },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Error in particulares map endpoint:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
