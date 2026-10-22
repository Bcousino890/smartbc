/**
 * Tests de las traducciones preparadas y revisadas del catálogo (expediente
 * 2026-10-21-bcp-01-ampliacion-textos-idiomas, PR6). Puros: sin base de
 * datos, red ni IA real. La «IA» es FALSA y cuenta llamadas. Las reglas de la
 * base de datos (0226), con concurrencia real, se prueban en
 * scripts/sql/test-catalog-translations*.sql; aquí, la orquestación sobre el
 * almacén en memoria con las mismas reglas (translation-memory.ts), la
 * lectura por idioma (N5, DA18, DA34) y las comprobaciones.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-translations.mts
 */
import { readFileSync } from "node:fs";
import { catalogDictionary, type CatalogLanguage } from "../lib/catalogs/i18n.ts";
import { organizeDescription } from "../lib/catalogs/structure.ts";
import { esUnitOfItem, toPublicCatalog, type InternalItem, type InternalSnapshot } from "../lib/catalogs/to-public.ts";
import {
  applyItemTranslation,
  checkTranslation,
  classifyAiFailure,
  parseTranslation,
  pendingTranslationWarnings,
  translationErrorMessage,
  translationSystemPrompt,
  TranslationParseError,
  unitSig,
  type TranslationRequest,
} from "../lib/catalogs/translations.ts";
import { MemoryTranslations } from "../lib/catalogs/translation-memory.ts";
import {
  activeLanguageGaps,
  approveItem,
  loadPanel,
  META_KEY,
  prepareItem,
  prepareMessage,
  saveReview,
  setLanguage,
  useApproved,
  type EsState,
  type LinkRow,
} from "../lib/catalogs/translation-service.ts";
import { fakeTranslationAi } from "../lib/catalogs/translation-fake-ai.ts";

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
async function throwsCode(p: Promise<unknown>, code: string, msg: string) {
  try {
    await p;
    ok(false, msg, "no lanzó");
  } catch (err) {
    ok(err instanceof Error && err.message === code, msg, err instanceof Error ? err.message : String(err));
  }
}

// ── Datos sintéticos ────────────────────────────────────────────────────────
function item(over: Partial<InternalItem> = {}): InternalItem {
  return {
    key: "k1", slug: "piso-1", title: "Ático con terraza en Recoletos", zone: "Salamanca", subzone: "Recoletos",
    operation: "sale", operations: ["sale"], price: 1450000, rent_price: null, currency: "eur", status: "available",
    bedrooms: 3, bathrooms: 2, square_meters: 142, description: null, features: null, features_manual: ["Ascensor", "Terraza de 40 m²"],
    floor_override: "7", clean: null, photos: [{ u: "a", f: "fa", w: 1600, h: 1067, c: true }, { u: "b", f: "fb", w: 1600, h: 1067, c: false }],
    text: { b: "Ático exterior con 142 m² y mucha luz.\n\nEl salón da a una terraza de 40 m² orientada al sur.\n\nLa finca tiene portero y ascensor.", l: null, h: [] },
    area: { name: "Recoletos", level: "barrio" },
    ...over,
  };
}
function snap(items: InternalItem[], over: Partial<InternalSnapshot> = {}): InternalSnapshot {
  return { title: "Salamanca y Chamberí", intro: "Dos viviendas elegidas.", created_at: "2026-10-01T09:00:00Z", status: "active", owner_name: null, contact: null, items, ...over };
}

// ── 1. Unidad: la descripción ya organizada, con su clave (DA18) ────────────
console.log("· unidad de traducción y huella");
{
  const o = organizeDescription({ lead: null, paragraphs: ["Piso exterior.", "El salón es luminoso.", "La finca tiene ascensor."], area: "Recoletos" });
  eq(o.copy.map((b) => b.key), ["intro", "living", "building"], "el organizador devuelve la clave de cada bloque");
  const tpl = organizeDescription({ lead: null, paragraphs: ["Piso exterior.", "El salón es luminoso."], area: "Recoletos", areaText: "Recoletos es un barrio señorial." });
  ok(tpl.areaTextUsed === true && tpl.copy.at(-1)?.key === "barrio", "con plantilla: marca que el bloque «barrio» es la plantilla");
  const u = esUnitOfItem(item());
  eq(u.blocks.map((b) => b.k), ["intro", "living", "building"], "la unidad española: los bloques del lector con su clave");
  eq(u.features, ["Ascensor", "Terraza de 40 m²"], "y sus características");
  ok(/^[0-9a-f]{32}$/.test(u.sig) && u.sig === u.ownSig, "huella de 32 hex; sin plantilla, la propia es la de lo que se ve");
  ok(esUnitOfItem(item()).sig === u.sig, "huella estable");
  ok(esUnitOfItem(item({ title: "Otro título" })).sig !== u.sig, "cambiar el título cambia la huella");
  ok(esUnitOfItem(item({ text: { b: "Ático exterior con 142 m² y mucha luz.", l: null, h: [] } })).sig !== u.sig, "cambiar el texto cambia la huella");
  ok(unitSig("a", [{ k: "intro", x: "b" }]) !== unitSig("a", [{ k: "living", x: "b" }]), "la clave entra en la huella");
  const ut = esUnitOfItem(item({ text: { b: "Ático exterior.\n\nEl salón es luminoso.", l: null, h: [] }, at: "Recoletos es un barrio señorial." }));
  ok(ut.areaText === "Recoletos es un barrio señorial." && ut.ownBlocks.every((b) => b.k !== "barrio") && ut.ownSig !== ut.sig && !!ut.areaSig, "con plantilla: se separa (fuente propia + plantilla)");
}

