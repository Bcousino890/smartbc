/**
 * Tests del registro de zonas y de la clasificación prudente (0220, expediente
 * 2026-10-21-bcp-01-ampliacion-textos-idiomas, PR2). Puros, sin base de
 * datos, red ni IA. Las reglas de la base de datos se prueban en
 * scripts/sql/test-catalog-areas.sql.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-areas.mts
 */
import { readFileSync } from "node:fs";
import {
  addressNamesStreet,
  areaById,
  areaErrorMessage,
  areaLabel,
  areaOptions,
  areaRegistry,
  areaRows,
  areaViewOf,
  classifyLocation,
  confirmedAreaOf,
} from "../lib/catalogs/areas.ts";
import { deriveEditorial, livingAreaName, type EditorialInput } from "../lib/catalogs/editorial.ts";
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

console.log("· registro con identidad estable");
const reg = areaRegistry();
eq(reg.length, 165, "21 distritos y 144 barrios");
eq(reg.filter((a) => a.level === "distrito").length, 21, "21 distritos");
eq(new Set(reg.map((a) => a.id)).size, reg.length, "ids únicos");
eq(new Set(reg.flatMap((a) => a.terms)).size, reg.flatMap((a) => a.terms).length, "ningún término nombra dos zonas");
ok(reg.every((a) => a.level === "distrito" ? a.districtId === null : !!areaById(a.districtId)), "cada barrio cuelga de un distrito del registro");
eq(areaById("madrid/salamanca/recoletos")?.districtId, "madrid/salamanca", "Recoletos es de Salamanca");
eq(areaById("madrid/centro/chueca")?.officialId, "madrid/centro/justicia", "Chueca → Justicia (nombre popular)");
ok(areaById("madrid/latina/las-aguilas")?.terms.includes("aguilas") && !areaById("madrid/latina/aguilas"), "Águilas es alias de Las Águilas");
eq(areaLabel(areaById("madrid/salamanca/recoletos")!), "Recoletos (Salamanca)", "etiqueta con distrito");
eq(areaOptions().length, 21, "opciones agrupadas por distrito");

