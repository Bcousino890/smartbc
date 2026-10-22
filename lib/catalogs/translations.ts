import { createHash } from "node:crypto";
import type { Editorial, EditorialLevel } from "./editorial";
import type { CopyKey } from "./structure";
import { SECTION_ORDER } from "./structure";
import { fold, textBlockers, type TextBlocker } from "./text-rules";
import type { CatalogDictionary } from "./i18n";

// ============================================================================
// Traducciones del catálogo (BCP-01 ampliación, expediente
// 2026-10-21-bcp-01-ampliacion-textos-idiomas: PR6 y la traducción
// AUTOMÁTICA decidida por Fabricio el 22-10-2026, «como en itinerarios»).
// PURO: sin base de datos ni red. La IA llega INYECTADA (como en ai-draft.ts
// y area-texts.ts): en la app es aiComplete con el proveedor configurado; en
// las pruebas y los fixtures, una IA FALSA que cuenta llamadas. La lectura
// pública solo usa `applyItemTranslation` (sin IA): la traducción la hace la
// gestión EN SEGUNDO PLANO (auto-translate.ts) y nunca dentro de la petición.
//
// · Unidad de traducción = la descripción YA ORGANIZADA en español (DA18): los
//   bloques del organizador con su CLAVE de sección. Los títulos de sección
//   salen del diccionario del idioma; «Vivir en {zona}» conserva el nombre
//   propio. El clasificador español nunca se pasa sobre texto traducido.
// · Huella (`sig`) del español: título + bloques con sus claves. Una
//   traducción solo es VIGENTE si su huella es la del español que el catálogo
//   enseña ahora (DA14). Si no, la vivienda sigue el caso N5: datos, fotos y
//   etiquetas en el idioma y, en lugar de la descripción, «Descripción en
//   preparación» (nunca el español ni una traducción desactualizada), hasta
//   que la traducción automática termina (en la primera visita).
// · Preparación (DA15, DA36): reserva única por fuente e idioma con
//   caducidad; un resultado que llega tarde o tras cancelar se descarta y se
//   registra. Un fallo, un incierto o una reserva caducada no se reintentan en
//   bucle: espera creciente (AUTO_LIMITS) y, tras varios seguidos, ya solo el
//   dueño. La reserva reduce duplicados, no garantiza una sola llamada de pago.
// · Publicación automática: si pasa los filtros deterministas (sin contacto
//   ni precio) se publica sola; los avisos de cifras y nombres no la frenan,
//   pero el gestor la marca «revisar». Con un bloqueo, no se publica.
// ============================================================================

export { TARGET_LANGUAGES, isTargetLanguage, LANGUAGE_NAMES_ES, ITEM_STATE_LABEL } from "./translation-labels";
export type { TargetLanguage, ItemTrState } from "./translation-labels";
import { LANGUAGE_NAMES_ES, type ItemTrState, type TargetLanguage } from "./translation-labels";

export interface UnitBlock {
  k: CopyKey;
  x: string;
}

/** Lo que el catálogo enseña HOY en español de una vivienda. */
export interface EsUnit {
  /** Título de la vivienda en este catálogo (el propio o el de la ficha). */
  title: string;
  /** Descripción organizada completa (con la plantilla de zona si entra). */
  blocks: UnitBlock[];
  /** La misma sin el bloque de la plantilla (la fuente propia, DA31). */
  ownBlocks: UnitBlock[];
  /** Texto de la plantilla «Vivir en…» si es el bloque «barrio» (DA27). */
  areaText: string | null;
  features: string[];
  level: EditorialLevel;
  areaName: string | null;
  /** Huella de lo que se ve (título + todos los bloques). */
  sig: string;
  /** Huella de la fuente propia (título + bloques sin plantilla). */
  ownSig: string;
  /** Huella de la plantilla (null si no entra). */
  areaSig: string | null;
}

const KEYS: readonly string[] = ["intro", ...SECTION_ORDER];

