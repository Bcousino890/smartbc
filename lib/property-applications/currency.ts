// Monedas que el sistema sabe reconocer y convertir. Además de EUR/USD/CLP
// cubre las principales monedas latinoamericanas: un candidato puede aportar
// nóminas o certificados de ingresos de cualquier país de origen, no solo
// del país de la solicitud (ES) o Chile (CL).
export type SupportedCurrency =
  | "EUR"
  | "USD"
  | "CLP"
  | "ARS"
  | "BOB"
  | "BRL"
  | "COP"
  | "CRC"
  | "DOP"
  | "GTQ"
  | "HNL"
  | "MXN"
  | "NIO"
  | "PAB"
  | "PEN"
  | "PYG"
  | "UYU"
  | "VES";

const CURRENCY_LIST: SupportedCurrency[] = [
  "EUR", "USD", "CLP", "ARS", "BOB", "BRL", "COP", "CRC", "DOP",
  "GTQ", "HNL", "MXN", "NIO", "PAB", "PEN", "PYG", "UYU", "VES",
];

const CURRENCY_LOCALE: Record<SupportedCurrency, string> = {
  EUR: "es-ES", USD: "en-US", CLP: "es-CL", ARS: "es-AR", BOB: "es-BO",
  BRL: "pt-BR", COP: "es-CO", CRC: "es-CR", DOP: "es-DO", GTQ: "es-GT",
  HNL: "es-HN", MXN: "es-MX", NIO: "es-NI", PAB: "es-PA", PEN: "es-PE",
  PYG: "es-PY", UYU: "es-UY", VES: "es-VE",
};

// Fallback si la API externa no responde: solo para las monedas que se ven
// con más frecuencia (mejor una conversión aproximada con esta tasa fija
// que bloquear el score). Para el resto, sin API no hay tasa fiable —
// mejor marcarlo para revisión manual que arriesgar un número inventado
// (p.ej. ARS tiene una inflación tan alta que una tasa vieja sería
// directamente engañosa).
const FALLBACK_UNITS_PER_EUR: Partial<Record<SupportedCurrency, number>> = {
  CLP: 1050,
  USD: 1.09,
  BRL: 5.9,
  MXN: 19.5,
};

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hora
let ratesCache: { unitsPerEur: Record<string, number>; fetched_at: number } | null = null;

// Una sola llamada trae la tasa de TODAS las monedas contra EUR (a
// diferencia de la Frankfurter API usada antes, que ni siquiera cubre CLP).
async function getRatesPerEur(): Promise<Record<string, number>> {
  if (ratesCache && Date.now() - ratesCache.fetched_at < CACHE_TTL_MS) {
    return ratesCache.unitsPerEur;
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/EUR", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error("API unavailable");
    const json = await res.json();
    if (json?.result !== "success" || !json?.rates) throw new Error("Respuesta inválida");
    ratesCache = { unitsPerEur: json.rates as Record<string, number>, fetched_at: Date.now() };
    return ratesCache.unitsPerEur;
  } catch {
    return FALLBACK_UNITS_PER_EUR as Record<string, number>;
  }
}

// Punto de entrada seguro para validar en runtime una moneda que vino de la
// IA (texto libre). Antes solo se comprobaba `=== "CLP"` y CUALQUIER OTRA
// moneda (incluida "USD", que el propio prompt de ai-analysis.ts permitía
// devolver) se usaba tal cual como si ya fuera EUR — un ingreso en dólares
// se sumaba al score sin convertir. Ahora una moneda no reconocida se deja
// fuera del cálculo en vez de asumir que es EUR.
export function isSupportedCurrency(value: string | null | undefined): value is SupportedCurrency {
  return !!value && (CURRENCY_LIST as string[]).includes(value);
}

// Convierte cualquier moneda soportada a EUR. Devuelve null si no hay tasa
// fiable disponible (API caída y sin fallback para esa moneda): quien llama
// debe tratarlo como "no convertible automáticamente", nunca asumir 1:1.
export async function convertToEUR(amount: number, currency: SupportedCurrency): Promise<number | null> {
  if (currency === "EUR") return Math.round(amount);
  const rates = await getRatesPerEur();
  const unitsPerEur = rates[currency];
  if (!unitsPerEur) return null;
  return Math.round(amount / unitsPerEur);
}

export async function convertFromEUR(amountEUR: number, currency: SupportedCurrency): Promise<number | null> {
  if (currency === "EUR") return Math.round(amountEUR);
  const rates = await getRatesPerEur();
  const unitsPerEur = rates[currency];
  if (!unitsPerEur) return null;
  return Math.round(amountEUR * unitsPerEur);
}

export function formatMoney(amount: number, currency: SupportedCurrency): string {
  const locale = CURRENCY_LOCALE[currency] ?? "es-ES";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString("es-ES")} ${currency}`;
  }
}

export function formatCLP(amount: number): string {
  return formatMoney(amount, "CLP");
}

export function formatEUR(amount: number): string {
  return formatMoney(amount, "EUR");
}

export function formatUSD(amount: number): string {
  return formatMoney(amount, "USD");
}

// Texto listo para mostrar al equipo/propietario: importe original y su
// equivalente en EUR con la tasa usada, o un aviso claro si no se pudo
// convertir (nunca un número inventado).
export async function buildCurrencyContext(
  amount: number,
  currency: SupportedCurrency
): Promise<string> {
  if (currency === "EUR") return formatEUR(amount);
  const eur = await convertToEUR(amount, currency);
  if (eur === null) {
    return `${formatMoney(amount, currency)} — no se pudo obtener la tasa de cambio a EUR automáticamente; conviértelo manualmente antes de decidir.`;
  }
  const rates = await getRatesPerEur();
  const unitsPerEur = rates[currency];
  const rateLabel = unitsPerEur
    ? unitsPerEur.toLocaleString("es-ES", { maximumFractionDigits: unitsPerEur >= 100 ? 0 : 2 })
    : "—";
  return `${formatMoney(amount, currency)} ≈ ${formatEUR(eur)} (1 EUR ≈ ${rateLabel} ${currency})`;
}
