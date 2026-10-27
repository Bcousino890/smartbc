import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/guard";
import { decodeZonePolygons } from "@/lib/zone-polygon";
import { getParticularesMapPins } from "@/lib/db/queries/particulares-map";

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
    const op = sp.get("operation");
    const operation = op === "rent" || op === "sale" ? op : undefined;
    const advertiser = sp.get("advertiser") === "all" ? "all" : "particular";
    const polygons = decodeZonePolygons(sp.get("zonePoly"));

    const result = await getParticularesMapPins({ bbox, polygons, operation, advertiser });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Error in particulares map endpoint:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
