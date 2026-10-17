// SOLO PRUEBAS LOCALES (expediente 2026-10-17-bcp-01-pdf-worker). Genera los
// datos del simulador de PostgREST para descargar el PDF de un catálogo por el
// enlace en el build de producción (`next start`), sin base de datos real.
//
// Parte de las instantáneas sintéticas de las fixtures y les da identidades
// «de verdad»: cada foto recibe un id, su clave f = photoKeyOf(id) y una URL
// servida por el propio simulador (/img/…), con u = md5(url). Así el código de
// producción resuelve y comprueba cada foto exactamente como con la base real
// (findPropertyPhoto + md5). Las imágenes llevan el código visual (K5) de su
// `u`, para identificarlas dentro del PDF. La foto que «falla» en las
// fixtures no se escribe (el simulador da 404).
//
//   NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs scripts/sim/build-catalog-sim.mts <carpeta> <base-url> [px-grandes]
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { codedPhotoSvg } from "../../lib/catalogs/export/fixture-photo.ts";
import { fixtureBigJpeg } from "../../lib/catalogs/export/fixture-photo-big.ts";
import { FIXTURE_TOKENS, fixtureExportPhoto, fixtureGetMetas, fixtureGetPublic } from "../../lib/catalogs/fixture-store.ts";
import { photoKeyOf } from "../../lib/catalogs/photo-data.ts";
import type { InternalSnapshot } from "../../lib/catalogs/to-public.ts";

const [outDir, base, bigArg] = process.argv.slice(2);
const bigPx = bigArg ? Number(bigArg) : 0;
const imgDir = join(outDir, bigPx ? `img-${bigPx}` : "img");
mkdirSync(imgDir, { recursive: true });
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const uuidOf = (s: string) => {
  const h = md5(s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Sustituye en todo el JSON cualquier cadena que sea una clave o versión
 *  antigua (exclusiones, apertura, portada, historia…). */
function remap(v: unknown, map: Map<string, string>): unknown {
  if (typeof v === "string") return map.get(v) ?? v;
  if (Array.isArray(v)) return v.map((x) => remap(x, map));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x, map)]));
  return v;
}

const TOKENS = { pdf: FIXTURE_TOKENS.pdf, one: FIXTURE_TOKENS.one, main: FIXTURE_TOKENS.main, journey: FIXTURE_TOKENS.journey, journey12: FIXTURE_TOKENS.journey12, journey24: FIXTURE_TOKENS.journey24 };
const shares: unknown[] = [];
const byArg: Record<string, unknown> = {};
const properties = new Map<string, { id: string; slug: string; archived_at: null; status: string; property_photos: unknown[] }>();
let images = 0;

for (const [name, token] of Object.entries(TOKENS)) {
  const pub = await fixtureGetPublic(token);
  const meta = (await fixtureGetMetas([token])).get(token);
  if (!pub || !meta) throw new Error(`${name}: sin datos`);
  const snap = structuredClone(pub.snapshot) as InternalSnapshot;
  // Una tabla de sustitución POR VIVIENDA: las fixtures repiten versiones de
  // foto (`u`) entre viviendas distintas.
  const maps = new Map<string, Map<string, string>>();
  for (const it of snap.items) {
    const map = new Map<string, string>();
    maps.set(String(it.key), map);
    const rows: unknown[] = [];
    for (const [i, ph] of it.photos.entries()) {
      const id = uuidOf(`${it.slug}#${i}`);
      const url = `${base}/img/${it.slug}-${i}.jpg`;
      const f = photoKeyOf(id);
      const u = md5(url);
      const fx = ph.f ? await fixtureExportPhoto(it.slug, ph.f) : null;
      if (ph.f) map.set(ph.f, f);
      map.set(ph.u, u);
      rows.push({ id, url, position: i, is_cover: i === 0 });
      if (!fx?.fail) {
        const svg = codedPhotoSvg(u, ph.w ?? 1600, ph.h ?? 1067, `${it.slug} · ${i + 1}`);
        const jpg = bigPx ? await fixtureBigJpeg(u, svg, bigPx) : await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
        writeFileSync(join(imgDir, `${it.slug}-${i}.jpg`), jpg);
        images++;
      }
    }
    // La misma vivienda puede estar en varios catálogos con distinto número de
    // fotos: la fila de la propiedad lleva la lista más larga (las URL e ids
    // dependen solo de slug + índice, así que coinciden).
    const prev = properties.get(it.slug);
    if (!prev || prev.property_photos.length < rows.length) properties.set(it.slug, { id: uuidOf(`prop:${it.slug}`), slug: it.slug, archived_at: null, status: "available", property_photos: rows });
  }
  const items = snap.items.map((it) => remap(it, maps.get(String(it.key))!));
  const coverMap = snap.cover?.key ? maps.get(String(snap.cover.key)) : undefined;
  const remapped = { ...snap, items, cover: snap.cover && coverMap ? remap(snap.cover, coverMap) : snap.cover } as InternalSnapshot;
  shares.push({ token, catalogs: { version: meta.version, criteria: { operation: meta.operation } } });
  byArg[token] = { valid: true, snapshot: remapped, fingerprint: `sim-${name}`, expires_at: "2027-01-01T00:00:00Z" };
}

writeFileSync(
  join(outDir, "catalog-sim.json"),
  JSON.stringify({ catalog_shares: shares, properties: [...properties.values()], rpc: { get_public_catalog: { byArg } } }),
);
console.log(JSON.stringify({ catalogs: Object.keys(TOKENS), properties: properties.size, images, imgDir }));
