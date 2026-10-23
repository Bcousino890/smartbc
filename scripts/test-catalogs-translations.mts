/**
 * Tests de las traducciones del catálogo (expediente
 * 2026-10-21-bcp-01-ampliacion-textos-idiomas: PR6 y la traducción
 * AUTOMÁTICA «como en itinerarios», decisión de Fabricio del 22-10-2026).
 * Puros: sin base de datos, red ni IA real. La «IA» es FALSA y cuenta
 * llamadas. Las reglas de la base de datos (0226/0228), con concurrencia
 * real, se prueban en scripts/sql/test-catalog-translations*.sql; aquí, el
 * traductor en segundo plano (auto-translate.ts) y la orquestación sobre el
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
  translationBlockers,
  translationSystemPrompt,
  TranslationParseError,
  unitSig,
  type TranslationRequest,
} from "../lib/catalogs/translations.ts";
import { MemoryTranslations } from "../lib/catalogs/translation-memory.ts";
import {
  activeLanguageGaps,
  autoUnit,
  loadPanel,
  markItemReviewed,
  META_KEY,
  prepareItem,
  saveAndPublish,
  setLanguage,
  type EsState,
  type LinkRow,
} from "../lib/catalogs/translation-service.ts";
import { AutoTranslator, translationGaps, type AutoTarget } from "../lib/catalogs/auto-translate.ts";
import { AUTO_LIMITS, autoRetryState, isTargetLanguage, type AutoLimits, type TrAiFn } from "../lib/catalogs/translations.ts";
import { fakeTranslationAi, type FakeAi } from "../lib/catalogs/translation-fake-ai.ts";

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
  // Caso real (22-10-2026): el español dice «5.500 /mes» y «150 mensuales» (sin «€»,
  // así que se publica) y la IA escribe «5.500 €/ay» y «150 €»: no se bloquea.
  const real = checkTranslation([
    { where: "block:0", label: "Introducción", es: "Alquiler de corta estancia: 5.500 /mes. Alquiler de larga estancia: 5.780 /mes.", tr: "Kısa süreli kiralama: 5.500 €/ay.\n\nUzun süreli kiralama: 5.780 €/ay." },
    { where: "block:2", label: "La finca", es: "Plaza de garaje opcional, con un coste adicional de 150 mensuales.", tr: "Opsiyonel garaj yeri, aylık ek 150 € ücrete tabidir." },
  ], []);
  eq(real.blockers.length, 0, "precio que ya está en el español: no bloquea la traducción");
  eq(translationBlockers("Piso de 90 m².", "90 m² daire, aylık 2.000 €."), ["text_has_price"], "precio inventado por la traducción: bloquea");
  eq(translationBlockers("Garaje: 150 mensuales.", "Garaj: aylık 180 €."), ["text_has_price"], "importe cambiado: bloquea");
  eq(translationBlockers("Garaje: 150 mensuales.", "Garaj: € 150 aylık."), [], "«€» delante del importe del original: no bloquea");
  eq(translationBlockers("Llámanos.", "Arayın 612 345 678."), ["text_has_contact"], "contacto: bloquea siempre");
  eq(translationBlockers("Precio 1.450.000 €.", "Price €1,450,000."), [], "mismo importe con otros separadores: no bloquea");
  const sqlFix = readFileSync("supabase/migrations/0229_catalog_translation_prices.sql", "utf8");
  ok(/CREATE OR REPLACE FUNCTION catalog_tr_text_blocker/.test(sqlFix) && /catalog_text_blocker\(p_text\) = 'text_has_contact'/.test(sqlFix), "0229: la base de datos solo bloquea contacto en lo traducido");
  eq(clean.warnings.length + clean.blockers.length, 0, "separadores de miles distintos: la misma cifra, sin avisos");
  eq(classifyAiFailure(Object.assign(new Error("x"), { name: "TimeoutError" })), "uncertain", "tiempo agotado → incierto");
  eq(classifyAiFailure(new TypeError("fetch failed")), "uncertain", "conexión cortada → incierto");
  eq(classifyAiFailure(new Error("IA 500: boom")), "failed", "error del proveedor → fallido");
  eq(classifyAiFailure(new Error("x"), () => true), "not_configured", "IA sin configurar → sin llamada");
  eq(classifyAiFailure(new Error("algo raro")), "uncertain", "lo desconocido se trata como incierto (pudo cobrarse)");
  ok(translationErrorMessage("ERROR: text_has_price")?.includes("precio") && translationErrorMessage("ERROR: lang_incomplete") === null, "mensajes de error del gestor (ya no existe «incompleto»)");
}


// ── 4. Traducción automática: el mundo de pruebas ───────────────────────────
interface Cat {
  id: string;
  snapshot: InternalSnapshot;
  map: Array<{ p: string; k: string; av: string | null }>;
  version: number;
  lang: CatalogLanguage;
  links: Array<{ id: string; name: string; lang: CatalogLanguage | null; token: string }>;
  token: string;
  library?: Record<string, string>;
}
function world(team?: () => MemoryTranslations[]) {
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
    team,
    now: () => clock,
  });
  const byToken = (token: string) => {
    for (const c of cats.values()) {
      if (c.token === token) return { c, link: null };
      const link = c.links.find((l) => l.token === token);
      if (link) return { c, link };
    }
    return null;
  };
  /** Lo que sirve get_public_catalog para un token: idioma del enlace o del catálogo. */
  const snapOf = (token: string): InternalSnapshot => {
    const r = byToken(token)!;
    const lang = r.link?.lang ?? r.c.lang;
    return mem.mergeSnapshot(r.c.id, r.c.map, { ...structuredClone(r.c.snapshot), lang }, lang);
  };
  /** Como resolveToken de la instancia: el idioma lo decide la base de datos. */
  const resolve = async (token: string): Promise<AutoTarget | null> => {
    const r = byToken(token);
    if (!r) return null;
    const lang = r.link?.lang ?? r.c.lang;
    return isTargetLanguage(lang) ? { catalogId: r.c.id, ownerId: "owner", lang } : null;
  };
  return { cats, mem, snapOf, resolve, tick: (ms: number) => { clock += ms; }, now: () => clock };
}
type World = ReturnType<typeof world>;

