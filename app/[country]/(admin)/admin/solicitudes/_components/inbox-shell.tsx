"use client";

// ============================================================================
// SALES INBOX · la pantalla.
//
// La bandeja (tres vistas: tarjetas, por piso y prioridades) y, al abrir una
// solicitud, su ficha como página propia, con la estética del Figma «BCP
// Solicitudes» (capa `.sol-root`, app/globals.css). La navegación es TRABAJO
// —qué necesita atención, qué es nuevo, qué toca hoy— y no entidades: las
// fuentes pasan a ser un filtro, que es lo que son.
//
// Todo el estado vive en la URL (`?view=&q=&lead=…`): se puede enlazar una
// bandeja concreta, recargar sin perder el sitio y volver con el botón de
// atrás. Los filtros y la paginación se resuelven EN SERVIDOR.
//
// Volver de la ficha devuelve a la misma vista, posición y filtro.
// ============================================================================

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Plus, Search, X } from "lucide-react";
import type { LeadDetail } from "@/lib/db/queries/sales-inbox";
import type { ExtensionCaptureStatus } from "@/lib/db/queries/extension-status";
import type {
  CommercialState,
  InboxCounts,
  InboxGrouping,
  InboxLayout,
  InboxSort,
  InboxView,
  LeadGroup,
  LeadListItem,
  OperationFilter,
  PriorityBoard,
} from "@/lib/sales-inbox/types";
import { COMMERCIAL_STATES, INBOX_VIEWS_SHOWN } from "@/lib/sales-inbox/types";
import type { StaffRef } from "@/lib/portal-links/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { RelativeTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/relative-time";
import { cn } from "@/lib/utils";
import { Button, Empty, Labeled, Modal, Pill, Select, TextArea } from "@/components/admin/ui/primitives";
import { LeadCard } from "./lead-card";
import { LeadGroupBlock } from "./lead-group";
import { LeadWorkspace } from "./lead-workspace";
import { PriorityBoardView } from "./priority-board";
import { bulkAssign, bulkDiscard, bulkSetFollowUp, type BulkItemResult } from "../inbox-actions";

/**
 * Las claves que cambian QUÉ FILAS hay. Tocar una invalida la página actual
 * —si estabas en la 5 de 12 y filtras, esa página puede ya no existir— y
 * también el lead abierto, que puede no estar en el conjunto nuevo.
 *
 * ⚠️ Seleccionar un lead NO está aquí, y esa es toda la corrección. La regla
 * anterior era la contraria ("borra `page` salvo que me la pasen"), y como
 * abrir un lead manda solo `{ lead }`, cada clic en la lista devolvía a la
 * página 1. Trabajar la página 4 de la bandeja era imposible.
 */
const RESULT_SET_KEYS = new Set([
  "view",
  "q",
  "state",
  "assigned",
  "type",
  "intl",
  "unmatched",
  "op",
  "group",
  "mode",
  "routing",
  // Reordenar sí cambia qué hay en la página 3, así que también resetea.
  "sort",
]);

const COUNT_KEY: Record<InboxView, keyof InboxCounts> = {
  "needs-attention": "needsAttention",
  new: "new",
  "follow-up": "followUp",
  "my-leads": "myLeads",
  unassigned: "unassigned",
  all: "all",
  retired: "retired",
};

