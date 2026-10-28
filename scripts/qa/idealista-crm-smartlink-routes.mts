// SOLO PRUEBAS LOCALES (Idealista API → CRM, T11 · corrección 7). Rutas REALES
// del build de producción (`next start`) contra el simulador de PostgREST con
// el fixture de idealista-crm-smartlink-fixture.mts. Sin cookies: acceso anónimo.
//   BASE=http://127.0.0.1:3178 DIR=<dir del fixture> SIM_LOG=<registro> \
//   node --experimental-strip-types scripts/qa/idealista-crm-smartlink-routes.mts
// Lo que prueba: enrutado, acceso anónimo, 404 de lo archivado y que los campos
// internos no llegan al HTML ni a los datos de React. Lo que NO prueba: las
// políticas, triggers y CHECK de la base (el simulador no los hace cumplir; eso
// está en scripts/sql/test-idealista-crm-boundary.sql).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3178";
const DIR = process.env.DIR ?? "";
const exp = JSON.parse(readFileSync(join(DIR, "expect.json"), "utf8"));
let n = 0;
let fails = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  n++;
  if (cond) console.log(`  ✓ ${msg}`);
  else { fails++; console.log(`  ✗ ${msg}${detail !== undefined ? ` — ${String(detail).slice(0, 300)}` : ""}`); }
}
async function get(path: string) {
  const r = await fetch(BASE + path, { redirect: "manual", headers: { "user-agent": "crm-sync-qa" } });
  const type = r.headers.get("content-type") ?? "";
  const body = type.includes("text") || type.includes("json") ? await r.text() : "";
  if (!body) await r.arrayBuffer().catch(() => null);
  return { status: r.status, type, body, setCookie: r.headers.get("set-cookie") };
}
const SENTINEL = /SENTINEL_[A-Z_]+/g;

console.log("· SmartLink de una ficha de referencia viva (sin login)");
{
  const r = await get(`/compartir/${exp.live.share}`);
  ok(r.status === 200, `/compartir/${exp.live.share} → 200 sin cookies`, r.status);
  ok(r.body.includes("Piso luminoso en Chamberí") && r.body.includes("Texto público del anuncio de Idealista."), "con su título y su texto");
  ok(r.body.includes(`/p/${exp.live.slug}/`), "con sus fotos (proxy /p)");
  ok(!SENTINEL.test(r.body), "ni notas internas, ni propietario, ni contacto, ni la agencia técnica (HTML y datos de React)", r.body.match(SENTINEL));
  ok(!r.body.includes("bc-idealista-referencias"), "el slug de la agencia técnica no aparece");
  ok(!r.body.includes("RESERVADO"), "la etiqueta interna no aparece");
  const c = await get(`/c/${exp.live.token}`);
  ok(c.status === 200 && c.body.includes("Piso luminoso en Chamberí") && !/SENTINEL_/.test(c.body), "/c/[token] → 200, mismo contenido, sin campos internos", c.status);
  const og = await get(`/og/property/${exp.live.share}`);
  ok(og.status === 200 && /image\//.test(og.type), "/og/property → imagen", `${og.status} ${og.type}`);
  const p0 = await get(`/p/${exp.live.slug}/0`);
  ok(p0.status === 200 && /image\//.test(p0.type), "/p/{slug}/0 → foto", `${p0.status} ${p0.type}`);
}

console.log("· La misma ficha archivada tras la baja: no se sirve");
{
  const r = await get(`/compartir/${exp.archived.share}`);
  ok(r.status === 404, "/compartir → 404", r.status);
  ok(!/SENTINEL_|Piso dado de baja/.test(r.body), "la página 404 no filtra datos");
  ok((await get(`/c/${exp.archived.token}`)).status === 404, "/c/[token] → 404");
  const og = await get(`/og/property/${exp.archived.share}`);
  ok(og.status === 404 || !/image\//.test(og.type), "/og/property → sin imagen de la ficha", `${og.status} ${og.type}`);
  ok((await get(`/p/${exp.archived.slug}/0`)).status === 404, "/p/{slug}/0 → 404");
}

console.log("· Distribución: ni web pública ni API de la portada");
{
  const w = await get(`/web/propiedades`);
  ok(w.status === 200 && w.body.includes(exp.normal.slug), "/web/propiedades lista la propiedad normal", w.status);
  ok(!w.body.includes(exp.live.slug) && !w.body.includes(exp.archived.slug), "…y no la ficha de referencia");
  const d = await get(`/web/propiedades/${exp.live.slug}`);
  ok(d.status === 404 || !d.body.includes("Texto público del anuncio"), "/web/propiedades/{slug} de la referencia: no se sirve", d.status);
  const api = await get(`/api/portal/properties`);
  ok(api.status === 200 && !api.body.includes(exp.live.slug), "/api/portal/properties: no la incluye", api.status);
}

if (process.env.SIM_LOG) {
  console.log("· Registro del simulador");
  const lines = readFileSync(process.env.SIM_LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const writes = lines.filter((l) => l.method && l.method !== "GET" && l.method !== "HEAD");
  console.log(`  · ${lines.length} peticiones al simulador; ${writes.length} escrituras (${[...new Set(writes.map((w) => w.path))].join(", ") || "ninguna"})`);
}

console.log(fails ? `\n❌ ${fails} de ${n} comprobaciones fallan` : `\n✅ ${n}/${n} comprobaciones correctas`);
if (fails) process.exit(1);
