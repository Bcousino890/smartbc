// API para obtener tasas de cambio
// Para MVP usaremos tasas aproximadas; en producción, conectar a una API real
// (p. ej. mindicador.cl para la UF).
//
// Semántica: RATES[from][to] = cuántas unidades de `to` vale 1 unidad de
// `from` (monto_destino = monto_origen * rate). La tabla anterior tenía los
// pares CLP↔UF invertidos: convertir CLP→UF multiplicaba por 34500 y daba
// cifras absurdas.

const UF_IN_CLP = 39000; // Aproximado: 1 UF ≈ 39.000 CLP

const RATES: Record<string, Record<string, number>> = {
  CLP: {
    UF: 1 / UF_IN_CLP,
    EUR: 0.00098, // 1 EUR ≈ 1.020 CLP
    USD: 0.00105, // 1 USD ≈ 950 CLP
  },
  UF: {
    CLP: UF_IN_CLP,
    EUR: 38.2,
    USD: 41,
  },
  EUR: {
    CLP: 1020,
    UF: 1020 / UF_IN_CLP,
    USD: 1.1,
  },
  USD: {
    CLP: 950,
    UF: 950 / UF_IN_CLP,
    EUR: 0.91,
  },
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "CLP";
  const to = searchParams.get("to") || "UF";

  try {
    if (from === to) {
      return Response.json({ rate: 1, from, to });
    }

    const rate = RATES[from]?.[to];

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
