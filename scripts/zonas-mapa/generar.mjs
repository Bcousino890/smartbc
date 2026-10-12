#!/usr/bin/env node
// ============================================================================
// Genera los datos del mapa de zonas del diálogo «Configuración de scrapers».
//
//   node scripts/zonas-mapa/generar.mjs [--cache <carpeta>] [--sin-bd]
//
// 1) CONTORNOS (lib/scrapers/zone-map/geo.json): distritos y barrios de Madrid
//    capital y municipios de la Comunidad de Madrid, de OpenStreetMap vía la
//    Overpass API (consultas por id de relación/área, NO por nombre), simplificados
//    (Douglas-Peucker) para que pesen poco. Datos © colaboradores de OpenStreetMap,
//    licencia ODbL (https://www.openstreetmap.org/copyright).
//    Cortesía con Overpass: User-Agent identificable, una consulta pesada por
//    minuto y reintentos con calma. Con --cache se guardan/reutilizan las
//    respuestas en bruto (ahorra volver a pedirlas).
//
// 2) CASADO zona → contorno (lib/scrapers/zone-map/zone-match.json), en dos capas:
//      a) nombre normalizado + alias curados (ALIAS_*), acotado al distrito/municipio
//         del padre cuando se conoce;
//      b) voto por punto-en-polígono: con las coordenadas de `particulares` (campo
//         `zone`), el contorno donde cae la mayoría de los anuncios de esa zona.
//    Lo que no case por contorno pero tenga puntos se coloca en la MEDIANA de sus
//    puntos; el resto queda sin posición (la interfaz lo lista, nunca lo oculta).
//    Lee scraper_zones y particulares con `docker exec supabase-db psql` (usa
//    --sin-bd para solo regenerar contornos).
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(ROOT, "lib/scrapers/zone-map");
const UA = "SmartBC-CRM-zonas/1.0 (admin@zinto.app; mapa de zonas del CRM)";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const args = process.argv.slice(2);
const cacheDir = args.includes("--cache") ? args[args.indexOf("--cache") + 1] : null;
const useDb = !args.includes("--sin-bd");

// Relaciones de OpenStreetMap: municipio de Madrid y Comunidad de Madrid (el area de Overpass = 3600000000 + id).
const REL_MADRID = 5326784;
const REL_COMUNIDAD = 349055;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ── Overpass ────────────────────────────────────────────────────────────────
async function overpass(name, query) {
  const file = cacheDir ? path.join(cacheDir, `${name}.json`) : null;
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  for (let intento = 1; intento <= 6; intento++) {
    try {
      const res = await fetch(OVERPASS, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(300_000),
      });
      const text = await res.text();
      if (res.ok && text.startsWith("{")) {
        if (file) {
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(file, text);
        }
        await sleep(65_000); // máx. 1 consulta pesada por minuto
        return JSON.parse(text);
      }
      console.error(`[${name}] intento ${intento}: HTTP ${res.status} ${text.slice(0, 80).replace(/\s+/g, " ")}`);
    } catch (e) {
      console.error(`[${name}] intento ${intento}: ${e.message}`);
    }
    await sleep(70_000 * intento);
  }
  throw new Error(`Overpass no responde para ${name}`);
}