/** El traductor en segundo plano sobre el mundo (una «instancia de proceso»). */
function translator(w: World, ai: TrAiFn | null, limits?: Partial<AutoLimits>) {
  let notified = 0;
  const t = new AutoTranslator({ resolve: w.resolve, backend: () => w.mem, ai, notify: () => { notified++; }, now: w.now, schedule: () => {}, limits, timeoutMs: 5_000 });
  return { t, notified: () => notified };
}

/** Una VISITA pública: la respuesta sale al momento (sin esperar a la IA) y
 *  encarga lo que falte, como getPublicCatalogState({ visit: true }). */
function visit(w: World, t: AutoTranslator, token: string) {
  const snap = w.snapOf(token);
  const pub = toPublicCatalog(snap);
  t.request(token, snap);
  return pub;
}

function item2(): InternalItem {
  return item({ key: "k2", slug: "piso-2", title: "Piso en Goya", subzone: "Goya", features_manual: ["Ascensor"], text: { b: "Piso tranquilo con cocina reformada.", l: null, h: [] }, area: null });
}
function addCat(w: World, id: string, items: InternalItem[], over: Partial<Cat> = {}) {
  w.cats.set(id, {
    id, snapshot: snap(items), map: items.map((it, i) => ({ p: `${id}-P${i + 1}`, k: String(it.key), av: null })), version: 10, lang: "es",
    links: [{ id: `${id}-L1`, name: "Ana", lang: null, token: `${id}-tok-ana` }, { id: `${id}-L2`, name: "Luis", lang: null, token: `${id}-tok-luis` }],
    token: `${id}-tok`, ...over,
  });
}

// ── 5. Primera visita, segunda visita, varias a la vez ──────────────────────
console.log("· traducción automática: primera y segunda visita, simultáneas, idiomas no elegidos");
{
  const w = world();
  addCat(w, "C1", [item(), item2()]);
  const fake = fakeTranslationAi();
  const { t, notified } = translator(w, fake.ai);

  // Español: nada que traducir, ni una llamada.
  ok(!translationGaps(w.snapOf("C1-tok")), "en español no falta nada (sin traducción automática)");
  visit(w, t, "C1-tok");
  await t.whenIdle();
  eq(fake.calls(), 0, "visitas en español: cero llamadas");

  // El dueño elige inglés para el enlace de Ana: se aplica AL MOMENTO.
  await setLanguage(w.mem, "C1", "C1-L1", "en");
  eq(w.cats.get("C1")!.links[0].lang, "en", "elegir el idioma de un enlace se aplica al momento (sin «completo»)");
  await setLanguage(w.mem, "C1", null, "fr");
  eq(w.cats.get("C1")!.lang, "fr", "y el del catálogo también");
  await setLanguage(w.mem, "C1", null, "es");

  // Primera visita en inglés: responde YA con N5 y encarga en segundo plano.
  const first = visit(w, t, "C1-tok-ana");
  ok(first.lang === "en" && first.items.every((x) => x.copyPending === true) && fake.calls() === 0, "primera visita: responde al momento con «Description in preparation» (N5) y sin esperar a la IA");
  ok(!JSON.stringify(first).includes("Ático exterior"), "N5: nunca el español en otro idioma");
  await t.whenIdle();
  eq(fake.calls(), 3, "en segundo plano: una llamada por vivienda y otra por el título del catálogo");
  ok(notified() === 3, "cada publicación avisa al vigilante (los lectores abiertos se actualizan solos)");
  const second = visit(w, t, "C1-tok-ana");
  ok(second.items.every((x) => !x.copyPending) && second.items[0].title.startsWith("[en]") && second.title === "Salamanca and Chamberí", "segunda visita: traducido (vivienda y título del catálogo)");
  await t.whenIdle();
  eq(fake.calls(), 3, "segunda visita: cero llamadas nuevas");
  w.tick(AUTO_LIMITS.requestThrottleMs + 1);
  visit(w, t, "C1-tok-ana");
  await t.whenIdle();
  eq(fake.calls(), 3, "y más visitas, tampoco");
  const panel = await loadPanel(w.mem, "C1", "en", w.now());
  ok(panel.items.every((i) => i.state === "current" && i.text?.approval === "auto"), "el gestor las ve «Traducida» y publicadas solas (approval «auto»)");
  ok(w.mem.jobs.every((j) => j.auto), "los trabajos quedan marcados como automáticos (lanzados por una visita)");
  ok(w.mem.texts.every((tx) => tx.lang === "en"), "solo el idioma del enlace");

  // DA17/DA19: Luis sigue en español; el general también.
  ok(toPublicCatalog(w.snapOf("C1-tok-luis")).lang === "es" && toPublicCatalog(w.snapOf("C1-tok")).items[0].title === "Ático con terraza en Recoletos", "el idioma de Ana no cambia el de Luis ni el general (DA17)");

  // Idioma no elegido por el dueño: no se traduce nada.
  const fr = { ...w.snapOf("C1-tok-luis"), lang: "fr" };
  t.request("C1-tok-luis", fr);
  await t.whenIdle();
  eq(fake.calls(), 3, "un idioma que no eligió el dueño (instantánea manipulada): cero llamadas (manda la base de datos)");
  t.request("C1-tok-inventado", { ...w.snapOf("C1-tok-ana") });
  await t.whenIdle();
  eq(fake.calls(), 3, "un token que no existe: cero llamadas");
}
{
  // Visitas simultáneas: una vez por vivienda, también entre dos «procesos».
  const w = world();
  const items = [item(), item2(), item({ key: "k3", slug: "piso-3", title: "Estudio en Chamberí", text: { b: "Estudio luminoso.", l: null, h: [] } })];
  addCat(w, "C2", items, { lang: "de" });
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const fake = fakeTranslationAi({ gate: () => gate });
  const A = translator(w, fake.ai);
  const B = translator(w, fake.ai);
  for (let i = 0; i < 5; i++) visit(w, A.t, "C2-tok");
  visit(w, A.t, "C2-tok-ana");
  visit(w, A.t, "C2-tok-luis");
  visit(w, B.t, "C2-tok");
  visit(w, B.t, "C2-tok-ana");
  await new Promise((r) => setTimeout(r, 30));
  release();
  await Promise.all([A.t.whenIdle(), B.t.whenIdle()]);
  eq(fake.calls(), 4, "visitas simultáneas (también desde dos procesos): un solo trabajo por vivienda y por el título (4)");
  ok(visit(w, A.t, "C2-tok-luis").items.every((x) => !x.copyPending), "y todas publicadas");
  await A.t.whenIdle();
}

