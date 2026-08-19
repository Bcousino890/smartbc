"use client";

// ============================================================================
// SALES INBOX · la pantalla.
//
// Lista a la izquierda, lead a la derecha. La navegación principal es TRABAJO
// —qué necesita atención, qué es nuevo, qué toca hoy— y no entidades: las
// fuentes pasan a ser un filtro, que es lo que son.
//
// Todo el estado vive en la URL (`?view=&q=&lead=…`): se puede enlazar una
// bandeja concreta, recargar sin perder el sitio y volver con el botón de
// atrás. Los filtros y la paginación se resuelven EN SERVIDOR.
//
// En móvil no hay dos paneles: se ve la lista y, al tocar un lead, su ficha a
// pantalla completa; volver devuelve a la misma posición y filtro.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import type { LeadDetail } from "@/lib/db/queries/sales-inbox";
import type {
  CommercialState,
  InboxCounts,
  InboxGrouping,
  InboxSort,
  InboxView,
  LeadGroup,
  LeadListItem,
} from "@/lib/sales-inbox/types";
import { COMMERCIAL_STATES, INBOX_VIEWS } from "@/lib/sales-inbox/types";
import type { StaffRef } from "@/lib/portal-links/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/plural";
import { cn } from "@/lib/utils";
import { Button, Empty, Select } from "@/components/admin/ui/primitives";
import { LeadGroupBlock } from "./lead-group";
import { LeadRow } from "./lead-row";
import { LeadWorkspace } from "./lead-workspace";
import { bulkAssign, bulkDiscard, bulkSetFollowUp } from "../inbox-actions";