// ── 2. Lectura por idioma (N5, DA34) ────────────────────────────────────────
console.log("· lectura por idioma");
{
  const it = item();
  const u = esUnitOfItem(it);
  const tr = {
    s: u.sig, t: "Penthouse with a terrace in Recoletos",
    b: [{ k: "intro", x: "Outward-facing penthouse, 142 m² and plenty of light." }, { k: "living", x: "The living room opens onto a 40 m² south-facing terrace." }, { k: "building", x: "The building has a concierge and a lift." }],
    f: [["Ascensor", "Lift"]] as Array<[string, string]>,
  };
  const en = toPublicCatalog(snap([{ ...it, tr }], { lang: "en", trm: { s: "x", t: "Salamanca and Chamberí", i: "Two homes." } }));
  const es = toPublicCatalog(snap([{ ...it, tr }], { lang: "es" }));
  eq(en.items[0].title, "Penthouse with a terrace in Recoletos", "inglés vigente: título traducido");
  eq(en.items[0].copy.map((b) => b.heading), [null, "Living room and light", "The building"], "los títulos de sección salen del diccionario por clave (DA18)");
  eq(en.items[0].features, ["Lift"], "características: solo las traducidas (nunca en español)");
  ok(en.items[0].copyPending === undefined, "sin aviso N5");
  eq([en.title, en.intro], ["Salamanca and Chamberí", "Two homes."], "título e introducción del catálogo traducidos");
  eq(es.items[0].title, "Ático con terraza en Recoletos", "español: la copia inglesa no cambia nada");
  ok(es.items[0].copy[0].text.startsWith("Ático exterior") && !("copyPending" in es.items[0]), "español: el texto de siempre, sin campos nuevos");
  eq(Object.keys(es.items[0].copy[0]), ["heading", "text"], "el bloque público sigue siendo {heading, text}");
  eq([en.items[0].price, en.items[0].photos.length, en.items[0].bedrooms], ["€1,450,000", 2, 3], "datos operativos: de la instantánea actual, en el idioma");
  // Plantilla: «Vivir en Recoletos» con el nombre propio.
  const itT = item({ text: { b: "Ático exterior.\n\nEl salón es luminoso.", l: null, h: [] }, at: "Recoletos es un barrio señorial." });
  const uT = esUnitOfItem(itT);
  const trT = { s: uT.sig, t: "Penthouse", b: [...uT.blocks.map((b) => ({ k: b.k, x: `[en] ${b.x}` }))] };
  ok(toPublicCatalog(snap([{ ...itT, tr: trT }], { lang: "en" })).items[0].copy.some((b) => b.heading === "Living in Recoletos"), "«Vivir en {zona}» → «Living in Recoletos» (nombre propio intacto)");
  ok(toPublicCatalog(snap([{ ...itT, tr: trT }], { lang: "ar" })).items[0].copy.some((b) => b.heading === "العيش في Recoletos"), "y en árabe");

  // N5: español cambiado (republicado) → la traducción ya no vale.
  const changed = { ...it, text: { b: "Ático exterior renovado con 142 m².", l: null, h: [] }, tr };
  const n5 = toPublicCatalog(snap([changed], { lang: "en" })).items[0];
  ok(n5.copyPending === true && n5.copy.length === 1 && n5.copy[0].heading === "Description in preparation", "N5: aviso «Description in preparation» en lugar de la descripción");
  ok(!JSON.stringify(n5).includes("Ático exterior") && !JSON.stringify(n5).includes("Penthouse"), "N5: ni el español ni la traducción desactualizada");
  eq(n5.title, "Home in Recoletos", "N5: título provisional en el idioma con la zona (nombre propio)");
  eq([n5.price, n5.photos.length], ["€1,450,000", 2], "N5: la vivienda se ve con sus datos y fotos (no se oculta)");
  eq(n5.features, ["Lift"], "N5: las características traducidas siguen");
  // Vivienda añadida después (sin copia).
  ok(toPublicCatalog(snap([item()], { lang: "fr" })).items[0].copy[0].heading === "Description en préparation", "sin copia: N5 en francés");
  ok(toPublicCatalog(snap([item()], { lang: "he" })).items[0].copy[0].text === catalogDictionary("he").descriptionPreparingHint, "y en hebreo, con el texto del diccionario");
  // C2: la ficha cambió → el texto sale de la instantánea; la copia viaja pero no vale.
  const c2 = { ...it, text: null, tr };
  const c2en = toPublicCatalog(snap([c2], { lang: "en" })).items[0];
  const c2es = toPublicCatalog(snap([c2], { lang: "es" })).items[0];
  ok(c2es.copy.length === 0 && c2en.copy.length === 0 && c2en.copyPending === undefined, "C2 en cada idioma: sin texto vigente en español, tampoco hay traducción (ni aviso: no hay descripción)");
  // Bloques con contacto o claves distintas: nunca se enseñan.
  ok(toPublicCatalog(snap([{ ...it, tr: { ...tr, b: tr.b.map((b, i) => (i === 0 ? { ...b, x: "Call 612 345 678" } : b)) } }], { lang: "en" })).items[0].copyPending === true, "defensa: una copia con contacto no se enseña");
  ok(toPublicCatalog(snap([{ ...it, tr: { ...tr, b: tr.b.slice(1) } }], { lang: "en" })).items[0].copyPending === true, "defensa: claves que no casan no se enseñan");
  // Título del catálogo sin traducción: nombre del catálogo, sin la introducción española.
  const noMeta = toPublicCatalog(snap([item()], { lang: "en" }));
  eq([noMeta.title, noMeta.intro], ["Salamanca y Chamberí", null], "sin título traducido: el nombre del catálogo y sin la introducción en español");
  // Español sin descripción → sin aviso.
  const facts = { ...item({ text: null }), tr: undefined };
  ok(applyItemTranslation(esUnitOfItem(facts), null, catalogDictionary("en"), "Recoletos").pending === false, "solo datos: nada que preparar, sin aviso");
}

