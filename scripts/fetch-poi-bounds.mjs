// SmartLink 2.0 · envolvente real de los POIs que no son un punto.
//
// El Retiro, la Casa de Campo o el Club de Campo se geocodifican al CENTROIDE
// de su polígono. Medir contra ese punto da tiempos falsos: una vivienda
// pegada a la verja sur del Retiro salía "≈ 18 min a pie" porque el centroide
// está a un kilómetro y medio hacia dentro. Se descarga el bounding box de
// cada way/relation en OSM y la distancia se mide contra el RECTÁNGULO
// (cero si el punto está dentro), no contra su centro.
//
// Los POIs que son un nodo (estaciones, museos pequeños) no llevan bbox y
// siguen midiéndose como punto.
//
// Uso: node scripts/fetch-poi-bounds.mjs   (reescribe scripts/out/neighborhood-pois.json)

import { readFileSync, writeFileSync } from "node:fs";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const file = "scripts/out/neighborhood-pois.json";
const data = JSON.parse(readFileSync(file, "utf8"));

const shapes = [...new Set(data.resolved.map((r) => r.osm))].filter((o) => !o.startsWith("node/"));
const ways = shapes.filter((s) => s.startsWith("way/")).map((s) => s.split("/")[1]);
const rels = shapes.filter((s) => s.startsWith("relation/")).map((s) => s.split("/")[1]);

const query = `[out:json][timeout:120];
(
  way(id:${ways.join(",")});
  relation(id:${rels.join(",")});
);
out bb;`;

const res = await fetch(OVERPASS_URL, {
  method: "POST",
  body: query,
  headers: { "User-Agent": "smartbc-portal/1.0 (contacto@bcousinoprop.com)" },
  signal: AbortSignal.timeout(180000),
});
if (!res.ok) throw new Error(`Overpass ${res.status}`);
const json = await res.json();

const bounds = new Map();
for (const el of json.elements ?? []) {
  if (!el.bounds) continue;
  bounds.set(`${el.type}/${el.id}`, {
    minLat: el.bounds.minlat, minLng: el.bounds.minlon,
    maxLat: el.bounds.maxlat, maxLng: el.bounds.maxlon,
  });
}

const KM_PER_DEG_LAT = 111.32;
let withBox = 0;
for (const poi of data.resolved) {
  const b = bounds.get(poi.osm);
  if (!b) continue;
  // Sólo tiene sentido para extensiones apreciables. Por debajo de ~120 m el
  // rectángulo y el centroide dan lo mismo y añadir el dato es ruido.
  const hKm = (b.maxLat - b.minLat) * KM_PER_DEG_LAT;
  const wKm = (b.maxLng - b.minLng) * KM_PER_DEG_LAT * Math.cos((poi.lat * Math.PI) / 180);
  if (Math.max(hKm, wKm) < 0.12) continue;
  poi.bounds = b;
  poi.extentKm = Number(Math.max(hKm, wKm).toFixed(2));
  withBox++;
}

writeFileSync(file, JSON.stringify(data, null, 2));

const uniq = new Map();
for (const p of data.resolved) if (p.bounds) uniq.set(p.name, p.extentKm);
console.log(`[bounds] ${withBox} filas con envolvente · ${uniq.size} POIs distintos`);
for (const [name, km] of [...uniq].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(km).padStart(6)} km  ${name}`);
}
