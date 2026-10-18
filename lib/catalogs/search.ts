import { resolveFloor } from "@/lib/floor";
import { matchesPropertySearch } from "@/lib/properties/admin-search";
import type { CatalogOperation } from "./criteria";
import { type CatalogSearchFilters, needsPostFilter, type SearchStatus, toSqlFilters } from "./search-filters";
import { catalogFold } from "./zones";

// ============================================================================
// Buscador del catálogo (BCP-01 P2, I-1 a I-6). Sin estado; la llamada a la
// base de datos se inyecta (`rpc`) para probarlo sin red.
//
// · SQL (catalog_search, 0212): España, estados, operación y precio K2, zonas
//   por la taxonomía, m², dormitorios, baños, estancia, agencia y etiquetas.
// · TS, con la lógica que ya manda en el CRM: el texto con
//   matchesPropertySearch (plegando tildes en las dos partes, sin tocar la
//   función de Propiedades) y la planta con resolveFloor.
// · Paginación en el servidor sobre el total REAL: sin texto ni planta, la
//   página la corta SQL; con texto o planta, SQL devuelve todas las que
//   cumplen el resto (un solo jsonb) y aquí se filtra y se corta. Sin límite
//   de 2.000 filas en ningún caso.
// · Cada fila dice si se puede añadir y, si no, por qué (I-1).
// ============================================================================

export const SEARCH_PAGE_SIZE = 20;
export const CATALOG_MAX = 24;

export type IneligibleReason = "in_catalog" | "catalog_auto" | "catalog_archived" | "sold" | "archived" | "catalog_full";

export const INELIGIBLE_LABELS: Record<IneligibleReason, string> = {
  in_catalog: "Ya está en el catálogo",
  catalog_auto: "Catálogo automático: conviértelo en selección fija para elegir viviendas",
  catalog_archived: "El catálogo está archivado",
  sold: "Vendida: no se puede añadir",
  archived: "Archivada: no se puede añadir",
  catalog_full: `El catálogo ya tiene ${CATALOG_MAX} viviendas (el máximo)`,
};

export interface SearchRowRaw {
  id: string;
  slug: string;
  title: string;
  bc_reference: string | null;
  external_id: string | null;
  property_reference: string | null;
  zone: string | null;
  subzone: string | null;
  agency_id: string | null;
  agency_name: string | null;
  tag_names: string[];
  status: SearchStatus;
  operation: string;
  operations: string[] | null;
  price: number | string | null;
  rent_price: number | string | null;
  currency: string | null;
  eff_price: number | string | null;
  bedrooms: number;
  bathrooms: number;
  square_meters: number | null;
  stay: "long" | "short" | null;
  created_at: string;
  photo_count: number;
  cover_url: string | null;
  in_catalog: boolean;
  texts: { floor_override: string | null; features: string[] | null; features_manual: string[] | null; description: string | null } | null;
}

export interface SearchCatalogInfo {
  mode: "manual" | "auto";
  status: string;
  /** Viviendas que hoy ve el lector (lista efectiva). */
  visible: number;
  max: number;
}

export interface SearchResultRow {
  id: string;
  slug: string;
  title: string;
  bcReference: string | null;
  zone: string | null;
  subzone: string | null;
  agencyName: string | null;
  tagNames: string[];
  status: SearchStatus;
  operation: string;
  operations: string[];
  price: number | null;
  rentPrice: number | null;
  currency: string | null;
  effPrice: number | null;
  bedrooms: number;
  bathrooms: number;
  squareMeters: number | null;
  stay: "long" | "short" | null;
  /** Planta deducida (resolveFloor), si se pidieron los textos. */
  floor: number | null;
  photoCount: number;
  coverUrl: string | null;
  inCatalog: boolean;
  canAdd: boolean;
  reason: IneligibleReason | null;
  /** Avisos que no impiden añadir («Sin fotos»). */
  warnings: string[];
}

export interface SearchResult {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  rows: SearchResultRow[];
  catalog: SearchCatalogInfo;
  /** Operación con la que se calcula el precio mostrado (la del filtro o la del catálogo). */
  operation: CatalogOperation;
}

