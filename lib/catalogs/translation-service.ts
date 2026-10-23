import { esUnitOfItem, type InternalItem, type InternalSnapshot } from "./to-public";
import { catalogDictionary, type CatalogLanguage } from "./i18n";
import { SECTION_HEADINGS } from "./structure";
import {
  AUTO_LIMITS,
  autoRetryState,
  checkTranslation,
  headingFor,
  ITEM_STATE_LABEL,
  isTargetLanguage,
  translationBlockers,
  languageProgress,
  metaSig,
  RESERVATION_TTL_SECONDS,
  reserveLimits,
  runPreparation,
  TARGET_LANGUAGES,
  type AutoLimits,
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
// Traducciones del catálogo en la GESTIÓN (PR6 + traducción automática,
// 0228). Orquestación PURA sobre un «backend» inyectado: en la app, las
// funciones SQL de 0226/0228 (translation-data.ts); en las pruebas y los
// fixtures, el almacén en memoria con las MISMAS reglas
// (translation-memory.ts). La IA también llega inyectada y solo se usa en
// `prepareItem`, que lanza el traductor en SEGUNDO PLANO (auto-translate.ts)
// tras una visita o «Preparar ahora». Ninguna petición pública espera aquí.
//
// Publicación automática (`autoUnit`): una traducción que pasa los filtros
// deterministas (sin contacto ni precio) se publica sola en ESTE catálogo
// (approval 'auto'); los avisos de cifras y nombres no la frenan, pero el
// panel la marca «revisar». Con un bloqueo no se publica (estado «blocked»).
// Lo editado a mano se publica como 'manual' y nunca lo pisa una traducción
// automática: cada fuente se traduce una vez por versión del español.
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
  /** 0228: cómo se publicó una aprobada ('auto' sola, 'manual' el dueño). */
  approval: "auto" | "manual" | null;
  updatedAt: string | null;
  /** 0230: copiada de una traducción ya publicada en otro catálogo del equipo. */
  reusedFrom?: string | null;
}

export interface FeatureRow {
  es: string;
  lang: TargetLanguage;
  tr: string;
  status: "draft" | "approved" | "rejected";
  approval: "auto" | "manual" | null;
  /** Quién la escribió: la IA o el dueño a mano. */
  origin?: "ai" | "manual";
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
  /** 0228: lo lanzó una visita (no el dueño). */
  auto: boolean;
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

export type PublishMode = "auto" | "manual";

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
  /** catalog_tr_reuse (0230): copia a las filas del dueño lo que ya esté
   *  publicado en cualquier catálogo del equipo (misma vivienda y mismo
   *  español, misma plantilla, misma característica). Sin IA. */
  reuse(i: { sourceId: string | null; areaSourceId: string | null; lang: TargetLanguage; features: string[] }): Promise<{ text: boolean; area: boolean; features: number }>;
  /** catalog_tr_reserve_auto (0228): la reserva de 0226 con los límites. */
  reserve(i: { sourceId: string; lang: TargetLanguage; catalogId: string; propertyId: string | null; needs: PrepareNeeds; ttlSeconds: number; limits: ReturnType<typeof reserveLimits> }): Promise<ReserveResult>;
  finish(i: { jobId: string; outcome: "done" | "failed" | "uncertain"; result: TranslationResult | null; note: string | null }): Promise<FinishResult>;
  saveText(textId: string, rev: number, content: object): Promise<number>;
  saveFeature(lang: TargetLanguage, es: string, tr: string): Promise<void>;
  /** catalog_tr_publish (0228): aprueba lo visto y lo copia a este catálogo. */
  publish(catalogId: string, propertyId: string | null, lang: TargetLanguage, sig: string, parts: ApproveParts, mode: PublishMode): Promise<number>;
  markReviewed(catalogId: string, lang: TargetLanguage, textIds: string[], features: string[]): Promise<number>;
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
  /** Es la plantilla «Vivir en…» (se traduce aparte y se reutiliza, DA27). */
  area: boolean;
}

