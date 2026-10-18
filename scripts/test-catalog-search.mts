// Buscador del catálogo (BCP-01 P2): filtros, URL, texto y planta en TS,
// elegibilidad y paginación del servidor con una RPC falsa (sin red).
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-catalog-search.mts
import assert from "node:assert/strict";
import { catalogErrorMessage, GENERIC_ERROR } from "../lib/catalogs/errors.ts";
import {
  activeFilterCount, EMPTY_SEARCH_FILTERS, filtersFromSearchParams, filtersToSearchParams, needsPostFilter,
  normalizeSearchFilters, toSqlFilters, type CatalogSearchFilters,
} from "../lib/catalogs/search-filters.ts";
import { eligibility, matchesCatalogText, rowFloor, searchCatalog, type SearchRowRaw, type SearchRpc } from "../lib/catalogs/search.ts";

let n = 0;
const ok = (c: boolean, name: string) => { assert.ok(c, name); n++; };
const F = (o: Record<string, unknown>) => {
  const r = normalizeSearchFilters(o);
  assert.ok(r.ok, `debería valer: ${JSON.stringify(o)}`);
  return r.filters;
};

// ── Normalización ───────────────────────────────────────────────────────────
ok(JSON.stringify(F({})) === JSON.stringify(EMPTY_SEARCH_FILTERS), "vacío = filtros por defecto");
ok(!normalizeSearchFilters({ operation: "any", priceMin: 1 }).ok, "precio sin operación: no vale (K2)");
ok(F({ operation: "rent", priceMin: "5.000" }).priceMin === 5000, "precio con punto de miles, como los criterios");
ok(!normalizeSearchFilters({ areaMin: 200, areaMax: 100 }).ok, "m² mínimo > máximo: no vale");
ok(!normalizeSearchFilters({ zones: [{ kind: "district", name: "Atlantis" }] }).ok, "distrito desconocido: no vale");
ok(F({ zones: [{ kind: "barrio", name: "Recoletos" }, { kind: "barrio", name: "Recoletos" }] }).zones.length === 1, "zonas repetidas: una");
ok(F({ q: "  x".padEnd(200, "y") }).q.length === 80, "texto: recortado a 80");
ok(!normalizeSearchFilters({ agencyIds: ["no"] }).ok && !normalizeSearchFilters({ status: "rented" }).ok, "agencia no uuid o estado desconocido: no vale");
ok(F({ agencyIds: ["A9000000-0000-0000-0000-0000000000A1", "a9000000-0000-0000-0000-0000000000a1"] }).agencyIds.length === 1, "ids en minúsculas y sin repetir");
ok(F({ floorMin: "3" }).floorMin === 3 && !normalizeSearchFilters({ floorMin: 99 }).ok, "planta mínima: 3 vale, 99 no");

// ── A SQL ───────────────────────────────────────────────────────────────────
const sql = toSqlFilters(F({ operation: "rent", bedrooms: { n: 3, mode: "min" }, stay: "long", status: "todas", q: "bc", floorMin: 2 }), true);
ok(sql.bedrooms === 3 && sql.bedrooms_mode === "min" && sql.stay === "long" && sql.with_texts === true, "a SQL: dormitorios, estancia y textos");
ok(JSON.stringify(sql.statuses) === '["available","reserved","sold","archived"]', "a SQL: «todas» = los cuatro estados");
ok(!("q" in sql) && !("floor" in sql) && !("floorMin" in sql), "a SQL: ni texto ni planta");
ok(JSON.stringify(toSqlFilters(F({})).statuses) === '["available","reserved"]', "a SQL: por defecto disponibles y reservadas");
ok(needsPostFilter(F({ q: "x" })) && needsPostFilter(F({ floorMin: 1 })) && !needsPostFilter(F({ operation: "sale" })), "post-filtro solo con texto o planta");
ok(activeFilterCount(F({ operation: "sale", priceMin: 1, priceMax: 2, q: "a" })) === 3, "contador de filtros activos");

