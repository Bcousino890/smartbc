import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { snapshotLang, type CatalogLanguage } from "./i18n";
import type { InternalSnapshot } from "./to-public";
import type { FinishResult, PrepareNeeds, ReserveResult, TargetLanguage, TranslationResult } from "./translations";
import type {
  ActivationRequired,
  ApproveParts,
  PublishMode,
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
import { listClientLinks } from "./client-links";

// ============================================================================
// Traducciones del catálogo (PR6 + 0228 + 0230): el «backend» de la gestión sobre
// las funciones SQL de 0226/0228 (service_role, con la guarda del dueño en
// cada una). Lo usan las acciones del dueño y el traductor en segundo plano
// (auto-translate-instance.ts, con el dueño del catálogo como actor); la
// lectura pública nunca espera aquí. Nunca escribe en properties ni en
// property_client_descriptions.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

function raise(error: { message?: string } | null | undefined, fallback: string): never {
  throw new Error(error?.message || fallback);
}

function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

export function sqlTranslations(ownerId: string): TrBackend {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db().rpc(fn, { p_actor: ownerId, ...args });
    if (error) raise(error, fn);
    return data;
  };
  return {
    async esState(catalogId) {
      const d = await rpc("catalog_tr_es_state", { p_catalog: catalogId });
      return {
        version: Number(d.version),
        defaultLang: snapshotLang(d.default_lang),
        snapshot: d.snapshot as InternalSnapshot,
        map: ((d.map ?? []) as any[]).map((m) => ({ p: String(m.p), k: String(m.k), av: m.av ? String(m.av) : null, cv: m.cv ? String(m.cv) : null })),
      } satisfies EsState;
    },
    async links(catalogId) {
      const links = await listClientLinks(ownerId, catalogId);
      const { data, error } = await db().from("catalog_client_links").select("id, lang").eq("catalog_id", catalogId);
      if (error) raise(error, "catalog_client_links");
      const langs = new Map(((data ?? []) as any[]).map((r) => [String(r.id), r.lang ? snapshotLang(r.lang) : null]));
      return links.map((l) => ({ id: l.id, clientName: l.clientName, lang: langs.get(l.id) ?? null, state: l.state })) satisfies LinkRow[];
    },
    async copies(catalogId) {
      const [items, meta] = await Promise.all([
        db().from("catalog_tr_copies").select("property_id, lang, es_sig, features").eq("catalog_id", catalogId),
        db().from("catalog_tr_meta_copies").select("lang, es_sig, title, intro").eq("catalog_id", catalogId),
      ]);
      if (items.error) raise(items.error, "catalog_tr_copies");
      if (meta.error) raise(meta.error, "catalog_tr_meta_copies");
      return {
        items: ((items.data ?? []) as any[]).map((r) => ({ propertyId: String(r.property_id), lang: r.lang, esSig: r.es_sig, features: Array.isArray(r.features) ? r.features : [] })) satisfies CopyRow[],
        meta: ((meta.data ?? []) as any[]).map((r) => ({ lang: r.lang, esSig: r.es_sig, title: r.title, intro: r.intro ?? null })) satisfies MetaCopyRow[],
      };
    },
    async work(catalogId, lang, q) {
      const cols = "id, kind, property_id, copy_version_id, catalog_id, area_version_id, es_sig, es";
      const parts = await Promise.all([
        db().from("catalog_tr_sources").select(cols).eq("owner_id", ownerId).eq("catalog_id", catalogId),
        ...chunk(q.propertyIds, 50).map((ids) => db().from("catalog_tr_sources").select(cols).eq("owner_id", ownerId).eq("kind", "library").in("property_id", ids)),
        ...chunk(q.areaVersionIds, 50).map((ids) => db().from("catalog_tr_sources").select(cols).eq("owner_id", ownerId).eq("kind", "area").in("area_version_id", ids)),
      ]);
      const seen = new Map<string, SourceRow>();
      for (const p of parts) {
        if (p.error) raise(p.error, "catalog_tr_sources");
        for (const r of (p.data ?? []) as any[]) {
          seen.set(String(r.id), {
            id: String(r.id), kind: r.kind as SourceKind, propertyId: r.property_id ?? null, copyVersionId: r.copy_version_id ?? null,
            catalogId: r.catalog_id ?? null, areaVersionId: r.area_version_id ?? null, esSig: r.es_sig, es: r.es ?? {},
          });
        }
      }
      const sources = [...seen.values()];
      const ids = sources.map((s) => s.id);
      const texts: TextRow[] = [];
      const jobs: JobRow[] = [];
      for (const c of chunk(ids, 50)) {
        const [t, j] = await Promise.all([
          db().from("catalog_tr_texts").select("id, source_id, lang, status, content, rev, origin, approval, updated_at, reused_from").in("source_id", c).eq("lang", lang),
          db().from("catalog_tr_jobs").select("id, source_id, lang, status, reserved_at, expires_at, finished_at, discarded_at, note, auto").in("source_id", c).eq("lang", lang).order("reserved_at", { ascending: false }).limit(200),
        ]);
        if (t.error) raise(t.error, "catalog_tr_texts");
        if (j.error) raise(j.error, "catalog_tr_jobs");
        for (const r of (t.data ?? []) as any[]) texts.push({ id: String(r.id), sourceId: String(r.source_id), lang: r.lang, status: r.status, content: r.content ?? {}, rev: Number(r.rev), origin: r.origin, approval: r.approval ?? null, updatedAt: r.updated_at ?? null, reusedFrom: r.reused_from ?? null });
        for (const r of (j.data ?? []) as any[]) jobs.push({ id: String(r.id), sourceId: String(r.source_id), lang: r.lang, status: r.status, reservedAt: r.reserved_at, expiresAt: r.expires_at, finishedAt: r.finished_at ?? null, discardedAt: r.discarded_at ?? null, note: r.note ?? null, auto: r.auto === true });
      }
      const features: FeatureRow[] = [];
      for (const c of chunk(q.features, 40)) {
        const f = await db().from("catalog_tr_features").select("es, lang, tr, status, approval, origin").eq("owner_id", ownerId).eq("lang", lang).in("es", c);
        if (f.error) raise(f.error, "catalog_tr_features");
        for (const r of (f.data ?? []) as any[]) features.push({ es: r.es, lang: r.lang, tr: r.tr, status: r.status, approval: r.approval ?? null, origin: r.origin });
      }
      return { sources, texts, features, jobs };
    },
    async ensureSource(catalogId, propertyId, sig, es) {
      const d = await rpc("catalog_tr_source_ensure", { p_catalog: catalogId, p_property: propertyId, p_es_sig: sig, p_es: es });
      return { id: String(d.id), kind: d.kind as SourceKind };
    },
    async ensureAreaSource(areaVersionId, sig, es) {
      return String(await rpc("catalog_tr_area_source_ensure", { p_area_version: areaVersionId, p_es_sig: sig, p_es: es }));
    },
    async reuse(i) {
      const d = await rpc("catalog_tr_reuse", { p_source: i.sourceId, p_area: i.areaSourceId, p_lang: i.lang, p_features: i.features });
      return { text: d?.text === true, area: d?.area === true, features: Number(d?.features ?? 0) };
    },
    async reserve(i): Promise<ReserveResult> {
      const d = await rpc("catalog_tr_reserve_auto", {
        p_source: i.sourceId, p_lang: i.lang, p_catalog: i.catalogId, p_property: i.propertyId,
        p_needs: i.needs, p_ttl_seconds: i.ttlSeconds, p_limits: i.limits,
      });
      if (d.state === "reserved") {
        const n = d.needs ?? {};
        const needs: PrepareNeeds = { text: n.text === true, meta: n.meta === true, area: n.area ? String(n.area) : null, features: Array.isArray(n.features) ? n.features : [] };
        return { state: "reserved", jobId: String(d.job), expiresAt: String(d.expires_at), needs };
      }
      if (d.state === "busy") return { state: "busy", jobId: String(d.job), expiresAt: String(d.expires_at) };
      if (d.state === "uncertain") return { state: "uncertain", jobId: String(d.job) };
      if (d.state === "limit") return { state: "limit" };
      if (d.state === "cap") return { state: "cap" };
      if (d.state === "waiting") return { state: "waiting", until: String(d.until), failures: Number(d.failures) };
      if (d.state === "stopped") return { state: "stopped", failures: Number(d.failures) };
      return { state: "ready" };
    },
    async finish(i: { jobId: string; outcome: "done" | "failed" | "uncertain"; result: TranslationResult | null; note: string | null }): Promise<FinishResult> {
      const d = await rpc("catalog_tr_finish", { p_job: i.jobId, p_outcome: i.outcome, p_result: i.result ?? {}, p_note: i.note });
      if (d.state === "saved") return { state: "saved" };
      if (d.state === "recorded") return { state: "recorded" };
      return { state: "discarded", reason: String(d.reason ?? "") };
    },
    async saveText(textId, rev, content) {
      return Number(await rpc("catalog_tr_save", { p_text: textId, p_expected_rev: rev, p_content: content }));
    },
    async saveFeature(lang: TargetLanguage, es: string, tr: string) {
      await rpc("catalog_tr_feature_save", { p_lang: lang, p_es: es, p_tr: tr });
    },
    async publish(catalogId, propertyId, lang, sig, parts: ApproveParts, mode: PublishMode) {
      return Number(await rpc("catalog_tr_publish", { p_catalog: catalogId, p_property: propertyId, p_lang: lang, p_es_sig: sig, p_parts: parts, p_mode: mode }));
    },
    async markReviewed(catalogId, lang, textIds, features) {
      return Number(await rpc("catalog_tr_mark_reviewed", { p_catalog: catalogId, p_lang: lang, p_texts: textIds, p_features: features }));
    },
    async activate(catalogId, linkId, lang: CatalogLanguage | null, expectedVersion, required: ActivationRequired) {
      return Number(await rpc("catalog_tr_activate", { p_catalog: catalogId, p_link: linkId, p_lang: lang, p_expected_version: expectedVersion, p_required: required }));
    },
  };
}
