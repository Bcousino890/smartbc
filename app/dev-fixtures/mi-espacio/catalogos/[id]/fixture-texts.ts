// SOLO DESARROLLO LOCAL (BCP-01 C2, E7): textos del catálogo en memoria para
// revisar el editor sin base de datos ni IA real. La «IA» es falsa y tarda un
// poco (para probar «Cancelar» y que una respuesta tardía no pise lo editado);
// la comprobación es la REAL (ai-draft.ts → checkDraft, pura).
import type { TextActions } from "@/components/admin/catalogs/catalog-texts-panel";
import { checkDraft, pendingWarnings, type DraftSource } from "@/lib/catalogs/ai-draft";
import type { CatalogTextView } from "@/lib/catalogs/texts";
import { organizeDescription, paragraphsOf } from "@/lib/catalogs/structure";
import { copyErrorMessage, type CopyLibraryView } from "@/lib/catalogs/copy-rules";
import { sentences } from "@/lib/catalogs/text-rules";
import type { CatalogItemView } from "@/lib/catalogs/types";

/** 0219 · Versión de la biblioteca (en memoria, mismas reglas que SQL). */
interface LibVersion {
  seq: number;
  title: string | null;
  titleFrom: string | null;
  body: string | null;
  lead: string | null;
  /** Versión de la «fuente» cuando se aprobó la descripción (C2). */
  bodySourceRev: number | null;
  bodyFrom: string | null;
}

interface Stored {
  draft: { title: string | null; body: string | null; lead: string | null; highlights: string[]; rev: number; origin: string };
  published: { title: string | null; body: string | null; lead: string | null; highlights: string[]; at: string; sourceAtPublish: number } | null;
}

/** Fuente sintética por vivienda: texto, versión limpia, historia y características. */
function sourceOf(it: CatalogItemView, i: number) {
  const kind = i % 3;
  return {
    hasText: kind !== 2,
    clean: kind === 0 ? ("current" as const) : kind === 1 ? ("stale" as const) : ("empty" as const),
    story: i === 1 ? ("pending" as const) : ("none" as const),
    description: kind === 2 ? null : `${it.title}. Vivienda exterior y luminosa, con salón amplio y cocina independiente.`,
    features: ["Ascensor", "Terraza", "Calefacción central"].slice(0, 1 + (i % 3)),
  };
}