export function isCopyKey(v: unknown): v is CopyKey {
  return KEYS.includes(v as string);
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

/** Huella estable de un título y unos bloques (orden y claves incluidos). */
export function unitSig(title: string | null, blocks: UnitBlock[]): string {
  return sha(JSON.stringify(["u1", title ?? "", blocks.map((b) => [b.k, b.x])]));
}

export function areaSig(body: string): string {
  return sha(JSON.stringify(["a1", body]));
}

export function metaSig(title: string, intro: string | null): string {
  return sha(JSON.stringify(["m1", title, intro ?? ""]));
}

/** Unidad española a partir del título y del recorrido editorial ya hecho
 *  (el MISMO que pinta el lector en español). */
export function esUnitFrom(title: string, ed: Pick<Editorial, "copy" | "features" | "level" | "areaName" | "areaTextUsed">): EsUnit {
  const blocks: UnitBlock[] = ed.copy.map((b) => ({ k: b.key, x: b.text }));
  const area = ed.areaTextUsed ? blocks.find((b) => b.k === "barrio") ?? null : null;
  const ownBlocks = area ? blocks.filter((b) => b !== area) : blocks;
  return {
    title,
    blocks,
    ownBlocks,
    areaText: area ? area.x : null,
    features: [...ed.features],
    level: ed.level,
    areaName: ed.areaName,
    sig: unitSig(title, blocks),
    ownSig: unitSig(title, ownBlocks),
    areaSig: area ? areaSig(area.x) : null,
  };
}

/** Bloques traducidos completos: los propios y, si la plantilla entra, su
 *  traducción como bloque «barrio» al final (mismo sitio que en español). */
export function assembleBlocks(own: UnitBlock[], areaTr: string | null): UnitBlock[] {
  return areaTr ? [...own, { k: "barrio", x: areaTr }] : own;
}

export function sameKeys(a: Array<{ k: string }>, b: Array<{ k: string }>): boolean {
  return a.length === b.length && a.every((x, i) => x.k === b[i].k);
}

// ── Lectura (pública y PDF): solo traducciones aprobadas y vigentes ─────────

/** Lo que trae la instantánea por idioma (0226): la copia del catálogo. */
export interface ItemTranslation {
  /** Huella del español que se tradujo. */
  s: string;
  t: string | null;
  b: Array<{ k: string; x: string }>;
  /** Características traducidas por cadena exacta [es, idioma]. */
  f?: Array<[string, string]> | null;
}

export function headingFor(key: string, dict: CatalogDictionary, areaName: string | null): string | null {
  if (key === "intro") return null;
  if (key === "barrio") return areaName ? dict.livingIn(areaName) : dict.sections.barrio;
  return isCopyKey(key) ? dict.sections[key as Exclude<CopyKey, "intro">] : null;
}

/** ¿La copia es la traducción vigente de lo que se ve en español? */
export function translationCurrent(es: EsUnit, tr: ItemTranslation | null | undefined): tr is ItemTranslation {
  return (
    !!tr &&
    tr.s === es.sig &&
    typeof tr.t === "string" &&
    tr.t.trim().length > 0 &&
    Array.isArray(tr.b) &&
    sameKeys(tr.b, es.blocks) &&
    tr.b.every((b, i) => typeof b.x === "string" && b.x.trim().length > 0 && translationBlockers(es.blocks[i]?.x, b.x).length === 0) &&
    translationBlockers(es.title, tr.t).length === 0
  );
}

export interface TranslatedItem {
  title: string;
  copy: Array<{ heading: string | null; text: string }>;
  features: string[];
  /** N5: sin traducción vigente (aviso en lugar de la descripción). */
  pending: boolean;
}

/** Contenido de una vivienda en un idioma distinto del español. Los datos
 *  operativos (precio, fotos, ficha, disponibilidad) NO pasan por aquí: salen
 *  siempre de la instantánea actual (DA34). */
export function applyItemTranslation(
  es: EsUnit,
  tr: ItemTranslation | null | undefined,
  dict: CatalogDictionary,
  place: string | null,
): TranslatedItem {
  const pairs = new Map<string, string>();
  for (const p of tr?.f ?? []) {
    if (Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string" && p[1].trim() && translationBlockers(p[0], p[1]).length === 0) pairs.set(p[0], p[1].trim());
  }
  // Las características sin traducción aprobada no se enseñan en español
  // (el gestor las marca); las traducidas sí, aunque la descripción no.
  const features = es.features.map((f) => pairs.get(f)).filter((f): f is string => !!f);
  if (translationCurrent(es, tr)) {
    return {
      title: tr.t!.trim(),
      copy: tr.b.map((b) => ({ heading: headingFor(b.k, dict, es.areaName), text: b.x.trim() })),
      features,
      pending: false,
    };
  }
  const where = (es.areaName ?? place ?? "").trim();
  return {
    title: where ? dict.homeIn(where) : dict.untitled,
    // Sin descripción en español no hay nada que preparar: no hay aviso.
    copy: es.blocks.length ? [{ heading: dict.descriptionPreparing, text: dict.descriptionPreparingHint }] : [],
    features,
    pending: es.blocks.length > 0,
  };
}

/** Título e introducción del catálogo traducidos (0226, `trm`). */
export interface MetaTranslation {
  s: string;
  t: string | null;
  i: string | null;
}

// ── Instrucción a la IA y su respuesta ──────────────────────────────────────

export interface TranslationRequest {
  lang: TargetLanguage;
  /** Fuente propia: título y bloques (null si ya está preparada). */
  text: { t: string; b: UnitBlock[] } | null;
  /** Plantilla «Vivir en…» (null si no hace falta). */
  area: string | null;
  /** Características por cadena exacta que faltan. */
  features: string[];
  /** Título e introducción del catálogo (solo en la unidad del catálogo). */
  meta: { t: string; i: string | null } | null;
  /** Nombres propios que se conservan tal cual (zona, barrio, calles). */
  names: string[];
}

export interface TranslationResult {
  text?: { t: string; b: UnitBlock[] } | null;
  area?: string | null;
  features?: Array<{ es: string; tr: string }>;
  meta?: { t: string; i: string | null } | null;
}

export const TRANSLATION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    blocks: { type: "array", items: { type: "object", properties: { k: { type: "string" }, x: { type: "string" } }, required: ["k", "x"], additionalProperties: false } },
    area: { type: "string" },
    features: { type: "array", items: { type: "object", properties: { es: { type: "string" }, tr: { type: "string" } }, required: ["es", "tr"], additionalProperties: false } },
    catalog_title: { type: "string" },
    catalog_intro: { type: "string" },
  },
  required: ["title", "blocks", "area", "features", "catalog_title", "catalog_intro"],
  additionalProperties: false,
} as const;

