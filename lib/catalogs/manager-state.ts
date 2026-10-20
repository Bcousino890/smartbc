import { normalizeCriteria, type CatalogCriteria, type CatalogOperation, type CatalogSort, type ZoneCriterion } from "./criteria";
import type { CatalogMaterial } from "./material";
import type { CatalogTextView } from "./texts";

// ============================================================================
// Estado del gestor de un catálogo (BCP-01 E2). PURO: secciones y URL, el
// modelo de los valores sin guardar y los filtros de Contenido. Lo usan el
// almacén de borradores (components/admin/catalogs/manager/drafts-store.ts) y
// las secciones; se prueba en scripts/test-catalogs-manager.mts.
//
// Valores sin guardar (plan E2 §3.4, ajustes 1 y 2):
//   · `value` es lo escrito EN BRUTO y nunca se reescribe desde aquí: la forma
//     semántica (`key`) solo decide los indicadores y la validación.
//   · `start` es la referencia guardada (forma semántica).
//   · `pending` es la instantánea enviada en un guardado en curso: la
//     respuesta solo reconoce ESA instantánea, nunca lo escrito después.
//   · `conflict` es un valor guardado nuevo que no es ni la referencia, ni lo
//     enviado, ni lo escrito: se enseña y la persona decide.
// ============================================================================

// --- Secciones y URL -------------------------------------------------------

export const SECTIONS = ["viviendas", "contenido", "diseno", "compartir"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  viviendas: "Viviendas",
  contenido: "Contenido",
  diseno: "Diseño",
  compartir: "Compartir",
};

export function parseSection(raw: string | null | undefined): Section {
  return (SECTIONS as readonly string[]).includes(raw ?? "") ? (raw as Section) : "viviendas";
}

/** Query de la URL con la sección y la vivienda abierta; conserva el resto de
 *  parámetros (medir, vivo, grande…). Devuelve «?…». */
export function managerSearch(current: string, next: { seccion: Section; vivienda?: string | null }): string {
  const p = new URLSearchParams(current.startsWith("?") ? current.slice(1) : current);
  p.set("seccion", next.seccion);
  if (next.vivienda) p.set("vivienda", next.vivienda);
  else p.delete("vivienda");
  return `?${p.toString()}`;
}

// --- Modelo de borrador ------------------------------------------------------

export interface Saved<R> {
  key: string;
  raw: R;
}

export interface Draft<R> {
  start: string;
  value: R;
  pending: string | null;
  conflict: Saved<R> | null;
}

export interface FormAdapter<R> {
  /** Forma semántica (para comparar). Nunca se usa para reescribir `value`. */
  key(raw: R): string;
  /** Entradas incompletas que no forman parte de lo guardado pero se perderían. */
  incomplete?(raw: R): boolean;
}

/** Primer cambio o cambio siguiente: solo cambia `value`. */
export function editDraft<R>(d: Draft<R> | undefined, savedKey: string, value: R): Draft<R> {
  return d ? { ...d, value } : { start: savedKey, value, pending: null, conflict: null };
}

/** Cambios sin guardar (D-QA9). */
export function isEdited<R>(a: FormAdapter<R>, d: Draft<R> | undefined): boolean {
  if (!d) return false;
  return a.key(d.value) !== d.start || !!a.incomplete?.(d.value);
}

/** Al pulsar Guardar: se captura la instantánea enviada. */
export function beginSave<R>(a: FormAdapter<R>, d: Draft<R>, submitted: R): { draft: Draft<R>; submittedKey: string } {
  const submittedKey = a.key(submitted);
  return { draft: { ...d, pending: submittedKey }, submittedKey };
}

/** Respuesta correcta: reconoce SOLO la instantánea enviada. `value` no se toca. */
export function saveSucceeded<D extends Draft<unknown>>(d: D, submittedKey: string): D {
  return { ...d, start: submittedKey, pending: d.pending === submittedKey ? null : d.pending, conflict: d.conflict?.key === submittedKey ? null : d.conflict };
}

/** Respuesta con error: lo escrito y la referencia se quedan como estaban. */
export function saveFailed<D extends Draft<unknown>>(d: D, submittedKey: string): D {
  return { ...d, pending: d.pending === submittedKey ? null : d.pending };
}

/** Llega un valor guardado nuevo (refresco). `value` nunca cambia. */
export function reconcileDraft<R>(a: FormAdapter<R>, d: Draft<R>, saved: Saved<R>): Draft<R> {
  if (saved.key === d.start) return d.conflict ? { ...d, conflict: null } : d;
  if (d.pending !== null && saved.key === d.pending) return { ...d, start: saved.key, conflict: null };
  if (saved.key === a.key(d.value)) return { ...d, start: saved.key, conflict: null };
  return d.conflict?.key === saved.key ? d : { ...d, conflict: saved };
}

