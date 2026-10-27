import "server-only";
import { createAdminClient } from "../admin";
import { isPointInAnyPolygon, type ZonePolygon } from "@/lib/zone-polygon";
import { rowToMapPin, type MapPin } from "@/lib/captaciones-map/pins";

const MAX_PINS = 2000;
const BATCH = 1000;

const COLUMNS =
  "id, latitude, longitude, price, operation, bedrooms, square_meters, title, address, zone, cover_url, portal, source_url, detected_at, advertiser_type, price_drop_pct";

export type ParticularesMapArgs = {
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  polygons: ZonePolygon[];
  operation?: "rent" | "sale";
  advertiser?: "particular" | "all";
  showRetired?: boolean;
};

/**
 * Pines del mapa de captaciones: columnas mínimas (sin teléfono ni
 * propietario), dentro del bbox, tope de 2000. Con polígonos se recorta
 * exacto en Node (no hay PostGIS). Lanza si la BD falla.
 */
export async function getParticularesMapPins(
  args: ParticularesMapArgs,
): Promise<{ pins: MapPin[]; truncated: boolean; withoutLocation: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const { bbox, polygons, operation, advertiser, showRetired } = args;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyCommon = (q: any) => {
    q = q.eq("is_active", !showRetired);
    if (operation) q = q.eq("operation", operation);
    if (advertiser === "particular") q = q.eq("advertiser_type", "particular");
    return q;
  };

  // Pedimos MAX_PINS + 1 filas para detectar truncado; paginamos de 1000 en 1000.
  const limit = MAX_PINS + 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  for (let from = 0; rows.length < limit; from += BATCH) {
    const to = Math.min(from + BATCH, limit) - 1;
    const res = await applyCommon(supabase.from("particulares").select(COLUMNS))
      .is("duplicate_of", null)
      .is("taken_down_at", null)
      .is("fraud_status", null)
      .gt("price", 0)
      .gte("latitude", bbox.minLat)
      .lte("latitude", bbox.maxLat)
      .gte("longitude", bbox.minLng)
      .lte("longitude", bbox.maxLng)
      .order("id", { ascending: true })
      .range(from, to);
    if (res.error) throw new Error(`particulares map: ${res.error.message}`);
    const batch = res.data ?? [];
    rows.push(...batch);
    if (batch.length < to - from + 1) break;
  }

  const pins: MapPin[] = [];
  for (const r of rows) {
    const pin = rowToMapPin(r);
    if (!pin) continue;
    if (polygons.length > 0 && !isPointInAnyPolygon([pin.lng, pin.lat], polygons)) continue;
    pins.push(pin);
  }
  // Truncado = había más filas que el tope (antes del recorte por polígono).
  const truncated = rows.length > MAX_PINS;
  if (pins.length > MAX_PINS) pins.length = MAX_PINS;

  const head = await applyCommon(
    supabase.from("particulares").select("id", { count: "exact", head: true }),
  ).is("latitude", null);
  if (head.error) throw new Error(`particulares map (sin ubicación): ${head.error.message}`);

  return { pins, truncated, withoutLocation: head.count ?? 0 };
}
