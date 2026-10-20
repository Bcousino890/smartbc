/**
 * Tests del organizador de la descripción del catálogo (expediente
 * 2026-10-21-bcp-01-descripcion-estructurada, DE1–DE9). Puros, sin base de
 * datos, red ni IA. Los resultados esperados están escritos a mano a partir
 * de las decisiones del expediente.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-structure.mts
 */
import { readFileSync } from "node:fs";
import { deriveEditorial, type EditorialInput } from "../lib/catalogs/editorial.ts";
import { flattenCopy, organizeDescription, paragraphsOf, SECTION_ORDER, sectionHeading, type CopyBlock } from "../lib/catalogs/structure.ts";
import { sentences } from "../lib/catalogs/text-rules.ts";
import { storySourceHash } from "../lib/services/story/source-hash.ts";
import { toPublicItem, type InternalItem } from "../lib/catalogs/to-public.ts";
import { planItemExport } from "../lib/catalogs/export/plan.ts";

let failures = 0;
let passes = 0;
function check(name: string, cond: unknown, detail?: string) {
  if (cond) passes++;
  else {
    failures++;
    console.error(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string) {
  console.log(`· ${t}`);
}
const headings = (c: CopyBlock[]) => c.map((b) => b.heading ?? "(intro)");
const byHeading = (c: CopyBlock[], h: string | null) => c.find((b) => b.heading === h)?.text ?? "";
/** Cada frase de la fuente aparece exactamente una vez en los bloques. */
function eachSentenceOnce(source: string, copy: CopyBlock[]): { missing: string[]; dup: string[] } {
  const out = flattenCopy(copy);
  const missing: string[] = [];
  const dup: string[] = [];
  for (const s of sentences(source.replace(/\n+/g, " "))) {
    const n = out.split(s).length - 1;
    if (n === 0) missing.push(s);
    if (n > 1) dup.push(s);
  }
  return { missing, dup };
}

section("DE1 · estructura y orden fijos; ninguna parte vacía");
{
  const text =
    "Piso exterior de 120 m² en una calle tranquila. " +
    "El salón, orientado al sur, recibe luz toda la mañana. " +
    "La cocina está equipada con horno e inducción. " +
    "Suelos de tarima y calefacción central. " +
    "La finca tiene ascensor y portero físico. " +
    "El barrio está bien comunicado con metro y autobús.";
  const r = organizeDescription({ lead: null, paragraphs: [text], area: "Chamberí" });
  check("orden: introducción, Salón y luz, Cocina y comedor, Acabados y confort, La finca, Vivir en Chamberí",
    JSON.stringify(headings(r.copy)) === JSON.stringify(["(intro)", "Salón y luz", "Cocina y comedor", "Acabados y confort", "La finca", "Vivir en Chamberí"]), headings(r.copy).join(" | "));
  check("sin partes vacías ni avisos", r.missing.length === 0);
  check("la introducción es la primera frase", byHeading(r.copy, null) === "Piso exterior de 120 m² en una calle tranquila.");
  const once = eachSentenceOnce(text, r.copy);
  check("cada frase una sola vez, ninguna perdida", once.missing.length === 0 && once.dup.length === 0, JSON.stringify(once));
  const r2 = organizeDescription({ lead: null, paragraphs: ["Vivienda amplia. La cocina es grande."], area: null });
  check("solo lo que hay: introducción y cocina; el resto se señala", JSON.stringify(headings(r2.copy)) === JSON.stringify(["(intro)", "Cocina y comedor"]) && JSON.stringify(r2.missing) === JSON.stringify(["living", "finishes", "building", "barrio"]));
  check("vacío: nada", organizeDescription({ lead: null, paragraphs: [], area: null }).copy.length === 0);
}

section("DE3 · palabras clave, sinónimos, tildes y contexto");
{
  const r = organizeDescription({ lead: null, paragraphs: ["Casa reformada.", "SALÓN LUMINOSO con grandes ventanales. También tiene un balcón corrido. La cocina, independiente, tiene isla y despensa. Además incluye lavavajillas y horno."], area: null });
  check("mayúsculas y tildes: «SALÓN LUMINOSO» → Salón y luz", byHeading(r.copy, "Salón y luz").startsWith("SALÓN LUMINOSO"));
  check("contexto: «También tiene un balcón…» sigue en Salón y luz", byHeading(r.copy, "Salón y luz").includes("También tiene un balcón corrido."));
  check("contexto: «Además incluye lavavajillas…» tiene palabra clave de cocina", byHeading(r.copy, "Cocina y comedor").includes("Además incluye lavavajillas y horno."));
  const r2 = organizeDescription({ lead: null, paragraphs: ["Piso en venta.", "Dispone de aire acondicionado por conductos y calefaccion de gas natural. Esta instalacion es de 2020."], area: null });
  check("sin tildes («calefaccion», «instalacion») se reconoce igual; «Esta instalación…» hereda Acabados", byHeading(r2.copy, "Acabados y confort") === "Dispone de aire acondicionado por conductos y calefaccion de gas natural. Esta instalacion es de 2020.", byHeading(r2.copy, "Acabados y confort"));
  const r3 = organizeDescription({ lead: null, paragraphs: ["Ático en venta.", "Tres dormitorios y dos baños. El principal tiene vestidor."], area: null });
  check("material sin tema (dormitorios, baños) se conserva en la introducción, sin inventar un título", r3.copy.length === 1 && r3.copy[0].heading === null && r3.copy[0].text.includes("Tres dormitorios y dos baños. El principal tiene vestidor."));
}

section("DE3 · frases con varios temas: una sola vez, al tema con más señales");
{
  const r = organizeDescription({ lead: null, paragraphs: ["Piso en venta.", "El salón se abre a una terraza y la cocina está al lado. Ventanas de aluminio con climalit y doble acristalamiento. El edificio, con ascensor, está junto al metro."], area: null });
  check("«El salón… y la cocina»: empate 2–2 → el primero que se menciona (Salón y luz)", byHeading(r.copy, "Salón y luz").includes("El salón se abre a una terraza y la cocina está al lado.") && !byHeading(r.copy, "Cocina y comedor").includes("El salón"));
  check("«Ventanas de aluminio con climalit»: más señales de acabados que de luz", byHeading(r.copy, "Acabados y confort").includes("Ventanas de aluminio con climalit y doble acristalamiento."));
  check("«El edificio, con ascensor, está junto al metro»: finca (4) gana a barrio (2)", byHeading(r.copy, "La finca").includes("El edificio, con ascensor"));
  const once = eachSentenceOnce("El salón se abre a una terraza y la cocina está al lado. Ventanas de aluminio con climalit y doble acristalamiento. El edificio, con ascensor, está junto al metro.", r.copy);
  check("ninguna frase duplicada ni perdida", once.missing.length === 0 && once.dup.length === 0, JSON.stringify(once));
  const r2 = organizeDescription({ lead: null, paragraphs: ["Piso.", "Cuenta con plaza de garaje en la misma finca."], area: null });
  check("«plaza de garaje» cuenta para la finca y no deja «plaza» al barrio", headings(r2.copy).includes("La finca") && !headings(r2.copy).includes("El barrio"));
  const r3 = organizeDescription({ lead: null, paragraphs: ["Piso.", "Suelos de parqué de roble. A dos pasos del parque del Retiro."], area: "Retiro" });
  check("«parqué de roble» → acabados; «parque del Retiro» → zona", byHeading(r3.copy, "Acabados y confort").includes("parqué de roble") && byHeading(r3.copy, "Vivir en Retiro").includes("parque del Retiro"));
}

section("DE5 · negaciones y matices, literales");
{
  const text = "Piso en venta. La finca no tiene ascensor y es sin portero. No dispone de calefacción central, aunque sí de radiadores eléctricos. El salón es algo oscuro por la tarde.";
  const r = organizeDescription({ lead: null, paragraphs: [text], area: null });
  check("«sin ascensor» va a La finca tal cual", byHeading(r.copy, "La finca") === "La finca no tiene ascensor y es sin portero.");
  check("«No dispone de calefacción… aunque sí…» literal en Acabados", byHeading(r.copy, "Acabados y confort") === "No dispone de calefacción central, aunque sí de radiadores eléctricos.");
  check("«algo oscuro por la tarde» se conserva en Salón y luz (no se embellece)", byHeading(r.copy, "Salón y luz") === "El salón es algo oscuro por la tarde.");
  // Las características verificadas no cambian por el texto.
  const ed = deriveEditorial({
    description: "x", features: [], features_manual: [], bedrooms: 2, bathrooms: 1, square_meters: 80, zone: "Madrid", subzone: null,
    cleanDescription: null, cleanFeatures: [], text: { b: text, l: null, h: [] }, story: null, photos: [], coverIndex: 0,
  });
  check("ninguna característica nueva por el texto («ascensor» no se afirma)", ed.features.length === 0);
}

section("DE6 · títulos escritos por el autor");
{
  const text = "Piso señorial en Almagro.\n\nSalón:\nDoble salón con chimenea.\nMuy luminoso.\n\nLa finca\nDe 1920, con portero.\n\nDormitorios:\nCuatro, dos de ellos con baño.\n\nEl barrio\nTodo a mano.";
  const r = organizeDescription({ lead: null, paragraphs: paragraphsOf(text), area: "Almagro" });
  check("«Salón:» agrupa lo que sigue aunque hable de chimenea (acabados)", byHeading(r.copy, "Salón y luz") === "Doble salón con chimenea. Muy luminoso.", byHeading(r.copy, "Salón y luz"));
  check("«La finca» sin dos puntos también", byHeading(r.copy, "La finca") === "De 1920, con portero.");
  check("«El barrio» → «Vivir en Almagro»", byHeading(r.copy, "Vivir en Almagro") === "Todo a mano.");
  check("título no estándar («Dormitorios:»): no se muestra; su contenido se conserva en la introducción", !headings(r.copy).some((h) => /dormitorios/i.test(h)) && byHeading(r.copy, null).includes("Cuatro, dos de ellos con baño."));
  check("orden normalizado aunque el autor escribiera otro", JSON.stringify(headings(r.copy)) === JSON.stringify(["(intro)", "Salón y luz", "La finca", "Vivir en Almagro"]), headings(r.copy).join(" | "));
  const r2 = organizeDescription({ lead: null, paragraphs: paragraphsOf("Vivir en Retiro\nParques y silencio.\n\nCocina y comedor:\nAmplia.\n\n## Acabados\nTarima."), area: "Retiro" });
  check("«Vivir en …», «Cocina y comedor:» y «## Acabados» se reconocen", JSON.stringify(headings(r2.copy)) === JSON.stringify(["Cocina y comedor", "Acabados y confort", "Vivir en Retiro"]), headings(r2.copy).join(" | "));
}

section("DE4 · introducción: entrada propia o primeras frases; sin repetir");
{
  const r = organizeDescription({ lead: "Una casa para vivir despacio.", paragraphs: ["El salón es amplio. Cocina reformada."], area: null });
  check("entrada propia abre la introducción y el resto se clasifica", byHeading(r.copy, null) === "Una casa para vivir despacio." && byHeading(r.copy, "Salón y luz") === "El salón es amplio." && byHeading(r.copy, "Cocina y comedor") === "Cocina reformada.");
  const r2 = organizeDescription({ lead: null, paragraphs: ["Casa en Goya. Tiene mucha luz y dos salones amplios. Detalle que no casa."], area: "Goya" });
  check("sin entrada: la PRIMERA frase abre la introducción aunque nombre la zona; la segunda se clasifica", byHeading(r2.copy, null).startsWith("Casa en Goya.") && byHeading(r2.copy, "Salón y luz") === "Tiene mucha luz y dos salones amplios.", byHeading(r2.copy, null));
  check("lo que no casa se queda en la introducción (misma vez)", byHeading(r2.copy, null).includes("Detalle que no casa.") && flattenCopy(r2.copy).split("Detalle que no casa.").length === 2);
  const long = `Largo ${Array.from({ length: 1499 }, () => "palabra").join(" ")}.`;
  const r3 = organizeDescription({ lead: null, paragraphs: [long], area: null });
  check("1.500 palabras sin tema llegan enteras", flattenCopy(r3.copy) === long);
  const longMixed = Array.from({ length: 60 }, (_, i) => `Frase ${i + 1} sobre ${["el salón luminoso", "la cocina equipada", "los acabados de calidad", "la finca con ascensor", "el barrio con metro"][i % 5]}.`).join(" ");
  const r4 = organizeDescription({ lead: null, paragraphs: [longMixed], area: null });
  const once = eachSentenceOnce(longMixed, r4.copy);
  check("60 frases mezcladas: todas, una sola vez, en cinco partes + introducción", once.missing.length === 0 && once.dup.length === 0 && r4.copy.length === 6, JSON.stringify(once).slice(0, 200));
}

section("DE7 · historias aprobadas: capítulos compatibles con su título; el resto a la introducción");
{
  const facts = { description: "Piso exterior en Goya.", bedrooms: 3, bathrooms: 2, squareMeters: 110, features: ["Ascensor"] };
  const CH = ["overview", "living", "kitchen", "private", "outdoor", "finishes", "building", "barrio", "living"] as const;
  // Dos frases por capítulo: un capítulo de una sola frase corta es un «micro-capítulo» y va a características (regla previa).
  const source = CH.map((c, i) => ({ c, t: `Capítulo ${c} número ${i + 1}, aprobado. Con su segunda frase.` }));
  const ed = deriveEditorial({
    description: facts.description, features: facts.features, features_manual: null, bedrooms: 3, bathrooms: 2, square_meters: 110, zone: "Madrid", subzone: "Goya",
    cleanDescription: "Otra limpia.", cleanFeatures: [], text: null, photos: [], coverIndex: 0,
    story: { h: storySourceHash(facts), p: "Entrada de la historia.", b: [...source, { c: "building", t: "Portería." }] },
  });
  check("nivel historia", ed.level === "story");
  check("orden estándar: intro, Salón y luz, Cocina, Acabados, La finca, Vivir en Goya", JSON.stringify(headings(ed.copy)) === JSON.stringify(["(intro)", "Salón y luz", "Cocina y comedor", "Acabados y confort", "La finca", "Vivir en Goya"]), headings(ed.copy).join(" | "));
  check("entrada primero; overview, private y outdoor conservan su texto en la introducción, sin título", byHeading(ed.copy, null) === "Entrada de la historia.\n\nCapítulo overview número 1, aprobado. Con su segunda frase.\n\nCapítulo private número 4, aprobado. Con su segunda frase.\n\nCapítulo outdoor número 5, aprobado. Con su segunda frase.", byHeading(ed.copy, null));
  check("dos capítulos «living» se juntan bajo un solo título, en su orden", byHeading(ed.copy, "Salón y luz") === "Capítulo living número 2, aprobado. Con su segunda frase.\n\nCapítulo living número 9, aprobado. Con su segunda frase.");
  check("micro-capítulo «Portería.» va a características, no al texto", ed.features.includes("Portería") && !flattenCopy(ed.copy).includes("Portería."));
  check("la descripción limpia no se repite debajo de la historia", !flattenCopy(ed.copy).includes("Otra limpia"));
}

section("DE8/DE9 · descripción limpia y zona verificada");
{
  const base: EditorialInput = {
    description: "x", features: [], features_manual: [], bedrooms: 2, bathrooms: 1, square_meters: 80, zone: "Madrid", subzone: null,
    cleanDescription: "Piso reformado. El salón da a la calle y es muy luminoso. La zona tiene de todo: metro, comercios y colegios.", cleanFeatures: [], text: null, story: null, photos: [], coverIndex: 0,
  };
  const c = deriveEditorial(base);
  check("limpia: mismas reglas; sin subzona, la zona (Madrid) titula «Vivir en Madrid»", c.level === "clean" && JSON.stringify(headings(c.copy)) === JSON.stringify(["(intro)", "Salón y luz", "Vivir en Madrid"]), headings(c.copy).join(" | "));
  const c2 = deriveEditorial({ ...base, zone: null });
  check("sin zona verificada: «El barrio» (vocabulario cerrado), nunca inventada", headings(c2.copy).includes("El barrio"));
  check("sectionHeading recorta espacios", sectionHeading("barrio", "  Retiro  ") === "Vivir en Retiro" && sectionHeading("living", "x") === "Salón y luz");
  const c3 = deriveEditorial({ ...base, subzone: "Jerónimos", cleanDescription: "Piso reformado. Jerónimos es un barrio tranquilo. Sus calles son silenciosas." });
  check("el nombre de la zona verificada cuenta como palabra clave; «Sus calles…» hereda", byHeading(c3.copy, "Vivir en Jerónimos") === "Jerónimos es un barrio tranquilo. Sus calles son silenciosas.");
  check("el organizador no añade frases de ubicación: solo las del texto", !flattenCopy(c3.copy).includes("minutos"));
}

section("DE2/DE12 · una sola representación: contrato público, PDF y lector");
{
  const text = "Piso en Goya. El salón es luminoso. Cocina con isla.";
  const it: InternalItem = {
    key: "k1AbCdEfGhIj", slug: "piso", title: "Piso", zone: "Madrid", subzone: "Goya", operation: "sale", operations: ["sale"], price: 100000, rent_price: null, currency: "eur",
    bedrooms: 2, bathrooms: 1, square_meters: 80, floor_override: null, status: "available", archived_at: null, description: "x", features: [], features_manual: [],
    photos: [], cover_url: null, clean: null, text: { b: text, l: null, h: [] },
  } as unknown as InternalItem;
  const pub = toPublicItem(it);
  check("el contrato público lleva los bloques organizados con títulos", JSON.stringify(headings(pub.copy)) === JSON.stringify(["(intro)", "Salón y luz", "Cocina y comedor"]), headings(pub.copy).join(" | "));
  const x = planItemExport(pub);
  check("el PDF usa exactamente los mismos bloques", JSON.stringify(x.copy) === JSON.stringify(pub.copy));
  check("el contrato no expone nada nuevo (ni «missing» ni claves internas)", !("missing" in pub) && !JSON.stringify(pub).includes("Goya es"));
  const reader = readFileSync("components/catalogs/reader/pages.tsx", "utf8");
  check("el lector pinta `copy` con título (h3) y texto; sin páginas nuevas", /item\.copy\.map/.test(reader) && !/journey/i.test(reader));
  const rs = readFileSync("lib/catalogs/reader-state.ts", "utf8");
  check("exactamente dos partes por vivienda", /ItemPart = "open" \| "detail"/.test(rs));
  const ai = readFileSync("lib/catalogs/ai-draft.ts", "utf8");
  check("la IA recibe la estructura en su instrucción y la orden de no inventar", /salón y la luz/.test(ai) && /No inventes nada/.test(ai));
  const st = readFileSync("lib/catalogs/structure.ts", "utf8");
  check("el organizador no importa IA, red ni base de datos", !/fetch\(|createAdminClient|aiComplete|server-only/.test(st));
  const pdfDoc = readFileSync("lib/pdf/catalog/document.ts", "utf8");
  check("el PDF no reorganiza por su cuenta", !/organizeDescription/.test(pdfDoc));
  check("SECTION_ORDER estable", SECTION_ORDER.join(",") === "living,kitchen,finishes,building,barrio");
}

console.log(`\ntest-catalogs-structure: ${passes} comprobaciones, ${failures} fallos`);
if (failures) process.exit(1);
