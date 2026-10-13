import type { CatalogCriteria } from "./criteria";
import { catalogFold, catalogZoneMatch, zoneCandidates } from "./zones";

// ============================================================================
// Selección automática de un catálogo — REFERENCIA en TS (BCP-01 ampliación
// X5). La app real la calcula en SQL (catalog_select, migración 0195) dentro
// de la misma sentencia que la instantánea; esta copia pura existe para:
//   · comparar SQL con TS sobre un conjunto sintético (test de paridad);
//   · los datos de prueba locales (/dev-fixtures).
//
// Reglas (P2/P4/P5, condición 2):
//   1. Entra: España, no archivada, disponible o reservada, con ≥ 1 foto
//      (en modo automático; la búsqueda manual no exige foto).
//   2. Operación: venta → operation='sale' y precio = price; alquiler →
//      operation='rent' (price) o venta con 'rent' en operations (rent_price);
//      any → todas (primero el grupo de venta).
//   3. Precio ≤ 0 o vacío = sin precio: con rango no entra; sin rango sí.
//   4. Zona: distrito o barrio según catalogZoneMatch() de zone O subzone;
//      un nombre libre casa con cualquier fragmento normalizado. Sin zona
//      reconocible no entra si hay criterio de zona.
//   5. Orden COMPLETO y estable: grupo, precio (sin precio al final),
//      created_at descendente, id. Después, y solo después, el máximo.
//
// Ajustes (C1, migración 0196): las exclusiones salen ANTES del máximo; las
// inclusiones disponibles (España, sin archivar, disponible o reservada; sin
// foto también) tienen plaza asegurada y se mezclan en el mismo orden. Una
// inclusión de otra operación va en un grupo posterior (2) por su propio
// importe. Si hay más inclusiones disponibles que plazas, entran las primeras
// del orden.
// ============================================================================

export interface CandidateProperty {
  id: string;
  country: string;
  archived_at: string | null;
  status: string;
  operation: "sale" | "rent";
  operations: string[];
  price: number | null;
  rent_price: number | null;
  zone: string | null;
  subzone: string | null;
  created_at: string;
  photo_count: number;
  bc_reference?: string | null;
  title?: string | null;
}

export interface Candidate {
  id: string;
  /** 0/1: grupos de la operación del catálogo (en «ambas», venta y alquiler);
   *  2: inclusiones de otra operación. */
  group: 0 | 1 | 2;
  price: number | null;
}

export type AdjustmentKind = "include" | "exclude";
export interface Adjustment {
  propertyId: string;
  kind: AdjustmentKind;
}
export type Via = "match" | "include" | "both";