const COUNT_KEY: Record<InboxView, keyof InboxCounts> = {
  "needs-attention": "needsAttention",
  new: "new",
  "follow-up": "followUp",
  "my-leads": "myLeads",
  unassigned: "unassigned",
  all: "all",
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
}) {
  const t = useT();
  const tn = useTn();
  const router = useRouter();
  const params = useSearchParams();
  const config = getCountryConfig(country);
  const [pending, startNav] = useTransition();

  const [search, setSearch] = useState(params?.get("q") ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLUListElement>(null);

  const selectedId = params?.get("lead") ?? null;

  const setParams = useCallback(
    (patch: Record<string, string | null>, opts: { keepLead?: boolean } = {}) => {
      const qs = new URLSearchParams(params?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") qs.delete(k);
        else qs.set(k, v);
      }
      // Cambiar de vista o de filtro invalida la página y el lead abierto.
      if (!("page" in patch)) qs.delete("page");
      if (!opts.keepLead && !("lead" in patch)) qs.delete("lead");
      startNav(() => router.replace(`?${qs.toString()}`, { scroll: false }));
    },
    [params, router],
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

  // Teclado: ↑ y ↓ recorren la cola sin soltar el ratón. Se ignora mientras
  // se escribe en un campo, o no se podría teclear una búsqueda.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
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
      if (target) setParams({ lead: target.id }, { keepLead: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedId, setParams]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  const activeFilters = useMemo(
    () =>
      ["state", "assigned", "type", "intl", "unmatched"].filter((k) => params?.get(k)).length,
    [params],
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* ── Encabezado: cifras reales, no adornos ── */}
      <header className="relative shrink-0 border-b border-ink/10 bg-cream-50/70 px-4 pt-3 lg:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-[20px] text-ink">{t("inbox.title")}</h1>
          <div className="flex items-center gap-2">
            <label className="flex w-full max-w-[240px] items-center gap-2 rounded-md border border-ink/12 bg-white px-2.5 py-1.5 focus-within:border-gold/55 sm:max-w-xs">
              <Search size={13} strokeWidth={1.9} className="shrink-0 text-ink/40" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("inbox.searchPlaceholder")}
                aria-label={t("inbox.searchPlaceholder")}
                className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink/35"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label={t("inbox.clearSearch")}
                  className="shrink-0 text-ink/35 hover:text-ink/60"
                >
                  <X size={12} />
                </button>
              )}
            </label>
            {/* 332 consultas son 27 pisos: agruparlas cambia por completo
                cómo se lee la bandeja, así que el conmutador va a la vista, no
                escondido en los filtros. */}
            <div className="flex items-center gap-0.5 rounded-md border border-ink/12 p-0.5">
              {(["none", "property"] as InboxGrouping[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setParams({ group: g === "none" ? null : g })}
                  aria-pressed={grouping === g}
                  className={cn(
                    "whitespace-nowrap rounded px-2 py-1 text-[11px] font-medium transition",
                    grouping === g ? "bg-ink text-cream-50" : "text-ink/50 hover:text-ink",
                  )}
                >
                  {t(`inbox.group.by.${g}`)}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
            >
              <SlidersHorizontal size={12} strokeWidth={1.9} />
              {t("inbox.filters")}
              {activeFilters > 0 && (
                <span className="rounded bg-gold/20 px-1 text-[10px] font-semibold text-gold-dark">
                  {activeFilters}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Vistas = trabajo. Las fuentes son un filtro, no la navegación. */}
        {/* Seis vistas no caben en 390px: la tira se desliza y el velo del
            borde derecho lo hace evidente. Abreviar los rótulos sería peor. */}
        <nav
          aria-label={t("inbox.title")}
          className="relative mt-2 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {INBOX_VIEWS.map((v) => {
            const on = v === view;
            const n = counts[COUNT_KEY[v]];
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setParams({ view: v === "needs-attention" ? null : v })}
                className={cn(
                  "relative shrink-0 px-2.5 py-2 text-[12px] font-medium transition-colors sm:px-3",
                  on ? "text-ink" : "text-ink/45 hover:text-ink/75",
                )}
              >
                {t(`inbox.view.${v}`)}
                {n > 0 && (
                  <span
                    className={cn(
                      "ms-1.5 rounded px-1 py-px text-[10px] font-semibold tabular-nums",
                      on
                        ? v === "needs-attention"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-gold/15 text-gold-dark"
                        : "bg-ink/[0.06] text-ink/45",
                    )}
                  >
                    {n}
                  </span>
                )}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-2 bottom-0 h-[2px] origin-left rounded-full bg-ink transition-transform duration-300",
                    on ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </button>
            );
          })}
        </nav>
        <span
          aria-hidden
          className="pointer-events-none absolute end-0 h-9 w-10 -translate-y-9 bg-gradient-to-l from-cream-50 to-transparent sm:hidden"
        />

        {showFilters && (
          <div className="flex flex-wrap items-center gap-2 border-t border-ink/8 py-2">
            <Select
              value={params?.get("state") ?? ""}
              onChange={(e) => setParams({ state: e.target.value || null })}
              aria-label={t("inbox.filter.state")}
              className="w-auto py-1 text-[11.5px]"
            >
              <option value="">{t("inbox.filter.state")}</option>
              {COMMERCIAL_STATES.map((s: CommercialState) => (
                <option key={s} value={s}>
                  {t(`inbox.state.${s}`)}
                </option>
              ))}
            </Select>
            <Select
              value={params?.get("assigned") ?? ""}
              onChange={(e) => setParams({ assigned: e.target.value || null })}
              aria-label={t("inbox.assign.label")}
              className="w-auto py-1 text-[11.5px]"
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
              value={params?.get("type") ?? ""}
              onChange={(e) => setParams({ type: e.target.value || null })}
              aria-label={t("inbox.filter.type")}
              className="w-auto py-1 text-[11.5px]"
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
              on={params?.get("intl") === "1"}
              onClick={() => setParams({ intl: params?.get("intl") === "1" ? null : "1" })}
            />
            <FilterToggle
              label={t("inbox.filter.unmatched")}
              on={params?.get("unmatched") === "1"}
              onClick={() =>
                setParams({ unmatched: params?.get("unmatched") === "1" ? null : "1" })
              }
            />
            <Select
              value={params?.get("sort") ?? ""}
              onChange={(e) => setParams({ sort: e.target.value || null })}
              aria-label={t("inbox.sort.label")}
              className="ms-auto w-auto py-1 text-[11.5px]"
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
      </header>

      {/* ── Cuerpo: lista + workspace ── */}
      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col border-e border-ink/10 bg-white",
            "w-full lg:w-[430px] lg:shrink-0 xl:w-[480px]",
            selectedId && "hidden lg:flex",
          )}
        >
          {canEdit && (
            <div className="flex shrink-0 items-center gap-2 border-b border-ink/8 px-3 py-1.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) =>
                  setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())
                }
                disabled={items.length === 0}
                aria-label={t("inbox.bulk.selectAll")}
                className="h-3.5 w-3.5 accent-[#8a6d3b]"
              />
              <span className="text-[11px] text-ink/45">
                {selected.size > 0
                  ? t("inbox.bulk.selected", { count: selected.size })
                  : grouping === "property"
                    ? tn("inbox.resultsGrouped", total)
                    : tn("inbox.results", total)}
              </span>
              {pending && <span className="ms-auto text-[10.5px] text-ink/35">…</span>}
            </div>
          )}

          <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <li className="p-4">
                <Empty>{t(`inbox.empty.${view}`)}</Empty>
              </li>
            ) : grouping === "property" ? (
              groups.map((g) => (
                <LeadGroupBlock
                  key={g.key}
                  group={g}
                  country={country}
                  activeLeadId={selectedId}
                  selected={selected}
                  selectable={canEdit}
                  onOpen={(id) => setParams({ lead: id }, { keepLead: true })}
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
              ))
            ) : (
              items.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  active={lead.id === selectedId}
                  selected={selected.has(lead.id)}
                  selectable={canEdit}
                  locale={config.locale}
                  onOpen={() => setParams({ lead: lead.id }, { keepLead: true })}
                  onToggleSelect={(checked) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(lead.id);
                      else next.delete(lead.id);
                      return next;
                    })
                  }
                />
              ))
            )}
          </ul>

          {totalPages > 1 && (
            <nav
              aria-label={t("inbox.pagination")}
              className="flex shrink-0 items-center justify-between gap-2 border-t border-ink/8 px-3 py-2"
            >
              <Button
                size="sm"
                disabled={page <= 1}
                onClick={() => setParams({ page: String(page - 1) })}
              >
                <ChevronLeft size={12} />
              </Button>
              <span className="text-[11px] tabular-nums text-ink/45">
                {t("inbox.pageOf", { page, total: totalPages })}
              </span>
              <Button
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                <ChevronRight size={12} />
              </Button>
            </nav>
          )}
        </section>

        {/* Workspace */}
        <section
          className={cn(
            "min-h-0 min-w-0 flex-1 bg-cream-100/30",
            !selectedId && "hidden lg:block",
          )}
        >
          {selectedLead ? (
            <>
              <button
                type="button"
                onClick={() => setParams({ lead: null }, { keepLead: false })}
                className="flex w-full items-center gap-1.5 border-b border-ink/10 px-4 py-2 text-[12px] text-ink/60 lg:hidden"
              >
                <ArrowLeft size={14} strokeWidth={1.9} />
                {t("inbox.backToList")}
              </button>
              <LeadWorkspace
                lead={selectedLead}
                staff={staff}
                country={country}
                canEdit={canEdit}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <p className="max-w-xs text-center text-[12.5px] text-ink/35">
                {t("inbox.pickOne")}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ── Barra de lote ── */}
      {canEdit && selected.size > 0 && (
        <BulkBar
          ids={[...selected]}
          staff={staff}
          onDone={() => {
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
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
        "rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition",
        on
          ? "border-gold/50 bg-gold/10 text-gold-dark"
          : "border-ink/12 bg-white text-ink/55 hover:border-gold/40",
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
 */
function BulkBar({
  ids,
  staff,
  onDone,
}: {
  ids: string[];
  staff: StaffRef[];
  onDone: () => void;
}) {
  const t = useT();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok && r.error) alert(r.error);
      onDone();
    });

  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  };

  return (
    <div className="shrink-0 border-t border-ink/10 bg-ink px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-cream-50">
          {t("inbox.bulk.selected", { count: ids.length })}
        </span>
        <Select
          defaultValue=""
          disabled={pending}
          aria-label={t("inbox.bulk.assign")}
          onChange={(e) => {
            if (!e.target.value) return;
            run(() => bulkAssign(ids, e.target.value));
          }}
          className="w-auto py-1 text-[11.5px]"
        >
          <option value="">{t("inbox.bulk.assign")}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Button size="sm" disabled={pending} onClick={() => run(() => bulkSetFollowUp(ids, tomorrow()))}>
          {t("inbox.bulk.followUpTomorrow")}
        </Button>
        <Button size="sm" disabled={pending} onClick={() => run(() => bulkDiscard(ids))}>
          {t("inbox.bulk.discard")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} className="ms-auto text-cream-50/70">
          {t("cc.cancel")}
        </Button>
      </div>
    </div>
  );
}
