// API para obtener tasas de cambio
// Para MVP usaremos tasas aproximadas; en producción, conectar a una API real
// (p. ej. mindicador.cl para la UF).
//
// Semántica: RATES[from][to] = cuántas unidades de `to` vale 1 unidad de
// `from` (monto_destino = monto_origen * rate). La tabla anterior tenía los
// pares CLP↔UF invertidos: convertir CLP→UF multiplicaba por 34500 y daba
// cifras absurdas.

const UF_FALLBACK_CLP = 39000; // Solo si mindicador.cl no responde

// Valor de la UF de hoy (mindicador.cl); se reutiliza una hora.
let ufCache: { value: number; at: number } | null = null;

async function getUfInClp(): Promise<number> {
  if (ufCache && Date.now() - ufCache.at < 3_600_000) return ufCache.value;
  try {
    const res = await fetch("https://mindicador.cl/api/uf", { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const value = Number(data?.serie?.[0]?.valor);
      if (Number.isFinite(value) && value > 1000) {
        ufCache = { value, at: Date.now() };
        return value;
      }
    }
  } catch {
    // cae al último valor conocido o al aproximado
  }
  return ufCache?.value ?? UF_FALLBACK_CLP;
}

function buildRates(ufInClp: number): Record<string, Record<string, number>> {
  return {
    CLP: {
      UF: 1 / ufInClp,
      EUR: 0.00098, // 1 EUR ≈ 1.020 CLP
      USD: 0.00105, // 1 USD ≈ 950 CLP
    },
    UF: {
      CLP: ufInClp,
      EUR: (ufInClp / 1020),
      USD: (ufInClp / 950),
    },
    EUR: {
      CLP: 1020,
      UF: 1020 / ufInClp,
      USD: 1.1,
    },
    USD: {
      CLP: 950,
      UF: 950 / ufInClp,
      EUR: 0.91,
    },
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "CLP";
  const to = searchParams.get("to") || "UF";

  try {
    if (from === to) {
      return Response.json({ rate: 1, from, to });
    }

    const rate = buildRates(await getUfInClp())[from]?.[to];

    if (rate === undefined) {
      return Response.json(
        { error: `Exchange rate from ${from} to ${to} not found` },
        { status: 400 }
      );
    }

    return Response.json({ rate, from, to });
  } catch (error) {
    console.error("Error fetching exchange rate:", error);
    return Response.json(
      { error: "Failed to fetch exchange rate" },
      { status: 500 }
    );
  }
}