export function translationSystemPrompt(lang: TargetLanguage): string {
  const name = LANGUAGE_NAMES_ES[lang];
  return `Eres traductor profesional de textos inmobiliarios. Traduce del español al ${name} el texto de un catálogo privado de viviendas de un personal shopper inmobiliario en Madrid.

Reglas estrictas:
- Traduce SOLO lo que recibes, frase a frase, con naturalidad. No añadas, no quites ni resumas información.
- Conserva EXACTAMENTE, con su grafía original en alfabeto latino, los nombres propios: calles, barrios, zonas, distritos, edificios, parques, estaciones y marcas. Nunca los traduzcas ni los transcribas a otro alfabeto.
- Conserva todas las cifras con los mismos dígitos latinos (superficies, dormitorios, baños, plantas, años, distancias). No conviertas unidades.
- No añadas precios, teléfonos, correos, webs ni nombres de agencias o personas.
- Tono sobrio y elegante, sin exclamaciones ni superlativos vacíos.
- "blocks": devuelve EXACTAMENTE los mismos bloques, en el mismo orden y con la misma clave "k"; traduce solo "x" y conserva sus saltos de párrafo (línea en blanco).
- "title": el título de la vivienda traducido (máximo 160 caracteres).
- "area": la descripción de la zona traducida.
- "features": cada característica con su texto original exacto en "es" y su traducción breve en "tr".
- "catalog_title" y "catalog_intro": el título y la introducción del catálogo traducidos.
- Lo que no se pide, déjalo vacío ("" o []).
Responde en JSON conforme al esquema pedido.`;
}