type Approval = TextRow["approval"];

export interface PanelItem {
  key: string;
  propertyId: string | null;
  kind: "item" | "meta";
  /** Título en español de lo que se ve hoy. */
  title: string;
  level: string;
  state: ItemTrState;
  stateLabel: string;
  /** La copia de este catálogo es la vigente (el cliente ve la traducción). */
  current: boolean;
  /** Hay copia, pero de un español anterior (el cliente ve N5 hasta rehacerla). */
  outdated: boolean;
  /** La fuente es una versión aprobada de la biblioteca (se reutiliza). */
  library: boolean;
  sig: string;
  es: { title: string; intro: string | null; blocks: PanelBlock[]; features: string[] };
  text: { id: string; rev: number; status: TextRow["status"]; title: string | null; intro: string | null; origin: TextRow["origin"]; approval: Approval; reused: boolean } | null;
  area: { id: string; rev: number; status: TextRow["status"]; approval: Approval } | null;
  features: Array<{ es: string; tr: string | null; status: FeatureRow["status"] | null; approval: Approval }>;
  featuresMissing: number;
  job: { id: string; status: JobRow["status"]; expiresAt: string; note: string | null; discarded: boolean; active: boolean; auto: boolean } | null;
  /** Espera creciente tras fallos (0228): cuándo se reintenta y si ya no. */
  retry: { failures: number; until: string | null; stopped: boolean };
  /** Bloqueos y avisos de lo que NO revisó el dueño (borradores y lo
   *  publicado solo). Lo publicado a mano no se vuelve a señalar. */
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

/** Lo que el dueño no ha visto: un borrador o algo publicado solo. */
const unseen = (r: { status: string; approval: Approval } | null | undefined): boolean => !!r && r.status !== "rejected" && (r.status === "draft" || r.approval !== "manual");

function checkFor(item: { unit?: EsUnit; meta?: { title: string; intro: string | null } }, text: TextRow | null, areaText: TextRow | null, feats: FeatureRow[], names: string[]): TranslationCheck | null {
  const pairs: CheckPair[] = [];
  if (item.meta) {
    if (!text || !unseen(text)) return null;
    pairs.push({ where: "title", label: "Título del catálogo", es: item.meta.title, tr: text.content.t ?? "" });
    if (item.meta.intro) pairs.push({ where: "intro", label: "Introducción", es: item.meta.intro, tr: text.content.i ?? "" });
    return checkTranslation(pairs, names);
  }
  const unit = item.unit!;
  if (text && unseen(text)) {
    pairs.push({ where: "title", label: "Título", es: unit.title, tr: text.content.t ?? "" });
    unit.ownBlocks.forEach((b, i) => pairs.push({ where: `block:${i}`, label: b.k === "intro" ? "Introducción" : SECTION_HEADINGS[b.k], es: b.x, tr: text.content.b?.[i]?.x ?? "" }));
  }
  if (areaText && unit.areaText && unseen(areaText)) pairs.push({ where: "area", label: "Plantilla «Vivir en…»", es: unit.areaText, tr: areaText.content.b?.[0]?.x ?? "" });
  for (const f of feats) if (unseen(f)) pairs.push({ where: `feature:${f.es}`, label: `Característica «${f.es}»`, es: f.es, tr: f.tr });
  return pairs.length ? checkTranslation(pairs, names) : null;
}

/** Bloqueos que impiden publicar la unidad (los de una característica solo
 *  dejan fuera esa característica). */
function unitBlockers(check: TranslationCheck | null): TranslationCheck["blockers"] {
  return (check?.blockers ?? []).filter((b) => !b.where.startsWith("feature:"));
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
  const jobsOf = (sourceId: string | null) => (sourceId ? work.jobs.filter((x) => x.sourceId === sourceId && x.lang === lang) : []);
  const jobFor = (sourceId: string | null): PanelItem["job"] => {
    const j = latest(jobsOf(sourceId));
    if (!j) return null;
    const active = j.status === "reserved" && new Date(j.expiresAt).getTime() > now;
    return { id: j.id, status: j.status, expiresAt: j.expiresAt, note: j.note, discarded: !!j.discardedAt, active, auto: j.auto };
  };
  const stateOf = (o: { current: boolean; job: PanelItem["job"]; text: TextRow | null; needArea: boolean; area: TextRow | null; check: TranslationCheck | null; retry: PanelItem["retry"]; outdated: boolean }): ItemTrState => {
    if (o.job?.active) return "busy";
    if (o.current) return o.check?.warnings.length ? "review" : "current";
    const haveText = !!o.text && o.text.status !== "rejected";
    const haveArea = !o.needArea || (!!o.area && o.area.status !== "rejected");
    if (haveText && haveArea) return unitBlockers(o.check).length ? "blocked" : "ready";
    if (o.retry.stopped) return "stopped";
    if (o.retry.until) return "waiting";
    if (o.outdated) return "outdated";
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
    const retry = autoRetryState(jobsOf(src?.id ?? null), now);
    const check = text && text.status !== "rejected" ? checkFor({ meta }, text, null, [], []) : null;
    const state = stateOf({ current, job, text, needArea: false, area: null, check, retry, outdated: !!copy && !current });
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
      text: text ? { id: text.id, rev: text.rev, status: text.status, title: text.content.t ?? null, intro: text.content.i ?? null, origin: text.origin, approval: text.approval, reused: !!text.reusedFrom } : null,
      area: null,
      features: [],
      featuresMissing: 0,
      job,
      retry,
      check,
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
    const retry = autoRetryState(jobsOf(src?.id ?? null), now);
    const check = checkFor({ unit: x.unit }, text && text.status !== "rejected" ? text : null, area, feats.filter((f): f is FeatureRow => !!f), x.names);
    const state = stateOf({ current, job, text, needArea: !!x.unit.areaText, area, check, retry, outdated: !!copy && !current });
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
      text: text ? { id: text.id, rev: text.rev, status: text.status, title: text.content.t ?? null, intro: null, origin: text.origin, approval: text.approval, reused: !!text.reusedFrom } : null,
      area: area ? { id: area.id, rev: area.rev, status: area.status, approval: area.approval } : null,
      features: x.unit.features.map((f, i) => ({ es: f, tr: feats[i]?.tr ?? null, status: feats[i]?.status ?? null, approval: feats[i]?.approval ?? null })),
      featuresMissing,
      job,
      retry,
      check,
      names: x.names,
    });
  }
  const active = [...new Set<CatalogLanguage>([es.defaultLang, ...links.filter((l) => l.state === "active").map((l) => l.lang ?? es.defaultLang)])];
  return { catalogId, version: es.version, defaultLang: es.defaultLang, lang, links, progress, active, items: panelItems };
}