// ── 3. Respuesta de la IA y comprobaciones ──────────────────────────────────
console.log("· respuesta de la IA y comprobaciones");
{
  const req: TranslationRequest = { lang: "en", text: { t: "Ático", b: [{ k: "intro", x: "Uno." }, { k: "living", x: "Dos." }] }, area: "Barrio.", features: ["Ascensor"], meta: null, names: ["Recoletos"] };
  const good = JSON.stringify({ title: "Penthouse", blocks: [{ k: "intro", x: "One." }, { k: "living", x: "Two." }], area: "Area.", features: [{ es: "Ascensor", tr: "Lift" }], catalog_title: "", catalog_intro: "" });
  const p = parseTranslation(good, req);
  ok(p.text?.b.length === 2 && p.area === "Area." && p.features?.[0].tr === "Lift", "respuesta válida");
  const bad = (o: object, code: string, m: string) => {
    try {
      parseTranslation(JSON.stringify({ title: "P", blocks: [{ k: "intro", x: "One." }, { k: "living", x: "Two." }], area: "A", features: [], catalog_title: "", catalog_intro: "", ...o }), req);
      ok(false, m);
    } catch (e) {
      ok(e instanceof TranslationParseError && e.code === code, m, String(e));
    }
  };
  bad({ blocks: [{ k: "intro", x: "One." }] }, "blocks_count", "faltan bloques: no vale");
  bad({ blocks: [{ k: "living", x: "One." }, { k: "intro", x: "Two." }] }, "blocks_keys", "claves cambiadas de orden: no vale (nunca se reclasifica)");
  bad({ blocks: [{ k: "intro", x: "" }, { k: "living", x: "Two." }] }, "block_text", "bloque vacío: no vale");
  bad({ title: "" }, "title", "sin título: no vale");
  try { parseTranslation("no es json", req); ok(false, "json"); } catch (e) { ok(e instanceof TranslationParseError, "respuesta que no es JSON"); }
  const sys = translationSystemPrompt("ar");
  ok(/árabe/.test(sys) && /nombres propios/.test(sys) && /cifras/.test(sys) && /misma clave/.test(sys) && /precios/.test(sys), "instrucción: idioma, nombres propios, cifras, claves y nada de precios");
  const chk = checkTranslation([
    { where: "block:0", label: "Introducción", es: "Ático de 142 m² en Recoletos, planta 7.", tr: "Penthouse of 124 m² in Recoleto, floor 7." },
    { where: "title", label: "Título", es: "Ático", tr: "Call 612 345 678 now" },
    { where: "feature:x", label: "Característica", es: "Precio", tr: "Only 900.000 €" },
  ], ["Recoletos"]);
  ok(chk.warnings.some((w) => w.id === "number:block:0:142") && chk.warnings.some((w) => w.id === "number+:block:0:124"), "aviso: cifra que falta y cifra añadida");
  ok(chk.warnings.some((w) => w.kind === "name" && w.message.includes("Recoletos")), "aviso: nombre propio que no aparece");
  ok(chk.blockers.some((b) => b.code === "text_has_contact" && b.where === "title") && chk.blockers.some((b) => b.code === "text_has_price"), "bloqueos: contacto y precio");
  eq(pendingTranslationWarnings(chk, chk.warnings.map((w) => w.id)).length, 0, "los avisos se confirman uno a uno");
  const clean = checkTranslation([{ where: "block:0", label: "x", es: "Planta 1.450, 3 dormitorios en Goya.", tr: "Floor 1,450, 3 bedrooms in Goya." }], ["Goya"]);
  eq(clean.warnings.length + clean.blockers.length, 0, "separadores de miles distintos: la misma cifra, sin avisos");
  eq(classifyAiFailure(Object.assign(new Error("x"), { name: "TimeoutError" })), "uncertain", "tiempo agotado → incierto");
  eq(classifyAiFailure(new TypeError("fetch failed")), "uncertain", "conexión cortada → incierto");
  eq(classifyAiFailure(new Error("IA 500: boom")), "failed", "error del proveedor → fallido");
  eq(classifyAiFailure(new Error("x"), () => true), "not_configured", "IA sin configurar → sin llamada");
  eq(classifyAiFailure(new Error("algo raro")), "uncertain", "lo desconocido se trata como incierto (pudo cobrarse)");
  ok(translationErrorMessage("ERROR: lang_incomplete")?.includes("completo"), "mensajes de error del gestor");
}