export function translationUserText(req: TranslationRequest): string {
  const payload: Record<string, unknown> = { idioma_destino: req.lang };
  if (req.text) {
    payload.titulo = req.text.t;
    payload.bloques = req.text.b.map((b) => ({ k: b.k, x: b.x }));
  }
  if (req.area) payload.zona = req.area;
  if (req.features.length) payload.caracteristicas = req.features;
  if (req.meta) payload.catalogo = { titulo: req.meta.t, introduccion: req.meta.i ?? "" };
  if (req.names.length) payload.nombres_propios = req.names;
  return JSON.stringify(payload);
}

export function requestIsEmpty(req: Pick<TranslationRequest, "text" | "area" | "features" | "meta">): boolean {
  return !req.text && !req.area && req.features.length === 0 && !req.meta;
}

export class TranslationParseError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`translation_invalid: ${code}`);
    this.name = "TranslationParseError";
    this.code = code;
  }
}

export const TITLE_MAX_TR = 200;
export const BLOCK_MAX_TR = 8000;
export const FEATURE_MAX_TR = 160;
export const AREA_MAX_TR = 2500;
export const INTRO_MAX_TR = 1200;

function str(v: unknown): string {
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
}

/** Valida la respuesta contra lo pedido. Claves y orden de los bloques
 *  idénticos (DA18): si no, la respuesta no vale (nunca se reclasifica). */
export function parseTranslation(raw: string, req: TranslationRequest): TranslationResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as Record<string, unknown>;
  } catch {
    throw new TranslationParseError("json");
  }
  const out: TranslationResult = {};
  if (req.text) {
    const t = str(parsed.title).replace(/\s+/g, " ");
    const b = Array.isArray(parsed.blocks) ? (parsed.blocks as Array<Record<string, unknown>>) : [];
    if (!t || t.length > TITLE_MAX_TR) throw new TranslationParseError("title");
    if (b.length !== req.text.b.length) throw new TranslationParseError("blocks_count");
    const blocks: UnitBlock[] = b.map((x, i) => {
      const k = str(x?.k);
      const tx = str(x?.x);
      if (k !== req.text!.b[i].k) throw new TranslationParseError("blocks_keys");
      if (!tx || tx.length > BLOCK_MAX_TR) throw new TranslationParseError("block_text");
      return { k: req.text!.b[i].k, x: tx };
    });
    out.text = { t, b: blocks };
  }
  if (req.area) {
    const a = str(parsed.area);
    if (!a || a.length > AREA_MAX_TR) throw new TranslationParseError("area");
    out.area = a;
  }
  if (req.features.length) {
    const got = Array.isArray(parsed.features) ? (parsed.features as Array<Record<string, unknown>>) : [];
    const byEs = new Map(got.map((g) => [str(g?.es), str(g?.tr)] as const));
    const features: Array<{ es: string; tr: string }> = [];
    req.features.forEach((es, i) => {
      const tr = byEs.get(es.trim()) || (got.length === req.features.length ? str(got[i]?.tr) : "");
      if (tr && tr.length <= FEATURE_MAX_TR) features.push({ es, tr: tr.replace(/\s+/g, " ") });
    });
    out.features = features;
  }
  if (req.meta) {
    const t = str(parsed.catalog_title).replace(/\s+/g, " ");
    const i = str(parsed.catalog_intro);
    if (!t || t.length > TITLE_MAX_TR) throw new TranslationParseError("catalog_title");
    if (req.meta.i && (!i || i.length > INTRO_MAX_TR)) throw new TranslationParseError("catalog_intro");
    out.meta = { t, i: req.meta.i ? i : null };
  }
  return out;
}

// ── Comprobación determinista (como checkDraft) ─────────────────────────────

export interface TranslationBlocker {
  code: TextBlocker;
  where: string;
}
export interface TranslationWarning {
  /** Estable: lo que el dueño confirma («number:block:2:142»). */
  id: string;
  kind: "number" | "name" | "missing";
  where: string;
  message: string;
}
export interface TranslationCheck {
  blockers: TranslationBlocker[];
  warnings: TranslationWarning[];
}

