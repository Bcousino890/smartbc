import "server-only";

// Nominatim exige ≤1 petición/s y User-Agent identificable. Cola en proceso +
// caché en memoria (las zonas se repiten mucho).
const USER_AGENT = "smartbc-portal/1.0 (contacto@bcousinoprop.com)";
export type NominatimHit = {
  lat: number;
  lng: number;
  /** El resultado trae número de portal (house_number). */
  hasHouseNumber: boolean;
};

const cache = new Map<string, NominatimHit | null>();
let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

export function nominatimLookup(query: string): Promise<NominatimHit | null> {
  const key = query.toLowerCase();
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  const run = chain.then(async () => {
    const wait = lastAt + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1&countrycodes=es&accept-language=es`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null; // no cachear fallos transitorios
      const data = (await res.json()) as Array<{ lat: string; lon: string; address?: { house_number?: string } }>;
      const h = data[0];
      const lat = h ? Number(h.lat) : NaN;
      const lng = h ? Number(h.lon) : NaN;
      const hit: NominatimHit | null =
        h && Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng, hasHouseNumber: !!h.address?.house_number }
          : null;
      if (cache.size > 2000) cache.clear();
      cache.set(key, hit);
      return hit;
    } catch {
      return null;
    }
  });
  chain = run.catch(() => undefined);
  return run;
}
