import "server-only";

// Fallback de matching lead ↔ propiedad cuando el hilo no trae referencia
// (bc386) ni código de anuncio (idealista.com lo omite muy seguido). Usa lo
// único que sí llega siempre: la dirección/zona y el precio que Idealista
// muestra en el propio inbox (ej. "Calle del General Pardiñas, Lista, Madrid"
// + "1.500 €/mes").
//
// Importante: el match exige que coincida la CALLE (primer segmento antes de
// la coma), no solo la zona. Dos calles distintas del mismo barrio comparten
// casi todos los tokens de zona ("Chueca-Justicia", "Madrid"...) y por eso no
// alcanza con solapar contra la dirección completa — si solo exigiéramos eso,
// "Calle de Gravina, Chueca-Justicia" empataría con "Calle de Hortaleza,
// Chueca-Justicia" con precios parecidos, un falso positivo real que se vio
// al probar esto contra datos reales.

const STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "en",
  "a",
  "y",
  "madrid",
  "calle",
  "avenida",
  "paseo",
  "plaza",
  "glorieta",
  "ronda",
  "travesia",
  "urbanizacion",
]);

function tokenize(input: string | null | undefined): string[] {
  if (!input) return [];
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((tok) => tok && !STOPWORDS.has(tok) && !/^\d+$/.test(tok));
}

/** Primer segmento antes de la primera coma: es donde vive el nombre de calle. */
function streetTokens(addressLike: string | null | undefined): string[] {
  if (!addressLike) return [];
  return tokenize(addressLike.split(",")[0]);
}

export function normalizeAddressText(input: string | null | undefined): string[] {
  return tokenize(input);
}

export function parsePriceToNumber(input: string | null | undefined): number | null {
  if (!input) return null;
  // "1.500 €/mes" / "2.450.000 €" -> 1500 / 2450000
  const digits = input.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type AddressMatchCandidate = {
  id: string;
  /** properties.address (puede venir vacío si nunca se cargó la dirección exacta) */
  street: string | null;
  /** properties.zone — solo se usa como desempate/boost, nunca solo */
  zone: string | null;
  price: number | null;
};

/**
 * Empareja el título del lead ("Calle X, Zona, Ciudad") contra las
 * propiedades propias exigiendo que TODOS los tokens de calle del lead
 * aparezcan en la calle de la candidata, y que el precio esté dentro de
 * tolerancia. La zona solo suma como desempate entre candidatas empatadas en
 * calle — nunca alcanza por sí sola para matchear.
 */
export function matchPropertyByAddress(
  leadTitle: string | null,
  leadPrice: string | null,
  candidates: AddressMatchCandidate[],
): string | null {
  const leadStreet = streetTokens(leadTitle);
  if (leadStreet.length < 1) return null; // sin nombre de calle reconocible, no arriesgar
  const leadZone = new Set(tokenize(leadTitle));
  const leadPriceNum = parsePriceToNumber(leadPrice);

  let best: { id: string; score: number } | null = null;

  for (const c of candidates) {
    const candStreet = streetTokens(c.street);
    if (candStreet.length === 0) continue; // sin dirección cargada, no hay con qué comparar

    // Todos los tokens de calle del lead tienen que estar en la calle candidata.
    const allStreetTokensMatch = leadStreet.every((t) => candStreet.includes(t));
    if (!allStreetTokensMatch) continue;

    let priceOk = true;
    if (leadPriceNum != null && c.price != null) {
      const diff = Math.abs(leadPriceNum - c.price) / c.price;
      priceOk = diff <= 0.08; // 8% de tolerancia (redondeos, cambios de precio)
    }
    if (!priceOk) continue;

    const candZone = new Set(tokenize(c.zone));
    let zoneOverlap = 0;
    for (const t of leadZone) if (candZone.has(t)) zoneOverlap++;

    const score = candStreet.length * 10 + zoneOverlap;
    if (!best || score > best.score) best = { id: c.id, score };
  }

  return best?.id ?? null;
}
