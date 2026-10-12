#!/usr/bin/env node
// ============================================================================
// Contornos de las SUBZONAS / barrios de los municipios (no de Madrid capital,
// que ya los trae generar.mjs) para el mapa del diálogo «Configuración de scrapers».
//
//   node scripts/zonas-mapa/subzonas.mjs [--cache <carpeta>] [--solo <municipio>] [--sin-bd]
//
// Para cada zona de scraper_zones que cuelga de un municipio (p. ej. «Prado de
// Somosaguas» dentro de Pozuelo de Alarcón) se busca su polígono en OpenStreetMap
// con Nominatim (polygon_geojson, ODbL; sin claves, un máximo de 1 petición por
// segundo y User-Agent identificable, como pide la política de uso). Solo se
// acepta un resultado si: es un polígono (límite administrativo, «place» o uso
// residencial/industrial/comercial), su nombre coincide con el de la zona, su
// centro cae dentro del municipio y no es casi todo el municipio.
// Lo que no tenga contorno sigue como marcador o en la lista: no se inventa nada.
//
// Escribe en lib/scrapers/zone-map/geo.json (contornos de tipo "s", simplificados,
// con p = contorno del municipio) y actualiza zone-match.json (zona → contorno).
// Es idempotente: vuelve a leer geo.json y reemplaza los "s" anteriores.
// Datos © colaboradores de OpenStreetMap (ODbL, https://www.openstreetmap.org/copyright).
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(ROOT, "lib/scrapers/zone-map");
const UA = "SmartBC-CRM-zonas/1.0 (admin@zinto.app; mapa de zonas del CRM)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const cacheDir = opt("--cache");
const only = opt("--solo");
const useDb = !args.includes("--sin-bd");
const TOL = 0.00006; // ~6 m: suficiente para barrios pequeños

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const stripParen = (s) => s.replace(/\s*\(.*\)\s*$/, "").trim();

// Nombres del portal que OSM llama distinto (clave = slug de la zona sin paréntesis).
const ALIAS = {
  "prado-de-somoaguas": "prado de somosaguas",
};

// ── Geometría (mismo criterio que generar.mjs) ──────────────────────────────
function dp(points, tol) {
  if (points.length < 3) return points;
  const f = points[0];
  const l = points[points.length - 1];
  if (f[0] === l[0] && f[1] === l[1] && points.length > 4) {
    let far = 1;
    let best = -1;
    for (let i = 1; i < points.length - 1; i++) {
      const d = Math.hypot(points[i][0] - f[0], points[i][1] - f[1]);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    return dp(points.slice(0, far + 1), tol).concat(dp(points.slice(far), tol).slice(1));
  }
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0;
    let idx = -1;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
const area = (r) => Math.abs(r.reduce((s, p, i) => s + (p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1]), 0) / 2);
function centroid(rings) {
  const r = rings.slice().sort((a, b) => area(b) - area(a))[0];
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i];
    const [x1, y1] = r[(i + 1) % r.length];
    const f = x0 * y1 - x1 * y0;
    a2 += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  return a2 ? [cx / (3 * a2), cy / (3 * a2)] : r[0];
}
function inRing(pt, r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
/** Anillos exteriores de un GeoJSON Polygon/MultiPolygon (los agujeros se descartan: basta para pintar y tocar). */
const outerRings = (g) => (g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : []);
const ringsOfGeo = (f) => f.r.map((flat) => Array.from({ length: flat.length / 2 }, (_, i) => [flat[2 * i] / 1e4, flat[2 * i + 1] / 1e4]));
const inGeo = (pt, rings) => rings.some((r) => inRing(pt, r));

// ── Nominatim ───────────────────────────────────────────────────────────────
let last = 0;
async function nominatim(name, q, box) {
  const file = cacheDir ? path.join(cacheDir, `nominatim-${name}.json`) : null;
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const url = new URL(NOMINATIM);
  const params = { q, format: "jsonv2", polygon_geojson: "1", polygon_threshold: "0.00008", limit: "8", countrycodes: "es", addressdetails: "0", viewbox: `${box[0]},${box[3]},${box[2]},${box[1]}`, bounded: "1" };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let intento = 1; intento <= 4; intento++) {
    const wait = 1300 - (Date.now() - last);
    if (wait > 0) await sleep(wait); // ≤ 1 petición por segundo
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "es" }, signal: AbortSignal.timeout(30_000) });
      if (res.ok) {
        const data = await res.json();
        if (file) {
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(file, JSON.stringify(data));
        }
        return data;
      }
      console.error(`[${name}] intento ${intento}: HTTP ${res.status}`);
    } catch (e) {
      console.error(`[${name}] intento ${intento}: ${e.message}`);
    }
    await sleep(5000 * intento);
  }
  return [];
}

const KIND_RANK = (r) => {
  if (r.category === "boundary" && (r.type === "administrative" || r.type === "census" || r.type === "political")) return 0;
  if (r.category === "place") return 1;
  if (r.category === "landuse" && ["residential", "industrial", "commercial", "retail"].includes(r.type)) return 2;
  return 9;
};

function nameOk(osmName, wanted) {
  const a = slug(osmName ?? "");
  const b = slug(wanted);
  if (!a || !b) return false;
  if (a === b) return true;
  // «Urbanización Monteclaro» ↔ «Monteclaro»; «Somosaguas "A"» ↔ «Somosaguas»
  const strip = (s) => s.replace(/^(urbanizacion|barrio|zona|colonia|residencial)-/, "").replace(/-(a|b|c|norte|sur)$/, "");
  const sa = strip(a);
  const sb = strip(b);
  return sa === sb || (sb.length >= 6 && (sa.includes(sb) || sb.includes(sa)) && Math.min(sa.length, sb.length) / Math.max(sa.length, sb.length) >= 0.6);
}

