// SmartLink 2.0 · resuelve y VALIDA las coordenadas de los POIs curados.
//
// Ninguna coordenada del catálogo de barrios se escribe a mano: se pide a
// Nominatim (OpenStreetMap) y sólo se acepta si cae dentro del radio máximo
// declarado para su barrio. Un POI mal resuelto produciría un "≈ N min a pie"
// falso en la ficha pública, que es exactamente el defecto que no toleramos.
//
// Salida: scripts/out/neighborhood-pois.json (consumido por el generador SQL).
// Uso: node scripts/geocode-neighborhood-pois.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { NEIGHBORHOODS } from "./neighborhood-poi-catalog.mjs";

const USER_AGENT = "smartbc-portal/1.0 (contacto@bcousinoprop.com)";
const URL_BASE = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SLEEP_MS = 1200; // política de uso de Nominatim: ≤1 req/s

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Las estaciones NO se buscan por texto libre: la búsqueda difusa de Nominatim
// no las encuentra ("Lista, Metro de Madrid" → 0 resultados) y, cuando las
// encuentra, puede devolver la calle homónima en vez del andén. Se descargan
// una vez desde Overpass y se casan por nombre EXACTO del nodo OSM.
async function loadStations() {
  const query = `[out:json][timeout:90];
area["name"="Comunidad de Madrid"]["admin_level"="4"]->.a;
(
  node(area.a)["railway"="station"];
  node(area.a)["public_transport"="station"];
);
out body;`;
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: query,
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = await res.json();
  const map = new Map();
  for (const el of data.elements ?? []) {
    const name = el.tags?.name;
    if (!name || el.lat == null) continue;
    // Metro gana a Cercanías cuando comparten nombre: es el dato que espera
    // quien lee "Metro X" en la ficha.
    const isSubway = el.tags.station === "subway" || el.tags.subway === "yes";
    const prev = map.get(name);
    if (prev && !isSubway) continue;
    map.set(name, { lat: el.lat, lng: el.lon, osm: `node/${el.id}` });
  }
  console.log(`[overpass] ${map.size} estaciones cargadas`);
  return map;
}

const STATIONS = await loadStations();

function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const cache = new Map();

async function geocode(query) {
  if (cache.has(query)) return cache.get(query);
  if (query.startsWith("station:")) {
    const hit = STATIONS.get(query.slice("station:".length)) ?? null;
    cache.set(query, hit);
    return hit;
  }
  const url = `${URL_BASE}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=es&accept-language=es`;
  let out = null;
  for (let attempt = 0; attempt < 3 && !out; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        const hit = data[0];
        if (hit) {
          const lat = Number(hit.lat);
          const lng = Number(hit.lon);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            out = { lat, lng, osm: `${hit.osm_type ?? "?"}/${hit.osm_id ?? "?"}` };
          }
        }
      }
    } catch {
      /* reintento */
    }
    await sleep(SLEEP_MS);
  }
  cache.set(query, out);
  return out;
}

const resolved = [];
const rejected = [];

for (const hood of NEIGHBORHOODS) {
  const maxKm = hood.maxKm ?? 3.2;
  for (const [name, category, query, priority, modes] of hood.pois) {
    const hit = await geocode(query);
    if (!hit) {
      rejected.push({ hood: hood.key, name, query, reason: "sin resultado en Nominatim" });
      console.log(`  ✗ ${hood.key} · ${name} — sin resultado`);
      continue;
    }
    const km = haversineKm(hood.center, hit);
    if (km > maxKm) {
      rejected.push({
        hood: hood.key, name, query,
        reason: `a ${km.toFixed(2)} km del centro del barrio (máx ${maxKm})`,
        got: hit,
      });
      console.log(`  ✗ ${hood.key} · ${name} — ${km.toFixed(2)} km (máx ${maxKm})`);
      continue;
    }
    resolved.push({
      hood: hood.key, name, category, priority, modes,
      lat: Number(hit.lat.toFixed(6)),
      lng: Number(hit.lng.toFixed(6)),
      km: Number(km.toFixed(2)),
      osm: hit.osm,
      query,
    });
    console.log(`  ✓ ${hood.key} · ${name} — ${km.toFixed(2)} km · ${hit.osm}`);
  }
}

// Un mismo POI compartido por varios barrios DEBE resolver a las mismas
// coordenadas; si no, la caché por query falló y el dato no es fiable.
const byName = new Map();
for (const p of resolved) {
  const prev = byName.get(p.query);
  if (prev && (prev.lat !== p.lat || prev.lng !== p.lng)) {
    throw new Error(`Coordenadas inconsistentes para "${p.query}"`);
  }
  byName.set(p.query, p);
}

mkdirSync("scripts/out", { recursive: true });
writeFileSync("scripts/out/neighborhood-pois.json", JSON.stringify({ resolved, rejected }, null, 2));

console.log(`\n[geocode] resueltos: ${resolved.length} · descartados: ${rejected.length}`);
const thin = NEIGHBORHOODS
  .map((h) => [h.key, resolved.filter((r) => r.hood === h.key).length])
  .filter(([, n]) => n < 4);
if (thin.length) {
  console.log(`[geocode] ⚠ barrios con menos de 4 POIs: ${thin.map(([k, n]) => `${k}(${n})`).join(", ")}`);
}
for (const r of rejected) console.log(`   descartado · ${r.hood}/${r.name}: ${r.reason}`);