// ── 4. Orquestación con reserva, sobre el almacén en memoria ────────────────
console.log("· preparar, revisar, aprobar, activar (IA falsa que cuenta llamadas)");
interface Cat {
  id: string;
  snapshot: InternalSnapshot;
  map: Array<{ p: string; k: string; av: string | null }>;
  version: number;
  lang: CatalogLanguage;
  links: Array<{ id: string; name: string; lang: CatalogLanguage | null }>;
  library?: Record<string, string>;
}
function world() {
  let clock = Date.parse("2026-10-22T10:00:00Z");
  const cats = new Map<string, Cat>();
  const mem = new MemoryTranslations({
    esState: (id): EsState => {
      const c = cats.get(id)!;
      return { version: c.version, defaultLang: c.lang, snapshot: structuredClone({ ...c.snapshot, lang: "es" }), map: c.map.map((m) => ({ ...m, cv: c.library?.[m.p] ?? null })) };
    },
    links: (id): LinkRow[] => (cats.get(id)?.links ?? []).map((l) => ({ id: l.id, clientName: l.name, lang: l.lang, state: "active" as const })),
    bump: (id) => ++cats.get(id)!.version,
    version: (id) => cats.get(id)!.version,
    setLang: (id, linkId, lang) => {
      const c = cats.get(id)!;
      if (linkId === null) {
        if (c.lang === lang) return false;
        c.lang = lang!;
        return true;
      }
      const l = c.links.find((x) => x.id === linkId)!;
      if (l.lang === lang) return false;
      l.lang = lang;
      return true;
    },
    libraryVersionOf: (id, p) => cats.get(id)?.library?.[p] ?? null,
    now: () => clock,
  });
  /** Lo que sirve get_public_catalog para un enlace (idioma del enlace o del catálogo). */
  const publicOf = (id: string, linkId: string | null = null) => {
    const c = cats.get(id)!;
    const lang = (linkId ? c.links.find((l) => l.id === linkId)?.lang : null) ?? c.lang;
    return toPublicCatalog(mem.mergeSnapshot(id, c.map, { ...structuredClone(c.snapshot), lang }, lang));
  };
  return { cats, mem, publicOf, tick: (ms: number) => { clock += ms; } };
}
{
  const w = world();
  const fake = fakeTranslationAi();
  const deps = { ai: fake.ai };
  const it2 = item({ key: "k2", slug: "piso-2", title: "Piso en Goya", subzone: "Goya", features_manual: ["Ascensor"], text: { b: "Piso tranquilo con cocina reformada.", l: null, h: [] }, area: null });
  w.cats.set("C1", {
    id: "C1", snapshot: snap([item(), it2]), map: [{ p: "P1", k: "k1", av: null }, { p: "P2", k: "k2", av: null }], version: 10, lang: "es",
    links: [{ id: "L1", name: "Ana", lang: null }, { id: "L2", name: "Luis", lang: null }],
  });

  // Panel inicial: nada preparado; progreso 0.
  let panel = await loadPanel(w.mem, "C1", "en");
  ok(panel.items.length === 3 && panel.items[0].key === META_KEY && panel.items.every((i) => i.state === "none"), "panel: el catálogo y las dos viviendas, sin traducción");
  ok(panel.progress.find((p) => p.lang === "en")?.complete === false && fake.calls() === 0, "progreso en inglés incompleto; ninguna llamada al cargar");

  // Dos peticiones simultáneas de lo mismo: UNA llamada (DA15).
  const [a, b] = await Promise.all([prepareItem(w.mem, deps, { catalogId: "C1", key: "k1", lang: "en" }), prepareItem(w.mem, deps, { catalogId: "C1", key: "k1", lang: "en" })]);
  eq([a.kind, b.kind].sort(), ["busy", "saved"], "dos «Preparar» a la vez: uno guarda y el otro ve «en preparación»");
  eq(fake.calls(), 1, "una sola llamada a la IA");
  ok(/inglés/.test(fake.last()!.system) && JSON.parse(fake.last()!.userText).bloques.length === 3, "la instrucción lleva el idioma y los bloques con su clave");
  ok(prepareMessage(b).text.includes("No se ha lanzado otra"), "el gestor lo explica");
  // Otra vez: no falta nada → sin IA.
  const again = await prepareItem(w.mem, deps, { catalogId: "C1", key: "k1", lang: "en" });
  ok(again.kind === "ready" && fake.calls() === 1, "preparar lo ya preparado: sin llamada");
  // Solo el idioma pedido.
  ok(w.mem.texts.every((t) => t.lang === "en") && w.mem.features.every((f) => f.lang === "en"), "solo el idioma pedido");

  // Revisión: avisos y aprobación.
  panel = await loadPanel(w.mem, "C1", "en");
  let p1 = panel.items.find((i) => i.key === "k1")!;
  ok(p1.state === "review" && p1.text?.status === "draft" && p1.features.every((f) => f.status === "draft"), "pendiente de revisar: texto y características en borrador");
  await saveReview(w.mem, "C1", { key: "k1", lang: "en", text: { id: p1.text!.id, rev: p1.text!.rev, title: "Penthouse with a terrace in Recoletos", blocks: p1.es.blocks.map((x) => `EN: ${x.es.replace(/142/, "124")}`) } });
  panel = await loadPanel(w.mem, "C1", "en");
  p1 = panel.items.find((i) => i.key === "k1")!;
  ok(p1.text?.rev === 2 && p1.text.origin === "manual" && p1.check!.warnings.some((x) => x.kind === "number"), "editar a mano: nueva revisión y el aviso de la cifra");
  await throwsCode(approveItem(w.mem, { catalogId: "C1", key: "k1", lang: "en", textRev: 2, areaRev: null, confirmed: [] }), "tr_unconfirmed", "aprobar con avisos sin confirmar: no");
  await throwsCode(approveItem(w.mem, { catalogId: "C1", key: "k1", lang: "en", textRev: 1, areaRev: null, confirmed: p1.check!.warnings.map((x) => x.id) }), "translation_changed", "aprobar una revisión vieja: no");
  await saveReview(w.mem, "C1", { key: "k1", lang: "en", text: { id: p1.text!.id, rev: 2, title: "Penthouse with a terrace in Recoletos", blocks: p1.es.blocks.map((x) => `EN: ${x.es}`) } });
  panel = await loadPanel(w.mem, "C1", "en");
  p1 = panel.items.find((i) => i.key === "k1")!;
  const v0 = w.cats.get("C1")!.version;
  await approveItem(w.mem, { catalogId: "C1", key: "k1", lang: "en", textRev: p1.text!.rev, areaRev: null, confirmed: p1.check?.warnings.map((x) => x.id) ?? [] });
  ok(w.cats.get("C1")!.version === v0 + 1, "aprobar copia al catálogo (sube la versión)");
  panel = await loadPanel(w.mem, "C1", "en");
  ok(panel.items.find((i) => i.key === "k1")?.state === "current", "la vivienda queda vigente en inglés");

  // Activar: incompleto → no; el enlace sigue en español.
  await throwsCode(setLanguage(w.mem, "C1", null, "en"), "lang_incomplete", "activar el inglés incompleto: no");
  await throwsCode(setLanguage(w.mem, "C1", "L1", "en"), "lang_incomplete", "tampoco en un enlace personal");
  eq(w.publicOf("C1").lang, "es", "hasta entonces, el enlace sigue en español");
  // Completar: p2 y el catálogo.
  for (const key of ["k2", META_KEY]) {
    await prepareItem(w.mem, deps, { catalogId: "C1", key, lang: "en" });
    const pi = (await loadPanel(w.mem, "C1", "en")).items.find((i) => i.key === key)!;
    await approveItem(w.mem, { catalogId: "C1", key, lang: "en", textRev: pi.text!.rev, areaRev: null, confirmed: pi.check?.warnings.map((x) => x.id) ?? [] });
  }
  panel = await loadPanel(w.mem, "C1", "en");
  ok(panel.progress.find((p) => p.lang === "en")?.complete === true, "progreso: inglés completo");
  await setLanguage(w.mem, "C1", "L1", "en");
  const calls = fake.calls();
  const ana = w.publicOf("C1", "L1");
  const luis = w.publicOf("C1", "L2");
  ok(ana.lang === "en" && ana.items[0].title === "Penthouse with a terrace in Recoletos" && ana.title === "Salamanca and Chamberí", "Ana (inglés) ve su idioma");
  ok(luis.lang === "es" && luis.items[0].title === "Ático con terraza en Recoletos", "Luis (sin idioma propio) sigue en español (DA17)");
  ok(ana.items[1].copy[0].text.startsWith("[en]") && ana.items[1].features.length === 1, "p2 en inglés con su característica");
  // Francés para Luis: incompleto → no cambia.
  await throwsCode(setLanguage(w.mem, "C1", "L2", "fr"), "lang_incomplete", "francés para Luis, incompleto: no");
  // Lecturas públicas repetidas: CERO llamadas (AC8).
  for (let i = 0; i < 5; i++) {
    w.publicOf("C1", "L1");
    w.publicOf("C1", "L2");
    w.publicOf("C1");
  }
  eq(fake.calls(), calls, "visitas públicas en dos idiomas: cero llamadas a la IA");

  // DA34: precio, foto excluida y vivienda retirada, al momento en inglés.
  const c1 = w.cats.get("C1")!;
  c1.snapshot.items[0].price = 1500000;
  c1.snapshot.items[0].pp = { x: ["fb"], o: null };
  let enNow = w.publicOf("C1", "L1");
  ok(enNow.items[0].price === "€1,500,000" && enNow.items[0].photos.length === 1 && enNow.items[0].copyPending === undefined, "precio y foto excluida: al momento en inglés, la traducción sigue vigente");
  c1.snapshot.items = c1.snapshot.items.filter((x) => x.key !== "k2");
  enNow = w.publicOf("C1", "L1");
  ok(enNow.items.length === 1, "vivienda retirada: fuera también en inglés");
  c1.snapshot.items.push(it2);
  // Español republicado → desactualizada (nunca vigente) → N5; el gestor lo marca.
  c1.snapshot.items[0] = { ...c1.snapshot.items[0], text: { b: "Ático exterior renovado y luminoso.", l: null, h: [] } };
  enNow = w.publicOf("C1", "L1");
  ok(enNow.items[0].copyPending === true && enNow.items[0].title === "Home in Recoletos", "español republicado: N5 en inglés (sin español ni traducción vieja)");
  panel = await loadPanel(w.mem, "C1", "en");
  const st = panel.items.find((i) => i.key === "k1")!;
  ok(st.state === "outdated" && st.outdated && !st.current, "el gestor la marca «desactualizada»");
  const gaps = await activeLanguageGaps(w.mem, "C1");
  ok(gaps.some((g) => g.lang === "en" && g.pending.length === 1), "y el aviso de «Contenido» la cuenta");
  // Preparar de nuevo: solo lo que falta (las características ya están).
  await prepareItem(w.mem, deps, { catalogId: "C1", key: "k1", lang: "en" });
  ok(JSON.parse(fake.last()!.userText).caracteristicas === undefined, "re-preparar: no vuelve a pedir las características ya traducidas");
}

