import { esUnitOfItem, type InternalItem, type InternalSnapshot } from "./to-public";
import { catalogDictionary, type CatalogLanguage } from "./i18n";
import { SECTION_HEADINGS } from "./structure";
import {
  checkTranslation,
  headingFor,
  ITEM_STATE_LABEL,
  isTargetLanguage,
  languageProgress,
  metaSig,
  pendingTranslationWarnings,
  RESERVATION_TTL_SECONDS,
  runPreparation,
  TARGET_LANGUAGES,
  type CheckPair,
  type EsUnit,
  type FinishResult,
  type ItemTrState,
  type LanguageProgress,
  type PrepareNeeds,
  type PrepareOutcome,
  type ReserveResult,
  type TargetLanguage,
  type TranslationCheck,
  type TranslationRequest,
  type TranslationResult,
  type TrAiFn,
  type UnitBlock,
} from "./translations";

// ============================================================================
// Traducciones del catálogo en la GESTIÓN (PR6). Orquestación PURA sobre un
// «backend» inyectado: en la app, las funciones SQL de 0226 (translation-
// data.ts); en las pruebas y los fixtures, el almacén en memoria con las
// MISMAS reglas (translation-memory.ts). La IA también llega inyectada y solo
// se usa en `prepareItem` (al pulsar «Preparar»). Ninguna lectura pública pasa
// por aquí.
// ============================================================================

export type SourceKind = "library" | "catalog" | "area" | "meta";

export interface EsStateRow {
  /** Vivienda (en los fixtures, la clave pública). */
  p: string;
  /** Clave pública de la vivienda en el catálogo. */
  k: string;
  /** Versión de la plantilla «Vivir en…» de su copia en este catálogo. */
  av: string | null;
  /** Versión de la biblioteca de la que es copia exacta su texto publicado
   *  en este catálogo (solo entonces se reutilizan sus traducciones). */
  cv?: string | null;
}

export interface EsState {
  version: number;
  defaultLang: CatalogLanguage;
  snapshot: InternalSnapshot;
  map: EsStateRow[];
}

export interface SourceRow {
  id: string;
  kind: SourceKind;
  propertyId: string | null;
  copyVersionId: string | null;
  catalogId: string | null;
  areaVersionId: string | null;
  esSig: string;
  es: { t?: string | null; i?: string | null; b?: UnitBlock[] };
}

export interface TextRow {
  id: string;
  sourceId: string;
  lang: TargetLanguage;
  status: "draft" | "approved" | "rejected";
  content: { t?: string | null; i?: string | null; b?: Array<{ k: string; x: string }> };
  rev: number;
  origin: "ai" | "manual";
  updatedAt: string | null;
}

export interface FeatureRow {
  es: string;
  lang: TargetLanguage;
  tr: string;
  status: "draft" | "approved" | "rejected";
}

export interface JobRow {
  id: string;
  sourceId: string;
  lang: TargetLanguage;
  status: "reserved" | "done" | "cancelled" | "expired" | "uncertain" | "failed";
  reservedAt: string;
  expiresAt: string;
  finishedAt: string | null;
  discardedAt: string | null;
  note: string | null;
}

export interface CopyRow {
  propertyId: string;
  lang: TargetLanguage;
  esSig: string;
  features: Array<[string, string]>;
}

export interface MetaCopyRow {
  lang: TargetLanguage;
  esSig: string;
  title: string;
  intro: string | null;
}

export interface LinkRow {
  id: string;
  clientName: string;
  lang: CatalogLanguage | null;
  state: "active" | "expired" | "revoked";
}

export interface ApproveParts {
  text: { id: string; rev: number };
  area: { id: string; rev: number } | null;
  features: Array<{ es: string; tr: string }>;
  list: string[];
}

export interface ActivationRequired {
  meta: string;
  items: Array<{ p: string; s: string; f: string[] }>;
}

/** Lo que la gestión necesita de la base de datos (o del almacén en memoria).
 *  Los errores se lanzan como Error(código), igual que las funciones SQL. */