// ── URL ─────────────────────────────────────────────────────────────────────
const full: CatalogSearchFilters = F({
  q: "BC-1", operation: "rent", zones: [{ kind: "district", name: "Salamanca" }, { kind: "barrio", name: "Justicia" }, { kind: "free", name: "Las Rozas" }],
  priceMin: 1000, priceMax: 3000, areaMin: 50, areaMax: 120, bedrooms: { n: 2, mode: "min" }, bathroomsMin: 2, stay: "short",
  agencyIds: ["a9000000-0000-0000-0000-0000000000a1"], tagIds: ["a9000000-0000-0000-0000-0000000000e1"], status: "todas", floorMin: 3, sort: "price_desc",
});
const sp = filtersToSearchParams(full);
ok(sp.get("operacion") === "alquiler" && sp.get("dormitorios") === "2plus" && sp.get("estancia") === "corta", "URL: nombres de Propiedades");
ok(JSON.stringify(filtersFromSearchParams(new URLSearchParams(sp.toString()))) === JSON.stringify(full), "URL: ida y vuelta exacta");
const junk = filtersFromSearchParams(new URLSearchParams("operacion=venta&precioMin=abc&dormitorios=x&zonas=distrito:Atlantis|barrio:Recoletos&estado=rented&planta=3"));
ok(junk.operation === "sale" && junk.priceMin === null && junk.bedrooms === null && junk.status === "" && junk.floorMin === 3, "URL manipulada: se descarta lo que no vale, campo a campo");
ok(junk.zones.length === 0, "URL: con una zona desconocida se descarta el filtro de zonas entero");
ok(filtersFromSearchParams(new URLSearchParams("precioMin=100")).priceMin === null, "URL: precio sin operación se descarta");
ok(filtersFromSearchParams(new URLSearchParams(""), { operation: "rent" }).operation === "rent", "URL: la operación por defecto es la del catálogo");
ok(filtersFromSearchParams(new URLSearchParams("operacion="), { operation: "rent" }).operation === "any", "URL: «Todas» explícito gana a la del catálogo");

// ── Texto y planta (lógica que manda en el CRM) ─────────────────────────────
const raw = (o: Partial<SearchRowRaw>): SearchRowRaw => ({
  id: "x", slug: "x", title: "Piso", bc_reference: "BC-1766", external_id: "idealista-111959166", property_reference: "PROP-2026-1655",
  zone: "Chamberí", subzone: "Almagro", agency_id: null, agency_name: "Sotheby's", tag_names: ["Exclusiva"], status: "available",
  operation: "rent", operations: ["rent"], price: 3000, rent_price: null, currency: "eur", eff_price: 3000, bedrooms: 2, bathrooms: 1,
  square_meters: 80, stay: "long", created_at: "2026-10-01", photo_count: 1, cover_url: null, in_catalog: false, texts: null, ...o,
});
ok(matchesCatalogText(raw({}), "chamberi") && matchesCatalogText(raw({}), "CHAMBERÍ"), "texto: pliega tildes en las dos partes");
ok(matchesCatalogText(raw({}), "bc1766") && matchesCatalogText(raw({}), "111959166") && matchesCatalogText(raw({}), "prop-2026-1655"), "texto: referencias BC, portal y PROP");
ok(matchesCatalogText(raw({}), "exclusiva") && matchesCatalogText(raw({}), "sotheby"), "texto: etiqueta y agencia");
ok(!matchesCatalogText(raw({}), "salamanca"), "texto: no casa lo que no está");
ok(rowFloor(raw({ texts: { floor_override: null, features: ["Planta 3ª exterior"], features_manual: [], description: null } })) === 3, "planta: de las características");
ok(rowFloor(raw({ texts: { floor_override: "atico", features: [], features_manual: [], description: null } })) === 99, "planta: override humano");
ok(rowFloor(raw({ texts: null })) === null, "planta: sin textos, sin dato");

