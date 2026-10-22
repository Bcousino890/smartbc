import { formatMoney, operationLabel, priceLabel } from "./format";
import { catalogDictionary, type CatalogLanguage } from "./i18n";

// ============================================================================
// Operación e importe de una vivienda en un catálogo (BCP-01 K1/K2; D-QA14 y
// D-QA16). Puro. UNA sola regla para el filtro y el orden de la referencia TS
// (selection.ts), la explicación (explain.ts) y las etiquetas del gestor y del
// lector, igual que la SQL de producción (catalog_candidates, 0195, y
// catalog_select, 0196):
//   · encaja: venta → operation='sale'; alquiler → operation='rent' o 'rent'
//     en operations (las duales, 0085); «venta y alquiler» → todas.
//   · importe: en alquiler, `price` si operation='rent' y `rent_price` si es
//     una dual; en lo demás (venta, «venta y alquiler» o una inclusión de otra
//     operación), `price`. Positivo o nada (como nullif(greatest(…, 0), 0)).
//   · P-ALQ (D-QA16): una vivienda SOLO de alquiler usa su `price`, nunca su
//     `rent_price`. Si falta el precio principal o hay otro importe, el gestor
//     lo avisa con la cifra (rentDataWarning); la ficha no se toca.
// ============================================================================

export type CatalogOperation = "sale" | "rent" | "any";

export interface OperationPriceInput {
  operation: string | null | undefined;
  operations?: string[] | null;
  price: number | string | null | undefined;
  rent_price?: number | string | null;
  currency?: string | null;
}

export interface PriceDisplay {
  /** «Alquiler», «Venta», «Venta y alquiler»… */
  operation: string;
  /** «6.000 €/mes», «2.100.000 €» o «Precio · sin dato». */
  price: string;
  /** Solo gestión: la otra operación de una dual («También en venta: …»). */
  also: string | null;
  /** false = inclusión de otra operación: se enseña con lo suyo real. */
  contextual: boolean;
}

export const NO_PRICE = "Precio · sin dato";

/** Importe positivo o null (0, negativo, vacío o no numérico = sin importe). */
export function positiveAmount(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Dual según 0085: operación principal venta y alquiler en `operations`. */
function isProperDual(p: OperationPriceInput): boolean {
  return p.operation === "sale" && (p.operations ?? []).includes("rent");
}

/** ¿La vivienda tiene la operación del catálogo? Misma regla que 0195. */
export function fitsOperation(p: Pick<OperationPriceInput, "operation" | "operations">, op: CatalogOperation): boolean {
  if (op === "sale") return p.operation === "sale";
  if (op === "rent") return p.operation === "rent" || (p.operations ?? []).includes("rent");
  return true;
}

/** Importe con el que se filtra y se ordena (= `eff` de 0195/0196). */
export function operationPrice(p: OperationPriceInput, op: CatalogOperation): number | null {
  if (op === "rent" && p.operation !== "rent" && fitsOperation(p, op)) return positiveAmount(p.rent_price);
  return positiveAmount(p.price);
}

function monthly(n: number, currency?: string | null, lang: CatalogLanguage = "es"): string {
  return catalogDictionary(lang).perMonth(formatMoney(n, currency, lang));
}

/** Aviso interno (solo gestión) de una vivienda SOLO de alquiler con un
 *  importe secundario: sin precio principal, o con dos importes distintos. */
export function rentDataWarning(p: OperationPriceInput): string | null {
  if (p.operation !== "rent" || (p.operations ?? []).includes("sale")) return null;
  const main = positiveAmount(p.price);
  const second = positiveAmount(p.rent_price);
  if (second === null) return null;
  if (main === null) {
    return `La ficha no tiene precio principal: el campo secundario dice ${monthly(second, p.currency)}, pero no se usa. Corrige el precio en la ficha.`;
  }
  if (main !== second) {
    return `Dos importes de alquiler en la ficha: se usa el precio (${monthly(main, p.currency)}); el campo secundario dice ${monthly(second, p.currency)}. Revisa la ficha.`;
  }
  return null;
}

/** Etiquetas de una vivienda en la GESTIÓN de un catálogo de operación `op`:
 *  las mismas que verá el lector, más la otra operación de una dual y el
 *  aviso de importes de alquiler (P-ALQ). Nada de esto llega al lector. */
export function managerPriceFields(
  p: OperationPriceInput,
  op: CatalogOperation,
): { operation: string; price: string; priceAlso: string | null; priceWarning: string | null } {
  const d = priceDisplay(p, op);
  return { operation: d.operation, price: d.price, priceAlso: d.also, priceWarning: rentDataWarning(p) };
}

/** Operación y precio de una vivienda en un catálogo de operación `op`
 *  (DS-1/DS-2): en venta o alquiler, la del catálogo con su importe; una
 *  inclusión de otra operación, con su operación y su precio reales; en
 *  «venta y alquiler», como siempre. Nunca se inventa un importe. `lang`
 *  (PR4) traduce la operación y el formato del precio; «también en…» es
 *  solo del gestor y sigue en español. */
export function priceDisplay(p: OperationPriceInput, op: CatalogOperation, lang: CatalogLanguage = "es"): PriceDisplay {
  const d = catalogDictionary(lang);
  const real = {
    operation: operationLabel(p.operation, p.operations, lang),
    price: priceLabel({ operation: p.operation, operations: p.operations, price: p.price, rentPrice: p.rent_price, currency: p.currency }, lang),
  };
  if (op === "any") return { ...real, also: null, contextual: true };
  if (!fitsOperation(p, op)) return { ...real, also: null, contextual: false };
  const amount = operationPrice(p, op);
  const price = amount === null ? d.priceNoData : op === "rent" ? monthly(amount, p.currency, lang) : formatMoney(amount, p.currency, lang);
  let also: string | null = null;
  if (isProperDual(p)) {
    if (op === "rent") {
      const sale = positiveAmount(p.price);
      also = sale === null ? "También en venta · precio sin dato" : `También en venta: ${formatMoney(sale, p.currency)}`;
    } else {
      const rent = positiveAmount(p.rent_price);
      also = rent === null ? "También en alquiler · precio sin dato" : `También en alquiler: ${monthly(rent, p.currency)}`;
    }
  }
  return { operation: op === "rent" ? d.rent : d.sale, price, also, contextual: true };
}
