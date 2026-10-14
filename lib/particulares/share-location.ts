import { addressLine } from "./address-title";

export type LocationPoint = { lat: number; lng: number; precision: "exact" | "approximate" | "zone" };
export type ShareLocation = { point: LocationPoint | null; estimate: LocationPoint | null };
type Input = {
  latitude?: number | null;
  longitude?: number | null;
  location_precision?: string | null;
  address?: string | null;
  zone?: string | null;
};
type Lookup = (query: string) => Promise<{ lat: number; lng: number; hasHouseNumber: boolean } | null>;

/** Resolve only map points; private address and CRM data never enter the public payload. */
export async function resolveShareLocation(row: Input, lookup: Lookup): Promise<ShareLocation> {
  const valid = (lat: unknown, lng: unknown) =>
    typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
  const point: LocationPoint | null = valid(row.latitude, row.longitude)
    ? { lat: row.latitude!, lng: row.longitude!, precision: row.location_precision === "exact" ? "exact" : "approximate" }
    : null;
  if (point?.precision === "exact") return { point, estimate: null };
  const address = addressLine(row.address);
  const zone = (row.zone ?? "").split("/").pop()?.replace(/-/g, " ").trim() ?? "";
  if (!address && !zone) return { point, estimate: null };
  const query = [address, zone, "Madrid", "España"].filter(Boolean).join(", ");
  const hit = await lookup(query).catch(() => null);
  const estimate: LocationPoint | null = hit && valid(hit.lat, hit.lng)
    ? { lat: hit.lat, lng: hit.lng, precision: /\d/.test(address) && hit.hasHouseNumber ? "approximate" : "zone" }
    : null;
  return point ? { point, estimate } : { point: estimate, estimate: null };
}
