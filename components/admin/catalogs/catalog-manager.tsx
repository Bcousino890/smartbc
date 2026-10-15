"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CatalogCover } from "@/components/catalogs/catalog-cover";
import type { ActionResult } from "@/lib/catalogs/access";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";
import { formatContactPhone, type ContactRole } from "@/lib/catalogs/contact-format";
import { ContactFields } from "./contact-fields";
import { MeasurePanel, useHomeMeasure } from "./measure-panel";
import { SharePanel, type ShareActions, type ShareView } from "./share-panel";
import { SelectionPanel, type SelectionActions } from "./selection-panel";
import { PropertySearch, type SearchAction } from "./property-search";
import { AdsPanel, type AdActions } from "./ads-panel";
import { CoverPicker, type CoverActions } from "./cover-picker";
import { CatalogTextsPanel, type TextActions } from "./catalog-texts-panel";
import type { CatalogTextView } from "@/lib/catalogs/texts";
import type { CatalogCriteria } from "@/lib/catalogs/criteria";
import type { Section } from "@/lib/catalogs/manager-state";
import { ManagerHeader, type NoLinkReason } from "./manager/manager-header";
import { SectionTabs } from "./manager/section-tabs";
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
  /** Ampliación C2 */
  texts: TextActions;
}

const STATUS_LABEL: Record<CatalogItemView["status"], string | null> = {
  available: null,
  reserved: "Reservada",
  sold: "Vendida",
  archived: "Archivada",
};

