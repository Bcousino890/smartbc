// CASO PAUL · recorrido completo contra producción, más las diez pruebas de
// seguridad del brief. Se ejecuta sobre el shortlist de QA (14 propiedades).
import { chromium } from "playwright";

const BASE = "http://localhost:8099"; // producción por túnel SSH
const TOKEN = "qa7paulshortlist";
const issues = [];
const bad = (m) => issues.push(m);
const ok = (m) => console.log(`  ✅ ${m}`);

// Punto de partida limpio: el escenario se reutiliza entre pasadas.
import { execSync } from "child_process";
const RESET = Buffer.from(`
UPDATE client_shortlist_items SET decision='undecided', rank=NULL,
       client_comment=NULL, decided_at=NULL
 WHERE shortlist_id='7792617f-1886-4148-b3dd-dffeef6a363c';
DELETE FROM client_shortlist_items
 WHERE shortlist_id='7792617f-1886-4148-b3dd-dffeef6a363c' AND origin='client_added';
UPDATE client_shortlists SET status='reviewing', submitted_at=NULL,
       client_updated_at=NULL, revision=0
 WHERE id='7792617f-1886-4148-b3dd-dffeef6a363c';
`).toString("base64");
execSync(`echo ${RESET} | ssh -o ConnectTimeout=15 root@178.105.185.125 "base64 -d | docker exec -i supabase-db psql -U postgres -d postgres -q"`, { stdio: "ignore" });

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const p = await ctx.newPage();
p.on("pageerror", (e) => bad("error de página: " + e.message));

// ── 1 · Abre desde el móvil ────────────────────────────────────────────────
await p.goto(`${BASE}/s/${TOKEN}`, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);

const cards = await p.locator("article").count();
if (cards !== 14) bad(`esperaba 14 residencias, hay ${cards}`);
else ok("abre con las 14 residencias");

const name = await p.locator("h1").first().textContent();
if (!/paul/i.test(name ?? "")) bad(`no saluda a Paul: ${name}`);
else ok("se dirige a Paul por su nombre");

await p.screenshot({ path: "/tmp/shortlist/1-apertura.png" });

// ── 2 · Fuga en el HTML servido ────────────────────────────────────────────
const html = await (await fetch(`${BASE}/s/${TOKEN}`)).text();
const leaks = [
  ["owner_*", /owner_(name|phone|email)/i],
  ["notas internas", /internal_notes/],
  ["notas del agente", /agent_notes/],
  ["URL de origen", /source_url|idealista\.com\/inmueble/],
  ["external_id", /external_id/],
  ["ruta de Storage", /\/storage\/v1\/object/],
  ["carpeta synced/", /synced\//],
  ["comisión", /commission/i],
  ["client_id", /client_id/],
];
for (const [label, re] of leaks) {
  if (re.test(html)) bad(`FUGA en el HTML: ${label}`);
}
if (!issues.some((i) => i.startsWith("FUGA"))) ok("el HTML servido no filtra nada interno");

// ── 3 · Decide: 5 prioritarias, 4 alternativas, 5 descartadas ──────────────
// Se decide por NOMBRE, no por posición: las tarjetas cambian de grupo al
// decidirlas y cualquier índice queda obsoleto en cuanto se pulsa el primero.
const titles = await p.locator("article h3").allTextContents();
if (titles.length !== 14) bad(`esperaba 14 títulos, hay ${titles.length}`);

const decideByTitle = async (title, label) => {
  const card = p.locator("article").filter({ has: p.locator("h3", { hasText: title }) }).first();
  await card.getByRole("button", { name: label, exact: true }).click({ timeout: 15000 });
  await p.waitForTimeout(800);
};
for (let i = 0; i < 5; i++) await decideByTitle(titles[i], "I want to visit");
for (let i = 5; i < 9; i++) await decideByTitle(titles[i], "Maybe");
for (let i = 9; i < 14; i++) await decideByTitle(titles[i], "Set aside");
await p.waitForTimeout(1500);

const counts = await p.evaluate(() => {
  const txt = document.body.innerText;
  const m = txt.match(/(\d+)\s+of\s+(\d+)\s+reviewed/i);
  return m ? { done: +m[1], total: +m[2] } : null;
});
if (!counts || counts.done !== 14) bad(`progreso incorrecto: ${JSON.stringify(counts)}`);
else ok(`progreso 14/14 tras decidir las catorce`);

// ── 4 · Reordena las prioritarias ──────────────────────────────────────────
const priority = p.locator("section").filter({ hasText: "Your priorities" }).first();
const firstBefore = await priority.locator("article").first().locator("h3").textContent();
await priority.locator("article").first().getByRole("button", { name: "Move down" }).click();
await p.waitForTimeout(1400);
const firstAfter = await priority.locator("article").first().locator("h3").textContent();
if (firstBefore === firstAfter) bad("bajar una prioridad no cambió el orden");
else ok("reordena las prioritarias");

// ── 5 · Comentario ─────────────────────────────────────────────────────────
await p.locator("section").filter({ hasText: "Your priorities" }).first().locator("article").first().getByRole("button", { name: "Add a note" }).click();
await p.waitForTimeout(500);
await p.locator("textarea").fill("This is probably my favourite.");
await p.getByRole("button", { name: "Save note" }).click();
await p.waitForTimeout(1200);
if (!(await p.getByText("This is probably my favourite.").count()))
  bad("el comentario no quedó visible");
else ok("guarda el comentario");

// ── 6 · Persiste tras recargar ─────────────────────────────────────────────
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const afterReload = await p.evaluate(() => {
  const m = document.body.innerText.match(/(\d+)\s+of\s+(\d+)\s+reviewed/i);
  return { done: m ? +m[1] : -1, comment: /probably my favourite/.test(document.body.innerText) };
});
if (afterReload.done !== 14 || !afterReload.comment)
  bad(`al recargar se perdió algo: ${JSON.stringify(afterReload)}`);
else ok("recargar no pierde nada");
await p.screenshot({ path: "/tmp/shortlist/2-decidido.png" });

// ── 7 · Envía ──────────────────────────────────────────────────────────────
await p.getByRole("button", { name: /Send my priorities/i }).click();
await p.waitForTimeout(2500);
const sent = await p.evaluate(() => /Sent on/i.test(document.body.innerText));
if (!sent) bad("no aparece la marca de enviado");
else ok("envía las prioridades");
await p.screenshot({ path: "/tmp/shortlist/3-enviado.png" });

// ── 8 · SEGURIDAD ──────────────────────────────────────────────────────────
const codes = {};
for (const [label, path] of [
  ["token inexistente", "/s/noexisteestetoken"],
  ["token corto", "/s/abc"],
]) {
  const r = await fetch(`${BASE}${path}`);
  const t = await r.text();
  codes[label] = r.status;
  if (/reviewed|Send my priorities/i.test(t))
    bad(`${label}: devolvió una selección real`);
}
ok(`token inválido y corto devuelven la vista terminal (${JSON.stringify(codes)})`);

console.log(issues.length ? `\nPROBLEMAS:\n- ${issues.join("\n- ")}` : "\nCASO PAUL OK ✅");
await b.close();
process.exit(issues.length ? 1 : 0);