export function createFixtureTexts(opts: {
  items: () => CatalogItemView[];
  live: (body: Record<string, unknown> & { skipNotify?: boolean }) => Promise<{ ok: true; version: number; fingerprint: string | null; publicChange: boolean }>;
  unchanged: () => Promise<{ ok: true; version: number; fingerprint: string | null; publicChange: boolean }>;
  onChange: () => void;
}) {
  const store = new Map<string, Stored>();
  /** Versión de la «fuente» de cada vivienda (para simular «la ficha cambió»). */
  const sourceRev = new Map<string, number>();

  const draftSource = (it: CatalogItemView, i: number): DraftSource => {
    const s = sourceOf(it, i);
    return {
      title: it.title, operation: it.operation, place: it.zone, bedrooms: it.bedrooms, bathrooms: it.bathrooms, squareMeters: it.squareMeters,
      floor: null, features: s.features, cleanDescription: s.clean === "current" ? s.description : null,
    };
  };
  const find = (propertyId: string) => {
    const items = opts.items();
    const i = items.findIndex((x) => x.propertyId === propertyId);
    return i >= 0 ? { it: items[i], i } : null;
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const views = (): CatalogTextView[] => {
    const items = opts.items();
    const list = items.map((it, i) => ({ it, i, inList: true }));
    for (const [pid] of store) if (!items.some((x) => x.propertyId === pid)) list.push({ it: reserved.get(pid)!, i: 0, inList: false });
    return list.filter((x) => x.it).map(({ it, i, inList }) => {
      const s = sourceOf(it, i);
      const st = store.get(it.propertyId);
      const hasPubText = !!st?.published && !!(st.published.body || st.published.lead);
      const current = !!st?.published && (!hasPubText || st.published.sourceAtPublish === (sourceRev.get(it.propertyId) ?? 0));
      return {
        propertyId: it.propertyId, slug: it.slug, title: it.title, bcReference: it.bcReference, area: it.zone, inList,
        level: current && hasPubText ? "text" : s.clean === "current" ? "clean" : "facts",
        source: { hasText: s.hasText, clean: s.clean, story: s.story },
        draft: st ? { ...st.draft, updatedAt: null } : null,
        published: st?.published ? { title: st.published.title, body: st.published.body, lead: st.published.lead, highlights: st.published.highlights, at: st.published.at, current, changed: current ? [] : ["los dormitorios"] } : null,
        candidates: s.features,
        library: libView(it.propertyId),
      };
    });
  };
  /** Viviendas que salieron de la lista con texto guardado (reserva). */
  const reserved = new Map<string, CatalogItemView>();
  const remember = () => {
    for (const it of opts.items()) reserved.set(it.propertyId, it);
  };

  // ── 0219 · Biblioteca de textos aprobados (en memoria) ──────────────────
  const library = new Map<string, LibVersion>();
  const libView = (pid: string): CopyLibraryView | null => {
    const v = library.get(pid);
    if (!v || (!v.title && !v.body && !v.lead)) return null;
    const hasBody = !!(v.body || v.lead);
    const current = hasBody ? v.bodySourceRev === (sourceRev.get(pid) ?? 0) : null;
    return {
      versionId: `fx-${pid}-${v.seq}`, seq: v.seq, title: v.title, body: v.body, lead: v.lead,
      bodyCurrent: current, changed: current === false ? ["bedrooms"] : [],
      titleApprovedAt: null, bodyApprovedAt: null, titleCatalogTitle: v.titleFrom, bodyCatalogTitle: v.bodyFrom,
    };
  };
  const same = (a: LibVersion | undefined, b: LibVersion) =>
    !!a && a.title === b.title && a.body === b.body && a.lead === b.lead && a.bodySourceRev === b.bodySourceRev;
  /** Solo pruebas: una versión aprobada «desde otro catálogo». */
  const seedLibrary = (pid: string, title: string | null, body: string | null, from: string) => {
    library.set(pid, { seq: 1, title, titleFrom: title ? from : null, body, lead: null, bodySourceRev: body ? sourceRev.get(pid) ?? 0 : null, bodyFrom: body ? from : null });
  };
  /** Como catalog_add_property (0219): solo una entrada SIN texto recibe la versión aprobada. */
  const reuseOnAdd = async (pid: string, it: CatalogItemView | undefined) => {
    if (store.has(pid)) return;
    const v = library.get(pid);
    if (!v || (!v.title && !v.body && !v.lead)) return;
    if (it) reserved.set(pid, it);
    store.set(pid, {
      draft: { title: v.title, body: v.body, lead: v.lead, highlights: [], rev: 1, origin: "manual" },
      published: v.title || v.body || v.lead ? { title: v.title, body: v.body, lead: v.lead, highlights: [], at: new Date().toISOString(), sourceAtPublish: v.bodySourceRev ?? sourceRev.get(pid) ?? 0 } : null,
    });
    opts.onChange();
    const i = opts.items().findIndex((x) => x.propertyId === pid);
    const current = (v.bodySourceRev ?? -1) === (sourceRev.get(pid) ?? 0);
    await opts.live({ op: "text", index: Math.max(0, i), body: current ? v.body : null, lead: current ? v.lead : null, itemTitle: v.title, skipNotify: true });
  };

  const actions: TextActions = {
    prepare: async ({ propertyId }) => {
      const f = find(propertyId) ?? { it: reserved.get(propertyId)!, i: 0 };
      await wait(Number((globalThis as { __fxAiDelay?: number }).__fxAiDelay ?? 700));
      const s = sourceOf(f.it, f.i);
      if (!s.hasText) return { ok: false as const, error: "La ficha no tiene texto que preparar. Escríbelo a mano o pide un borrador con IA a partir de los datos." };
      const proposal = { body: `${s.description} Los dormitorios dan a un patio tranquilo.`, lead: null, origin: "ai_clean" as const };
      return { ok: true as const, proposal, check: checkDraft({ body: proposal.body, lead: null, highlights: [] }, draftSource(f.it, f.i)) };
    },
    draft: async ({ propertyId }) => {
      const f = find(propertyId) ?? { it: reserved.get(propertyId)!, i: 0 };
      await wait(Number((globalThis as { __fxAiDelay?: number }).__fxAiDelay ?? 700));
      const proposal = {
        title: `${f.it.title.split(",")[0]} con luz natural`,
        lead: null,
        body: `${f.it.title}: luz y calma.\n\nUna vivienda de ${f.it.squareMeters ?? "—"} m² con ${f.it.bedrooms ?? "—"} dormitorios. Tiene piscina comunitaria.`,
        origin: "ai_draft" as const,
      };
      return { ok: true as const, proposal, check: checkDraft({ title: proposal.title, body: proposal.body, lead: null, highlights: [] }, draftSource(f.it, f.i)) };
    },
    save: async ({ propertyId, title, body, lead, highlights, origin, expectedRev, skipNotify }) => {
      void skipNotify;
      const st = store.get(propertyId);
      if (expectedRev !== null && (st?.draft.rev ?? 0) !== expectedRev) {
        return { ok: false as const, error: "El borrador ha cambiado desde que lo abriste (en otra pestaña o con otra acción). Recarga la página antes de guardar o publicar." };
      }
      remember();
      const rev = (st?.draft.rev ?? 0) + 1;
      const t = (title ?? "").replace(/\s+/g, " ").trim() || null;
      store.set(propertyId, { draft: { title: t, body, lead, highlights, rev, origin: origin ?? "manual" }, published: st?.published ?? null });
      const f = find(propertyId) ?? { it: reserved.get(propertyId)!, i: 0 };
      opts.onChange();
      const r = await opts.unchanged();
      return { ...r, rev, check: checkDraft({ title: t, body, lead, highlights }, draftSource(f.it, f.i)) };
    },
    publish: async ({ propertyId, expectedRev, confirmed, skipNotify }) => {
      const st = store.get(propertyId);
      if (!st) return { ok: false as const, error: "Esa vivienda no tiene texto guardado en este catálogo." };
      if (st.draft.rev !== expectedRev) return { ok: false as const, error: "El borrador ha cambiado desde que lo abriste (en otra pestaña o con otra acción). Recarga la página antes de guardar o publicar." };
      const f = find(propertyId) ?? { it: reserved.get(propertyId)!, i: 0 };
      const check = checkDraft(st.draft, draftSource(f.it, f.i));
      if (check.blockers.length) return { ok: false as const, error: check.blockers[0].code === "text_has_price" ? "El texto menciona un precio. El precio ya se ve aparte y se actualiza solo: quítalo del texto." : "El texto tiene un teléfono, un correo o una web. Quítalo antes de publicar." };
      if (pendingWarnings(check, confirmed).length) return { ok: false as const, error: "Hay avisos sin revisar: corrige el texto o confirma cada aviso antes de publicar." };
      if (!st.draft.title && !st.draft.body && !st.draft.lead) return { ok: false as const, error: "Escribe un título o una descripción antes de publicar." };
      store.set(propertyId, { ...st, published: { title: st.draft.title, body: st.draft.body, lead: st.draft.lead, highlights: st.draft.highlights, at: new Date().toISOString(), sourceAtPublish: sourceRev.get(propertyId) ?? 0 } });
      opts.onChange();
      return opts.live({ op: "text", index: Math.max(0, find(propertyId)?.i ?? 0), body: st.draft.body, lead: st.draft.lead, itemTitle: st.draft.title, skipNotify });
    },
    withdraw: async ({ propertyId, skipNotify }) => {
      const st = store.get(propertyId);
      if (!st?.published) return { ok: false as const, error: "Ese texto no estaba publicado." };
      store.set(propertyId, { ...st, published: null });
      opts.onChange();
      return opts.live({ op: "text", index: Math.max(0, find(propertyId)?.i ?? 0), body: null, lead: null, itemTitle: null, skipNotify });
    },
    remove: async ({ propertyId, skipNotify }) => {
      if (!store.has(propertyId)) return { ok: false as const, error: "Esa vivienda no tiene texto guardado en este catálogo." };
      const had = !!store.get(propertyId)?.published;
      store.delete(propertyId);
      opts.onChange();
      return had ? opts.live({ op: "text", index: Math.max(0, find(propertyId)?.i ?? 0), body: null, lead: null, itemTitle: null, skipNotify }) : opts.unchanged();
    },
    preview: async ({ propertyId, title, body, lead, highlights }) => {
      const f = find(propertyId) ?? { it: reserved.get(propertyId)!, i: 0 };
      const all = sentences(body ?? "");
      const ownLead = (lead ?? "").trim() || null;
      const restSentences = ownLead ? all : all.slice(1);
      const sections = restSentences.length ? [{ heading: null, text: restSentences.join(" "), photo: !!f.it.photoUrl }] : [];
      const organized = organizeDescription({ lead: ownLead && !(body ?? "").includes(ownLead) ? ownLead : null, paragraphs: paragraphsOf(body), area: f.it.zone });
      return {
        ok: true as const,
        preview: { lead: ownLead ?? all[0] ?? null, highlights: highlights.length ? highlights : sourceOf(f.it, f.i).features.slice(0, 3), sections, words: (body ?? "").split(/\s+/).filter(Boolean).length, copy: organized.copy, missing: organized.missing },
        check: checkDraft({ title: title ?? null, body, lead, highlights }, draftSource(f.it, f.i)),
      };
    },
    approveCopy: async ({ propertyId, parts }) => {
      const st = store.get(propertyId);
      const pub = st?.published;
      if (!pub) return { ok: false as const, error: copyErrorMessage("text_not_found")! };
      const wantT = parts === "title" || parts === "both";
      const wantB = parts === "body" || parts === "both";
      if (wantT && !pub.title) return { ok: false as const, error: copyErrorMessage("title_not_published")! };
      if (wantB && !pub.body && !pub.lead) return { ok: false as const, error: copyErrorMessage("body_not_published")! };
      if (wantB && pub.sourceAtPublish !== (sourceRev.get(propertyId) ?? 0)) return { ok: false as const, error: copyErrorMessage("text_stale")! };
      const prev = library.get(propertyId);
      const next: LibVersion = {
        seq: (prev?.seq ?? 0) + 1,
        title: wantT ? pub.title : prev?.title ?? null,
        titleFrom: wantT ? "este catálogo" : prev?.titleFrom ?? null,
        body: wantB ? pub.body : prev?.body ?? null,
        lead: wantB ? pub.lead : prev?.lead ?? null,
        bodySourceRev: wantB ? pub.sourceAtPublish : prev?.bodySourceRev ?? null,
        bodyFrom: wantB ? "este catálogo" : prev?.bodyFrom ?? null,
      };
      if (same(prev, next)) return { ok: true as const, version: 1, status: "unchanged" as const, seq: prev!.seq, publicChange: false as const };
      library.set(propertyId, next);
      opts.onChange();
      return { ok: true as const, version: 1, status: "created" as const, seq: next.seq, publicChange: false as const };
    },
    withdrawCopy: async ({ propertyId, part }) => {
      const prev = library.get(propertyId);
      if (!prev) return { ok: false as const, error: copyErrorMessage("copy_not_found")! };
      const t = part === "title" || part === "all";
      const b = part === "body" || part === "all";
      const next: LibVersion = {
        ...prev,
        seq: prev.seq + 1,
        ...(t ? { title: null, titleFrom: null } : {}),
        ...(b ? { body: null, lead: null, bodySourceRev: null, bodyFrom: null } : {}),
      };
      if (same(prev, next)) return { ok: true as const, version: 1, status: "unchanged" as const, seq: prev.seq, publicChange: false as const };
      library.set(propertyId, next);
      opts.onChange();
      return { ok: true as const, version: 1, status: "created" as const, seq: next.seq, publicChange: false as const };
    },
  };

  /** Solo pruebas: simula que la ficha cambió (el publicado deja de valer). */
  const changeSource = (propertyId: string) => sourceRev.set(propertyId, (sourceRev.get(propertyId) ?? 0) + 1);
  /** E2 · solo pruebas: otro guardado del borrador (sube la revisión). */
  const externalSave = (propertyId: string, body: string) => {
    remember();
    const st = store.get(propertyId);
    store.set(propertyId, { draft: { title: st?.draft.title ?? null, body, lead: null, highlights: [], rev: (st?.draft.rev ?? 0) + 1, origin: "manual" }, published: st?.published ?? null });
  };
  return { actions, views, changeSource, externalSave, seedLibrary, reuseOnAdd };
}