// ── Preparar (la llamada a la IA, con reserva y límites) ────────────────────

export interface PrepareDeps {
  ai: TrAiFn;
  timeoutMs?: number;
  isNotConfigured?: (e: unknown) => boolean;
  ttlSeconds?: number;
  limits?: Pick<AutoLimits, "maxActivePerCatalog" | "dailyCapPerCatalog" | "maxFailures" | "retryWaitsSeconds">;
}

/** Las fuentes de una vivienda (o del título del catálogo) en un idioma y lo
 *  que se pediría a la IA. Crea las fuentes si aún no existen. */
async function unitSources(be: TrBackend, input: { catalogId: string; key: string; lang: TargetLanguage }): Promise<{
  sourceId: string;
  areaSourceId: string | null;
  propertyId: string | null;
  request: TranslationRequest;
  needs: PrepareNeeds;
}> {
  const es = await be.esState(input.catalogId);
  if (input.key === META_KEY) {
    const meta = esMetaOf(es);
    const sourceId = (await be.ensureSource(input.catalogId, null, meta.sig, { t: meta.title, i: meta.intro })).id;
    return {
      sourceId,
      areaSourceId: null,
      propertyId: null,
      request: { lang: input.lang, text: null, area: null, features: [], meta: { t: meta.title, i: meta.intro }, names: [] },
      needs: { text: false, area: null, features: [], meta: true },
    };
  }
  const x = esItemsOf(es).find((i) => i.key === input.key);
  if (!x) throw new Error("not_in_catalog");
  const sourceId = (await be.ensureSource(input.catalogId, x.propertyId, x.unit.ownSig, { t: x.unit.title, b: x.unit.ownBlocks })).id;
  const areaSourceId = x.unit.areaText && x.areaVersionId
    ? await be.ensureAreaSource(x.areaVersionId, x.unit.areaSig!, { b: [{ k: "barrio", x: x.unit.areaText }] })
    : null;
  return {
    sourceId,
    areaSourceId,
    propertyId: x.propertyId,
    request: { lang: input.lang, text: { t: x.unit.title, b: x.unit.ownBlocks }, area: x.unit.areaText, features: x.unit.features, meta: null, names: x.names },
    needs: { text: true, area: areaSourceId, features: x.unit.features, meta: false },
  };
}

