"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { criteriaSummary, type CatalogCriteria } from "@/lib/catalogs/criteria";
import type { CriteriaRaw } from "@/lib/catalogs/manager-state";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";
import { PropertySearch, type SearchAction } from "../property-search";
import { SelectionPanel, type SelectionActions } from "../selection-panel";
import { draftsStore, useDraftsVersion } from "./drafts-store";
import { SidePanel, SidePanelFooter } from "./side-panel";
import type { FormDraft } from "./use-form-draft";

// Viviendas (BCP-01 E2, plan §3.7): criterios resumidos con su editor
// desplegable, vistas de la lista, lista compacta sin párrafos y panel de la
// vivienda con los motivos («por qué está») y las mismas acciones de selección
// de siempre (mismas reglas y mensajes: viven en el gestor y en el servidor).

type Run = Parameters<typeof SelectionPanel>[0]["run"];
type View = "catalogo" | "coincidencias" | "excluidas" | "anadir";

const STATUS_LABEL: Record<CatalogItemView["status"], string | null> = {
  available: null,
  reserved: "Reservada",
  sold: "Vendida",
  archived: "Archivada",
};

export function facts(it: CatalogItemView): string {
  const parts = [
    it.squareMeters ? `${it.squareMeters} m²` : "m² · sin dato",
    it.bedrooms !== null ? `${it.bedrooms} dorm.` : "dorm. · sin dato",
    it.bathrooms !== null ? `${it.bathrooms} baño${it.bathrooms === 1 ? "" : "s"}` : "baños · sin dato",
  ];
  return parts.join(" · ");
}

export interface HomesSectionProps {
  catalog: CatalogDetail;
  items: CatalogItemView[];
  auto: boolean;
  archived: boolean;
  pending: boolean;
  countLabel: string;
  openId: string | null;
  onOpen: (propertyId: string | null) => void;
  onEditText: (propertyId: string) => void;
  /** Mensaje del gestor (se pinta en el panel cuando está abierto). */
  message: ReactNode;
  criteriaForm: FormDraft<CriteriaRaw>;
  summarize: (raw: CriteriaRaw) => string;
  searchCriteria: CatalogCriteria;
  selectionActions: SelectionActions;
  search: SearchAction;
  run: Run;
  move: (index: number, delta: -1 | 1) => void;
  remove: (it: CatalogItemView) => void;
  adjust: (it: CatalogItemView, kind: "include" | "exclude" | "clear") => Promise<boolean>;
  addById: (it: CatalogItemView) => Promise<boolean>;
  reference: string;
  setReference: (v: string) => void;
  addByReference: (e: React.FormEvent) => void;
}

