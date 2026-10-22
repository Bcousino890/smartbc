import type { CatalogLanguage } from "./i18n";
import type { InternalSnapshot } from "./to-public";
import { isTargetLanguage, type FinishResult, type PrepareNeeds, type ReserveResult, type TargetLanguage, type TranslationResult } from "./translations";
import { textBlocker } from "./text-rules";
import type {
  ActivationRequired,
  ApproveParts,
  CopyRow,
  EsState,
  FeatureRow,
  JobRow,
  LinkRow,
  MetaCopyRow,
  SourceKind,
  SourceRow,
  TextRow,
  TrBackend,
} from "./translation-service";

// ============================================================================
// Almacén EN MEMORIA de las traducciones (PR6) con las MISMAS reglas que las
// funciones SQL de 0226: reserva única por fuente e idioma con caducidad,
// resultado descartado si la reserva ya no es suya o caducó, incierto sin
// reintento salvo petición expresa, nunca pisa lo preparado o aprobado,
// claves de los bloques idénticas, aprobación con la revisión que se vio,
// copias por catálogo y activación solo con el idioma completo.
//
// Lo usan las pruebas puras (scripts/test-catalogs-translations.mts) y los
// fixtures de desarrollo (fixture-store.ts). En la app real manda SQL; las
// pruebas SQL (scripts/sql/test-catalog-translations.sql) comprueban allí las
// mismas reglas con concurrencia real.
// ============================================================================

export interface MemoryHooks {
  esState(catalogId: string): Promise<EsState> | EsState;
  links(catalogId: string): LinkRow[];
  /** Sube la versión del catálogo (como cada escritura de gestión). */
  bump(catalogId: string): number;
  version(catalogId: string): number;
  /** Cambia el idioma del catálogo (linkId null) o de un enlace. */
  setLang(catalogId: string, linkId: string | null, lang: CatalogLanguage | null): boolean;
  /** Si el texto publicado de esa vivienda en ese catálogo es exactamente una
   *  versión aprobada de la biblioteca, su id (fuente reutilizable). */
  libraryVersionOf?(catalogId: string, propertyId: string): string | null;
  now?(): number;
}

interface Job extends JobRow {
  catalogId: string | null;
  propertyId: string | null;
  needs: { text: boolean; meta: boolean; area: string | null; features: string[] };
}

interface Copy {
  catalogId: string;
  propertyId: string;
  lang: TargetLanguage;
  esSig: string;
  content: { t: string; b: Array<{ k: string; x: string }> };
  features: Array<[string, string]>;
}

interface MetaCopy {
  catalogId: string;
  lang: TargetLanguage;
  esSig: string;
  title: string;
  intro: string | null;
}

let seq = 0;
const uid = (p: string) => `${p}${String(++seq).padStart(6, "0")}-0000-4000-8000-${String(Date.now() % 1e12).padStart(12, "0")}`;

function keysMatch(tr: unknown, es: unknown): boolean {
  if (!Array.isArray(tr) || !Array.isArray(es) || tr.length !== es.length) return false;
  return tr.every((b, i) => b && typeof b.x === "string" && b.x.trim() && b.x.length <= 8000 && b.k === (es[i] as { k: string }).k);
}

function blockerOf(c: { t?: string | null; i?: string | null; b?: Array<{ x: string }> }): string | null {
  return textBlocker(c.t ?? null) ?? textBlocker(c.i ?? null) ?? (c.b ?? []).map((b) => textBlocker(b.x)).find((x) => x) ?? null;
}

export class MemoryTranslations implements TrBackend {
  sources: SourceRow[] = [];
  texts: TextRow[] = [];
  features: FeatureRow[] = [];
  jobs: Job[] = [];
  itemCopies: Copy[] = [];
  metaCopies: MetaCopy[] = [];
  readonly hooks: MemoryHooks;
  constructor(hooks: MemoryHooks) {
    this.hooks = hooks;
  }

  private now(): number {
    return this.hooks.now ? this.hooks.now() : Date.now();
  }
  private iso(ms: number): string {
    return new Date(ms).toISOString();
  }