/** UNA llamada a la IA para una vivienda (o el título del catálogo) en un
 *  idioma, solo con lo que falta. `manual`: la lanza el dueño («Preparar
 *  ahora»): sin espera creciente ni tope diario (sí con el límite de
 *  trabajos a la vez por catálogo). */
export async function prepareItem(
  be: TrBackend,
  deps: PrepareDeps,
  input: { catalogId: string; key: string; lang: TargetLanguage; manual?: boolean },
): Promise<PrepareOutcome> {
  if (!isTargetLanguage(input.lang)) throw new Error("invalid_lang");
  const { sourceId, propertyId, request, needs } = await unitSources(be, input);
  const ttl = deps.ttlSeconds ?? RESERVATION_TTL_SECONDS;
  const limits = reserveLimits(input.manual === true, deps.limits ?? AUTO_LIMITS);
  return runPreparation(
    {
      store: {
        reserve: (i) => be.reserve({ sourceId: i.sourceId, lang: i.lang, catalogId: input.catalogId, propertyId, needs: i.needs, ttlSeconds: ttl, limits }),
        finish: (i) => be.finish(i),
      },
      ai: deps.ai,
      timeoutMs: deps.timeoutMs,
      isNotConfigured: deps.isNotConfigured,
    },
    { sourceId, request, needs, manual: input.manual === true },
  );
}

/** Equipo (0230): antes de pagar una traducción, lo que esta vivienda ya
 *  tenga traducido y PUBLICADO a este idioma en cualquier catálogo del equipo
 *  (mismo español exacto; misma plantilla; misma característica) se copia a
 *  este dueño. Sin IA. El título del catálogo no se comparte. ¿Copió algo? */
export async function reuseItem(be: TrBackend, input: { catalogId: string; key: string; lang: TargetLanguage }, it: PanelItem): Promise<boolean> {
  if (it.kind === "meta") return false;
  const wantText = !it.text;
  const wantArea = it.es.blocks.some((b) => b.area) && !it.area;
  const features = it.features.filter((f) => f.status === null).map((f) => f.es);
  if (!wantText && !wantArea && features.length === 0) return false;
  const u = await unitSources(be, input);
  const r = await be.reuse({ sourceId: wantText ? u.sourceId : null, areaSourceId: wantArea ? u.areaSourceId : null, lang: input.lang, features });
  return r.text || r.area || r.features > 0;
}

// ── Publicar (sola o a mano) ────────────────────────────────────────────────

export type PublishResult = { kind: "published"; version: number } | { kind: "blocked"; code: string } | { kind: "nothing" } | { kind: "not_ready" };

