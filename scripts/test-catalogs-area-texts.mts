/**
 * Tests de las plantillas «Vivir en…» (0222, expediente 2026-10-21-bcp-01-
 * ampliacion-textos-idiomas, PR3). Puros, sin base de datos, red ni IA real
 * (la «IA» es una función falsa). Las reglas de la base de datos se prueban en
 * scripts/sql/test-catalog-area-texts.sql.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-area-texts.mts
 */
import { readFileSync } from "node:fs";
import {
  areaDraftSystemPrompt,
  areaTextBlockers,
  areaTextErrorMessage,
  areaTextEntriesFromRows,
  areaTextWarnings,
  copyShown,
  draftAreaText,
  neighborhoodArea,
  seedPlan,
  templateFor,
  type NeighborhoodRow,
} from "../lib/catalogs/area-texts.ts";
import { areaById } from "../lib/catalogs/areas.ts";
import { deriveEditorial, type EditorialInput } from "../lib/catalogs/editorial.ts";
import { organizeDescription } from "../lib/catalogs/structure.ts";

let failures = 0;
let passes = 0;
function ok(cond: unknown, msg: string, detail?: string) {
  if (cond) passes++;
  else {
    failures++;
    console.error(`❌ ${msg}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), msg, `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const TPL = "Recoletos es un barrio de fincas señoriales y calles arboladas.";

console.log("· la plantilla entra solo si no hay texto propio de la zona (DA25, AC12)");
const org = (paragraphs: string[], areaText: string | null) => organizeDescription({ lead: "Piso exterior.", paragraphs, area: "Recoletos", areaText });
const a1 = org(["El salón es amplio y luminoso."], TPL);
eq(a1.copy.find((b) => b.heading === "Vivir en Recoletos")?.text, TPL, "sin material de zona: la plantilla forma «Vivir en Recoletos»");
ok(!a1.missing.includes("barrio"), "…y la zona ya no figura como «sin material»");
const a2 = org(["El salón es amplio. El barrio tiene comercio y metro a dos pasos."], TPL);
const barrio2 = a2.copy.find((b) => b.heading === "Vivir en Recoletos")?.text ?? "";
ok(barrio2.includes("comercio") && !barrio2.includes(TPL), "con texto propio de la zona: la plantilla no se añade ni lo sustituye");
eq(a2.copy.map((b) => b.text).join(" ").split(TPL).length - 1, 0, "la plantilla no aparece en ninguna otra parte");
eq(org(["El salón es amplio."], null).missing.includes("barrio"), true, "sin plantilla: igual que antes");

const base: EditorialInput = {
  description: null, features: null, features_manual: null, bedrooms: 2, bathrooms: 1, square_meters: 80, zone: "Salamanca", subzone: "Recoletos",
  cleanDescription: "Piso exterior y reformado. El salón es amplio y luminoso.", cleanFeatures: [], photos: [{ u: "0" }], coverIndex: 0,
  area: { name: "Recoletos", level: "barrio" },
};
const heads = (x: EditorialInput) => deriveEditorial(x).copy.map((b) => [b.heading, b.text] as const);
ok(heads({ ...base, areaText: TPL }).some(([h, t]) => h === "Vivir en Recoletos" && t === TPL), "lector (descripción limpia): «Vivir en Recoletos» con la plantilla");
ok(heads({ ...base, text: { b: "Un piso con mucha luz.\n\nEl salón da a la calle.", l: null, h: [] }, areaText: TPL }).some(([h, t]) => h === "Vivir en Recoletos" && t === TPL), "lector (texto del catálogo): también");
ok(!heads({ ...base, areaText: "Recoletos. Más información en la inmobiliaria." }).some(([h]) => h === "Vivir en Recoletos"), "una plantilla con mención de agencia no se publica");
const facts = deriveEditorial({ ...base, cleanDescription: null, areaText: TPL });
ok(facts.level === "facts" && facts.copy.length === 0, "ficha breve (solo datos): sin cambios (no se inventa un texto solo de zona)");

console.log("· el lector y el PDF usan la misma copia");
const toPublic = readFileSync("lib/catalogs/to-public.ts", "utf8");
ok(/areaText: typeof it\.at === "string" \? it\.at : null/.test(toPublic), "to-public pasa «at» al organizador (el PDF usa el mismo contrato público)");

console.log("· comprobación de la plantilla (DA26)");
const ids = (t: string) => areaTextWarnings(t).map((w) => w.id);
eq(ids("Recoletos es la cara más señorial del barrio de Salamanca, a un paso del Retiro."), ["distance"], "«a un paso» es una distancia");
eq(ids("A veinte minutos del centro por la A-6."), ["distance"], "«veinte minutos»");
ok(areaTextWarnings("Recoletos es la cara más señorial del barrio de Salamanca, a un paso del Retiro.")[0].excerpt.includes("a un paso del Retiro"), "el aviso cita el texto tal como está escrito");
eq(ids("Muchas fincas tienen vistas al parque y portero."), ["views", "building"], "vistas y servicios del edificio");
eq(ids("El piso tiene tres dormitorios."), ["home"], "características de la vivienda");
eq(ids("Contacte con la inmobiliaria."), ["agency"], "mención de agencia");
eq(ids("El Viso es una colonia de hotelitos de los años treinta, con calles de poco tráfico."), [], "una descripción general no da avisos");
eq(ids("Predomina la vivienda de media altura. Su referencia verde es el parque."), [], "la edificación del barrio y «referencia verde» no son avisos");
eq(areaTextBlockers("Llama al 612 345 678"), ["text_has_contact"], "teléfono: bloquea");
eq(areaTextBlockers("Desde 900.000 €"), ["text_has_price"], "precio: bloquea");

console.log("· siembra desde neighborhoods: solo nombre exacto y distrito compatible");
const mig = readFileSync("supabase/migrations/0144_smartlink_v2.sql", "utf8") + readFileSync("supabase/migrations/0145_neighborhood_layer.sql", "utf8");
const rows: NeighborhoodRow[] = [];
for (const m of mig.matchAll(/\('es', '([a-z0-9-]+)', '((?:[^']|'')+)', '((?:[^']|'')+)', '\{([^}]*)\}', (?:'([^']+)'|NULL|null), '([^']+)'/g))
  rows.push({ zone_key: m[1], display_name: m[2].replace(/''/g, "'"), intro: m[3].replace(/''/g, "'"), aliases: m[4] ? m[4].split(",").map((x) => x.replace(/"/g, "")) : [], district: m[5] ?? null, municipality: m[6] });
for (const m of mig.matchAll(/\n  \('([a-z0-9-]+)', '((?:[^']|'')+)',\n   '((?:[^']|'')+)'/g)) rows.push({ zone_key: m[1], display_name: m[2], intro: m[3].replace(/''/g, "'") });
eq(rows.length, 29, "las 29 introducciones de 0144/0145");
const mapped = rows.map((r) => [r.zone_key, neighborhoodArea(r).area?.id ?? null] as const);
const byKey = Object.fromEntries(mapped);
eq(mapped.filter(([, a]) => a).length, 24, "24 se asignan a una zona del registro");
eq(mapped.filter(([, a]) => !a).map(([k]) => k).sort(), ["la-moraleja", "pozuelo", "prado-de-somosaguas", "somosaguas", "torrelodones"], "las de fuera de Madrid no se asignan");
eq([byKey.salamanca, byKey.castellana, byKey.chueca, byKey["el-viso"]], ["madrid/salamanca", "madrid/salamanca/castellana", "madrid/centro/chueca", "madrid/chamartin/el-viso"], "distrito, barrio, nombre popular y artículo");
eq(neighborhoodArea({ zone_key: "goya", display_name: "Goya", intro: "x", district: "Chamberí" }).area, null, "distrito que no encaja: no se asigna");
const plan = seedPlan(rows, new Set(["madrid/salamanca/recoletos"]));
ok(plan.items.length === 23 && plan.existing.length === 1 && plan.unmapped.length === 5, "plan: 23 nuevas, 1 con versiones (no se toca) y 5 fuera", JSON.stringify([plan.items.length, plan.existing.length, plan.unmapped.length]));
ok(plan.items.every((i) => areaTextBlockers(i.body).length === 0), "ningún texto sembrado tiene contacto ni precio");
const withWarnings = plan.items.filter((i) => areaTextWarnings(i.body).length > 0).map((i) => i.key);
eq(withWarnings, ["chamberi", "retiro"], "solo los textos con distancias quedan señalados para revisar («en pocos minutos de metro», «a un paseo»)");

console.log("· plantilla que toca: barrio antes que distrito; copia solo con zona vigente (DA23, DA37)");
const entries = areaTextEntriesFromRows([
  { id: "v1", area_id: "madrid/salamanca", seq: 1, body: "Distrito.", status: "approved", origin: "manual" },
  { id: "v2", area_id: "madrid/salamanca/goya", seq: 3, body: "Goya.", status: "approved", origin: "neighborhoods", source_key: "goya" },
  { id: "v3", area_id: "madrid/salamanca/goya", seq: 4, body: "Goya nuevo.", status: "draft", origin: "manual" },
]);
eq(templateFor(entries, "madrid/salamanca/goya")?.version.id, "v2", "barrio con plantilla: la del barrio (el borrador no cuenta)");
eq(templateFor(entries, "madrid/salamanca/lista")?.version.id, "v1", "barrio sin plantilla: la del distrito");
eq(templateFor(entries, "madrid/retiro/ibiza"), null, "sin plantilla en el barrio ni en el distrito: ninguna");
eq(templateFor(entries, null), null, "sin zona confirmada: ninguna");
ok(copyShown("madrid/salamanca", { areaId: "madrid/salamanca/goya", current: true }), "copia del distrito con barrio confirmado: se ve");
ok(!copyShown("madrid/salamanca/goya", { areaId: "madrid/salamanca/lista", current: true }), "copia de otro barrio: no se ve");
ok(!copyShown("madrid/salamanca/goya", { areaId: "madrid/salamanca/goya", current: false }), "confirmación no vigente: no se ve");
ok(!copyShown("madrid/salamanca/goya", { areaId: null, current: true }), "«sin zona verificada»: no se ve");

console.log("· «Borrador con IA»: solo al pulsar, con IA inyectada");
let calls = 0;
const fake = async (o: { system: string; userText: string }) => {
  calls++;
  ok(o.system.includes("No inventes") && o.system.includes("ni distancias"), "el prompt prohíbe inventar y hablar de la vivienda");
  ok(JSON.parse(o.userText).zona === "Goya" && JSON.parse(o.userText).distrito === "Salamanca", "la IA solo recibe la zona y su distrito");
  return JSON.stringify({ body: "Goya es un barrio de comercio y vida de barrio." });
};
eq(await draftAreaText(areaById("madrid/salamanca/goya")!, fake), "Goya es un barrio de comercio y vida de barrio.", "devuelve la propuesta sin guardarla");
eq(calls, 1, "una sola llamada");
ok(areaDraftSystemPrompt().includes("50 y 110 palabras"), "longitud acotada");
let failed = false;
try {
  await draftAreaText(areaById("madrid/salamanca/goya")!, async () => JSON.stringify({ body: "" }));
} catch {
  failed = true;
}
ok(failed, "respuesta vacía: error, nada que guardar");

console.log("· elegir o aplicar una plantilla no gasta IA (AC12)");
const actions = readFileSync("app/[country]/(admin)/admin/mi-espacio/actions.ts", "utf8");
const applyFn = actions.slice(actions.indexOf("export async function applyAreaTextAction"), actions.indexOf("export async function loadAreaTextsPageAction"));
ok(applyFn.length > 0 && !/realAi|aiComplete|draftAreaText/.test(applyFn), "aplicar y quitar no llaman a la IA");
const seedFn = actions.slice(actions.indexOf("export async function seedAreaTextsAction"), actions.indexOf("export async function draftAreaTextAiAction"));
ok(seedFn.length > 0 && !/realAi|aiComplete|draftAreaText/.test(seedFn), "sembrar no llama a la IA");
for (const f of ["lib/catalogs/area-texts.ts", "lib/catalogs/area-text-data.ts", "components/admin/catalogs/area-texts-page.tsx", "components/admin/catalogs/catalog-texts-panel.tsx", "lib/catalogs/texts.ts"]) {
  ok(!/aiComplete|services\/ai/.test(readFileSync(f, "utf8")), `sin proveedor de IA: ${f}`);
}

console.log("· errores de 0222 → mensajes");
ok(areaTextErrorMessage("ERROR: area_text_unavailable")?.includes("Confirma la zona"), "area_text_unavailable");
ok(areaTextErrorMessage("draft_changed")?.includes("cambió"), "draft_changed");
eq(areaTextErrorMessage("otra cosa"), null, "otro error: no es de las plantillas");

console.log("· comprobaciones de fuente de 0222");
const sql = readFileSync("supabase/migrations/0222_catalog_area_texts.sql", "utf8").replace(/--.*$/gm, "");
ok(!/UPDATE properties|INSERT INTO properties|UPDATE neighborhoods|INSERT INTO neighborhoods|DELETE FROM neighborhoods/.test(sql), "0222 no escribe en la ficha del CRM ni en neighborhoods");
ok(/ac\.area_id = a\.id OR ac\.area_id = a\.district_id/.test(sql) && /d\.input_sig = catalog_area_input_sig\(ac\.property_id\)/.test(sql), "la instantánea solo enseña la copia con zona vigente (o su distrito)");
ok(/ON CONFLICT \(catalog_id, property_id\) DO NOTHING/.test(sql), "al reutilizar, no se pisa la copia propia del catálogo");
ok(/status = 'draft'/.test(sql) && /'neighborhoods'/.test(sql) && !/catalog_area_text_seed[\s\S]{0,2000}status = 'approved'/.test(sql.slice(sql.indexOf("FUNCTION catalog_area_text_seed"), sql.indexOf("FUNCTION catalog_area_text_state"))), "la siembra solo crea borradores");

console.log(`\ntest-catalogs-area-texts: ${passes} comprobaciones, ${failures} fallos`);
if (failures) process.exit(1);
