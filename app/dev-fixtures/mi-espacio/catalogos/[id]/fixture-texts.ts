// SOLO DESARROLLO LOCAL (BCP-01 C2, E7): textos del catálogo en memoria para
// revisar el editor sin base de datos ni IA real. La «IA» es falsa y tarda un
// poco (para probar «Cancelar» y que una respuesta tardía no pise lo editado);
// la comprobación es la REAL (ai-draft.ts → checkDraft, pura).
import type { TextActions } from "@/components/admin/catalogs/catalog-texts-panel";
import { checkDraft, pendingWarnings, type DraftSource } from "@/lib/catalogs/ai-draft";
import type { CatalogTextView } from "@/lib/catalogs/texts";
import { sentences } from "@/lib/catalogs/text-rules";
import type { CatalogItemView } from "@/lib/catalogs/types";

interface Stored {
  draft: { body: string | null; lead: string | null; highlights: string[]; rev: number; origin: string };
  published: { body: string | null; lead: string | null; highlights: string[]; at: string; sourceAtPublish: number } | null;
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
      const current = !!st?.published && st.published.sourceAtPublish === (sourceRev.get(it.propertyId) ?? 0);
      return {
        propertyId: it.propertyId, slug: it.slug, title: it.title, bcReference: it.bcReference, inList,
        level: current ? "text" : s.clean === "current" ? "clean" : "facts",
        source: { hasText: s.hasText, clean: s.clean, story: s.story },
        draft: st ? { ...st.draft, updatedAt: null } : null,
        published: st?.published ? { body: st.published.body, lead: st.published.lead, highlights: st.published.highlights, at: st.published.at, current, changed: current ? [] : ["los dormitorios"] } : null,
        candidates: s.features,
      };
    });
  };
  /** Viviendas que salieron de la lista con texto guardado (reserva). */
  const reserved = new Map<string, CatalogItemView>();
  const remember = () => {
    for (const it of opts.items()) reserved.set(it.propertyId, it);
  };

  const actions: TextActions = {
    prepare: async ({ propertyId }) => {
      const f = find(propertyId) ?? { it: reserved.get(propertyId)!, i: 0 };
      await wait(700);
      const s = sourceOf(f.it, f.i);
      if (!s.hasText) return { ok: false as const, error: "La ficha no tiene texto que preparar. Escríbelo a mano o pide un borrador con IA a partir de los datos." };
      const proposal = { body: `${s.description} Los dormitorios dan a un patio tranquilo.`, lead: null, origin: "ai_clean" as const };
      return { ok: true as const, proposal, check: checkDraft({ body: proposal.body, lead: null, highlights: [] }, draftSource(f.it, f.i)) };
    },
    draft: async ({ propertyId }) => {
      const f = find(propertyId) ?? { it: reserved.get(propertyId)!, i: 0 };
      await wait(700);
      const proposal = {
        lead: `${f.it.title}: luz y calma.`,
        body: `Una vivienda de ${f.it.squareMeters ?? "—"} m² con ${f.it.bedrooms ?? "—"} dormitorios. Tiene piscina comunitaria.`,
        origin: "ai_draft" as const,
      };
      return { ok: true as const, proposal, check: checkDraft({ body: proposal.body, lead: proposal.lead, highlights: [] }, draftSource(f.it, f.i)) };
    },
    save: async ({ propertyId, body, lead, highlights, origin, expectedRev, skipNotify }) => {
      void skipNotify;
      const st = store.get(propertyId);
      if (expectedRev !== null && (st?.draft.rev ?? 0) !== expectedRev) {
        return { ok: false as const, error: "El borrador ha cambiado desde que lo abriste (en otra pestaña o con otra acción). Recarga la página antes de guardar o publicar." };
      }
      remember();
      const rev = (st?.draft.rev ?? 0) + 1;
      store.set(propertyId, { draft: { body, lead, highlights, rev, origin: origin ?? "manual" }, published: st?.published ?? null });
      const f = find(propertyId) ?? { it: reserved.get(propertyId)!, i: 0 };
      opts.onChange();
      const r = await opts.unchanged();
      return { ...r, rev, check: checkDraft({ body, lead, highlights }, draftSource(f.it, f.i)) };
    },
    publish: async ({ propertyId, expectedRev, confirmed, skipNotify }) => {
      const st = store.get(propertyId);
      if (!st) return { ok: false as const, error: "Esa vivienda no tiene texto guardado en este catálogo." };
      if (st.draft.rev !== expectedRev) return { ok: false as const, error: "El borrador ha cambiado desde que lo abriste (en otra pestaña o con otra acción). Recarga la página antes de guardar o publicar." };
      const f = find(propertyId) ?? { it: reserved.get(propertyId)!, i: 0 };
      const check = checkDraft(st.draft, draftSource(f.it, f.i));
      if (check.blockers.length) return { ok: false as const, error: check.blockers[0].code === "text_has_price" ? "El texto menciona un precio. El precio ya se ve aparte y se actualiza solo: quítalo del texto." : "El texto tiene un teléfono, un correo o una web. Quítalo antes de publicar." };
      if (pendingWarnings(check, confirmed).length) return { ok: false as const, error: "Hay avisos sin revisar: corrige el texto o confirma cada aviso antes de publicar." };
      store.set(propertyId, { ...st, published: { body: st.draft.body, lead: st.draft.lead, highlights: st.draft.highlights, at: new Date().toISOString(), sourceAtPublish: sourceRev.get(propertyId) ?? 0 } });
      opts.onChange();
      return opts.live({ op: "text", index: Math.max(0, find(propertyId)?.i ?? 0), body: st.draft.body, lead: st.draft.lead, skipNotify });
    },
    withdraw: async ({ propertyId, skipNotify }) => {
      const st = store.get(propertyId);
      if (!st?.published) return { ok: false as const, error: "Ese texto no estaba publicado." };
      store.set(propertyId, { ...st, published: null });
      opts.onChange();
      return opts.live({ op: "text", index: Math.max(0, find(propertyId)?.i ?? 0), body: null, lead: null, skipNotify });
    },
    remove: async ({ propertyId, skipNotify }) => {
      if (!store.has(propertyId)) return { ok: false as const, error: "Esa vivienda no tiene texto guardado en este catálogo." };
      const had = !!store.get(propertyId)?.published;
      store.delete(propertyId);
      opts.onChange();
      return had ? opts.live({ op: "text", index: Math.max(0, find(propertyId)?.i ?? 0), body: null, lead: null, skipNotify }) : opts.unchanged();
    },
    preview: async ({ propertyId, body, lead, highlights }) => {
      const f = find(propertyId) ?? { it: reserved.get(propertyId)!, i: 0 };
      const all = sentences(body ?? "");
      const ownLead = (lead ?? "").trim() || null;
      const restSentences = ownLead ? all : all.slice(1);
      const sections = restSentences.length ? [{ heading: null, text: restSentences.join(" "), photo: !!f.it.photoUrl }] : [];
      return {
        ok: true as const,
        preview: { lead: ownLead ?? all[0] ?? null, highlights: highlights.length ? highlights : sourceOf(f.it, f.i).features.slice(0, 3), sections, words: (body ?? "").split(/\s+/).filter(Boolean).length },
        check: checkDraft({ body, lead, highlights }, draftSource(f.it, f.i)),
      };
    },
  };

  /** Solo pruebas: simula que la ficha cambió (el publicado deja de valer). */
  const changeSource = (propertyId: string) => sourceRev.set(propertyId, (sourceRev.get(propertyId) ?? 0) + 1);
  return { actions, views, changeSource };
}