  // ── Lecturas ──
  async esState(catalogId: string): Promise<EsState> {
    return this.hooks.esState(catalogId);
  }
  async links(catalogId: string): Promise<LinkRow[]> {
    return this.hooks.links(catalogId);
  }
  async copies(catalogId: string): Promise<{ items: CopyRow[]; meta: MetaCopyRow[] }> {
    return {
      items: this.itemCopies.filter((c) => c.catalogId === catalogId).map((c) => ({ propertyId: c.propertyId, lang: c.lang, esSig: c.esSig, features: c.features })),
      meta: this.metaCopies.filter((m) => m.catalogId === catalogId).map((m) => ({ lang: m.lang, esSig: m.esSig, title: m.title, intro: m.intro })),
    };
  }
  async work(catalogId: string, lang: TargetLanguage, q: { propertyIds: string[]; areaVersionIds: string[]; features: string[] }) {
    const sources = this.sources.filter(
      (s) =>
        (s.kind === "meta" && s.catalogId === catalogId) ||
        (s.kind === "catalog" && s.catalogId === catalogId) ||
        (s.kind === "library" && s.propertyId !== null && q.propertyIds.includes(s.propertyId)) ||
        (s.kind === "area" && s.areaVersionId !== null && q.areaVersionIds.includes(s.areaVersionId)),
    );
    const ids = new Set(sources.map((s) => s.id));
    return {
      sources,
      texts: this.texts.filter((t) => ids.has(t.sourceId) && t.lang === lang),
      features: this.features.filter((f) => f.lang === lang && q.features.includes(f.es)),
      jobs: this.jobs.filter((j) => ids.has(j.sourceId) && j.lang === lang),
    };
  }

  // ── Fuentes ──
  async ensureSource(catalogId: string, propertyId: string | null, sig: string, es: object): Promise<{ id: string; kind: SourceKind }> {
    const lib = propertyId ? this.hooks.libraryVersionOf?.(catalogId, propertyId) ?? null : null;
    const kind: SourceKind = propertyId === null ? "meta" : lib ? "library" : "catalog";
    const found = this.sources.find(
      (s) => s.kind === kind && s.esSig === sig && s.propertyId === propertyId && (kind === "library" ? s.copyVersionId === lib : s.catalogId === catalogId),
    );
    if (found) return { id: found.id, kind };
    const row: SourceRow = {
      id: uid("a"), kind, propertyId, copyVersionId: kind === "library" ? lib : null, catalogId: kind === "library" ? null : catalogId,
      areaVersionId: null, esSig: sig, es: es as SourceRow["es"],
    };
    this.sources.push(row);
    return { id: row.id, kind };
  }
  async ensureAreaSource(areaVersionId: string, sig: string, es: object): Promise<string> {
    const found = this.sources.find((s) => s.kind === "area" && s.areaVersionId === areaVersionId && s.esSig === sig);
    if (found) return found.id;
    const row: SourceRow = { id: uid("b"), kind: "area", propertyId: null, copyVersionId: null, catalogId: null, areaVersionId, esSig: sig, es: es as SourceRow["es"] };
    this.sources.push(row);
    return row.id;
  }

  // ── Preparación ──
  async reserve(i: { sourceId: string; lang: TargetLanguage; catalogId: string; propertyId: string | null; needs: PrepareNeeds; ttlSeconds: number; retry: boolean }): Promise<ReserveResult> {
    if (!isTargetLanguage(i.lang)) throw new Error("invalid_lang");
    if (i.ttlSeconds < 30 || i.ttlSeconds > 900) throw new Error("invalid_ttl");
    const src = this.sources.find((s) => s.id === i.sourceId);
    if (!src) throw new Error("source_not_found");
    const now = this.now();
    for (const j of this.jobs) {
      if (j.sourceId === i.sourceId && j.lang === i.lang && j.status === "reserved" && Date.parse(j.expiresAt) <= now) {
        j.status = "expired";
        j.finishedAt = this.iso(now);
        j.note = [j.note, "reserva caducada sin resultado"].filter(Boolean).join(" · ");
      }
    }
    const active = this.jobs.find((j) => j.sourceId === i.sourceId && j.lang === i.lang && j.status === "reserved");
    if (active) return { state: "busy", jobId: active.id, expiresAt: active.expiresAt };
    const self = (i.needs.text || i.needs.meta) && src.kind !== "area" && !this.texts.some((t) => t.sourceId === i.sourceId && t.lang === i.lang && t.status !== "rejected");
    let area = i.needs.area;
    if (area) {
      if (!this.sources.some((s) => s.id === area && s.kind === "area")) throw new Error("source_not_found");
      if (this.texts.some((t) => t.sourceId === area && t.lang === i.lang && t.status !== "rejected")) area = null;
    }
    const features = [...new Set(i.needs.features)].filter((f) => f.trim() && f.length <= 200 && !this.features.some((r) => r.es === f && r.lang === i.lang && r.status !== "rejected"));
    if (!self && !area && features.length === 0) return { state: "ready" };
    const last = this.jobs.filter((j) => j.sourceId === i.sourceId && j.lang === i.lang).sort((a, b) => b.reservedAt.localeCompare(a.reservedAt))[0];
    if (last && last.status === "uncertain" && !i.retry) return { state: "uncertain", jobId: last.id };
    const job: Job = {
      id: uid("c"), sourceId: i.sourceId, lang: i.lang, status: "reserved", reservedAt: this.iso(now), expiresAt: this.iso(now + i.ttlSeconds * 1000),
      finishedAt: null, discardedAt: null, note: null, catalogId: i.catalogId, propertyId: i.propertyId,
      needs: { text: self && src.kind !== "meta", meta: self && src.kind === "meta", area, features },
    };
    this.jobs.push(job);
    return { state: "reserved", jobId: job.id, expiresAt: job.expiresAt, needs: job.needs };
  }