export interface TrBackend {
  esState(catalogId: string): Promise<EsState>;
  links(catalogId: string): Promise<LinkRow[]>;
  copies(catalogId: string): Promise<{ items: CopyRow[]; meta: MetaCopyRow[] }>;
  work(catalogId: string, lang: TargetLanguage, q: { propertyIds: string[]; areaVersionIds: string[]; features: string[] }): Promise<{
    sources: SourceRow[];
    texts: TextRow[];
    features: FeatureRow[];
    jobs: JobRow[];
  }>;
  ensureSource(catalogId: string, propertyId: string | null, sig: string, es: object): Promise<{ id: string; kind: SourceKind }>;
  ensureAreaSource(areaVersionId: string, sig: string, es: object): Promise<string>;
  reserve(i: { sourceId: string; lang: TargetLanguage; catalogId: string; propertyId: string | null; needs: PrepareNeeds; ttlSeconds: number; retry: boolean }): Promise<ReserveResult>;
  finish(i: { jobId: string; outcome: "done" | "failed" | "uncertain"; result: TranslationResult | null; note: string | null }): Promise<FinishResult>;
  cancel(jobId: string): Promise<boolean>;
  saveText(textId: string, rev: number, content: object): Promise<number>;
  saveFeature(lang: TargetLanguage, es: string, tr: string): Promise<void>;
  reject(textId: string): Promise<boolean>;
  approve(catalogId: string, propertyId: string | null, lang: TargetLanguage, sig: string, parts: ApproveParts): Promise<number>;
  copySet(catalogId: string, propertyId: string | null, lang: TargetLanguage, sig: string, textId: string, areaTextId: string | null, features: string[]): Promise<number>;
  copyRemove(catalogId: string, propertyId: string | null, lang: TargetLanguage): Promise<number>;
  activate(catalogId: string, linkId: string | null, lang: CatalogLanguage | null, expectedVersion: number, required: ActivationRequired): Promise<number>;
}

// ── Lo que se ve hoy en español ─────────────────────────────────────────────

export const META_KEY = "__catalogo__";

interface EsItem {
  key: string;
  propertyId: string;
  areaVersionId: string | null;
  libraryVersionId: string | null;
  unit: EsUnit;
  names: string[];
}

const STREET_NAME_RE = /\b(?:calle|c\/|paseo|avenida|avda\.?|plaza|glorieta|ronda|traves[ií]a)\s+(?:(?:de|del|la|las|los|el)\s+){0,2}([A-ZÁÉÍÓÚÑ][\wáéíóúüñ'-]+(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][\wáéíóúüñ'-]+){0,3})/g;

/** Nombres propios que la traducción tiene que conservar tal cual. */
export function namesOf(it: Pick<InternalItem, "zone" | "subzone">, unit: Pick<EsUnit, "areaName" | "title" | "blocks">): string[] {
  const out = new Set<string>();
  for (const n of [unit.areaName, it.subzone, it.zone]) if (typeof n === "string" && n.trim()) out.add(n.trim());
  for (const text of [unit.title, ...unit.blocks.map((b) => b.x)]) {
    for (const m of text.matchAll(STREET_NAME_RE)) out.add(m[1].trim());
  }
  return [...out].filter((n) => n.length >= 3);
}

export function esItemsOf(es: EsState): EsItem[] {
  const byKey = new Map(es.map.map((m) => [m.k, m]));
  const out: EsItem[] = [];
  for (const it of es.snapshot.items ?? []) {
    if (!it || it.status === "sold" || it.status === "archived") continue;
    const m = byKey.get(String(it.key));
    if (!m) continue;
    let unit = esUnitOfItem(it);
    // Una copia de plantilla sin versión (borrada) se traduce con el texto propio.
    if (unit.areaText && !m.av) unit = { ...unit, ownBlocks: unit.blocks, ownSig: unit.sig, areaText: null, areaSig: null };
    out.push({ key: String(it.key), propertyId: m.p, areaVersionId: unit.areaText ? m.av : null, libraryVersionId: m.cv ?? null, unit, names: namesOf(it, unit) });
  }
  return out;
}

export function esMetaOf(es: EsState): { title: string; intro: string | null; sig: string } {
  const title = String(es.snapshot.title ?? "").trim();
  const intro = typeof es.snapshot.intro === "string" && es.snapshot.intro.trim() ? es.snapshot.intro.trim() : null;
  return { title, intro, sig: metaSig(title, intro) };
}

// ── Estado del panel «Idiomas» ──────────────────────────────────────────────

export interface PanelBlock {
  key: string;
  /** Título del bloque en español y en el idioma (del diccionario). */
  headingEs: string | null;
  headingTr: string | null;
  es: string;
  tr: string | null;
  /** Es la plantilla «Vivir en…» (se traduce y aprueba aparte, DA27). */
  area: boolean;
}