/** Importes con moneda de un texto (cifra + € / euro(s) / eur, o € + cifra),
 *  solo con sus dígitos («5.500 €» → «5500»). */
const MONEY_RE = /(\d[\d.,\u00a0\u202f ]*)\s?(?:€|euros?\b|eur\b)|€\s?(\d[\d.,\u00a0\u202f ]*)/gi;

/** Bloqueos de una TRADUCCIÓN frente a su original español. Contacto
 *  (correo, web, teléfono): siempre. Precio: solo si la traducción trae un
 *  importe que NO está en el original. Si el español ya dice «5.500 /mes» y
 *  la traducción «5.500 €/ay», no se bloquea: es la misma información que ya
 *  se publica en español (caso real del 22-10-2026). Lo que la traducción no
 *  puede hacer es INVENTAR un precio. */
export function translationBlockers(es: string | null | undefined, tr: string | null | undefined): TextBlocker[] {
  const t = (tr ?? "").trim();
  if (!t) return [];
  const out: TextBlocker[] = textBlockers(t).filter((b) => b === "text_has_contact");
  const known = new Set(digitsIn(es ?? ""));
  for (const m of t.matchAll(MONEY_RE)) {
    const d = (m[1] ?? m[2] ?? "").replace(/[^\d]/g, "");
    if (!d || !known.has(d)) {
      out.push("text_has_price");
      break;
    }
  }
  return out;
}

function digitsIn(text: string): string[] {
  return (text.match(/\d+(?:[.,   ]\d{3})*(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(/[^\d]/g, ""));
}

function countMap(list: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** Pares [donde, original, traducción] de lo que se revisa. */
export type CheckPair = { where: string; label: string; es: string; tr: string };

/** Bloqueos (contacto, URL, precio: los mismos patrones que al publicar) y
 *  avisos: cifras que faltan o sobran y nombres propios que no aparecen. Los
 *  avisos se confirman uno a uno antes de aprobar. */
export function checkTranslation(pairs: CheckPair[], names: string[]): TranslationCheck {
  const blockers: TranslationBlocker[] = [];
  const warnings: TranslationWarning[] = [];
  const cleanNames = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 3))];
  for (const p of pairs) {
    for (const b of translationBlockers(p.es, p.tr)) if (!blockers.some((x) => x.code === b && x.where === p.where)) blockers.push({ code: b, where: p.where });
    if (!p.tr.trim()) {
      warnings.push({ id: `missing:${p.where}`, kind: "missing", where: p.where, message: `${p.label}: falta la traducción.` });
      continue;
    }
    const a = countMap(digitsIn(p.es));
    const b = countMap(digitsIn(p.tr));
    for (const [n, c] of a) if ((b.get(n) ?? 0) < c) warnings.push({ id: `number:${p.where}:${n}`, kind: "number", where: p.where, message: `${p.label}: la cifra «${n}» del original no aparece en la traducción.` });
    for (const [n, c] of b) if ((a.get(n) ?? 0) < c) warnings.push({ id: `number+:${p.where}:${n}`, kind: "number", where: p.where, message: `${p.label}: la traducción añade la cifra «${n}», que no está en el original.` });
    const esF = fold(p.es);
    for (const name of cleanNames) {
      const f = fold(name);
      if (esF.includes(f) && !fold(p.tr).includes(f)) warnings.push({ id: `name:${p.where}:${f}`, kind: "name", where: p.where, message: `${p.label}: el nombre «${name}» no aparece tal cual en la traducción.` });
    }
  }
  return { blockers, warnings };
}

export function pendingTranslationWarnings(check: TranslationCheck, confirmed: string[]): TranslationWarning[] {
  const ok = new Set(confirmed);
  return check.warnings.filter((w) => !ok.has(w.id));
}

// ── Fallos del proveedor (DA36) ─────────────────────────────────────────────