  async cancel(jobId: string): Promise<boolean> {
    const j = this.jobs.find((x) => x.id === jobId);
    if (!j) throw new Error("job_not_found");
    if (j.status !== "reserved") return false;
    j.status = "cancelled";
    j.finishedAt = this.iso(this.now());
    j.note = [j.note, "cancelada por el dueño"].filter(Boolean).join(" · ");
    return true;
  }

  private putText(sourceId: string, lang: TargetLanguage, content: TextRow["content"], jobId: string): void {
    const prev = this.texts.find((t) => t.sourceId === sourceId && t.lang === lang);
    if (prev && prev.status !== "rejected") return;
    if (prev) Object.assign(prev, { status: "draft", content, rev: prev.rev + 1, origin: "ai", updatedAt: this.iso(this.now()) });
    else this.texts.push({ id: uid("d"), sourceId, lang, status: "draft", content, rev: 1, origin: "ai", updatedAt: this.iso(this.now()) });
    void jobId;
  }

  async finish(i: { jobId: string; outcome: "done" | "failed" | "uncertain"; result: TranslationResult | null; note: string | null }): Promise<FinishResult> {
    const j = this.jobs.find((x) => x.id === i.jobId);
    if (!j) throw new Error("job_not_found");
    const now = this.now();
    if (j.status !== "reserved") {
      j.discardedAt = this.iso(now);
      j.note = [j.note, `resultado (${i.outcome}) descartado: la reserva ya estaba ${j.status}`].filter(Boolean).join(" · ");
      return { state: "discarded", reason: j.status };
    }
    if (Date.parse(j.expiresAt) <= now) {
      Object.assign(j, { status: "expired", finishedAt: this.iso(now), discardedAt: this.iso(now) });
      j.note = [j.note, `reserva caducada: resultado (${i.outcome}) descartado`].filter(Boolean).join(" · ");
      return { state: "discarded", reason: "expired" };
    }
    if (i.outcome !== "done") {
      Object.assign(j, { status: i.outcome, finishedAt: this.iso(now), note: i.note });
      return { state: "recorded" };
    }
    const src = this.sources.find((s) => s.id === j.sourceId)!;
    const r = i.result ?? {};
    if (j.needs.text) {
      if (!r.text || !r.text.t?.trim() || r.text.t.length > 200 || !keysMatch(r.text.b, src.es.b)) throw new Error("translation_keys");
      this.putText(j.sourceId, j.lang, { t: r.text.t.trim(), b: r.text.b }, j.id);
    }
    if (j.needs.meta) {
      if (!r.meta || !r.meta.t?.trim()) throw new Error("translation_keys");
      this.putText(j.sourceId, j.lang, { t: r.meta.t.trim(), i: r.meta.i?.trim() || null }, j.id);
    }
    if (j.needs.area && r.area?.trim()) this.putText(j.needs.area, j.lang, { b: [{ k: "barrio", x: r.area.trim() }] }, j.id);
    for (const f of r.features ?? []) {
      if (!j.needs.features.includes(f.es) || !f.tr?.trim() || f.tr.length > 200) continue;
      const prev = this.features.find((x) => x.es === f.es && x.lang === j.lang);
      if (prev && prev.status !== "rejected") continue;
      if (prev) Object.assign(prev, { tr: f.tr.trim(), status: "draft" });
      else this.features.push({ es: f.es, lang: j.lang, tr: f.tr.trim(), status: "draft" });
    }
    Object.assign(j, { status: "done", finishedAt: this.iso(now), note: i.note });
    return { state: "saved" };
  }