export interface PanelItem {
  key: string;
  propertyId: string | null;
  kind: "item" | "meta";
  /** Título en español de lo que se ve hoy. */
  title: string;
  level: string;
  state: ItemTrState;
  stateLabel: string;
  /** La copia de este catálogo es la vigente. */
  current: boolean;
  /** Hay copia, pero de un español anterior (el cliente ve N5). */
  outdated: boolean;
  /** La fuente es una versión aprobada de la biblioteca (se reutiliza). */
  library: boolean;
  sig: string;
  es: { title: string; intro: string | null; blocks: PanelBlock[]; features: string[] };
  text: { id: string; rev: number; status: TextRow["status"]; title: string | null; intro: string | null; origin: TextRow["origin"] } | null;
  area: { id: string; rev: number; status: TextRow["status"] } | null;
  features: Array<{ es: string; tr: string | null; status: FeatureRow["status"] | null }>;
  featuresMissing: number;
  job: { id: string; status: JobRow["status"]; expiresAt: string; note: string | null; discarded: boolean; active: boolean } | null;
  check: TranslationCheck | null;
  names: string[];
}

export interface PanelState {
  catalogId: string;
  version: number;
  defaultLang: CatalogLanguage;
  lang: TargetLanguage;
  links: LinkRow[];
  progress: LanguageProgress[];
  /** Idiomas que algún enlace usa ahora (el del catálogo y los personales). */
  active: CatalogLanguage[];
  items: PanelItem[];
}

function latest<T extends { reservedAt: string }>(rows: T[]): T | null {
  return rows.reduce<T | null>((a, b) => (!a || b.reservedAt > a.reservedAt ? b : a), null);
}

function checkFor(item: { unit?: EsUnit; meta?: { title: string; intro: string | null } }, text: TextRow | null, areaText: TextRow | null, feats: FeatureRow[], names: string[]): TranslationCheck | null {
  const pairs: CheckPair[] = [];
  if (item.meta) {
    if (!text) return null;
    pairs.push({ where: "title", label: "Título del catálogo", es: item.meta.title, tr: text.content.t ?? "" });
    if (item.meta.intro) pairs.push({ where: "intro", label: "Introducción", es: item.meta.intro, tr: text.content.i ?? "" });
    return checkTranslation(pairs, names);
  }
  const unit = item.unit!;
  if (text) {
    pairs.push({ where: "title", label: "Título", es: unit.title, tr: text.content.t ?? "" });
    unit.ownBlocks.forEach((b, i) => pairs.push({ where: `block:${i}`, label: b.k === "intro" ? "Introducción" : SECTION_HEADINGS[b.k], es: b.x, tr: text.content.b?.[i]?.x ?? "" }));
  }
  if (areaText && unit.areaText && areaText.status !== "approved") pairs.push({ where: "area", label: "Plantilla «Vivir en…»", es: unit.areaText, tr: areaText.content.b?.[0]?.x ?? "" });
  for (const f of feats) if (f.status === "draft") pairs.push({ where: `feature:${f.es}`, label: `Característica «${f.es}»`, es: f.es, tr: f.tr });
  return pairs.length ? checkTranslation(pairs, names) : null;
}

