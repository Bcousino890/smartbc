"use client";

// ============================================================================
// PROPERTIES WORKSPACE · la pantalla.
//
// Lista a la izquierda, Property Command Center a la derecha. Sustituye a la
// tabla de once columnas y 1.200 px que descargaba el catálogo entero (4,3 MB
// con 16.549 filas de foto) y filtraba en el navegador.
//
// Todo el estado vive en la URL (`?view=&q=&p=…`): se puede enlazar una vista,
// recargar sin perder el sitio y volver con el botón de atrás. Filtros,
// búsqueda, orden y paginación se resuelven EN SERVIDOR.
//
// En móvil no hay dos paneles: lista, y al tocar, la propiedad a pantalla
// completa; volver conserva filtros, página y selección.
// ============================================================================

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  MessageCircle,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { PropertyWorkspaceDetail } from "@/lib/db/queries/properties-workspace";
import {
  WORKSPACE_VIEWS,
  type PropertyListItem,
  type WorkspaceCounts,
  type WorkspaceSort,
  type WorkspaceTab,
  type WorkspaceView,
} from "@/lib/properties-workspace/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { PORTAL_URL } from "@/lib/portal-url";
import { useT } from "@/lib/i18n/provider";
import { useTn } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/plural";
import { cn } from "@/lib/utils";
import { Button, Empty, Select, TextInput } from "@/components/admin/ui/primitives";
import { NewPropertyModal } from "@/components/admin/new-property-modal";
import { bulkArchive, bulkPublishWeb } from "../workspace-actions";
import { PropertyRow } from "./property-row";
import { PropertyWorkspace } from "./property-workspace";

const COUNT_KEY: Record<WorkspaceView, keyof WorkspaceCounts> = {
  all: "all",
  available: "available",
  "needs-attention": "needsAttention",
  "client-interest": "clientInterest",
  "upcoming-viewings": "upcomingViewings",
  archived: "archived",
};