/** «Mantener los míos»: lo guardado nuevo pasa a ser la referencia; no guarda. */
export function keepMine<R>(d: Draft<R>): Draft<R> {
  return d.conflict ? { ...d, start: d.conflict.key, conflict: null } : d;
}

// --- Formularios -------------------------------------------------------------

/** Criterios tal como se escriben (precios y máximo como texto). */
export interface CriteriaRaw {
  operation: CatalogOperation;
  zones: ZoneCriterion[];
  sort: CatalogSort;
  max: string;
  pmin: string;
  pmax: string;
  /** Selecciones a medio hacer (sin «Añadir»). */
  district: string;
  barrioDistrict: string;
  barrio: string;
  freeName: string;
}

export function criteriaRawOf(c: CatalogCriteria): CriteriaRaw {
  return {
    operation: c.operation,
    zones: c.zones,
    sort: c.sort,
    max: String(c.max),
    pmin: c.price_min === null ? "" : String(c.price_min),
    pmax: c.price_max === null ? "" : String(c.price_max),
    district: "",
    barrioDistrict: "",
    barrio: "",
    freeName: "",
  };
}

/** Criterios del formulario validados con las mismas reglas que SQL. */
export function criteriaFromRaw(raw: CriteriaRaw): CatalogCriteria | null {
  const priceOff = raw.operation === "any";
  const n = normalizeCriteria({
    operation: raw.operation,
    zones: raw.zones,
    sort: raw.sort,
    // K5: el texto tal cual; normalizeCriteria decide (vacío o «12.0» no valen).
    max: raw.max.trim() === "" ? NaN : raw.max,
    price_min: priceOff ? null : raw.pmin.trim() || null,
    price_max: priceOff ? null : raw.pmax.trim() || null,
  });
  return n.ok ? n.criteria : null;
}

export function criteriaKey(c: CatalogCriteria): string {
  return JSON.stringify([c.operation, c.zones.map((z) => [z.kind, z.name]), c.price_min, c.price_max, c.sort, c.max]);
}

export const criteriaAdapter: FormAdapter<CriteriaRaw> = {
  key(raw) {
    const c = criteriaFromRaw(raw);
    if (c) return criteriaKey(c);
    return `invalid:${JSON.stringify([raw.operation, raw.zones, raw.sort, raw.max, raw.pmin, raw.pmax])}`;
  },
  incomplete(raw) {
    return !!(raw.district || raw.barrio || raw.barrioDistrict || raw.freeName.trim());
  },
};

export interface MetaRaw {
  title: string;
  intro: string;
}

export function metaKey(title: string, intro: string | null): string {
  return JSON.stringify([title.trim(), (intro ?? "").trim()]);
}

export const metaAdapter: FormAdapter<MetaRaw> = { key: (r) => metaKey(r.title, r.intro) };

/** Portada: la vivienda elegida en el selector (sin confirmar). "" = ninguna. */
export interface CoverRaw {
  propertyId: string;
}

export const coverAdapter: FormAdapter<CoverRaw> = { key: (r) => r.propertyId };

export interface ContactRaw {
  name: string;
  phone: string;
  role: "asesor" | "asesora";
}

/** Forma comparable de un teléfono (solo para indicadores; la validación real
 *  es del servidor): sin espacios ni signos, «00» → «+», móvil español → +34. */
export function phoneKey(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/[\s.\-()]/g, "");
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (/^[6789]\d{8}$/.test(d)) d = `+34${d}`;
  return d;
}

export function contactKey(name: string | null, phone: string | null, role: string): string {
  return JSON.stringify([(name ?? "").trim(), phoneKey(phone), role]);
}

export const contactAdapter: FormAdapter<ContactRaw> = { key: (r) => contactKey(r.name, r.phone, r.role) };

/** Copia del catálogo para una vivienda: título propio (vacío = el de la
 *  ficha), descripción y, plegadas, entrada y puntos (DC5–DC7). */
export interface TextRaw {
  title: string;
  lead: string;
  body: string;
  highlights: string[];
}

/** Título normalizado como lo guarda el SQL (espacios seguidos → uno). */
export function normTitle(t: string | null | undefined): string {
  return (t ?? "").replace(/\s+/g, " ").trim();
}

export function textKey(t: { title?: string | null; lead: string | null; body: string | null; highlights: string[] }): string {
  return JSON.stringify([(t.lead ?? "").trim(), (t.body ?? "").trim(), [...t.highlights].sort(), normTitle(t.title)]);
}