export async function loadPanel(be: TrBackend, catalogId: string, lang: TargetLanguage, now = Date.now()): Promise<PanelState> {
  const es = await be.esState(catalogId);
  const items = esItemsOf(es);
  const meta = esMetaOf(es);
  const [links, copies] = await Promise.all([be.links(catalogId), be.copies(catalogId)]);
  const allFeatures = [...new Set(items.flatMap((x) => x.unit.features))];
  const work = await be.work(catalogId, lang, {
    propertyIds: items.map((x) => x.propertyId),
    areaVersionIds: items.map((x) => x.areaVersionId).filter((x): x is string => !!x),
    features: allFeatures,
  });

  // Progreso de los siete idiomas (solo copias: sin IA ni trabajos).
  const progress = TARGET_LANGUAGES.map((l) => {
    let featuresMissing = 0;
    const states = items.map((x) => {
      const c = copies.items.find((r) => r.propertyId === x.propertyId && r.lang === l);
      if (!c || c.esSig !== x.unit.sig) return "none" as ItemTrState;
      const have = new Set(c.features.map((p) => p[0]));
      featuresMissing += x.unit.features.filter((f) => !have.has(f)).length;
      return "current" as ItemTrState;
    });
    const metaCurrent = copies.meta.some((m) => m.lang === l && m.esSig === meta.sig);
    return languageProgress(l, states, featuresMissing, metaCurrent);
  });

  const dict = catalogDictionary(lang);
  const jobFor = (sourceId: string | null) => {
    const j = sourceId ? latest(work.jobs.filter((x) => x.sourceId === sourceId && x.lang === lang)) : null;
    if (!j) return null;
    const active = j.status === "reserved" && new Date(j.expiresAt).getTime() > now;
    return { id: j.id, status: j.status, expiresAt: j.expiresAt, note: j.note, discarded: !!j.discardedAt, active };
  };
  const stateOf = (o: { current: boolean; job: PanelItem["job"]; text: TextRow | null; needArea: boolean; area: TextRow | null; feats: FeatureRow[]; outdated: boolean }): ItemTrState => {
    if (o.job?.active) return "busy";
    const drafts = o.text?.status === "draft" || (o.needArea && o.area?.status === "draft") || o.feats.some((f) => f.status === "draft");
    if (drafts) return "review";
    // Vigente: las características que falten se ven en `featuresMissing`.
    if (o.current) return "current";
    if (o.text?.status === "approved" && (!o.needArea || o.area?.status === "approved")) return "ready";
    if (o.job?.status === "uncertain") return "uncertain";
    if (o.job?.status === "failed") return "failed";
    if (o.outdated) return "outdated";
    if (o.text?.status === "rejected") return "rejected";
    return "none";
  };

  const panelItems: PanelItem[] = [];
  // El título y la introducción del catálogo.
  {
    const src = work.sources.find((s) => s.kind === "meta" && s.catalogId === catalogId && s.esSig === meta.sig) ?? null;
    const text = src ? work.texts.find((t) => t.sourceId === src.id && t.lang === lang) ?? null : null;
    const copy = copies.meta.find((m) => m.lang === lang) ?? null;
    const current = !!copy && copy.esSig === meta.sig;
    const job = jobFor(src?.id ?? null);
    const state = stateOf({ current, job, text, needArea: false, area: null, feats: [], outdated: !!copy && !current });
    panelItems.push({
      key: META_KEY,
      propertyId: null,
      kind: "meta",
      title: meta.title,
      level: "catálogo",
      state,
      stateLabel: ITEM_STATE_LABEL[state],
      current,
      outdated: !!copy && !current,
      library: false,
      sig: meta.sig,
      es: { title: meta.title, intro: meta.intro, blocks: [], features: [] },
      text: text ? { id: text.id, rev: text.rev, status: text.status, title: text.content.t ?? null, intro: text.content.i ?? null, origin: text.origin } : null,
      area: null,
      features: [],
      featuresMissing: 0,
      job,
      check: text && text.status !== "rejected" ? checkFor({ meta }, text, null, [], []) : null,
      names: [],
    });
  }
  for (const x of items) {
    const candidates = work.sources.filter(
      (s) =>
        s.propertyId === x.propertyId &&
        s.esSig === x.unit.ownSig &&
        ((s.kind === "library" && !!x.libraryVersionId && s.copyVersionId === x.libraryVersionId) || (s.kind === "catalog" && s.catalogId === catalogId)),
    );
    const withText = candidates.find((s) => work.texts.some((t) => t.sourceId === s.id && t.lang === lang && t.status !== "rejected"));
    const src = withText ?? candidates.find((s) => s.kind === "library") ?? candidates[0] ?? null;
    const text = src ? work.texts.find((t) => t.sourceId === src.id && t.lang === lang) ?? null : null;
    const areaSrc = x.unit.areaText && x.areaVersionId
      ? work.sources.find((s) => s.kind === "area" && s.areaVersionId === x.areaVersionId && s.esSig === x.unit.areaSig) ?? null
      : null;
    const area = areaSrc ? work.texts.find((t) => t.sourceId === areaSrc.id && t.lang === lang) ?? null : null;
    const feats = x.unit.features.map((f) => work.features.find((r) => r.es === f && r.lang === lang) ?? null);
    const copy = copies.items.find((c) => c.propertyId === x.propertyId && c.lang === lang) ?? null;
    const current = !!copy && copy.esSig === x.unit.sig;
    const inCopy = new Set((copy?.features ?? []).map((p) => p[0]));
    const featuresMissing = x.unit.features.filter((f) => !current || !inCopy.has(f)).length;
    const job = jobFor(src?.id ?? null);
    const state = stateOf({
      current,
      job,
      text,
      needArea: !!x.unit.areaText,
      area,
      feats: feats.filter((f): f is FeatureRow => !!f),
      outdated: !!copy && !current,
    });
    // Bloques: los propios (con su traducción) y, si entra, la plantilla.
    const blocks: PanelBlock[] = x.unit.ownBlocks.map((b, i) => ({
      key: b.k,
      headingEs: b.k === "intro" ? null : b.k === "barrio" && x.unit.areaName ? `Vivir en ${x.unit.areaName}` : SECTION_HEADINGS[b.k as keyof typeof SECTION_HEADINGS] ?? null,
      headingTr: headingFor(b.k, dict, x.unit.areaName),
      es: b.x,
      tr: text?.content.b?.[i]?.x ?? null,
      area: false,
    }));
    if (x.unit.areaText) {
      blocks.push({
        key: "barrio",
        headingEs: x.unit.areaName ? `Vivir en ${x.unit.areaName}` : SECTION_HEADINGS.barrio,
        headingTr: headingFor("barrio", dict, x.unit.areaName),
        es: x.unit.areaText,
        tr: area?.content.b?.[0]?.x ?? null,
        area: true,
      });
    }
    panelItems.push({
      key: x.key,
      propertyId: x.propertyId,
      kind: "item",
      title: x.unit.title,
      level: x.unit.level,
      state,
      stateLabel: ITEM_STATE_LABEL[state],
      current,
      outdated: !!copy && !current,
      library: src?.kind === "library",
      sig: x.unit.sig,
      es: { title: x.unit.title, intro: null, blocks, features: x.unit.features },
      text: text ? { id: text.id, rev: text.rev, status: text.status, title: text.content.t ?? null, intro: null, origin: text.origin } : null,
      area: area ? { id: area.id, rev: area.rev, status: area.status } : null,
      features: x.unit.features.map((f, i) => ({ es: f, tr: feats[i]?.tr ?? null, status: feats[i]?.status ?? null })),
      featuresMissing,
      job,
      check: text?.status === "rejected" ? null : checkFor({ unit: x.unit }, text, area, feats.filter((f): f is FeatureRow => !!f), x.names),
      names: x.names,
    });
  }
  const active = [...new Set<CatalogLanguage>([es.defaultLang, ...links.filter((l) => l.state === "active").map((l) => l.lang ?? es.defaultLang)])];
  return { catalogId, version: es.version, defaultLang: es.defaultLang, lang, links, progress, active, items: panelItems };
}

