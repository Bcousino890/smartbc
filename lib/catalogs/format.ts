// ============================================================================
// Formato de los datos que enseñan los catálogos (BCP-01). Puro: se prueba en
// scripts/test-catalogs.mts. Lo desconocido se dice como desconocido: nunca se
// pinta un precio 0 ni se inventa una cifra.
// ============================================================================

const SEASONS = ["Invierno", "Invierno", "Primavera", "Primavera", "Primavera", "Verano", "Verano", "Verano", "Otoño", "Otoño", "Otoño", "Invierno"];

/** «Otoño 2026». Diciembre cuenta como invierno del año siguiente. */
export function editionLabel(date: Date): string {
  const m = date.getMonth();
  const year = m === 11 ? date.getFullYear() + 1 : date.getFullYear();
  return `${SEASONS[m]} ${year}`;
}

/** «nº 03». Número de orden del catálogo entre los del dueño (1 = el primero). */
export function catalogNumberLabel(n: number | null | undefined): string | null {
  if (!n || n < 1 || !Number.isFinite(n)) return null;
  return `nº ${String(Math.floor(n)).padStart(2, "0")}`;
}

const CURRENCY_SYMBOL: Record<string, string> = { eur: "€", usd: "US$", clp: "CLP", uf: "UF" };

/** «4.800 €», «1.450.000 €», «UF 5.000». */
export function formatMoney(amount: number, currency?: string | null): string {
  const cur = (currency ?? "eur").toLowerCase();
  const sym = CURRENCY_SYMBOL[cur] ?? cur.toUpperCase();
  // es-ES no agrupa las cifras de 4 dígitos («4800»); los portales y el resto
  // del CRM escriben «4.800», así que se fuerza siempre el punto de miles.
  const n = new Intl.NumberFormat("es-ES", { useGrouping: "always", maximumFractionDigits: 0 } as Intl.NumberFormatOptions).format(Math.round(amount));
  return cur === "eur" ? `${n} €` : `${sym} ${n}`;
}

export interface PriceInput {
  operation: string | null | undefined;          // 'sale' | 'rent'
  operations?: string[] | null;                  // dual (0085): ['sale','rent']
  price: number | string | null | undefined;     // venta, o alquiler si operation='rent'
  rentPrice?: number | string | null;            // alquiler en las duales
  currency?: string | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Texto del precio: «1.450.000 €», «4.800 €/mes», las dos si es dual, o
 *  «Precio · sin dato» si no hay un importe positivo. Sin contexto de
 *  catálogo (el contextual está en operation-price.ts → priceDisplay). */
export function priceLabel(p: PriceInput): string {
  const ops = new Set((p.operations && p.operations.length ? p.operations : [p.operation]).filter(Boolean) as string[]);
  const base = num(p.price);
  const rent = num(p.rentPrice);
  const parts: string[] = [];
  if (ops.has("sale") && ops.has("rent")) {
    if (base) parts.push(`Venta ${formatMoney(base, p.currency)}`);
    if (rent) parts.push(`Alquiler ${formatMoney(rent, p.currency)}/mes`);
  } else if (ops.has("rent")) {
    // K2/P-ALQ (D-QA16): una vivienda SOLO de alquiler muestra su `price`, el
    // mismo importe con el que la selecciona SQL; nunca el `rent_price`.
    const r = p.operation === "rent" ? base : rent;
    if (r) parts.push(`${formatMoney(r, p.currency)}/mes`);
  } else if (base) {
    parts.push(formatMoney(base, p.currency));
  }
  return parts.length ? parts.join(" · ") : "Precio · sin dato";
}

export function operationLabel(op: string | null | undefined, ops?: string[] | null): string {
  const set = new Set((ops && ops.length ? ops : [op]).filter(Boolean) as string[]);
  if (set.has("sale") && set.has("rent")) return "Venta y alquiler";
  if (set.has("rent")) return "Alquiler";
  if (set.has("sale")) return "Venta";
  return "Operación · sin dato";
}

/** Planta sin ordinal (Karla dibuja «ª» casi como «a»). El dato de origen
 *  (lib/floor.ts: número; 0 = bajo; −1 = sótano) no se modifica. */
export function floorLabel(floor: number | null | undefined, isAtico = false): string {
  if (isAtico) return "Ático";
  if (floor === null || floor === undefined || !Number.isFinite(floor)) return "Planta · sin dato";
  if (floor === 0) return "Planta baja";
  if (floor < 0) return "Sótano";
  return `Planta ${floor}`;
}
