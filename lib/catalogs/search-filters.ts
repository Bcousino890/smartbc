import { normalizeCriteria, type CatalogOperation, type ZoneCriterion, ZONES_MAX } from "./criteria";

// ============================================================================
// Filtros del buscador del catálogo (BCP-01 P2, I-1 a I-5). Puro: lo usan el
// servidor y el navegador.
//
// Mismas reglas que catalog_search_normalize() (0212): lo que sale de
// toSqlFilters(normalizeSearchFilters(x)) es exactamente lo que la base de
// datos normaliza (prueba de paridad en scripts/sql/gen-catalog-search-parity.mts).
// Operación, zonas y precio usan normalizeCriteria (las reglas de siempre:
// precio solo con operación, zonas reconocidas o texto libre, ≤ 30).
//
// El texto (`q`) y la planta (`floorMin`) NO van a SQL: los aplica el
// servidor en TS con matchesPropertySearch y resolveFloor (lib/catalogs/search.ts).
// ============================================================================

export type SearchStatus = "available" | "reserved" | "sold" | "archived";
/** Opciones del filtro «Estado». '' = disponibles y reservadas (las que se pueden añadir). */
export type StatusChoice = "" | "disponibles" | "reservadas" | "vendidas" | "archivadas" | "todas";
export type SearchSort = "newest" | "price_asc" | "price_desc";
export type BedroomsFilter = { n: number; mode: "exact" | "min" } | null;

export interface CatalogSearchFilters {
  q: string;
  operation: CatalogOperation;
  zones: ZoneCriterion[];
  priceMin: number | null;
  priceMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  bedrooms: BedroomsFilter;
  bathroomsMin: number | null;
  stay: "" | "long" | "short";
  agencyIds: string[];
  tagIds: string[];
  status: StatusChoice;
  floorMin: number | null;
  sort: SearchSort;
}

export const Q_MAX = 80;
export const IDS_MAX = 50;
export const AREA_LIMIT = 100_000;
export const ROOMS_LIMIT = 50;
export const FLOOR_MIN_LIMIT = 40;

export const EMPTY_SEARCH_FILTERS: CatalogSearchFilters = {
  q: "",
  operation: "any",
  zones: [],
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  bedrooms: null,
  bathroomsMin: null,
  stay: "",
  agencyIds: [],
  tagIds: [],
  status: "",
  floorMin: null,
  sort: "newest",
};

export const STATUS_CHOICES: Record<StatusChoice, SearchStatus[]> = {
  "": ["available", "reserved"],
  disponibles: ["available"],
  reservadas: ["reserved"],
  vendidas: ["sold"],
  archivadas: ["archived"],
  todas: ["available", "reserved", "sold", "archived"],
};

export const STATUS_CHOICE_OPTIONS: readonly { value: StatusChoice; label: string }[] = [
  { value: "", label: "Disponibles y reservadas" },
  { value: "disponibles", label: "Disponibles" },
  { value: "reservadas", label: "Reservadas" },
  { value: "vendidas", label: "Vendidas" },
  { value: "archivadas", label: "Archivadas" },
  { value: "todas", label: "Todas" },
];

export const SORT_OPTIONS: readonly { value: SearchSort; label: string }[] = [
  { value: "newest", label: "Más recientes" },
  { value: "price_asc", label: "Precio: de menor a mayor" },
  { value: "price_desc", label: "Precio: de mayor a menor" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORTS = new Set<SearchSort>(["newest", "price_asc", "price_desc"]);
const CHOICES = new Set<StatusChoice>(["", "disponibles", "reservadas", "vendidas", "archivadas", "todas"]);

type Bad = { ok: false; error: "invalid_filters" };
const BAD: Bad = { ok: false, error: "invalid_filters" };

function intOrNull(v: unknown, lo: number, hi: number): number | null | "bad" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= lo && n <= hi ? n : "bad";
}

function uuids(v: unknown): string[] | "bad" {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v) || v.length > IDS_MAX) return "bad";
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string" || !UUID.test(x)) return "bad";
    const id = x.toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Valida y normaliza. Cualquier error → invalid_filters (como en SQL). */