/** Publica en este catálogo lo traducido de una unidad. En 'auto', solo si
 *  no tiene bloqueos (contacto o precio); los avisos no la frenan. Las
 *  características con un bloqueo se quedan fuera (no se ven). */
export async function publishItem(be: TrBackend, catalogId: string, lang: TargetLanguage, it: PanelItem, mode: PublishMode): Promise<PublishResult> {
  if (!it.text || it.text.status === "rejected") return { kind: "not_ready" };
  const needArea = it.es.blocks.some((b) => b.area);
  if (needArea && (!it.area || it.area.status === "rejected")) return { kind: "not_ready" };
  const blockers = unitBlockers(it.check);
  if (blockers.length) return { kind: "blocked", code: blockers[0].code };
  const featureParts = it.features
    .filter((f): f is typeof f & { tr: string } => !!f.tr && f.status === "draft" && translationBlockers(f.es, f.tr).length === 0)
    .map((f) => ({ es: f.es, tr: f.tr }));
  const copyMissing = it.featuresMissing > 0 && it.features.some((f) => f.status === "approved");
  if (mode === "auto" && it.current && featureParts.length === 0 && !copyMissing) return { kind: "nothing" };
  const version = await be.publish(catalogId, it.propertyId, lang, it.sig, {
    text: { id: it.text.id, rev: it.text.rev },
    area: needArea && it.area ? { id: it.area.id, rev: it.area.rev } : null,
    features: it.kind === "meta" ? [] : featureParts,
    list: it.kind === "meta" ? [] : it.es.features,
  }, mode);
  return { kind: "published", version };
}

/** ¿Hay algo que hacer con esta unidad sin el dueño? */
export function needsAutoWork(it: PanelItem, now = Date.now()): boolean {
  if (it.state === "busy" || it.state === "blocked" || it.state === "stopped") return false;
  if (it.state === "waiting") return !!it.retry.until && Date.parse(it.retry.until) <= now;
  if (it.state === "current" || it.state === "review") {
    // Vigente: solo si faltan características que se puedan traducir o copiar.
    return it.featuresMissing > 0 && it.features.some((f) => f.status === null || f.status === "rejected" || (f.status === "draft" && !!f.tr && translationBlockers(f.es, f.tr).length === 0) || f.status === "approved");
  }
  return true;
}

export type AutoUnitResult =
  | { key: string; kind: "published"; reused?: boolean }
  | { key: string; kind: "blocked"; code: string }
  | { key: string; kind: "skipped"; reason: string }
  | { key: string; kind: "ai"; outcome: PrepareOutcome["kind"]; published: boolean };

/** Una unidad en segundo plano: publicar lo que ya se puede (sin IA) o, si
 *  falta, UNA llamada a la IA (con reserva y límites) y publicar el
 *  resultado si pasa los filtros. `spend()` decide si esta visita aún puede
 *  lanzar otra llamada (tope por visita). */
