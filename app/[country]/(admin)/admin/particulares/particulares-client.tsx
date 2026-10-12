"use client";

import { Check, ChevronLeft, ChevronRight, ClipboardList, Copy, ExternalLink, Loader2, MapPin, MessageSquare, Phone, PhoneOff, RefreshCw, Ruler, Search, UserCheck, Video } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { ZoneFilter, type ZoneFilterGroup } from "@/components/admin/particulares/zone-filter";
import { DrawZoneFilter } from "@/components/admin/particulares/draw-zone-filter";
import { extractFloor } from "@/lib/floor";
import { extractFurnished } from "@/lib/furnished";
import { formatPrice } from "@/lib/format";
import { canAccess } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ANUNCIOS_POR_PAGINA } from "./constants";
import { prefetchParticularDetail } from "./detail-cache";
import { useParticularesFilters } from "./use-particulares-filters";
import { LinkedOffersLine, linkedOpLabel, linkedPortalLabel } from "./linked-ads-section";
import type { ParticularRow, StaffOption } from "./particulares-types";
export type { ParticularChangeRow, ParticularRow, StaffOption } from "./particulares-types";
import { DATE_FMT, ParticularModal, formatPhone } from "./particular-modal";

type RefreshState = "idle" | "loading" | "done" | "error";