// ── 6. Filtros: bloqueo, aviso, edición a mano, español cambiado ────────────
console.log("· publicación automática: bloqueos, avisos, edición a mano y español cambiado");
{
  const w = world();
  addCat(w, "C3", [item(), item2()], { lang: "en" });
  const fake = fakeTranslationAi();
  // Bloqueo en k1 la primera vez (contacto); aviso en k2 (cifra añadida).
  let blockedOnce = false;
  const ai: TrAiFn = async (o) => {
    const r = JSON.parse(await fake.ai(o));
    if (r.title?.includes("Ático") && !blockedOnce) {
      blockedOnce = true;
      r.blocks[0].x += " Call 612 345 678.";
    }
    if (r.title?.includes("Goya")) r.blocks[0].x += " 3 bedrooms.";
    return JSON.stringify(r);
  };
  const { t } = translator(w, ai);
  visit(w, t, "C3-tok");
  await t.whenIdle();
  let pub = visit(w, t, "C3-tok");
  await t.whenIdle();
  const k1 = pub.items.find((x) => x.key === "k1")!;
  const k2 = pub.items.find((x) => x.key === "k2")!;
  ok(k1.copyPending === true && !JSON.stringify(k1).includes("612"), "bloqueo (contacto): NO se publica; el cliente sigue con N5");
  ok(!k2.copyPending && k2.copy[0].text.includes("3 bedrooms"), "aviso (cifra añadida): se publica igual");
  let panel = await loadPanel(w.mem, "C3", "en", w.now());
  const p1 = panel.items.find((i) => i.key === "k1")!;
  const p2 = panel.items.find((i) => i.key === "k2")!;
  ok(p1.state === "blocked" && p1.check!.blockers.some((b) => b.code === "text_has_contact"), "el gestor la marca «No publicada: corrígela»");
  ok(p2.state === "review" && p2.check!.warnings.some((x) => x.id.startsWith("number+:")), "y la del aviso, «Traducida · revisar»");
  const calls = fake.calls();
  w.tick(AUTO_LIMITS.requestThrottleMs + 1);
  visit(w, t, "C3-tok");
  await t.whenIdle();
  eq(fake.calls(), calls, "una bloqueada no se vuelve a traducir sola (no se paga otra vez)");
  // «Dar por revisada».
  await markItemReviewed(w.mem, "C3", "k2", "en");
  panel = await loadPanel(w.mem, "C3", "en", w.now());
  ok(panel.items.find((i) => i.key === "k2")!.state === "current", "«Dar por revisada» quita la marca");
  // Corregir a mano la bloqueada: se publica al momento como manual.
  await saveAndPublish(w.mem, "C3", { key: "k1", lang: "en", text: { id: p1.text!.id, rev: p1.text!.rev, title: "Penthouse with a terrace in Recoletos", blocks: p1.es.blocks.filter((b) => !b.area).map((b) => `EN: ${b.es}`) } });
  pub = toPublicCatalog(w.snapOf("C3-tok"));
  ok(!pub.items[0].copyPending && pub.items[0].title === "Penthouse with a terrace in Recoletos", "corregida y guardada: publicada al momento");
  panel = await loadPanel(w.mem, "C3", "en", w.now());
  ok(panel.items[1].state === "current" && panel.items[1].text?.approval === "manual" && panel.items[1].text.origin === "manual", "lo editado a mano queda «manual»");
  try {
    const p = panel.items[1];
    await saveAndPublish(w.mem, "C3", { key: "k1", lang: "en", text: { id: p.text!.id, rev: p.text!.rev, title: "Precio: 900.000 €", blocks: p.es.blocks.filter((b) => !b.area).map(() => "x") } });
    ok(false, "guardar con precio: no");
  } catch (e) {
    ok(e instanceof Error && e.message === "text_has_price", "guardar a mano con un precio: se rechaza");
  }
  // La edición manual no se pisa: más visitas, cero llamadas, el texto igual.
  const before = fake.calls();
  w.tick(AUTO_LIMITS.requestThrottleMs + 1);
  visit(w, t, "C3-tok");
  await t.whenIdle();
  ok(fake.calls() === before && toPublicCatalog(w.snapOf("C3-tok")).items[0].title === "Penthouse with a terrace in Recoletos", "lo editado a mano no lo pisa ninguna traducción automática");
  // El español cambia: desactualizada → N5 → retraducción en la siguiente visita.
  const c3 = w.cats.get("C3")!;
  c3.snapshot.items[0] = { ...c3.snapshot.items[0], text: { b: "Ático exterior renovado y luminoso.", l: null, h: [] } };
  w.tick(AUTO_LIMITS.requestThrottleMs + 1);
  pub = visit(w, t, "C3-tok");
  ok(pub.items[0].copyPending === true && pub.items[0].title === "Home in Recoletos", "español cambiado: desactualizada → N5 al momento (sin español ni traducción vieja)");
  panel = await loadPanel(w.mem, "C3", "en", w.now());
  ok(panel.items[1].state === "outdated", "el gestor la marca «Desactualizada»");
  ok((await activeLanguageGaps(w.mem, "C3")).some((g) => g.lang === "en" && g.pending.length === 1), "y «Contenido» la cuenta");
  await t.whenIdle();
  eq(fake.calls(), before + 1, "la siguiente visita la retraduce sola (una llamada)");
  ok(JSON.parse(fake.last()!.userText).caracteristicas === undefined, "solo lo que falta (las características ya estaban)");
  pub = visit(w, t, "C3-tok");
  ok(!pub.items[0].copyPending && pub.items[0].copy[0].text.includes("renovado"), "y se publica la nueva");
  await t.whenIdle();
}

