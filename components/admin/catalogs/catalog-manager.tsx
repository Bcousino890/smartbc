"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/catalogs/access";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";
import { formatContactPhone } from "@/lib/catalogs/contact-format";
import { useHomeMeasure } from "./measure-panel";
import type { ShareActions, ShareView } from "./share-panel";
import type { SelectionActions } from "./selection-panel";
import type { SearchAction } from "./property-search";
import type { AdActions } from "./ads-panel";
import type { CoverActions } from "./cover-picker";
import type { PhotoActions } from "./manager/catalog-photos-block";
import { textDraftKey, type TextActions } from "./catalog-texts-panel";
import type { CatalogTextView } from "@/lib/catalogs/texts";
import { criteriaSummary } from "@/lib/catalogs/criteria";
import {
  contactAdapter,
  coverAdapter,
  criteriaAdapter,
  criteriaFromRaw,
  criteriaRawOf,
  isEdited,
  metaAdapter,
  reconcileTextDraft,
  textAdapter,
  type ContactRaw,
  type CoverRaw,
  type CriteriaRaw,
  type MetaRaw,
  type Section,
  type TextDraft,
} from "@/lib/catalogs/manager-state";
import { draftsStore, useDraftsVersion } from "./manager/drafts-store";
import { useFormDraft } from "./manager/use-form-draft";
import { useLeaveGuard } from "./manager/use-leave-guard";
import { ManagerHeader, type NoLinkReason, type UnsavedEntry } from "./manager/manager-header";
import { SectionTabs } from "./manager/section-tabs";
import { HomesSection } from "./manager/homes-section";
import { ContentSection } from "./manager/content-section";
import { DesignSection } from "./manager/design-section";
import { ShareSection } from "./manager/share-section";
import { useManagerUrl } from "./manager/use-manager-url";

// Gestión de un catálogo (BCP-01 T4). Interfaz del admin en Lato. Las acciones
// llegan inyectadas: en la página real son las acciones de servidor (con la
// guarda del dueño y las funciones SQL de 0192/0193); en la prueba local,
// falsas. Fase 2: enlace para compartir y, con ?medir=1, el modo medición.
// Ampliación PR-B: zonas, precio y modo manual/automático, búsqueda para
// añadir y anuncios de origen.
// Ampliación C1: en automático se puede incluir y excluir (ajustes
// persistentes; la lista sigue actualizándose sola), cada vivienda dice por
// qué está, y la portada se elige aparte. Nada de esto llega al lector.
// E2: cuatro secciones (Viviendas, Contenido, Diseño, Compartir) con la
// sección en la URL; mismas acciones de servidor, envueltas con la medición
// en UN solo sitio (abajo, `wrapped`).

type Res = ActionResult<{ version: number; fingerprint?: string | null; publicChange?: boolean }>;
/** Solo con ?medir=1 y «sin aviso inmediato». */
type M = { skipNotify?: boolean };

export interface CatalogManagerActions {
  updateMeta: (i: { catalogId: string; title: string; intro?: string | null } & M) => Promise<Res>;
  addProperty: (i: { catalogId: string; reference: string } & M) => Promise<Res>;
  removeProperty: (i: { catalogId: string; propertyId: string } & M) => Promise<Res>;
  reorder: (i: { catalogId: string; propertyIds: string[] } & M) => Promise<Res>;
  setStatus: (i: { catalogId: string; status: "active" | "archived" } & M) => Promise<Res>;
  setContact: (i: { catalogId: string; name: string; phone: string; role: string } & M) => Promise<Res>;
  /** Ampliación PR-B */
  addPropertyById: (i: { catalogId: string; propertyId: string } & M) => Promise<Res>;
  search: SearchAction;
  selection: SelectionActions;
  ads: AdActions;
  /** Ampliación C1 */
  adjust: (i: { catalogId: string; propertyId: string; kind: "include" | "exclude" } & M) => Promise<Res>;
  clearAdjustment: (i: { catalogId: string; propertyId: string } & M) => Promise<Res>;
  cover: CoverActions;
  /** E3 · fotos por catálogo. */
  photos: PhotoActions;
  /** Ampliación C2 */
  texts: TextActions;
}

