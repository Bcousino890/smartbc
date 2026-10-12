"use client";

import { Check, ChevronLeft, ChevronRight, Loader2, Phone, RefreshCw, Radar, LayoutGrid, List, SlidersHorizontal, Wrench, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { ZoneFilter, type ZoneFilterGroup } from "@/components/admin/particulares/zone-filter";
import type { IdealistaScraperConfig } from "@/lib/api/v1/idealista/config";
import type { ParticularesStats } from "@/lib/db/queries/particulares";
import { extractFurnished } from "@/lib/furnished";
import { canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ANUNCIOS_POR_PAGINA } from "./constants";
import { prefetchParticularDetail } from "./detail-cache";
import { useParticularesFilters } from "./use-particulares-filters";
import type { ParticularRow, StaffOption } from "./particulares-types";
export type { ParticularChangeRow, ParticularRow, StaffOption } from "./particulares-types";
import { ParticularModal } from "./particular-modal";
import { ParticularCard, type CardLayout } from "./_lista/particular-card";
import { BAR_BUTTON, FOCUS_RING, SelectField, Segmented } from "./_lista/controls";
import { FiltersPanel } from "./_lista/filters-panel";
import { ScraperDialog } from "./_lista/scraper-dialog";
import { buildChips, countPanelFilters } from "./_lista/filters-model";
import { fmtNum } from "./_lista/format";

type RefreshState = "idle" | "loading" | "done" | "error";

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3">
      <p className="text-xs font-medium text-ink/65">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{fmtNum(value)}</p>
      {hint && <p className="mt-0.5 text-xs text-ink/60">{hint}</p>}
    </div>
  );
}