// ── 5. Cancelar, caducar, incierto, fallos ──────────────────────────────────
console.log("· cancelación, caducidad e incierto");
{
  const w = world();
  w.cats.set("C2", { id: "C2", snapshot: snap([item()]), map: [{ p: "P1", k: "k1", av: null }], version: 1, lang: "es", links: [] });
  // Cancelar mientras la IA trabaja: la respuesta se descarta y se registra.
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const slow = fakeTranslationAi({ gate: () => gate });
  const run = prepareItem(w.mem, { ai: slow.ai }, { catalogId: "C2", key: "k1", lang: "de" });
  await new Promise((r) => setTimeout(r, 10));
  const job = w.mem.jobs.find((j) => j.status === "reserved")!;
  ok(await w.mem.cancel(job.id), "cancelar la preparación en curso");
  release();
  const out = await run;
  ok(out.kind === "discarded" && (out as { reason: string }).reason === "cancelled", "la respuesta tardía tras cancelar se descarta");
  ok(!w.mem.texts.some((t) => t.lang === "de") && !!w.mem.jobs.find((j) => j.id === job.id)?.discardedAt, "nada guardado y queda registrado");
  ok(prepareMessage(out).text.includes("pudo cobrarse"), "el gestor avisa de que pudo cobrarse");

  // Caducada: un trabajo viejo no pisa uno más nuevo.
  let release2!: () => void;
  const gate2 = new Promise<void>((r) => { release2 = r; });
  const slow2 = fakeTranslationAi({ gate: () => gate2 });
  const old = prepareItem(w.mem, { ai: slow2.ai, ttlSeconds: 30 }, { catalogId: "C2", key: "k1", lang: "it" });
  await new Promise((r) => setTimeout(r, 10));
  w.tick(31_000);
  const fresh = fakeTranslationAi();
  const n = await prepareItem(w.mem, { ai: fresh.ai }, { catalogId: "C2", key: "k1", lang: "it" });
  ok(n.kind === "saved", "con la reserva caducada, otra preparación reserva y guarda");
  release2();
  const o = await old;
  ok(o.kind === "discarded" && (o as { reason: string }).reason === "expired", "la vieja llega tarde: descartada (expired)");
  eq(w.mem.texts.filter((t) => t.lang === "it").map((t) => t.rev), [1], "la nueva no se pisa");

  // Incierto: sin reintento automático; solo con «Volver a preparar».
  const to = fakeTranslationAi({ mode: () => "timeout" });
  const u1 = await prepareItem(w.mem, { ai: to.ai }, { catalogId: "C2", key: "k1", lang: "fr" });
  ok(u1.kind === "uncertain" && to.calls() === 1, "tiempo agotado tras enviar: incierto, una llamada");
  ok(prepareMessage(u1).text.includes("pudo cobrarse") && prepareMessage(u1).text.includes("No se reintenta sola"), "aviso: pudo cobrarse, no se reintenta");
  const u2 = await prepareItem(w.mem, { ai: to.ai }, { catalogId: "C2", key: "k1", lang: "fr" });
  ok(u2.kind === "uncertain_pending" && to.calls() === 1, "pulsar otra vez «Preparar»: no llama (hay un incierto)");
  const panel = await loadPanel(w.mem, "C2", "fr");
  ok(panel.items.find((i) => i.key === "k1")?.state === "uncertain", "el gestor la marca «resultado incierto»");
  const okAi = fakeTranslationAi();
  const u3 = await prepareItem(w.mem, { ai: okAi.ai }, { catalogId: "C2", key: "k1", lang: "fr", retry: true });
  ok(u3.kind === "saved" && okAi.calls() === 1, "«Volver a preparar»: ahora sí");
  // Real timeout con AbortSignal.
  const hang = fakeTranslationAi({ delayMs: () => 5_000 });
  const t0 = Date.now();
  const u4 = await prepareItem(w.mem, { ai: hang.ai, timeoutMs: 50 }, { catalogId: "C2", key: "k1", lang: "tr" });
  ok(u4.kind === "uncertain" && Date.now() - t0 < 2_000, "el tiempo máximo corta de verdad la llamada y queda incierto");
  // Proveedor con error / sin configurar / respuesta mala.
  const e1 = await prepareItem(w.mem, { ai: fakeTranslationAi({ mode: () => "error" }).ai }, { catalogId: "C2", key: "k1", lang: "he" });
  ok(e1.kind === "failed" && (e1 as { reason: string }).reason === "provider", "error del proveedor: fallido, se puede reintentar");
  const e2 = await prepareItem(w.mem, { ai: async () => { throw new Error("no config"); }, isNotConfigured: () => true }, { catalogId: "C2", key: "k1", lang: "he" });
  ok(e2.kind === "failed" && (e2 as { charged: boolean }).charged === false, "IA sin configurar: no se llamó");
  const e3 = await prepareItem(w.mem, { ai: fakeTranslationAi({ mode: () => "bad" }).ai }, { catalogId: "C2", key: "k1", lang: "he" });
  ok(e3.kind === "failed" && (e3 as { charged: boolean }).charged === true && !w.mem.texts.some((t) => t.lang === "he"), "claves cambiadas: se descarta (la llamada sí se hizo)");
}