// ── Preparar (solo al pulsar) ───────────────────────────────────────────────

export interface PrepareDeps {
  ai: TrAiFn;
  timeoutMs?: number;
  isNotConfigured?: (e: unknown) => boolean;
  ttlSeconds?: number;
}

export async function prepareItem(
  be: TrBackend,
  deps: PrepareDeps,
  input: { catalogId: string; key: string; lang: TargetLanguage; retry?: boolean },
): Promise<PrepareOutcome> {
  if (!isTargetLanguage(input.lang)) throw new Error("invalid_lang");
  const es = await be.esState(input.catalogId);
  let sourceId: string;
  let request: TranslationRequest;
  let needs: PrepareNeeds;
  let propertyId: string | null = null;
  if (input.key === META_KEY) {
    const meta = esMetaOf(es);
    sourceId = (await be.ensureSource(input.catalogId, null, meta.sig, { t: meta.title, i: meta.intro })).id;
    request = { lang: input.lang, text: null, area: null, features: [], meta: { t: meta.title, i: meta.intro }, names: [] };
    needs = { text: false, area: null, features: [], meta: true };
  } else {
    const x = esItemsOf(es).find((i) => i.key === input.key);
    if (!x) throw new Error("not_in_catalog");
    propertyId = x.propertyId;
    sourceId = (await be.ensureSource(input.catalogId, x.propertyId, x.unit.ownSig, { t: x.unit.title, b: x.unit.ownBlocks })).id;
    const areaSource = x.unit.areaText && x.areaVersionId
      ? await be.ensureAreaSource(x.areaVersionId, x.unit.areaSig!, { b: [{ k: "barrio", x: x.unit.areaText }] })
      : null;
    request = { lang: input.lang, text: { t: x.unit.title, b: x.unit.ownBlocks }, area: x.unit.areaText, features: x.unit.features, meta: null, names: x.names };
    needs = { text: true, area: areaSource, features: x.unit.features, meta: false };
  }
  const ttl = deps.ttlSeconds ?? RESERVATION_TTL_SECONDS;
  return runPreparation(
    {
      store: {
        reserve: (i) => be.reserve({ sourceId: i.sourceId, lang: i.lang, catalogId: input.catalogId, propertyId, needs: i.needs, ttlSeconds: ttl, retry: i.retry }),
        finish: (i) => be.finish(i),
      },
      ai: deps.ai,
      timeoutMs: deps.timeoutMs,
      isNotConfigured: deps.isNotConfigured,
    },
    { sourceId, request, needs, retry: input.retry === true },
  );
}

