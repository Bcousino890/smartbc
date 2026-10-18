"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActiveChips,
  BATHROOM_OPTIONS,
  BEDROOM_OPTIONS,
  bedroomsChipLabel,
  type FilterChip,
  FilterSelect,
  FLOOR_OPTIONS,
  MoreFiltersToggle,
  OPERATION_OPTIONS,
  RangeChip,
  SearchBox,
  STAY_OPTIONS,
  TagFilterMenu,
} from "@/components/admin/property-search";
import { Pagination } from "@/components/ui/pagination";
import type { ActionResult } from "@/lib/catalogs/access";
import type { CatalogOperation, ZoneCriterion } from "@/lib/catalogs/criteria";
import { priceDisplay } from "@/lib/catalogs/operation-price";
import { INELIGIBLE_LABELS, type SearchResult, type SearchResultRow } from "@/lib/catalogs/search";
import {
  activeFilterCount,
  type CatalogSearchFilters,
  EMPTY_SEARCH_FILTERS,
  normalizeSearchFilters,
  SORT_OPTIONS,
  STATUS_CHOICE_OPTIONS,
} from "@/lib/catalogs/search-filters";
import { catalogBarrios, catalogDistricts } from "@/lib/catalogs/zones";
import { floorLabel } from "@/lib/floor";
import type { PropertyTag } from "@/lib/properties/tags";
import { draftsStore, useDraftsVersion } from "./manager/drafts-store";

// Buscador del catálogo (BCP-01 P3, D-B2): como el de Propiedades —filtrar,
// mirar los resultados y elegir viviendas una a una—, con sus mismos
// controles (components/admin/property-search) y el motor del catálogo
// (catalog_search, 0212): precio de alquiler y zonas correctos, paginación en
// el servidor sin corte a 2.000 y, en cada fila, por qué no se puede añadir.
// Los filtros viven en el almacén del gestor (sobreviven a cambiar de vista).

export interface CatalogSearchActions {
  search: (i: { catalogId: string; filters: CatalogSearchFilters; page: number }) => Promise<ActionResult<{ result: SearchResult }>>;
  options: (i: { catalogId: string }) => Promise<ActionResult<{ agencies: { id: string; name: string }[]; tags: PropertyTag[] }>>;
}

const UI_KEY = "catalog-search";
const OPS: Record<string, CatalogOperation> = { "": "any", venta: "sale", alquiler: "rent" };
const OPS_BACK: Record<CatalogOperation, string> = { any: "", sale: "venta", rent: "alquiler" };
const STATUS_BADGE: Record<SearchResultRow["status"], string | null> = { available: null, reserved: "Reservada", sold: "Vendida", archived: "Archivada" };
const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));