export function WorkspaceShell({
  view,
  tab,
  counts,
  items,
  total,
  page,
  pageSize,
  detail,
  zones,
  agencies,
  country,
  canCreate,
  canEdit,
  canPublish,
}: {
  view: WorkspaceView;
  tab: WorkspaceTab;
  counts: WorkspaceCounts;
  items: PropertyListItem[];
  total: number;
  page: number;
  pageSize: number;
  detail: PropertyWorkspaceDetail | null;
  zones: string[];
  agencies: Array<{ id: string; name: string; slug: string }>;
  country: Country;
  canCreate: boolean;
  canEdit: boolean;
  canPublish: boolean;
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
  const [createOpen, setCreateOpen] = useState(false);

  const selectedId = params?.get("p") ?? null;

  const setParams = useCallback(
    (patch: Record<string, string | null>, opts: { keepSelection?: boolean } = {}) => {
      const qs = new URLSearchParams(params?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") qs.delete(k);
        else qs.set(k, v);
      }
      if (!("page" in patch)) qs.delete("page");
      if (!opts.keepSelection && !("p" in patch)) qs.delete("p");
      startNav(() => router.replace(`?${qs.toString()}`, { scroll: false }));
    },
    [params, router],
  );

  // Búsqueda con freno: cada tecla no puede ser una consulta.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = window.setTimeout(() => setParams({ q: search.trim() || null }), 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ↑/↓ recorren el catálogo sin soltar el ratón. Se ignora mientras se
  // escribe en un campo.
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
      if (target) setParams({ p: target.id }, { keepSelection: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedId, setParams]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const activeFilters = [
    "operation", "zona", "agencia", "dormitorios", "banos", "precioMin", "precioMax",
    "m2Min", "m2Max", "pub", "fotos", "video", "plano", "sinDireccion", "sinCoords",
    "rancias", "origen",
  ].filter((k) => params?.get(k)).length;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* ── Encabezado ── */}
      <header className="shrink-0 border-b border-ink/10 bg-cream-50/70 px-4 pt-3 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-serif text-[20px] text-ink">{t("pw.title")}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex w-full max-w-[220px] items-center gap-2 rounded-md border border-ink/12 bg-white px-2.5 py-1.5 focus-within:border-gold/55 sm:max-w-xs">
              <Search size={13} strokeWidth={1.9} className="shrink-0 text-ink/40" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("pw.searchPlaceholder")}
                aria-label={t("pw.searchPlaceholder")}
                className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink/35"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} aria-label={t("inbox.clearSearch")} className="shrink-0 text-ink/35 hover:text-ink/60">
                  <X size={12} />
                </button>
              )}
            </label>
            <Button size="sm" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
              <SlidersHorizontal size={12} strokeWidth={1.9} />
              {t("inbox.filters")}
              {activeFilters > 0 && (
                <span className="rounded bg-gold/20 px-1 text-[10px] font-semibold text-gold-dark">{activeFilters}</span>
              )}
            </Button>
            {canCreate && (
              <>
                <Link
                  href={`${config.prefix}/propiedades/importar`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink/70 transition hover:border-gold/50"
                >
                  {t("pw.import")}
                </Link>
                <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={12} strokeWidth={2} className="text-gold" />
                  {t("pw.new")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Vistas = trabajo */}
        <nav aria-label={t("pw.title")} className="relative mt-2 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {WORKSPACE_VIEWS.map((v) => {
            const on = v === view;
            const n = counts[COUNT_KEY[v]];
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setParams({ view: v === "all" ? null : v })}
                className={cn(
                  "relative shrink-0 px-2.5 py-2 text-[12px] font-medium transition-colors sm:px-3",
                  on ? "text-ink" : "text-ink/45 hover:text-ink/75",
                )}
              >
                {t(`pw.view.${v}`)}
                {n > 0 && (
                  <span
                    className={cn(
                      "ms-1.5 rounded px-1 py-px text-[10px] font-semibold tabular-nums",
                      on
                        ? v === "needs-attention"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gold/15 text-gold-dark"
                        : "bg-ink/[0.06] text-ink/45",
                    )}
                  >
                    {n}
                  </span>
                )}
                <span aria-hidden className={cn("absolute inset-x-2 bottom-0 h-[2px] origin-left rounded-full bg-ink transition-transform duration-300", on ? "scale-x-100" : "scale-x-0")} />
              </button>
            );
          })}
        </nav>
        <span aria-hidden className="pointer-events-none absolute end-0 h-9 w-10 -translate-y-9 bg-gradient-to-l from-cream-50 to-transparent sm:hidden" />

        {showFilters && (
          <FilterBar zones={zones} agencies={agencies} params={params} setParams={setParams} />
        )}
      </header>

      {/* ── Cuerpo ── */}
      <div className="flex min-h-0 flex-1">
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col border-e border-ink/10 bg-white",
            "w-full lg:w-[440px] lg:shrink-0 xl:w-[490px]",
            selectedId && "hidden lg:flex",
          )}
        >
          {canEdit && (
            <div className="flex shrink-0 items-center gap-2 border-b border-ink/8 px-3 py-1.5">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={items.length === 0}
                onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
                aria-label={t("inbox.bulk.selectAll")}
                className="h-3.5 w-3.5 accent-[#8a6d3b]"
              />
              <span className="text-[11px] text-ink/45">
                {selected.size > 0
                  ? t("inbox.bulk.selected", { count: selected.size })
                  : tn("pw.results", total)}
              </span>
              {pending && <span className="ms-auto text-[10.5px] text-ink/35">…</span>}
            </div>
          )}

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <li className="p-4">
                <Empty>{t(`pw.empty.${view}`)}</Empty>
              </li>
            ) : (
              items.map((prop) => (
                <PropertyRow
                  key={prop.id}
                  property={prop}
                  active={prop.id === selectedId}
                  selected={selected.has(prop.id)}
                  selectable={canEdit}
                  country={country}
                  onOpen={() => setParams({ p: prop.id }, { keepSelection: true })}
                  onToggleSelect={(checked) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(prop.id);
                      else next.delete(prop.id);
                      return next;
                    })
                  }
                />
              ))
            )}
          </ul>

          {totalPages > 1 && (
            <nav aria-label={t("inbox.pagination")} className="flex shrink-0 items-center justify-between gap-2 border-t border-ink/8 px-3 py-2">
              <Button size="sm" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) }, { keepSelection: true })}>
                <ChevronLeft size={12} />
              </Button>
              <span className="text-[11px] tabular-nums text-ink/45">{t("inbox.pageOf", { page, total: totalPages })}</span>
              <Button size="sm" disabled={page >= totalPages} onClick={() => setParams({ page: String(page + 1) }, { keepSelection: true })}>
                <ChevronRight size={12} />
              </Button>
            </nav>
          )}
        </section>

        <section className={cn("min-h-0 min-w-0 flex-1 bg-cream-100/30", !selectedId && "hidden lg:block")}>
          {detail ? (
            <>
              <button
                type="button"
                onClick={() => setParams({ p: null })}
                className="flex w-full items-center gap-1.5 border-b border-ink/10 px-4 py-2 text-[12px] text-ink/60 lg:hidden"
              >
                <ArrowLeft size={14} strokeWidth={1.9} />
                {t("pw.backToList")}
              </button>
              <PropertyWorkspace
                detail={detail}
                country={country}
                tab={tab}
                canEdit={canEdit}
                canPublish={canPublish}
                onTab={(x) => setParams({ t: x === "overview" ? null : x }, { keepSelection: true })}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <p className="max-w-xs text-center text-[12.5px] text-ink/35">{t("pw.pickOne")}</p>
            </div>
          )}
        </section>
      </div>

      {canEdit && selected.size > 0 && (
        <BulkBar
          ids={[...selected]}
          items={items}
          country={country}
          canPublish={canPublish}
          onDone={() => {
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}

      <NewPropertyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        agencies={agencies.map((a) => ({ slug: a.slug, name: a.name }))}
        country={country}
      />
    </div>
  );
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

function FilterBar({
  zones,
  agencies,
  params,
  setParams,
}: {
  zones: string[];
  agencies: Array<{ id: string; name: string; slug: string }>;
  params: ReturnType<typeof useSearchParams>;
  setParams: (patch: Record<string, string | null>) => void;
}) {
  const t = useT();
  const get = (k: string) => params?.get(k) ?? "";
  const toggle = (k: string) => setParams({ [k]: get(k) === "1" ? null : "1" });

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-ink/8 py-2">
      <Select value={get("operation")} onChange={(e) => setParams({ operation: e.target.value || null })} aria-label={t("clientes.ficha.preferences.operation")} className="w-auto py-1 text-[11.5px]">
        <option value="">{t("clientes.ficha.preferences.operation")}</option>
        <option value="rent">{t("filters.operation.rent")}</option>
        <option value="sale">{t("filters.operation.sale")}</option>
      </Select>
      <Select value={get("zona")} onChange={(e) => setParams({ zona: e.target.value || null })} aria-label={t("clientes.ficha.preferences.zone")} className="w-auto max-w-[160px] py-1 text-[11.5px]">
        <option value="">{t("clientes.ficha.preferences.zone")}</option>
        {zones.map((z) => (
          <option key={z} value={z}>{z}</option>
        ))}
      </Select>
      <Select value={get("agencia")} onChange={(e) => setParams({ agencia: e.target.value || null })} aria-label={t("pw.details.agency")} className="w-auto max-w-[150px] py-1 text-[11.5px]">
        <option value="">{t("pw.details.agency")}</option>
        {agencies.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </Select>
      <Select value={get("origen")} onChange={(e) => setParams({ origen: e.target.value || null })} aria-label={t("pw.details.source")} className="w-auto py-1 text-[11.5px]">
        <option value="">{t("pw.details.source")}</option>
        <option value="manual">{t("pw.source.manual")}</option>
        <option value="scrape">{t("pw.source.scrape")}</option>
      </Select>
      <Select value={get("dormitorios")} onChange={(e) => setParams({ dormitorios: e.target.value || null })} aria-label={t("cc.brief.bedrooms")} className="w-auto py-1 text-[11.5px]">
        <option value="">{t("cc.brief.bedrooms")}</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>{n}+</option>
        ))}
      </Select>
      <PriceInput param="precioMin" placeholder={t("cc.editPrefs.minPrice")} params={params} setParams={setParams} />
      <PriceInput param="precioMax" placeholder={t("cc.editPrefs.maxPrice")} params={params} setParams={setParams} />

      <FilterToggle label={t("pw.filter.published")} on={get("pub") === "1"} onClick={() => toggle("pub")} />
      <FilterToggle label={t("pw.filter.noPhotos")} on={get("fotos") === "0"} onClick={() => setParams({ fotos: get("fotos") === "0" ? null : "0" })} />
      <FilterToggle label={t("pw.filter.hasVideo")} on={get("video") === "1"} onClick={() => toggle("video")} />
      <FilterToggle label={t("pw.filter.missingAddress")} on={get("sinDireccion") === "1"} onClick={() => toggle("sinDireccion")} />
      <FilterToggle label={t("pw.filter.missingCoords")} on={get("sinCoords") === "1"} onClick={() => toggle("sinCoords")} />
      <FilterToggle label={t("pw.filter.stale")} on={get("rancias") === "1"} onClick={() => toggle("rancias")} />

      <Select value={get("sort")} onChange={(e) => setParams({ sort: e.target.value || null })} aria-label={t("inbox.sort.label")} className="ms-auto w-auto py-1 text-[11.5px]">
        <option value="">{t("pw.sort.default")}</option>
        {(["updated", "price-desc", "price-asc", "synced", "interest", "viewing"] as WorkspaceSort[]).map((s) => (
          <option key={s} value={s}>{t(`pw.sort.${s}`)}</option>
        ))}
      </Select>
    </div>
  );
}

