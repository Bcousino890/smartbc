const FALLBACK_CLP_EUR = 0.00095; // ~1050 CLP = 1 EUR (fallback si falla la API)

let cachedRate: { eur_per_clp: number; fetched_at: number } | null = null;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hora

async function getClpToEurRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.fetched_at < CACHE_TTL_MS) {
    return cachedRate.eur_per_clp;
  }
  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=CLP&to=EUR",
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) throw new Error("API unavailable");
    const json = await res.json();
    const rate = json?.rates?.EUR as number;
    if (!rate) throw new Error("No rate found");
    cachedRate = { eur_per_clp: rate, fetched_at: Date.now() };
    return rate;
  } catch {
    return FALLBACK_CLP_EUR;
  }
}

export async function convertCLPtoEUR(amountCLP: number): Promise<number> {
  const rate = await getClpToEurRate();
  return Math.round(amountCLP * rate);
}

export async function convertEURtoCLP(amountEUR: number): Promise<number> {
  const rate = await getClpToEurRate();
  return Math.round(amountEUR / rate);
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatEUR(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export async function buildCurrencyContext(
  amount: number,
  currency: "CLP" | "EUR"
): Promise<string> {
  if (currency === "CLP") {
    const eur = await convertCLPtoEUR(amount);
    const rate = await getClpToEurRate();
    return `${formatCLP(amount)} ≈ ${formatEUR(eur)} (1 EUR = ${Math.round(1 / rate).toLocaleString("es-CL")} CLP)`;
  } else {
    const clp = await convertEURtoCLP(amount);
    const rate = await getClpToEurRate();
    return `${formatEUR(amount)} ≈ ${formatCLP(clp)} (1 EUR = ${Math.round(1 / rate).toLocaleString("es-CL")} CLP)`;
  }
}