export function ParticularesClient({
  rows,
  total,
  page,
  retiredTotal,
  stats,
  portalCounts,
  loadFailed = false,
  scraperConfig,
  zoneGroups,
  currentRole,
  currentUserId,
  staffOptions = [],
}: {
  /** Página actual YA filtrada y paginada por el servidor (ver page.tsx). */
  rows: ParticularRow[];
  /** Total para el filtro actual; con planta/amueblado/gestión «contactados» es una cota superior. */
  total: number;
  page: number;
  activeTotal?: number;
  retiredTotal: number;
  withPhoneTotal?: number;
  stats: ParticularesStats;
  portalCounts: Record<string, number>;
  loadFailed?: boolean;
  scraperConfig: IdealistaScraperConfig;
  zoneGroups: ZoneFilterGroup[];
  currentRole?: string;
  currentUserId?: string;
  staffOptions?: StaffOption[];
}) {
  const f = useParticularesFilters();
  const { query, setQuery, operation, setOperation, zone, setZone, advertiser, setAdvertiser, portal, setPortal, sort, setSort, priceDrop, setPriceDrop, furnished, gestion, showRetired, setShowRetired } = f;

  const [pageRows, setPageRows] = useState(rows);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [refreshResult, setRefreshResult] = useState<{ updated: number; checked: number } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [scrapersOpen, setScrapersOpen] = useState(false);
  const [layout, setLayout] = useState<CardLayout>("grid");
  const [now, setNow] = useState<number | null>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pageNavPending, startPageNav] = useTransition();

  useEffect(() => setNow(Date.now()), [rows]);
  useEffect(() => setPageRows(rows), [rows]);
  useEffect(() => {
    if (!toolsOpen) return;
    const close = (e: MouseEvent) => {
      if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [toolsOpen]);

  // Ficha abierta = entrada de historial (?ficha=<id>): «atrás» la cierra sin salir de la lista.
  const fichaId = searchParams.get("ficha");
  const selected = fichaId ? (pageRows.find((r) => r.id === fichaId) ?? null) : null;
  const fichaHref = (id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("ficha", id);
    return `${pathname}?${p.toString()}`;
  };
  function openParticular(row: ParticularRow) {
    router.push(fichaHref(row.id), { scroll: false });
  }
  function closeParticular() {
    router.back();
  }

  // Planta y amueblado se deducen de texto libre: solo filtran la página actual.
  const visibleRows = useMemo(() => {
    return pageRows.filter((r) => {
      if (furnished && extractFurnished(r.features, r.description) !== furnished) return false;
      if (gestion === "contacted" && (r.contact_count ?? 0) === 0) return false;
      if (gestion === "unmanaged" && (r.contact_count ?? 0) > 0) return false;
      return true;
    });
  }, [pageRows, furnished, gestion]);
  const hasClientOnlyFilter = Boolean(furnished) || gestion === "contacted" || gestion === "unmanaged";

  const totalPages = Math.max(1, Math.ceil(total / ANUNCIOS_POR_PAGINA));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const showingFrom = visibleRows.length === 0 ? 0 : (currentPage - 1) * ANUNCIOS_POR_PAGINA + 1;
  const showingTo = showingFrom === 0 ? 0 : showingFrom + visibleRows.length - 1;

  function goToPage(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (n <= 1) params.delete("page");
    else params.set("page", String(n));
    const qs = params.toString();
    startPageNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleVerifyPhones() {
    setToolsOpen(false);
    setVerifying(true);
    try {
      const res = await fetch("/api/admin/particulares/verify-phones?mode=all&limit=30", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast(`Verificados ${data.checked} anuncios · ${data.withPhone} con teléfono · ${data.updated} actualizados`, "success");
        router.refresh();
      } else toast("No se pudieron verificar los teléfonos. Inténtalo de nuevo.", "error");
    } catch {
      toast("No se pudieron verificar los teléfonos (error de red). Inténtalo de nuevo.", "error");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRefreshPhones() {
    setToolsOpen(false);
    setRefreshState("loading");
    setRefreshResult(null);
    try {
      const res = await fetch("/api/admin/particulares/refresh-phones", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setRefreshResult({ updated: data.updated, checked: data.checked });
        setRefreshState("done");
        setTimeout(() => setRefreshState("idle"), 8000);
        if (data.updated > 0) router.refresh();
      } else {
        setRefreshState("error");
        setTimeout(() => setRefreshState("idle"), 5000);
      }
    } catch {
      setRefreshState("error");
      setTimeout(() => setRefreshState("idle"), 5000);
    }
  }

  function handleCopyPhone(phone: string, id: string) {
    navigator.clipboard.writeText(phone.replace(/[\s\-().]/g, "")).catch(() => {});
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  }

  const chips = buildChips(f);
  const extraChips = chips.filter((c) => c.tone !== "scope");
  const panelCount = countPanelFilters(f);
  const busy = f.pending || pageNavPending;

  const opValue = operation === "" ? "all" : operation;

  return (
    <>
      {selected && (
        <ParticularModal
          row={selected}
          onClose={closeParticular}
          onPhoneUpdated={(newPhone) =>
            setPageRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, phone: newPhone } : r)))
          }
          onAssigned={(advisorId, advisorName) =>
            setPageRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, assigned_to: advisorId, assigned_name: advisorName } : r)))
          }
          onActiveChanged={(active, takenDownAt) =>
            setPageRows((prev) => prev.map((r) => (r.id === selected.id ? { ...r, is_active: active, taken_down_at: takenDownAt } : r)))
          }
          staffOptions={staffOptions}
          canCreateProperty={!currentRole || canAccess(currentRole, "properties", "create")}
        />
      )}

      <FiltersPanel open={filtersOpen} onClose={() => setFiltersOpen(false)} f={f} total={total} currentUserId={currentUserId} />
      <ScraperDialog open={scrapersOpen} onClose={() => setScrapersOpen(false)} config={scraperConfig} />

      {/* Cifras: solo particulares activos, sin copias enlazadas */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Particulares activos" value={stats.total} hint={`${fmtNum(stats.sale)} venta · ${fmtNum(stats.rent)} alquiler`} />
        <StatCard label="Con teléfono" value={stats.withPhone} />
        <StatCard label="Nuevos en 24 h" value={stats.last24h} />
        <StatCard label="Retirados" value={retiredTotal} hint="Siguen guardados con su historial" />
      </div>

      <section className="mt-5">
        {/* Barra de filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-ink/15 bg-white px-3 text-sm focus-within:border-ink/40">
            <span className="sr-only">Buscar</span>
            <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-ink/50"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar zona, calle, referencia…"
              className="w-full bg-transparent text-ink placeholder:text-ink/50 focus:outline-none"
            />
          </label>
          <Segmented
            ariaLabel="Operación"
            value={opValue}
            onChange={(v) => setOperation(v === "all" ? "" : (v as "sale" | "rent"))}
            options={[{ value: "all", label: "Todos" }, { value: "sale", label: "Venta" }, { value: "rent", label: "Alquiler" }]}
          />
          <Segmented
            ariaLabel="Tipo de anunciante"
            value={advertiser}
            onChange={(v) => setAdvertiser(v)}
            options={[{ value: "particular", label: "Particular" }, { value: "professional", label: "Agencia" }, { value: "all", label: "Todos" }]}
          />
          <ZoneFilter groups={zoneGroups} value={zone} onChange={setZone} />
          <button
            type="button"
            aria-pressed={priceDrop !== ""}
            onClick={() => setPriceDrop(priceDrop === "" ? "0" : "")}
            className={cn(BAR_BUTTON, priceDrop !== "" && "border-gold-dark bg-gold/25 font-semibold", FOCUS_RING)}
          >
            Bajadas
          </button>
          <button type="button" onClick={() => setFiltersOpen(true)} className={cn(BAR_BUTTON, FOCUS_RING)}>
            <SlidersHorizontal size={15} aria-hidden />
            Más filtros
            {panelCount > 0 && <span className="rounded-full bg-ink px-1.5 text-xs font-semibold text-cream-50">{panelCount}</span>}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <SelectField ariaLabel="Ordenar" value={sort} onChange={(v) => setSort(v as typeof sort)} className="w-[190px]">
              <option value="">Más recientes</option>
              <option value="oldest">Más antiguos</option>
              <option value="price_desc">Precio: mayor a menor</option>
              <option value="price_asc">Precio: menor a mayor</option>
              <option value="area_desc">m²: mayor a menor</option>
              <option value="area_asc">m²: menor a mayor</option>
            </SelectField>
            <Segmented
              ariaLabel="Vista"
              iconOnly
              value={layout}
              onChange={(v) => setLayout(v)}
              options={[
                { value: "grid", label: "Cuadrícula", icon: <LayoutGrid size={16} /> },
                { value: "list", label: "Lista", icon: <List size={16} /> },
              ]}
            />
            <div ref={toolsRef} className="relative">
              <button type="button" aria-haspopup="menu" aria-expanded={toolsOpen} onClick={() => setToolsOpen((v) => !v)} className={cn(BAR_BUTTON, FOCUS_RING)}>
                {verifying || refreshState === "loading" ? <Loader2 size={15} className="animate-spin" /> : <Wrench size={15} aria-hidden />}
                Herramientas
              </button>
              {toolsOpen && (
                <div role="menu" className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-ink/10 bg-white p-1 shadow-lg">
                  <button role="menuitem" type="button" onClick={handleRefreshPhones} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-ink/5">
                    <RefreshCw size={14} /> Actualizar teléfonos
                  </button>
                  <button role="menuitem" type="button" onClick={handleVerifyPhones} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-ink/5">
                    <Phone size={14} /> Verificar teléfonos
                  </button>
                  <button role="menuitem" type="button" onClick={() => { setToolsOpen(false); setScrapersOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-ink/5">
                    <Radar size={14} /> Configuración de scrapers
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {portal === "" && Object.keys(portalCounts).length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Portal">
            {Object.entries(portalCounts).map(([p, n]) => (
              <button key={p} type="button" onClick={() => setPortal(p)} className={cn("rounded-full border border-ink/15 bg-white px-3 py-1 text-xs text-ink/75 hover:border-ink/30", FOCUS_RING)}>
                {p.charAt(0).toUpperCase() + p.slice(1)} · {fmtNum(n)}
              </button>
            ))}
          </div>
        )}

        {/* Activos / Retirados + contador + chips */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1 rounded-xl border border-ink/10 bg-white p-0.5">
            <button type="button" onClick={() => setShowRetired(false)} className={cn("rounded-[10px] px-3.5 py-1.5 text-sm font-medium", !showRetired ? "bg-ink text-cream-50" : "text-ink/70 hover:text-ink", FOCUS_RING)}>
              Activos
            </button>
            <button type="button" onClick={() => setShowRetired(true)} className={cn("rounded-[10px] px-3.5 py-1.5 text-sm font-medium", showRetired ? "bg-red-700 text-white" : "text-ink/70 hover:text-red-700", FOCUS_RING)}>
              Retirados
            </button>
          </div>
          <p className="text-sm text-ink/75" aria-live="polite">
            {busy ? <Loader2 size={13} className="inline animate-spin" /> : null}{" "}
            {showingFrom === 0 ? "0 anuncios" : `${fmtNum(showingFrom)}–${fmtNum(showingTo)} de ${fmtNum(total)} anuncios`}
          </p>
          {extraChips.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-white py-1 pl-3 pr-1 text-xs text-ink">
              {c.label}
              <button type="button" onClick={c.onRemove} aria-label={`Quitar filtro ${c.label}`} className={cn("rounded-full p-1 text-ink/60 hover:bg-ink/10", FOCUS_RING)}>
                <X size={12} />
              </button>
            </span>
          ))}
          {extraChips.length > 0 && (
            <button type="button" onClick={f.clearAll} className={cn("text-xs font-medium text-ink underline underline-offset-2", FOCUS_RING)}>
              Limpiar todo
            </button>
          )}
        </div>
        {refreshState === "done" && (
          <p className="mt-2 flex items-center gap-1 text-xs text-emerald-800"><Check size={12} /> {refreshResult?.updated ?? 0} teléfonos nuevos</p>
        )}
        {refreshState === "error" && <p className="mt-2 text-xs text-red-700">No se pudieron actualizar los teléfonos. Inténtalo de nuevo.</p>}

        {/* Lista */}
        {loadFailed ? (
          <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center text-red-800">
            No se pudieron cargar los anuncios.
            <button type="button" onClick={() => router.refresh()} className="ml-2 font-semibold underline">Reintentar</button>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-ink/10 bg-white px-4 py-12 text-center text-ink/70">
            {extraChips.length > 0 ? (
              <>
                Ningún anuncio coincide con estos filtros.{" "}
                <button type="button" onClick={f.clearAll} className="font-semibold text-ink underline">Limpiar filtros</button>
              </>
            ) : showRetired ? (
              "No hay anuncios retirados."
            ) : (
              "Todavía no hay anuncios de particulares. Los scrapers los detectan automáticamente."
            )}
          </div>
        ) : (
          <>
            <div className={cn("mt-4 grid gap-3 transition-opacity", layout === "list" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3", busy && "opacity-60")}>
              {visibleRows.map((r) => (
                <ParticularCard
                  key={r.id}
                  row={r}
                  layout={layout}
                  now={now}
                  href={fichaHref(r.id)}
                  onOpen={openParticular}
                  onPrefetch={prefetchParticularDetail}
                  copied={copiedPhoneId === r.id}
                  onCopyPhone={handleCopyPhone}
                />
              ))}
            </div>

            <nav aria-label="Paginación" className="mt-6 flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1 || pageNavPending} className={cn("flex h-10 items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 text-sm font-semibold text-ink hover:border-ink/40 disabled:opacity-40", FOCUS_RING)}>
                  <ChevronLeft size={14} /> Anterior
                </button>
                <span className="text-sm font-medium text-ink/75">Página {currentPage} de {fmtNum(totalPages)}</span>
                <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages || pageNavPending} className={cn("flex h-10 items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 text-sm font-semibold text-ink hover:border-ink/40 disabled:opacity-40", FOCUS_RING)}>
                  Siguiente <ChevronRight size={14} />
                </button>
              </div>
              {hasClientOnlyFilter && (
                <p className="text-xs text-ink/65">Con planta, amueblado o gestión, una página puede mostrar menos anuncios de los habituales.</p>
              )}
            </nav>
          </>
        )}
      </section>
    </>
  );
}