// ── 7. Fallos: espera creciente, parada, «Preparar ahora» ───────────────────
console.log("· fallos: espera creciente sin bucles y «Preparar ahora»");
{
  const w = world();
  addCat(w, "C4", [item()], { lang: "it" });
  let mode: "ok" | "timeout" | "error" = "timeout";
  const fake = fakeTranslationAi({ mode: () => mode });
  const { t } = translator(w, fake.ai);
  const round = async () => {
    w.tick(AUTO_LIMITS.requestThrottleMs + 1);
    visit(w, t, "C4-tok");
    await t.whenIdle();
    return fake.calls();
  };
  eq(await round(), 2, "incierto: una llamada por unidad y nada más");
  let p = (await loadPanel(w.mem, "C4", "it", w.now())).items.find((i) => i.key === "k1")!;
  ok(p.state === "waiting" && p.retry.failures === 1 && !!p.retry.until, "el gestor la marca «falló: se reintentará sola» con la hora");
  eq(await round(), 2, "otra visita enseguida: no reintenta (espera 5 min)");
  w.tick(5 * 60_000);
  eq(await round(), 4, "pasados 5 min: otro intento");
  w.tick(10 * 60_000);
  eq(await round(), 4, "tras el segundo fallo, 10 min no bastan (espera 30 min)");
  w.tick(20 * 60_000);
  eq(await round(), 6, "a los 30 min: tercer intento");
  mode = "error";
  w.tick(2 * 3600_000);
  eq(await round(), 8, "a las 2 h: cuarto (un error del proveedor también cuenta)");
  w.tick(12 * 3600_000);
  eq(await round(), 10, "a las 12 h: quinto");
  w.tick(48 * 3600_000);
  eq(await round(), 10, "tras 5 fallos seguidos ya no se reintenta solo");
  p = (await loadPanel(w.mem, "C4", "it", w.now())).items.find((i) => i.key === "k1")!;
  ok(p.state === "stopped" && p.retry.stopped, "el gestor: «Sin reintentos automáticos»");
  mode = "ok";
  await t.run({ catalogId: "C4", ownerId: "owner", lang: "it" }, { manual: true });
  eq(fake.calls(), 12, "«Preparar ahora» del dueño sí lo intenta (sin espera)");
  ok(!toPublicCatalog(w.snapOf("C4-tok")).items[0].copyPending, "y publica");
  // La regla de la espera, pura (la misma que SQL).
  const j = (status: string, min: number) => ({ status, reservedAt: new Date(Date.parse("2026-10-22T10:00:00Z") + min * 60_000).toISOString(), finishedAt: new Date(Date.parse("2026-10-22T10:00:00Z") + min * 60_000).toISOString(), expiresAt: "2026-10-22T11:00:00Z" });
  const base = Date.parse("2026-10-22T10:00:00Z");
  eq(autoRetryState([j("failed", 0)], base + 60_000).until, new Date(base + 300_000).toISOString(), "1 fallo → 5 min");
  eq(autoRetryState([j("failed", 0), j("done", 1), j("uncertain", 2)], base + 3 * 60_000).failures, 1, "un trabajo terminado reinicia la cuenta");
  eq(autoRetryState([j("cancelled", 0)], base).failures, 0, "una cancelación no cuenta como fallo");
  eq(autoRetryState([j("expired", 0), j("failed", 1)], base + 2 * 60_000).until, new Date(base + 60_000 + 1_800_000).toISOString(), "una reserva caducada cuenta (pudo cobrarse) → 2 fallos, 30 min");
}

