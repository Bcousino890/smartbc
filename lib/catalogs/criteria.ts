import { catalogBarrios, catalogDistricts, catalogFold } from "./zones";

// ============================================================================
// Criterios de un catálogo (BCP-01 ampliación X5, D21, P2/P4/P5). Puro.
// Mismas reglas que catalog_criteria_normalize() en SQL (0195): lo que
// normaliza esta función es exactamente lo que guarda la base de datos.
//
//   operation  sale | rent | any          (any: sin rango de precio)
//   zones      [{kind: district|barrio|free, name}]  (como mucho 30)
//   price_min / price_max  enteros ≥ 0, opcionales; € en venta y €/mes en
//              alquiler; mínimo ≤ máximo; solo con operación concreta
//   sort       price_asc (por defecto) | price_desc | newest
//   max        1–24, 12 por defecto (solo modo automático)
// ============================================================================

export type CatalogOperation = "sale" | "rent" | "any";
export type CatalogSort = "price_asc" | "price_desc" | "newest";
export type ZoneKind = "district" | "barrio" | "free";

export interface ZoneCriterion {
  kind: ZoneKind;
  name: string;
}

export interface CatalogCriteria {
  operation: CatalogOperation;
  zones: ZoneCriterion[];
  price_min: number | null;
  price_max: number | null;
  sort: CatalogSort;
  max: number;
}

export const AUTO_MAX_DEFAULT = 12;
export const AUTO_MAX_MIN = 1;
export const AUTO_MAX_MAX = 24;
export const ZONES_MAX = 30;
export const PRICE_LIMIT = 1_000_000_000;

export const DEFAULT_CRITERIA: CatalogCriteria = {
  operation: "any",
  zones: [],
  price_min: null,
  price_max: null,
  sort: "price_asc",
  max: AUTO_MAX_DEFAULT,
};

const OPS = new Set(["sale", "rent", "any"]);
const SORTS = new Set(["price_asc", "price_desc", "newest"]);

/** K5: un importe escrito es un entero sin separadores («5000») o con el
 *  punto de miles bien agrupado («5.000», «1.200.000»). Nada más: «5.5»,
 *  «5,000», «5 000», «5.000 €» o «12.0» no son válidos, porque no se adivina
 *  (antes «5.5» se leía como 55). */
const PRICE_PLAIN = /^\d+$/;
const PRICE_GROUPED = /^[1-9]\d{0,2}(\.\d{3})+$/;

function priceOrNull(v: unknown): number | null | "bad" {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 && v <= PRICE_LIMIT ? v : "bad";
  if (typeof v !== "string") return "bad";
  const t = v.trim();
  if (t === "") return null;
  if (!PRICE_PLAIN.test(t) && !PRICE_GROUPED.test(t)) return "bad";
  const n = Number(t.replace(/\./g, ""));
  return Number.isSafeInteger(n) && n <= PRICE_LIMIT ? n : "bad";
}

/** Máximo de viviendas: número entero o texto solo de dígitos («12»). */
function maxOrBad(v: unknown): number | "bad" {
  if (v === null || v === undefined) return AUTO_MAX_DEFAULT;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= AUTO_MAX_MIN && n <= AUTO_MAX_MAX ? n : "bad";
}

/** Valida y normaliza. Cualquier error → invalid_criteria (como en SQL). */
export function normalizeCriteria(input: unknown): { ok: true; criteria: CatalogCriteria } | { ok: false; error: "invalid_criteria" } {
  const bad = { ok: false as const, error: "invalid_criteria" as const };
  if (input === null || input === undefined) return { ok: true, criteria: { ...DEFAULT_CRITERIA, zones: [] } };
  if (typeof input !== "object" || Array.isArray(input)) return bad;
  const o = input as Record<string, unknown>;
  const operation = (o.operation ?? "any") as string;
  if (!OPS.has(operation)) return bad;
  const sort = (o.sort ?? "price_asc") as string;
  if (!SORTS.has(sort)) return bad;
  const max = maxOrBad(o.max);
  if (max === "bad") return bad;
  const pmin = priceOrNull(o.price_min);
  const pmax = priceOrNull(o.price_max);
  if (pmin === "bad" || pmax === "bad") return bad;
  if ((pmin !== null || pmax !== null) && operation === "any") return bad;
  if (pmin !== null && pmax !== null && pmin > pmax) return bad;

  const rawZones = o.zones ?? [];
  if (!Array.isArray(rawZones) || rawZones.length > ZONES_MAX) return bad;
  const districts = new Set(catalogDistricts());
  const barrios = new Set(catalogDistricts().flatMap((d) => catalogBarrios(d)));
  const zones: ZoneCriterion[] = [];
  const seen = new Set<string>();
  for (const z of rawZones) {
    if (!z || typeof z !== "object") return bad;
    const kind = (z as Record<string, unknown>).kind;
    const nameRaw = (z as Record<string, unknown>).name;
    if (typeof nameRaw !== "string") return bad;
    const name = nameRaw.trim();
    if (name.length < 2 || name.length > 80) return bad;
    if (kind === "district" && !districts.has(name)) return bad;
    if (kind === "barrio" && !barrios.has(name)) return bad;
    if (kind !== "district" && kind !== "barrio" && kind !== "free") return bad;
    const k = `${kind}:${catalogFold(name)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    zones.push({ kind, name });
  }
  return {
    ok: true,
    criteria: {
      operation: operation as CatalogOperation,
      zones,
      price_min: pmin,
      price_max: pmax,
      sort: sort as CatalogSort,
      max,
    },
  };
}

const EUR = new Intl.NumberFormat("es-ES", { useGrouping: "always", maximumFractionDigits: 0 } as Intl.NumberFormatOptions);

/** «Salamanca · Justicia · Venta · 900.000–1.500.000 €» para la HOME y la gestión. */
export function criteriaSummary(c: CatalogCriteria): string {
  const parts: string[] = [];
  if (c.zones.length) parts.push(c.zones.map((z) => z.name).join(" · "));
  if (c.operation === "sale") parts.push("Venta");
  if (c.operation === "rent") parts.push("Alquiler");
  const unit = c.operation === "rent" ? " €/mes" : " €";
  if (c.price_min !== null && c.price_max !== null) parts.push(`${EUR.format(c.price_min)}–${EUR.format(c.price_max)}${unit}`);
  else if (c.price_max !== null) parts.push(`hasta ${EUR.format(c.price_max)}${unit}`);
  else if (c.price_min !== null) parts.push(`desde ${EUR.format(c.price_min)}${unit}`);
  return parts.join(" · ");
}