  // ── Revisión ──
  async saveText(textId: string, rev: number, content: object): Promise<number> {
    const t = this.texts.find((x) => x.id === textId);
    if (!t) throw new Error("translation_not_found");
    if (t.rev !== rev) throw new Error("translation_changed");
    const src = this.sources.find((s) => s.id === t.sourceId)!;
    const c = content as TextRow["content"];
    if (src.kind === "meta") {
      if (!c.t?.trim()) throw new Error("translation_keys");
    } else {
      if (!keysMatch(c.b, src.es.b)) throw new Error("translation_keys");
      if (src.kind !== "area" && !c.t?.trim()) throw new Error("translation_keys");
    }
    const b = blockerOf(c);
    if (b) throw new Error(b);
    Object.assign(t, { content: src.kind === "area" ? { b: c.b } : c, rev: t.rev + 1, status: "draft", origin: "manual", updatedAt: this.iso(this.now()) });
    return t.rev;
  }
  async saveFeature(lang: TargetLanguage, es: string, tr: string): Promise<void> {
    if (!es.trim() || !tr.trim() || es.length > 200 || tr.length > 200) throw new Error("invalid_text");
    const b = textBlocker(tr);
    if (b) throw new Error(b);
    const prev = this.features.find((f) => f.es === es && f.lang === lang);
    if (prev) Object.assign(prev, { tr: tr.trim(), status: "draft" });
    else this.features.push({ es, lang, tr: tr.trim(), status: "draft" });
  }
  async reject(textId: string): Promise<boolean> {
    const t = this.texts.find((x) => x.id === textId);
    if (!t) throw new Error("translation_not_found");
    if (t.status !== "draft") return false;
    t.status = "rejected";
    return true;
  }

  private textFor(catalogId: string, propertyId: string | null, lang: TargetLanguage, textId: string): TextRow | null {
    const t = this.texts.find((x) => x.id === textId && x.lang === lang);
    if (!t) return null;
    const s = this.sources.find((x) => x.id === t.sourceId);
    if (!s) return null;
    const ok = propertyId === null
      ? s.kind === "meta" && s.catalogId === catalogId
      : (s.kind === "catalog" && s.catalogId === catalogId && s.propertyId === propertyId) ||
        (s.kind === "library" && s.propertyId === propertyId && s.copyVersionId === (this.hooks.libraryVersionOf?.(catalogId, propertyId) ?? null));
    return ok ? t : null;
  }

  async approve(catalogId: string, propertyId: string | null, lang: TargetLanguage, sig: string, parts: ApproveParts): Promise<number> {
    const t = this.textFor(catalogId, propertyId, lang, parts.text.id);
    if (!t) throw new Error("translation_not_found");
    if (t.status === "rejected" || t.rev !== parts.text.rev) throw new Error("translation_changed");
    const b = blockerOf(t.content);
    if (b) throw new Error(b);
    let area: TextRow | null = null;
    if (parts.area) {
      area = this.texts.find((x) => x.id === parts.area!.id && x.lang === lang) ?? null;
      if (!area || this.sources.find((s) => s.id === area!.sourceId)?.kind !== "area") throw new Error("translation_not_found");
      if (area.status === "rejected" || area.rev !== parts.area.rev) throw new Error("translation_changed");
      const ab = blockerOf(area.content);
      if (ab) throw new Error(ab);
    }
    for (const f of parts.features) {
      const row = this.features.find((x) => x.es === f.es && x.lang === lang);
      if (!row || row.status === "rejected" || row.tr !== f.tr) throw new Error("translation_changed");
      const fb = textBlocker(row.tr);
      if (fb) throw new Error(fb);
    }
    t.status = "approved";
    if (area) area.status = "approved";
    for (const f of parts.features) this.features.find((x) => x.es === f.es && x.lang === lang)!.status = "approved";
    return this.copySet(catalogId, propertyId, lang, sig, t.id, area?.id ?? null, parts.list);
  }

