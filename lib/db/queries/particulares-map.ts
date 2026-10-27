import "server-only";
import { createAdminClient } from "../admin";
import { isPointInAnyPolygon, type ZonePolygon } from "@/lib/zone-polygon";
import { capPins, rowToMapPin, type MapPin } from "@/lib/captaciones-map/pins";

const MAX_PINS = 2000;
const BATCH = 1000;
const SCAN_CAP = 20000;

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

  // Pedimos hasta MAX_PINS + 1 pines YA recortados para detectar truncado.
  // Sin polígonos basta con 2001 filas; con polígonos se sigue paginando
  // (más nuevos primero) hasta reunir 2001 pines dentro o agotar filas, con
  // un techo de escaneo para no recorrer toda la tabla.
  // Nota: no hay índice sobre particulares.detected_at (supabase/migrations);
  // el orden cuesta un sort sobre el bbox filtrado, aceptable con ~22 000 activos.
  const limit = MAX_PINS + 1;
  const scanCap = polygons.length > 0 ? SCAN_CAP : limit;
  const collected: MapPin[] = [];
  let scanned = 0;
  while (collected.length < limit && scanned < scanCap) {
    const size = Math.min(BATCH, scanCap - scanned);
    const res = await applyCommon(supabase.from("particulares").select(COLUMNS))
      .is("duplicate_of", null)
      .is("taken_down_at", null)
      .is("fraud_status", null)
      .gt("price", 0)
      .gte("latitude", bbox.minLat)
      .lte("latitude", bbox.maxLat)
      .gte("longitude", bbox.minLng)
      .lte("longitude", bbox.maxLng)
      .order("detected_at", { ascending: false })
      .order("id", { ascending: true })
      .range(scanned, scanned + size - 1);
    if (res.error) throw new Error(`particulares map: ${res.error.message}`);
    const batch = res.data ?? [];
    scanned += batch.length;
    for (const r of batch) {
      const pin = rowToMapPin(r);
      if (!pin) continue;
      if (polygons.length > 0 && !isPointInAnyPolygon([pin.lng, pin.lat], polygons)) continue;
      collected.push(pin);
    }
    if (batch.length < size) break;
  }
  const { pins, truncated } = capPins(collected, MAX_PINS);

  const head = await applyCommon(
    supabase.from("particulares").select("id", { count: "exact", head: true }),
  ).is("latitude", null);
  if (head.error) throw new Error(`particulares map (sin ubicación): ${head.error.message}`);

  return { pins, truncated, withoutLocation: head.count ?? 0 };
}

const IDS_CHUNK = 100;

/**
 * Relee pines por id (para captar en lote sin fiarse de lo que mande el
 * cliente). Mismas columnas y mismos filtros de "anuncio vivo" que el mapa:
 * un id retirado, duplicado, dado de baja o fraudulento simplemente no
 * aparece. Trozos de 100 ids para no pasarse de longitud de URL. Lanza si la
 * BD falla.
 */
export async function getParticularesMapPinsByIds(ids: string[]): Promise<MapPin[]> {
  const unique = [...new Set(ids)].filter((i) => typeof i === "string" && i.length > 0);
  if (unique.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;
  const out: MapPin[] = [];
  for (let i = 0; i < unique.length; i += IDS_CHUNK) {
    const chunk = unique.slice(i, i + IDS_CHUNK);
    const res = await supabase
      .from("particulares")
      .select(COLUMNS)
      .in("id", chunk)
      .eq("is_active", true)
      .is("duplicate_of", null)
      .is("taken_down_at", null)
      .is("fraud_status", null);
    if (res.error) throw new Error(`particulares por ids: ${res.error.message}`);
    for (const r of res.data ?? []) {
      const pin = rowToMapPin(r);
      if (pin) out.push(pin);
    }
  }
  return out;
}
