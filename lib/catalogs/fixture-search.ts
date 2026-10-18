// ============================================================================
// SOLO DESARROLLO LOCAL (BCP-01 P3): el buscador del catálogo sobre el
// universo SINTÉTICO de fixtures-selection.ts, para revisar la interfaz en
// /dev-fixtures sin base de datos. Imita la parte SQL de catalog_search
// (0212) —la que de verdad manda está probada en el Postgres temporal— y
// pasa el resultado por searchCatalog (texto, planta, paginación y motivos),
// el MISMO código que usa el servidor.
// ============================================================================
import { fitsOperation, operationPrice } from "./operation-price";
import { searchCatalog, type SearchResult, type SearchRowRaw } from "./search";
import { type CatalogSearchFilters, STATUS_CHOICES } from "./search-filters";
import type { CatalogOperation } from "./criteria";
import { catalogFold, catalogZoneMatch, zoneCandidates } from "./zones";
import type { FixtureProperty } from "./fixtures-selection";

export const FIXTURE_AGENCIES = [
  { id: "f1a00000-0000-4000-8000-000000000001", name: "Level" },
  { id: "f1a00000-0000-4000-8000-000000000002", name: "Housingo" },
];
export const FIXTURE_TAGS = [
  { id: "f1e00000-0000-4000-8000-000000000001", name: "Exclusiva", color: "#B8913E" },
  { id: "f1e00000-0000-4000-8000-000000000002", name: "Reformado", color: "#10B981" },
];

function zoneOk(p: FixtureProperty, f: CatalogSearchFilters): boolean {
  if (!f.zones.length) return true;
  const texts = [p.zone, p.subzone].filter((t): t is string => Boolean(t));
  return texts.some((t) => {
    const m = catalogZoneMatch(t);
    const c = zoneCandidates(t);
    return f.zones.some((z) =>
      z.kind === "district" ? m?.district === z.name : z.kind === "barrio" ? m?.barrio === z.name : c.includes(catalogFold(z.name)),
    );
  });
}

export async function fixtureCatalogSearch(args: {
  pool: FixtureProperty[];
  inCatalog: Set<string>;
  catalog: { mode: "manual" | "auto"; status: string; visible: number };
  filters: CatalogSearchFilters;
  page: number;
  catalogOperation: CatalogOperation;
  photoUrl: (id: string) => string | null;
}): Promise<SearchResult> {
  const { pool, filters: f } = args;
  const statuses = STATUS_CHOICES[f.status];
  const idx = (id: string) => pool.findIndex((p) => p.id === id);
  const rows: SearchRowRaw[] = pool
    .filter((p) => {
      const st = p.archived_at ? "archived" : p.status;
      if (!statuses.includes(st as never)) return false;
      if (!fitsOperation(p, f.operation)) return false;
      const eff = operationPrice(p, f.operation);
      if (f.priceMin !== null && (eff === null || eff < f.priceMin)) return false;
      if (f.priceMax !== null && (eff === null || eff > f.priceMax)) return false;
      if (f.areaMin !== null && (p.square_meters === null || p.square_meters < f.areaMin)) return false;
      if (f.areaMax !== null && (p.square_meters === null || p.square_meters > f.areaMax)) return false;
      if (f.bedrooms && (p.bedrooms === null || (f.bedrooms.mode === "exact" ? p.bedrooms !== f.bedrooms.n : p.bedrooms < f.bedrooms.n))) return false;
      if (f.bathroomsMin !== null && (p.bathrooms === null || p.bathrooms < f.bathroomsMin)) return false;
      if (f.stay) return false; // el universo sintético no tiene estancia
      if (f.agencyIds.length && !f.agencyIds.includes(FIXTURE_AGENCIES[idx(p.id) % 2].id)) return false;
      if (f.tagIds.length && !(idx(p.id) % 3 === 0 && f.tagIds.includes(FIXTURE_TAGS[0].id))) return false;
      return zoneOk(p, f);
    })
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      bc_reference: p.bc_reference,
      external_id: null,
      property_reference: null,
      zone: p.zone,
      subzone: p.subzone,
      agency_id: FIXTURE_AGENCIES[idx(p.id) % 2].id,
      agency_name: FIXTURE_AGENCIES[idx(p.id) % 2].name,
      tag_names: idx(p.id) % 3 === 0 ? [FIXTURE_TAGS[0].name] : [],
      status: (p.archived_at ? "archived" : p.status) as SearchRowRaw["status"],
      operation: p.operation,
      operations: p.operations,
      price: p.price,
      rent_price: p.rent_price,
      currency: "eur",
      eff_price: operationPrice(p, f.operation),
      bedrooms: p.bedrooms ?? 0,
      bathrooms: p.bathrooms ?? 0,
      square_meters: p.square_meters,
      stay: null,
      created_at: p.created_at,
      photo_count: p.photo_count,
      cover_url: p.photo_count ? args.photoUrl(p.id) : null,
      in_catalog: args.inCatalog.has(p.id),
      texts: { floor_override: null, features: [`Planta ${(idx(p.id) % 6) + 1}ª`], features_manual: [], description: null },
    }));
  const grp = (r: SearchRowRaw) => (f.operation === "any" && r.operation !== "sale" ? 1 : 0);
  rows.sort((a, b) => {
    if (f.sort !== "newest" && grp(a) !== grp(b)) return grp(a) - grp(b);
    const pa = Number(a.eff_price ?? NaN), pb = Number(b.eff_price ?? NaN);
    if (f.sort === "price_asc" || f.sort === "price_desc") {
      if (Number.isNaN(pa) !== Number.isNaN(pb)) return Number.isNaN(pa) ? 1 : -1;
      if (pa !== pb) return f.sort === "price_asc" ? pa - pb : pb - pa;
    }
    return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
  });
  const catalog = { ...args.catalog, max: 24 };
  return searchCatalog(
    async (_fn, a) => {
      const off = Number(a.p_offset ?? 0);
      const lim = a.p_limit == null ? rows.length : Number(a.p_limit);
      return { data: { total: rows.length, rows: rows.slice(off, off + lim), catalog }, error: null };
    },
    { actor: "fixture", catalogId: "fixture", filters: f, page: args.page, catalogOperation: args.catalogOperation },
  );
}
