/**
 * Tests del gestor de catálogos (BCP-01 E2). Puros, sin base de datos ni red.
 *
 * Los resultados esperados están ESCRITOS A MANO a partir de las reglas del
 * plan E2 (§3.4, §3.5, §3.11 y ajustes 1 y 2), nunca obtenidos ejecutando el
 * código que se prueba.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-manager.mts
 */
import { materialLabels, materialOf, type CatalogMaterial } from "../lib/catalogs/material.ts";
import { materialByProperty } from "../lib/catalogs/material-data.ts";
import type { InternalItem } from "../lib/catalogs/to-public.ts";
import {
  beginSave,
  contactAdapter,
  criteriaAdapter,
  criteriaRawOf,
  editDraft,
  editTextDraft,
  isEdited,
  keepMine,
  keepMineText,
  managerSearch,
  matchesContentFilter,
  matchesQuery,
  metaAdapter,
  parseSection,
  reconcileDraft,
  reconcileTextDraft,
  saveFailed,
  saveSucceeded,
  textKey,
  textPendingSave,
  textSaveSucceeded,
  textStateLabel,
  type ContactRaw,
  type CriteriaRaw,
  type Draft,
} from "../lib/catalogs/manager-state.ts";
import type { PublicItem } from "../lib/catalogs/public-contract.ts";
import type { CatalogTextView } from "../lib/catalogs/texts.ts";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string) {
  console.log(`\n${title}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// --- Material ---------------------------------------------------------------

function item(over: Partial<PublicItem>): PublicItem {
  return {
    key: "k", title: "T", place: null, operation: "Venta", price: "1 €", reserved: false,
    bedrooms: null, bathrooms: null, squareMeters: null, floor: "", description: null, features: [],
    lead: null, highlights: [], sections: [], photos: [], coverIndex: 0, mosaic: [],
    ...over,
  } as PublicItem;
}
const ph = (n: number) => Array.from({ length: n }, (_, i) => ({ src: `/p/${i}`, w: null, h: null })) as unknown as PublicItem["photos"];

function testMaterial() {
  section("E2 · material (DQ8)");
  // Ficha breve con 3 fotos: sin texto, 0 capítulos.
  const a = materialOf(item({ photos: ph(3) }));
  check("ficha breve con 3 fotos", same(a, { noText: true, sections: 0, sectionsWithoutPhoto: 0, photos: 3 }));
  check("ficha breve → «Sin descripción»", same(materialLabels(a), ["Sin descripción"]));
  // Descripción y 3 capítulos, 2 sin foto (photo null), 4 fotos.
  const b = materialOf(item({
    description: "Texto", photos: ph(4),
    sections: [{ heading: null, text: "a", photo: 1 }, { heading: null, text: "b", photo: null }, { heading: null, text: "c", photo: null }],
  }));
  check("3 capítulos, 2 sin foto", same(b, { noText: false, sections: 3, sectionsWithoutPhoto: 2, photos: 4 }));
  check("«2 capítulos sin foto adecuada»", same(materialLabels(b), ["2 capítulos sin foto adecuada"]));
  // Un capítulo sin foto y ninguna foto.
  const c = materialOf(item({ sections: [{ heading: "H", text: "x", photo: null }] }));
  check("1 capítulo sin foto y 0 fotos", same(materialLabels(c), ["1 capítulo sin foto adecuada", "Sin fotos"]));
  // Descripción sin capítulos: no es ficha breve.
  const d = materialOf(item({ description: "Texto", photos: ph(1) }));
  check("descripción sin capítulos: sin avisos", same(materialLabels(d), []));
  // Sin nada.
  check("sin texto ni fotos", same(materialLabels(materialOf(item({}))), ["Sin descripción", "Sin fotos"]));
}

function internal(over: Partial<InternalItem> & { key: string; slug: string }): InternalItem {
  return {
    title: "T", zone: "Madrid", subzone: null, operation: "sale", operations: null, price: null, rent_price: null,
    currency: "eur", status: "available", bedrooms: null, bathrooms: null, square_meters: null, description: null,
    features: null, features_manual: null, floor_override: null, clean: null, photos: [],
    ...over,
  } as InternalItem;
}

function testMaterialByProperty() {
  section("E2 · material desde la instantánea del lector");
  const photo = (u: string) => ({ u, w: 800, h: 600, c: null });
  const snap = {
    items: [
      // Orden distinto al de la lista; «b» sin texto ni limpia → ficha breve.
      internal({ key: "kb", slug: "b", photos: [photo("1"), photo("2")] }),
      // «a» con texto del catálogo vigente → hay descripción.
      internal({ key: "ka", slug: "a", text: { b: "Un piso luminoso con salón amplio.", l: null, h: null } }),
      // Vendida: el cliente no la ve.
      internal({ key: "kc", slug: "c", status: "sold", photos: [photo("3")] }),
      // Slug que no está en la lista: se ignora.
      internal({ key: "kd", slug: "zz" }),
    ],
  };
  const items = [{ propertyId: "id-a", slug: "a" }, { propertyId: "id-b", slug: "b" }, { propertyId: "id-c", slug: "c" }];
  const m = materialByProperty(snap, items);
  check("solo las de la lista que ve el cliente (a y b)", same(Object.keys(m).sort(), ["id-a", "id-b"]));
  check("b: ficha breve con 2 fotos", m["id-b"]?.noText === true && m["id-b"]?.photos === 2 && m["id-b"]?.sections === 0);
  check("a: con descripción y sin fotos", m["id-a"]?.noText === false && m["id-a"]?.photos === 0);
  check("sin instantánea → vacío", same(materialByProperty(null, items), {}));
}

// --- Secciones y URL ----------------------------------------------------------

function testSections() {
  section("E2 · secciones y URL");
  check("sin valor → viviendas", parseSection(null) === "viviendas");
  check("desconocida → viviendas", parseSection("ajustes") === "viviendas");
  check("diseno", parseSection("diseno") === "diseno");
  check("conserva medir y vivo", managerSearch("?medir=1&vivo=1", { seccion: "contenido", vivienda: "p1" }) === "?medir=1&vivo=1&seccion=contenido&vivienda=p1");
  check("quita la vivienda al cerrar", managerSearch("?seccion=contenido&vivienda=p1&grande=1", { seccion: "contenido" }) === "?seccion=contenido&grande=1");
  check("sin «?» de entrada", managerSearch("grande=1", { seccion: "compartir" }) === "?grande=1&seccion=compartir");
}

// --- Borradores: en bruto (ajuste 1) ----------------------------------------------

const SAVED_CRIT = { operation: "sale" as const, zones: [{ kind: "district" as const, name: "Salamanca" }], price_min: null, price_max: 1200000, sort: "price_asc" as const, max: 12 };

function testRaw() {
  section("E2 · lo escrito se conserva en bruto (ajuste 1)");
  const raw0 = criteriaRawOf(SAVED_CRIT);
  check("criterios guardados en bruto: precio como texto", raw0.pmax === "1200000" && raw0.max === "12");
  const savedKey = criteriaAdapter.key(raw0);
  // Se escribe «1.200.000»: semánticamente igual a lo guardado.
  const d1 = editDraft<CriteriaRaw>(undefined, savedKey, { ...raw0, pmax: "1.200.000" });
  check("«1.200.000» = 1200000 → no marca cambio", !isEdited(criteriaAdapter, d1));
  check("…pero el borrador conserva «1.200.000»", d1.value.pmax === "1.200.000");
  // Un refresco con lo mismo guardado no borra lo escrito.
  const d2 = reconcileDraft(criteriaAdapter, d1, { key: savedKey, raw: raw0 });
  check("refresco igual: sigue «1.200.000»", d2.value.pmax === "1.200.000" && d2.conflict === null);
  // Distrito elegido sin «Añadir»: incompleto, cuenta como cambio y se conserva.
  const d3 = editDraft(d2, savedKey, { ...d2.value, district: "Chamberí" });
  check("distrito sin añadir → cambio sin guardar", isEdited(criteriaAdapter, d3) && d3.value.district === "Chamberí");
  // Texto de «Otra zona» con espacios.
  const d4 = editDraft(d3, savedKey, { ...d3.value, district: "", freeName: "  Pozuelo" });
  check("«Otra zona» con espacios se conserva tal cual", d4.value.freeName === "  Pozuelo" && isEdited(criteriaAdapter, d4));
  // Precio no válido: cuenta como cambio y no se pierde.
  const d5 = editDraft(d4, savedKey, { ...d4.value, freeName: "", pmax: "12a" });
  check("precio no válido: cambio y texto intacto", isEdited(criteriaAdapter, d5) && d5.value.pmax === "12a");

  // Teléfono: «600 111 222» frente a +34600111222 guardado.
  const savedContact = contactAdapter.key({ name: "Ana", phone: "+34600111222", role: "asesora" });
  const c1 = editDraft<ContactRaw>(undefined, savedContact, { name: "Ana", phone: "600 111 222", role: "asesora" });
  check("«600 111 222» = +34600111222 → no marca cambio", !isEdited(contactAdapter, c1));
  check("…y conserva los espacios", c1.value.phone === "600 111 222");
  const c2 = editDraft(c1, savedContact, { ...c1.value, phone: "600 111 223" });
  check("otro número → cambio", isEdited(contactAdapter, c2));
  check("«00 34 600…» = +34600…", contactAdapter.key({ name: "Ana", phone: "0034 600 111 222", role: "asesora" }) === savedContact);

  // Título con espacios al final.
  const savedMeta = metaAdapter.key({ title: "Salamanca", intro: "" });
  const m1 = editDraft(undefined, savedMeta, { title: "Salamanca ", intro: "" });
  check("título con espacio final: sin cambio, texto intacto", !isEdited(metaAdapter, m1) && m1.value.title === "Salamanca ");
}

// --- Borradores: guardado con retraso (ajuste 2) --------------------------------------

function testPendingSave() {
  section("E2 · guardado con retraso (ajuste 2)");
  const saved = metaAdapter.key({ title: "A", intro: "" });
  let d: Draft<{ title: string; intro: string }> = editDraft(undefined, saved, { title: "B", intro: "" });
  // Guardar «B»; mientras tanto se escribe «BC».
  const s = beginSave(metaAdapter, d, d.value);
  d = editDraft(s.draft, saved, { title: "BC", intro: "" });
  check("instantánea enviada = «B»", s.submittedKey === metaAdapter.key({ title: "B", intro: "" }));
  // Éxito: reconoce «B», conserva «BC» y sigue marcado.
  const ok = saveSucceeded(d, s.submittedKey);
  check("éxito: lo escrito después sigue («BC»)", ok.value.title === "BC");
  check("éxito: referencia = «B»", ok.start === metaAdapter.key({ title: "B", intro: "" }) && ok.pending === null);
  check("éxito: «BC» sigue como cambio sin guardar", isEdited(metaAdapter, ok));
  // El refresco posterior trae «B»: no es conflicto.
  const r = reconcileDraft(metaAdapter, ok, { key: metaAdapter.key({ title: "B", intro: "" }), raw: { title: "B", intro: "" } });
  check("refresco con lo enviado: sin conflicto", r.conflict === null && r.value.title === "BC");
  // Un refresco que llega ANTES de la respuesta con lo enviado: tampoco es conflicto.
  const early = reconcileDraft(metaAdapter, d, { key: s.submittedKey, raw: { title: "B", intro: "" } });
  check("refresco antes de la respuesta: reconoce lo enviado", early.conflict === null && early.start === s.submittedKey && early.value.title === "BC");
  // Fallo: nada se pierde y la referencia no cambia.
  const ko = saveFailed(d, s.submittedKey);
  check("fallo: «BC» sigue, referencia «A», sin pendiente", ko.value.title === "BC" && ko.start === saved && ko.pending === null);
  check("fallo: sigue marcado", isEdited(metaAdapter, ko));
  // Éxito sin ediciones posteriores: deja de marcar, el borrador conserva lo escrito.
  let e: Draft<{ title: string; intro: string }> = editDraft(undefined, saved, { title: "B ", intro: "" });
  const s2 = beginSave(metaAdapter, e, e.value);
  e = saveSucceeded(s2.draft, s2.submittedKey);
  check("éxito sin más ediciones: no marca y conserva «B »", !isEdited(metaAdapter, e) && e.value.title === "B ");
}

// --- Borradores: conflictos -------------------------------------------------------

function testConflict() {
  section("E2 · conflictos (otra pestaña u otra acción)");
  const k = (t: string) => metaAdapter.key({ title: t, intro: "" });
  const d = editDraft(undefined, k("A"), { title: "Mío", intro: "" });
  const c = reconcileDraft(metaAdapter, d, { key: k("Otro"), raw: { title: "Otro", intro: "" } });
  check("guardado distinto → conflicto, lo escrito intacto", c.conflict?.raw.title === "Otro" && c.value.title === "Mío");
  check("en conflicto sigue marcado", isEdited(metaAdapter, c));
  const km = keepMine(c);
  check("«Mantener los míos»: referencia = lo guardado nuevo, sin guardar", km.start === k("Otro") && km.conflict === null && km.value.title === "Mío");
  check("…y sigue como cambio", isEdited(metaAdapter, km));
  const same2 = reconcileDraft(metaAdapter, d, { key: k("Mío"), raw: { title: "Mío", intro: "" } });
  check("guardado = lo escrito → referencia, sin conflicto", same2.conflict === null && same2.start === k("Mío") && !isEdited(metaAdapter, same2));
  const noop = reconcileDraft(metaAdapter, d, { key: k("A"), raw: { title: "A", intro: "" } });
  check("guardado = referencia → nada cambia", noop === d);
}

// --- Texto (C2 + A2) -------------------------------------------------------------------

function view(over: Partial<CatalogTextView>): CatalogTextView {
  return {
    propertyId: "p1", slug: "s", title: "Ático", bcReference: "BC-1", inList: true, level: "facts",
    source: { hasText: true, clean: "none", story: "none" }, draft: null, published: null, candidates: [],
    ...over,
  };
}

function testText() {
  section("E2 · texto: dos nociones y revisión (C2 + A2)");
  const pub = view({ published: { body: "Publicado", lead: null, highlights: [], at: null, current: true, changed: [] }, level: "text" });
  // Sin borrador guardado, se enseña lo publicado: Guardar activo (C2), sin cambios de sesión.
  const shownPendingSave = textPendingSave({ lead: "", body: "Publicado", highlights: [] }, textKey({ lead: null, body: null, highlights: [] }));
  check("publicado sin borrador: «Guardar borrador» activo como en C2", shownPendingSave === true);
  const d0 = editTextDraft(undefined, pub, { lead: "", body: "Publicado", highlights: [] });
  check("…pero abrirlo sin tocar no es cambio de sesión", d0.start === textKey({ lead: "", body: "Publicado", highlights: [] }));

  const v1 = view({ draft: { body: "Uno", lead: null, highlights: ["Terraza"], rev: 3, origin: "manual", updatedAt: null } });
  let t = editTextDraft(undefined, v1, { lead: "", body: "Uno dos", highlights: ["Terraza"] });
  check("referencia guardada rev 3", t.saved.rev === 3 && t.saved.key === textKey({ lead: null, body: "Uno", highlights: ["Terraza"] }));
  // Guardado con retraso: se envía «Uno dos», luego se escribe «Uno dos tres».
  const sub = textKey(t.value);
  t = { ...t, pending: sub, value: { ...t.value, body: "Uno dos tres" } };
  const okT = textSaveSucceeded(t, sub, 4);
  check("éxito: rev 4, lo escrito después intacto", okT.saved.rev === 4 && okT.value.body === "Uno dos tres");
  check("…«Publicar» seguiría bloqueado (pendiente de guardar)", textPendingSave(okT.value, okT.saved.key));
  // Refresco con rev 4 y «Uno dos»: sin conflicto.
  const v4 = view({ draft: { body: "Uno dos", lead: null, highlights: ["Terraza"], rev: 4, origin: "manual", updatedAt: null } });
  check("refresco con la rev reconocida: nada cambia", reconcileTextDraft(okT, v4) === okT);
  // Otra pestaña guarda rev 5 con otro texto: conflicto (A2).
  const v5 = view({ draft: { body: "Otro", lead: null, highlights: [], rev: 5, origin: "manual", updatedAt: null } });
  const cf = reconcileTextDraft(okT, v5);
  check("rev 5 ajena → conflicto con lo guardado a la vista", cf.conflict?.raw.body === "Otro" && cf.conflictRev === 5 && cf.value.body === "Uno dos tres");
  check("…y el expectedRev sigue siendo 4 hasta decidir", cf.saved.rev === 4);
  const keep = keepMineText(cf);
  check("«Mantener los míos»: rev 5 como referencia, sin guardar", keep.saved.rev === 5 && keep.conflict === null && keep.value.body === "Uno dos tres");
  check("…y sigue pendiente de guardar", textPendingSave(keep.value, keep.saved.key));
  // Si otra pestaña guarda exactamente lo escrito: se adopta sin conflicto.
  const v6 = view({ draft: { body: "Uno dos tres", lead: null, highlights: ["Terraza"], rev: 6, origin: "manual", updatedAt: null } });
  const adopt = reconcileTextDraft(okT, v6);
  check("guardado ajeno = lo escrito → rev 6 sin conflicto", adopt.conflict === null && adopt.saved.rev === 6);
}

// --- Contenido: filtros ------------------------------------------------------------------

function testFilters() {
  section("E2 · Contenido: estados y filtros");
  const none = view({});
  const draft = view({ draft: { body: "B", lead: null, highlights: [], rev: 1, origin: "manual", updatedAt: null } });
  const stale = view({ published: { body: "P", lead: null, highlights: [], at: null, current: false, changed: ["los m²"] } });
  const pub = view({ published: { body: "P", lead: null, highlights: [], at: null, current: true, changed: [] }, draft: { body: "P", lead: null, highlights: [], rev: 1, origin: "manual", updatedAt: null } });
  const pubNewer = view({ published: { body: "P", lead: null, highlights: [], at: null, current: true, changed: [] }, draft: { body: "P2", lead: null, highlights: [], rev: 2, origin: "manual", updatedAt: null } });
  const m: CatalogMaterial = { noText: true, sections: 0, sectionsWithoutPhoto: 0, photos: 2 };
  const ctx = { material: undefined, edited: false };
  check("estado: sin texto", textStateLabel(none) === "Sin texto propio");
  check("estado: borrador", textStateLabel(draft) === "Borrador sin publicar");
  check("estado: revisar", textStateLabel(stale) === "Publicado · revisar (cambió los m²)");
  check("estado: publicado", textStateLabel(pub) === "Texto publicado");
  check("filtro revisar", matchesContentFilter("revisar", stale, ctx) && !matchesContentFilter("revisar", pub, ctx));
  check("filtro borradores: borrador y publicado con borrador distinto", matchesContentFilter("borradores", draft, ctx) && matchesContentFilter("borradores", pubNewer, ctx) && !matchesContentFilter("borradores", pub, ctx));
  check("filtro publicados", matchesContentFilter("publicados", pub, ctx) && !matchesContentFilter("publicados", stale, ctx));
  check("filtro sin texto", matchesContentFilter("sin-texto", none, ctx) && !matchesContentFilter("sin-texto", draft, ctx));
  check("filtro sin descripción usa el material", matchesContentFilter("sin-descripcion", none, { material: m, edited: false }) && !matchesContentFilter("sin-descripcion", none, ctx));
  check("filtro cambios sin guardar", matchesContentFilter("sin-guardar", none, { material: undefined, edited: true }));
  check("búsqueda sin tildes por título", matchesQuery("atico", { title: "Ático", bcReference: null }));
  check("búsqueda por referencia", matchesQuery("bc-9002", { title: "Piso", bcReference: "BC-9002" }) && !matchesQuery("bc-1", { title: "Piso", bcReference: "BC-9002" }));
}

testMaterial();
testMaterialByProperty();
testSections();
testRaw();
testPendingSave();
testConflict();
testText();
testFilters();

console.log(`\n${failures === 0 ? "✅ Todo en verde" : `❌ ${failures} fallo(s)`}`);
if (failures > 0) process.exit(1);