// ── 8. Límites: a la vez por catálogo, por visita y por día ─────────────────
console.log("· límites contra el abuso y el coste");
{
  const w = world();
  const many = Array.from({ length: 6 }, (_, i) => item({ key: `m${i}`, slug: `m-${i}`, title: `Piso ${i} en Recoletos`, text: { b: `Piso número ${i} con luz.`, l: null, h: [] } }));
  addCat(w, "C5", many, { lang: "fr" });
  const fake = fakeTranslationAi();
  let inflight = 0;
  let peak = 0;
  const slow: TrAiFn = async (o) => {
    inflight++;
    peak = Math.max(peak, inflight);
    await new Promise((r) => setTimeout(r, 15));
    inflight--;
    return fake.ai(o);
  };
  const { t } = translator(w, slow);
  visit(w, t, "C5-tok");
  await t.whenIdle();
  ok(peak <= AUTO_LIMITS.maxActivePerCatalog && peak === 2 && fake.calls() === 7, `como mucho ${AUTO_LIMITS.maxActivePerCatalog} trabajos a la vez por catálogo (pico ${peak}, 7 llamadas)`);

  // Tope por visita.
  const w2 = world();
  addCat(w2, "C6", many.slice(0, 5), { lang: "fr" });
  const f2 = fakeTranslationAi();
  const T2 = translator(w2, f2.ai, { maxAiPerVisit: 2 });
  visit(w2, T2.t, "C6-tok");
  await T2.t.whenIdle();
  eq(f2.calls(), 2, "tope por visita: 2 llamadas en una visita");
  visit(w2, T2.t, "C6-tok-ana"); // otro token del mismo catálogo; Ana sigue al catálogo (francés)
  await T2.t.whenIdle();
  eq(f2.calls(), 4, "la visita siguiente continúa");

  // Tope diario por catálogo.
  const w3 = world();
  addCat(w3, "C7", many.slice(0, 5), { lang: "fr" });
  const f3 = fakeTranslationAi();
  const T3 = translator(w3, f3.ai, { dailyCapPerCatalog: 3 });
  visit(w3, T3.t, "C7-tok");
  await T3.t.whenIdle();
  eq(f3.calls(), 3, "tope diario de trabajos automáticos por catálogo");
  w3.tick(25 * 3600_000);
  visit(w3, T3.t, "C7-tok");
  await T3.t.whenIdle();
  eq(f3.calls(), 6, "al día siguiente, otros tantos");

  // Mismo token: una visita repetida no relanza nada antes de requestThrottleMs.
  const w4 = world();
  addCat(w4, "C8", [item()], { lang: "en" });
  let resolves = 0;
  const f4 = fakeTranslationAi({ mode: () => "error" });
  const T4 = new AutoTranslator({ resolve: async (tk) => { resolves++; return w4.resolve(tk); }, backend: () => w4.mem, ai: f4.ai, notify: () => {}, now: w4.now, schedule: () => {} });
  for (let i = 0; i < 20; i++) visit(w4, T4, "C8-tok");
  await T4.whenIdle();
  ok(resolves === 1 && f4.calls() === 2, "20 lecturas seguidas del mismo enlace (estado cada 500 ms): una sola comprobación");
  // Si el dueño cambia el idioma, la siguiente visita lo encarga sin esperar.
  await setLanguage(w4.mem, "C8", null, "fr");
  visit(w4, T4, "C8-tok");
  await T4.whenIdle();
  ok(resolves === 2 && f4.calls() === 4, "el dueño cambia el idioma: la siguiente visita (enseguida) encarga el nuevo");
  // Sin IA configurada: no se llama a nada y no se rompe nada.
  const w5 = world();
  addCat(w5, "C9", [item()], { lang: "en" });
  const T5 = translator(w5, null);
  visit(w5, T5.t, "C9-tok");
  await T5.t.whenIdle();
  ok(toPublicCatalog(w5.snapOf("C9-tok")).items[0].copyPending === true && w5.mem.jobs.length === 0, "sin IA: N5 y ningún trabajo");
}

// ── 9. DA34, C2 y PDF por token en cada idioma ──────────────────────────────
console.log("· datos operativos, C2 y PDF por token en cada idioma");
{
  const w = world();
  addCat(w, "D1", [item(), item2()]);
  w.cats.get("D1")!.links[0].lang = "en";
  w.cats.get("D1")!.links[1].lang = "ar";
  const fake = fakeTranslationAi();
  const { t } = translator(w, fake.ai);
  visit(w, t, "D1-tok-ana");
  visit(w, t, "D1-tok-luis");
  await t.whenIdle();
  eq(fake.calls(), 6, "dos enlaces en dos idiomas: cada uno el suyo (3 + 3)");
  const ana = toPublicCatalog(w.snapOf("D1-tok-ana"));
  const luis = toPublicCatalog(w.snapOf("D1-tok-luis"));
  ok(ana.lang === "en" && luis.lang === "ar" && ana.items[0].title.startsWith("[en]") && ana.title === "Salamanca and Chamberí", "Ana en inglés");
  ok(luis.items.every((x) => !x.copyPending) && luis.items[1].copy[0].text.startsWith("[ar]"), "Luis en árabe (DA19: ni contenido ni idioma de otro enlace)");
  const c = w.cats.get("D1")!;
  c.snapshot.items[0].price = 1500000;
  c.snapshot.items[0].pp = { x: ["fb"], o: null };
  let en = toPublicCatalog(w.snapOf("D1-tok-ana"));
  ok(en.items[0].price === "€1,500,000" && en.items[0].photos.length === 1 && !en.items[0].copyPending, "precio y foto excluida: al momento en inglés (DA34), la traducción sigue vigente");
  ok(toPublicCatalog(w.snapOf("D1-tok-luis")).items[0].photos.length === 1, "y en árabe");
  c.snapshot.items = c.snapshot.items.filter((x) => x.key !== "k2");
  ok(toPublicCatalog(w.snapOf("D1-tok-ana")).items.length === 1, "vivienda retirada: fuera también en inglés");
  c.snapshot.items.push(item2());
  c.snapshot.items[0] = { ...c.snapshot.items[0], text: null };
  en = toPublicCatalog(w.snapOf("D1-tok-ana"));
  ok(en.items[0].copy.length === 0 && !en.items[0].copyPending && toPublicCatalog(w.snapOf("D1-tok")).items[0].copy.length === 0, "C2: sin texto vigente en español, tampoco en inglés (ni aviso)");
  // PDF por token: lee la MISMA instantánea del token (con su idioma).
  const pdfSnap = w.snapOf("D1-tok-luis");
  const pdf = toPublicCatalog(pdfSnap, "sale");
  ok(pdf.lang === "ar" && pdf.items[1].copy[0].text.startsWith("[ar]") && pdf.items[1].price === toPublicCatalog(pdfSnap, "sale").items[1].price, "PDF por token: contenido traducido del idioma del enlace y datos actuales");
}

