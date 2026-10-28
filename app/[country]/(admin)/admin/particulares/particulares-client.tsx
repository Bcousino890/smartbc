"use client";

import { Check, ChevronLeft, ChevronRight, Loader2, Phone, RefreshCw, LayoutGrid, List, Map as MapIcon, SlidersHorizontal, Wrench, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { ZoneFilter, type ZoneFilterGroup } from "@/components/admin/particulares/zone-filter";
import type { IdealistaScraperConfig } from "@/lib/api/v1/idealista/config";
import type { ParticularesStats } from "@/lib/db/queries/particulares";
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
import { type PickedClient } from "@/components/admin/captaciones-map/client-picker";
import { useClientScores } from "./use-client-scores";
import { useClientContext, useFlowStates } from "./use-client-context";
import { captureParticularesForClient } from "./client-flow-actions";
import { ClientBar } from "./_lista/client-bar";
import { SelectionBar } from "./_lista/selection-bar";
import { FiltersPanel } from "./_lista/filters-panel";
import { buildChips, countPanelFilters } from "./_lista/filters-model";
import { fmtNum } from "./_lista/format";
import { decodeZonePolygons, encodeZonePolygons, type ZonePolygon } from "@/lib/zone-polygon";

// Vista Mapa: Leaflet toca `window` al importarse, así que solo se carga en
// el navegador y solo cuando alguien elige «Mapa» (no pesa en cuadrícula/lista).
const CaptacionesMapView = dynamic(
  () => import("@/components/admin/captaciones-map/captaciones-map-view").then((m) => m.CaptacionesMapView),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="mt-6 flex items-center gap-2 text-sm text-ink/70">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Cargando mapa…
      </p>
    ),
  },
);

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
  agencyNames = {},
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
  /** Nombre a mostrar de las agencias que vienen en la URL (`agencia`, `sinAgencia`). */
  agencyNames?: Record<string, string>;
}) {
  const f = useParticularesFilters(agencyNames);
  const { query, setQuery, operation, setOperation, zone, setZone, advertiser, setAdvertiser, portal, setPortal, sort, setSort, priceDrop, setPriceDrop, gestion, showRetired, setShowRetired } = f;

  const [pageRows, setPageRows] = useState(rows);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [refreshResult, setRefreshResult] = useState<{ updated: number; checked: number } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Cliente para el que se capta: vale para Mapa, Cuadrícula y Lista y viaja en la URL (?cliente=…),
  // así la ficha del cliente puede abrir Captaciones ya con él elegido.
  const clientCtx = useClientContext(f.clientId);
  // useMemo: el mapa vuelve a pedir el encargo cada vez que cambia la IDENTIDAD de este objeto.
  const pickedName = clientCtx.context?.name ?? "Cliente";
  const pickedClient = useMemo<PickedClient | null>(
    () => (f.clientId ? { id: f.clientId, name: pickedName } : null),
    [f.clientId, pickedName],
  );
  // Anuncios elegidos en la lista para captarlos de golpe (persisten al cambiar de página).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [capturing, setCapturing] = useState(false);
  const setPickedClient = useCallback(
    (c: PickedClient | null) => {
      f.setClientId(c?.id ?? "");
      setSelectedIds(new Set());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.setClientId],
  );
  const [toolsOpen, setToolsOpen] = useState(false);
  // La vista vive en la URL (`vista=list|map`) para que recargar o compartir
  // el enlace abra la misma; cuadrícula es el valor por defecto.
  const view = f.view;
  const isMap = view === "map";
  const clientScores = useClientScores(pickedClient, !isMap);
  const layout: CardLayout = view === "list" ? "list" : "grid";
  // Zona del mapa: la vigente en los filtros (la dibujada en el mapa o en el
  // modal «Ubicación en el mapa»). La vista solo la lee al montarse, así que
  // seguirla aquí no pisa lo que se dibuja; sirve para que Mapa → Cuadrícula →
  // Mapa (que remonta la vista) abra con la zona actual y no con la de la carga.
  const mapInitialPolygons = useMemo<ZonePolygon[]>(() => decodeZonePolygons(f.drawnZone), [f.drawnZone]);
  const [now, setNow] = useState<number | null>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const countryPrefix = `/${pathname.split("/")[1] || "es"}`;
  const searchParams = useSearchParams();
  // Los filtros de la lista, tal cual están en la URL, para que el mapa enseñe lo mismo (sin vista, cliente, zona dibujada ni página).
  const mapFilterQuery = useMemo(() => {
    const p = new URLSearchParams(searchParams.toString());
    for (const k of ["vista", "cliente", "zonePoly", "page", "ficha"]) p.delete(k);
    return p.toString();
  }, [searchParams]);
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
  // Si el anuncio no está en la página actual (enlace directo, resultado de otra
  // página…) se pide al servidor por id (/api/admin/particulares/[id]).
  const fichaId = searchParams.get("ficha");
  const inPage = useMemo(() => (fichaId ? (pageRows.find((r) => r.id === fichaId) ?? null) : null), [fichaId, pageRows]);
  const [remote, setRemote] = useState<{ id: string; status: "loading" | "error" | "ready"; row?: ParticularRow } | null>(null);
  const needsRemote = Boolean(fichaId) && !inPage;
  useEffect(() => {
    if (!fichaId || !needsRemote) return;
    if (remote?.id === fichaId && remote.status === "ready") return;
    const ac = new AbortController();
    setRemote({ id: fichaId, status: "loading" });
    fetch(`/api/admin/particulares/${encodeURIComponent(fichaId)}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as ParticularRow;
      })
      .then((row) => setRemote({ id: fichaId, status: "ready", row }))
      .catch((e) => {
        if (ac.signal.aborted || (e as Error)?.name === "AbortError") return;
        setRemote({ id: fichaId, status: "error" });
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId, needsRemote]);
  const remoteForId = remote && remote.id === fichaId ? remote : null;
  const selected = inPage ?? (remoteForId?.status === "ready" ? (remoteForId.row ?? null) : null);

  // Las dos formas de actualizar una fila (la de la página y la traída por id).
  const patchRow = useCallback((id: string, patch: Partial<ParticularRow>) => {
    setPageRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setRemote((prev) => (prev?.row && prev.row.id === id ? { ...prev, row: { ...prev.row, ...patch } } : prev));
  }, []);

  // Enlace de cada ficha: parte de la URL SIN `ficha`, así no cambia al abrir una
  // y las tarjetas (memo) no se vuelven a pintar.
  const baseQs = useMemo(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("ficha");
    return p.toString();
  }, [searchParams]);
  const fichaHref = useCallback(
    (id: string) => `${pathname}?${baseQs ? `${baseQs}&` : ""}ficha=${encodeURIComponent(id)}`,
    [pathname, baseQs],
  );
  const openedFromList = useRef(false);
  const fichaHrefRef = useRef(fichaHref);
  fichaHrefRef.current = fichaHref;
  const openParticular = useCallback(
    (row: ParticularRow) => {
      openedFromList.current = true;
      // pushState nativo (Next lo integra con useSearchParams): abrir una ficha no
      // vuelve a pedir la página al servidor, solo añade la entrada de historial.
      window.history.pushState(null, "", fichaHrefRef.current(row.id));
    },
    [],
  );
  // Desde el mapa: misma ficha (con teléfono, WhatsApp y acciones) por id.
  const openParticularById = useCallback((id: string) => {
    openedFromList.current = true;
    window.history.pushState(null, "", fichaHrefRef.current(id));
  }, []);
  const onMapZoneChange = useCallback(
    (p: ZonePolygon[]) => f.setDrawnZone(p.length ? encodeZonePolygons(p) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.setDrawnZone],
  );

  function closeParticular() {
    if (openedFromList.current) {
      openedFromList.current = false;
      window.history.back();
    } else {
      // Enlace directo: no hay entrada anterior de la lista a la que volver. Se quita
      // `?ficha=` sin pasar por el servidor (no recarga la lista).
      const p = new URLSearchParams(window.location.search);
      p.delete("ficha");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    }
  }

  // Gestión «contactados / sin gestionar» se remata aquí sobre la página ya traída.
  const visibleRows = useMemo(() => {
    return pageRows.filter((r) => {
      if (gestion === "contacted" && (r.contact_count ?? 0) === 0) return false;
      if (gestion === "unmanaged" && (r.contact_count ?? 0) > 0) return false;
      return true;
    });
  }, [pageRows, gestion]);
  const hasClientOnlyFilter = gestion === "contacted" || gestion === "unmanaged";

  // Dónde está cada anuncio visible respecto a la ficha del cliente (en su lista / ficha creada / en su book).
  const visibleIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows]);
  const flow = useFlowStates(isMap ? "" : f.clientId, visibleIds);
  const bookedCount = Object.values(flow.states).filter((s) => s === "book").length;
  const refreshClientCtx = clientCtx.refresh;
  useEffect(() => {
    // Una ficha nueva entró en el book: se actualizan las cifras del cliente (lista, book).
    if (bookedCount > 0) refreshClientCtx();
  }, [bookedCount, refreshClientCtx]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const allOnPageSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const togglePage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  async function handleCaptureSelected() {
    if (!pickedClient || selectedIds.size === 0) return;
    setCapturing(true);
    const ids = [...selectedIds];
    const scores: Record<string, number> = {};
    for (const id of ids) {
      const sc = clientScores.scores.get(id);
      if (sc !== undefined) scores[id] = sc;
    }
    try {
      const res = await captureParticularesForClient(pickedClient.id, ids, scores);
      if (res.ok) {
        const first = pickedClient.name.trim().split(/\s+/)[0] ?? pickedClient.name;
        toast(
          `${res.inserted} ${res.inserted === 1 ? "anuncio captado" : "anuncios captados"} para ${first}${res.skipped ? ` · ${res.skipped} ya estaban en su lista` : ""}. Su ficha se crea sola y entra en su book.`,
          "success",
        );
        setSelectedIds(new Set());
        flow.refresh();
        refreshClientCtx();
      } else toast(res.error, "error");
    } catch {
      toast("No se pudo captar. Inténtalo de nuevo.", "error");
    } finally {
      setCapturing(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / ANUNCIOS_POR_PAGINA));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const showingFrom = visibleRows.length === 0 ? 0 : (currentPage - 1) * ANUNCIOS_POR_PAGINA + 1;
  const showingTo = showingFrom === 0 ? 0 : showingFrom + visibleRows.length - 1;

  // Prefetch de la página siguiente al acercarse al botón (una vez por URL).
  const prefetched = useRef(new Set<string>());
  function prefetchPage(n: number) {
    if (n > totalPages) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ficha");
    params.set("page", String(n));
    const href = `${pathname}?${params.toString()}`;
    if (prefetched.current.has(href)) return;
    prefetched.current.add(href);
    router.prefetch(href);
  }

  function goToPage(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ficha");
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

  const handleCopyPhone = useCallback((phone: string, id: string) => {
    navigator.clipboard.writeText(phone.replace(/[\s\-().]/g, "")).catch(() => {});
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  }, []);

  const chips = buildChips(f);
  const extraChips = chips.filter((c) => c.tone !== "scope");
  const panelCount = countPanelFilters(f);
  const busy = f.pending || f.settling || pageNavPending;

  const opValue = operation === "" ? "all" : operation;
  // Con texto en la búsqueda se mira en todos los estados y anunciantes (ver page.tsx).
  const searching = query.trim() !== "";
  const searchAll = searching && !f.searchScoped;

  return (
    <>
      {fichaId && !selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="Ficha del anuncio">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            {remoteForId?.status === "error" ? (
              <>
                <p role="alert" className="text-sm font-semibold text-red-800">Anuncio no encontrado</p>
                <p className="mt-1 text-xs text-ink/65">Puede que se haya eliminado o que el enlace no sea correcto.</p>
                <button type="button" onClick={closeParticular} className={cn("mt-4 h-10 rounded-xl bg-ink px-5 text-sm font-semibold text-cream-50", FOCUS_RING)}>
                  Cerrar
                </button>
              </>
            ) : (
              <p role="status" className="flex items-center justify-center gap-2 text-sm text-ink/75">
                <Loader2 size={16} className="animate-spin" aria-hidden /> Cargando ficha…
              </p>
            )}
          </div>
        </div>
      )}
      {selected && (
        <ParticularModal
          key={selected.id}
          row={selected}
          onClose={closeParticular}
          onPhoneUpdated={(newPhone) => patchRow(selected.id, { phone: newPhone })}
          onAssigned={(advisorId, advisorName) => patchRow(selected.id, { assigned_to: advisorId, assigned_name: advisorName })}
          onActiveChanged={(active, takenDownAt) => patchRow(selected.id, { is_active: active, taken_down_at: takenDownAt })}
          staffOptions={staffOptions}
          canCreateProperty={!currentRole || canAccess(currentRole, "properties", "create")}
          clientFlow={{ client: pickedClient, onClientChange: setPickedClient, prefix: countryPrefix, onChanged: () => { flow.refresh(); clientCtx.refresh(); } }}
        />
      )}

      {!isMap && (
        <SelectionBar
          count={selectedIds.size}
          clientName={pickedClient ? pickedClient.name : null}
          capturing={capturing}
          allOnPageSelected={allOnPageSelected}
          onCapture={handleCaptureSelected}
          onClear={() => setSelectedIds(new Set())}
          onTogglePage={togglePage}
        />
      )}

      <FiltersPanel open={filtersOpen} onClose={closeFilters} f={f} total={total} busy={busy} currentUserId={currentUserId} />

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
          <>
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
          </>
          <div className="ml-auto flex items-center gap-2">
            {!isMap && (
            <SelectField ariaLabel="Ordenar" value={sort} onChange={(v) => setSort(v as typeof sort)} className="w-[190px]">
              <option value="">Más recientes</option>
              <option value="oldest">Más antiguos</option>
              <option value="price_desc">Precio: mayor a menor</option>
              <option value="price_asc">Precio: menor a mayor</option>
              <option value="area_desc">m²: mayor a menor</option>
              <option value="area_asc">m²: menor a mayor</option>
            </SelectField>
            )}
            <Segmented
              ariaLabel="Vista"
              iconOnly
              value={view}
              onChange={(v) => f.setView(v)}
              options={[
                { value: "grid", label: "Cuadrícula", icon: <LayoutGrid size={16} /> },
                { value: "list", label: "Lista", icon: <List size={16} /> },
                { value: "map", label: "Mapa", icon: <MapIcon size={16} /> },
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
                </div>
              )}
            </div>
          </div>
        </div>

        <ClientBar
          prefix={countryPrefix}
          value={pickedClient}
          onChange={setPickedClient}
          context={clientCtx.context}
          loading={clientCtx.loading}
          error={clientCtx.error}
          fallbackSubtitle={clientScores.subtitle}
        />

        {isMap ? (
          <CaptacionesMapView
            initialPolygons={mapInitialPolygons}
            filters={{
              operation: operation === "" ? undefined : operation,
              advertiser: advertiser === "particular" ? "particular" : "all",
            }}
            onZoneChange={onMapZoneChange}
            client={pickedClient}
            onClientChange={setPickedClient}
            filterQuery={mapFilterQuery}
            onOpenFicha={openParticularById}
          />
        ) : (
        <>
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
            <button type="button" disabled={searchAll} onClick={() => setShowRetired(false)} className={cn("rounded-[10px] px-3.5 py-1.5 text-sm font-medium disabled:opacity-40", !showRetired && !searchAll ? "bg-ink text-cream-50" : "text-ink/70 hover:text-ink", FOCUS_RING)}>
              Activos
            </button>
            <button type="button" disabled={searchAll} onClick={() => setShowRetired(true)} className={cn("rounded-[10px] px-3.5 py-1.5 text-sm font-medium disabled:opacity-40", showRetired && !searchAll ? "bg-red-700 text-white" : "text-ink/70 hover:text-red-700", FOCUS_RING)}>
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
        {searching && (
          <div role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gold-dark/50 bg-gold/15 px-3 py-2 text-sm text-ink">
            {searchAll ? (
              <>
                <span>
                  <strong className="font-semibold">Buscando en todos los estados</strong>: activos y retirados, particulares y agencias.
                </span>
                <button type="button" onClick={() => f.setSearchScoped(true)} className={cn("font-semibold underline underline-offset-2", FOCUS_RING)}>
                  Volver a filtrar (solo {showRetired ? "retirados" : "activos"}
                  {advertiser === "all" ? "" : ` · ${advertiser === "particular" ? "particulares" : advertiser === "professional" ? "agencias" : "sin clasificar"}`})
                </button>
              </>
            ) : (
              <>
                <span>La búsqueda respeta {showRetired ? "Retirados" : "Activos"} y el tipo de anunciante.</span>
                <button type="button" onClick={() => f.setSearchScoped(false)} className={cn("font-semibold underline underline-offset-2", FOCUS_RING)}>
                  Buscar en todos los estados
                </button>
              </>
            )}
          </div>
        )}
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
            <div className={cn("mt-4 grid gap-3 transition-opacity", layout === "list" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3", busy && "opacity-60")} aria-busy={busy}>
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
                  score={clientScores.hasScores ? (clientScores.scores.get(r.id) ?? 0) : undefined}
                  selected={selectedIds.has(r.id)}
                  onToggleSelect={toggleSelected}
                  flow={flow.states[r.id] && flow.states[r.id] !== "none" ? (flow.states[r.id] as "pending" | "property" | "book") : undefined}
                />
              ))}
            </div>

            <nav aria-label="Paginación" className="mt-6 flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1 || pageNavPending} className={cn("flex h-10 items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 text-sm font-semibold text-ink hover:border-ink/40 disabled:opacity-40", FOCUS_RING)}>
                  <ChevronLeft size={14} /> Anterior
                </button>
                <span className="text-sm font-medium text-ink/75">Página {currentPage} de {fmtNum(totalPages)}</span>
                <button type="button" onPointerEnter={() => prefetchPage(currentPage + 1)} onFocus={() => prefetchPage(currentPage + 1)} onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages || pageNavPending} className={cn("flex h-10 items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 text-sm font-semibold text-ink hover:border-ink/40 disabled:opacity-40", FOCUS_RING)}>
                  Siguiente <ChevronRight size={14} />
                </button>
              </div>
              {hasClientOnlyFilter && (
                <p className="text-xs text-ink/65">Con el filtro de gestión, una página puede mostrar menos anuncios de los habituales.</p>
              )}
            </nav>
          </>
        )}
        </>
        )}
      </section>
    </>
  );
}