// ── 6. Fuentes: biblioteca reutilizable, texto propio no promocionado ───────
console.log("· fuentes (DA31) y plantillas (DA27)");
{
  const w = world();
  const shared = item();
  w.cats.set("A", { id: "A", snapshot: snap([shared]), map: [{ p: "P1", k: "k1", av: null }], version: 1, lang: "es", links: [], library: { P1: "V1" } });
  w.cats.set("B", { id: "B", snapshot: snap([{ ...shared, key: "kb" }]), map: [{ p: "P1", k: "kb", av: null }], version: 1, lang: "es", links: [], library: { P1: "V1" } });
  w.cats.set("C", { id: "C", snapshot: snap([{ ...shared, key: "kc" }]), map: [{ p: "P1", k: "kc", av: null }], version: 1, lang: "es", links: [] });
  const fake = fakeTranslationAi();
  await prepareItem(w.mem, { ai: fake.ai }, { catalogId: "A", key: "k1", lang: "en" });
  const pa = (await loadPanel(w.mem, "A", "en")).items.find((i) => i.key === "k1")!;
  ok(pa.library === true, "texto copiado de la biblioteca: fuente reutilizable");
  await approveItem(w.mem, { catalogId: "A", key: "k1", lang: "en", textRev: pa.text!.rev, areaRev: null, confirmed: pa.check?.warnings.map((x) => x.id) ?? [] });
  const pb = (await loadPanel(w.mem, "B", "en")).items.find((i) => i.key === "kb")!;
  ok(pb.state === "ready", "otro catálogo con la misma versión: «lista para usar (sin IA)»");
  const r = await useApproved(w.mem, "B", "en");
  ok(r.copied === 1 && fake.calls() === 1, "usar la ya aprobada en B: sin IA (DA12)");
  const pc = (await loadPanel(w.mem, "C", "en")).items.find((i) => i.key === "kc")!;
  ok(pc.state === "none" && pc.library === false, "texto propio de otro catálogo: no reutiliza nada (ni promociona a la biblioteca)");
  ok(w.mem.sources.filter((s) => s.kind === "library").length === 1 && !w.mem.sources.some((s) => s.kind === "catalog"), "la traducción de A cuelga de la versión de la biblioteca");
  // Plantilla: una traducción, reutilizada en otra vivienda con la misma plantilla.
  const T = "Recoletos es un barrio de fincas señoriales.";
  const t1 = item({ key: "t1", text: { b: "Ático exterior.\n\nEl salón es luminoso.", l: null, h: [] }, at: T });
  const t2 = item({ key: "t2", title: "Otro piso en Recoletos", text: { b: "Piso reformado.", l: null, h: [] }, at: T, features_manual: [] });
  w.cats.set("T", { id: "T", snapshot: snap([t1, t2]), map: [{ p: "Q1", k: "t1", av: "AV1" }, { p: "Q2", k: "t2", av: "AV1" }], version: 1, lang: "es", links: [] });
  const tf = fakeTranslationAi();
  await prepareItem(w.mem, { ai: tf.ai }, { catalogId: "T", key: "t1", lang: "en" });
  ok(JSON.parse(tf.last()!.userText).zona === T, "la plantilla viaja aparte");
  await prepareItem(w.mem, { ai: tf.ai }, { catalogId: "T", key: "t2", lang: "en" });
  ok(JSON.parse(tf.last()!.userText).zona === undefined, "la segunda vivienda con la misma plantilla no la vuelve a pedir");
  let pt = (await loadPanel(w.mem, "T", "en")).items.find((i) => i.key === "t1")!;
  ok(pt.es.blocks.some((b) => b.area && b.tr), "revisión: la plantilla con su traducción");
  await approveItem(w.mem, { catalogId: "T", key: "t1", lang: "en", textRev: pt.text!.rev, areaRev: pt.area!.rev, confirmed: pt.check?.warnings.map((x) => x.id) ?? [] });
  pt = (await loadPanel(w.mem, "T", "en")).items.find((i) => i.key === "t1")!;
  const pt2 = (await loadPanel(w.mem, "T", "en")).items.find((i) => i.key === "t2")!;
  ok(pt.state === "current" && pt2.area?.status === "approved", "aprobada una vez, vale para las dos");
  const pub = toPublicCatalog(w.mem.mergeSnapshot("T", w.cats.get("T")!.map, { ...w.cats.get("T")!.snapshot, lang: "en" }, "en"));
  ok(pub.items[0].copy.at(-1)?.heading === "Living in Recoletos" && pub.items[0].copy.at(-1)?.text.startsWith("[en] Recoletos"), "lector: la plantilla traducida en «Living in Recoletos»");
}

