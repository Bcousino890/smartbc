// SOLO PRUEBAS LOCALES (propuesta amueblada, 0235). Rutas REALES del build de
// producción (`next start`) contra el simulador de PostgREST con el fixture de
// furnishing-fixture.mts. Sin cookies: acceso anónimo, como el cliente.
//   BASE=http://127.0.0.1:3188 DIR=<dir del fixture> SIM_LOG=<registro> \
//   node --experimental-strip-types scripts/qa/furnishing-routes.mts
// Lo que NO prueba: la RLS y los CHECK de la base (el simulador no los aplica).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3188";
const DIR = process.env.DIR ?? "";
const exp = JSON.parse(readFileSync(join(DIR, "expect.json"), "utf8"));
let n = 0;
let fails = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  n++;
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    fails++;
    console.log(`  ✗ ${msg}${detail !== undefined ? ` — ${String(detail).slice(0, 300)}` : ""}`);
  }
}
async function get(path: string, init?: RequestInit) {
  const r = await fetch(BASE + path, { redirect: "manual", ...init, headers: { "user-agent": "furnishing-qa", ...(init?.headers ?? {}) } });
  const body = await r.text();
  return { status: r.status, body, location: r.headers.get("location") };
}
const SENTINEL = /SENTINEL[A-Z_]*/g;
const teaser = (body: string) => body.includes("Ver propuesta amueblada");

console.log("· Ficha con propuesta publicada (enlace estable, sin login)");
{
  const share = await get(`/compartir/${exp.main.share}`);
  ok(share.status === 200, "/compartir → 200", share.status);
  ok(teaser(share.body) && share.body.includes(`href="/compartir/${exp.main.share}/propuesta"`), "muestra «Ver propuesta amueblada» con su enlace");
  const v = await get(`/compartir/${exp.main.share}/propuesta`);
  ok(v.status === 200, "/compartir/…/propuesta → 200 sin cookies", v.status);
  ok(v.body.includes("Propuesta de amueblamiento") && v.body.includes("Una propuesta para imaginar tu hogar"), "con el diseño y los textos por defecto");
  ok(v.body.includes("BC-2138"), "con la referencia del registro (BC-2138)");
  ok(v.body.includes("1.250.000 €") && v.body.includes("El Viso") && v.body.includes("180 m²"), "precio, zona y superficie del registro");
  ok((v.body.match(/aria-label="Ver /g) ?? []).length === exp.main.images, `${exp.main.images} miniaturas`, (v.body.match(/aria-label="Ver /g) ?? []).length);
  ok(/propuesta virtual/i.test(v.body), "conserva el aviso de propuesta virtual");
  ok(/<meta name="robots" content="noindex, ?nofollow"/.test(v.body), "noindex, nofollow");
  ok(!/SENTINEL/.test(v.body), "sin rutas de storage, dirección, notas ni propietario", v.body.match(SENTINEL));
  ok(v.body.includes(`href="/compartir/${exp.main.share}"`), "vuelve a la ficha compartida");
  const rent = await get(`/compartir/${exp.main.share}/propuesta?op=sale`);
  ok(rent.status === 200 && rent.body.includes(`href="/compartir/${exp.main.share}?op=sale"`), "conserva ?op= en la vuelta");
}

console.log("· Ficha sin propuesta y ficha en borrador");
{
  const s = await get(`/compartir/${exp.none.share}`);
  ok(s.status === 200 && !teaser(s.body), "sin propuesta: ficha normal, sin acceso");
  ok((await get(`/compartir/${exp.none.share}/propuesta`)).status === 404, "sin propuesta: /propuesta → 404");
  const d = await get(`/compartir/${exp.draft.share}`);
  ok(d.status === 200 && !teaser(d.body), "borrador: ficha sin acceso");
  const dv = await get(`/compartir/${exp.draft.share}/propuesta`);
  ok(dv.status === 404 && !/SENTINEL/.test(dv.body), "borrador: /propuesta → 404 y no filtra nada", dv.status);
  ok((await get(`/compartir/no-existe-zz9/propuesta`)).status === 404, "slug inexistente → 404");
  const legacy = await get(`/compartir/${exp.legacy}/propuesta`);
  ok([307, 308].includes(legacy.status) && /\/compartir\/exclusivo-piso-en-paseo-de-la-habana-el-viso-ax3b\/propuesta$/.test(legacy.location ?? ""), "slug antiguo → redirige a /propuesta del nuevo", `${legacy.status} ${legacy.location}`);
}

console.log("· SmartLink con tracking (/c/[token])");
{
  const c = await get(`/c/${exp.main.token}`);
  ok(c.status === 200 && c.body.includes(`href="/c/${exp.main.token}/propuesta"`), "/c/[token] → acceso a /c/[token]/propuesta");
  const cv = await get(`/c/${exp.main.token}/propuesta`);
  ok(cv.status === 200 && cv.body.includes("BC-2138") && !/SENTINEL/.test(cv.body), "/c/[token]/propuesta → 200 sin campos internos", cv.status);
  ok((await get(`/c/${exp.main.expiredToken}/propuesta`)).status === 404, "token caducado → 404");
  ok((await get(`/c/${exp.none.token}/propuesta`)).status === 404, "token de una ficha sin propuesta → 404 (no enseña la de otra)");
  ok((await get(`/c/${exp.draft.token}/propuesta`)).status === 404, "token de una ficha en borrador → 404");
  ok((await get(`/c/inventado00000000000/propuesta`)).status === 404, "token inventado → 404");
}

console.log("· La gestión sigue protegida");
{
  const admin = await get(`/es/admin/propiedades/exclusivo-piso-en-paseo-de-la-habana-el-viso-ax3b`);
  ok([302, 303, 307, 308].includes(admin.status) && /login/.test(admin.location ?? ""), "ficha del admin sin sesión → login", `${admin.status} ${admin.location}`);
  const fd = new FormData();
  fd.set("slug", "exclusivo-piso-en-paseo-de-la-habana-el-viso-ax3b");
  fd.set("after", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "x.png");
  const up = await get(`/api/admin/properties/upload/furnishing`, { method: "POST", body: fd });
  let parsed: { ok?: boolean } = {};
  try { parsed = JSON.parse(up.body); } catch { /* no JSON */ }
  ok(parsed.ok === false, "subida sin sesión → rechazada", `${up.status} ${up.body.slice(0, 120)}`);
}

if (process.env.SIM_LOG) {
  console.log("· Registro del simulador");
  const lines = readFileSync(process.env.SIM_LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const writes = lines.filter((l) => l.method && !["GET", "HEAD"].includes(l.method) && !String(l.path).includes("/rpc/"));
  const furn = writes.filter((w) => /furnishing|storage/.test(String(w.path)));
  ok(furn.length === 0, "ninguna escritura en la propuesta ni en storage", furn.map((w) => `${w.method} ${w.path}`).join(", "));
  console.log(`  · ${lines.length} peticiones; escrituras: ${[...new Set(writes.map((w) => `${w.method} ${w.path}`))].join(", ") || "ninguna"}`);
}

console.log(fails ? `\n❌ ${fails} de ${n} comprobaciones fallan` : `\n✅ ${n}/${n} comprobaciones correctas`);
if (fails) process.exit(1);
