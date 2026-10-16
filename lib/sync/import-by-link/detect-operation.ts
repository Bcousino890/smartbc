// ============================================================================
// Operación (alquiler / venta) de un anuncio importado por enlace. Puro: se
// prueba en scripts/test-import-operation.mts.
//
// Antes se juntaba título + descripción + precio en un solo texto y se miraba
// «alquiler» PRIMERO: un piso en venta cuya descripción decía «ideal para
// alquiler» o «rentabilidad por alquiler» se guardaba como alquiler (siete
// pisos de Idealista, con «Piso en venta en…» de título y 995.000 €/mes). El
// título y la meta del anuncio son la señal fuerte; la descripción es solo
// el último recurso.
// ============================================================================

export type Operation = "rent" | "sale";

const RENT = /\balquile[rt]\b|\balquilo\b|\barrendam|€\s*\/\s*mes|\beur\s*\/\s*mes/i;
const SALE = /\ben venta\b|\bventa\b|\bcompra\b|\bvende\b|\bse vende\b/i;

function inText(text: string): Operation | null {
  const rent = RENT.test(text);
  const sale = SALE.test(text);
  if (rent && !sale) return "rent";
  if (sale && !rent) return "sale";
  return null; // ni una cosa ni otra, o las dos: no es una señal
}

/** Ningún alquiler de vivienda cuesta cien mil euros al mes: es una venta mal marcada. */
export const MAX_PLAUSIBLE_RENT = 100_000;

export function detectOperation(input: {
  title?: string | null;
  ogTitle?: string | null;
  description?: string | null;
  ogDesc?: string | null;
  priceText?: string | null;
  sourceUrl?: string | null;
  price?: number | null;
}): Operation | null {
  const strong = [input.title, input.ogTitle].filter(Boolean).join(" ").toLowerCase();
  const price = (input.priceText ?? "").toLowerCase();
  const weak = [input.description, input.ogDesc].filter(Boolean).join(" ").toLowerCase();
  const url = input.sourceUrl ?? "";

  // Orden de fiabilidad: título/meta → «€/mes» del precio → URL → descripción.
  let op =
    inText(strong) ??
    (RENT.test(price) ? "rent" : null) ??
    (/\/alquiler-/i.test(url) ? "rent" : /\/venta-/i.test(url) ? "sale" : null) ??
    inText(weak);

  if (op === "rent" && input.price != null && input.price >= MAX_PLAUSIBLE_RENT) op = "sale";
  return op;
}