/** «not_configured»: no se llegó a llamar (sin coste). «failed»: el
 *  proveedor respondió con un error o la respuesta no vale. «uncertain»: se
 *  agotó el tiempo o se cortó la conexión tras enviar: la llamada pudo
 *  cobrarse; solo se reintenta tras la espera creciente (0228). Lo
 *  desconocido se trata como incierto. */
export type AiFailure = "not_configured" | "failed" | "uncertain";

export function classifyAiFailure(err: unknown, isNotConfigured: (e: unknown) => boolean = () => false): AiFailure {
  if (isNotConfigured(err)) return "not_configured";
  if (err instanceof TranslationParseError) return "failed";
  const name = err instanceof Error ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (name === "TimeoutError" || name === "AbortError" || /abort|timeout|timed out|fetch failed|network|socket|ECONNRESET|ETIMEDOUT|EPIPE/i.test(msg)) return "uncertain";
  if (/^IA \d{3}\b/.test(msg) || /rechaz/i.test(msg)) return "failed";
  return "uncertain";
}

// ── Preparación con reserva (la orquestación; la reserva vive en SQL) ───────

export interface PrepareNeeds {
  text: boolean;
  /** Fuente de la plantilla (catalog_tr_sources.id) si hay que traducirla. */
  area: string | null;
  features: string[];
  meta: boolean;
}

export type ReserveResult =
  | { state: "reserved"; jobId: string; expiresAt: string; needs: PrepareNeeds }
  | { state: "busy"; jobId: string; expiresAt: string }
  | { state: "ready" }
  | { state: "uncertain"; jobId: string }
  // 0228 · límites contra el abuso y el coste (catalog_tr_reserve_auto):
  | { state: "limit" } // ya hay AUTO_LIMITS.maxActivePerCatalog trabajos de este catálogo
  | { state: "cap" } // tope diario de trabajos automáticos del catálogo
  | { state: "waiting"; until: string; failures: number } // espera creciente tras un fallo
  | { state: "stopped"; failures: number }; // demasiados fallos seguidos: solo el dueño

export type FinishResult = { state: "saved" } | { state: "recorded" } | { state: "discarded"; reason: string };

export interface TranslationStore {
  reserve(i: { sourceId: string; lang: TargetLanguage; needs: PrepareNeeds; manual: boolean }): Promise<ReserveResult>;
  finish(i: { jobId: string; outcome: "done" | "failed" | "uncertain"; result: TranslationResult | null; note: string | null }): Promise<FinishResult>;
}

export type TrAiFn = (opts: { system: string; userText: string; maxTokens?: number; jsonSchema?: Record<string, unknown>; signal?: AbortSignal }) => Promise<string>;

/** Tiempo máximo de la llamada y caducidad de la reserva (la reserva dura
 *  más que la llamada: un resultado a tiempo nunca encuentra su reserva
 *  caducada salvo que el servidor se haya parado a mitad). */
export const TRANSLATION_TIMEOUT_MS = 120_000;
export const RESERVATION_TTL_SECONDS = 300;

/** Límites de la traducción automática contra el abuso y el coste (0228;
 *  documentados en result-traduccion-automatica.md). Los cuatro primeros los
 *  aplica la base de datos (catalog_tr_reserve_auto); los demás, el proceso.
 *  Solo se traduce el idioma que el dueño eligió para el catálogo o el enlace
 *  (nunca uno pedido por URL), y cada vivienda una vez por versión del
 *  español: N visitas no son N veces el coste. */
export interface AutoLimits {
  maxActivePerCatalog: number;
  dailyCapPerCatalog: number;
  maxFailures: number;
  retryWaitsSeconds: readonly number[];
  maxAiPerVisit: number;
  globalConcurrency: number;
  requestThrottleMs: number;
}

