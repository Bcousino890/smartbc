/**
 * Tests de la biblioteca de textos aprobados (0219, expediente
 * 2026-10-21-bcp-01-ampliacion-textos-idiomas, PR1). Puros, sin base de
 * datos, red ni IA: la capa de reglas y comprobaciones de fuente. Las reglas
 * de la base de datos se prueban en scripts/sql/test-catalog-copy.sql.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-copy.mts
 */
import { readFileSync } from "node:fs";
import {
  approvableParts,
  changedLabel,
  copyCandidateFromRow,
  copyErrorMessage,
  copyViewFromRow,
  partsLabel,
  pendingCandidateParts,
  publishedMatchesLibrary,
  type CopyCandidate,
} from "../lib/catalogs/copy-rules.ts";

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

console.log("· qué se puede aprobar de lo publicado");
eq(approvableParts({ title: "T", body: "B", lead: null }), "both", "título y descripción");
eq(approvableParts({ title: "T", body: null, lead: null }), "title", "solo título");
eq(approvableParts({ title: null, body: null, lead: "Entrada" }), "body", "solo entrada cuenta como descripción");
eq(approvableParts({ title: "  ", body: "", lead: null }), null, "nada");

console.log("· candidatos de la siembra (nada viene marcado; C2)");
const c = (o: Partial<CopyCandidate>): CopyCandidate => ({
  catalogId: "c", catalogTitle: "C", propertyId: "p", propertyTitle: "P", title: null, body: null, lead: null, bodyCurrent: null,
  maybePersonal: false, publishedAt: null, titleInLibrary: false, bodyInLibrary: false, ...o,
});
eq(pendingCandidateParts(c({ title: "T", body: "B", bodyCurrent: true })), "both", "título y descripción vigentes");
eq(pendingCandidateParts(c({ title: "T", body: "B", bodyCurrent: false })), "title", "descripción no vigente: solo el título");
eq(pendingCandidateParts(c({ title: "T", titleInLibrary: true, body: "B", bodyCurrent: true, bodyInLibrary: true })), null, "ya aprobado: nada pendiente");
eq(pendingCandidateParts(c({ title: "T", titleInLibrary: true, body: "B", bodyCurrent: true })), "body", "título ya aprobado: queda la descripción");
const row = copyCandidateFromRow({ catalog_id: "c1", catalog_title: "Cat", property_id: "p1", property_title: "Piso", pub_title: "T", pub_body: null, pub_lead: null,
  body_current: null, has_personal_links: true, published_at: "2026-10-21", title_in_library: false, body_in_library: false });
ok(row.maybePersonal && row.bodyCurrent === null && row.title === "T", "fila de candidatos: asignaciones personales señaladas");

console.log("· estado de la biblioteca");
const v = copyViewFromRow({ version_id: "v", seq: 3, title: "T", body: "B", lead: null, body_current: false, changed: ["bedrooms", "features"],
  title_approved_at: null, body_approved_at: null, title_catalog_title: "A", body_catalog_title: "A" });
ok(v.seq === 3 && v.bodyCurrent === false && v.changed.length === 2, "versión con descripción no vigente y sus cambios");
eq(changedLabel(v.changed), "los dormitorios, las características", "etiqueta de cambios");
eq(publishedMatchesLibrary({ title: "T", body: "B", lead: null }, v), { title: true, body: true }, "lo publicado coincide con la biblioteca");
eq(publishedMatchesLibrary({ title: "Otro", body: "B", lead: null }, v), { title: false, body: true }, "título distinto");
eq(publishedMatchesLibrary({ title: "T", body: "B", lead: null }, null), { title: false, body: false }, "sin biblioteca");
eq(partsLabel("both"), "título y descripción", "etiqueta de partes");

console.log("· errores de 0219 → mensajes");
ok(copyErrorMessage('ERROR: text_stale')?.includes("ya no corresponde"), "text_stale");
ok(copyErrorMessage("title_not_published")?.includes("no está publicado"), "title_not_published");
eq(copyErrorMessage("conexión rechazada"), null, "otro error: no es de la biblioteca");

console.log("· comprobaciones de fuente (N1, DA33, sin IA)");
const panel = readFileSync("components/admin/catalogs/catalog-texts-panel.tsx", "utf8");
ok(/const \[approveOnPublish, setApproveOnPublish\] = useState\(false\)/.test(panel), "N1: la casilla viene desmarcada");
ok(/Guardar como texto aprobado de la vivienda/.test(panel), "la casilla tiene el texto aprobado");
const page = readFileSync("components/admin/catalogs/copy-library-page.tsx", "utf8");
ok(/useState<Set<string>>\(new Set\(\)\)/.test(page), "siembra: ningún candidato viene marcado");
const sql = readFileSync("supabase/migrations/0219_catalog_copy_library.sql", "utf8");
ok(/IF NOT EXISTS \(SELECT 1 FROM catalog_texts WHERE catalog_id = p_catalog AND property_id = p_property\) THEN/.test(sql), "DA33: solo entradas sin ningún texto");
ok(!/FUNCTION catalog_convert_explicit|FUNCTION catalog_set_mode/.test(sql), "DA33: conversión y cambio de modo intactos");
ok(!/UPDATE properties|INSERT INTO properties/.test(sql.replace(/--.*$/gm, "")), "0219 no escribe en la ficha del CRM");
ok(/text_stale/.test(sql) && /pub_source_hash IS DISTINCT FROM catalog_source_hash/.test(sql), "C2: no se aprueba una descripción no vigente");
for (const f of ["lib/catalogs/copy-rules.ts", "lib/catalogs/copy-library.ts", "components/admin/catalogs/copy-library-page.tsx"]) {
  ok(!/aiComplete|services\/ai/.test(readFileSync(f, "utf8")), `sin IA: ${f}`);
}

console.log(`\ntest-catalogs-copy: ${passes} comprobaciones, ${failures} fallos`);
if (failures) process.exit(1);