export function HomesSection(props: HomesSectionProps) {
  const { catalog, items, auto, archived, pending, openId, onOpen, criteriaForm, message } = props;
  useDraftsVersion();
  const adj = catalog.adjustments;
  const nExcluded = adj.excluded.length;
  const ui = <T,>(k: string, d: T) => draftsStore.ui<T>(catalog.id, k) ?? d;
  const setUi = <T,>(k: string, v: T) => draftsStore.setUi<T>(catalog.id, k, v);
  const criteriaOpen = ui("criteriaOpen", false);
  const viewRaw = ui<View>("homesView", "catalogo");
  const view: View = auto ? (viewRaw === "anadir" ? "catalogo" : viewRaw) : viewRaw === "coincidencias" || viewRaw === "excluidas" ? "catalogo" : viewRaw;
  const lastOpener = useRef<string | null>(null);

  const index = openId ? items.findIndex((x) => x.propertyId === openId) : -1;
  const openItem = index >= 0 ? items[index] : null;
  const openExcluded = openId && !openItem ? adj.excluded.find((x) => x.propertyId === openId) ?? null : null;
  const openUnavailable = openId && !openItem ? adj.unavailable.find((x) => x.propertyId === openId) ?? null : null;

  // Al cerrar, el foco vuelve a la fila que abrió el panel.
  useEffect(() => {
    if (openId) {
      lastOpener.current = openId;
      return;
    }
    const pid = lastOpener.current;
    if (!pid) return;
    lastOpener.current = null;
    requestAnimationFrame(() => document.getElementById(`home-open-${pid}`)?.focus());
  }, [openId]);

  const summary = criteriaSummary(catalog.criteria) || "Todas las zonas y precios";
  const tabBtn = (v: View, label: string, testId: string) => (
    <button
      key={v}
      type="button"
      aria-pressed={view === v}
      onClick={() => setUi("homesView", v)}
      className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold sm:flex-none sm:px-3 sm:text-sm ${
        view === v ? "bg-white text-ink shadow-sm" : "text-ink/60 hover:text-ink"
      }`}
      data-testid={testId}
    >
      {label}
    </button>
  );

  const listCol = (
    <div className={`min-w-0 space-y-3 ${openId ? "hidden lg:block" : ""}`}>
      {/* Criterios resumidos y su editor */}
      <div className="rounded-xl border border-gold/20 bg-white/60" data-testid="criteria-bar">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs ${auto ? "bg-gold/20 text-ink/85" : "bg-ink/10 text-ink/65"}`}>{auto ? "Automático" : "Manual"}</span>
          <p className="min-w-0 flex-1 text-sm text-ink/80" data-testid="criteria-summary">
            {summary}
            {auto ? <span className="text-ink/50"> · máx. {catalog.criteria.max}</span> : null}
            {criteriaForm.edited ? <span className="ml-2 text-xs font-semibold text-amber-800">· cambios sin guardar</span> : null}
          </p>
          <button
            type="button"
            aria-expanded={criteriaOpen}
            aria-controls="cm-criteria"
            onClick={() => setUi("criteriaOpen", !criteriaOpen)}
            className="inline-flex items-center gap-1 rounded-lg border border-gold/40 px-3 py-1.5 text-sm text-ink/80 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Modificar criterios <ChevronDown className={`h-4 w-4 transition ${criteriaOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
        <div id="cm-criteria" hidden={!criteriaOpen} className="border-t border-gold/15 p-2">
          {criteriaOpen ? (
            <SelectionPanel
              catalogId={catalog.id}
              mode={catalog.mode}
              manualCount={catalog.manualCount}
              actions={props.selectionActions}
              run={props.run}
              pending={pending}
              form={criteriaForm}
              summarize={props.summarize}
            />
          ) : null}
        </div>
      </div>

      {/* Vistas */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Vista de la lista" className="flex min-w-0 flex-1 gap-1 rounded-lg bg-ink/5 p-1 sm:flex-none">
          {auto
            ? [
                tabBtn("catalogo", `En el catálogo · ${items.length}`, "view-catalogo"),
                tabBtn("coincidencias", `Coincidencias · ${catalog.autoMatched ?? catalog.autoTotal ?? items.length}`, "view-coincidencias"),
                tabBtn("excluidas", `Excluidas · ${nExcluded}`, "view-excluidas"),
              ]
            : [tabBtn("catalogo", `En el catálogo · ${items.length}`, "view-catalogo"), tabBtn("anadir", "Añadir", "view-anadir")]}
        </div>
        <span className="text-xs text-ink/55" data-testid="items-count">
          {props.countLabel}
        </span>
      </div>

      {auto ? (
        <details className="rounded-xl border border-gold/20 bg-gold/10 px-3 py-2 text-xs text-ink/70" data-testid="auto-note">
          <summary className="cursor-pointer">Cómo funciona la lista automática</summary>
          <p className="mt-1">
            Lista automática: sale de los criterios y se actualiza sola. Puedes incluir o excluir viviendas a mano; para ordenar a mano, pásalo a manual.
          </p>
        </details>
      ) : null}
      {auto && adj.overMax ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="over-max">
          Hay más inclusiones disponibles ({adj.included}) que el máximo ({catalog.criteria.max}): solo entran las primeras en el orden. Sube el máximo o quita una inclusión.
        </p>
      ) : null}
      {!auto && adj.included + adj.unavailable.length + nExcluded > 0 ? (
        <p className="text-xs text-ink/55" data-testid="stored-adjustments">
          Ajustes del modo automático guardados ({adj.included + adj.unavailable.length} inclusiones, {nExcluded} exclusiones): se vuelven a aplicar si pasas a automático.
        </p>
      ) : null}

      {view === "catalogo" ? (
        <>
          {auto && adj.unavailable.length ? (
            <details className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2" data-testid="unavailable-inclusions">
              <summary className="cursor-pointer text-xs font-semibold text-amber-900">Inclusiones que hoy no aparecen ({adj.unavailable.length})</summary>
              <ul className="mt-2 space-y-1">
                {adj.unavailable.map((it) => (
                  <li key={it.propertyId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70" data-check-overflow="no-disponible">
                    <span className="min-w-0 flex-1 basis-40">
                      {it.bcReference ? <span className="mr-2 text-ink/45">{it.bcReference}</span> : null}
                      {it.title} · {it.explain?.warnings.join(" · ")}
                    </span>
                    <button
                      type="button"
                      onClick={() => void props.adjust(it, "clear")}
                      disabled={pending}
                      aria-label={`Quitar la inclusión de «${it.title}»`}
                      className="rounded-md border border-gold/40 px-2 py-1 text-xs text-ink/80 hover:bg-white disabled:opacity-40"
                    >
                      Quitar inclusión
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-10 text-center text-sm text-ink/55">
              {auto ? "Ninguna vivienda encaja ahora con los criterios (o les falta foto)." : "Este catálogo todavía no tiene propiedades."}
            </div>
          ) : (
            <ol className="divide-y divide-gold/10 overflow-hidden rounded-xl border border-gold/15 bg-white/60" data-testid="homes-list">
              {items.map((it, i) => (
                <HomeRow key={it.propertyId} it={it} i={i} n={items.length} {...props} compact={!!openId} active={openId === it.propertyId} />
              ))}
            </ol>
          )}
        </>
      ) : null}

      {view === "coincidencias" ? (
        <p className="text-xs text-ink/55" data-testid="matches-note">
          La búsqueda enseña también las que coinciden pero no pueden entrar solas (por ejemplo, sin foto), con su motivo.
        </p>
      ) : null}
      {view === "coincidencias" ? (
        <PropertySearch
          catalogId={catalog.id}
          criteria={props.searchCriteria}
          search={props.search}
          mode="auto"
          autoRun
          uiKey="search-auto"
          refreshKey={`${items.map((x) => x.propertyId).join()}|${adj.included}|${nExcluded}|${adj.unavailable.length}`}
          disabled={archived || pending}
          onAdjust={(it, kind) => props.adjust(it, kind)}
          onClear={(it) => props.adjust(it, "clear")}
        />
      ) : null}

      {view === "excluidas" ? (
        nExcluded ? (
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
                    onClick={() => void props.adjust(it, "clear")}
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
        ) : (
          <p className="rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-6 text-center text-sm text-ink/55">No has excluido ninguna vivienda.</p>
        )
      ) : null}

      {view === "anadir" ? (
        <div className="space-y-2">
          <PropertySearch catalogId={catalog.id} criteria={props.searchCriteria} search={props.search} disabled={archived || pending} onAdd={props.addById} uiKey="search-manual" autoRun={!!draftsStore.ui<string>(catalog.id, "search-manual:text")} />
          <form onSubmit={props.addByReference} className="flex flex-col gap-2 rounded-xl border border-gold/20 bg-white/60 p-3 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="cm-ref">
              Referencia BC, slug o URL de la ficha
            </label>
            <input
              id="cm-ref"
              value={props.reference}
              onChange={(e) => props.setReference(e.target.value)}
              disabled={archived}
              placeholder="BC-1234, slug o URL de la ficha"
              className="min-w-0 flex-1 rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={pending || archived || !props.reference.trim()}
              className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold disabled:opacity-50"
            >
              Añadir
            </button>
          </form>
          <p className="text-xs text-ink/50">Solo propiedades que ya están en el CRM. Importar desde portales o PDF llega en la fase 3.</p>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={openId ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-start lg:gap-4" : ""}>
      {listCol}
      {openId ? (
        <SidePanel
          label={`Vivienda «${openItem?.title ?? openExcluded?.title ?? openUnavailable?.title ?? ""}»`}
          heading={openItem?.title ?? openExcluded?.title ?? openUnavailable?.title ?? "Vivienda"}
          sub={
            openItem ? (
              <>
                {[openItem.bcReference, openItem.zone ?? "Zona · sin dato"].filter(Boolean).join(" · ")} · posición {index + 1} de {items.length}
              </>
            ) : null
          }
          backLabel="Viviendas"
          onClose={() => onOpen(null)}
          onPrev={openItem ? (index > 0 ? () => onOpen(items[index - 1].propertyId) : null) : undefined}
          onNext={openItem ? (index < items.length - 1 ? () => onOpen(items[index + 1].propertyId) : null) : undefined}
          testId="home-panel"
        >
          <HomePanelBody {...props} item={openItem} excluded={openExcluded} unavailable={openUnavailable} index={index} message={message} />
        </SidePanel>
      ) : null}
    </div>
  );
}

function HomeRow({
  it,
  i,
  n,
  auto,
  archived,
  pending,
  compact,
  active,
  onOpen,
  move,
  remove,
  adjust,
}: HomesSectionProps & { it: CatalogItemView; i: number; n: number; compact: boolean; active: boolean }) {
  const badge = STATUS_LABEL[it.status];
  const warnings = auto ? it.explain?.warnings.length ?? 0 : 0;
  const manualPick = it.via === "include" || it.via === "both";
  const btn = "rounded-md px-2 py-1 text-xs disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold";
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 sm:flex-nowrap ${active ? "bg-gold/10" : ""}`} data-check-overflow="fila" data-testid="home-row">
      <span className="w-6 shrink-0 text-center text-xs text-ink/45">{i + 1}</span>
      <div className="h-9 w-12 shrink-0 overflow-hidden rounded bg-cream-200">
        {it.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full items-center justify-center text-[10px] text-ink/45">Sin foto</span>
        )}
      </div>
      <button
        type="button"
        id={`home-open-${it.propertyId}`}
        onClick={() => onOpen(active ? null : it.propertyId)}
        aria-expanded={active}
        aria-label={`Ver «${it.title}»`}
        className="min-w-0 flex-1 basis-40 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <p className="truncate text-sm text-ink">
          {it.bcReference ? <span className="mr-2 text-xs text-ink/45">{it.bcReference}</span> : null}
          {it.title}
        </p>
        <p className="truncate text-xs text-ink/55">
          <span className="text-ink/80">{it.price}</span>
          {compact ? null : <span className="hidden xl:inline"> · {facts(it)}</span>}
          {it.zone ? <span className="sm:hidden"> · {it.zone}</span> : null}
        </p>
      </button>
      {compact ? null : <span className="hidden w-44 shrink-0 truncate text-xs text-ink/55 md:block">{it.zone ?? "Zona · sin dato"}</span>}
      <div className="flex shrink-0 items-center gap-1">
        {badge ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">{badge}</span> : null}
        {manualPick ? <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] text-ink/75">Incluida a mano</span> : null}
        {warnings ? (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-800" title="Tiene avisos: ábrela para verlos" data-testid="row-warnings">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            {warnings}
            <span className="sr-only"> aviso{warnings === 1 ? "" : "s"}</span>
          </span>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {auto ? (
          <>
            {manualPick ? (
              <button
                type="button"
                onClick={() => void adjust(it, "clear")}
                disabled={pending || archived}
                aria-label={`Quitar la inclusión de «${it.title}»`}
                className={`${btn} border border-gold/40 text-ink/80 hover:bg-white`}
              >
                Quitar inclusión
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void adjust(it, "exclude")}
              disabled={pending || archived}
              aria-label={`Excluir «${it.title}»`}
              className={`${btn} text-red-700 hover:bg-red-50`}
            >
              Excluir
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => move(i, -1)} disabled={pending || i === 0} aria-label={`Subir «${it.title}»`} className={`${btn} p-1.5 text-ink/60 hover:bg-white`}>
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={pending || i === n - 1} aria-label={`Bajar «${it.title}»`} className={`${btn} p-1.5 text-ink/60 hover:bg-white`}>
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => remove(it)} disabled={pending} aria-label={`Quitar «${it.title}»`} className={`${btn} text-red-700 hover:bg-red-50`}>
              Quitar
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function HomePanelBody({
  item,
  excluded,
  unavailable,
  index,
  items,
  auto,
  archived,
  pending,
  message,
  move,
  remove,
  adjust,
  onEditText,
}: HomesSectionProps & { item: CatalogItemView | null; excluded: CatalogItemView | null; unavailable: CatalogItemView | null; index: number }) {
  const it = item ?? excluded ?? unavailable;
  if (!it) {
    return (
      <p className="text-sm text-ink/60" data-testid="home-gone">
        Ya no está en el catálogo.
      </p>
    );
  }
  const badge = STATUS_LABEL[it.status];
  const manualPick = it.via === "include" || it.via === "both";
  const btn = "rounded-lg px-3 py-1.5 text-sm disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold";
  return (
    <>
      {!item ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="home-gone">
          Ya no está en el catálogo{excluded ? ": la excluiste a mano." : unavailable ? ": la incluiste, pero hoy no puede aparecer." : "."}
        </p>
      ) : null}
      <div className="flex gap-3">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-md bg-cream-200">
          {it.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-ink/45">Sin foto</span>
          )}
        </div>
        <div className="min-w-0 text-xs text-ink/60">
          <p className="text-sm text-ink/85">{it.price}</p>
          <p>{it.operation}</p>
          <p>{facts(it)}</p>
          {badge ? <p className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{badge}</p> : null}
        </div>
      </div>

      <section aria-labelledby="hp-why" className="space-y-1 rounded-lg border border-gold/15 bg-cream-50/60 p-2">
        <h3 id="hp-why" className="crm-label-sm text-ink/70">
          Por qué está en el catálogo
        </h3>
        {auto && it.explain ? (
          <>
            <p className="text-xs text-ink/70" data-testid="item-reason">
              <span className={manualPick ? "text-gold" : "text-ink/80"}>{it.explain.headline}</span>
              {it.explain.details.length ? ` · ${it.explain.details.join(" · ")}` : ""}
            </p>
            {it.explain.warnings.length ? (
              <p className="text-xs text-amber-800" data-testid="item-warning">
                {it.explain.warnings.join(" · ")}
              </p>
            ) : null}
            <p className="text-xs text-ink/55">{manualPick ? "Incluida a mano: se queda aunque cambien los criterios." : "Por los criterios: entra y sale sola."}</p>
          </>
        ) : (
          <p className="text-xs text-ink/70">Elegida a mano: está en tu lista manual, en la posición {index + 1}.</p>
        )}
      </section>

      <SidePanelFooter message={message}>
        {item && auto ? (
          <>
            {manualPick ? (
              <button type="button" onClick={() => void adjust(it, "clear")} disabled={pending || archived} aria-label={`Quitar la inclusión de «${it.title}»`} className={`${btn} border border-gold/40 text-ink/80`}>
                Quitar inclusión
              </button>
            ) : null}
            <button type="button" onClick={() => void adjust(it, "exclude")} disabled={pending || archived} aria-label={`Excluir «${it.title}»`} className={`${btn} text-red-700 hover:bg-red-50`}>
              Excluir
            </button>
          </>
        ) : null}
        {item && !auto ? (
          <>
            <button type="button" onClick={() => move(index, -1)} disabled={pending || index === 0} aria-label={`Subir «${it.title}»`} className={`${btn} border border-gold/40 text-ink/80`}>
              Subir
            </button>
            <button type="button" onClick={() => move(index, 1)} disabled={pending || index === items.length - 1} aria-label={`Bajar «${it.title}»`} className={`${btn} border border-gold/40 text-ink/80`}>
              Bajar
            </button>
            <button type="button" onClick={() => remove(it)} disabled={pending} aria-label={`Quitar «${it.title}»`} className={`${btn} text-red-700 hover:bg-red-50`}>
              Quitar
            </button>
          </>
        ) : null}
        {excluded ? (
          <button type="button" onClick={() => void adjust(it, "clear")} disabled={pending} aria-label={`Volver a permitir «${it.title}»`} className={`${btn} border border-gold/40 text-ink/80`}>
            Volver a permitir
          </button>
        ) : null}
        {unavailable ? (
          <button type="button" onClick={() => void adjust(it, "clear")} disabled={pending} aria-label={`Quitar la inclusión de «${it.title}»`} className={`${btn} border border-gold/40 text-ink/80`}>
            Quitar inclusión
          </button>
        ) : null}
        {item ? (
          <button type="button" onClick={() => onEditText(it.propertyId)} className={`${btn} ml-auto text-ink/70 underline`}>
            Editar texto
          </button>
        ) : null}
      </SidePanelFooter>
    </>
  );
}