function psql(sql) {
  const out = execFileSync("docker", ["exec", "supabase-db", "psql", "-U", "postgres", "-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 1 << 28 });
  return out.split("\n").filter(Boolean).map((l) => l.split("\t"));
}

async function main() {
  const geoFile = path.join(OUT, "geo.json");
  const matchFile = path.join(OUT, "zone-match.json");
  const geo = JSON.parse(fs.readFileSync(geoFile, "utf8"));
  const match = JSON.parse(fs.readFileSync(matchFile, "utf8"));
  geo.features = geo.features.filter((f) => f.k !== "s");
  for (const p of Object.keys(match.zones)) for (const [k, v] of Object.entries(match.zones[p])) if (v.s) delete match.zones[p][k];

  if (!useDb) throw new Error("subzonas.mjs necesita la base de datos (scraper_zones)");
  const zones = psql("select portal,zone_key,coalesce(parent_key,''),label from scraper_zones").map(([portal, zone_key, parent_key, label]) => ({ portal, zone_key, parent_key, label }));
  const byKey = new Map(zones.map((z) => [`${z.portal}|${z.zone_key}`, z]));
  const byId = new Map(geo.features.map((f) => [f.id, f]));
  const isCapitalKey = (k) => /^(madrid|madrid-capital)\//.test(k) && !/^madrid\/(zona-|corredor-)/.test(k);

  const found = new Map(); // id → feature
  const stats = { buscadas: 0, con_contorno: 0, sin: 0 };
  const noPoly = [];

  const targets = zones.filter((z) => z.zone_key.includes("/") && !isCapitalKey(z.zone_key) && !/^madrid\/(zona-|corredor-)/.test(z.zone_key));
  const parents = new Set(zones.map((z) => `${z.portal}|${z.parent_key}`));
  for (const z of targets) {
    // Una zona que agrupa a otras («Urbanizaciones», «Zona Prado de Somosaguas la Finca») no es un lugar con
    // contorno propio: se queda con su marcador o en la lista, y sus hijas sí se buscan.
    if (parents.has(`${z.portal}|${z.zone_key}`)) continue;
    const segs = z.zone_key.split("/");
    // municipio raíz: la zona de primer tramo (en Idealista con sufijo «-madrid»)
    const rootKey = [segs[0], `${segs[0]}-madrid`].find((k) => byKey.has(`${z.portal}|${k}`));
    const rootZone = rootKey ? byKey.get(`${z.portal}|${rootKey}`) : null;
    const rootPoly = rootKey ? match.zones[z.portal][rootKey]?.p : null;
    const muni = rootPoly ? byId.get(rootPoly) : null;
    if (!rootZone || !muni || muni.k !== "m") continue;
    if (only && slug(muni.n) !== slug(only)) continue;

    const base = stripParen(z.label);
    const wanted = ALIAS[slug(base)] ?? base;
    const muniRings = ringsOfGeo(muni);
    const muniArea = muniRings.reduce((s, r) => s + area(r), 0);
    const lons = muniRings.flat().map((p) => p[0]);
    const lats = muniRings.flat().map((p) => p[1]);
    const box = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];

    stats.buscadas++;
    const res = await nominatim(`${z.portal}-${slug(z.zone_key)}`, `${wanted}, ${muni.n}`, box);
    const cands = res
      .filter((r) => r.geojson && /Polygon/.test(r.geojson.type) && KIND_RANK(r) < 9 && nameOk(r.name || r.display_name.split(",")[0], wanted))
      .map((r) => ({ r, rings: outerRings(r.geojson).filter((x) => x.length >= 4) }))
      .filter(({ rings }) => rings.length)
      .filter(({ rings }) => {
        const a = rings.reduce((s, x) => s + area(x), 0);
        return a > 2e-8 && a < muniArea * 0.5 && inGeo(centroid(rings), muniRings);
      })
      .sort((a, b) => KIND_RANK(a.r) - KIND_RANK(b.r) || b.r.importance - a.r.importance);
    const best = cands[0];
    if (!best) {
      stats.sin++;
      noPoly.push(`${z.portal}:${z.zone_key}`);
      continue;
    }
    const id = `s${best.r.osm_type[0]}${best.r.osm_id}`;
    if (!found.has(id)) {
      const rings = best.rings.map((r) => dp(r, TOL)).filter((r) => r.length >= 4 && area(r) > 1e-9);
      if (!rings.length) {
        stats.sin++;
        noPoly.push(`${z.portal}:${z.zone_key}`);
        continue;
      }
      const c = centroid(rings);
      found.set(id, {
        id,
        n: base,
        k: "s",
        p: muni.id,
        c: c.map((n) => Math.round(n * 1e4)),
        r: rings.map((ring) => ring.flatMap((p) => [Math.round(p[0] * 1e4), Math.round(p[1] * 1e4)])),
      });
    }
    match.zones[z.portal][z.zone_key] = { p: id };
    stats.con_contorno++;
    console.log(`${z.portal}:${z.zone_key} → ${id} (${best.r.category}/${best.r.type}: ${best.r.name})`);
  }

  geo.features.push(...found.values());
  geo.attribution = "© colaboradores de OpenStreetMap (ODbL) · contornos simplificados";
  fs.writeFileSync(geoFile, JSON.stringify(geo));
  match.subzones = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(matchFile, JSON.stringify(match));
  console.log("subzonas:", stats, "· contornos únicos:", found.size, "· geo.json", (fs.statSync(geoFile).size / 1024).toFixed(0), "KB");
  console.log("sin contorno (se quedan como marcador/lista):", noPoly.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