console.log("· el registro y la migración no se separan");
const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const mig = readFileSync("supabase/migrations/0220_catalog_areas.sql", "utf8");
const missingRows = areaRows().filter((r) => !mig.includes(`(${q(r.id)}, ${q(r.level)}, ${q(r.name)}, ${q(r.district_id)}, ${q(r.official_id)}, ARRAY[${r.terms.map(q).join(", ")}]::text[])`));
eq(missingRows.map((r) => r.id), [], "cada fila del registro está en 0220 tal cual");
eq((mig.match(/^\s+\('madrid\//gm) ?? []).length, 165, "0220 no tiene filas de más");

console.log("· clasificación prudente (DA23, DA37)");
const c = (zone: string | null, subzone: string | null, address: string | null = null) => classifyLocation({ zone, subzone, address });
const r1 = c("Salamanca", "Recoletos", "Calle Serrano 40");
ok(r1.status === "auto" && r1.areaId === "madrid/salamanca/recoletos", "Recoletos en Salamanca: automática", JSON.stringify(r1));
eq(c("Salamanca", "Goya", "Calle Velázquez 50").status, "auto", "Goya sin la calle Goya: automática");
eq(c("Chamartín", "Castellana").status, "conflicto", "Castellana con distrito Chamartín: conflicto");
eq(c("Chamberí", "Recoletos").status, "conflicto", "Recoletos con distrito Chamberí: conflicto");
eq(c("Madrid", "Castellana, Chamartín").status, "conflicto", "zonas de distritos distintos en el barrio: conflicto");
eq(c("Salamanca", "Goya, Lista").status, "ambigua", "dos barrios a la vez: ambigua");
for (const [zone, sub, addr] of [
  ["Salamanca", "Goya", "Calle Goya 30"],
  ["Salamanca", "Goya", "C/ de Goya, 12"],
  ["Salamanca", "Castellana", "Paseo de la Castellana 50"],
  ["Salamanca", "Castellana", "Pº de la Castellana 12"],
  ["Salamanca", "Lista", "Calle Lista 10"],
  ["Retiro", "Ibiza", "Calle de Ibiza 3"],
] as const) {
  const r = c(zone, sub, addr);
  ok(r.status === "ambigua" && r.areaId?.endsWith(`/${sub.toLowerCase()}`), `${sub} con «${addr}»: ambigua (una calle no prueba el barrio)`, JSON.stringify(r));
}
eq(c("Salamanca", "Ibiza", "Calle de Ibiza 3").status, "conflicto", "Ibiza (Retiro) con distrito Salamanca: conflicto antes que calle");
eq(c("Chamberí", "Almagro", "Calle Almagro 20").status, "ambigua", "Almagro con la calle Almagro: ambigua");
eq(c("Chamberí", "Almagro", "Calle Zurbano 20").status, "auto", "Almagro sin la calle: automática");
eq(c("Centro", "Chueca").areaId, "madrid/centro/chueca", "Chueca: su zona popular");
const rd = c("Madrid", "Retiro");
ok(rd.status === "auto" && rd.areaId === "madrid/retiro", "distrito en el barrio: el distrito", JSON.stringify(rd));
eq(c("Pozuelo de Alarcón", null).status, "sin_clasificar", "fuera de Madrid: sin clasificar");
eq(c(null, null).status, "sin_clasificar", "sin zona: sin clasificar");
eq(c("Latina", "Águilas").areaId, "madrid/latina/las-aguilas", "casi-duplicado: la zona canónica");
ok(addressNamesStreet("Plaza de Castilla 3", areaById("madrid/chamartin/castilla")!), "«Plaza de Castilla» nombra Castilla como calle");
ok(!addressNamesStreet("Calle Serrano 40", areaById("madrid/salamanca/goya")!), "otra calle no nombra Goya");
ok(!addressNamesStreet("Goya 5, bajo", areaById("madrid/salamanca/goya")!), "sin «calle/paseo…» no se da por calle");

console.log("· «Vivir en …»: solo con confirmación vigente (sin cambios silenciosos)");
const loc = { zone: "Salamanca", subzone: "Goya", address: "Calle Goya 30" };
const none = areaViewOf(loc, null);
ok(!none.verified && none.living === "Goya" && none.suggestion.status === "ambigua", "sin confirmar: la zona de la ficha, como antes");
const conf = areaViewOf(loc, { areaId: "madrid/salamanca/fuente-del-berro", current: true, decidedAt: null });
ok(conf.verified && conf.living === "Fuente del Berro", "confirmada y vigente: el nombre del registro");
const stale = areaViewOf(loc, { areaId: "madrid/salamanca/fuente-del-berro", current: false, decidedAt: null });
ok(!stale.verified && stale.living === "Goya", "confirmación no vigente: vuelve la zona de la ficha");
const blank = areaViewOf(loc, { areaId: null, current: true, decidedAt: null });
ok(blank.verified && blank.living === null, "«sin zona verificada»: ningún nombre (El barrio)");
eq(confirmedAreaOf({ areaId: "madrid/salamanca/goya", current: true, decidedAt: null }), { name: "Goya", level: "barrio" }, "lo que llega al lector: nombre y nivel");
eq(confirmedAreaOf({ areaId: "madrid/salamanca/goya", current: false, decidedAt: null }), null, "no vigente: nada llega al lector");
eq(confirmedAreaOf({ areaId: null, current: true, decidedAt: null }), { name: null, level: null }, "sin zona verificada: nombre nulo");
eq(livingAreaName({ zone: "Madrid", subzone: " Retiro ", area: undefined }), "Retiro", "sin 0220: igual que antes");
eq(livingAreaName({ zone: "Madrid", subzone: "Retiro", area: { name: null } }), null, "confirmada sin zona: null");

const base: EditorialInput = {
  description: null, features: null, features_manual: null, bedrooms: 2, bathrooms: 1, square_meters: 80, zone: "Salamanca", subzone: "Barrio de moda",
  cleanDescription: "Piso exterior y reformado. El barrio tiene comercio y metro a dos pasos.", cleanFeatures: [], photos: [{ u: "0" }], coverIndex: 0,
};
const heads = (x: EditorialInput) => deriveEditorial(x).copy.map((b) => b.heading).filter(Boolean);
eq(heads(base), ["Vivir en Barrio de moda"], "sin confirmación: la subzona tal cual (comportamiento de hoy)");
eq(heads({ ...base, area: { name: "Goya", level: "barrio" } }), ["Vivir en Goya"], "confirmada: el nombre del registro");
eq(heads({ ...base, area: { name: null, level: null } }), ["El barrio"], "sin zona verificada: «El barrio»");

console.log("· una calle con el nombre de la zona no es el barrio (2.4)");
const head = (area: string, p: string) => organizeDescription({ lead: "Piso exterior.", paragraphs: [p], area }).copy.find((b) => b.heading)?.heading ?? null;
eq(head("Castellana", "La finca da al paseo de la Castellana."), "La finca", "«paseo de la Castellana» no arrastra la frase al barrio");
eq(head("Goya", "El salón es amplio y da a la calle de Goya."), head("Goya", "El salón es amplio y da a la calle de Serrano."), "«calle de Goya» pesa como cualquier otra calle");
eq(head("Castellana", "Castellana tiene comercio y servicios."), "Vivir en Castellana", "el nombre suelto sí es el barrio");
eq(head("Goya", "Goya es un barrio con mucha vida."), "Vivir en Goya", "el barrio por su nombre");

console.log("· errores de 0220 → mensajes");
ok(areaErrorMessage("ERROR: area_not_found")?.includes("registro"), "area_not_found");
eq(areaErrorMessage("otra cosa"), null, "otro error: no es de las zonas");

console.log("· comprobaciones de fuente (DA24, sin IA)");
const sql = mig.replace(/--.*$/gm, "");
ok(!/UPDATE properties|INSERT INTO properties/.test(sql), "0220 no escribe en la ficha del CRM");
ok(!/catalog_groups|catalog_zone_terms|catalog_select/.test(sql.replace(/CREATE OR REPLACE FUNCTION catalog_internal_snapshot[\s\S]*?\$\$;/, "")), "0220 no toca grupos, términos ni búsqueda");
ok(/d\.owner_id = c\.owner_id/.test(sql) && /d\.input_sig = catalog_area_input_sig\(l\.property_id\)/.test(sql), "la instantánea solo usa la confirmación vigente del dueño del catálogo");
for (const f of ["lib/catalogs/areas.ts", "lib/catalogs/area-data.ts", "components/admin/catalogs/catalog-texts-panel.tsx"]) {
  ok(!/aiComplete|services\/ai/.test(readFileSync(f, "utf8")), `sin IA: ${f}`);
}

console.log(`\ntest-catalogs-areas: ${passes} comprobaciones, ${failures} fallos`);
if (failures) process.exit(1);
