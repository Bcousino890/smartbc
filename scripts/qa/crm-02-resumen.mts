// SOLO PRUEBAS LOCALES (CRM-02). Resume las salidas de crm-02-medir.sh:
// mediana (mín–máx) por navegación, separando pasadas en frío y en
// caliente, y comprueba que las consultas (deterministas) no varían entre
// pasadas. Todo lo que imprime es local o simulado: no son tiempos de
// producción.
//
//   node --experimental-strip-types scripts/qa/crm-02-resumen.mts <carpeta> <etiqueta> [<etiqueta-b>]
//
// Con dos etiquetas compara la primera (antes) con la segunda (después).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Aislada = { peticion: string; bytesSinComprimir: number; bytesGzip: number; consultas: { total: number } };
type Grupo = { peticiones: number; consultasTotal: number; consultasPorPeticion: number };
type Medicion = {
  recorrido: string;
  navegacion: string;
  primerIndicadorMs: number | null;
  primerCambioMs: number | null;
  utilMs: number;
  tareasLargasMs: number | null;
  navegacionAislada: Aislada[];
  precargasAisladas?: Grupo;
  apisAisladas?: Grupo;
};
type Salida = {
  variante: string;
  etiqueta: string;
  pasada: string | null;
  comprobaciones: { ok: boolean }[];
  mediciones: Medicion[];
  notificacionesPorRecorrido?: Record<string, number>;
};

const [dir, labelA, labelB] = process.argv.slice(2);
if (!dir || !labelA) {
  console.error("uso: crm-02-resumen.mts <carpeta> <etiqueta> [<etiqueta-b>]");
  process.exit(1);
}

const load = (label: string) =>
  readdirSync(dir)
    .filter((f) => f.startsWith(`${label}-`) && f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Salida)
    // La variante va en la etiqueta (`<etiqueta>-escritorio-lat40`).
    .map((s) => ({ ...s, variante: s.etiqueta.slice(label.length + 1) }));

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const stat = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  if (!v.length) return "—";
  return `${median(v)} (${Math.min(...v)}–${Math.max(...v)})`;
};

type Row = { key: string; frio: Medicion[]; caliente: Medicion[] };
function rows(outs: Salida[], variant: string): Row[] {
  const map = new Map<string, Row>();
  for (const o of outs.filter((x) => x.variante === variant)) {
    const kind = (o.pasada ?? "").startsWith("caliente") ? "caliente" : "frio";
    for (const m of o.mediciones) {
      const key = `${m.recorrido.split(" ")[0]} ${m.navegacion}`;
      if (!map.has(key)) map.set(key, { key, frio: [], caliente: [] });
      map.get(key)![kind].push(m);
    }
  }
  return [...map.values()];
}

function report(label: string) {
  const outs = load(label);
  if (!outs.length) {
    console.log(`(sin salidas para ${label})`);
    return;
  }
  console.log(`\n## ${label} — ${outs.length} pasadas (LOCAL; «lat40» = 40 ms simulados; «movil» = CPU y red simuladas)\n`);
  for (const variant of [...new Set(outs.map((o) => o.variante))].sort()) {
    const vs = outs.filter((o) => o.variante === variant);
    const ok = vs.map((o) => `${o.comprobaciones.filter((c) => c.ok).length}/${o.comprobaciones.length}`);
    console.log(`### ${variant} · contrato: ${[...new Set(ok)].join(", ")}`);
    console.log("| navegación | indicador frío (ms) | útil frío (ms) | útil caliente (ms) | tareas largas (ms) | consultas aislada | KB sin comprimir | precargas: nº (consultas) | /api: nº (consultas) |");
    console.log("|---|---|---|---|---|---|---|---|---|");
    for (const r of rows(vs, variant)) {
      const all = [...r.frio, ...r.caliente];
      const q = [...new Set(all.map((m) => m.navegacionAislada.map((a) => a.consultas.total).join("+")))];
      const kb = [...new Set(all.map((m) => m.navegacionAislada.map((a) => Math.round(a.bytesSinComprimir / 1024)).join("+")))];
      const pre = median(all.map((m) => m.precargasAisladas?.consultasTotal ?? 0));
      const preN = median(all.map((m) => m.precargasAisladas?.peticiones ?? 0));
      const apiN = median(all.map((m) => m.apisAisladas?.peticiones ?? 0));
      const api = median(all.map((m) => m.apisAisladas?.consultasTotal ?? 0));
      console.log(
        `| ${r.key} | ${stat(r.frio.map((m) => m.primerIndicadorMs))} | ${stat(r.frio.map((m) => m.utilMs))} | ${stat(r.caliente.map((m) => m.utilMs))} | ${stat(all.map((m) => m.tareasLargasMs))} | ${q.join(" / ") || "—"}${q.length > 1 ? " ⚠️ varía" : ""} | ${kb.join(" / ") || "—"} | ${preN} (${pre}) | ${apiN} (${api}) |`,
      );
    }
    const notif: Record<string, number[]> = {};
    for (const o of vs) for (const [k, v] of Object.entries(o.notificacionesPorRecorrido ?? {})) (notif[k.split(" ")[0]] ??= []).push(v);
    console.log(`\nPeticiones a /api/admin/notifications por recorrido (mediana): ${Object.entries(notif).map(([k, v]) => `${k}=${median(v)}`).join(" · ") || "—"}\n`);
  }
}

report(labelA);
if (labelB) report(labelB);