export function ParticularesClient({
  rows,
  total,
  page,
  activeTotal,
  retiredTotal,
  withPhoneTotal,
  zoneGroups,
  currentRole,
  currentUserId,
  staffOptions = [],
}: {
  /** Página actual YA filtrada y paginada por el servidor (ver page.tsx). */
  rows: ParticularRow[];
  /** Total exacto para el filtro/pestaña actuales — salvo cuando hay planta,
   *  amueblado o gestión "contactados"/"sin gestionar" activos: esos se
   *  resuelven tras traer la página (ver `hasClientOnlyFilter` abajo), así
   *  que `total` pasa a ser una cota superior, no un conteo exacto. */
  total: number;
  /** Página actual (1-based), reflejada en la URL (?page=). */
  page: number;
  activeTotal: number;
  retiredTotal: number;
  /** Activos con teléfono en TODA la tabla (no solo esta página) — ver
   *  getParticularesStats(). */
  withPhoneTotal: number;
  zoneGroups: ZoneFilterGroup[];
  currentRole?: string;
  currentUserId?: string;
  staffOptions?: StaffOption[];
}) {
  // Filtros sincronizados con la URL (persisten al refrescar, se pueden
  // compartir por link, y el botón "atrás" del navegador los recorre).
  const {
    query,
    setQuery,
    operation,
    setOperation,
    zone,
    setZone,
    drawnZone,
    setDrawnZone,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    bedrooms,
    setBedrooms,
    floorMin,
    setFloorMin,
    areaMin,
    setAreaMin,
    last24h,
    setLast24h,
    showLinked,
    setShowLinked,
    phoneFilter,
    setPhoneFilter,
    gestion,
    setGestion,
    advertiser,
    setAdvertiser,
    furnished,
    setFurnished,
    sort,
    setSort,
    pricePerM2Min,
    setPricePerM2Min,
    pricePerM2Max,
    setPricePerM2Max,
    priceDrop,
    setPriceDrop,
    daysListed,
    setDaysListed,
    lift,
    setLift,
    condition,
    setCondition,
    yearMin,
    setYearMin,
    yearMax,
    setYearMax,
    showRetired,
    setShowRetired,
  } = useParticularesFilters();
  const [pageRows, setPageRows] = useState(rows);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [refreshResult, setRefreshResult] = useState<{ updated: number; checked: number } | null>(null);
  // Verificación de teléfonos contra el portal (endpoint verify-phones).
  const [verifying, setVerifying] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Transición de "ir a otra página": la paginación ya no trocea en memoria,
  // pide la página al servidor — esto solo pinta un estado de carga breve
  // mientras esa respuesta llega.
  const [pageNavPending, startPageNav] = useTransition();

  // Ficha abierta = una entrada de historial (?ficha=<id>), no solo estado
  // local: así el gesto nativo de "atrás" de iOS Safari cierra la ficha y
  // vuelve al listado con sus filtros intactos, en vez de navegar fuera de
  // la página entera (antes con useState puro, "volver" en el móvil se
  // salía de /admin/particulares y parecía "borrar" el listado). `selected`
  // se deriva de la página actual — si el id no está en `pageRows` (enlace
  // caducado o página distinta), simplemente no hay nada que abrir.
  const fichaId = searchParams.get("ficha");
  const selected = fichaId ? (pageRows.find((r) => r.id === fichaId) ?? null) : null;

  function openParticular(row: ParticularRow) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ficha", row.id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Deshace exactamente el push de openParticular — mismo efecto que el
  // gesto de "atrás", lo dispare el usuario con la X, el fondo o el botón
  // "Cerrar" de abajo.
  function closeParticular() {
    router.back();
  }

  // Sincronizar con los datos frescos del servidor: cambio de filtro/página
  // (page.tsx vuelve a renderizar con las searchParams nuevas) o
  // router.refresh() tras una acción en bloque (verificar/actualizar teléfonos).
  useEffect(() => {
    setPageRows(rows);
  }, [rows]);

  // Planta por anuncio, deducida de features/descripción (lib/floor.ts). Solo
  // sobre la página actual: filtrar por planta ya no puede recorrer el
  // listado entero (ver el comentario de ParticularesFilters en
  // lib/db/queries/particulares.ts — es fuzzy, no una columna).
  const floorById = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const r of pageRows) {
      map.set(r.id, extractFloor(r.features, r.description));
    }
    return map;
  }, [pageRows]);

  // Amueblado, deducido igual que la planta (no hay columna en BD — ver
  // lib/furnished.ts). Mismo alcance: solo la página actual.
  const furnishedById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof extractFurnished>>();
    for (const r of pageRows) {
      map.set(r.id, extractFurnished(r.features, r.description));
    }
    return map;
  }, [pageRows]);

  // Post-filtro sobre la página que ya llegó filtrada del servidor: texto,
  // zona, precio, habitaciones, m², teléfono, anunciante, últimas 24h y la
  // mayor parte de "gestión" ya vinieron resueltos en `rows` (ver
  // getParticularesPage()/ParticularesFilters). Solo quedan planta y
  // amueblado (se deducen de texto libre, no son columna) y lo de "gestión"
  // que SQL no puede resolver sin un JOIN a particulares_contacts
  // (contact_count). Con cualquiera de estos activo, esta página puede
  // devolver MENOS de ANUNCIOS_POR_PAGINA resultados aunque queden más
  // páginas por delante — tradeoff aceptado frente a traer toda la tabla
  // para filtrar exacto.
  const visibleRows = useMemo(() => {
    const fMin = floorMin ? Number(floorMin) : null;
    return pageRows.filter((r) => {
      if (fMin != null) {
        const fl = floorById.get(r.id);
        if (fl == null || fl < fMin) return false;
      }
      if (furnished && furnishedById.get(r.id) !== furnished) return false;
      if (gestion === "contacted" && (r.contact_count ?? 0) === 0) return false;
      if (gestion === "unmanaged" && (r.contact_count ?? 0) > 0) return false;
      return true;
    });
  }, [pageRows, floorMin, floorById, furnished, furnishedById, gestion]);

  const hasClientOnlyFilter =
    Boolean(floorMin) || Boolean(furnished) || gestion === "contacted" || gestion === "unmanaged";

  // Paginación: ya no es un slice() en memoria — `page`/`rows` vienen del
  // servidor (page.tsx lee ?page= y pide esa página con getParticularesPage).
  const totalPages = Math.max(1, Math.ceil(total / ANUNCIOS_POR_PAGINA));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const showingFrom = visibleRows.length === 0 ? 0 : (currentPage - 1) * ANUNCIOS_POR_PAGINA + 1;
  const showingTo = showingFrom === 0 ? 0 : showingFrom + visibleRows.length - 1;

  // Ir a otra página: navega vía URL en vez de recortar `filtered` en
  // memoria. Solo se toca "page" — el resto de parámetros se preserva tal
  // cual; cambiar cualquier OTRO filtro ya limpia "page" solo, porque
  // use-particulares-filters.ts reconstruye la querystring desde sus propias
  // claves cada vez que algo cambia (ver flush() ahí).
  function goToPage(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (n <= 1) params.delete("page");
    else params.set("page", String(n));
    const qs = params.toString();
    startPageNav(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Verificar teléfonos contra el portal: revisa hasta 30 anuncios y
  // actualiza teléfono / chat_only según lo que devuelva el endpoint.
  async function handleVerifyPhones() {
    setVerifying(true);
    try {
      const res = await fetch(
        "/api/admin/particulares/verify-phones?mode=all&limit=30",
        { method: "POST" },
      );
      const data = await res.json();
      if (res.ok && data.ok) {
        toast(
          `Verificados ${data.checked} anuncios · ${data.withPhone} con teléfono · ${data.updated} actualizados`,
          "success",
        );
        // Recargar los datos del servidor para reflejar los cambios.
        router.refresh();
      } else {
        toast("No se pudieron verificar los teléfonos. Inténtalo de nuevo.", "error");
      }
    } catch {
      toast("No se pudieron verificar los teléfonos (network_error). Inténtalo de nuevo.", "error");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRefreshPhones() {
    setRefreshState("loading");
    setRefreshResult(null);
    try {
      const res = await fetch("/api/admin/particulares/refresh-phones", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setRefreshResult({ updated: data.updated, checked: data.checked });
        setRefreshState("done");
        setTimeout(() => setRefreshState("idle"), 8000);
        // Igual que "Verificar teléfonos": recargar del servidor para que las
        // cards reflejen los teléfonos nuevos sin esperar a un reload manual.
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


  // Copiar teléfono al portapapeles: antes cada uno de los 2 botones de la
  // card (badge sobre la foto + pill debajo) tenía su propia regex de
  // limpieza ligeramente distinta. Un solo punto de verdad acá.
  function handleCopyPhone(phone: string, id: string) {
    const digits = phone.replace(/[\s\-().]/g, "");
    navigator.clipboard.writeText(digits).catch(() => {});
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  }

  function handlePhoneUpdated(newPhone: string | null) {
    // `selected` se deriva de `pageRows`: basta con actualizar aquí para que
    // tanto el listado como la ficha abierta reflejen el cambio.
    setPageRows((prev) =>
      prev.map((r) =>
        selected && r.id === selected.id ? { ...r, phone: newPhone } : r,
      ),
    );
  }

  return (
    <>
      {/* Modal */}
      {selected && (
        <ParticularModal
          row={selected}
          onClose={closeParticular}
          onPhoneUpdated={handlePhoneUpdated}
          onAssigned={(advisorId, advisorName) => {
            setPageRows((prev) =>
              prev.map((r) =>
                r.id === selected.id
                  ? { ...r, assigned_to: advisorId, assigned_name: advisorName }
                  : r,
              ),
            );
          }}
          onActiveChanged={(active, takenDownAt) => {
            setPageRows((prev) =>
              prev.map((r) =>
                r.id === selected.id
                  ? { ...r, is_active: active, taken_down_at: takenDownAt }
                  : r,
              ),
            );
          }}
          staffOptions={staffOptions}
          canCreateProperty={!currentRole || canAccess(currentRole, "properties", "create")}
        />
      )}

      <section className="mt-5 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-ink/10 bg-white/85 px-3 py-2 text-sm transition focus-within:border-gold/55">
            <Search size={15} strokeWidth={1.75} className="text-ink/45" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por zona, descripción o ref…"
              className="w-full bg-transparent text-ink placeholder:text-ink/40 focus:outline-none"
            />
          </label>
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value as typeof operation)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Operación: todas</option>
            <option value="rent">Alquiler</option>
            <option value="sale">Venta</option>
          </select>
          <ZoneFilter groups={zoneGroups} value={zone} onChange={setZone} />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Más recientes primero</option>
            <option value="oldest">Más antiguos primero</option>
            <option value="price_desc">Precio: mayor a menor</option>
            <option value="price_asc">Precio: menor a mayor</option>
            <option value="area_desc">m²: mayor a menor</option>
            <option value="area_asc">m²: menor a mayor</option>
          </select>
          {/* Dibujar zona: alternativa al desplegable de arriba para áreas que
              no coinciden con ningún distrito/barrio (no hay geometría oficial
              de Madrid en este repo — ver lib/zone-polygon.ts). Bloque
              autónomo a propósito, igual que ShareLinkAction más abajo. */}
          <DrawZoneFilter value={drawnZone} onChange={setDrawnZone} />
          <select
            value={gestion}
            onChange={(e) => setGestion(e.target.value as typeof gestion)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Gestión: todos</option>
            <option value="unmanaged">Sin gestionar</option>
            <option value="contacted">Ya contactados</option>
            <option value="assigned">Asignados</option>
            {currentUserId && <option value="mine">Asignados a mí</option>}
          </select>
          <select
            value={advertiser}
            onChange={(e) => setAdvertiser(e.target.value as typeof advertiser)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Anunciante: todos</option>
            <option value="particular">Particular</option>
            <option value="professional">Profesional</option>
            <option value="unknown">Desconocido</option>
          </select>
          <select
            value={furnished}
            onChange={(e) => setFurnished(e.target.value as typeof furnished)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Amueblado: todos</option>
            <option value="yes">Amueblado</option>
            <option value="no">Sin amueblar</option>
          </select>
          <input
            type="number"
            inputMode="numeric"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="€ mín"
            className="w-24 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <input
            type="number"
            inputMode="numeric"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="€ máx"
            className="w-24 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <select
            value={bedrooms}
            onChange={(e) => setBedrooms(e.target.value)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Hab: todas</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
          </select>
          <select
            value={floorMin}
            onChange={(e) => setFloorMin(e.target.value)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Planta: todas</option>
            <option value="1">1ª o más</option>
            <option value="2">2ª o más</option>
            <option value="3">3ª o más</option>
            <option value="4">4ª o más</option>
            <option value="5">5ª o más</option>
            <option value="6">6ª o más</option>
          </select>
          <input
            type="number"
            inputMode="numeric"
            value={areaMin}
            onChange={(e) => setAreaMin(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="m² mín"
            className="w-24 rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setLast24h((v) => !v)}
            className={
              last24h
                ? "rounded-lg border border-gold bg-gold/15 px-3 py-2 text-sm font-medium text-gold-dark"
                : "rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink/70 transition hover:border-gold/40"
            }
          >
            Últimas 24h
          </button>
          <button
            type="button"
            onClick={() => setShowLinked((v) => !v)}
            title="Por defecto cada inmueble sale una sola vez (con su venta, alquiler y portales dentro de la ficha). Actívalo para ver también las copias."
            className={
              showLinked
                ? "rounded-lg border border-gold bg-gold/15 px-3 py-2 text-sm font-medium text-gold-dark"
                : "rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink/70 transition hover:border-gold/40"
            }
          >
            Ver anuncios enlazados
          </button>
          <select
            value={phoneFilter}
            onChange={(e) => setPhoneFilter(e.target.value as typeof phoneFilter)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Teléfono: todos</option>
            <option value="with_phone">Con teléfono</option>
            <option value="no_phone">Sin teléfono</option>
          </select>

          {/* ── Filtros de ficha técnica ──────────────────────────────────
              Señales de CAPTACIÓN, no de búsqueda para un cliente: quién
              ya bajó el precio, quién lleva meses sin alquilar y quién está
              fuera de mercado por €/m². Salen de columnas que rellena el
              scraper de la ficha (migración 0158); un anuncio sin ficha
              scrapeada no aparece al usarlos. */}
          <select
            value={priceDrop}
            onChange={(e) => setPriceDrop(e.target.value)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Bajada: cualquiera</option>
            <option value="0">Ha bajado de precio</option>
            <option value="5">Bajó ≥ 5%</option>
            <option value="10">Bajó ≥ 10%</option>
            <option value="15">Bajó ≥ 15%</option>
          </select>
          <select
            value={daysListed}
            onChange={(e) => setDaysListed(e.target.value)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
            title="Días desde que lo detectamos nosotros (el portal no da la fecha de publicación)"
          >
            <option value="">Antigüedad: cualquiera</option>
            <option value="7">Detectado hace +7 días</option>
            <option value="15">Detectado hace +15 días</option>
            <option value="30">Detectado hace +30 días</option>
            <option value="60">Detectado hace +60 días</option>
            <option value="90">Detectado hace +90 días</option>
          </select>
          <select
            value={lift}
            onChange={(e) => setLift(e.target.value as typeof lift)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Ascensor: todos</option>
            <option value="yes">Con ascensor</option>
            <option value="no">Sin ascensor</option>
          </select>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as typeof condition)}
            className="rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink focus:border-gold/55 focus:outline-none"
          >
            <option value="">Estado: todos</option>
            <option value="good">Buen estado</option>
            <option value="renovated">Reformado / nuevo</option>
            <option value="to_reform">A reformar</option>
          </select>
          <input
            type="number"
            inputMode="numeric"
            value={pricePerM2Min}
            onChange={(e) => setPricePerM2Min(e.target.value)}
            placeholder="€/m² mín"
            className="w-[110px] rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <input
            type="number"
            inputMode="numeric"
            value={pricePerM2Max}
            onChange={(e) => setPricePerM2Max(e.target.value)}
            placeholder="€/m² máx"
            className="w-[110px] rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <input
            type="number"
            inputMode="numeric"
            value={yearMin}
            onChange={(e) => setYearMin(e.target.value)}
            placeholder="Año desde"
            className="w-[110px] rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <input
            type="number"
            inputMode="numeric"
            value={yearMax}
            onChange={(e) => setYearMax(e.target.value)}
            placeholder="Año hasta"
            className="w-[110px] rounded-lg border border-ink/10 bg-white/85 px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleRefreshPhones}
            disabled={refreshState === "loading"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              refreshState === "loading"
                ? "border border-gold/40 bg-gold/10 text-gold-dark opacity-80 cursor-wait"
                : refreshState === "done"
                ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                : refreshState === "error"
                ? "border border-red-300 bg-red-50 text-red-700"
                : "border border-ink/10 bg-white/85 text-ink/70 hover:border-gold/40 hover:bg-gold/5"
            )}
          >
            {refreshState === "loading" ? (
              <><Loader2 size={13} className="animate-spin" /> Actualizando…</>
            ) : refreshState === "done" ? (
              <><Check size={13} strokeWidth={2} /> {refreshResult?.updated ?? 0} teléfonos nuevos</>
            ) : refreshState === "error" ? (
              <>Error — reintentar</>
            ) : (
              <><RefreshCw size={13} strokeWidth={1.75} /> Actualizar teléfonos</>
            )}
          </button>
          <button
            type="button"
            onClick={handleVerifyPhones}
            disabled={verifying}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              verifying
                ? "border border-emerald-300 bg-emerald-50 text-emerald-700 opacity-80 cursor-wait"
                : "border border-ink/10 bg-white/85 text-ink/70 hover:border-emerald-300 hover:bg-emerald-50",
            )}
          >
            {verifying ? (
              <><Loader2 size={13} className="animate-spin" /> Verificando…</>
            ) : (
              <><Phone size={13} strokeWidth={1.75} /> Verificar teléfonos</>
            )}
          </button>
          <span className="ml-auto text-xs text-ink/55">
            {total} anuncios · {withPhoneTotal} con teléfono en total
          </span>
        </div>

        {/* Apartados: Activos / Retirados. Los retirados se conservan en BD
            con todos sus datos (precio, fotos, historial) — solo dejan de
            estar publicados en el portal de origen. */}
        <div className="mt-4 flex items-center gap-1 rounded-xl border border-ink/10 bg-white/60 p-1 w-fit">
          <button
            type="button"
            onClick={() => setShowRetired(false)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition",
              !showRetired
                ? "bg-ink text-cream-50 shadow-sm"
                : "text-ink/60 hover:text-ink",
            )}
          >
            Activos ({activeTotal})
          </button>
          <button
            type="button"
            onClick={() => setShowRetired(true)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition",
              showRetired
                ? "bg-red-600 text-white shadow-sm"
                : "text-ink/60 hover:text-red-700",
            )}
          >
            Retirados ({retiredTotal})
          </button>
        </div>

        {/* Grid */}
        {visibleRows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-gold/15 bg-white/40 px-4 py-12 text-center text-ink/55">
            {showRetired
              ? "No hay anuncios retirados."
              : "No hay anuncios de particulares todavía. El scraper los detecta automáticamente cada hora."}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleRows.map((r) => {
              const cover = r.cover_url ?? r.photos?.[0]?.url;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openParticular(r)}
                  // Prefetch de la galería + ficha técnica antes del clic: al
                  // abrir, el modal ya las tiene y no se rellena a trozos.
                  // `onFocus` cubre el teclado y `onTouchStart` el táctil,
                  // donde no hay hover (la ficha se usa desde tablet).
                  onMouseEnter={() => prefetchParticularDetail(r.id)}
                  onFocus={() => prefetchParticularDetail(r.id)}
                  onTouchStart={() => prefetchParticularDetail(r.id)}
                  className="group flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-white text-left transition hover:border-gold/50 hover:shadow-[0_12px_30px_-18px_rgba(40,28,10,0.35)]"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink/5">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-ink/30">
                        sin foto
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-ink/85 px-2 py-0.5 crm-label-sm text-cream-50">
                      {linkedOpLabel(r)}
                    </span>
                    <span className="absolute right-2 top-2 rounded-md bg-gold/90 px-2 py-0.5 crm-label-sm text-ink">
                      {linkedPortalLabel(r)}
                    </span>
                    {/* Badge de retirado */}
                    {!r.is_active && (
                      <span className="absolute inset-0 flex items-center justify-center bg-ink/30">
                        <span className="rounded-md bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow">
                          Retirado
                        </span>
                      </span>
                    )}
                    {/* Etiqueta de teléfono: verde con número (copiar al pulsar),
                        ámbar "Solo chat" o gris "Sin teléfono" */}
                    {r.phone ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyPhone(r.phone!, r.id);
                        }}
                        className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700"
                      >
                        {copiedPhoneId === r.id ? (
                          <>
                            <Check size={10} strokeWidth={2.5} />
                            ¡Copiado!
                          </>
                        ) : (
                          <>
                            <Phone size={10} strokeWidth={2} />
                            {formatPhone(r.phone)}
                            {/* Check pequeño cuando la extracción es de confianza alta */}
                            {r.phone_confidence === "high" && (
                              <Check size={10} strokeWidth={2.5} className="text-emerald-200" />
                            )}
                          </>
                        )}
                      </button>
                    ) : r.chat_only ? (
                      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-xs font-semibold text-white">
                        <MessageSquare size={10} strokeWidth={1.75} />
                        Solo chat
                      </span>
                    ) : (
                      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-ink/55 px-2 py-0.5 text-xs font-semibold text-white">
                        <PhoneOff size={10} strokeWidth={1.75} />
                        Sin teléfono
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-ink/60">
                      <MapPin size={12} strokeWidth={1.75} className="text-gold" />
                      <span>{r.zone ?? "Madrid"}</span>
                    </div>
                    {/* Dirección exacta (si el scraper la trae) — ayuda a ubicar el piso sin abrir el modal */}
                    {r.address && (
                      <p className="mt-0.5 truncate text-xs text-ink/50" title={r.address}>
                        {r.address}
                      </p>
                    )}
                    <p className="mt-1 crm-section-title text-ink">
                      {r.price != null
                        ? `${formatPrice(r.price)}${r.operation === "rent" ? "/mes" : ""}`
                        : "Precio n/d"}
                    </p>
                    <LinkedOffersLine row={r} />
                    <p className="mt-1 text-xs text-ink/60">
                      {[
                        r.bedrooms != null ? `${r.bedrooms} hab` : null,
                        r.bathrooms != null ? `${r.bathrooms} baños` : null,
                        r.square_meters != null ? `${r.square_meters} m²` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {/* Gestión: quién lo tiene asignado y quién lo contactó.
                        Evita que dos asesores trabajen el mismo anuncio.
                        + extras multimedia (vídeo / plano, migración 0036). */}
                    {(r.assigned_name || r.last_contact_by || (!r.is_active && r.taken_down_at) || r.has_video || r.video_url || r.has_floor_plan || r.floor_plan_url) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(r.has_video || r.video_url) && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink/60">
                            <Video size={10} strokeWidth={2} />
                            Vídeo
                          </span>
                        )}
                        {(r.has_floor_plan || r.floor_plan_url) && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink/60">
                            <Ruler size={10} strokeWidth={2} />
                            Plano
                          </span>
                        )}
                        {r.assigned_name && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                            <UserCheck size={10} strokeWidth={2} />
                            {r.assigned_name}
                          </span>
                        )}
                        {r.last_contact_by && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                            <ClipboardList size={10} strokeWidth={2} />
                            Contactado · {r.last_contact_by}
                            {r.last_contact_at &&
                              ` · ${DATE_FMT.format(new Date(r.last_contact_at))}`}
                          </span>
                        )}
                        {!r.is_active && r.taken_down_at && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                            Retirado · {DATE_FMT.format(new Date(r.taken_down_at))}
                          </span>
                        )}
                      </div>
                    )}
                    {r.phone && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyPhone(r.phone!, r.id);
                        }}
                        className="mt-2 flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        {copiedPhoneId === r.id ? (
                          <>
                            <Check size={12} strokeWidth={2.5} />
                            ¡Copiado!
                          </>
                        ) : (
                          <>
                            <Copy size={12} strokeWidth={1.75} />
                            {formatPhone(r.phone)}
                          </>
                        )}
                      </button>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-3 text-xs text-ink/45">
                      <span className="flex items-center gap-1.5">
                        {r.particular_reference ? (
                          <span className="font-mono font-semibold text-gold-dark/70">{r.particular_reference}</span>
                        ) : (
                          r.created_at ? DATE_FMT.format(new Date(r.created_at)) : ""
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 text-gold-dark group-hover:underline">
                        Ver detalles
                        <ExternalLink size={11} strokeWidth={1.75} />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
            </div>

            {/* Paginación server-side: cada página se pide al servidor (ver
                goToPage) en vez de trocear un array ya cargado entero. */}
            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1 || pageNavPending}
                  className="flex items-center gap-1.5 rounded-xl border border-gold/30 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-gold/60 hover:bg-gold/5 disabled:opacity-40 disabled:hover:border-gold/30 disabled:hover:bg-white"
                >
                  <ChevronLeft size={14} strokeWidth={2} />
                  Anterior
                </button>
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink/70">
                  Página {currentPage} de {totalPages}
                  {pageNavPending && <Loader2 size={13} className="animate-spin text-ink/40" />}
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages || pageNavPending}
                  className="flex items-center gap-1.5 rounded-xl border border-gold/30 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-gold/60 hover:bg-gold/5 disabled:opacity-40 disabled:hover:border-gold/30 disabled:hover:bg-white"
                >
                  Siguiente
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              </div>
              <p className="text-xs text-ink/50">
                Mostrando {showingFrom}–{showingTo} de {total} anuncios
                {hasClientOnlyFilter && " (planta/amueblado/gestión pueden dejar menos de una página completa)"}
              </p>
            </div>

          </>
        )}
      </section>
    </>
  );
}