export async function autoUnit(
  be: TrBackend,
  deps: PrepareDeps & { spend: () => boolean; now?: () => number },
  input: { catalogId: string; key: string; lang: TargetLanguage; manual?: boolean },
): Promise<AutoUnitResult> {
  const now = deps.now ?? Date.now;
  const find = async () => (await loadPanel(be, input.catalogId, input.lang, now())).items.find((i) => i.key === input.key) ?? null;
  let it = await find();
  if (!it) return { key: input.key, kind: "skipped", reason: "not_in_catalog" };
  if (!input.manual && !needsAutoWork(it, now())) return { key: input.key, kind: "skipped", reason: it.state };
  if (input.manual && (it.state === "busy" || it.state === "blocked")) return { key: input.key, kind: "skipped", reason: it.state };
  // Lo que el equipo ya tradujo (misma vivienda y mismo español): sin IA.
  const reused = await reuseItem(be, input, it);
  if (reused) {
    it = await find();
    if (!it) return { key: input.key, kind: "skipped", reason: "not_in_catalog" };
  }
  const first = await publishItem(be, input.catalogId, input.lang, it, "auto");
  if (first.kind === "published") {
    // Lo publicado puede seguir sin alguna característica traducida.
    it = await find();
    if (!it || !needsAutoWork(it, now()) || it.features.every((f) => f.status !== null && f.status !== "rejected")) {
      return reused ? { key: input.key, kind: "published", reused: true } : { key: input.key, kind: "published" };
    }
  } else if (first.kind === "blocked") {
    return { key: input.key, kind: "blocked", code: first.code };
  } else if (first.kind === "nothing" && !it.features.some((f) => f.status === null || f.status === "rejected")) {
    return { key: input.key, kind: "skipped", reason: "current" };
  }
  if (!deps.spend()) return { key: input.key, kind: "skipped", reason: "visit_budget" };
  const outcome = await prepareItem(be, deps, input);
  if (outcome.kind !== "saved" && outcome.kind !== "ready") return { key: input.key, kind: "ai", outcome: outcome.kind, published: first.kind === "published" };
  it = await find();
  const after = it ? await publishItem(be, input.catalogId, input.lang, it, "auto") : { kind: "not_ready" as const };
  if (after.kind === "blocked") return { key: input.key, kind: "blocked", code: after.code };
  return { key: input.key, kind: "ai", outcome: outcome.kind, published: after.kind === "published" || first.kind === "published" };
}

// ── Editar a mano y dar por buena ───────────────────────────────────────────

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

/** «Guardar»: lo editado a mano se publica AL MOMENTO en este catálogo
 *  (como 'manual': ninguna traducción automática lo pisa mientras el
 *  español no cambie). Contacto o precio se rechazan al guardar. */
export async function saveAndPublish(be: TrBackend, catalogId: string, edit: ReviewEdit): Promise<number | null> {
  await saveReview(be, catalogId, edit);
  const it = (await loadPanel(be, catalogId, edit.lang)).items.find((i) => i.key === edit.key);
  if (!it) throw new Error("not_in_catalog");
  const r = await publishItem(be, catalogId, edit.lang, it, "manual");
  if (r.kind === "blocked") throw new Error(r.code);
  return r.kind === "published" ? r.version : null;
}

/** «Dar por revisada»: quita la marca «revisar» de lo publicado solo. */
export async function markItemReviewed(be: TrBackend, catalogId: string, key: string, lang: TargetLanguage): Promise<number> {
  const it = (await loadPanel(be, catalogId, lang)).items.find((i) => i.key === key);
  if (!it) throw new Error("not_in_catalog");
  const texts = [it.text, it.area].filter((t): t is NonNullable<typeof t> => !!t && t.status === "approved" && t.approval === "auto").map((t) => t.id);
  const feats = it.features.filter((f) => f.status === "approved" && f.approval === "auto").map((f) => f.es);
  if (!texts.length && !feats.length) return 0;
  return be.markReviewed(catalogId, lang, texts, feats);
}

/** Idioma del catálogo (`linkId` null) o de un enlace personal (`lang` null =
 *  el del catálogo). Se aplica AL MOMENTO (0228): lo que no esté traducido se
 *  ve con el aviso N5 y se traduce solo en la primera visita. */
export async function setLanguage(be: TrBackend, catalogId: string, linkId: string | null, lang: CatalogLanguage | null): Promise<number> {
  const es = await be.esState(catalogId);
  const meta = esMetaOf(es);
  const required: ActivationRequired = {
    meta: meta.sig,
    items: esItemsOf(es).map((x) => ({ p: x.propertyId, s: x.unit.sig, f: x.unit.features })),
  };
  return be.activate(catalogId, linkId, lang, es.version, required);
}

/** Resumen para el aviso de «Contenido»: idiomas activos con viviendas que el
 *  cliente ve ahora con «Descripción en preparación». */
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