function PriceInput({
  param,
  placeholder,
  params,
  setParams,
}: {
  param: string;
  placeholder: string;
  params: ReturnType<typeof useSearchParams>;
  setParams: (patch: Record<string, string | null>) => void;
}) {
  const [v, setV] = useState(params?.get(param) ?? "");
  return (
    <TextInput
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => setParams({ [param]: v.replace(/\D/g, "") || null })}
      onKeyDown={(e) => {
        if (e.key === "Enter") setParams({ [param]: v.replace(/\D/g, "") || null });
      }}
      inputMode="numeric"
      placeholder={placeholder}
      className="w-24 py-1 text-[11.5px]"
    />
  );
}

function FilterToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "whitespace-nowrap rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition",
        on ? "border-gold/50 bg-gold/10 text-gold-dark" : "border-ink/12 bg-white text-ink/55 hover:border-gold/40",
      )}
    >
      {label}
    </button>
  );
}

// ─── Lote ────────────────────────────────────────────────────────────────────
//
// Ordenar la cartera: archivar, publicar y copiar enlaces. El borrado en lote
// NO existe a propósito. "Copiar para WhatsApp" se conserva del listado viejo:
// era de lo poco que el equipo usaba de verdad.

function BulkBar({
  ids,
  items,
  country,
  canPublish,
  onDone,
}: {
  ids: string[];
  items: PropertyListItem[];
  country: Country;
  canPublish: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const config = getCountryConfig(country);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok && r.error) alert(r.error);
      onDone();
    });

  const chosen = items.filter((i) => ids.includes(i.id));
  const shareUrl = (slug: string) => `${PORTAL_URL}/compartir/${slug}`;

  const copy = async (kind: "urls" | "wa") => {
    const text =
      kind === "urls"
        ? chosen.map((p) => shareUrl(p.slug)).join("\n")
        : chosen
            .map((p) => `${p.title} — ${config.formatPrice(p.price, p.currency, p.operation)}\n${shareUrl(p.slug)}`)
            .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="shrink-0 border-t border-ink/10 bg-ink px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-cream-50">
          {t("inbox.bulk.selected", { count: ids.length })}
        </span>
        <Button size="sm" disabled={pending} onClick={() => run(() => bulkArchive(ids, true))}>
          {t("pw.bulk.archive")}
        </Button>
        <Button size="sm" disabled={pending} onClick={() => run(() => bulkArchive(ids, false))}>
          {t("pw.bulk.unarchive")}
        </Button>
        {canPublish && (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => bulkPublishWeb(ids, true))}>
              {t("pw.bulk.publish")}
            </Button>
            <Button size="sm" disabled={pending} onClick={() => run(() => bulkPublishWeb(ids, false))}>
              {t("pw.bulk.unpublish")}
            </Button>
          </>
        )}
        <Button size="sm" onClick={() => copy("urls")}>
          <Copy size={11} strokeWidth={2} />
          {copied === "urls" ? t("pw.action.copied") : t("pw.bulk.copyUrls")}
        </Button>
        <Button size="sm" onClick={() => copy("wa")}>
          <MessageCircle size={11} strokeWidth={2} />
          {copied === "wa" ? t("pw.action.copied") : t("pw.bulk.copyWhatsApp")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} className="ms-auto text-cream-50/70">
          {t("cc.cancel")}
        </Button>
      </div>
    </div>
  );
}
