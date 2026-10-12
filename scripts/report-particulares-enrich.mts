/**
 * Medición del enriquecimiento desde la descripción SOBRE UNA COPIA LOCAL (sin tocar la BD).
 *
 *   docker exec supabase-db psql -U postgres -At -c "select row_to_json(t) from (select id, portal,
 *     advertiser_type, is_ad_professional, is_active, address, zone, scraper_extra->>'municipality' municipality,
 *     owner_name, phone, phone2, chat_only, scraper_extra->>'phone_source' phone_source, location_precision,
 *     latitude, longitude, description, operation, duplicate_of, square_meters, bedrooms from particulares) t" > particulares.jsonl
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/report-particulares-enrich.mts particulares.jsonl [--samples=40] [--field=phone|address|owner_name] [--conf=alta] [--seed=1]
 *
 * Calcula el reparto de teléfonos con TODO el fichero (igual que la RPC del job), planifica cada anuncio
 * activo de particular y cuenta propuestas por campo/regla/confianza/decisión. Con --samples imprime
 * ejemplos al azar (texto, extracción) para revisarlos a mano.
 */
import { readFileSync } from "node:fs";
import {
  allPhoneKeys,
  planEnrichment,
  spreadFromRows,
  type EnrichRow,
  type PhoneSpreadEntry,
  type SpreadRow,
} from "../lib/particulares/enrich-from-description.ts";
import { phoneKey } from "../lib/particulares/linking-core.ts";

type Row = EnrichRow & SpreadRow & { is_active: boolean; square_meters: number | null; bedrooms: number | null };
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (n: string, d?: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1] ?? d;
if (!file) throw new Error("uso: report-particulares-enrich.mts fichero.jsonl [--samples=40] [--field=…] [--conf=…]");
const rows = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Row);

// Reparto de cada teléfono: filas que lo tienen en phone/phone2 o escrito en la descripción.
const byKey = new Map<string, Set<Row>>();
const add = (k: string | null, r: Row) => {
  if (!k) return;
  let s = byKey.get(k);
  if (!s) byKey.set(k, (s = new Set()));
  s.add(r);
};
for (const r of rows) {
  add(phoneKey(r.phone), r);
  add(phoneKey(r.phone2), r);
  for (const k of allPhoneKeys(r.description)) add(k, r);
}
const spread = (k: string): PhoneSpreadEntry | undefined => spreadFromRows([...(byKey.get(k) ?? [])]);

const scope = rows.filter((r) => (args.includes("--all") || r.is_active) && r.advertiser_type !== "professional");
const tally = new Map<string, number>();
const inc = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);
const samples: Array<{ row: Row; p: ReturnType<typeof planEnrichment>["proposals"][number] }> = [];
const rowsWith = { phone: new Set<string>(), address: new Set<string>(), owner_name: new Set<string>() };
const t0 = Date.now();
for (const r of scope) {
  const plan = planEnrichment(r, { spread });
  for (const p of plan.proposals) {
    const f = p.field === "phone2" ? "phone" : p.field;
    inc(`${p.field}|${p.confidence}|${p.decision}`);
    inc(`rule|${p.field}|${p.rule}|${p.confidence}|${p.decision}`);
    if (p.decision !== "drop") (rowsWith as any)[f]?.add(r.id);
    samples.push({ row: r, p });
  }
}
console.log(`filas activas de particular medidas: ${scope.length} (${Date.now() - t0} ms)`);
for (const [k, v] of [...tally].filter(([k]) => !k.startsWith("rule|")).sort()) console.log(`  ${k.padEnd(36)} ${v}`);
console.log("por regla:");
for (const [k, v] of [...tally].filter(([k]) => k.startsWith("rule|")).sort()) console.log(`  ${k.slice(5).padEnd(70)} ${v}`);
console.log(`anuncios con algo añadible o candidato — teléfono: ${rowsWith.phone.size}, dirección: ${rowsWith.address.size}, responsable: ${rowsWith.owner_name.size}`);

const nSamples = Number(opt("samples", "0"));
if (nSamples) {
  const field = opt("field");
  const conf = opt("conf");
  let seed = Number(opt("seed", "1"));
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const dec = opt("decision");
  const pool = samples.filter((s) => (dec ? s.p.decision === dec : s.p.decision !== "drop") && (!field || s.p.field === field || (field === "phone" && s.p.field === "phone2")) && (!conf || s.p.confidence === conf));
  const pick = pool.map((s) => [rnd(), s] as const).sort((a, b) => a[0] - b[0]).slice(0, nSamples).map((x) => x[1]);
  pick.forEach((s, i) => {
    console.log(`\n#${i + 1} [${s.p.field} ${s.p.confidence}/${s.p.decision} ${s.p.rule}] ${s.row.id} ${s.row.portal}`);
    console.log(`   ficha: phone=${s.row.phone ?? "-"} phone2=${s.row.phone2 ?? "-"} owner=${s.row.owner_name ?? "-"} address=${(s.row.address ?? "-").slice(0, 80)} zone=${s.row.zone ?? "-"}`);
    console.log(`   texto: «${s.p.evidence}»`);
    console.log(`   => ${s.p.field} = ${s.p.value}${s.p.reason ? `  (${s.p.reason})` : ""}`);
  });
}
