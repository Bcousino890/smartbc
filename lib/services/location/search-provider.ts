import "server-only";

// Proveedor de búsqueda de lugares. SOLO se ejecuta en el servidor.
//
// ⚠️ POLÍTICA DE PROVEEDOR — leer antes de "mejorar" esto:
// El Nominatim público NO es infraestructura de autocompletado. Su política
// de uso exige: máximo ~1 petición/segundo por aplicación, User-Agent
// identificable, caché de resultados y uso moderado disparado por el usuario.
// Por eso:
//   · la búsqueda externa solo se lanza con Enter o "Buscar", NUNCA por tecla;
//   · este módulo impone un ritmo GLOBAL de 1 req/s (cola en memoria — asume
//     el PM2 de un solo proceso que ya asumen los limitadores de Idealista);
//   · cachea 24h por consulta normalizada + celda de sesgo;
//   · deduplica consultas idénticas concurrentes;
//   · si algún día hace falta autocompletado global en vivo, NO se estira
//     esto: se migra el proveedor (Photon self-hosted encaja y esta
//     abstracción existe exactamente para eso).
//
// https://operations.osmfoundation.org/policies/nominatim/

import { categoryFromOsm, foldText, type SearchPlaceDto } from "./search";

export type SearchBias = { lat: number; lng: number };

/** Contrato del proveedor. La UI y la ruta API solo conocen esto. */
export type LocationSearchProvider = {
  search(query: string, bias: SearchBias): Promise<SearchPlaceDto[]>;
};

const USER_AGENT = "smartbc-portal/1.0 (contacto@bcousinoprop.com)";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MAX_RESULTS = 6;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 1100; // 1 req/s con margen

// ── Ritmo global ──
let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  // La cola nunca se rompe por un fallo individual.
  queue = run.catch(() => undefined);
  return run;
}

// ── Caché + dedupe ──
const cache = new Map<string, { at: number; results: SearchPlaceDto[] }>();
const inflight = new Map<string, Promise<SearchPlaceDto[]>>();

/** La celda de sesgo redondea a ~1km: dos viviendas de la misma manzana
 *  comparten caché sin que la clave lleve la coordenada exacta. */
function cacheKey(query: string, bias: SearchBias): string {
  return `${foldText(query)}|${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}`;
}

type NominatimRow = {
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  class?: string;
  type?: string;
  address?: Record<string, string>;
};

function toDto(row: NominatimRow): SearchPlaceDto | null {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const name = row.name || row.display_name?.split(",")[0]?.trim();
  if (!name) return null;
  const a = row.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(" ");
  const locality = a.city || a.town || a.village || a.suburb || null;
  const address = [street || null, locality].filter(Boolean).join(", ") || null;
  return {
    // El id conserva el tipo OSM para poder enlazar a la página correcta
    // (node/way/relation) desde la ficha.
    id: `search:${row.osm_type ?? "node"}/${row.osm_id ?? `${lat},${lng}`}`,
    name,
    category: categoryFromOsm(row.class ?? "", row.type ?? ""),
    lat,
    lng,
    address,
  };
}

async function nominatimSearch(query: string, bias: SearchBias): Promise<SearchPlaceDto[]> {
  // Sesgo hacia la vivienda: un viewbox de ~10km alrededor SIN `bounded`,
  // para que lo cercano gane sin impedir una búsqueda razonable más amplia
  // (§12: preferir cerca, no fabricar ni encerrar).
  const d = 0.09;
  const viewbox = [bias.lng - d, bias.lat + d, bias.lng + d, bias.lat - d].join(",");
  const url =
    `${NOMINATIM_URL}?q=${encodeURIComponent(query)}` +
    `&format=jsonv2&limit=${MAX_RESULTS}&addressdetails=1&accept-language=es` +
    `&viewbox=${viewbox}&countrycodes=es`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`nominatim_${res.status}`);
  const rows = (await res.json()) as NominatimRow[];
  const out: SearchPlaceDto[] = [];
  for (const row of rows) {
    const dto = toDto(row);
    if (dto) out.push(dto);
  }
  return out.slice(0, MAX_RESULTS);
}

export const nominatimProvider: LocationSearchProvider = {
  async search(query, bias) {
    const key = cacheKey(query, bias);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

    const running = inflight.get(key);
    if (running) return running;

    const promise = throttled(() => nominatimSearch(query, bias))
      .then((results) => {
        cache.set(key, { at: Date.now(), results });
        // La caché no crece sin límite: se poda lo más viejo.
        if (cache.size > 500) {
          const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
          if (oldest) cache.delete(oldest[0]);
        }
        return results;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  },
};

/** El proveedor activo. Cambiar a Photon = cambiar esta línea y nada más. */
export const locationSearchProvider: LocationSearchProvider = nominatimProvider;