  async copySet(catalogId: string, propertyId: string | null, lang: TargetLanguage, sig: string, textId: string, areaTextId: string | null, features: string[]): Promise<number> {
    const t = this.textFor(catalogId, propertyId, lang, textId);
    if (!t) throw new Error("translation_not_found");
    if (t.status !== "approved") throw new Error("translation_not_approved");
    const src = this.sources.find((s) => s.id === t.sourceId)!;
    let changed = false;
    if (propertyId === null) {
      if (src.esSig !== sig) throw new Error("translation_changed");
      const next: MetaCopy = { catalogId, lang, esSig: sig, title: t.content.t ?? "", intro: t.content.i ?? null };
      const prev = this.metaCopies.find((m) => m.catalogId === catalogId && m.lang === lang);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
        this.metaCopies = this.metaCopies.filter((m) => m !== prev);
        this.metaCopies.push(next);
        changed = true;
      }
    } else {
      let areaRow: TextRow | null = null;
      if (areaTextId) {
        areaRow = this.texts.find((x) => x.id === areaTextId && x.lang === lang) ?? null;
        if (!areaRow) throw new Error("translation_not_found");
        if (areaRow.status !== "approved") throw new Error("translation_not_approved");
      } else if (src.esSig !== sig) {
        throw new Error("translation_changed");
      }
      const content = { t: t.content.t ?? "", b: [...(t.content.b ?? []), ...(areaRow ? [{ k: "barrio", x: areaRow.content.b?.[0]?.x ?? "" }] : [])] };
      const pairs = features
        .map((es) => this.features.find((f) => f.es === es && f.lang === lang && f.status === "approved"))
        .filter((f): f is FeatureRow => !!f)
        .map((f) => [f.es, f.tr] as [string, string]);
      const next: Copy = { catalogId, propertyId, lang, esSig: sig, content, features: pairs };
      const prev = this.itemCopies.find((c) => c.catalogId === catalogId && c.propertyId === propertyId && c.lang === lang);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
        this.itemCopies = this.itemCopies.filter((c) => c !== prev);
        this.itemCopies.push(next);
        changed = true;
      }
    }
    return changed ? this.hooks.bump(catalogId) : this.hooks.version(catalogId);
  }

  async copyRemove(catalogId: string, propertyId: string | null, lang: TargetLanguage): Promise<number> {
    const before = this.itemCopies.length + this.metaCopies.length;
    if (propertyId === null) this.metaCopies = this.metaCopies.filter((m) => !(m.catalogId === catalogId && m.lang === lang));
    else this.itemCopies = this.itemCopies.filter((c) => !(c.catalogId === catalogId && c.propertyId === propertyId && c.lang === lang));
    return this.itemCopies.length + this.metaCopies.length !== before ? this.hooks.bump(catalogId) : this.hooks.version(catalogId);
  }

  async activate(catalogId: string, linkId: string | null, lang: CatalogLanguage | null, expectedVersion: number, required: ActivationRequired): Promise<number> {
    if (linkId === null && lang === null) throw new Error("invalid_lang");
    if (lang !== null && lang !== "es" && !isTargetLanguage(lang)) throw new Error("invalid_lang");
    if (lang !== null && lang !== "es") {
      if (this.hooks.version(catalogId) !== expectedVersion) throw new Error("catalog_changed");
      const es = await this.hooks.esState(catalogId);
      const ids = es.map.map((m) => m.p);
      if (ids.some((p) => !required.items.some((r) => r.p === p))) throw new Error("lang_incomplete");
      for (const r of required.items) {
        const c = this.itemCopies.find((x) => x.catalogId === catalogId && x.propertyId === r.p && x.lang === lang);
        if (!c || c.esSig !== r.s || r.f.some((f) => !c.features.some((p) => p[0] === f))) throw new Error("lang_incomplete");
      }
      if (!this.metaCopies.some((m) => m.catalogId === catalogId && m.lang === lang && m.esSig === required.meta)) throw new Error("lang_incomplete");
    }
    if (this.hooks.setLang(catalogId, linkId, lang)) return this.hooks.bump(catalogId);
    return this.hooks.version(catalogId);
  }

  /** Como catalog_lang_snapshot (0226): fuera del español, la copia de cada
   *  vivienda («tr») y la del catálogo («trm»). En español, intacta. */
  mergeSnapshot(catalogId: string, map: Array<{ p: string; k: string }>, snap: InternalSnapshot, lang: CatalogLanguage): InternalSnapshot {
    if (lang === "es") return snap;
    const byKey = new Map(map.map((m) => [m.k, m.p]));
    const anyCopy = this.itemCopies.some((c) => c.catalogId === catalogId && c.lang === lang);
    const items = anyCopy
      ? snap.items.map((it) => {
          const p = byKey.get(String(it.key));
          const c = p ? this.itemCopies.find((x) => x.catalogId === catalogId && x.propertyId === p && x.lang === lang) : null;
          return c ? { ...it, tr: { s: c.esSig, t: c.content.t, b: c.content.b, f: c.features } } : it;
        })
      : snap.items;
    const m = this.metaCopies.find((x) => x.catalogId === catalogId && x.lang === lang);
    return { ...snap, items, ...(m ? { trm: { s: m.esSig, t: m.title, i: m.intro } } : {}) };
  }
}
