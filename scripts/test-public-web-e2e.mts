// S0 · prueba de punta a punta de la web pública contra el build de producción
// (`next start`) conectado al simulador local de PostgREST con los datos
// sintéticos de scripts/sim/fixtures/s0-public-web.json. Solo pruebas locales.
//
//   BASE=http://127.0.0.1:3151 SIM_LOG=/ruta/sim.jsonl \
//   node --experimental-strip-types scripts/test-public-web-e2e.mts
//
// P1 publicada·disponible · P2 publicada·reservada · P3 sin publicar·disponible ·
// P4 sin publicar·reservada · P5 publicada·vendida · P6 publicada·archived ·
// P7 publicada·disponible con archived_at. Cada una con una dirección centinela.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3151";
// Uno o varios registros del simulador separados por comas: el catálogo y la
// API se generan durante `next build` (caché de 5 minutos), así que sus
// consultas quedan en el registro del build.
const SIM_LOG = process.env.SIM_LOG ?? "";
const SENTINEL = "CALLE-SENTINELA-S0";
const PUBLISHED_VISIBLE = ["s0-p1", "s0-p2"];
const ALL = ["s0-p1", "s0-p2", "s0-p3", "s0-p4", "s0-p5", "s0-p6", "s0-p7"];

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fails++;
};
const section = (t: string) => console.log(`\n· ${t}`);
// Un slug aparece en un enlace, en el HTML o en los datos serializados de la
// página (que van escapados dentro de <script>): basta con buscarlo tal cual.
const slugsIn = (text: string) => ALL.filter((s) => new RegExp(`${s}(?![0-9])`).test(text));
const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

async function get(path: string) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  return { status: res.status, text: await res.text() };
}

// 1 · API de la portada
section("API /api/portal/properties");
{
  const r = await get("/api/portal/properties");
  ok("responde 200 con una lista", r.status === 200 && r.text.trim().startsWith("["), `${r.status}`);
  let list: Array<Record<string, unknown>> = [];
  try {
    list = JSON.parse(r.text);
  } catch {
    /* lo marca la comprobación anterior */
  }
  const ids = list.map((p) => String(p.id));
  ok("solo viviendas publicadas, disponibles o reservadas y sin archivar (P1, P2)", same(ids, PUBLISHED_VISIBLE), ids.join(","));
  ok("se conserva el orden (id descendente: P2 antes que P1)", ids.indexOf("s0-p2") < ids.indexOf("s0-p1") || ids.length < 2, ids.join(","));
  ok("ningún objeto lleva `address`", list.every((p) => !("address" in p)), list.filter((p) => "address" in p).map((p) => p.id).join(","));
  ok("la dirección centinela no aparece en la respuesta", !r.text.includes(SENTINEL));
  const expectedKeys = ["baths", "beds", "city", "country", "cover", "description", "features", "gallery", "id", "office", "operation", "phone", "price", "priceNum", "ref", "sqm", "title", "type", "videos", "zone"];
  const keys = list[0] ? Object.keys(list[0]).sort() : [];
  ok("se conservan los demás campos de la respuesta", same(keys, expectedKeys), keys.join(","));
}

// 2 · Catálogo
section("Catálogo /web/propiedades");
{
  const r = await get("/web/propiedades");
  ok("responde 200", r.status === 200, `${r.status}`);
  ok("solo P1 y P2 (en el HTML y en los datos de la página)", same(slugsIn(r.text), PUBLISHED_VISIBLE), slugsIn(r.text).join(","));
  ok("la dirección centinela no aparece (tampoco en los datos serializados)", !r.text.includes(SENTINEL));
}

// 3 · Ficha y «similares»
section("Ficha /web/propiedades/s0-p1 y «similares»");
{
  const r = await get("/web/propiedades/s0-p1");
  ok("responde 200", r.status === 200, `${r.status}`);
  const linked = slugsIn(r.text).filter((s) => s !== "s0-p1");
  ok("«similares» solo enlaza a viviendas publicadas (P2)", same(linked, ["s0-p2"]), linked.join(","));
  ok("la dirección centinela no aparece", !r.text.includes(SENTINEL));
  for (const s of linked) {
    const l = await get(`/web/propiedades/${s}`);
    ok(`el enlace de «similares» a ${s} no da 404`, l.status === 200, `${l.status}`);
  }
}