export function CatalogManager({
  catalog,
  actions,
  basePath,
  numberLabel,
  onLocalAdd,
  share = null,
  shareActions,
  measureMode = false,
  texts = [],
  storyHref = (slug: string) => `/es/admin/propiedades/${encodeURIComponent(slug)}/story`,
}: {
  catalog: CatalogDetail;
  actions: CatalogManagerActions;
  basePath: string;
  numberLabel?: string | null;
  /** Solo en la prueba local: devuelve el elemento sintético que se añadió. */
  onLocalAdd?: (reference: string) => CatalogItemView | null;
  share?: ShareView | null;
  shareActions?: ShareActions;
  /** ?medir=1: instrumenta cada guardado para la medición de D13. */
  measureMode?: boolean;
  /** C2: textos de las viviendas (lista + reserva). */
  texts?: CatalogTextView[];
  /** C2: enlace a la historia de una ficha (revisión aparte). */
  storyHref?: (slug: string) => string;
}) {
  const router = useRouter();
  // E3: sube cada vez que llega un catálogo nuevo (tras guardar y refrescar),
  // para que las listas de fotos se vuelvan a leer.
  const catalogRev = useRef({ cat: catalog, n: 0 });
  if (catalogRev.current.cat !== catalog) catalogRev.current = { cat: catalog, n: catalogRev.current.n + 1 };
  const photoRefreshKey = String(catalogRev.current.n);
  const [items, setItems] = useState(catalog.items);
  const [status, setStatus] = useState(catalog.status);
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [currentShare, setCurrentShare] = useState<ShareView | null>(share);
  const measure = useHomeMeasure(measureMode, currentShare && !currentShare.expired ? currentShare.token : null);
  const skip = measure.skipNotify;
  const auto = catalog.mode === "auto";
  const { section, vivienda, navigate } = useManagerUrl();
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const focusAfter = useRef<string | null>(null);

  // Acciones con la medición (?medir=1, «sin aviso inmediato»): las MISMAS que
  // antes de E2, envueltas una vez y estables entre renders.
  const wrapped = useMemo(() => {
    const mo: M = skip ? { skipNotify: true } : {};
    return {
      updateMeta: (i: Parameters<CatalogManagerActions["updateMeta"]>[0]) => actions.updateMeta({ ...i, ...mo }),
      addProperty: (i: Parameters<CatalogManagerActions["addProperty"]>[0]) => actions.addProperty({ ...i, ...mo }),
      removeProperty: (i: Parameters<CatalogManagerActions["removeProperty"]>[0]) => actions.removeProperty({ ...i, ...mo }),
      reorder: (i: Parameters<CatalogManagerActions["reorder"]>[0]) => actions.reorder({ ...i, ...mo }),
      setStatus: (i: Parameters<CatalogManagerActions["setStatus"]>[0]) => actions.setStatus({ ...i, ...mo }),
      setContact: (i: Parameters<CatalogManagerActions["setContact"]>[0]) => actions.setContact({ ...i, ...mo }),
      addPropertyById: (i: Parameters<CatalogManagerActions["addPropertyById"]>[0]) => actions.addPropertyById({ ...i, ...mo }),
      adjust: (i: Parameters<CatalogManagerActions["adjust"]>[0]) => actions.adjust({ ...i, ...mo }),
      clearAdjustment: (i: Parameters<CatalogManagerActions["clearAdjustment"]>[0]) => actions.clearAdjustment({ ...i, ...mo }),
      selection: {
        ...actions.selection,
        setCriteria: (i: Parameters<SelectionActions["setCriteria"]>[0]) => actions.selection.setCriteria({ ...i, ...mo }),
        setMode: (i: Parameters<SelectionActions["setMode"]>[0]) => actions.selection.setMode({ ...i, ...mo }),
      } satisfies SelectionActions,
      cover: { ...actions.cover, set: (i: Parameters<CoverActions["set"]>[0]) => actions.cover.set({ ...i, ...mo }) } satisfies CoverActions,
      photos: {
        ...actions.photos,
        setExcluded: (i: Parameters<PhotoActions["setExcluded"]>[0]) => actions.photos.setExcluded({ ...i, ...mo }),
        setOpening: (i: Parameters<PhotoActions["setOpening"]>[0]) => actions.photos.setOpening({ ...i, ...mo }),
      } satisfies PhotoActions,
      texts: {
        ...actions.texts,
        save: (i: Parameters<TextActions["save"]>[0]) => actions.texts.save({ ...i, ...mo }),
        publish: (i: Parameters<TextActions["publish"]>[0]) => actions.texts.publish({ ...i, ...mo }),
        withdraw: (i: Parameters<TextActions["withdraw"]>[0]) => actions.texts.withdraw({ ...i, ...mo }),
        remove: (i: Parameters<TextActions["remove"]>[0]) => actions.texts.remove({ ...i, ...mo }),
      } satisfies TextActions,
    };
  }, [actions, skip]);

  function go(next: Section, focusId?: string) {
    focusAfter.current = focusId ?? null;
    navigate({ seccion: next });
  }
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }, [section]);

  function previewWithoutLink(reason: NoLinkReason) {
    setShareNotice(
      reason === "archived"
        ? "Reactiva el catálogo para compartirlo: mientras esté archivado no hay vista previa."
        : reason === "expired"
          ? "El enlace caducó: renuévalo para ver la vista previa."
          : "Aún no hay enlace: créalo aquí para ver la vista previa.",
    );
    go("compartir", "sp-title");
  }

  // E2 · valores sin guardar: el almacén es el único dueño (plan §3.4).
  useDraftsVersion();
  const rootRef = useRef<HTMLDivElement>(null);
  const savedCriteria = criteriaRawOf(catalog.criteria);
  const criteriaForm = useFormDraft<CriteriaRaw>(catalog.id, "criteria", criteriaAdapter, { raw: savedCriteria, key: criteriaAdapter.key(savedCriteria) });
  const savedMeta: MetaRaw = { title: catalog.title, intro: catalog.intro ?? "" };
  const metaForm = useFormDraft<MetaRaw>(catalog.id, "meta", metaAdapter, { raw: savedMeta, key: metaAdapter.key(savedMeta) });
  const savedContact: ContactRaw = {
    name: catalog.contact.name ?? "",
    phone: formatContactPhone(catalog.contact.phone) ?? catalog.contact.phone ?? "",
    role: catalog.contact.role,
  };
  const contactForm = useFormDraft<ContactRaw>(catalog.id, "contact", contactAdapter, { raw: savedContact, key: contactAdapter.key(savedContact) });
  const chosenInList = catalog.cover.chosenPropertyId && catalog.items.some((it) => it.propertyId === catalog.cover.chosenPropertyId) ? catalog.cover.chosenPropertyId : "";
  const savedCover: CoverRaw = { propertyId: chosenInList };
  const coverForm = useFormDraft<CoverRaw>(catalog.id, "cover", coverAdapter, { raw: savedCover, key: coverAdapter.key(savedCover) });
  const contactName = contactForm.value.name;
  const draftCriteria = criteriaFromRaw(criteriaForm.value) ?? catalog.criteria;
  const [coverNotice, setCoverNotice] = useState<string | null>(null);
  const [returned, setReturned] = useState(false);

  useEffect(() => setItems(catalog.items), [catalog.items]);
  useEffect(() => setStatus(catalog.status), [catalog.status]);

  useEffect(() => setCurrentShare(share), [share]);

  function run(fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void, label = ok) {
    setMessage(null);
    let trial: { trial: string; tStart: number } | null = null;
    if (measure.enabled) {
      trial = measure.begin();
      if (!trial) {
        onFail?.();
        setMessage({ kind: "error", text: "Medición: espera a que respondan los lectores del ensayo anterior (máx. 5 s)." });
        return;
      }
    }
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        onFail?.();
        setMessage({ kind: "error", text: res.error });
        return;
      }
      if (trial) measure.complete(trial, label, res.fingerprint, res.publicChange !== false);
      onOk?.();
      setMessage({ kind: "ok", text: ok });
      if (!onLocalAdd) router.refresh();
    });
  }

  function move(index: number, delta: -1 | 1) {
    const j = index + delta;
    if (j < 0 || j >= items.length) return;
    const before = items;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
    run(
      () => wrapped.reorder({ catalogId: catalog.id, propertyIds: next.map((i) => i.propertyId) }),
      "Orden guardado.",
      undefined,
      () => setItems(before),
      "orden",
    );
  }

  function remove(it: CatalogItemView) {
    if (!onLocalAdd && !window.confirm(`¿Quitar «${it.title}» de este catálogo? La propiedad no se borra del CRM.`)) return;
    const before = items;
    setItems(items.filter((x) => x.propertyId !== it.propertyId));
    run(
      () => wrapped.removeProperty({ catalogId: catalog.id, propertyId: it.propertyId }),
      "Propiedad quitada del catálogo.",
      undefined,
      () => setItems(before),
      "retirada",
    );
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const ref = reference;
    run(
      () => wrapped.addProperty({ catalogId: catalog.id, reference: ref }),
      "Propiedad añadida.",
      () => {
        setReference("");
        const local = onLocalAdd?.(ref);
        if (local) setItems((xs) => [...xs, local]);
      },
      undefined,
      "alta",
    );
  }

  /** Incluir / excluir / quitar ajuste (C1). Devuelve true si se guardó. */
  function adjust(it: CatalogItemView, kind: "include" | "exclude" | "clear"): Promise<boolean> {
    const labels = { include: "Vivienda incluida.", exclude: "Vivienda excluida: entra la siguiente que coincide.", clear: "Ajuste quitado: la vivienda vuelve a seguir los criterios." };
    return new Promise<boolean>((resolve) => {
      run(
        () =>
          kind === "clear"
            ? wrapped.clearAdjustment({ catalogId: catalog.id, propertyId: it.propertyId })
            : wrapped.adjust({ catalogId: catalog.id, propertyId: it.propertyId, kind }),
        labels[kind],
        () => resolve(true),
        () => resolve(false),
        kind === "clear" ? "ajuste quitado" : kind === "include" ? "inclusión" : "exclusión",
      );
    });
  }

  function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    // Ajuste 2: se envía ESTA instantánea; lo escrito después se conserva.
    const sent = metaForm.value;
    const k = metaForm.begin(sent);
    run(() => wrapped.updateMeta({ catalogId: catalog.id, title: sent.title, intro: sent.intro }), "Datos guardados.", () => metaForm.ok(k), () => metaForm.fail(k), "edición");
  }

  function saveContact(e: React.FormEvent) {
    e.preventDefault();
    const sent = contactForm.value;
    const k = contactForm.begin(sent);
    run(
      () => wrapped.setContact({ catalogId: catalog.id, name: sent.name, phone: sent.phone, role: sent.role }),
      "Contacto guardado. Quien tenga el enlace abierto lo verá al momento.",
      () => contactForm.ok(k),
      () => contactForm.fail(k),
      "contacto",
    );
  }

  // Textos: cada borrador se reconcilia con la revisión guardada que llega.
  useEffect(() => {
    for (const key of draftsStore.draftKeys(catalog.id)) {
      if (!key.startsWith("text:")) continue;
      const view = texts.find((t) => textDraftKey(t.propertyId) === key);
      if (view) draftsStore.updateDraft<TextDraft>(catalog.id, key, (prev) => (prev ? reconcileTextDraft(prev, view) : prev));
    }
  }, [catalog.id, texts]);

  // A4: una portada pendiente cuya vivienda sale de la lista se descarta (solo
  // esa elección), con aviso. La portada guardada sigue con sus respaldos.
  const coverPending = coverForm.value.propertyId;
  useEffect(() => {
    if (!coverPending || items.some((it) => it.propertyId === coverPending)) return;
    coverForm.discard();
    setCoverNotice("La vivienda que habías elegido para la portada (sin confirmar) ya no está en el catálogo: se ha descartado esa elección.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverPending, items]);

  // Formularios con cambios sin guardar (D-QA9), con su sitio.
  const textTitle = (pid: string) => texts.find((t) => t.propertyId === pid)?.title ?? "una vivienda que ya no está";
  const unsaved: Array<UnsavedEntry & { section: Section }> = [];
  if (criteriaForm.edited) unsaved.push({ key: "criteria", label: "Criterios", section: "viviendas", go: () => go("viviendas") });
  if (metaForm.edited) unsaved.push({ key: "meta", label: "Título e introducción", section: "diseno", go: () => go("diseno", "cm-title") });
  if (coverForm.edited) unsaved.push({ key: "cover", label: "Portada", section: "diseno", go: () => go("diseno", "cp-title") });
  if (contactForm.edited) unsaved.push({ key: "contact", label: "Contacto", section: "compartir", go: () => go("compartir", "cm-contact-name") });
  for (const key of draftsStore.draftKeys(catalog.id)) {
    if (!key.startsWith("text:") || !isEdited(textAdapter, draftsStore.draft<TextDraft>(catalog.id, key))) continue;
    const pid = key.slice(5);
    unsaved.push({ key, label: `Texto de «${textTitle(pid)}»`, section: "contenido", go: () => navigate({ seccion: "contenido", vivienda: pid }) });
  }
  const marks: Partial<Record<Section, boolean>> = {};
  for (const u of unsaved) marks[u.section] = true;
  useLeaveGuard(
    unsaved.map((u) => u.label),
    () => draftsStore.discardAll(catalog.id),
    rootRef,
  );
  // A1: si al volver al gestor (en el mismo documento) quedan cambios de antes.
  useEffect(() => {
    if (unsaved.length) setReturned(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleStatus() {
    const next = status === "active" ? "archived" : "active";
    run(() => wrapped.setStatus({ catalogId: catalog.id, status: next }), next === "archived" ? "Catálogo archivado." : "Catálogo reactivado.", () => setStatus(next));
  }

  const archived = status === "archived";
  const adj = catalog.adjustments;
  const nExcluded = adj.excluded.length;

  function autoCount(): string {
    const matched = catalog.autoMatched ?? catalog.autoTotal ?? items.length;
    // Con inclusiones, «8 de 5» se leería mal: se separa lo que hay de lo que coincide.
    const parts = adj.included ? [`${items.length} en el catálogo`, `${matched} coinciden`] : [`${items.length} de ${matched} coinciden`];
    if (adj.included) parts.push(`${adj.included} incluida${adj.included === 1 ? "" : "s"} a mano`);
    if (nExcluded) parts.push(`${nExcluded} excluida${nExcluded === 1 ? "" : "s"}`);
    return parts.join(" · ");
  }

  // El mensaje del gestor se ve junto a las acciones: dentro del panel abierto
  // (Viviendas o Contenido) o, si no hay panel, encima de la sección.
  const panelOpen = (section === "viviendas" || section === "contenido") && !!vivienda;
  const messageEl = message ? (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className={`rounded-lg px-3 py-2 text-sm ${message.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
    >
      {message.text}
    </p>
  ) : null;

  const panel = (s: Section) => ({
    role: "tabpanel" as const,
    id: `cm-panel-${s}`,
    "aria-labelledby": `cm-tab-${s}`,
    hidden: section !== s,
    tabIndex: -1,
  });

  return (
    <div ref={rootRef} className="mt-4 space-y-4 pb-12">
      <ManagerHeader
        basePath={basePath}
        title={catalog.title}
        archived={archived}
        mode={catalog.mode}
        count={items.length}
        share={currentShare}
        pending={pending}
        onToggleStatus={toggleStatus}
        onPreviewWithoutLink={previewWithoutLink}
        onShare={() => {
          setShareNotice(null);
          go("compartir", "sp-title");
        }}
        unsaved={unsaved}
      />
      <SectionTabs section={section} onSelect={(s) => go(s)} counts={{ viviendas: items.length }} marks={marks} />
      {returned && unsaved.length ? (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="returned-notice">
          <span className="min-w-0 flex-1">Tienes cambios sin guardar de antes en este catálogo: {unsaved.map((u) => u.label).join(", ")}.</span>
          <button type="button" onClick={() => setReturned(false)} className="underline">
            Entendido
          </button>
        </div>
      ) : null}

      {panelOpen ? null : messageEl}

      <section {...panel("viviendas")} className="min-w-0 focus:outline-none">
        <HomesSection
          catalog={catalog}
          items={items}
          auto={auto}
          archived={archived}
          pending={pending}
          countLabel={auto ? autoCount() : `${items.length} en el catálogo`}
          openId={section === "viviendas" ? vivienda : null}
          onOpen={(pid) => navigate({ seccion: "viviendas", vivienda: pid })}
          onEditText={(pid) => navigate({ seccion: "contenido", vivienda: pid })}
          message={section === "viviendas" && vivienda ? messageEl : null}
          criteriaForm={criteriaForm}
          summarize={(raw) => criteriaSummary(criteriaFromRaw(raw) ?? catalog.criteria) || "todas las zonas y precios"}
          searchCriteria={draftCriteria}
          selectionActions={wrapped.selection}
          search={actions.search}
          run={run}
          move={move}
          remove={remove}
          adjust={adjust}
          addById={(it) =>
            new Promise<boolean>((resolve) => {
              run(
                () => wrapped.addPropertyById({ catalogId: catalog.id, propertyId: it.propertyId }),
                "Propiedad añadida.",
                () => {
                  if (onLocalAdd) setItems((xs) => [...xs, it]);
                  resolve(true);
                },
                () => resolve(false),
                "alta",
              );
            })
          }
          reference={reference}
          setReference={setReference}
          addByReference={add}
        />
      </section>

      <section {...panel("contenido")} className="min-w-0 focus:outline-none">
        <ContentSection
          catalogId={catalog.id}
          texts={texts}
          material={catalog.material}
          actions={wrapped.texts}
          run={run}
          pending={pending}
          storyHref={storyHref}
          openId={section === "contenido" ? vivienda : null}
          onOpen={(pid) => navigate({ seccion: "contenido", vivienda: pid })}
          refresh={() => {
            if (!onLocalAdd) router.refresh();
          }}
          message={section === "contenido" && vivienda ? messageEl : null}
          photoActions={wrapped.photos}
          photoRun={run}
          refreshKey={photoRefreshKey}
        />
      </section>

      <section {...panel("diseno")} className="min-w-0 focus:outline-none">
        <DesignSection
          catalog={catalog}
          items={items}
          numberLabel={numberLabel}
          pending={pending}
          run={run}
          coverActions={wrapped.cover}
          coverRefreshKey={photoRefreshKey}
          metaForm={metaForm}
          coverForm={coverForm}
          contactName={contactName}
          onSaveMeta={saveMeta}
          coverNotice={coverNotice}
          previewToken={currentShare && !currentShare.expired && !archived ? currentShare.token : null}
        />
      </section>

      <section {...panel("compartir")} className="min-w-0 focus:outline-none">
        <ShareSection
          catalogId={catalog.id}
          archived={archived}
          pending={pending}
          contactForm={contactForm}
          onSaveContact={saveContact}
          shareNotice={shareNotice}
          share={currentShare}
          shareActions={shareActions}
          onShareChange={setCurrentShare}
          ads={catalog.ads}
          adActions={actions.ads}
          measureMode={measureMode}
          measure={measure}
        />
      </section>
    </div>
  );
}