export function normalizeSearchFilters(input: unknown): { ok: true; filters: CatalogSearchFilters } | Bad {
  if (input === null || input === undefined) return { ok: true, filters: { ...EMPTY_SEARCH_FILTERS, zones: [], agencyIds: [], tagIds: [] } };
  if (typeof input !== "object" || Array.isArray(input)) return BAD;
  const o = input as Record<string, unknown>;

  const crit = normalizeCriteria({ operation: o.operation ?? "any", zones: o.zones ?? [], price_min: o.priceMin ?? null, price_max: o.priceMax ?? null });
  if (!crit.ok) return BAD;

  const q = typeof o.q === "string" ? o.q.trim().slice(0, Q_MAX) : o.q == null ? "" : null;
  if (q === null) return BAD;

  const areaMin = intOrNull(o.areaMin, 0, AREA_LIMIT);
  const areaMax = intOrNull(o.areaMax, 0, AREA_LIMIT);
  if (areaMin === "bad" || areaMax === "bad") return BAD;
  if (areaMin !== null && areaMax !== null && areaMin > areaMax) return BAD;

  let bedrooms: BedroomsFilter = null;
  if (o.bedrooms != null) {
    const b = o.bedrooms as Record<string, unknown>;
    if (typeof b !== "object") return BAD;
    const n = intOrNull(b.n, 0, ROOMS_LIMIT);
    if (n === "bad" || n === null || (b.mode !== "exact" && b.mode !== "min")) return BAD;
    bedrooms = { n, mode: b.mode };
  }
  const bathroomsMin = intOrNull(o.bathroomsMin, 0, ROOMS_LIMIT);
  if (bathroomsMin === "bad") return BAD;
  const stay = (o.stay ?? "") as string;
  if (stay !== "" && stay !== "long" && stay !== "short") return BAD;
  const agencyIds = uuids(o.agencyIds);
  const tagIds = uuids(o.tagIds);
  if (agencyIds === "bad" || tagIds === "bad") return BAD;
  const status = (o.status ?? "") as StatusChoice;
  if (!CHOICES.has(status)) return BAD;
  const floorMin = intOrNull(o.floorMin, -2, FLOOR_MIN_LIMIT);
  if (floorMin === "bad") return BAD;
  const sort = (o.sort ?? "newest") as SearchSort;
  if (!SORTS.has(sort)) return BAD;

  return {
    ok: true,
    filters: {
      q,
      operation: crit.criteria.operation,
      zones: crit.criteria.zones,
      priceMin: crit.criteria.price_min,
      priceMax: crit.criteria.price_max,
      areaMin,
      areaMax,
      bedrooms,
      bathroomsMin,
      stay: stay as CatalogSearchFilters["stay"],
      agencyIds,
      tagIds,
      status,
      floorMin,
      sort,
    },
  };
}

/** Lo que recibe catalog_search (0212), con la MISMA forma que devuelve
 *  catalog_search_normalize: el texto y la planta se quedan en TS. */
export function toSqlFilters(f: CatalogSearchFilters, withTexts = false): Record<string, unknown> {
  return {
    operation: f.operation,
    zones: f.zones.map((z) => ({ kind: z.kind, name: z.name })),
    price_min: f.priceMin,
    price_max: f.priceMax,
    area_min: f.areaMin,
    area_max: f.areaMax,
    bedrooms: f.bedrooms?.n ?? null,
    bedrooms_mode: f.bedrooms?.mode ?? null,
    bathrooms_min: f.bathroomsMin,
    stay: f.stay || null,
    agency_ids: f.agencyIds,
    tag_ids: f.tagIds,
    statuses: STATUS_CHOICES[f.status],
    sort: f.sort,
    with_texts: withTexts,
  };
}

/** ¿Hace falta filtrar en TS (texto o planta) antes de paginar? */
export function needsPostFilter(f: CatalogSearchFilters): boolean {
  return f.q.trim() !== "" || f.floorMin !== null;
}

/** Cuántos filtros hay activos (sin contar el orden), para «Limpiar todo». */
export function activeFilterCount(f: CatalogSearchFilters): number {
  return [
    f.q.trim() !== "",
    f.operation !== "any",
    f.zones.length > 0,
    f.priceMin !== null || f.priceMax !== null,
    f.areaMin !== null || f.areaMax !== null,
    f.bedrooms !== null,
    f.bathroomsMin !== null,
    f.stay !== "",
    f.agencyIds.length > 0,
    f.tagIds.length > 0,
    f.status !== "",
    f.floorMin !== null,
  ].filter(Boolean).length;
}

// ── URL (mismos nombres que Propiedades donde existen) ──────────────────────

const ZONE_URL: Record<ZoneCriterion["kind"], string> = { district: "distrito", barrio: "barrio", free: "libre" };
const ZONE_FROM_URL: Record<string, ZoneCriterion["kind"]> = { distrito: "district", barrio: "barrio", libre: "free" };
const SORT_URL: Record<SearchSort, string> = { newest: "", price_asc: "precio-asc", price_desc: "precio-desc" };