// 4 · 404 esperados
section("404 esperados");
for (const s of ["s0-p3", "s0-p4", "s0-p5", "s0-p6", "s0-p7"]) {
  const r = await get(`/web/propiedades/${s}`);
  ok(`/web/propiedades/${s} → 404`, r.status === 404, `${r.status}`);
}

// 5 · Portada (los destacados se cargan en el navegador)
section("Portada /web (Chromium)");
{
  const browser = await chromium.launch({ args: ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=127.0.0.1"] });
  const page = await browser.newPage();
  const apiBodies: string[] = [];
  page.on("response", async (res) => {
    if (res.url().includes("/api/portal/properties")) apiBodies.push(await res.text().catch(() => ""));
  });
  await page.goto(BASE + "/web", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const hrefs = await page.$$eval("a[href*='/web/propiedades/']", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""));
  const featured = ALL.filter((s) => hrefs.some((h) => h.endsWith(`/web/propiedades/${s}`)));
  const html = await page.content();
  ok("la portada pidió los destacados a la API", apiBodies.length > 0);
  ok("los destacados son solo viviendas publicadas (P1, P2)", same(featured, PUBLISHED_VISIBLE), featured.join(","));
  ok("la dirección centinela no aparece en la página ni en lo que recibió", !html.includes(SENTINEL) && apiBodies.every((b) => !b.includes(SENTINEL)));
  await browser.close();
}

// 6 · Enlaces para compartir intactos
section("Enlaces intencionados (/compartir)");
{
  const p3 = await get("/compartir/s0-p3");
  ok("/compartir de una vivienda SIN publicar y disponible sigue respondiendo 200", p3.status === 200 && p3.text.includes("S0 Prueba P3"), `${p3.status}`);
  for (const s of ["s0-p6", "s0-p7"]) {
    const r = await get(`/compartir/${s}`);
    ok(`/compartir/${s} (archivada) sigue dando 404`, r.status === 404, `${r.status}`);
  }
  console.log(`    (informativo: la dirección centinela ${p3.text.includes(SENTINEL) ? "SÍ" : "no"} aparece en /compartir/s0-p3; esa ruta queda fuera de S0)`);
}

// 7 · Consultas reales que llegaron al simulador
if (SIM_LOG) {
  section("Consultas que hizo la app (registro del simulador)");
  const lines = SIM_LOG.split(",")
    .flatMap((f) => readFileSync(f, "utf8").trim().split("\n"))
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { table?: string; query?: string; method: string });
  const props = lines.filter((l) => l.table === "properties" && l.method === "GET" && l.query);
  const dec = (q: string) => decodeURIComponent(q);
  const lists = props.filter((l) => /order=id\.desc/.test(l.query!) || (/order=created_at\.desc/.test(l.query!) && /limit=3\b/.test(l.query!)));
  ok("hubo consultas de listas públicas (API, catálogo y «similares»)", lists.length >= 3, `${lists.length}`);
  const missing = lists.filter((l) => !/published_web=eq\.true/.test(l.query!) || !/status=in\.\(available,reserved\)/.test(dec(l.query!)) || !/archived_at=is\.null/.test(l.query!));
  ok("todas filtran por publicada + disponible/reservada + sin archivar", missing.length === 0, missing.map((l) => dec(l.query!)).join(" | "));
  const withAddress = props.filter((l) => /[?&]select=[^&]*\baddress\b/.test(dec(l.query!)) && !/select=\*/.test(dec(l.query!)));
  const publicWithAddress = withAddress.filter((l) => /published_web/.test(l.query!) || /order=id\.desc/.test(l.query!) || /limit=3\b/.test(l.query!));
  ok("ninguna consulta de la web pública pide `address`", publicWithAddress.length === 0, publicWithAddress.map((l) => dec(l.query!)).join(" | "));
}

console.log(`\n${fails === 0 ? "✅ Todo en verde" : `❌ ${fails} fallo(s)`}`);
process.exit(fails ? 1 : 0);