export type SearchRpc = (fn: "catalog_search", args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

interface RpcPayload {
  total: number;
  rows: SearchRowRaw[];
  catalog: SearchCatalogInfo;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** El texto de búsqueda de Propiedades, plegando tildes en las dos partes. */
export function matchesCatalogText(r: Pick<SearchRowRaw, "title" | "zone" | "subzone" | "agency_name" | "tag_names" | "bc_reference" | "external_id" | "property_reference">, q: string): boolean {
  const f = (s: string | null | undefined) => (s ? catalogFold(s) : s);
  return matchesPropertySearch(
    {
      title: f(r.title) ?? "",
      zone: f(r.zone),
      subzone: f(r.subzone),
      agencyName: f(r.agency_name),
      tagNames: (r.tag_names ?? []).map((t) => catalogFold(t)),
      bcReference: r.bc_reference,
      reference: r.external_id,
      propertyReference: r.property_reference,
    },
    catalogFold(q),
  );
}

/** Planta de una fila con textos (null si no se puede deducir). */
export function rowFloor(r: Pick<SearchRowRaw, "title" | "texts">): number | null {
  if (!r.texts) return null;
  return resolveFloor(r.texts.floor_override, [...(r.texts.features ?? []), ...(r.texts.features_manual ?? [])], r.title, r.texts.description);
}

/** Si se puede añadir y, si no, el motivo (por orden de importancia). */
export function eligibility(r: Pick<SearchRowRaw, "status" | "in_catalog">, catalog: SearchCatalogInfo): { canAdd: boolean; reason: IneligibleReason | null } {
  if (r.in_catalog) return { canAdd: false, reason: "in_catalog" };
  if (catalog.mode === "auto") return { canAdd: false, reason: "catalog_auto" };
  if (catalog.status !== "active") return { canAdd: false, reason: "catalog_archived" };
  if (r.status === "sold") return { canAdd: false, reason: "sold" };
  if (r.status === "archived") return { canAdd: false, reason: "archived" };
  if (catalog.visible >= catalog.max) return { canAdd: false, reason: "catalog_full" };
  return { canAdd: true, reason: null };
}

function toRow(r: SearchRowRaw, catalog: SearchCatalogInfo): SearchResultRow {
  const el = eligibility(r, catalog);
  const warnings: string[] = [];
  if (!r.photo_count) warnings.push("Sin fotos");
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    bcReference: r.bc_reference,
    zone: r.zone,
    subzone: r.subzone,
    agencyName: r.agency_name,
    tagNames: r.tag_names ?? [],
    status: r.status,
    operation: r.operation,
    operations: r.operations ?? [],
    price: num(r.price),
    rentPrice: num(r.rent_price),
    currency: r.currency,
    effPrice: num(r.eff_price),
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    squareMeters: r.square_meters,
    stay: r.stay,
    floor: rowFloor(r),
    photoCount: Number(r.photo_count ?? 0),
    coverUrl: r.cover_url,
    inCatalog: r.in_catalog === true,
    canAdd: el.canAdd,
    reason: el.reason,
    warnings,
  };
}

async function call(rpc: SearchRpc, args: Record<string, unknown>): Promise<RpcPayload> {
  const { data, error } = await rpc("catalog_search", args);
  if (error) throw new Error(error.message);
  const d = data as RpcPayload | null;
  if (!d || !Array.isArray(d.rows)) throw new Error("catalog_search: respuesta inesperada");
  return d;
}

/** Busca una página. `filters` ya normalizados (normalizeSearchFilters). */
export async function searchCatalog(
  rpc: SearchRpc,
  args: { actor: string; catalogId: string; filters: CatalogSearchFilters; page: number; pageSize?: number; catalogOperation: CatalogOperation },
): Promise<SearchResult> {
  const pageSize = Math.min(Math.max(args.pageSize ?? SEARCH_PAGE_SIZE, 1), 100);
  const page = Math.max(1, Math.floor(args.page) || 1);
  const f = args.filters;
  const operation = f.operation !== "any" ? f.operation : args.catalogOperation;
  const base = { p_actor: args.actor, p_catalog: args.catalogId };

  let total: number;
  let rows: SearchRowRaw[];
  let catalog: SearchCatalogInfo;
  if (!needsPostFilter(f)) {
    const d = await call(rpc, { ...base, p_filters: toSqlFilters(f), p_offset: (page - 1) * pageSize, p_limit: pageSize });
    total = Number(d.total);
    rows = d.rows;
    catalog = d.catalog;
  } else {
    const d = await call(rpc, { ...base, p_filters: toSqlFilters(f, f.floorMin !== null), p_offset: 0, p_limit: null });
    const q = f.q.trim();
    const all = d.rows.filter((r) => {
      if (q && !matchesCatalogText(r, q)) return false;
      if (f.floorMin !== null) {
        // Como en Propiedades: sin planta conocida no se garantiza el mínimo.
        const fl = rowFloor(r);
        if (fl === null || fl < f.floorMin) return false;
      }
      return true;
    });
    total = all.length;
    rows = all.slice((page - 1) * pageSize, page * pageSize);
    catalog = d.catalog;
  }
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    rows: rows.map((r) => toRow(r, catalog)),
    catalog,
    operation,
  };
}