// ── 10. Cancelación, caducidad, fuentes y plantillas ────────────────────────
console.log("· descartes, fuentes (DA31) y plantillas (DA27)");
{
  const w = world();
  addCat(w, "E1", [item()]);
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const slow = fakeTranslationAi({ gate: () => gate });
  const run = prepareItem(w.mem, { ai: slow.ai }, { catalogId: "E1", key: "k1", lang: "de" });
  await new Promise((r) => setTimeout(r, 10));
  const job = w.mem.jobs.find((j) => j.status === "reserved")!;
  ok(await w.mem.cancel(job.id), "cancelar una preparación en curso (0226)");
  release();
  const out = await run;
  ok(out.kind === "discarded" && !w.mem.texts.some((x) => x.lang === "de"), "lo que llega tras cancelar se descarta y no se guarda");
  // Caducada: un trabajo viejo no pisa uno más nuevo.
  let release2!: () => void;
  const gate2 = new Promise<void>((r) => { release2 = r; });
  const old = prepareItem(w.mem, { ai: fakeTranslationAi({ gate: () => gate2 }).ai, ttlSeconds: 30 }, { catalogId: "E1", key: "k1", lang: "it" });
  await new Promise((r) => setTimeout(r, 10));
  w.tick(31_000);
  const waiting = await prepareItem(w.mem, { ai: fakeTranslationAi().ai }, { catalogId: "E1", key: "k1", lang: "it" });
  ok(waiting.kind === "waiting", "una reserva caducada cuenta como fallo: una visita espera antes de reintentar");
  const n = await prepareItem(w.mem, { ai: fakeTranslationAi().ai }, { catalogId: "E1", key: "k1", lang: "it", manual: true });
  ok(n.kind === "saved", "el dueño sí: otro trabajo reserva y guarda");
  release2();
  const o = await old;
  ok(o.kind === "discarded" && w.mem.texts.filter((x) => x.lang === "it").length === 1 && w.mem.texts.find((x) => x.lang === "it")!.rev === 1, "el viejo llega tarde: descartado, el nuevo no se pisa");
  // Dos «Preparar» a la vez sobre lo mismo: uno reserva, otro «en preparación».
  const f = fakeTranslationAi();
  const [a, b] = await Promise.all([prepareItem(w.mem, { ai: f.ai }, { catalogId: "E1", key: "k1", lang: "fr", manual: true }), prepareItem(w.mem, { ai: f.ai }, { catalogId: "E1", key: "k1", lang: "fr", manual: true })]);
  eq([a.kind, b.kind].sort(), ["busy", "saved"], "dos a la vez: uno guarda y el otro ve «en preparación»");
  eq(f.calls(), 1, "una sola llamada");
}
{
  const w = world();
  const shared = item();
  addCat(w, "A", [shared], { library: { "A-P1": "V1" }, lang: "en" });
  addCat(w, "B", [{ ...shared, key: "kb" }], { lang: "en" });
  w.cats.get("B")!.map = [{ p: "A-P1", k: "kb", av: null }];
  w.cats.get("B")!.library = { "A-P1": "V1" };
  addCat(w, "C", [{ ...shared, key: "kc" }], { lang: "en" });
  w.cats.get("C")!.map = [{ p: "A-P1", k: "kc", av: null }];
  const fake = fakeTranslationAi();
  const { t } = translator(w, fake.ai);
  visit(w, t, "A-tok");
  await t.whenIdle();
  eq(fake.calls(), 2, "catálogo A: vivienda (de la biblioteca) y título");
  visit(w, t, "B-tok");
  await t.whenIdle();
  eq(fake.calls(), 3, "catálogo B con la misma versión de la biblioteca: la vivienda SIN IA (solo su título)");
  ok(!toPublicCatalog(w.snapOf("B-tok")).items[0].copyPending, "y se publica en B");
  visit(w, t, "C-tok");
  await t.whenIdle();
  eq(fake.calls(), 4, "catálogo C con texto propio IDÉNTICO: reutiliza la traducción (0230, decisión del 23-10-2026; antes DA31 la repetía)");
  ok(w.mem.sources.filter((s) => s.kind === "library").length === 1 && w.mem.sources.some((s) => s.kind === "catalog" && s.catalogId === "C"), "la de A cuelga de la biblioteca; la de C es propia (no se promociona)");
  // Plantilla: una traducción, reutilizada en otra vivienda.
  const T = "Recoletos es un barrio de fincas señoriales.";
  const t1 = item({ key: "t1", text: { b: "Ático exterior.\n\nEl salón es luminoso.", l: null, h: [] }, at: T });
  const t2 = item({ key: "t2", title: "Otro piso en Recoletos", text: { b: "Piso reformado.", l: null, h: [] }, at: T, features_manual: [] });
  addCat(w, "T", [t1, t2], { lang: "en" });
  w.cats.get("T")!.map = [{ p: "Q1", k: "t1", av: "AV1" }, { p: "Q2", k: "t2", av: "AV1" }];
  const tf = fakeTranslationAi();
  const T2 = translator(w, tf.ai, { maxActivePerCatalog: 1 });
  visit(w, T2.t, "T-tok");
  await T2.t.whenIdle();
  const zonas = tf.calls();
  ok(zonas === 3, "plantilla: se traduce una vez (con la primera vivienda) y la segunda la reutiliza");
  const pub = toPublicCatalog(w.snapOf("T-tok"));
  ok(pub.items.every((x) => x.copy.at(-1)?.heading === "Living in Recoletos" && !x.copyPending), "las dos con «Living in Recoletos» (nombre propio intacto)");
}