function facts(it: CatalogItemView): string {
  const parts = [
    it.squareMeters ? `${it.squareMeters} m²` : "m² · sin dato",
    it.bedrooms !== null ? `${it.bedrooms} dorm.` : "dorm. · sin dato",
    it.bathrooms !== null ? `${it.bathrooms} baño${it.bathrooms === 1 ? "" : "s"}` : "baños · sin dato",
  ];
  return parts.join(" · ");
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
  const [items, setItems] = useState(catalog.items);
  const [status, setStatus] = useState(catalog.status);
  const [title, setTitle] = useState(catalog.title);
  const [intro, setIntro] = useState(catalog.intro ?? "");
  const [reference, setReference] = useState("");
  const [contactName, setContactName] = useState(catalog.contact.name ?? "");
  const [contactPhone, setContactPhone] = useState(formatContactPhone(catalog.contact.phone) ?? catalog.contact.phone ?? "");
  const [contactRole, setContactRole] = useState<ContactRole>(catalog.contact.role);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [currentShare, setCurrentShare] = useState<ShareView | null>(share);
  const measure = useHomeMeasure(measureMode, currentShare && !currentShare.expired ? currentShare.token : null);
  const skip = measure.skipNotify;
  const auto = catalog.mode === "auto";
  const { section, navigate } = useManagerUrl();
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
  const [draftCriteria, setDraftCriteria] = useState<CatalogCriteria>(catalog.criteria);

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
    run(() => wrapped.updateMeta({ catalogId: catalog.id, title, intro }), "Datos guardados.", undefined, undefined, "edición");
  }

  function saveContact(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => wrapped.setContact({ catalogId: catalog.id, name: contactName, phone: contactPhone, role: contactRole }),
      "Contacto guardado. Quien tenga el enlace abierto lo verá al momento.",
      undefined,
      undefined,
      "contacto",
    );
  }

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

  const panel = (s: Section) => ({
    role: "tabpanel" as const,
    id: `cm-panel-${s}`,
    "aria-labelledby": `cm-tab-${s}`,
    hidden: section !== s,
    tabIndex: -1,
  });

  return (
    <div className="mt-4 space-y-4 pb-12">
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
      />
      <SectionTabs section={section} onSelect={(s) => go(s)} counts={{ viviendas: items.length }} />

      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`rounded-lg px-3 py-2 text-sm ${message.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
        >
          {message.text}
        </p>
      ) : null}

      <section {...panel("viviendas")} className="min-w-0 space-y-4 focus:outline-none">
          <div className="flex items-end justify-between gap-3">
            <h2 id="cm-props" className="crm-section-title text-ink">
              Propiedades
            </h2>
            <span className="text-sm text-ink/55" data-testid="items-count">
              {auto ? autoCount() : `${items.length} en el catálogo`}
            </span>
          </div>

          <SelectionPanel
            catalogId={catalog.id}
            mode={catalog.mode}
            criteria={catalog.criteria}
            manualCount={catalog.manualCount}
            actions={wrapped.selection}
            run={run}
            pending={pending}
            onCriteriaChange={setDraftCriteria}
          />

          {auto ? (
            <>
              <p className="rounded-xl border border-gold/20 bg-gold/10 px-3 py-2 text-xs text-ink/70" data-testid="auto-note">
                Lista automática: sale de los criterios y se actualiza sola. Puedes incluir o excluir viviendas a mano; para ordenar a mano, pásalo a manual.
              </p>
              {adj.overMax ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="over-max">
                  Hay más inclusiones disponibles ({adj.included}) que el máximo ({catalog.criteria.max}): solo entran las primeras en el orden. Sube el máximo o quita una inclusión.
                </p>
              ) : null}
              <PropertySearch
                catalogId={catalog.id}
                criteria={draftCriteria}
                search={actions.search}
                mode="auto"
                refreshKey={`${items.map((x) => x.propertyId).join()}|${adj.included}|${nExcluded}|${adj.unavailable.length}`}
                disabled={archived || pending}
                onAdjust={(it, kind) => adjust(it, kind)}
                onClear={(it) => adjust(it, "clear")}
              />
            </>
          ) : (
            <PropertySearch
              catalogId={catalog.id}
              criteria={draftCriteria}
              search={actions.search}
              disabled={archived || pending}
              onAdd={(it) =>
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
            />
          )}

          {auto ? null : (
          <form onSubmit={add} className="flex flex-col gap-2 rounded-xl border border-gold/20 bg-white/60 p-3 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="cm-ref">
              Referencia BC, slug o URL de la ficha
            </label>
            <input
              id="cm-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={archived}
              placeholder="BC-1234, slug o URL de la ficha"
              className="min-w-0 flex-1 rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={pending || archived || !reference.trim()}
              className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold disabled:opacity-50"
            >
              Añadir
            </button>
          </form>
          )}
          {auto ? null : (
          <p className="text-xs text-ink/50">
            Solo propiedades que ya están en el CRM. Importar desde portales o PDF llega en la fase 3.
          </p>
          )}
          {!auto && (adj.included + adj.unavailable.length + nExcluded) > 0 ? (
            <p className="text-xs text-ink/55" data-testid="stored-adjustments">
              Ajustes del modo automático guardados ({adj.included + adj.unavailable.length} inclusiones, {nExcluded} exclusiones): se vuelven a aplicar si pasas a automático.
            </p>
          ) : null}

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-10 text-center text-sm text-ink/55">
              {auto ? "Ninguna vivienda encaja ahora con los criterios (o les falta foto)." : "Este catálogo todavía no tiene propiedades."}
            </div>
          ) : (
            <ol className="space-y-2">
              {items.map((it, i) => {
                const badge = STATUS_LABEL[it.status];
                return (
                  <li
                    key={it.propertyId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gold/15 bg-white/60 p-2 pr-3 sm:flex-nowrap"
                    data-check-overflow="fila"
                  >
                    <span className="w-6 shrink-0 text-center text-xs text-ink/45">{i + 1}</span>
                    <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-cream-200 sm:h-14 sm:w-20">
                      {it.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-xs text-ink/45">Sin foto</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="crm-body-strong line-clamp-2 text-ink">
                        {it.bcReference ? <span className="mr-2 text-xs text-ink/45">{it.bcReference}</span> : null}
                        {it.title}
                      </p>
                      <p className="text-xs text-ink/55">
                        {[it.zone ?? "Zona · sin dato", it.operation].join(" · ")}
                      </p>
                      <p className="text-xs text-ink/55">
                        <span className="text-ink/80">{it.price}</span> · {facts(it)}
                      </p>
                      {auto && it.explain ? (
                        <p className="text-xs text-ink/60" data-testid="item-reason">
                          <span className={it.via === "include" ? "text-gold" : "text-ink/70"}>{it.explain.headline}</span>
                          {it.explain.details.length ? ` · ${it.explain.details.join(" · ")}` : ""}
                        </p>
                      ) : null}
                      {auto && it.explain?.warnings.length ? (
                        <p className="text-xs text-amber-800" data-testid="item-warning">
                          {it.explain.warnings.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    {badge ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{badge}</span>
                    ) : null}
                    {auto ? (
                    <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1">
                      {it.via === "include" || it.via === "both" ? (
                        <button
                          type="button"
                          onClick={() => void adjust(it, "clear")}
                          disabled={pending || archived}
                          aria-label={`Quitar la inclusión de «${it.title}»`}
                          className="rounded-md border border-gold/40 px-2 py-1 text-xs text-ink/80 hover:bg-white disabled:opacity-40"
                        >
                          Quitar inclusión
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void adjust(it, "exclude")}
                        disabled={pending || archived}
                        aria-label={`Excluir «${it.title}»`}
                        className="rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
                      >
                        Excluir
                      </button>
                    </div>
                    ) : (
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={pending || i === 0}
                        aria-label={`Subir «${it.title}»`}
                        className="rounded-md p-1.5 text-ink/60 hover:bg-white disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={pending || i === items.length - 1}
                        aria-label={`Bajar «${it.title}»`}
                        className="rounded-md p-1.5 text-ink/60 hover:bg-white disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(it)}
                        disabled={pending}
                        className="ml-1 rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
                      >
                        Quitar
                      </button>
                    </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {auto && adj.unavailable.length ? (
            <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3" data-testid="unavailable-inclusions" aria-label="Inclusiones no disponibles">
              <h3 className="crm-label-sm text-amber-900">Inclusiones que hoy no aparecen ({adj.unavailable.length})</h3>
              <ul className="space-y-1">
                {adj.unavailable.map((it) => (
                  <li key={it.propertyId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70" data-check-overflow="no-disponible">
                    <span className="min-w-0 flex-1 basis-40">
                      {it.bcReference ? <span className="mr-2 text-ink/45">{it.bcReference}</span> : null}
                      {it.title} · {it.explain?.warnings.join(" · ")}
                    </span>
                    <button
                      type="button"
                      onClick={() => void adjust(it, "clear")}
                      disabled={pending}
                      aria-label={`Quitar la inclusión de «${it.title}»`}
                      className="rounded-md border border-gold/40 px-2 py-1 text-xs text-ink/80 hover:bg-white disabled:opacity-40"
                    >
                      Quitar inclusión
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {auto && nExcluded ? (
            <section className="space-y-2 rounded-xl border border-gold/20 bg-white/60 p-3" data-testid="excluded-list" aria-label="Excluidas">
              <h3 className="crm-label-sm text-ink/70">Excluidas a mano ({nExcluded})</h3>
              <ul className="space-y-1">
                {adj.excluded.map((it) => (
                  <li key={it.propertyId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70" data-check-overflow="excluida">
                    <span className="min-w-0 flex-1 basis-40">
                      {it.bcReference ? <span className="mr-2 text-ink/45">{it.bcReference}</span> : null}
                      {it.title} · {it.explain?.headline}
                    </span>
                    <button
                      type="button"
                      onClick={() => void adjust(it, "clear")}
                      disabled={pending}
                      aria-label={`Volver a permitir «${it.title}»`}
                      className="rounded-md border border-gold/40 px-2 py-1 text-xs text-ink/80 hover:bg-white disabled:opacity-40"
                    >
                      Volver a permitir
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

      </section>

      <section {...panel("contenido")} className="min-w-0 space-y-4 focus:outline-none">
          <CatalogTextsPanel
            catalogId={catalog.id}
            texts={texts}
            actions={wrapped.texts}
            run={run}
            pending={pending}
            storyHref={storyHref}
          />
      </section>

      <section {...panel("diseno")} className="min-w-0 focus:outline-none">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-4">
              <form onSubmit={saveMeta} className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4">
                <label className="block">
                  <span className="crm-label-sm text-ink/70">Título</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={160}
                    required
                    className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
                  />
                </label>
                <label className="block">
                  <span className="crm-label-sm text-ink/70">Introducción</span>
                  <textarea
                    value={intro}
                    onChange={(e) => setIntro(e.target.value)}
                    maxLength={2000}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
                  />
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold disabled:opacity-60"
                >
                  Guardar
                </button>
              </form>
              <CoverPicker
                catalogId={catalog.id}
                items={items}
                cover={catalog.cover}
                actions={wrapped.cover}
                run={run}
                pending={pending}
              />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="crm-label-sm text-ink/60">Vista previa de la portada</p>
            <div className="mx-auto aspect-[150/212] w-full max-w-[240px] overflow-hidden rounded-sm shadow-[0_10px_24px_-14px_rgba(60,40,20,0.45)]" data-check-overflow="portada">
              <CatalogCover
                data={{
                  title: title || catalog.title,
                  subtitle: intro || null,
                  numberLabel,
                  edition: catalog.edition,
                  photoUrl: catalog.cover.effectivePhotoUrl ?? null,
                  preparedBy: contactName.trim() || null,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <section {...panel("compartir")} className="min-w-0 focus:outline-none">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <form onSubmit={saveContact} className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4" data-testid="contact-form">
              <ContactFields
                idPrefix="cm"
                name={contactName}
                phone={contactPhone}
                role={contactRole}
                onName={setContactName}
                onPhone={setContactPhone}
                onRole={setContactRole}
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold disabled:opacity-60"
              >
                Guardar contacto
              </button>
            </form>
          </div>
          <div className="min-w-0 space-y-4">
            {shareNotice ? (
              <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="share-notice">
                {shareNotice}
              </p>
            ) : null}
            {shareActions ? (
              <SharePanel
                catalogId={catalog.id}
                share={currentShare}
                archived={archived}
                actions={shareActions}
                onChange={setCurrentShare}
              />
            ) : null}
            <details className="rounded-xl border border-gold/20 bg-white/40 p-3" data-testid="internal-ads">
              <summary className="cursor-pointer text-sm text-ink/70">Organización interna · anuncios de origen</summary>
              <div className="mt-3">
              <AdsPanel catalogId={catalog.id} ads={catalog.ads} actions={actions.ads} />
              </div>
            </details>
            {measureMode ? <MeasurePanel measure={measure} hasShare={!!currentShare && !currentShare.expired} /> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
