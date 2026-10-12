/**
 * Ejecuta el JOB REAL (lib/particulares/enrich-runner.ts) sobre una COPIA LOCAL, sin tocar la BD: las RPC de
 * la migración 0187 se simulan en memoria con un export JSONL de `particulares`. Sirve para ver qué haría el
 * job (modo dry) y para probar el camino de escritura (`--apply`, también en memoria).
 *
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/dry-run-particulares-enrich.mts particulares.jsonl [--apply] [--limit=5000]
 *
 * El export se saca con el SELECT que aparece en scripts/report-particulares-enrich.mts.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runParticularesEnrich } from "../lib/particulares/enrich-runner.ts";

type Row = Record<string, any>;
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) throw new Error("uso: dry-run-particulares-enrich.mts fichero.jsonl [--apply] [--limit=N]");
const apply = args.includes("--apply");
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 5000);
// --geo=N confirma hasta N direcciones con Nominatim REAL (≤1 petición/s); sin él no hay red. Con --geo solo se hace una pasada.
const geo = Number(args.find((a) => a.startsWith("--geo="))?.split("=")[1] ?? 0);
const rows: Row[] = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const md5 = (t: string) => createHash("md5").update(t).digest("hex");
const state = new Map<string, Row>();
const audit: Row[] = [];
const byId = new Map(rows.map((r) => [r.id, r]));

const generic = (n: string | null) => !n || !n.trim() || /^(particular|anuncio particular|propietari[oa]|anunciante|privado|usuario|contacto)$/i.test(n.trim()) || /^((alquiler|venta) de )?(piso|apartamento|ático|atico|chalet|casa|dúplex|estudio|loft|local|finca|flat|studio|penthouse|villa)\b.* (en|in|for) /i.test(n) || /^[+0-9 ]{7,}$/.test(n.trim());
const ok = (data: any) => ({ data, error: null });

const fakeDb = {
  async rpc(name: string, a: Row = {}) {
    switch (name) {
      case "particulares_enrich_index_pending":
        return ok(rows.filter((r) => r.description && state.get(r.id)?.desc_md5 !== md5(r.description)).length);
      case "particulares_enrich_index_queue":
        return ok(rows.filter((r) => r.description && state.get(r.id)?.desc_md5 !== md5(r.description)).slice(0, a.p_limit).map((r) => ({ id: r.id, description: r.description, desc_md5: md5(r.description) })));
      case "particulares_enrich_state_index":
        for (const e of a.p) state.set(e.id, { desc_md5: e.desc_md5, phones: e.phones, rules_version: 0, candidates: [], dismissed: [] });
        return ok(a.p.length);
      case "particulares_enrich_queue":
        return ok(
          rows
            .filter((r) => r.is_active && r.advertiser_type !== "professional" && !r.is_ad_professional && r.description && state.get(r.id)?.desc_md5 === md5(r.description) && state.get(r.id)?.rules_version !== a.p_rules)
            .slice(0, a.p_limit)
            .map((r) => ({ ...r, desc_md5: md5(r.description), dismissed: state.get(r.id)?.dismissed ?? [] })),
        );
      case "particulares_enrich_phone_rows": {
        const out: Row[] = [];
        for (const key of a.p_keys as string[]) {
          const vs = new Set([`+${key}`, key, key.startsWith("34") ? key.slice(2) : key]);
          for (const r of rows) if (vs.has(r.phone) || vs.has(r.phone2) || state.get(r.id)?.phones?.includes(key)) out.push({ key, ...r });
        }
        return ok(out);
      }
      case "particulares_enrich_state_save":
        for (const e of a.p) {
          const s = state.get(e.id);
          if (s && s.desc_md5 === e.desc_md5) Object.assign(s, { rules_version: e.rules_version, candidates: e.candidates });
        }
        return ok(a.p.length);
      case "particulares_enrichment_apply": {
        const r = byId.get(a.p_id)!;
        const v = a.p_after;
        let reason: string | null = null;
        if (a.p_field === "phone") {
          if ((r.phone ?? "").trim()) reason = "telefono_ocupado";
          else Object.assign(r, { phone: v.phone, chat_only: false, phone_source: "description" });
        } else if (a.p_field === "phone2") {
          if (!(r.phone ?? "").trim()) reason = "sin_telefono_principal";
          else if ((r.phone2 ?? "").trim()) reason = "phone2_ocupado";
          else r.phone2 = v.phone2;
        } else if (a.p_field === "address") {
          if (a.p_expected && (r.address ?? null) !== (a.p_expected.address ?? null)) reason = "cambio_concurrente";
          else r.address = v.address;
        } else if (a.p_field === "owner_name") {
          if (!generic(r.owner_name)) reason = "nombre_real_ya_existe";
          else r.owner_name = v.owner_name;
        } else if (r.location_precision === "exact") reason = "pin_exacto_existente";
        else Object.assign(r, { latitude: v.latitude, longitude: v.longitude, location_precision: "exact" });
        if (reason) return ok({ ok: false, reason });
        audit.push({ id: a.p_id, campo: a.p_field, despues: v, regla: a.p_rule, confianza: a.p_conf, evidencia: a.p_evidence });
        return ok({ ok: true, id: String(audit.length) });
      }
      default:
        return { data: null, error: { message: `rpc no simulada: ${name}` } };
    }
  },
};

async function preIndex() {
  // El índice se rellena en memoria con el mismo extractor que usa el job (allPhoneKeys).
  const { allPhoneKeys } = await import("../lib/particulares/enrich-from-description.ts");
  for (const r of rows) if (r.description) state.set(r.id, { desc_md5: md5(r.description), phones: allPhoneKeys(r.description), rules_version: 0, candidates: [], dismissed: [] });
}

let last: any;
if (!apply || geo) {
  // dry no escribe índice, y con --geo hacemos una sola pasada: se indexa en memoria y se evalúa una vez.
  await preIndex();
  last = await runParticularesEnrich({ db: fakeDb, dryRun: !apply, limit, maxGeocode: geo });
} else {
  let rounds = 0;
  do {
    last = await runParticularesEnrich({ db: fakeDb, dryRun: false, limit, indexLimit: 50000, maxGeocode: 0 });
    rounds++;
  } while ((last.note || last.evaluated + last.deferredForGeocode > 0) && rounds < 100);
}
console.log(JSON.stringify({ ...last, sample: undefined }, null, 2));
if (apply) {
  const por = audit.reduce<Record<string, number>>((m, a) => ((m[`${a.campo}|${a.regla}`] = (m[`${a.campo}|${a.regla}`] ?? 0) + 1), m), {});
  console.log("auditoría (en memoria):", por);
  const cands = [...state.values()].reduce((n, s) => n + s.candidates.length, 0);
  console.log("candidatos guardados:", cands, "· filas evaluadas:", [...state.values()].filter((s) => s.rules_version > 0).length);
}
if (last.sample?.length) {
  console.log("\nprimeras propuestas:");
  for (const s of last.sample.slice(0, 12)) console.log(`  [${s.confidence}/${s.decision}] ${s.field}=${s.value}  (${s.rule})  «${s.evidence.slice(0, 100)}»`);
}