function positive(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** España, sin archivar, disponible o reservada (lo mínimo para aparecer). */
export function isAvailable(p: Pick<CandidateProperty, "country" | "archived_at" | "status">): boolean {
  return p.country === "es" && !p.archived_at && (p.status === "available" || p.status === "reserved");
}

/** ¿La operación de la vivienda es la del catálogo? */
export function fitsOperation(p: Pick<CandidateProperty, "operation" | "operations">, c: CatalogCriteria): boolean {
  if (c.operation === "sale") return p.operation === "sale";
  if (c.operation === "rent") return p.operation === "rent" || p.operations.includes("rent");
  return true;
}

/** Grupo e importe con los que se ordena una vivienda en este catálogo (los
 *  mismos que usa candidates() para las coincidencias). */
export function orderKeyOf(p: CandidateProperty, c: CatalogCriteria): Candidate {
  if (!fitsOperation(p, c)) return { id: p.id, group: 2, price: positive(p.price) };
  if (c.operation === "rent") {
    return { id: p.id, group: 0, price: positive(p.operation === "rent" ? p.price : p.rent_price) };
  }
  if (c.operation === "sale") return { id: p.id, group: 0, price: positive(p.price) };
  return { id: p.id, group: p.operation === "sale" ? 0 : 1, price: positive(p.price) };
}

export function zoneMatches(p: Pick<CandidateProperty, "zone" | "subzone">, c: CatalogCriteria): boolean {
  if (c.zones.length === 0) return true;
  const m1 = catalogZoneMatch(p.zone);
  const m2 = catalogZoneMatch(p.subzone);
  const frags = new Set([...zoneCandidates(p.zone), ...zoneCandidates(p.subzone)]);
  return c.zones.some((z) => {
    if (z.kind === "district") return m1?.district === z.name || m2?.district === z.name;
    if (z.kind === "barrio") return m1?.barrio === z.name || m2?.barrio === z.name;
    return frags.has(catalogFold(z.name));
  });
}

export function candidates(
  props: CandidateProperty[],
  c: CatalogCriteria,
  opts: { requirePhoto: boolean; text?: string | null },
): Candidate[] {
  const text = opts.text?.trim() ? catalogFold(opts.text) : null;
  const out: Candidate[] = [];
  for (const p of props) {
    if (p.country !== "es" || p.archived_at || (p.status !== "available" && p.status !== "reserved")) continue;
    if (opts.requirePhoto && p.photo_count < 1) continue;
    let group: 0 | 1 = 0;
    let price: number | null;
    if (c.operation === "sale") {
      if (p.operation !== "sale") continue;
      price = positive(p.price);
    } else if (c.operation === "rent") {
      if (p.operation === "rent") price = positive(p.price);
      else if (p.operations.includes("rent")) price = positive(p.rent_price);
      else continue;
    } else {
      group = p.operation === "sale" ? 0 : 1;
      price = positive(p.price);
    }
    if (c.price_min !== null || c.price_max !== null) {
      if (price === null) continue;
      if (c.price_min !== null && price < c.price_min) continue;
      if (c.price_max !== null && price > c.price_max) continue;
    }
    if (!zoneMatches(p, c)) continue;
    if (text && !catalogFold(`${p.bc_reference ?? ""} ${p.title ?? ""}`).includes(text)) continue;
    out.push({ id: p.id, group, price });
  }
  return out;
}

/** Orden completo y estable (también el de la búsqueda manual). */
export function sortCandidates(list: Candidate[], c: CatalogCriteria, createdAt: Map<string, string>): Candidate[] {
  return [...list].sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (c.sort !== "newest") {
      if (a.price === null && b.price !== null) return 1;
      if (b.price === null && a.price !== null) return -1;
      if (a.price !== null && b.price !== null && a.price !== b.price) {
        return c.sort === "price_asc" ? a.price - b.price : b.price - a.price;
      }
    }
    const ca = createdAt.get(a.id) ?? "";
    const cb = createdAt.get(b.id) ?? "";
    if (ca !== cb) return ca < cb ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Resultado del modo automático: lista ordenada hasta el máximo, con los
 *  ajustes aplicados. `total` = coincidencias (sin excluidas) + inclusiones que
 *  no coinciden; `matched` = coincidencias sin excluidas. */
export function autoSelect(
  props: CandidateProperty[],
  c: CatalogCriteria,
  adjustments: Adjustment[] = [],
): { ids: string[]; total: number; matched: number; via: Via[] } {
  const excluded = new Set(adjustments.filter((a) => a.kind === "exclude").map((a) => a.propertyId));
  const included = new Set(adjustments.filter((a) => a.kind === "include").map((a) => a.propertyId));
  const matches = candidates(props, c, { requirePhoto: true }).filter((x) => !excluded.has(x.id));
  const matchIds = new Set(matches.map((m) => m.id));
  const extra = props.filter((p) => included.has(p.id) && !matchIds.has(p.id) && isAvailable(p)).map((p) => orderKeyOf(p, c));
  const all = sortCandidates([...matches, ...extra], c, new Map(props.map((p) => [p.id, p.created_at])));
  const isIncl = (x: Candidate) => included.has(x.id);
  const nIncl = all.filter(isIncl).length;
  const keep = new Set([
    ...all.filter(isIncl).slice(0, c.max).map((x) => x.id),
    ...all.filter((x) => !isIncl(x)).slice(0, c.max - Math.min(nIncl, c.max)).map((x) => x.id),
  ]);
  const selected = all.filter((x) => keep.has(x.id));
  return {
    ids: selected.map((x) => x.id),
    total: all.length,
    matched: matches.length,
    via: selected.map((x) => (matchIds.has(x.id) ? (included.has(x.id) ? "both" : "match") : "include")),
  };
}