/** Mensaje del gestor para cada resultado (DA36: dice cuándo pudo cobrarse). */
export function prepareMessage(o: PrepareOutcome): { kind: "ok" | "info" | "error"; text: string } {
  switch (o.kind) {
    case "saved":
      return { kind: "ok", text: "Traducción preparada. Revísala y apruébala antes de que la vea ningún cliente." };
    case "ready":
      return { kind: "info", text: "No faltaba nada que traducir: ya hay una traducción preparada o aprobada (no se ha llamado a la IA)." };
    case "busy":
      return { kind: "info", text: "Ya hay una preparación en curso para este texto e idioma. No se ha lanzado otra; espera a que termine." };
    case "uncertain_pending":
      return { kind: "error", text: "La preparación anterior quedó con resultado incierto (pudo cobrarse). No se reintenta sola: usa «Volver a preparar» si quieres lanzarla otra vez." };
    case "discarded":
      return { kind: "info", text: o.reason === "cancelled" ? "Llegó la respuesta de una preparación cancelada: se ha descartado y queda registrada (esa llamada pudo cobrarse)." : "Llegó una respuesta cuando su reserva ya había caducado: se ha descartado y queda registrada (esa llamada pudo cobrarse)." };
    case "failed":
      return o.reason === "not_configured"
        ? { kind: "error", text: "La IA no está configurada (Configuración → IA). No se ha hecho ninguna llamada." }
        : o.reason === "invalid"
          ? { kind: "error", text: "La IA respondió, pero la traducción no respetaba los bloques del original y se ha descartado. Esa llamada sí se hizo (pudo cobrarse). Puedes volver a prepararla." }
          : { kind: "error", text: "El proveedor de IA respondió con un error. Puedes volver a intentarlo." };
    case "uncertain":
      return { kind: "error", text: "Resultado incierto: se agotó el tiempo o se cortó la conexión después de enviar. La llamada pudo cobrarse. No se reintenta sola; revisa y, si quieres, vuelve a prepararla." };
  }
}

// ── Revisar, aprobar, usar sin IA ───────────────────────────────────────────

export interface ReviewEdit {
  key: string;
  lang: TargetLanguage;
  text?: { id: string; rev: number; title: string; intro?: string | null; blocks?: string[] } | null;
  area?: { id: string; rev: number; body: string } | null;
  features?: Array<{ es: string; tr: string }>;
}

/** Guarda lo editado (cada parte con su revisión; nunca pisa otra edición). */
export async function saveReview(be: TrBackend, catalogId: string, edit: ReviewEdit): Promise<void> {
  const es = await be.esState(catalogId);
  if (edit.text) {
    if (edit.key === META_KEY) {
      await be.saveText(edit.text.id, edit.text.rev, { t: edit.text.title, i: edit.text.intro ?? null });
    } else {
      const x = esItemsOf(es).find((i) => i.key === edit.key);
      if (!x) throw new Error("not_in_catalog");
      const blocks = edit.text.blocks ?? [];
      if (blocks.length !== x.unit.ownBlocks.length) throw new Error("translation_keys");
      await be.saveText(edit.text.id, edit.text.rev, { t: edit.text.title, b: x.unit.ownBlocks.map((b, i) => ({ k: b.k, x: blocks[i] })) });
    }
  }
  if (edit.area) await be.saveText(edit.area.id, edit.area.rev, { b: [{ k: "barrio", x: edit.area.body }] });
  for (const f of edit.features ?? []) if (f.tr.trim()) await be.saveFeature(edit.lang, f.es, f.tr.trim());
}

