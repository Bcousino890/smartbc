import "server-only";

// Valores de las monedas (CLP por unidad) que usa el selector EUR·CLP·USD
// del portal para reconvertir precios. mindicador.cl es una API pública
// chilena, gratuita y sin necesidad de API key.
export type ExchangeRates = {
  usd: number;
  eur: number;
  uf: number;
};

// Se usan solo si la API no responde — evita que el sitio se rompa por un
// corte del servicio externo. Se actualizan de vez en cuando a mano.
const FALLBACK_RATES: ExchangeRates = {
  usd: 950,
  eur: 1030,
  uf: 38000,
};

export async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    const res = await fetch("https://mindicador.cl/api", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return FALLBACK_RATES;
    const data = (await res.json()) as {
      dolar?: { valor?: number };
      euro?: { valor?: number };
      uf?: { valor?: number };
    };
    return {
      usd: data.dolar?.valor ?? FALLBACK_RATES.usd,
      eur: data.euro?.valor ?? FALLBACK_RATES.eur,
      uf: data.uf?.valor ?? FALLBACK_RATES.uf,
    };
  } catch {
    return FALLBACK_RATES;
  }
}