// ── Geometría ───────────────────────────────────────────────────────────────
/** Une los tramos («ways») exteriores de una relación en anillos cerrados. */
function ringsOf(rel) {
  const segs = rel.members.filter((m) => m.type === "way" && m.role === "outer" && m.geometry?.length > 1).map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  const key = (p) => `${p[0]},${p[1]}`;
  const rings = [];
  const pool = segs.slice();
  while (pool.length) {
    let ring = pool.pop();
    let grown = true;
    while (grown && key(ring[0]) !== key(ring[ring.length - 1])) {
      grown = false;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        const end = key(ring[ring.length - 1]);
        const start = key(ring[0]);
        if (key(s[0]) === end) ring = ring.concat(s.slice(1));
        else if (key(s[s.length - 1]) === end) ring = ring.concat(s.slice().reverse().slice(1));
        else if (key(s[s.length - 1]) === start) ring = s.concat(ring.slice(1));
        else if (key(s[0]) === start) ring = s.slice().reverse().concat(ring.slice(1));
        else continue;
        pool.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function dp(points, tol) {
  if (points.length < 3) return points;
  // Anillo cerrado (primer punto = último): la distancia a una «recta» de longitud 0 no sirve;
  // se parte por el punto más lejano del inicio y se simplifica cada mitad.
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
  // centro del anillo mayor (suficiente para colocar la etiqueta)
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
const inFeature = (pt, f) => f.rings.some((r) => inRing(pt, r));

function toFeature(el, kind, tol) {
  const rings = ringsOf(el)
    .map((r) => dp(r, tol))
    .filter((r) => r.length >= 4 && area(r) > 1e-8);
  if (!rings.length) return null;
  return { id: `r${el.id}`, name: el.tags.name, kind, rings };
}

// ── Casado: alias curados ───────────────────────────────────────────────────
// Idealista/Fotocasa llaman distinto a algunos distritos que el contorno oficial.
const ALIAS_DISTRITO = {
  "barrio-de-salamanca": "salamanca",
  "san-blas": "san-blas-canillejas",
  moncloa: "moncloa-aravaca",
  fuencarral: "fuencarral-el-pardo",
  "ciudad-lineal": "ciudad-lineal",
};
// Barrios del portal que no coinciden con el nombre oficial del barrio.
const ALIAS_BARRIO = {
  "ibiza-de-madrid": "ibiza",
  "hispanoamerica-bernabeu": "hispanoamerica",
  "campo-de-las-naciones-corralejos": "corralejos",
  "corralejos-campo-de-las-naciones": "corralejos",
  "almenara-ventilla": "almenara",
  "pau-de-carabanchel": "buenavista",
  "arroyo-del-fresno": "valverde",
  "virgen-del-cortijo-manoteras": "canillas",
  "conde-orgaz-piovera": "piovera",
  "ciudad-universitaria": "ciudad-universitaria",
  valdemarin: "valdemarin",
  pilar: "el-pilar",
  "la-paz": "la-paz",
  "los-angeles": "los-angeles",
  acacias: "las-acacias",
  "palos-de-moguer": "palos-de-la-frontera",
  "buena-vista": "buenavista",
  "villaverde-alto": "villaverde-alto-casco-historico-de-villaverde",
  "ensanche-de-vallecas-la-gavia": "ensanche-de-vallecas",
};
// Municipios con nombre distinto en el portal.
const ALIAS_MUNICIPIO = {
  arganda: "arganda-del-rey",
  rivas: "rivas-vaciamadrid",
  "el-boalo": "el-boalo-cerceda-mataelpino",
  mataelpino: "el-boalo-cerceda-mataelpino",
  cerceda: "el-boalo-cerceda-mataelpino",
  "cerceda-mataelpino": "el-boalo-cerceda-mataelpino",
  navarredonda: "navarredonda-y-san-mames",
  orusco: "orusco-de-tajuna",
  pinuecar: "pinuecar-gandullas",
  "horcajo-de-la-sierra": "horcajo-de-la-sierra-aoslos",
  atazar: "el-atazar",
  alamo: "el-alamo",
  escorial: "el-escorial",
};

// ── Principal ───────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cap = await overpass(
    "capital",
    `[out:json][timeout:180];area(id:${3600000000 + REL_MADRID})->.a;rel(area.a)["boundary"="administrative"]["admin_level"~"^(9|10)$"];out geom;`,
  );
  const mun = await overpass(
    "municipios",
    `[out:json][timeout:240];area(id:${3600000000 + REL_COMUNIDAD})->.a;rel(area.a)["boundary"="administrative"]["admin_level"="8"];out geom;`,
  );

  const feats = [];
  for (const el of cap.elements) {
    const f = toFeature(el, el.tags.admin_level === "9" ? "distrito" : "barrio", 0.00012);
    if (f) feats.push(f);
  }
  for (const el of mun.elements) {
    if (el.id === REL_MADRID) continue; // el municipio de Madrid se pinta con sus distritos y barrios
    const f = toFeature(el, "municipio", 0.0004);
    if (f) feats.push(f);
  }
  for (const f of feats) f.centroid = centroid(f.rings);
  // padre de cada barrio = distrito que contiene su centroide
  const distritos = feats.filter((f) => f.kind === "distrito");
  for (const f of feats.filter((x) => x.kind === "barrio")) f.parent = distritos.find((d) => inFeature(f.centroid, d))?.id ?? null;

  const r4 = (n) => Math.round(n * 1e4);
  const geo = {
    attribution: "© colaboradores de OpenStreetMap (ODbL) · contornos simplificados",
    generated: new Date().toISOString().slice(0, 10),
    features: feats.map((f) => ({
      id: f.id,
      n: f.name,
      k: f.kind === "distrito" ? "d" : f.kind === "barrio" ? "b" : "m",
      ...(f.parent ? { p: f.parent } : {}),
      c: f.centroid.map(r4),
      // coordenadas ×1e4 en enteros: lon/lat con ~8 m de resolución; un anillo = [x,y,x,y,…]
      r: f.rings.map((ring) => ring.flatMap((p) => [r4(p[0]), r4(p[1])])),
    })),
  };
  fs.writeFileSync(path.join(OUT, "geo.json"), JSON.stringify(geo));
  console.log(`geo.json: ${feats.length} contornos, ${(fs.statSync(path.join(OUT, "geo.json")).size / 1024).toFixed(0)} KB`);

  if (!useDb) return;
  matchZones(feats);
}

function psql(sql) {
  const out = execFileSync("docker", ["exec", "supabase-db", "psql", "-U", "postgres", "-At", "-F", "\t", "-c", sql], { encoding: "utf8", maxBuffer: 1 << 28 });
  return out.split("\n").filter(Boolean).map((l) => l.split("\t"));
}

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

function matchZones(feats) {
  const zones = psql("select portal,zone_key,coalesce(parent_key,''),label,scope from scraper_zones").map(([portal, zone_key, parent_key, label, scope]) => ({ portal, zone_key, parent_key, label, scope }));
  const pts = psql("select portal, zone, latitude, longitude from particulares where latitude is not null and longitude is not null and zone is not null").map(([portal, zone, lat, lon]) => ({ portal, zs: slug(zone), p: [Number(lon), Number(lat)] }));

  const bySlug = (kind) => {
    const m = new Map();
    for (const f of feats.filter((x) => x.kind === kind)) m.set(slug(f.name), [...(m.get(slug(f.name)) ?? []), f]);
    return m;
  };
  const dist = bySlug("distrito");
  const barr = bySlug("barrio");
  const muni = bySlug("municipio");
  const byId = new Map(feats.map((f) => [f.id, f]));

  const ptsBySlug = new Map();
  for (const x of pts) ptsBySlug.set(`${x.portal}|${x.zs}`, [...(ptsBySlug.get(`${x.portal}|${x.zs}`) ?? []), x.p]);

  const result = { idealista: {}, fotocasa: {} };
  const unmatched = { idealista: [], fotocasa: [] };
  const how = { nombre: 0, alias: 0, puntos: 0, mediana: 0, sin: 0 };
  const marker = (list) => ({ pt: [Math.round(median(list.map((q) => q[0])) * 1e4), Math.round(median(list.map((q) => q[1])) * 1e4)] });
  const first = (list) => (list && list.length ? list[0] : null);

  // Madrid capital: las claves empiezan por madrid/ (Idealista) o madrid-capital/ (Fotocasa).
  const isCapitalKey = (k) => /^(madrid|madrid-capital)\//.test(k) && !/^madrid\/(zona-|corredor-)/.test(k);
  const lastSeg = (k) => k.split("/").pop();

  // El orden importa: primero los padres (menos tramos de ruta), para acotar a sus hijos.
  const ordered = zones.slice().sort((a, b) => a.zone_key.split("/").length - b.zone_key.split("/").length);
  for (const z of ordered) {
    const segs = z.zone_key.split("/");
    const seg = lastSeg(z.zone_key);
    let hit = null;
    let via = "nombre";

    if (isCapitalKey(z.zone_key)) {
      const parentPoly = z.parent_key ? result[z.portal][z.parent_key]?.p : undefined;
      const parentDistrict = parentPoly && byId.get(parentPoly)?.kind === "distrito" ? parentPoly : undefined;
      const inDistrict = (list) => (parentDistrict ? (list ?? []).filter((f) => f.parent === parentDistrict) : list);
      // 1) distrito (con alias)
      const dAlias = ALIAS_DISTRITO[seg];
      hit = first(dist.get(dAlias ?? seg));
      if (hit && dAlias) via = "alias";
      // 2) barrio: nombre, alias o cada parte de «Lavapiés-Embajadores»; acotado al distrito del padre si se conoce
      if (!hit) {
        const bAlias = ALIAS_BARRIO[seg];
        hit = first(inDistrict(barr.get(bAlias ?? seg)));
        if (hit && bAlias) via = "alias";
      }
      if (!hit) {
        for (const part of seg.split("-")) {
          hit = first(inDistrict(barr.get(part)));
          if (hit) {
            via = "alias";
            break;
          }
        }
      }
      if (!hit && !parentDistrict) hit = first(barr.get(seg));
      // 3) puntos: SOLO si caen mayoritariamente en un barrio (y coherente con el distrito del padre)
      if (!hit) {
        const mine = ptsBySlug.get(`${z.portal}|${seg}`) ?? [];
        const votes = new Map();
        for (const pt of mine) {
          const f = feats.find((x) => x.kind === "barrio" && inFeature(pt, x));
          if (f && (!parentDistrict || f.parent === parentDistrict)) votes.set(f.id, (votes.get(f.id) ?? 0) + 1);
        }
        const [top, n] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
        if (top && mine.length >= 3 && n / mine.length >= 0.6) {
          hit = byId.get(top);
          via = "puntos";
        } else if (mine.length >= 3 && parentDistrict) {
          const inside = mine.filter((pt) => inFeature(pt, byId.get(parentDistrict)));
          if (inside.length >= 3) {
            result[z.portal][z.zone_key] = marker(inside);
            how.mediana++;
            continue;
          }
        }
      }
    } else if (segs.length === 1) {
      // Municipio (o localidad): nombre, con o sin el sufijo «-madrid» de Idealista, y alias
      const raw = seg;
      const stripped = seg.replace(/-madrid$/, "");
      const alias = ALIAS_MUNICIPIO[stripped] ?? ALIAS_MUNICIPIO[raw];
      hit = first(muni.get(raw)) ?? first(muni.get(stripped));
      if (!hit && alias) {
        hit = first(muni.get(alias));
        via = "alias";
      }
    } else {
      // Subzona de un municipio: no hay contorno oficial. Se coloca en la mediana de sus anuncios
      // que caen DENTRO del municipio del padre (el nombre de zona solo es ambiguo entre municipios).
      const root = result[z.portal][segs[0]] ?? result[z.portal][`${segs[0]}-madrid`];
      const rootFeat = root?.p ? byId.get(root.p) : undefined;
      const mine = ptsBySlug.get(`${z.portal}|${seg}`) ?? [];
      const inside = rootFeat ? mine.filter((pt) => inFeature(pt, rootFeat)) : [];
      if (inside.length >= 3) {
        result[z.portal][z.zone_key] = marker(inside);
        how.mediana++;
        continue;
      }
    }

    if (hit) {
      result[z.portal][z.zone_key] = { p: hit.id };
      how[via]++;
    } else {
      unmatched[z.portal].push(z.zone_key);
      how.sin++;
    }
  }

  fs.writeFileSync(path.join(OUT, "zone-match.json"), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), zones: result, unmatched }));
  console.log("casado:", how);
  console.log("sin posición (Idealista):", unmatched.idealista.length, "· (Fotocasa):", unmatched.fotocasa.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
