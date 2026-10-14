// BCP-01 · QA de C2 — reproducción SINTÉTICA del riesgo de integridad (sin datos reales).
// ¿Sigue accesible cada capítulo aprobado de una historia en escritorio y en móvil?
// Uso, desde la raíz del repo:
//   node --import ./scripts/node-ts-loader.mjs docs/changes/2026-10-13-bcp-01-home-catalogo/qa-c2/reproduccion-integridad.mts
import { deriveEditorial } from "../../../../lib/catalogs/editorial.ts";
import { itemParts, journeyGroups, hasDetail } from "../../../../lib/catalogs/reader-state.ts";
import { storySourceHash } from "../../../../lib/services/story/source-hash.ts";
const CH = ["overview", "living", "kitchen", "private", "outdoor", "finishes", "building", "barrio", "living"];
const facts = { description: "Piso exterior en Goya.", bedrooms: 3, bathrooms: 2, squareMeters: 110, features: ["Ascensor"] };
function run(name: string, n: number, opts: { clean: string | null; manual: string[]; text?: boolean }) {
  const blocks = Array.from({ length: n }, (_, i) => ({ c: CH[i], t: `Capítulo aprobado número ${i + 1}, con una frase suficientemente larga para no ser un microcapítulo de la historia.` }));
  const ed = deriveEditorial({
    description: facts.description, features: facts.features, features_manual: opts.manual, bedrooms: 3, bathrooms: 2, square_meters: 110,
    zone: "Salamanca", subzone: "Goya", cleanDescription: opts.clean, cleanFeatures: opts.clean ? ["Ascensor"] : [],
    text: opts.text ? { b: blocks.map((b) => b.t).join("\n\n"), l: "Entrada.", h: [] } : null,
    story: opts.text ? null : { h: storySourceHash({ ...facts, features: [...facts.features, ...opts.manual] }), p: "Entrada de la historia.", ph: null, b: blocks },
    photos: Array.from({ length: 12 }, (_, i) => ({ u: String(i), k: null })), coverIndex: 0,
  });
  const item = { key: "k", features: ed.features, description: ed.description, sections: ed.sections } as never;
  const shownDesktop = journeyGroups(item).flat().map((i) => ed.sections[i].text);
  const detailText = hasDetail(item) ? ed.description ?? "" : "";
  const missingDesktop = blocks.filter((b) => !shownDesktop.includes(b.t) && !detailText.includes(b.t)).map((b) => b.t.match(/número (\d+)/)![1]);
  const missingMobile = blocks.filter((b) => !ed.sections.some((s) => s.text.includes(b.t)) && !(ed.description ?? "").includes(b.t));
  console.log(`${name.padEnd(58)} nivel=${ed.level.padEnd(5)} secciones=${ed.sections.length} partes=${itemParts(item, "spread").join(",").padEnd(26)} escritorio sin acceso: ${missingDesktop.length ? "capítulos " + missingDesktop.join(", ") : "ninguno"} · móvil sin acceso: ${missingMobile.length || "ninguno"}`);
}
run("Historia 6 capítulos, sin limpia ni características", 6, { clean: null, manual: [] });
run("Historia 7 capítulos, sin limpia ni características", 7, { clean: null, manual: [] });
run("Historia 7 capítulos, sin limpia, con características manuales", 7, { clean: null, manual: ["Terraza"] });
run("Historia 7 capítulos, con una descripción limpia distinta", 7, { clean: "Descripción limpia distinta de la historia.", manual: [] });
run("Historia 9 capítulos, con una descripción limpia distinta", 9, { clean: "Descripción limpia distinta de la historia.", manual: [] });
run("Texto del catálogo con 9 párrafos (control)", 9, { clean: null, manual: [], text: true });