/** Filtros → parámetros de URL. Vacío = no se escribe. */
export function filtersToSearchParams(f: CatalogSearchFilters): URLSearchParams {
  const sp = new URLSearchParams();
  const set = (k: string, v: string | number | null | undefined) => {
    if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  };
  set("q", f.q.trim());
  set("operacion", f.operation === "sale" ? "venta" : f.operation === "rent" ? "alquiler" : "");
  set("zonas", f.zones.map((z) => `${ZONE_URL[z.kind]}:${z.name}`).join("|"));
  set("precioMin", f.priceMin);
  set("precioMax", f.priceMax);
  set("m2Min", f.areaMin);
  set("m2Max", f.areaMax);
  set("dormitorios", f.bedrooms ? `${f.bedrooms.n}${f.bedrooms.mode === "min" ? "plus" : ""}` : "");
  set("banos", f.bathroomsMin);
  set("estancia", f.stay === "long" ? "larga" : f.stay === "short" ? "corta" : "");
  set("agencias", f.agencyIds.join(","));
  set("etiquetas", f.tagIds.join(","));
  set("estado", f.status);
  set("planta", f.floorMin);
  set("orden", SORT_URL[f.sort]);
  return sp;
}

/** Parámetros de URL → filtros, tolerante como Propiedades: un valor
 *  manipulado a mano se descarta (ese filtro queda vacío) en vez de romper. */
export function filtersFromSearchParams(sp: URLSearchParams, defaults: Partial<CatalogSearchFilters> = {}): CatalogSearchFilters {
  const base: CatalogSearchFilters = { ...EMPTY_SEARCH_FILTERS, ...defaults };
  const has = (k: string) => sp.has(k);
  const raw: Record<string, unknown> = {};
  raw.q = sp.get("q") ?? base.q;
  const op = sp.get("operacion");
  raw.operation = has("operacion") ? (op === "venta" ? "sale" : op === "alquiler" ? "rent" : "any") : base.operation;
  const zonas = sp.get("zonas");
  raw.zones = zonas
    ? zonas.split("|").flatMap((part) => {
        const i = part.indexOf(":");
        const kind = ZONE_FROM_URL[part.slice(0, i)];
        return kind && i > 0 ? [{ kind, name: part.slice(i + 1) }] : [];
      }).slice(0, ZONES_MAX)
    : base.zones;
  raw.priceMin = sp.get("precioMin") ?? base.priceMin;
  raw.priceMax = sp.get("precioMax") ?? base.priceMax;
  raw.areaMin = sp.get("m2Min") ?? base.areaMin;
  raw.areaMax = sp.get("m2Max") ?? base.areaMax;
  const dorm = sp.get("dormitorios");
  raw.bedrooms = dorm && /^\d+(plus)?$/.test(dorm) ? { n: Number(dorm.replace("plus", "")), mode: dorm.endsWith("plus") ? "min" : "exact" } : has("dormitorios") ? null : base.bedrooms;
  raw.bathroomsMin = sp.get("banos") ?? base.bathroomsMin;
  const est = sp.get("estancia");
  raw.stay = has("estancia") ? (est === "larga" ? "long" : est === "corta" ? "short" : "") : base.stay;
  raw.agencyIds = has("agencias") ? (sp.get("agencias") ?? "").split(",").filter(Boolean) : base.agencyIds;
  raw.tagIds = has("etiquetas") ? (sp.get("etiquetas") ?? "").split(",").filter(Boolean) : base.tagIds;
  raw.status = sp.get("estado") ?? base.status;
  raw.floorMin = sp.get("planta") ?? base.floorMin;
  const orden = sp.get("orden");
  raw.sort = orden === "precio-asc" ? "price_asc" : orden === "precio-desc" ? "price_desc" : has("orden") ? "newest" : base.sort;

  // Campo a campo: lo que no valga se queda en su valor por defecto.
  let f: CatalogSearchFilters = { ...base };
  const keys = Object.keys(raw) as (keyof CatalogSearchFilters)[];
  for (const k of keys) {
    const r = normalizeSearchFilters({ ...toInput(f), [k]: raw[k] });
    if (r.ok) f = r.filters;
  }
  // Ej.: un precio sin operación no vale y se descarta (la operación se aplica antes).
  return f;
}

/** Filtros normalizados → la forma de entrada de normalizeSearchFilters. */
export function toInput(f: CatalogSearchFilters): Record<string, unknown> {
  return { ...f };
}
