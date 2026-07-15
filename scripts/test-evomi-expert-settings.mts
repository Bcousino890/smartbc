/**
 * Test de los "expert settings" OPCIONALES de Evomi en proxy-config.ts:
 * `_fraudscore-N` (EVOMI_FRAUDSCORE) y `_activesince-N` (EVOMI_MIN_UPTIME_MIN).
 *
 * Objetivo: dar una palanca contra el bloqueo duro (t=bv) de DataDome filtrando
 * IPs más limpias, PERO apagada por defecto (cada filtro multiplica el consumo
 * de ancho de banda → coste). Este test confirma:
 *   - sin env: NO se añade ningún modificador (cero cambio de coste).
 *   - con env válida: se añade `_fraudscore-N` / `_activesince-N` al password.
 *   - valores fuera de rango: se ignoran (no rompen la URL).
 *   - stripModifiers los limpia (idempotente).
 *
 * Copia local de la lógica (sin imports "server-only"), igual que el resto de
 * tests del repo. Ejecutar:
 *   node --experimental-strip-types scripts/test-evomi-expert-settings.mts
 */

function evomiExpertModifiers(): string {
  let mods = "";
  const rawFraud = (process.env.EVOMI_FRAUDSCORE ?? process.env.PROXY_FRAUDSCORE ?? "").trim();
  if (rawFraud) {
    const n = Math.round(Number(rawFraud));
    if (Number.isFinite(n) && n >= 0 && n <= 100) mods += `_fraudscore-${n}`;
  }
  const rawUptime = (process.env.EVOMI_MIN_UPTIME_MIN ?? "").trim();
  if (rawUptime) {
    const n = Math.round(Number(rawUptime));
    if (Number.isFinite(n) && n > 0) mods += `_activesince-${n}`;
  }
  return mods;
}

function buildEvomiUrl(u: URL, sessionId: string, lifeMinutes: number, country: string, useCountry: boolean): string {
  const safeId = (sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "default").padEnd(6, "0");
  const life = Math.min(120, Math.max(1, Math.round(lifeMinutes)));
  const modifiers = `${useCountry ? `_country-${country}` : ""}${evomiExpertModifiers()}_session-${safeId}_lifetime-${life}`;
  return `${u.protocol}//${u.username}:${decodeURIComponent(u.password)}${modifiers}@${u.host}`;
}

function stripEvomiModifiers(pass: string): string {
  return pass.replace(
    /_(?:country|region|city|isp|asn|continent|session|hardsession|lifetime|fraudscore|activesince|latency|device|zip|http3|localdns)-[^_]*/g,
    "",
  );
}

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const base = new URL("http://testuser:testpass@core-residential.evomi.com:1000");

// 1) Sin env → sin modificadores expert (default seguro, cero coste extra).
delete process.env.EVOMI_FRAUDSCORE;
delete process.env.PROXY_FRAUDSCORE;
delete process.env.EVOMI_MIN_UPTIME_MIN;
const off = buildEvomiUrl(base, "sess01", 2, "ES", true);
check("OFF por defecto: sin _fraudscore ni _activesince", !off.includes("_fraudscore") && !off.includes("_activesince"), off);
check("OFF por defecto: mantiene country/session/lifetime normales", off.includes("_country-ES") && off.includes("_session-sess01") && off.includes("_lifetime-2"), off);

// 2) EVOMI_FRAUDSCORE válido → se añade _fraudscore-N.
process.env.EVOMI_FRAUDSCORE = "15";
const fs = buildEvomiUrl(base, "sess02", 2, "ES", true);
check("EVOMI_FRAUDSCORE=15 → _fraudscore-15 en el password", fs.includes("_fraudscore-15"), fs);
check("_fraudscore va ANTES de _session (orden de modificadores)", fs.indexOf("_fraudscore-15") < fs.indexOf("_session-"), fs);
delete process.env.EVOMI_FRAUDSCORE;

// 3) Fuera de rango (0-100) → ignorado.
process.env.EVOMI_FRAUDSCORE = "250";
const bad = buildEvomiUrl(base, "sess03", 2, "ES", true);
check("EVOMI_FRAUDSCORE=250 (fuera de rango) → ignorado", !bad.includes("_fraudscore"), bad);
process.env.EVOMI_FRAUDSCORE = "abc";
const nan = buildEvomiUrl(base, "sess04", 2, "ES", true);
check("EVOMI_FRAUDSCORE=abc (no numérico) → ignorado", !nan.includes("_fraudscore"), nan);
delete process.env.EVOMI_FRAUDSCORE;

// 4) EVOMI_MIN_UPTIME_MIN → _activesince-N.
process.env.EVOMI_MIN_UPTIME_MIN = "120";
const up = buildEvomiUrl(base, "sess05", 2, "ES", true);
check("EVOMI_MIN_UPTIME_MIN=120 → _activesince-120", up.includes("_activesince-120"), up);
delete process.env.EVOMI_MIN_UPTIME_MIN;

// 5) stripModifiers limpia los expert settings (idempotente).
const dirty = "testpass_country-ES_fraudscore-15_activesince-120_session-abc123_lifetime-2";
check("stripModifiers limpia _fraudscore y _activesince", stripEvomiModifiers(dirty) === "testpass", stripEvomiModifiers(dirty));

console.log(`\n${ok}/${ok + fail} tests OK${fail ? ` — ${fail} FALLIDOS` : ""}`);
process.exit(fail ? 1 : 0);