/** Aprueba lo que se revisó y lo copia a este catálogo. Bloqueos y avisos
 *  como al publicar: contacto o precio bloquean; cada aviso se confirma. */
export async function approveItem(
  be: TrBackend,
  input: { catalogId: string; key: string; lang: TargetLanguage; textRev: number; areaRev: number | null; confirmed: string[] },
): Promise<number> {
  const panel = await loadPanel(be, input.catalogId, input.lang);
  const it = panel.items.find((i) => i.key === input.key);
  if (!it) throw new Error("not_in_catalog");
  if (!it.text || it.text.status === "rejected") throw new Error("translation_not_found");
  if (it.text.rev !== input.textRev) throw new Error("translation_changed");
  if (it.check?.blockers.length) throw new Error(it.check.blockers[0].code);
  if (it.check && pendingTranslationWarnings(it.check, input.confirmed).length) throw new Error("tr_unconfirmed");
  if (it.kind === "meta") {
    return be.approve(input.catalogId, null, input.lang, it.sig, { text: { id: it.text.id, rev: it.text.rev }, area: null, features: [], list: [] });
  }
  const needArea = it.es.blocks.some((b) => b.area);
  if (needArea && !it.area) throw new Error("translation_not_found");
  if (needArea && it.area && input.areaRev !== it.area.rev) throw new Error("translation_changed");
  return be.approve(input.catalogId, it.propertyId, input.lang, it.sig, {
    text: { id: it.text.id, rev: it.text.rev },
    area: needArea && it.area ? { id: it.area.id, rev: it.area.rev } : null,
    features: it.features.filter((f) => f.status === "draft" && f.tr).map((f) => ({ es: f.es, tr: f.tr! })),
    list: it.es.features,
  });
}

/** «Usar las ya aprobadas» (sin IA): copia al catálogo lo que ya tiene su
 *  traducción aprobada para el español de hoy. */
export async function useApproved(be: TrBackend, catalogId: string, lang: TargetLanguage, onlyKey?: string): Promise<{ copied: number }> {
  const panel = await loadPanel(be, catalogId, lang);
  let copied = 0;
  for (const it of panel.items) {
    if (onlyKey && it.key !== onlyKey) continue;
    const refresh = it.current && it.featuresMissing > 0 && it.features.some((f) => f.status === "approved" && f.tr);
    if (it.state !== "ready" && !refresh) continue;
    if (!it.text || it.text.status !== "approved") continue;
    const needArea = it.es.blocks.some((b) => b.area);
    if (needArea && it.area?.status !== "approved") continue;
    await be.copySet(catalogId, it.propertyId, lang, it.sig, it.text.id, needArea ? it.area!.id : null, it.es.features);
    copied++;
  }
  return { copied };
}

/** Idioma del catálogo (`linkId` null) o de un enlace personal (`lang` null =
 *  el del catálogo). Fuera del español solo si está completo. */
export async function setLanguage(be: TrBackend, catalogId: string, linkId: string | null, lang: CatalogLanguage | null): Promise<number> {
  const es = await be.esState(catalogId);
  const meta = esMetaOf(es);
  const required: ActivationRequired = {
    meta: meta.sig,
    items: esItemsOf(es).map((x) => ({ p: x.propertyId, s: x.unit.sig, f: x.unit.features })),
  };
  return be.activate(catalogId, linkId, lang, es.version, required);
}

/** Resumen para el aviso de «Contenido» (N5: el gestor lo marca). */
export async function activeLanguageGaps(be: TrBackend, catalogId: string): Promise<Array<{ lang: TargetLanguage; pending: string[] }>> {
  const es = await be.esState(catalogId);
  const links = await be.links(catalogId);
  const active = new Set<string>([es.defaultLang, ...links.filter((l) => l.state === "active").map((l) => l.lang ?? es.defaultLang)]);
  const copies = await be.copies(catalogId);
  const items = esItemsOf(es);
  const out: Array<{ lang: TargetLanguage; pending: string[] }> = [];
  for (const l of active) {
    if (!isTargetLanguage(l)) continue;
    const pending = items
      .filter((x) => copies.items.find((c) => c.propertyId === x.propertyId && c.lang === l)?.esSig !== x.unit.sig)
      .map((x) => x.unit.title);
    out.push({ lang: l, pending });
  }
  return out;
}