// ── 7. Fuente: lo público nunca prepara ni llama a la IA (DA12) ─────────────
console.log("· comprobaciones de fuente");
{
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const publicFiles = [
    "lib/catalogs/to-public.ts", "lib/catalogs/public-data.ts",
    "app/api/seleccion/[token]/estado/route.ts", "app/api/seleccion/[token]/eventos/route.ts",
    "app/api/seleccion/[token]/opiniones/route.ts", "app/api/seleccion/[token]/pdf/route.ts", "app/seleccion/[token]/page.tsx",
  ];
  for (const f of publicFiles) {
    const src = read(f);
    ok(!/aiComplete|translation-service|translation-data|translation-fake-ai|runPreparation|prepareItem/.test(src.replace(/^\s*\/\/.*$/gm, "")), `${f}: sin IA ni preparación`);
  }
  const mig = read("supabase/migrations/0226_catalog_translations.sql");
  ok(!/property_client_descriptions\s*(SET|\(|VALUES)|INSERT INTO property_client_descriptions|UPDATE property_client_descriptions|UPDATE properties|INSERT INTO properties/i.test(mig), "0226: nunca escribe en properties ni en property_client_descriptions");
  ok(/WHEN coalesce\(p_lang, 'es'\) = 'es' THEN x\.s \|\| jsonb_build_object\('lang', 'es'\)/.test(mig), "0226: en español, la instantánea de 0223");
  ok(/catalog_tr_jobs_one_reserved ON catalog_tr_jobs \(source_id, lang\) WHERE status = 'reserved'/.test(mig), "0226: una reserva vigente por fuente e idioma");
  ok(/REVOKE ALL ON TABLE catalog_tr_jobs FROM public, anon, authenticated/.test(mig) && /ENABLE ROW LEVEL SECURITY/.test(mig), "0226: RLS y solo service_role");
  const actions = read("app/[country]/(admin)/admin/mi-espacio/actions.ts");
  ok(/prepareTranslationAction[\s\S]*withHomeAccess[\s\S]*prepareItem\(sqlTranslations/.test(actions), "acciones: preparar solo desde la gestión, con la guarda del dueño");
  ok(!/translation-fake-ai/.test(actions), "acciones reales: nunca la IA falsa");
  const ui = read("components/admin/catalogs/manager/languages-section.tsx");
  ok(/no garantiza una sola llamada de pago/.test(ui) && /sin revisión nativa/.test(ui) && /pudo cobrarse/.test(ui), "gestor: aviso de coste, incierto y sin revisión nativa");
  const pages = read("components/catalogs/reader/pages.tsx");
  ok(/copyPending/.test(pages) && /data-testid="copy-pending"/.test(pages), "lector: el aviso N5 en el sitio de la descripción");
}

console.log(`test-catalogs-translations: ${passes} comprobaciones en verde${failures ? `, ${failures} fallidas` : ""}`);
if (failures) process.exit(1);