// ── 10b. Equipo (0230): una vivienda ya traducida no se vuelve a pagar ──────
console.log("· equipo: la misma vivienda en otro catálogo reutiliza su traducción (0230)");
{
  const team: MemoryTranslations[] = [];
  const a = world(() => team);
  const b = world(() => team);
  team.push(a.mem, b.mem);
  const same = (id: string) => ({ map: [{ p: "A1-P1", k: "k1", av: null }, { p: "A1-P2", k: "k2", av: null }].map((m) => ({ ...m })), token: `${id}-tok` });
  addCat(a, "A1", [item(), item2()]);
  const fa = fakeTranslationAi();
  const ta = translator(a, fa.ai).t;
  await setLanguage(a.mem, "A1", null, "en");
  visit(a, ta, "A1-tok");
  await ta.whenIdle();
  eq(fa.calls(), 3, "primer catálogo (Ana): dos viviendas y el título → tres llamadas");
  const aSnap = a.snapOf("A1-tok");

  // Otra persona del equipo pone las MISMAS viviendas en su catálogo, en inglés.
  addCat(b, "B1", [item(), item2()], same("B1"));
  const fb = fakeTranslationAi();
  const tb = translator(b, fb.ai).t;
  await setLanguage(b.mem, "B1", null, "en");
  visit(b, tb, "B1-tok");
  await tb.whenIdle();
  eq(fb.calls(), 1, "segundo catálogo (otra persona): solo el título de SU catálogo; las viviendas, sin IA");
  const bSnap = b.snapOf("B1-tok");
  ok(bSnap.items.every((x) => x.tr), "las dos viviendas se publican en inglés al momento");
  eq(bSnap.items.map((x) => [x.tr?.t, x.tr?.b, x.tr?.f]), aSnap.items.map((x) => [x.tr?.t, x.tr?.b, x.tr?.f]), "con la MISMA traducción (texto y características)");
  const panelB = await loadPanel(b.mem, "B1", "en");
  ok(panelB.items.filter((x) => x.kind === "item").every((x) => x.text?.reused === true && x.text.approval === "auto"), "en «Idiomas»: «reutilizada», publicada sola en este catálogo");

  // El mismo dueño, otro catálogo: tampoco se vuelve a pagar.
  addCat(a, "A2", [item()], { map: [{ p: "A1-P1", k: "k1", av: null }] });
  await setLanguage(a.mem, "A2", null, "en");
  visit(a, ta, "A2-tok");
  await ta.whenIdle();
  eq(fa.calls(), 4, "el mismo dueño, otro catálogo: solo el título");

  // Español distinto (otra descripción del mismo piso): se traduce.
  addCat(b, "B2", [item({ text: { b: "Ático reformado con vistas.", l: null, h: [] } })], { map: [{ p: "A1-P1", k: "k1", av: null }] });
  await setLanguage(b.mem, "B2", null, "en");
  visit(b, tb, "B2-tok");
  await tb.whenIdle();
  eq(fb.calls(), 3, "si el español NO es idéntico, se traduce (vivienda + título)");

  // Otro idioma: no hay nada que reutilizar.
  await setLanguage(b.mem, "B1", null, "fr");
  visit(b, tb, "B1-tok");
  await tb.whenIdle();
  eq(fb.calls(), 6, "otro idioma: se traduce (dos viviendas + título)");

  // Lo corregido a mano gana, y solo se reutiliza lo PUBLICADO.
  const pa = (await loadPanel(a.mem, "A1", "en")).items.find((x) => x.key === "k1")!;
  await saveAndPublish(a.mem, "A1", { key: "k1", lang: "en", text: { id: pa.text!.id, rev: pa.text!.rev, title: "Penthouse with terrace (corrected)", blocks: pa.es.blocks.filter((x) => !x.area).map((x) => x.tr ?? "") } });
  addCat(b, "B3", [item()], { map: [{ p: "A1-P1", k: "k1", av: null }] });
  await setLanguage(b.mem, "B3", null, "en");
  visit(b, tb, "B3-tok");
  await tb.whenIdle();
  eq(b.snapOf("B3-tok").items[0].tr?.t, "Penthouse with terrace (corrected)", "si alguien la corrigió a mano, se reutiliza la corregida");
  for (const t of a.mem.texts) if (t.lang === "en") t.status = "draft";
  for (const t of b.mem.texts) if (t.lang === "en") t.status = "draft";
  const before = fb.calls();
  addCat(b, "B4", [item()], { map: [{ p: "A1-P1", k: "k1", av: null }] });
  await setLanguage(b.mem, "B4", null, "en");
  visit(b, tb, "B4-tok");
  await tb.whenIdle();
  eq(fb.calls() - before, 2, "un borrador sin publicar no se reutiliza (vivienda + título)");
}