// ── Elegibilidad ────────────────────────────────────────────────────────────
const cat = { mode: "manual" as const, status: "active", visible: 3, max: 24 };
ok(eligibility({ status: "available", in_catalog: false }, cat).canAdd, "disponible: se puede añadir");
ok(eligibility({ status: "reserved", in_catalog: false }, cat).canAdd, "reservada: se puede añadir");
ok(eligibility({ status: "sold", in_catalog: false }, cat).reason === "sold", "vendida: motivo");
ok(eligibility({ status: "archived", in_catalog: false }, cat).reason === "archived", "archivada: motivo");
ok(eligibility({ status: "available", in_catalog: true }, cat).reason === "in_catalog", "ya está: motivo (antes que lleno)");
ok(eligibility({ status: "available", in_catalog: false }, { ...cat, visible: 24 }).reason === "catalog_full", "24 visibles: lleno");
ok(eligibility({ status: "sold", in_catalog: false }, { ...cat, visible: 24 }).reason === "sold", "vendida en un catálogo lleno: dice «vendida»");
ok(eligibility({ status: "available", in_catalog: false }, { ...cat, mode: "auto" }).reason === "catalog_auto", "automático: motivo");
ok(eligibility({ status: "available", in_catalog: false }, { ...cat, status: "archived" }).reason === "catalog_archived", "catálogo archivado: motivo");

// ── Paginación del servidor con una RPC falsa ───────────────────────────────
const calls: Record<string, unknown>[] = [];
const universe = Array.from({ length: 45 }, (_, i) => raw({
  id: `p${i}`, slug: `s${i}`, zone: "Tetuán", subzone: null, title: i % 3 === 0 ? `Ático Chamberí ${i}` : `Piso ${i}`, photo_count: i % 5 === 0 ? 0 : 2,
  texts: { floor_override: null, features: [i % 2 ? `Planta ${i % 8}ª` : "Bajo"], features_manual: [], description: null },
}));
const fake: SearchRpc = async (_fn, args) => {
  calls.push(args);
  const off = Number(args.p_offset ?? 0);
  const lim = args.p_limit == null ? universe.length : Number(args.p_limit);
  const withTexts = (args.p_filters as Record<string, unknown>).with_texts === true;
  const rows = universe.slice(off, off + lim).map((r) => ({ ...r, texts: withTexts ? r.texts : null }));
  return { data: { total: universe.length, rows, catalog: cat }, error: null };
};
const base = { actor: "a", catalogId: "c", catalogOperation: "sale" as const };
let r = await searchCatalog(fake, { ...base, filters: F({}), page: 2 });
ok(calls.at(-1)!.p_offset === 20 && calls.at(-1)!.p_limit === 20, "sin texto ni planta: SQL corta la página (offset 20, límite 20)");
ok(r.total === 45 && r.totalPages === 3 && r.rows.length === 20 && r.rows[0].id === "p20", "total real y página 2");
ok(r.operation === "sale", "precio con la operación del catálogo si el filtro es «Todas»");
ok(r.rows.find((x) => x.id === "p20")!.warnings.includes("Sin fotos"), "aviso «Sin fotos» sin impedir añadir");
r = await searchCatalog(fake, { ...base, filters: F({ q: "chamberi" }), page: 1 });
ok(calls.at(-1)!.p_limit === null && (calls.at(-1)!.p_filters as Record<string, unknown>).with_texts === false, "con texto: SQL devuelve todas, sin textos de planta");
ok(r.total === 15 && r.rows.length === 15 && r.rows.every((x) => x.title.includes("Chamberí")), "texto: total y filas filtradas en el servidor");
r = await searchCatalog(fake, { ...base, filters: F({ floorMin: 5 }), page: 1, pageSize: 5 });
ok((calls.at(-1)!.p_filters as Record<string, unknown>).with_texts === true, "con planta: se piden los textos");
const expected = universe.filter((u) => Number(u.id.slice(1)) % 2 === 1 && Number(u.id.slice(1)) % 8 >= 5);
ok(r.total === expected.length && r.rows.length === 5 && r.rows.every((x) => (x.floor ?? -1) >= 5), "planta: «Bajo» y las de menos quedan fuera; página de 5");
r = await searchCatalog(fake, { ...base, filters: F({ q: "chamberi" }), page: 9 });
ok(r.rows.length === 0 && r.total === 15, "página fuera de rango: vacía, con el total");
await assert.rejects(searchCatalog(async () => ({ data: null, error: { message: "forbidden" } }), { ...base, filters: F({}), page: 1 }), /forbidden/);
n++;

// ── Mensajes ────────────────────────────────────────────────────────────────
ok(catalogErrorMessage({ message: "catalog_full" }).includes("24") && catalogErrorMessage({ message: "invalid_filters" }) !== GENERIC_ERROR, "mensajes de catalog_full e invalid_filters");

console.log(`✅ ${n} comprobaciones del buscador del catálogo`);