export const AUTO_LIMITS: Readonly<AutoLimits> = {
  /** Trabajos (llamadas a la IA) a la vez por catálogo, entre todas sus visitas. */
  maxActivePerCatalog: 2,
  /** Trabajos automáticos por catálogo en 24 h (techo de seguridad: un
   *  catálogo de 24 viviendas en 7 idiomas son 175). */
  dailyCapPerCatalog: 300,
  /** Fallos seguidos (fallido, incierto o caducado) tras los que ya no se
   *  reintenta solo: hace falta «Preparar ahora» del dueño. */
  maxFailures: 5,
  /** Espera antes de que otra visita reintente tras 1, 2, 3 y 4 fallos. */
  retryWaitsSeconds: [300, 1800, 7200, 43200],
  /** Trabajos nuevos que puede lanzar una visita (un catálogo normal, 24
   *  viviendas y su título, cabe entero en una). */
  maxAiPerVisit: 30,
  /** Llamadas a la IA a la vez en todo el proceso (todos los catálogos). */
  globalConcurrency: 4,
  /** Una misma visita (token) no relanza la comprobación antes de esto: el
   *  lector consulta el estado cada 500 ms si el canal en vivo calla. */
  requestThrottleMs: 15_000,
};

/** Lo que la base de datos recibe en p_limits (catalog_tr_reserve_auto). */
export function reserveLimits(manual: boolean, l: Pick<AutoLimits, "maxActivePerCatalog" | "dailyCapPerCatalog" | "maxFailures" | "retryWaitsSeconds"> = AUTO_LIMITS) {
  return { manual, max_active: l.maxActivePerCatalog, daily_cap: l.dailyCapPerCatalog, max_failures: l.maxFailures, waits: [...l.retryWaitsSeconds] };
}

/** Espera creciente de una fuente en un idioma (la MISMA regla que
 *  catalog_tr_reserve_auto): fallos seguidos desde el último trabajo
 *  terminado, cuándo se puede reintentar y si ya no se reintenta solo. */
export function autoRetryState(
  jobs: Array<{ status: string; reservedAt: string; finishedAt: string | null; expiresAt: string }>,
  now: number,
  l: Pick<AutoLimits, "maxFailures" | "retryWaitsSeconds"> = AUTO_LIMITS,
): { failures: number; until: string | null; stopped: boolean } {
  const lastDone = jobs.filter((j) => j.status === "done").reduce<string>((a, j) => (j.reservedAt > a ? j.reservedAt : a), "");
  const fails = jobs.filter((j) => (j.status === "failed" || j.status === "uncertain" || j.status === "expired") && j.reservedAt > lastDone);
  if (fails.length === 0) return { failures: 0, until: null, stopped: false };
  if (fails.length >= l.maxFailures) return { failures: fails.length, until: null, stopped: true };
  const last = Math.max(...fails.map((j) => Date.parse(j.finishedAt ?? j.expiresAt)));
  const wait = l.retryWaitsSeconds[Math.min(fails.length, l.retryWaitsSeconds.length) - 1] * 1000;
  const until = last + wait;
  return { failures: fails.length, until: until > now ? new Date(until).toISOString() : null, stopped: false };
}

export type PrepareOutcome =
  | { kind: "saved"; jobId: string }
  | { kind: "ready" }
  | { kind: "busy"; jobId: string; expiresAt: string }
  | { kind: "uncertain_pending"; jobId: string }
  | { kind: "discarded"; jobId: string; reason: string }
  | { kind: "failed"; jobId: string; reason: "not_configured" | "provider" | "invalid"; charged: boolean }
  | { kind: "uncertain"; jobId: string }
  | { kind: "limit" }
  | { kind: "cap" }
  | { kind: "waiting"; until: string; failures: number }
  | { kind: "stopped"; failures: number };

/** Recorta la petición a lo que la reserva dice que falta. */
export function requestFor(full: TranslationRequest, needs: PrepareNeeds): TranslationRequest {
  return {
    lang: full.lang,
    text: needs.text ? full.text : null,
    area: needs.area ? full.area : null,
    features: full.features.filter((f) => needs.features.includes(f)),
    meta: needs.meta ? full.meta : null,
    names: full.names,
  };
}

/** Reserva (con los límites de 0228) → UNA llamada → guarda solo si la
 *  reserva sigue siendo suya y vigente. Nunca reintenta en bucle: un fallo
 *  queda registrado y la espera creciente decide cuándo otra visita puede
 *  volver a intentarlo. Ninguna petición pública espera a esto. */
