import { catalogDictionary, formatGrouped, seasonOf, type CatalogLanguage } from "./i18n";

// ============================================================================
// Formato de los datos que enseñan los catálogos (BCP-01). Puro: se prueba en
// scripts/test-catalogs.mts. Lo desconocido se dice como desconocido: nunca se
// pinta un precio 0 ni se inventa una cifra.
// PR4 (idiomas): cada función admite el idioma del lector; sin él, español,
// con EXACTAMENTE los textos de siempre (el gestor y el PDF siguen en «es»).
// ============================================================================

/** «Otoño 2026». Diciembre cuenta como invierno del año siguiente. */
export function editionLabel(date: Date, lang: CatalogLanguage = "es"): string {
  const { season, year } = seasonOf(date);
  return `${catalogDictionary(lang).seasons[season]} ${year}`;
}

/** «nº 03». Número de orden del catálogo entre los del dueño (1 = el primero). */
export function catalogNumberLabel(n: number | null | undefined): string | null {
  if (!n || n < 1 || !Number.isFinite(n)) return null;
  return `nº ${String(Math.floor(n)).padStart(2, "0")}`;
}

const CURRENCY_SYMBOL: Record<string, string> = { eur: "€", usd: "US$", clp: "CLP", uf: "UF" };

/** «4.800 €», «1.450.000 €», «UF 5.000». En otro idioma, la agrupación de
 *  miles de su locale (dígitos latinos) y el símbolo donde lo pone ese
 *  idioma («€1,450,000» en inglés). */
export function formatMoney(amount: number, currency?: string | null, lang: CatalogLanguage = "es"): string {
  const cur = (currency ?? "eur").toLowerCase();
  const sym = CURRENCY_SYMBOL[cur] ?? cur.toUpperCase();
  // es-ES no agrupa las cifras de 4 dígitos («4800»); los portales y el resto
  // del CRM escriben «4.800», así que se fuerza siempre el punto de miles.
  const n = formatGrouped(amount, lang);
  return cur === "eur" ? catalogDictionary(lang).priceEur(n) : `${sym} ${n}`;
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
export function priceLabel(p: PriceInput, lang: CatalogLanguage = "es"): string {
  const d = catalogDictionary(lang);
  const ops = new Set((p.operations && p.operations.length ? p.operations : [p.operation]).filter(Boolean) as string[]);
  const base = num(p.price);
  const rent = num(p.rentPrice);
  const parts: string[] = [];
  if (ops.has("sale") && ops.has("rent")) {
    if (base) parts.push(`${d.sale} ${formatMoney(base, p.currency, lang)}`);
    if (rent) parts.push(`${d.rent} ${d.perMonth(formatMoney(rent, p.currency, lang))}`);
  } else if (ops.has("rent")) {
    // K2/P-ALQ (D-QA16): una vivienda SOLO de alquiler muestra su `price`, el
    // mismo importe con el que la selecciona SQL; nunca el `rent_price`.
    const r = p.operation === "rent" ? base : rent;
    if (r) parts.push(d.perMonth(formatMoney(r, p.currency, lang)));
  } else if (base) {
    parts.push(formatMoney(base, p.currency, lang));
  }
  return parts.length ? parts.join(" · ") : d.priceNoData;
}

export function operationLabel(op: string | null | undefined, ops?: string[] | null, lang: CatalogLanguage = "es"): string {
  const d = catalogDictionary(lang);
  const set = new Set((ops && ops.length ? ops : [op]).filter(Boolean) as string[]);
  if (set.has("sale") && set.has("rent")) return d.saleAndRent;
  if (set.has("rent")) return d.rent;
  if (set.has("sale")) return d.sale;
  return d.operationNoData;
}

/** Planta sin ordinal (decisión de la especificación: «Planta 7», «Planta baja»). El dato de origen
 *  (lib/floor.ts: número; 0 = bajo; −1 = sótano) no se modifica. */
export function floorLabel(floor: number | null | undefined, isAtico = false, lang: CatalogLanguage = "es"): string {
  const d = catalogDictionary(lang);
  if (isAtico) return d.penthouse;
  if (floor === null || floor === undefined || !Number.isFinite(floor)) return d.floorNoData;
  if (floor === 0) return d.groundFloor;
  if (floor < 0) return d.basement;
  return d.floorN(floor);
}

/** Forma breve de la planta para los datos clave del lector: «7», «baja»,
 *  «Sótano», «Ático»; null sin dato (antes el lector la derivaba de
 *  floorLabel quitando «Planta »). */
export function floorShortLabel(floor: number | null | undefined, isAtico = false, lang: CatalogLanguage = "es"): string | null {
  const d = catalogDictionary(lang);
  if (isAtico) return d.penthouse;
  if (floor === null || floor === undefined || !Number.isFinite(floor)) return null;
  if (floor === 0) return d.groundFloorShort;
  if (floor < 0) return d.basement;
  return d.floorShortN(floor);
}
