// S0 · pruebas puras del contrato de publicación de la web pública
// (lib/web/public-contract.ts) y de que todas las superficies lo usan.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-public-web.mts
import { readFileSync } from "node:fs";
import { applyPublicWebFilter, PUBLIC_WEB_FORBIDDEN_COLUMNS, PUBLIC_WEB_STATUSES } from "../lib/web/public-contract.ts";

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fails++;
};

console.log("· El filtro aplica exactamente las tres condiciones");
{
  const calls: string[] = [];
  const q = {
    in(c: string, v: string[]) { calls.push(`in:${c}:${v.join("|")}`); return q; },
    is(c: string, v: null) { calls.push(`is:${c}:${v}`); return q; },
    eq(c: string, v: unknown) { calls.push(`eq:${c}:${v}`); return q; },
  };
  const back = applyPublicWebFilter(q);
  ok("devuelve la misma consulta para seguir encadenando", back === q);
  ok("in status (available, reserved) · is archived_at null · eq published_web true", JSON.stringify(calls) === JSON.stringify(["in:status:available|reserved", "is:archived_at:null", "eq:published_web:true"]), calls.join(" "));
  ok("solo disponible y reservada", JSON.stringify([...PUBLIC_WEB_STATUSES]) === JSON.stringify(["available", "reserved"]));
}

// Cada superficie de la web pública: archivo y nº de consultas que debe filtrar.
const SURFACES: Array<[string, number]> = [
  ["lib/portal-fetch.ts", 1], // catálogo /web/propiedades
  ["app/web/propiedades/[id]/page.tsx", 2], // ficha + «similares»
  ["app/api/portal/properties/route.ts", 1], // API de los destacados de la portada
];

console.log("\n· Todas las superficies usan el filtro y no piden la dirección");
for (const [file, n] of SURFACES) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const uses = (src.match(/applyPublicWebFilter\(/g) ?? []).length;
  ok(`${file}: ${n} consulta(s) con applyPublicWebFilter`, uses === n, `${uses}`);
  ok(`${file}: no filtra a mano por status/published_web (una sola regla)`, !/\.eq\("published_web"|\.in\("status"/.test(src));
  const selects = [...src.matchAll(/"(id, slug[^"]*)"/g)].map((m) => m[1]);
  ok(`${file}: ningún select pide ${PUBLIC_WEB_FORBIDDEN_COLUMNS.join(", ")}`, selects.length > 0 && selects.every((s) => PUBLIC_WEB_FORBIDDEN_COLUMNS.every((c) => !new RegExp(`\\b${c}\\b`).test(s))), selects.join(" | "));
  ok(`${file}: no devuelve un campo address`, !/\baddress\s*:/.test(src));
}

console.log(`\n${fails === 0 ? "✅ Todo en verde" : `❌ ${fails} fallo(s)`}`);
process.exit(fails ? 1 : 0);