export const textAdapter: FormAdapter<TextRaw> = { key: (r) => textKey(r) };

/** Borrador de texto: además de la referencia mostrada (`start`), el último
 *  borrador GUARDADO con su revisión, que decide «Guardar borrador»,
 *  «Publicar» y el expectedRev (C2). */
export interface TextDraft extends Draft<TextRaw> {
  saved: { key: string; rev: number | null };
  /** Revisión del valor en conflicto (A2). */
  conflictRev: number | null;
}

export function savedTextOf(view: CatalogTextView): { raw: TextRaw; key: string; rev: number | null } {
  const d = view.draft;
  const raw = { title: d?.title ?? "", lead: d?.lead ?? "", body: d?.body ?? "", highlights: d?.highlights ?? [] };
  return { raw, key: textKey(raw), rev: d ? d.rev : null };
}

/** Lo que enseña el editor sin borrador (C2: el borrador guardado o, si no
 *  hay, lo publicado). */
export function shownTextOf(view: CatalogTextView): TextRaw {
  const d = view.draft;
  const p = view.published;
  if (d) return { title: d.title ?? "", lead: d.lead ?? "", body: d.body ?? "", highlights: d.highlights ?? [] };
  return { title: p?.title ?? "", lead: p?.lead ?? "", body: p?.body ?? "", highlights: p?.highlights ?? [] };
}

export function editTextDraft(d: TextDraft | undefined, view: CatalogTextView, value: TextRaw): TextDraft {
  if (d) return { ...d, value };
  const s = savedTextOf(view);
  return { start: textKey(shownTextOf(view)), value, pending: null, conflict: null, saved: { key: s.key, rev: s.rev }, conflictRev: null };
}

/** Guardado del texto con éxito: reconoce la instantánea y su revisión nueva. */
export function textSaveSucceeded(d: TextDraft, submittedKey: string, rev: number): TextDraft {
  return { ...saveSucceeded(d, submittedKey), saved: { key: submittedKey, rev }, conflictRev: null };
}

/** Refresco del texto: manda la revisión guardada. */
export function reconcileTextDraft(d: TextDraft, view: CatalogTextView): TextDraft {
  const s = savedTextOf(view);
  if (s.rev === d.saved.rev) return d;
  if ((d.pending !== null && s.key === d.pending) || s.key === textKey(d.value)) {
    return { ...d, start: s.key, saved: { key: s.key, rev: s.rev }, conflict: null, conflictRev: null };
  }
  return { ...d, conflict: { key: s.key, raw: s.raw }, conflictRev: s.rev };
}

/** A2 · «Mantener los míos»: la revisión nueva pasa a ser la referencia. No guarda. */
export function keepMineText(d: TextDraft): TextDraft {
  if (!d.conflict) return d;
  return { ...d, start: d.conflict.key, saved: { key: d.conflict.key, rev: d.conflictRev }, conflict: null, conflictRev: null };
}

/** «Pendiente de guardar» de C2: lo escrito ≠ el último borrador guardado. */
export function textPendingSave(value: TextRaw, savedKey: string): boolean {
  return textKey(value) !== savedKey;
}

// --- Contenido: estados y filtros ---------------------------------------------

export type ContentFilter = "todas" | "revisar" | "borradores" | "publicados" | "sin-texto" | "sin-descripcion" | "sin-guardar";

export const CONTENT_FILTERS: Array<{ id: ContentFilter; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "revisar", label: "Por revisar" },
  { id: "borradores", label: "Borradores" },
  { id: "publicados", label: "Publicados" },
  { id: "sin-texto", label: "Sin texto propio" },
  { id: "sin-descripcion", label: "Sin descripción" },
  { id: "sin-guardar", label: "Cambios sin guardar" },
];

const hasDraftContent = (v: CatalogTextView) => !!(v.draft && (v.draft.body || v.draft.lead || v.draft.title));

/** Estado del texto (los mismos textos que la fila de C2, con el título). */
export function textStateLabel(v: CatalogTextView): string {
  if (v.published) {
    const onlyTitle = !v.published.body && !v.published.lead;
    if (!v.published.current) return `Publicado · revisar (cambió ${v.published.changed.join(", ") || "la ficha"})`;
    return onlyTitle ? "Título publicado" : v.published.title ? "Título y texto publicados" : "Texto publicado";
  }
  return hasDraftContent(v) ? "Borrador sin publicar" : "Sin texto propio";
}