export function CatalogSearch({
  catalogId,
  catalogOperation,
  actions,
  disabled,
  onAdd,
  refreshKey,
}: {
  catalogId: string;
  /** La operación del catálogo: es la del filtro al empezar y la del precio que se enseña. */
  catalogOperation: CatalogOperation;
  actions: CatalogSearchActions;
  disabled?: boolean;
  /** Añade con el «run» del gestor. Devuelve true si se añadió. */
  onAdd: (row: SearchResultRow) => Promise<boolean>;
  /** Cambia cuando cambia la lista: se vuelve a pedir la página para que «ya está» y «lleno» no queden desfasados. */
  refreshKey?: string;
}) {
  useDraftsVersion();
  const initial = useMemo<CatalogSearchFilters>(() => ({ ...EMPTY_SEARCH_FILTERS, operation: catalogOperation }), [catalogOperation]);
  const stored = draftsStore.ui<{ filters: CatalogSearchFilters; page: number }>(catalogId, UI_KEY);
  const filters = stored?.filters ?? initial;
  const page = stored?.page ?? 1;
  // Siempre sobre los filtros GUARDADOS en este momento (no los de este
  // render): el texto y los rangos se aplican con retraso y no deben deshacer
  // lo que se haya elegido mientras tanto.
  const set = (next: Partial<CatalogSearchFilters>, keepPage = false) => {
    const now = draftsStore.ui<{ filters: CatalogSearchFilters; page: number }>(catalogId, UI_KEY);
    const base = now?.filters ?? initial;
    const r = normalizeSearchFilters({ ...base, ...next });
    // Un valor que no vale (p.ej. mínimo > máximo mientras se escribe) no rompe: se guarda tal cual y se avisa abajo.
    draftsStore.setUi(catalogId, UI_KEY, { filters: r.ok ? r.filters : { ...base, ...next }, page: keepPage ? now?.page ?? 1 : 1 });
  };
  const setPage = (p: number) => draftsStore.setUi(catalogId, UI_KEY, { filters, page: p });
  const [moreOpen, setMoreOpen] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<{ agencies: { id: string; name: string }[]; tags: PropertyTag[] }>({ agencies: [], tags: [] });
  const [freeZone, setFreeZone] = useState("");
  const [priceMin, setPriceMin] = useState(filters.priceMin?.toString() ?? "");
  const [priceMax, setPriceMax] = useState(filters.priceMax?.toString() ?? "");
  const [areaMin, setAreaMin] = useState(filters.areaMin?.toString() ?? "");
  const [areaMax, setAreaMax] = useState(filters.areaMax?.toString() ?? "");
  const [q, setQ] = useState(filters.q);
  const req = useRef(0);

  useEffect(() => {
    let alive = true;
    void actions.options({ catalogId }).then((r) => {
      if (alive && r.ok) setOptions({ agencies: r.agencies, tags: r.tags });
    });
    return () => {
      alive = false;
    };
  }, [actions, catalogId]);

  // Texto y rangos se aplican con una pausa breve (como Propiedades al escribir).
  useEffect(() => {
    const t = setTimeout(() => {
      const cur = draftsStore.ui<{ filters: CatalogSearchFilters }>(catalogId, UI_KEY)?.filters ?? initial;
      const patch: Partial<CatalogSearchFilters> = {};
      if (q !== cur.q) patch.q = q;
      const pm = num(priceMin), px = num(priceMax), am = num(areaMin), ax = num(areaMax);
      if (pm !== cur.priceMin) patch.priceMin = pm;
      if (px !== cur.priceMax) patch.priceMax = px;
      if (am !== cur.areaMin) patch.areaMin = am;
      if (ax !== cur.areaMax) patch.areaMax = ax;
      if (Object.keys(patch).length) set(patch);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, priceMin, priceMax, areaMin, areaMax]);

  const valid = normalizeSearchFilters(filters);
  const key = JSON.stringify([filters, page, refreshKey]);
  useEffect(() => {
    if (!valid.ok) return;
    const id = ++req.current;
    setLoading(true);
    void actions.search({ catalogId, filters: valid.filters, page }).then((r) => {
      if (id !== req.current) return; // una respuesta vieja no pisa a la nueva
      setLoading(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      setResult(r.result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const opValue = OPS_BACK[filters.operation];
  const chosenDistricts = filters.zones.filter((z) => z.kind === "district").map((z) => z.name);
  const priceDisabled = filters.operation === "any";
  const addZone = (z: ZoneCriterion) => {
    if (filters.zones.some((x) => x.kind === z.kind && x.name.toLowerCase() === z.name.toLowerCase())) return;
    set({ zones: [...filters.zones, z] });
  };
  const bedroomsValue = filters.bedrooms ? `${filters.bedrooms.n}${filters.bedrooms.mode === "min" ? "plus" : ""}` : "";
  const chips: FilterChip[] = [];
  if (filters.q.trim()) chips.push({ key: "q", label: `“${filters.q.trim()}”`, clear: () => (setQ(""), set({ q: "" })) });
  if (filters.operation !== "any") chips.push({ key: "op", label: filters.operation === "sale" ? "Venta" : "Alquiler", clear: () => set({ operation: "any", priceMin: null, priceMax: null }) });
  if (filters.status) chips.push({ key: "st", label: STATUS_CHOICE_OPTIONS.find((o) => o.value === filters.status)!.label, clear: () => set({ status: "" }) });
  for (const z of filters.zones) chips.push({ key: `z-${z.kind}-${z.name}`, label: z.kind === "free" ? `«${z.name}»` : z.name, clear: () => set({ zones: filters.zones.filter((x) => x !== z) }) });
  for (const id of filters.agencyIds) chips.push({ key: `a-${id}`, label: options.agencies.find((a) => a.id === id)?.name ?? "Agencia", clear: () => set({ agencyIds: filters.agencyIds.filter((x) => x !== id) }) });
  for (const id of filters.tagIds) chips.push({ key: `t-${id}`, label: `Etiqueta: ${options.tags.find((t) => t.id === id)?.name ?? "…"}`, clear: () => set({ tagIds: filters.tagIds.filter((x) => x !== id) }) });
  if (filters.bedrooms) chips.push({ key: "bed", label: bedroomsChipLabel(bedroomsValue), clear: () => set({ bedrooms: null }) });
  if (filters.bathroomsMin !== null) chips.push({ key: "bath", label: `${filters.bathroomsMin}+ baños`, clear: () => set({ bathroomsMin: null }) });
  if (filters.stay) chips.push({ key: "stay", label: `Estancia ${filters.stay === "long" ? "larga" : "corta"}`, clear: () => set({ stay: "" }) });
  if (filters.floorMin !== null) chips.push({ key: "floor", label: `Planta ${filters.floorMin}ª o más`, clear: () => set({ floorMin: null }) });
  if (filters.priceMin !== null || filters.priceMax !== null)
    chips.push({ key: "price", label: `Precio ${filters.priceMin ?? 0} – ${filters.priceMax ?? "sin tope"}`, clear: () => (setPriceMin(""), setPriceMax(""), set({ priceMin: null, priceMax: null })) });
  if (filters.areaMin !== null || filters.areaMax !== null)
    chips.push({ key: "area", label: `${filters.areaMin ?? 0} – ${filters.areaMax ?? "sin tope"} m²`, clear: () => (setAreaMin(""), setAreaMax(""), set({ areaMin: null, areaMax: null })) });
  const advanced = [filters.bedrooms, filters.bathroomsMin, filters.stay, filters.floorMin, filters.priceMin ?? filters.priceMax, filters.areaMin ?? filters.areaMax].filter((v) => v !== null && v !== "").length;
  const clearAll = () => {
    setQ("");
    setPriceMin("");
    setPriceMax("");
    setAreaMin("");
    setAreaMax("");
    draftsStore.setUi(catalogId, UI_KEY, { filters: { ...EMPTY_SEARCH_FILTERS }, page: 1 });
  };

  return (
    <section className="space-y-2 rounded-xl border border-gold/20 bg-white/60 p-3" aria-label="Buscar viviendas para añadir" data-testid="catalog-search">
      <SearchBox value={q} onChange={setQ} placeholder="Buscar por título, ref. BC (BC-1766), ref. de portal, zona, agencia o etiqueta…" />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <FilterSelect label="Operación" value={opValue} onChange={(v) => set({ operation: OPS[v], ...(OPS[v] === "any" ? { priceMin: null, priceMax: null } : {}) })} options={OPERATION_OPTIONS} />
        <FilterSelect label="Estado" value={filters.status} onChange={(v) => set({ status: v as CatalogSearchFilters["status"] })} options={STATUS_CHOICE_OPTIONS} />
        <FilterSelect
          label="Distrito"
          value=""
          onChange={(v) => v && addZone({ kind: "district", name: v })}
          options={[{ value: "", label: "Añadir…" }, ...catalogDistricts().map((d) => ({ value: d, label: d }))]}
        />
        {chosenDistricts.length ? (
          <FilterSelect
            label="Barrio"
            value=""
            onChange={(v) => v && addZone({ kind: "barrio", name: v })}
            options={[{ value: "", label: "Añadir…" }, ...chosenDistricts.flatMap((d) => catalogBarrios(d).map((b) => ({ value: b, label: chosenDistricts.length > 1 ? `${b} (${d})` : b })))]}
          />
        ) : null}
        <FilterSelect
          label="Agencia"
          value=""
          onChange={(v) => v && !filters.agencyIds.includes(v) && set({ agencyIds: [...filters.agencyIds, v] })}
          options={[{ value: "", label: filters.agencyIds.length ? "Añadir otra…" : "Todas" }, ...options.agencies.map((a) => ({ value: a.id, label: a.name }))]}
        />
        <TagFilterMenu tags={options.tags} selected={filters.tagIds} onChange={(ids) => set({ tagIds: ids })} />
        <MoreFiltersToggle open={moreOpen} count={advanced} onToggle={() => setMoreOpen((o) => !o)} />
        <span className="ml-auto text-xs font-semibold text-ink/60" data-testid="search-count">
          {loading ? "Buscando…" : result ? `${result.total} resultado${result.total === 1 ? "" : "s"}${activeFilterCount(filters) ? "" : " (todas)"}` : ""}
        </span>
      </div>
      {moreOpen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/15 bg-white/55 p-3 text-xs">
          <FilterSelect label="Dormitorios" value={bedroomsValue} onChange={(v) => set({ bedrooms: v ? { n: Number(v.replace("plus", "")), mode: v.endsWith("plus") ? "min" : "exact" } : null })} options={BEDROOM_OPTIONS} />
          <FilterSelect label="Baños" value={filters.bathroomsMin?.toString() ?? ""} onChange={(v) => set({ bathroomsMin: v ? Number(v) : null })} options={BATHROOM_OPTIONS} />
          {filters.operation !== "sale" ? (
            <FilterSelect label="Estancia" value={filters.stay === "long" ? "larga" : filters.stay === "short" ? "corta" : ""} onChange={(v) => set({ stay: v === "larga" ? "long" : v === "corta" ? "short" : "" })} options={STAY_OPTIONS} />
          ) : null}
          <FilterSelect label="Planta" value={filters.floorMin?.toString() ?? ""} onChange={(v) => set({ floorMin: v ? Number(v) : null })} options={FLOOR_OPTIONS} />
          <RangeChip
            label={filters.operation === "rent" ? "Precio €/mes" : "Precio"}
            min={priceMin}
            max={priceMax}
            onMin={setPriceMin}
            onMax={setPriceMax}
            disabled={priceDisabled}
            title={priceDisabled ? "Elige venta o alquiler para filtrar por precio" : undefined}
          />
          <RangeChip label="M²" min={areaMin} max={areaMax} onMin={setAreaMin} onMax={setAreaMax} />
          <FilterSelect label="Orden" value={filters.sort} onChange={(v) => set({ sort: v as CatalogSearchFilters["sort"] })} options={SORT_OPTIONS} />
          <form
            className="inline-flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (freeZone.trim().length >= 2) addZone({ kind: "free", name: freeZone.trim() });
              setFreeZone("");
            }}
          >
            <label className="sr-only" htmlFor="cs-free-zone">
              Otra zona
            </label>
            <input id="cs-free-zone" value={freeZone} onChange={(e) => setFreeZone(e.target.value)} placeholder="Otra zona (p. ej. Pozuelo)" className="w-40 rounded-md border border-ink/10 bg-white/85 px-2 py-1 text-xs" />
          </form>
          {priceDisabled ? <p className="basis-full text-ink/50">Para filtrar por precio elige venta o alquiler: en las viviendas que se venden y se alquilan, el precio depende de la operación.</p> : null}
        </div>
      ) : null}
      <ActiveChips chips={chips} onClearAll={clearAll} />
      {!valid.ok ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Revisa los filtros: los mínimos no pueden ser mayores que los máximos.</p> : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}
      {result && result.rows.length === 0 && !loading ? (
        <p className="rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-6 text-center text-sm text-ink/55" data-testid="search-empty">
          Ninguna vivienda cumple estos filtros.
        </p>
      ) : null}
      {result && result.rows.length ? (
        <>
          {result.catalog.visible >= result.catalog.max ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="search-full">
              El catálogo ya tiene {result.catalog.visible} viviendas (máximo {result.catalog.max}). Quita una para añadir otra.
            </p>
          ) : null}
          <ol className="divide-y divide-gold/10 overflow-hidden rounded-xl border border-gold/15 bg-white/70" data-testid="search-results" aria-busy={loading}>
            {result.rows.map((r) => (
              <ResultRow key={r.id} row={r} operation={result.operation} disabled={disabled || loading} onAdd={onAdd} />
            ))}
          </ol>
          <Pagination page={result.page} totalPages={result.totalPages} onChange={(p) => setPage(p)} />
        </>
      ) : null}
    </section>
  );
}

function ResultRow({ row, operation, disabled, onAdd }: { row: SearchResultRow; operation: CatalogOperation; disabled?: boolean; onAdd: (row: SearchResultRow) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const p = priceDisplay({ operation: row.operation, operations: row.operations, price: row.price, rent_price: row.rentPrice, currency: row.currency }, operation);
  const badge = STATUS_BADGE[row.status];
  const facts = [
    row.squareMeters ? `${row.squareMeters} m²` : null,
    `${row.bedrooms} dorm.`,
    `${row.bathrooms} baño${row.bathrooms === 1 ? "" : "s"}`,
    row.floor !== null ? `Planta ${floorLabel(row.floor)}` : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 sm:flex-nowrap" data-testid="search-row" data-property-id={row.id}>
      <div className="h-9 w-12 shrink-0 overflow-hidden rounded bg-cream-200">
        {row.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-ink/45">Sin foto</span>
        )}
      </div>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-sm text-ink">
          {row.bcReference ? <span className="mr-2 text-xs text-ink/45">{row.bcReference}</span> : null}
          {row.title}
        </p>
        <p className="truncate text-xs text-ink/55">
          <span className="text-ink/80">{p.price}</span> · {p.operation}
          {row.zone ? ` · ${[row.subzone, row.zone].filter(Boolean).join(", ")}` : ""} · {facts.join(" · ")}
          {row.agencyName ? ` · ${row.agencyName}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {badge ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{badge}</span> : null}
        {row.warnings.map((w) => (
          <span key={w} className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink/60">
            {w}
          </span>
        ))}
      </div>
      <div className="ml-auto shrink-0">
        {row.canAdd ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={async () => {
              setBusy(true);
              await onAdd(row);
              setBusy(false);
            }}
            aria-label={`Añadir «${row.title}»`}
            className="rounded-md bg-gold/90 px-3 py-1 text-xs font-semibold text-white transition hover:bg-gold disabled:opacity-50"
          >
            Añadir
          </button>
        ) : (
          <span className={`text-xs ${row.reason === "in_catalog" ? "text-emerald-700" : "text-ink/55"}`} data-testid="search-reason">
            {row.reason === "in_catalog" ? "✓ " : ""}
            {row.reason ? INELIGIBLE_LABELS[row.reason] : ""}
          </span>
        )}
      </div>
    </li>
  );
}
