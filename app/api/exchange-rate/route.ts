// API para obtener tasas de cambio
// Para MVP usaremos tasas aproximadas; en producción, conectar a una API real

const RATES: Record<string, Record<string, number>> = {
  CLP: {
    UF: 34500, // Aproximado: 1 UF = 34500 CLP
    EUR: 0.00102, // Aproximado
    USD: 0.00105, // Aproximado
  },
  UF: {
    CLP: 0.0000290, // 1 CLP = 0.000029 UF
    EUR: 0.000003,
    USD: 0.0000305,
  },
  EUR: {
    CLP: 980,
    UF: 0.028,
    USD: 1.1,
  },
  USD: {
    CLP: 950,
    UF: 0.0275,
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