export function InboxShell({
  view,
  counts,
  items,
  groups,
  grouping,
  total,
  page,
  pageSize,
  selectedLead,
  staff,
  country,
  canEdit,
  isAdmin = false,
  layout = "cards",
  sort = "newest",
  board = null,
  extensionStatus = null,
}: {
  view: InboxView;
  counts: InboxCounts;
  items: LeadListItem[];
  groups: LeadGroup[];
  grouping: InboxGrouping;
  total: number;
  page: number;
  pageSize: number;
  selectedLead: LeadDetail | null;
  staff: StaffRef[];
  country: Country;
  canEdit: boolean;
  isAdmin?: boolean;
  /** A · Tarjetas · B · Por inmueble · C · Prioridades. Misma bandeja. */
  layout?: InboxLayout;
  /** Orden efectivo de la lista (el elegido o el de la vista). */
  sort?: InboxSort;
  /** Última captura del inbox: si la extensión va atrasada, se avisa aquí. */
  extensionStatus?: ExtensionCaptureStatus | null;
  board?: (PriorityBoard & { unplanned: number }) | null;
}) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const config = getCountryConfig(country);
  const [pending, startNav] = useTransition();

  const [search, setSearch] = useState(params?.get("q") ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Selección EXPLÍCITA: las casillas solo aparecen al pedirlo, para no
  // ocupar cada tarjeta con un control que casi nunca se usa.
  const [selectMode, setSelectMode] = useState(false);
  const savedScroll = useRef(0);

  // Respuesta inmediata: al pulsar un segmento, una vista, un filtro o una
  // solicitud, la pantalla refleja el cambio YA (botón marcado, ficha abierta
  // con «Cargando…»), sin esperar a que el servidor devuelva la página nueva.
  // En cuanto llega, la URL real manda y esto se descarta.
  const [optimistic, setOptimistic] = useState<URLSearchParams | null>(null);
  const paramsKey = params?.toString() ?? "";
  useEffect(() => {
    setOptimistic(null);
  }, [paramsKey]);
  const cur = optimistic ?? params;
  const viewShown: InboxView = optimistic ? ((optimistic.get("view") as InboxView | null) ?? "all") : view;
  const layoutShown: InboxLayout = optimistic
    ? ((optimistic.get("mode") as InboxLayout | null) ?? (optimistic.get("group") === "property" ? "property" : "cards"))
    : layout;

  const selectedId = cur?.get("lead") ?? null;

  // La ficha es una página propia (Figma A02): al abrirla se guarda el scroll
  // de la bandeja y se sube arriba; al volver se restaura. La bandeja sigue
  // montada (oculta) mientras tanto, así que conserva lo desplegado.
  useEffect(() => {
    if (selectedId) {
      window.scrollTo({ top: 0 });
      return;
    }
    const top = savedScroll.current;
    requestAnimationFrame(() => window.scrollTo({ top }));
  }, [selectedId]);
  const openLead = (id: string) => {
    if (!selectedId) savedScroll.current = window.scrollY;
    setParams({ lead: id });
  };

  const setParams = useCallback(
    (patch: Record<string, string | null>, opts: { replace?: boolean } = {}) => {
      const qs = new URLSearchParams((optimistic ?? params)?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") qs.delete(k);
        else qs.set(k, v);
      }
      // Solo un cambio de filtro invalida la página y el lead abierto. Abrir un
      // lead conserva las dos cosas: es la misma bandeja, mirada por dentro.
      if (Object.keys(patch).some((k) => RESULT_SET_KEYS.has(k))) {
        qs.delete("page");
        if (!("lead" in patch)) qs.delete("lead");
      }
      // Abrir un lead SÍ merece entrada en el historial: es lo que hace que el
      // Atrás del navegador devuelva a la lista donde estabas después de
      // saltar a la ficha del cliente o a la de la propiedad. Filtrar, teclear
      // en el buscador o recorrer con las flechas, no: con el freno de 350 ms
      // y una pulsación por fila, el Atrás quedaría inservible.
      const href = `?${qs.toString()}`;
      const opensLead = "lead" in patch && patch.lead !== null;
      setOptimistic(new URLSearchParams(qs.toString()));
      startNav(() => {
        if (opensLead && !opts.replace) router.push(href, { scroll: false });
        else router.replace(href, { scroll: false });
      });
    },
    [params, optimistic, router],
  );

  // Búsqueda con freno: sin él, cada tecla sería una consulta al servidor.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      setParams({ q: search.trim() || null });
    }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Teclado: dentro de una ficha, ↑ y ↓ pasan a la solicitud anterior o
  // siguiente de la cola sin volver a la bandeja. Se ignora mientras
  // se escribe en un campo, o no se podría teclear una búsqueda.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      // Con la bandeja a la vista las flechas desplazan la página.
      if (!selectedId) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return;
      if (items.length === 0) return;
      e.preventDefault();
      const idx = items.findIndex((i) => i.id === selectedId);
      const next =
        e.key === "ArrowDown"
          ? Math.min(items.length - 1, idx + 1)
          : Math.max(0, idx <= 0 ? 0 : idx - 1);
      const target = items[next];
      // Recorrer con el teclado no llena el historial: replace.
      if (target) setParams({ lead: target.id }, { replace: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedId, setParams]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  const activeFilters = useMemo(
    () =>
      ["state", "assigned", "type", "intl", "unmatched", "op"].filter((k) => cur?.get(k)).length,
    [cur],
  );

  // Cabecera ligera (maqueta 2026-11-03): los controles pesan poco y las
  // tarjetas son lo primero que destaca. Foco visible de teclado y zonas de
  // 44 px en móvil en todos los controles.
  const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sol-accent";
  // Pestaña de estado: texto normal, contador discreto, subrayado fino en
  // dorado apagado para la activa. Sin recuadro.
  const tabCls = (on: boolean) =>
    cn(
      "relative inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap px-1 sol-ui transition-colors sm:px-2",
      focusRing,
      on ? "text-sol-ink" : "text-sol-muted hover:text-sol-ink",
    );
  // Selector compacto (operación y vistas): un solo borde exterior y fondo
  // tenue para la opción activa.
  const segGroupCls = "inline-flex items-center gap-0.5 rounded-lg border border-sol-line bg-sol-surface p-0.5";
  const segItemCls = (on: boolean) =>
    cn(
      "inline-flex min-h-[36px] items-center justify-center whitespace-nowrap rounded-md px-3 sol-ui transition",
      focusRing,
      on ? "bg-sol-select font-semibold text-sol-ink" : "text-sol-muted hover:text-sol-ink",
    );

  return (
    <div className="sol-root min-h-screen">
      {/* Mientras llega la página nueva, una barra fina arriba dice que algo
          está pasando: el botón ya se ha marcado. */}
      {pending && (
        <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden lg:left-[260px]">
          <div className="h-full w-1/3 animate-[solProgress_1s_ease-in-out_infinite] bg-sol-accent-bar" />
        </div>
      )}
      {/* ── La bandeja (oculta, pero montada, mientras se mira una ficha) ── */}
      <div className={cn("px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8", selectedId && "hidden")}>
        {extensionStatus?.outdated && (
          <ExtensionNotice status={extensionStatus} isAdmin={isAdmin} locale={config.locale} />
        )}
        <header>
          <p className="sol-meta text-sol-muted">
            {t("inbox.breadcrumb")} <span aria-hidden>/</span> {t("inbox.title")}
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="crm-page-title text-sol-ink">{t("inbox.title")}</h1>
              <p className="mt-1.5 text-base text-sol-muted">{t(`inbox.subtitle.${layout}`)}</p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-sol-line bg-sol-surface px-3.5 focus-within:border-sol-action focus-within:ring-2 focus-within:ring-sol-action/15 sm:w-[300px] sm:flex-none">
                <Search size={16} strokeWidth={2} className="shrink-0 text-sol-muted" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("inbox.searchPlaceholder")}
                  aria-label={t("inbox.searchPlaceholder")}
                  className="w-full bg-transparent sol-ui text-sol-ink outline-none placeholder:text-sol-faint"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label={t("inbox.clearSearch")}
                    className="shrink-0 text-sol-faint hover:text-sol-ink"
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                className={cn(
                  "inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border px-4 sol-ui text-sol-ink transition",
                  focusRing,
                  showFilters ? "border-sol-accent/60 bg-sol-select" : "border-sol-line bg-sol-surface hover:border-sol-accent/40",
                )}
              >
                {t("inbox.filters")}
                {activeFilters > 0 ? (
                  <span className="min-w-[20px] rounded-full bg-sol-select px-1.5 text-center sol-meta font-semibold tabular-nums text-sol-accent">
                    {activeFilters}
                  </span>
                ) : (
                  <Plus size={14} strokeWidth={2} className={cn("text-sol-muted transition-transform", showFilters && "rotate-45")} />
                )}
              </button>
            </div>
          </div>

          {/* Vistas = trabajo. Las fuentes son un filtro, no la navegación.
              En 390 px la tira se desliza. */}
          <nav
            aria-label={t("inbox.title")}
            className="-mx-4 mt-5 flex gap-4 overflow-x-auto border-b border-sol-line px-4 [scrollbar-width:none] sm:mx-0 sm:gap-6 sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {INBOX_VIEWS_SHOWN.map((v) => {
              const on = v === viewShown;
              const n = counts[COUNT_KEY[v]];
              return (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setParams({ view: v === "all" ? null : v })}
                  className={tabCls(on)}
                >
                  {t(`inbox.view.${v}`)}
                  {n > 0 && <span className={cn("sol-meta tabular-nums", on ? "text-sol-muted" : "text-sol-faint")}>{n}</span>}
                  {/* Subrayado fino en dorado apagado; pisa la línea del nav. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-sol-accent/70 transition-opacity",
                      on ? "opacity-100" : "opacity-0",
                    )}
                  />
                </button>
              );
            })}
          </nav>

          {showFilters && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-sol-line bg-sol-surface p-3">
              <Select
                value={cur?.get("state") ?? ""}
                onChange={(e) => setParams({ state: e.target.value || null })}
                aria-label={t("inbox.filter.state")}
                className="w-auto"
              >
                <option value="">{t("inbox.filter.state")}</option>
                {COMMERCIAL_STATES.map((s: CommercialState) => (
                  <option key={s} value={s}>
                    {t(`inbox.state.${s}`)}
                  </option>
                ))}
              </Select>
              <Select
                value={cur?.get("assigned") ?? ""}
                onChange={(e) => setParams({ assigned: e.target.value || null })}
                aria-label={t("inbox.assign.label")}
                className="w-auto"
              >
                <option value="">{t("inbox.filter.anyAgent")}</option>
                <option value="me">{t("inbox.filter.mine")}</option>
                <option value="none">{t("inbox.row.unassigned")}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select
                value={cur?.get("type") ?? ""}
                onChange={(e) => setParams({ type: e.target.value || null })}
                aria-label={t("inbox.filter.type")}
                className="w-auto"
              >
                <option value="">{t("inbox.filter.type")}</option>
                {["particular", "agencia", "relocation"].map((x) => (
                  <option key={x} value={x}>
                    {t(`inbox.type.${x}`)}
                  </option>
                ))}
              </Select>
              <FilterToggle
                label={t("inbox.filter.international")}
                on={cur?.get("intl") === "1"}
                onClick={() => setParams({ intl: cur?.get("intl") === "1" ? null : "1" })}
              />
              <FilterToggle
                label={t("inbox.filter.unmatched")}
                on={cur?.get("unmatched") === "1"}
                onClick={() =>
                  setParams({ unmatched: cur?.get("unmatched") === "1" ? null : "1" })
                }
              />
              <Select
                value={cur?.get("sort") ?? ""}
                onChange={(e) => setParams({ sort: e.target.value || null })}
                aria-label={t("inbox.sort.label")}
                className="w-auto sm:ms-auto"
              >
                <option value="">{t("inbox.sort.default")}</option>
                {(["newest", "oldest", "activity", "due"] as InboxSort[]).map((s) => (
                  <option key={s} value={s}>
                    {t(`inbox.sort.${s}`)}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Operación y selección a la izquierda, alineadas con las tarjetas;
              el conmutador de vista SIEMPRE a la derecha (en su fila en móvil),
              sin que lo desplace lo que haya a la izquierda. La línea de
              resultados y orden se quitó (maqueta): el orden sigue en Filtros. */}
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 lg:flex-1">
              {canEdit && selectMode && layout !== "priorities" && (
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())
                  }
                  disabled={items.length === 0}
                  aria-label={t("inbox.bulk.selectAll")}
                  className="h-5 w-5 accent-sol-action"
                />
              )}
              {/* Venta o alquiler es una decisión de trabajo constante: vive a
                  la vista. «Sin determinar» es un segmento más, no un residuo. */}
              <div className={segGroupCls}>
                {([null, "sale", "rent", "unknown"] as (OperationFilter | null)[]).map((o) => {
                  const on = (cur?.get("op") ?? null) === o;
                  return (
                    <button key={o ?? "all"} type="button" onClick={() => setParams({ op: o })} aria-pressed={on} className={segItemCls(on)}>
                      {t(`inbox.operation.${o ?? "all"}`)}
                    </button>
                  );
                })}
              </div>
              {canEdit && layout !== "priorities" && (
                <button
                  type="button"
                  aria-pressed={selectMode}
                  onClick={() => {
                    setSelectMode((v) => !v);
                    setSelected(new Set());
                  }}
                  className={cn("min-h-[36px] rounded-md px-2 sol-ui text-sol-accent underline-offset-2 hover:underline", focusRing)}
                >
                  {selectMode ? t("inbox.bulk.exitSelect") : t("inbox.bulk.select")}
                </button>
              )}
              {/* Lo seleccionado se dice aquí (y en la barra de lote); el
                  contador de resultados ya no se enseña. */}
              {selected.size > 0 && (
                <span className="sol-meta text-sol-muted" aria-live="polite">
                  {t("inbox.bulk.selected", { count: selected.size })}
                </span>
              )}
              {pending && <span className="sol-meta text-sol-faint" aria-hidden>…</span>}
            </div>
            {/* Tres maneras de mirar la MISMA bandeja: mismos filtros, misma
                ficha y mismas acciones. */}
            <div role="group" aria-label={t("inbox.layout.label")} className={cn(segGroupCls, "w-full shrink-0 lg:w-auto lg:ms-6")}>
              {(["cards", "property", "priorities"] as InboxLayout[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setParams({ mode: l === "cards" ? null : l, group: null })}
                  aria-pressed={layoutShown === l}
                  className={cn(segItemCls(layoutShown === l), "flex-1 lg:flex-none lg:min-w-[112px]")}
                >
                  {t(`inbox.layout.${l}`)}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ── Contenido ── */}
        <div className={cn("mt-5", pending && "opacity-70")}>
          {layout === "priorities" && board ? (
            <PriorityBoardView
              board={board}
              activeLeadId={selectedId}
              locale={config.locale}
              onOpen={openLead}
              onShowCards={() => setParams({ mode: null })}
            />
          ) : items.length === 0 ? (
            <Empty
              action={
                activeFilters > 0 || params?.get("q") ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setParams({ q: null, state: null, assigned: null, type: null, intl: null, unmatched: null, op: null, routing: null });
                    }}
                  >
                    {t("inbox.clearFilters")}
                  </Button>
                ) : undefined
              }
            >
              {t(`inbox.empty.${view}`)}
            </Empty>
          ) : layout === "property" ? (
            <>
              <ul className="space-y-5">
                {groups.map((g, i) => (
                  <Fragment key={g.key}>
                  {/* Los anuncios ya retirados van aparte, después de los
                      publicados: siguen teniendo su origen, pero no son
                      oferta viva. Caducan con la solicitud (30 días). */}
                  {g.retired && !groups[i - 1]?.retired && (
                    <li className="list-none pt-4">
                      <h2 className="crm-section-title text-sol-ink">{t("inbox.retired.title")}</h2>
                      <p className="mt-1 text-sm text-sol-muted">{t("inbox.retired.hint")}</p>
                    </li>
                  )}
                  <LeadGroupBlock
                    group={g}
                    country={country}
                    activeLeadId={selectedId}
                    selected={selected}
                    selectable={canEdit && selectMode}
                    onOpen={openLead}
                    onToggleSelect={(id, checked) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(id);
                        else next.delete(id);
                        return next;
                      })
                    }
                    onToggleGroup={(ids, checked) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const id of ids) {
                          if (checked) next.add(id);
                          else next.delete(id);
                        }
                        return next;
                      })
                    }
                  />
                  </Fragment>
                ))}
              </ul>
              <p className="mt-6 sol-ui text-sol-muted">{t("inbox.group.rule")}</p>
            </>
          ) : (
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {items.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  active={lead.id === selectedId}
                  locale={config.locale}
                  selectMode={canEdit && selectMode}
                  selected={selected.has(lead.id)}
                  onOpen={() => openLead(lead.id)}
                  onToggleSelect={(checked) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(lead.id);
                      else next.delete(lead.id);
                      return next;
                    })
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {layout !== "priorities" && totalPages > 1 && (
          <nav
            aria-label={t("inbox.pagination")}
            className="mt-8 flex items-center justify-center gap-4"
          >
            <Button
              disabled={page <= 1}
              onClick={() => setParams({ page: String(page - 1) })}
              aria-label={t("reparto.prev")}
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm tabular-nums text-sol-muted">
              {t("inbox.pageOf", { page, total: totalPages })}
            </span>
            <Button
              disabled={page >= totalPages}
              onClick={() => setParams({ page: String(page + 1) })}
              aria-label={t("reparto.next")}
            >
              <ChevronRight size={16} />
            </Button>
          </nav>
        )}
      </div>

      {/* ── La ficha: página propia (Figma A02) ── */}
      {selectedId && (
        <div className="px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-6 lg:pt-6">
          {selectedLead && selectedLead.id === selectedId ? (
            // `key` por lead: sin él React reutiliza la ficha al cambiar de
            // solicitud y arrastra su estado local (el formulario de cliente
            // con el teléfono anterior, la traducción, las notas).
            <LeadWorkspace
              key={selectedLead.id}
              lead={selectedLead}
              staff={staff}
              country={country}
              canEdit={canEdit}
              isAdmin={isAdmin}
              backLabel={t(`inbox.backTo.${layout}`)}
              onClose={() => setParams({ lead: null })}
            />
          ) : (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
              <p className="max-w-xs text-center text-sm text-sol-muted" aria-live="polite">
                {pending ? t("inbox.loadingLead") : t("inbox.pickOne")}
              </p>
              <Button onClick={() => setParams({ lead: null })}>
                <ArrowLeft size={16} /> {t(`inbox.backTo.${layout}`)}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Barra de lote ── */}
      {canEdit && selected.size > 0 && !selectedId && (
        <BulkBar
          ids={[...selected]}
          staff={staff}
          isAdmin={isAdmin}
          onDone={() => {
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * La extensión que captura el inbox se ha quedado atrás: sin el código del
 * anuncio no hay foto, ni «Por piso», ni reparto automático. Se dice aquí,
 * donde se ve, con el paquete al día para descargar (administradores) y los
 * pasos. Desaparece solo en cuanto llega una captura de la versión exigida.
 */
function ExtensionNotice({
  status,
  isAdmin,
  locale,
}: {
  status: ExtensionCaptureStatus;
  isAdmin: boolean;
  locale: string;
}) {
  const t = useT();
  return (
    <section
      role="status"
      data-extension-notice=""
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-sol-ink"
    >
      <p className="text-lg font-semibold">{t("inbox.extension.title")}</p>
      <p className="mt-1 text-sm text-sol-muted">
        {t("inbox.extension.body", { required: status.required })}{" "}
        {status.at ? (
          <>
            {t("inbox.extension.lastCapture", { version: status.version ?? t("inbox.extension.oldVersion") })}{" "}
            <RelativeTime at={status.at} locale={locale} />.
          </>
        ) : null}
      </p>
      <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm text-sol-ink">
        <li>{t("inbox.extension.step1")}</li>
        <li>{t("inbox.extension.step2")}</li>
        <li>{t("inbox.extension.step3", { version: status.available })}</li>
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {isAdmin ? (
          <a
            href="/api/admin/idealista/extension-download"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-ink px-4 text-sm font-bold uppercase tracking-wider text-cream-50 hover:bg-ink-soft"
          >
            <Download size={15} strokeWidth={2} />
            {t("inbox.extension.download", { version: status.available })}
          </a>
        ) : (
          <span className="text-sm text-sol-muted">{t("inbox.extension.askAdmin")}</span>
        )}
      </div>
    </section>
  );
}

function FilterToggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "min-h-[44px] rounded-md border px-3.5 text-sm font-semibold transition",
        on
          ? "border-sol-action bg-sol-select text-sol-action"
          : "border-sol-line bg-sol-surface text-sol-ink hover:border-sol-action/40",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Acciones en lote. A propósito NO hay envío masivo de WhatsApp ni de email:
 * una bandeja con cientos de leads y un botón de "escribir a todos" es una
 * forma rápida de quemar la cuenta. El lote ordena el trabajo; no hace
 * campañas.
 *
 * Asignar en lote es de administradores y devuelve el resultado de CADA
 * solicitud (las que tienen cliente vinculado se reasignan desde su ficha).
 * Descartar pide motivo y confirma el alcance.
 */
function BulkBar({
  ids,
  staff,
  isAdmin,
  onDone,
}: {
  ids: string[];
  staff: StaffRef[];
  isAdmin: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "assign" | "discard">(null);
  const [advisor, setAdvisor] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BulkItemResult[] | null>(null);

  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  };

  const close = () => {
    setDialog(null);
    setResults(null);
    setError(null);
  };

  return (
    <div className="sticky bottom-0 z-20 border-t border-sol-line bg-sol-surface px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-sol-ink">
          {t("inbox.bulk.selected", { count: ids.length })}
        </span>
        {isAdmin && (
          <Button size="sm" disabled={pending} onClick={() => setDialog("assign")}>
            {t("inbox.bulk.assign")}
          </Button>
        )}
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await bulkSetFollowUp(ids, tomorrow());
              if (!r.ok) setError(r.error);
              else onDone();
            })
          }
        >
          {t("inbox.bulk.followUpTomorrow")}
        </Button>
        <Button size="sm" disabled={pending} onClick={() => setDialog("discard")}>
          {t("inbox.bulk.discard")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} className="ms-auto">
          {t("cc.cancel")}
        </Button>
      </div>
      {error && !dialog && <p role="alert" className="mt-1 text-sm text-sol-error">{error}</p>}

      {dialog === "assign" && (
        <Modal
          open
          onClose={close}
          title={t("inbox.bulk.assignTitle", { count: ids.length })}
          footer={
            results ? (
              <Button variant="primary" onClick={() => { close(); onDone(); }}>{t("reparto.result.close")}</Button>
            ) : (
              <>
                <Button onClick={close} disabled={pending}>{t("common.cancel")}</Button>
                <Button
                  variant="primary"
                  disabled={pending || !advisor}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const r = await bulkAssign(ids, advisor);
                      if (!r.ok) setError(r.error);
                      else setResults(r.results);
                    })
                  }
                >
                  {pending ? t("cc.saving") : t("inbox.assignDialog.confirm")}
                </Button>
              </>
            )
          }
        >
          {results ? (
            <>
              <p role="status" className="text-sm text-ink/70">
                {t("reparto.result.summary", {
                  ok: results.filter((r) => r.ok).length,
                  conflicts: results.filter((r) => !r.ok).length,
                })}
              </p>
              <ul className="mt-2 max-h-64 divide-y divide-ink/6 overflow-y-auto text-xs">
                {results.filter((r) => !r.ok).map((r) => (
                  <li key={r.id} className="py-1.5 text-rose-700">{r.error}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="text-sm text-ink/65">{t("inbox.bulk.assignIntro")}</p>
              <Labeled label={t("inbox.assignDialog.advisor")} className="mt-3">
                <Select value={advisor} onChange={(e) => setAdvisor(e.target.value)}>
                  <option value="">{t("reparto.dialog.chooseAdvisor")}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Labeled>
              {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
            </>
          )}
        </Modal>
      )}

      {dialog === "discard" && (
        <Modal
          open
          onClose={close}
          title={t("inbox.bulk.discardTitle", { count: ids.length })}
          footer={
            <>
              <Button onClick={close} disabled={pending}>{t("common.cancel")}</Button>
              <Button
                variant="primary"
                disabled={pending || !reason.trim()}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await bulkDiscard(ids, reason.trim());
                    if (!r.ok) setError(r.error);
                    else {
                      close();
                      onDone();
                    }
                  })
                }
              >
                {t("inbox.discard")}
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink/65">{t("inbox.discardDialog.intro")}</p>
          <Pill tone="warning" className="mt-2">{t("inbox.bulk.selected", { count: ids.length })}</Pill>
          <Labeled label={t("inbox.discardDialog.reason")} className="mt-3">
            <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Labeled>
          {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        </Modal>
      )}
    </div>
  );
}
