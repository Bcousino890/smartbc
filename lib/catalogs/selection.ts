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
  group: 0 | 1;
  price: number | null;
}

function positive(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
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

/** Resultado del modo automático: lista ordenada hasta el máximo y total. */
export function autoSelect(props: CandidateProperty[], c: CatalogCriteria): { ids: string[]; total: number } {
  const all = sortCandidates(
    candidates(props, c, { requirePhoto: true }),
    c,
    new Map(props.map((p) => [p.id, p.created_at])),
  );
  return { ids: all.slice(0, c.max).map((x) => x.id), total: all.length };
}