// ── 11. Fuente: lo público nunca espera a la IA (DA12 sustituida) ───────────
console.log("· comprobaciones de fuente");
{
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const strip = (src: string) => src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const publicFiles = [
    "lib/catalogs/to-public.ts", "lib/catalogs/public-data.ts",
    "app/api/seleccion/[token]/estado/route.ts", "app/api/seleccion/[token]/eventos/route.ts",
    "app/api/seleccion/[token]/opiniones/route.ts", "app/api/seleccion/[token]/pdf/route.ts", "app/seleccion/[token]/page.tsx",
  ];
  for (const f of publicFiles) {
    const src = strip(read(f));
    ok(!/aiComplete|translation-service|translation-data|translation-fake-ai|runPreparation|prepareItem|autoUnit/.test(src), `${f}: sin IA ni preparación directa`);
  }
  const pd = strip(read("lib/catalogs/public-data.ts"));
  ok(/void import\("\.\/auto-translate-instance"\)/.test(pd) && !/await import\("\.\/auto-translate-instance"\)/.test(pd) && !/await\s+requestAutoTranslation/.test(pd), "public-data: encarga la traducción SIN esperarla (ni la carga del módulo)");
  ok(/if \(opts\?\.visit\) requestTranslationsLater/.test(pd) && /readSnapshot: async \(\) => \{[\s\S]*requestTranslationsLater\(token, snap\)/.test(pd), "solo las visitas (y el PDF por token) la encargan");
  for (const f of ["app/seleccion/[token]/page.tsx", "app/api/seleccion/[token]/estado/route.ts", "app/api/seleccion/[token]/eventos/route.ts"]) {
    ok(/getPublicCatalogState\(token, \{ visit: true \}\)/.test(read(f)), `${f}: cuenta como visita`);
  }
  ok(/fetchContent: \(token\) => getPublicCatalogState\(token\)/.test(read("lib/catalogs/sync-hub-instance.ts")), "el vigilante NO cuenta como visita");
  const inst = read("lib/catalogs/auto-translate-instance.ts");
  ok(/isCatalogFixtureMode\(\) \? fixtureDeps\(\) : realDeps\(\)/.test(inst) && /ai: \(o\) => aiComplete\(o\)/.test(inst), "la app usa aiComplete; la IA falsa solo en los fixtures");
  ok(/c\.status !== "active" \|\| row\.revoked_at \|\| new Date\(row\.expires_at\)/.test(inst) && /row\.lang \?\? c\.default_lang/.test(inst), "el idioma sale del enlace o del catálogo (base de datos), nunca de la URL");
  const mig = read("supabase/migrations/0228_catalog_translations_auto.sql");
  ok(!/property_client_descriptions|UPDATE properties|INSERT INTO properties/i.test(mig.replace(/--[^\n]*/g, "")), "0228: nunca escribe en properties ni en property_client_descriptions");
  ok(/pg_advisory_xact_lock\(hashtextextended\('catalog_tr_auto:'/.test(mig) && /'limit'/.test(mig) && /'cap'/.test(mig) && /'waiting'/.test(mig) && /'stopped'/.test(mig), "0228: cerrojo por catálogo y los cuatro límites");
  ok(/REVOKE ALL ON FUNCTION catalog_tr_reserve_auto/.test(mig) && /GRANT EXECUTE ON FUNCTION catalog_tr_publish\(uuid, uuid, uuid, text, text, jsonb, text\)\s+TO service_role/.test(mig), "0228: solo service_role");
  const actions = read("app/[country]/(admin)/admin/mi-espacio/actions.ts");
  ok(/prepareTranslationsNowAction[\s\S]*withHomeAccess[\s\S]*prepareNow\(profile\.id/.test(actions) && !/translation-fake-ai/.test(actions), "acciones: «Preparar ahora» con la guarda del dueño; nunca la IA falsa");
  const ui = read("components/admin/catalogs/manager/languages-section.tsx");
  ok(/sin revisión nativa/.test(ui) && /Preparar ahora/.test(ui) && /Dar por revisada/.test(ui) && !/Aprobar y usar/.test(ui), "gestor: opcional, «sin revisión nativa», «Preparar ahora», sin aprobar bloque a bloque");
  ok(/share-lang-select/.test(read("components/admin/catalogs/manager/share-section.tsx")), "selector de idioma junto a «Compartir»");
  const pages = read("components/catalogs/reader/pages.tsx");
  ok(/copyPending/.test(pages) && /data-testid="copy-pending"/.test(pages), "lector: el aviso N5 en el sitio de la descripción");
}

console.log(`test-catalogs-translations: ${passes} comprobaciones en verde${failures ? `, ${failures} fallidas` : ""}`);
if (failures) process.exit(1);
