/**
 * Test del scraper de INNEA Properties (web eGO Real Estate, mismo motor que
 * Housely). El fixture `scripts/fixtures/innea-properties.json` es la respuesta
 * REAL de `websiteapi.egorealestate.com/v1/Properties` del 2026-10-21 recortada
 * a seis inmuebles: pisos de Salamanca/Chamberí/Centro, un estudio en
 * Arganzuela, un chalet en Somosaguas y una oficina.
 *
 * No hace red. Ejecutar: npm run test:innea
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { INNEA } from "../lib/sync/scrapers/innea.ts";
import {
  cleanEgoDescription,
  egoSourceUrl,
  mapEgoProperty,
  type EgoProperty,
} from "../lib/sync/scrapers/ego.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond
    ? (ok++, console.log(`  ✓ ${name}`))
    : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures", "innea-properties.json"), "utf8"),
) as { Properties: EgoProperty[] };
const byId = (id: number) => {
  const p = fixture.Properties.find((x) => x.ID === id);
  if (!p) throw new Error(`falta ${id} en el fixture`);
  return p;
};
const map = (id: number) => mapEgoProperty(INNEA, byId(id));

console.log("── piso de Salamanca (25974832) ──");
const piso = map(25974832);
check("se importa", piso !== null);
check("venta", piso?.operation === "sale", piso?.operation);
check("zona Salamanca (sin 'Barrio de')", piso?.zone === "Salamanca", piso?.zone);
check("URL de origen con /detalles-del-inmueble/ (verificada contra el sitemap)",
  piso?.sourceUrl === "https://www.inneaproperties.com/detalles-del-inmueble/piso-reformado-en-conde-de-penalver-barrio-de-salamanca/25974832",
  piso?.sourceUrl);
check("fotos ZOriginal", !!piso && piso.photos.length > 0 && piso.photos.every((f) => f.url.includes("/ZOriginal/")), piso?.photos);
check("título sin marca", !/innea/i.test(piso?.title ?? ""), piso?.title);

console.log("── descripción saneada ──");
const allDesc = fixture.Properties.map((p) => cleanEgoDescription(INNEA, p.Description)).join("\n");
check("sin la marca en ningún inmueble", !/innea/i.test(allDesc), allDesc.match(/.{0,60}innea.{0,60}/i)?.[0]);
check("sin llamadas a contactar", !/cont[aá]ct|concertar una visita|m[aá]s informaci[oó]n/i.test(allDesc));
check("'INNEA Properties presenta esta…' → 'Esta…'",
  cleanEgoDescription(INNEA, "INNEA Properties presenta esta exclusiva vivienda de 137 m2 a reformar.").startsWith("Esta exclusiva vivienda"),
  cleanEgoDescription(INNEA, "INNEA Properties presenta esta exclusiva vivienda de 137 m2 a reformar."));
check("frase de cierre con la marca desaparece entera",
  cleanEgoDescription(INNEA, "Salón amplio.\n\nEn INNEA Properties estaremos encantados de acompañarle durante todo el proceso de compra.") === "Salón amplio.",
  cleanEgoDescription(INNEA, "Salón amplio.\n\nEn INNEA Properties estaremos encantados de acompañarle durante todo el proceso de compra."));

console.log("── criterios ──");
check("la oficina se descarta", map(24975809) === null);
check("el estudio de Arganzuela entra (sin filtro de zona)", map(26031329)?.zone === "Arganzuela", map(26031329)?.zone);
check("el chalet de Somosaguas entra como Chalet", map(26257700)?.propertyType === "Chalet", map(26257700)?.propertyType);
check("piso de Centro con subzona desde el título o la descripción", map(26305205) !== null);

console.log("── todo el fixture ──");
const mapped = fixture.Properties.map((p) => mapEgoProperty(INNEA, p));
check("5 de 6 se importan (todos menos la oficina)", mapped.filter(Boolean).length === 5, mapped.map((p) => p?.externalId));
check("URL de origen de todos bajo /detalles-del-inmueble/",
  fixture.Properties.every((p) => egoSourceUrl(INNEA, p).startsWith("https://www.inneaproperties.com/detalles-del-inmueble/")));

console.log(`\n${ok} ok, ${fail} fallos`);
if (fail > 0) process.exit(1);