export async function runPreparation(
  deps: { store: TranslationStore; ai: TrAiFn; timeoutMs?: number; isNotConfigured?: (e: unknown) => boolean; signal?: AbortSignal },
  input: { sourceId: string; request: TranslationRequest; needs: PrepareNeeds; manual?: boolean },
): Promise<PrepareOutcome> {
  const r = await deps.store.reserve({ sourceId: input.sourceId, lang: input.request.lang, needs: input.needs, manual: input.manual === true });
  if (r.state === "ready") return { kind: "ready" };
  if (r.state === "busy") return { kind: "busy", jobId: r.jobId, expiresAt: r.expiresAt };
  if (r.state === "uncertain") return { kind: "uncertain_pending", jobId: r.jobId };
  if (r.state === "limit") return { kind: "limit" };
  if (r.state === "cap") return { kind: "cap" };
  if (r.state === "waiting") return { kind: "waiting", until: r.until, failures: r.failures };
  if (r.state === "stopped") return { kind: "stopped", failures: r.failures };
  const req = requestFor(input.request, r.needs);
  if (requestIsEmpty(req)) {
    await deps.store.finish({ jobId: r.jobId, outcome: "failed", result: null, note: "nada que traducir" });
    return { kind: "ready" };
  }
  let raw: string;
  try {
    const signal = deps.signal
      ? AbortSignal.any([deps.signal, AbortSignal.timeout(deps.timeoutMs ?? TRANSLATION_TIMEOUT_MS)])
      : AbortSignal.timeout(deps.timeoutMs ?? TRANSLATION_TIMEOUT_MS);
    raw = await deps.ai({
      system: translationSystemPrompt(req.lang),
      userText: translationUserText(req),
      maxTokens: 8000,
      jsonSchema: TRANSLATION_SCHEMA as unknown as Record<string, unknown>,
      signal,
    });
  } catch (err) {
    const kind = classifyAiFailure(err, deps.isNotConfigured);
    if (kind === "uncertain") {
      await deps.store.finish({ jobId: r.jobId, outcome: "uncertain", result: null, note: "tiempo agotado o conexión cortada tras enviar (pudo cobrarse)" });
      return { kind: "uncertain", jobId: r.jobId };
    }
    const note = kind === "not_configured" ? "la IA no está configurada (no se llamó)" : `el proveedor respondió con un error: ${(err instanceof Error ? err.message : String(err)).slice(0, 160)}`;
    await deps.store.finish({ jobId: r.jobId, outcome: "failed", result: null, note });
    return { kind: "failed", jobId: r.jobId, reason: kind === "not_configured" ? "not_configured" : "provider", charged: false };
  }
  let result: TranslationResult;
  try {
    result = parseTranslation(raw, req);
  } catch (err) {
    const code = err instanceof TranslationParseError ? err.code : "json";
    await deps.store.finish({ jobId: r.jobId, outcome: "failed", result: null, note: `respuesta no válida (${code}); la llamada sí se hizo` });
    return { kind: "failed", jobId: r.jobId, reason: "invalid", charged: true };
  }
  const f = await deps.store.finish({ jobId: r.jobId, outcome: "done", result, note: null });
  if (f.state === "discarded") return { kind: "discarded", jobId: r.jobId, reason: f.reason };
  return { kind: "saved", jobId: r.jobId };
}

// ── Estado de cada vivienda en un idioma (gestor) ───────────────────────────

export interface LanguageProgress {
  lang: TargetLanguage;
  total: number;
  current: number;
  /** Todas las viviendas (y el catálogo) con traducción vigente. */
  complete: boolean;
}

export function languageProgress(lang: TargetLanguage, states: ItemTrState[], featuresMissing: number, metaCurrent: boolean): LanguageProgress {
  const current = states.filter((s) => s === "current").length;
  return { lang, total: states.length, current, complete: metaCurrent && featuresMissing === 0 && current === states.length };
}

export { translationErrorMessage } from "./translation-labels";