export function matchesContentFilter(
  f: ContentFilter,
  v: CatalogTextView,
  ctx: { material: CatalogMaterial | undefined; edited: boolean },
): boolean {
  switch (f) {
    case "todas":
      return true;
    case "revisar":
      return !!v.published && !v.published.current;
    case "borradores":
      return hasDraftContent(v) && (!v.published || textKey({ ...v.draft!, highlights: v.draft!.highlights }) !== textKey(v.published));
    case "publicados":
      return !!v.published && v.published.current;
    case "sin-texto":
      return !v.published && !hasDraftContent(v);
    case "sin-descripcion":
      return !!ctx.material?.noText;
    case "sin-guardar":
      return ctx.edited;
  }
}

/** Búsqueda de Contenido y Viviendas: título o referencia, sin tildes. */
export function matchesQuery(q: string, v: { title: string; bcReference: string | null }): boolean {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const t = fold(q.trim());
  if (!t) return true;
  return fold(`${v.bcReference ?? ""} ${v.title}`).includes(t);
}

// ── Vista previa de los criterios («Ver qué entraría») ───────────────────────
// Corrección tras la QA de K1–K5 (plan-vista-previa.md). Una vista previa solo
// se enseña mientras el borrador sea EXACTAMENTE el que la pidió:
//   · cada cambio del borrador sube su revisión (también A→B→A: volver a los
//     mismos valores es otra revisión, y no revive una vista previa invalidada);
//   · cada petición lleva un número; solo cuenta la última pedida, y solo si el
//     borrador no ha cambiado mientras tanto;
//   · el resumen es el de los criterios con los que se pidió, no el de ahora.
// No guarda nada ni toca el borrador: solo decide qué se enseña.

export interface DraftRevision {
  key: string;
  rev: number;
}

/** Revisión del borrador: sube con cada cambio de contenido (no con un
 *  objeto nuevo con lo mismo). `key` es el contenido serializado. */
export function nextDraftRevision(prev: DraftRevision | null, key: string): DraftRevision {
  if (!prev) return { key, rev: 0 };
  return prev.key === key ? prev : { key, rev: prev.rev + 1 };
}

export interface PreviewSlot<T> {
  /** Número de la última petición. */
  lastSeq: number;
  pending: { seq: number; rev: number; summary: string } | null;
  result: { seq: number; rev: number; summary: string; data: T } | null;
}

export function emptyPreview<T>(): PreviewSlot<T> {
  return { lastSeq: 0, pending: null, result: null };
}

/** Se pide una vista previa con el borrador de revisión `rev`. */
export function previewStart<T>(s: PreviewSlot<T>, rev: number, summary: string): { slot: PreviewSlot<T>; seq: number } {
  const seq = s.lastSeq + 1;
  return { slot: { ...s, lastSeq: seq, pending: { seq, rev, summary } }, seq };
}

/** Llega la respuesta de la petición `seq` con el borrador en `currentRev`.
 *  Se acepta solo si es la última pedida y el borrador no ha cambiado. Una
 *  respuesta descartada no toca nada (ni enseña su error). */
export function previewSettle<T>(
  s: PreviewSlot<T>,
  seq: number,
  currentRev: number,
  outcome: { ok: true; data: T } | { ok: false; error: string },
): { slot: PreviewSlot<T>; accepted: boolean; error: string | null } {
  const p = s.pending;
  if (!p || p.seq !== seq || seq !== s.lastSeq || p.rev !== currentRev) {
    // Respuesta vieja o de un borrador que ya cambió: no se enseña ni cambia
    // nada (la nota «los criterios han cambiado» sigue mientras no se pida otra).
    return { slot: s, accepted: false, error: null };
  }
  if (!outcome.ok) return { slot: { ...s, pending: null, result: null }, accepted: true, error: outcome.error };
  return { slot: { ...s, pending: null, result: { seq, rev: p.rev, summary: p.summary, data: outcome.data } }, accepted: true, error: null };
}

/** Los criterios escritos no son válidos: fuera la vista previa y cualquier
 *  petición en curso (se ignorará si llega). */
export function previewInvalid<T>(s: PreviewSlot<T>): PreviewSlot<T> {
  return { lastSeq: s.lastSeq + 1, pending: null, result: null };
}

export type PreviewView<T> =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "changed" }
  | { kind: "result"; data: T; summary: string };

/** Qué se enseña con el borrador en la revisión `rev`. */
export function previewView<T>(s: PreviewSlot<T>, rev: number): PreviewView<T> {
  if (s.pending && s.pending.rev === rev) return { kind: "loading" };
  if (s.result && s.result.rev === rev) return { kind: "result", data: s.result.data, summary: s.result.summary };
  if (s.result || s.pending) return { kind: "changed" };
  return { kind: "none" };
}
